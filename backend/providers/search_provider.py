# providers/search_provider.py — Unified Search Provider Interface
# ═══════════════════════════════════════════════════════════════════
# Zero-Cost, Multi-Provider Search Abstraction
#
# Priority Order (zero-cost first):
# 1. LOCAL: In-memory full-text search (zero cost, no dependencies)
# 2. LOCAL: Meilisearch (self-hosted, zero cost, MIT license)
# 3. LOCAL: Typesense (self-hosted, zero cost, GPL-3)
# 4. FREEMIUM: Meilisearch Cloud (free tier: 100K docs)
# 5. PAID: Algolia / Elasticsearch Cloud (pay-per-use)
#
# Every provider implements the same interface. The system
# auto-selects the best available provider and cascades on failure.
#
# 2060 Standard: Zero-Cost Infrastructure, No Vendor Lock-In
# ═══════════════════════════════════════════════════════════════════

import os
import re
import logging
import time
import math
from abc import ABC, abstractmethod
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional, Set
import threading

from providers import (
    ProviderTier, ProviderStatus, ProviderCategory,
    register_provider, record_provider_usage, record_provider_error,
    update_provider_status, get_best_provider,
)

logger = logging.getLogger("infinity-os.providers.search")


# ── Data Classes ──────────────────────────────────────────────────

@dataclass
class SearchDocument:
    """A document to be indexed."""
    id: str
    content: Dict[str, Any] = field(default_factory=dict)
    index: str = "default"


@dataclass
class SearchHit:
    """A single search result."""
    id: str
    score: float = 0.0
    content: Dict[str, Any] = field(default_factory=dict)
    highlights: Dict[str, str] = field(default_factory=dict)


@dataclass
class SearchResult:
    """Result of a search query."""
    hits: List[SearchHit] = field(default_factory=list)
    total: int = 0
    query: str = ""
    took_ms: float = 0.0
    provider: str = ""


@dataclass
class IndexStats:
    """Statistics for a search index."""
    name: str = ""
    document_count: int = 0
    field_count: int = 0
    size_bytes: int = 0
    provider: str = ""


# ── Abstract Base Provider ────────────────────────────────────────

class BaseSearchProvider(ABC):
    """Abstract search provider interface."""

    name: str = "base"
    tier: ProviderTier = ProviderTier.LOCAL

    @abstractmethod
    async def index_document(self, index: str, doc_id: str,
                             document: Dict[str, Any]) -> bool:
        """Index a single document. Returns True on success."""
        ...

    @abstractmethod
    async def index_documents(self, index: str,
                              documents: List[Dict[str, Any]]) -> int:
        """Bulk index documents. Returns count of successfully indexed."""
        ...

    @abstractmethod
    async def search(self, index: str, query: str,
                     limit: int = 20, offset: int = 0,
                     filters: Optional[Dict[str, Any]] = None) -> SearchResult:
        """Execute a search query."""
        ...

    @abstractmethod
    async def delete_document(self, index: str, doc_id: str) -> bool:
        """Delete a document by ID."""
        ...

    @abstractmethod
    async def create_index(self, index: str,
                           settings: Optional[Dict[str, Any]] = None) -> bool:
        """Create a search index."""
        ...

    @abstractmethod
    async def delete_index(self, index: str) -> bool:
        """Delete an entire index."""
        ...

    @abstractmethod
    async def get_index_stats(self, index: str) -> IndexStats:
        """Get statistics for an index."""
        ...

    @abstractmethod
    async def is_available(self) -> bool:
        """Check if this provider is currently available."""
        ...


# ── In-Memory Search Provider ────────────────────────────────────

class InMemorySearchProvider(BaseSearchProvider):
    """
    In-memory full-text search provider.
    Tier: LOCAL (zero cost, no external dependencies)
    
    Uses TF-IDF scoring with inverted index for fast lookups.
    Suitable for small-to-medium datasets (< 100K documents).
    """

    name = "in_memory"
    tier = ProviderTier.LOCAL

    def __init__(self):
        self.max_docs_per_index = int(os.getenv("SEARCH_MEMORY_MAX_DOCS", "50000"))
        # index_name -> {doc_id -> document}
        self._documents: Dict[str, Dict[str, Dict[str, Any]]] = {}
        # index_name -> {term -> {doc_id -> [positions]}}
        self._inverted_index: Dict[str, Dict[str, Dict[str, List[int]]]] = {}
        # index_name -> {doc_id -> term_count}
        self._doc_lengths: Dict[str, Dict[str, int]] = {}
        self._lock = threading.Lock()

    @staticmethod
    def _tokenize(text: str) -> List[str]:
        """Tokenize text into lowercase terms."""
        if not isinstance(text, str):
            text = str(text)
        # Remove punctuation, split on whitespace, lowercase
        text = re.sub(r'[^\w\s]', ' ', text.lower())
        return [t for t in text.split() if len(t) > 1]

    def _extract_text(self, document: Dict[str, Any]) -> str:
        """Extract all text content from a document."""
        parts = []
        for key, value in document.items():
            if key == "id":
                continue
            if isinstance(value, str):
                parts.append(value)
            elif isinstance(value, (list, tuple)):
                for item in value:
                    if isinstance(item, str):
                        parts.append(item)
            elif isinstance(value, dict):
                parts.append(self._extract_text(value))
        return " ".join(parts)

    def _build_index_for_doc(self, index: str, doc_id: str,
                             document: Dict[str, Any]):
        """Build inverted index entries for a single document."""
        text = self._extract_text(document)
        tokens = self._tokenize(text)

        if index not in self._inverted_index:
            self._inverted_index[index] = {}
        if index not in self._doc_lengths:
            self._doc_lengths[index] = {}

        self._doc_lengths[index][doc_id] = len(tokens)

        for pos, token in enumerate(tokens):
            if token not in self._inverted_index[index]:
                self._inverted_index[index][token] = {}
            if doc_id not in self._inverted_index[index][token]:
                self._inverted_index[index][token][doc_id] = []
            self._inverted_index[index][token][doc_id].append(pos)

    def _remove_from_index(self, index: str, doc_id: str):
        """Remove a document from the inverted index."""
        if index in self._inverted_index:
            empty_terms = []
            for term, postings in self._inverted_index[index].items():
                if doc_id in postings:
                    del postings[doc_id]
                if not postings:
                    empty_terms.append(term)
            for term in empty_terms:
                del self._inverted_index[index][term]
        if index in self._doc_lengths and doc_id in self._doc_lengths[index]:
            del self._doc_lengths[index][doc_id]

    def _compute_tfidf(self, index: str, query_tokens: List[str],
                       doc_id: str) -> float:
        """Compute TF-IDF score for a document against query tokens."""
        if index not in self._inverted_index:
            return 0.0

        total_docs = len(self._documents.get(index, {}))
        if total_docs == 0:
            return 0.0

        doc_len = self._doc_lengths.get(index, {}).get(doc_id, 1)
        avg_doc_len = sum(self._doc_lengths.get(index, {}).values()) / max(total_docs, 1)

        score = 0.0
        for token in query_tokens:
            postings = self._inverted_index.get(index, {}).get(token, {})
            if doc_id not in postings:
                continue

            tf = len(postings[doc_id])
            df = len(postings)
            idf = math.log((total_docs - df + 0.5) / (df + 0.5) + 1.0)

            # BM25 scoring
            k1 = 1.2
            b = 0.75
            tf_norm = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * doc_len / max(avg_doc_len, 1)))
            score += idf * tf_norm

        return score

    def _generate_highlights(self, document: Dict[str, Any],
                             query_tokens: Set[str]) -> Dict[str, str]:
        """Generate highlighted snippets for matching fields."""
        highlights = {}
        for key, value in document.items():
            if key == "id":
                continue
            if isinstance(value, str):
                tokens = self._tokenize(value)
                if any(t in query_tokens for t in tokens):
                    # Simple highlight: wrap matching terms in <em>
                    highlighted = value
                    for qt in query_tokens:
                        pattern = re.compile(re.escape(qt), re.IGNORECASE)
                        highlighted = pattern.sub(f"<em>{qt}</em>", highlighted)
                    highlights[key] = highlighted[:500]  # Limit snippet length
        return highlights

    async def index_document(self, index: str, doc_id: str,
                             document: Dict[str, Any]) -> bool:
        with self._lock:
            if index not in self._documents:
                self._documents[index] = {}

            # Check capacity
            if (doc_id not in self._documents[index] and
                    len(self._documents[index]) >= self.max_docs_per_index):
                logger.warning(f"Index '{index}' at capacity ({self.max_docs_per_index})")
                return False

            # Remove old index entries if updating
            if doc_id in self._documents[index]:
                self._remove_from_index(index, doc_id)

            document["id"] = doc_id
            self._documents[index][doc_id] = document
            self._build_index_for_doc(index, doc_id, document)

        record_provider_usage(self.name, {"operation": "index", "index": index})
        return True

    async def index_documents(self, index: str,
                              documents: List[Dict[str, Any]]) -> int:
        count = 0
        for doc in documents:
            doc_id = doc.get("id", str(time.time()))
            if await self.index_document(index, doc_id, doc):
                count += 1
        return count

    async def search(self, index: str, query: str,
                     limit: int = 20, offset: int = 0,
                     filters: Optional[Dict[str, Any]] = None) -> SearchResult:
        start = time.monotonic()
        with self._lock:
            if index not in self._documents:
                return SearchResult(
                    query=query, provider=self.name,
                    took_ms=(time.monotonic() - start) * 1000,
                )

            query_tokens = self._tokenize(query)
            query_token_set = set(query_tokens)

            if not query_tokens:
                # Empty query — return all documents
                all_docs = list(self._documents[index].values())
                total = len(all_docs)
                page = all_docs[offset:offset + limit]
                hits = [
                    SearchHit(id=d.get("id", ""), score=1.0, content=d)
                    for d in page
                ]
                return SearchResult(
                    hits=hits, total=total, query=query,
                    provider=self.name,
                    took_ms=(time.monotonic() - start) * 1000,
                )

            # Find candidate documents (any query token appears)
            candidates: Set[str] = set()
            for token in query_tokens:
                postings = self._inverted_index.get(index, {}).get(token, {})
                candidates.update(postings.keys())

            # Apply filters
            if filters:
                filtered = set()
                for doc_id in candidates:
                    doc = self._documents[index].get(doc_id, {})
                    match = True
                    for fk, fv in filters.items():
                        if doc.get(fk) != fv:
                            match = False
                            break
                    if match:
                        filtered.add(doc_id)
                candidates = filtered

            # Score and rank
            scored: List[tuple] = []
            for doc_id in candidates:
                score = self._compute_tfidf(index, query_tokens, doc_id)
                if score > 0:
                    scored.append((doc_id, score))

            scored.sort(key=lambda x: x[1], reverse=True)
            total = len(scored)
            page = scored[offset:offset + limit]

            hits = []
            for doc_id, score in page:
                doc = self._documents[index].get(doc_id, {})
                highlights = self._generate_highlights(doc, query_token_set)
                hits.append(SearchHit(
                    id=doc_id, score=round(score, 4),
                    content=doc, highlights=highlights,
                ))

        took_ms = (time.monotonic() - start) * 1000
        record_provider_usage(self.name, {
            "operation": "search", "index": index,
            "query": query, "results": len(hits),
        })
        return SearchResult(
            hits=hits, total=total, query=query,
            provider=self.name, took_ms=round(took_ms, 2),
        )

    async def delete_document(self, index: str, doc_id: str) -> bool:
        with self._lock:
            if index not in self._documents:
                return False
            if doc_id not in self._documents[index]:
                return False
            self._remove_from_index(index, doc_id)
            del self._documents[index][doc_id]
        record_provider_usage(self.name, {"operation": "delete", "index": index})
        return True

    async def create_index(self, index: str,
                           settings: Optional[Dict[str, Any]] = None) -> bool:
        with self._lock:
            if index not in self._documents:
                self._documents[index] = {}
                self._inverted_index[index] = {}
                self._doc_lengths[index] = {}
        return True

    async def delete_index(self, index: str) -> bool:
        with self._lock:
            self._documents.pop(index, None)
            self._inverted_index.pop(index, None)
            self._doc_lengths.pop(index, None)
        return True

    async def get_index_stats(self, index: str) -> IndexStats:
        with self._lock:
            docs = self._documents.get(index, {})
            terms = self._inverted_index.get(index, {})
            return IndexStats(
                name=index,
                document_count=len(docs),
                field_count=len(terms),
                size_bytes=0,  # In-memory, approximate
                provider=self.name,
            )

    async def is_available(self) -> bool:
        return True  # Always available


# ── Meilisearch Provider ──────────────────────────────────────────

class MeilisearchProvider(BaseSearchProvider):
    """
    Meilisearch search provider.
    Tier: LOCAL (self-hosted, MIT license) or FREEMIUM (cloud free tier)
    
    Fast, typo-tolerant search engine. Self-hosted = zero cost.
    Cloud free tier: 100K documents, 10K searches/month.
    """

    name = "meilisearch"
    tier = ProviderTier.LOCAL

    def __init__(self):
        self.host = os.getenv("MEILISEARCH_HOST", "http://localhost:7700")
        self.api_key = os.getenv("MEILISEARCH_API_KEY", "")

        # Determine tier
        if "cloud.meilisearch" in self.host.lower():
            self.tier = ProviderTier.FREEMIUM
        else:
            self.tier = ProviderTier.LOCAL

    async def _request(self, method: str, path: str,
                       json_data: Any = None) -> Optional[Any]:
        """Make HTTP request to Meilisearch API."""
        import httpx
        headers = {}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        headers["Content-Type"] = "application/json"

        try:
            async with httpx.AsyncClient(
                base_url=self.host, timeout=30.0
            ) as client:
                response = await client.request(
                    method, path, json=json_data, headers=headers
                )
                if response.status_code in (200, 201, 202):
                    return response.json()
                logger.warning(
                    f"Meilisearch {method} {path}: {response.status_code}"
                )
                return None
        except Exception as e:
            logger.warning(f"Meilisearch request failed: {e}")
            return None

    async def index_document(self, index: str, doc_id: str,
                             document: Dict[str, Any]) -> bool:
        document["id"] = doc_id
        result = await self._request("POST", f"/indexes/{index}/documents", [document])
        if result:
            record_provider_usage(self.name, {"operation": "index", "index": index})
            return True
        record_provider_error(self.name, "index_document failed")
        return False

    async def index_documents(self, index: str,
                              documents: List[Dict[str, Any]]) -> int:
        result = await self._request("POST", f"/indexes/{index}/documents", documents)
        if result:
            record_provider_usage(self.name, {
                "operation": "bulk_index", "count": len(documents),
            })
            return len(documents)
        record_provider_error(self.name, "index_documents failed")
        return 0

    async def search(self, index: str, query: str,
                     limit: int = 20, offset: int = 0,
                     filters: Optional[Dict[str, Any]] = None) -> SearchResult:
        start = time.monotonic()
        body: Dict[str, Any] = {
            "q": query,
            "limit": limit,
            "offset": offset,
        }
        if filters:
            # Convert dict filters to Meilisearch filter syntax
            filter_parts = []
            for k, v in filters.items():
                if isinstance(v, str):
                    filter_parts.append(f'{k} = "{v}"')
                else:
                    filter_parts.append(f"{k} = {v}")
            if filter_parts:
                body["filter"] = " AND ".join(filter_parts)

        result = await self._request("POST", f"/indexes/{index}/search", body)
        took_ms = (time.monotonic() - start) * 1000

        if not result:
            return SearchResult(query=query, provider=self.name, took_ms=took_ms)

        hits = []
        for hit in result.get("hits", []):
            formatted = hit.get("_formatted", {})
            highlights = {}
            for k, v in formatted.items():
                if k != "id" and "<em>" in str(v):
                    highlights[k] = v

            hits.append(SearchHit(
                id=hit.get("id", ""),
                score=hit.get("_rankingScore", 0.0),
                content={k: v for k, v in hit.items()
                         if not k.startswith("_")},
                highlights=highlights,
            ))

        record_provider_usage(self.name, {
            "operation": "search", "index": index, "results": len(hits),
        })
        return SearchResult(
            hits=hits,
            total=result.get("estimatedTotalHits", len(hits)),
            query=query, provider=self.name,
            took_ms=result.get("processingTimeMs", took_ms),
        )

    async def delete_document(self, index: str, doc_id: str) -> bool:
        result = await self._request("DELETE", f"/indexes/{index}/documents/{doc_id}")
        return result is not None

    async def create_index(self, index: str,
                           settings: Optional[Dict[str, Any]] = None) -> bool:
        body: Dict[str, Any] = {"uid": index, "primaryKey": "id"}
        result = await self._request("POST", "/indexes", body)
        if result and settings:
            await self._request("PATCH", f"/indexes/{index}/settings", settings)
        return result is not None

    async def delete_index(self, index: str) -> bool:
        result = await self._request("DELETE", f"/indexes/{index}")
        return result is not None

    async def get_index_stats(self, index: str) -> IndexStats:
        result = await self._request("GET", f"/indexes/{index}/stats")
        if result:
            return IndexStats(
                name=index,
                document_count=result.get("numberOfDocuments", 0),
                field_count=len(result.get("fieldDistribution", {})),
                size_bytes=0,
                provider=self.name,
            )
        return IndexStats(name=index, provider=self.name)

    async def is_available(self) -> bool:
        result = await self._request("GET", "/health")
        return result is not None and result.get("status") == "available"


# ── Typesense Provider ────────────────────────────────────────────

class TypesenseProvider(BaseSearchProvider):
    """
    Typesense search provider.
    Tier: LOCAL (self-hosted, GPL-3) or FREEMIUM (cloud free tier)
    
    Fast, typo-tolerant search engine with built-in curation.
    Self-hosted = zero cost. Cloud free tier available.
    """

    name = "typesense"
    tier = ProviderTier.LOCAL

    def __init__(self):
        self.host = os.getenv("TYPESENSE_HOST", "http://localhost:8108")
        self.api_key = os.getenv("TYPESENSE_API_KEY", "")

        if "cloud.typesense" in self.host.lower():
            self.tier = ProviderTier.FREEMIUM
        else:
            self.tier = ProviderTier.LOCAL

    async def _request(self, method: str, path: str,
                       json_data: Any = None) -> Optional[Any]:
        """Make HTTP request to Typesense API."""
        import httpx
        headers = {"X-TYPESENSE-API-KEY": self.api_key} if self.api_key else {}
        headers["Content-Type"] = "application/json"

        try:
            async with httpx.AsyncClient(
                base_url=self.host, timeout=30.0
            ) as client:
                response = await client.request(
                    method, path, json=json_data, headers=headers
                )
                if response.status_code in (200, 201):
                    return response.json()
                return None
        except Exception as e:
            logger.warning(f"Typesense request failed: {e}")
            return None

    async def index_document(self, index: str, doc_id: str,
                             document: Dict[str, Any]) -> bool:
        document["id"] = doc_id
        result = await self._request(
            "POST", f"/collections/{index}/documents", document
        )
        if result:
            record_provider_usage(self.name, {"operation": "index", "index": index})
            return True
        # Try upsert on conflict
        result = await self._request(
            "POST", f"/collections/{index}/documents?action=upsert", document
        )
        return result is not None

    async def index_documents(self, index: str,
                              documents: List[Dict[str, Any]]) -> int:
        # Typesense uses JSONL for bulk import
        import httpx
        headers = {"X-TYPESENSE-API-KEY": self.api_key} if self.api_key else {}
        headers["Content-Type"] = "text/plain"

        import json
        jsonl = "\n".join(json.dumps(doc) for doc in documents)

        try:
            async with httpx.AsyncClient(
                base_url=self.host, timeout=60.0
            ) as client:
                response = await client.post(
                    f"/collections/{index}/documents/import?action=upsert",
                    content=jsonl, headers=headers,
                )
                if response.status_code == 200:
                    lines = response.text.strip().split("\n")
                    success = sum(
                        1 for line in lines
                        if json.loads(line).get("success", False)
                    )
                    record_provider_usage(self.name, {
                        "operation": "bulk_index", "count": success,
                    })
                    return success
        except Exception as e:
            record_provider_error(self.name, str(e))
        return 0

    async def search(self, index: str, query: str,
                     limit: int = 20, offset: int = 0,
                     filters: Optional[Dict[str, Any]] = None) -> SearchResult:
        start = time.monotonic()
        params = {
            "q": query,
            "query_by": "*",  # Search all fields
            "per_page": limit,
            "page": (offset // limit) + 1,
        }
        if filters:
            filter_parts = []
            for k, v in filters.items():
                filter_parts.append(f"{k}:={v}")
            params["filter_by"] = " && ".join(filter_parts)

        # Build query string
        qs = "&".join(f"{k}={v}" for k, v in params.items())
        result = await self._request("GET", f"/collections/{index}/documents/search?{qs}")
        took_ms = (time.monotonic() - start) * 1000

        if not result:
            return SearchResult(query=query, provider=self.name, took_ms=took_ms)

        hits = []
        for hit in result.get("hits", []):
            doc = hit.get("document", {})
            highlights_raw = hit.get("highlights", [])
            highlights = {}
            for h in highlights_raw:
                field_name = h.get("field", "")
                snippet = h.get("snippet", "")
                if field_name and snippet:
                    highlights[field_name] = snippet

            hits.append(SearchHit(
                id=doc.get("id", ""),
                score=hit.get("text_match", 0),
                content=doc,
                highlights=highlights,
            ))

        record_provider_usage(self.name, {
            "operation": "search", "index": index, "results": len(hits),
        })
        return SearchResult(
            hits=hits,
            total=result.get("found", len(hits)),
            query=query, provider=self.name,
            took_ms=result.get("search_time_ms", took_ms),
        )

    async def delete_document(self, index: str, doc_id: str) -> bool:
        result = await self._request(
            "DELETE", f"/collections/{index}/documents/{doc_id}"
        )
        return result is not None

    async def create_index(self, index: str,
                           settings: Optional[Dict[str, Any]] = None) -> bool:
        schema = settings or {
            "name": index,
            "fields": [{"name": ".*", "type": "auto"}],
            "enable_nested_fields": True,
        }
        if "name" not in schema:
            schema["name"] = index
        result = await self._request("POST", "/collections", schema)
        return result is not None

    async def delete_index(self, index: str) -> bool:
        result = await self._request("DELETE", f"/collections/{index}")
        return result is not None

    async def get_index_stats(self, index: str) -> IndexStats:
        result = await self._request("GET", f"/collections/{index}")
        if result:
            return IndexStats(
                name=index,
                document_count=result.get("num_documents", 0),
                field_count=len(result.get("fields", [])),
                size_bytes=0,
                provider=self.name,
            )
        return IndexStats(name=index, provider=self.name)

    async def is_available(self) -> bool:
        if not self.api_key:
            return False
        result = await self._request("GET", "/health")
        return result is not None and result.get("ok", False)


# ── Unified Search Gateway ────────────────────────────────────────

# Provider instances (lazy-initialized)
_providers: Dict[str, BaseSearchProvider] = {}


def _init_providers():
    """Initialize and register all search providers."""
    global _providers
    if _providers:
        return

    # 1. In-memory — always available, zero cost
    memory = InMemorySearchProvider()
    _providers["in_memory"] = memory
    register_provider(
        name="search_in_memory",
        category=ProviderCategory.SEARCH,
        tier=ProviderTier.LOCAL,
        config={"max_docs_per_index": memory.max_docs_per_index},
    )

    # 2. Meilisearch — available if configured
    if os.getenv("MEILISEARCH_HOST") or os.getenv("MEILISEARCH_API_KEY"):
        meili = MeilisearchProvider()
        _providers["meilisearch"] = meili
        register_provider(
            name="search_meilisearch",
            category=ProviderCategory.SEARCH,
            tier=meili.tier,
            config={"host": meili.host},
        )

    # 3. Typesense — available if configured
    if os.getenv("TYPESENSE_HOST") or os.getenv("TYPESENSE_API_KEY"):
        typesense = TypesenseProvider()
        _providers["typesense"] = typesense
        register_provider(
            name="search_typesense",
            category=ProviderCategory.SEARCH,
            tier=typesense.tier,
            config={"host": typesense.host},
        )

    logger.info(f"Search providers initialized: {list(_providers.keys())}")


async def search_query(index: str, query: str,
                       limit: int = 20, offset: int = 0,
                       filters: Optional[Dict[str, Any]] = None,
                       zero_cost_only: bool = True,
                       preferred_provider: Optional[str] = None) -> SearchResult:
    """
    Execute a search query using the best available provider.
    Auto-failover: tries preferred → best available → in-memory.
    """
    _init_providers()

    candidates: List[BaseSearchProvider] = []

    if preferred_provider and preferred_provider in _providers:
        candidates.append(_providers[preferred_provider])

    tier_order = [ProviderTier.LOCAL, ProviderTier.FREE, ProviderTier.FREEMIUM, ProviderTier.PAID]
    for tier in tier_order:
        if zero_cost_only and tier in (ProviderTier.PAID, ProviderTier.ENTERPRISE):
            continue
        for name, provider in _providers.items():
            if provider.tier == tier and provider not in candidates:
                candidates.append(provider)

    for provider in candidates:
        if await provider.is_available():
            result = await provider.search(index, query, limit, offset, filters)
            if result.hits or result.total >= 0:
                return result
            logger.warning(f"Search failed on {provider.name}")

    return SearchResult(query=query, provider="none")


async def search_index_document(index: str, doc_id: str,
                                document: Dict[str, Any],
                                preferred_provider: Optional[str] = None) -> bool:
    """Index a document using the best available provider."""
    _init_providers()

    if preferred_provider and preferred_provider in _providers:
        return await _providers[preferred_provider].index_document(index, doc_id, document)

    # Index in all available providers (write-through for consistency)
    success = False
    for provider in _providers.values():
        if await provider.is_available():
            if await provider.index_document(index, doc_id, document):
                success = True
    return success


async def search_index_documents(index: str,
                                 documents: List[Dict[str, Any]],
                                 preferred_provider: Optional[str] = None) -> int:
    """Bulk index documents using the best available provider."""
    _init_providers()

    if preferred_provider and preferred_provider in _providers:
        return await _providers[preferred_provider].index_documents(index, documents)

    max_indexed = 0
    for provider in _providers.values():
        if await provider.is_available():
            count = await provider.index_documents(index, documents)
            max_indexed = max(max_indexed, count)
    return max_indexed


async def search_delete_document(index: str, doc_id: str) -> bool:
    """Delete a document from all providers."""
    _init_providers()
    success = False
    for provider in _providers.values():
        if await provider.is_available():
            if await provider.delete_document(index, doc_id):
                success = True
    return success


async def search_create_index(index: str,
                              settings: Optional[Dict[str, Any]] = None) -> bool:
    """Create an index in all available providers."""
    _init_providers()
    success = False
    for provider in _providers.values():
        if await provider.is_available():
            if await provider.create_index(index, settings):
                success = True
    return success


async def search_delete_index(index: str) -> bool:
    """Delete an index from all providers."""
    _init_providers()
    success = False
    for provider in _providers.values():
        if await provider.is_available():
            if await provider.delete_index(index):
                success = True
    return success


async def get_available_search_providers() -> List[Dict[str, Any]]:
    """List all registered search providers and their status."""
    _init_providers()
    result = []
    for name, provider in _providers.items():
        available = await provider.is_available()
        result.append({
            "name": name,
            "tier": provider.tier.value,
            "available": available,
            "zero_cost": provider.tier in (ProviderTier.LOCAL, ProviderTier.FREE),
        })
    return result
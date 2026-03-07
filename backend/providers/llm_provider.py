# providers/llm_provider.py — Unified LLM Provider Interface
# ═══════════════════════════════════════════════════════════════
# Zero-Cost, Multi-Provider LLM Abstraction
#
# Priority Order (zero-cost first):
# 1. LOCAL: Ollama (self-hosted, zero cost, full privacy)
# 2. FREE: Groq free tier (generous limits, fast inference)
# 3. FREE: HuggingFace Inference API (free tier)
# 4. FREEMIUM: OpenAI (if key provided, pay-per-use)
# 5. FREEMIUM: Anthropic (if key provided, pay-per-use)
#
# Every provider implements the same interface. The system
# auto-selects the best available provider and cascades on failure.
#
# 2060 Standard: Zero-Cost Infrastructure, No Vendor Lock-In
# ═══════════════════════════════════════════════════════════════

import os
import logging
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional, AsyncIterator

import httpx

from providers import (
    ProviderTier, ProviderStatus, ProviderCategory,
    register_provider, record_provider_usage, record_provider_error,
    update_provider_status, get_best_provider,
)

logger = logging.getLogger("infinity-os.providers.llm")


# ── Data Classes ─────────────────────────────────────────────

@dataclass
class LLMRequest:
    """Unified LLM request format."""
    messages: List[Dict[str, str]]
    model: Optional[str] = None
    temperature: float = 0.7
    max_tokens: int = 2048
    stream: bool = False
    system_prompt: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class LLMResponse:
    """Unified LLM response format."""
    content: str
    model: str
    provider: str
    tier: str
    usage: Dict[str, int] = field(default_factory=dict)
    cost_estimate: float = 0.0
    latency_ms: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)


# ── Abstract Base ────────────────────────────────────────────

class BaseLLMProvider(ABC):
    """Abstract base for all LLM providers."""

    name: str = ""
    tier: ProviderTier = ProviderTier.LOCAL
    models: List[str] = []
    default_model: str = ""

    @abstractmethod
    async def generate(self, request: LLMRequest) -> LLMResponse:
        """Generate a completion."""
        ...

    @abstractmethod
    def is_available(self) -> bool:
        """Check if this provider is configured and reachable."""
        ...

    def get_model(self, requested: Optional[str] = None) -> str:
        """Resolve model name — use requested if valid, else default."""
        if requested and requested in self.models:
            return requested
        return self.default_model


# ── Provider: Ollama (Local, Zero Cost) ──────────────────────

class OllamaProvider(BaseLLMProvider):
    """Self-hosted Ollama — zero cost, full privacy, no vendor lock-in."""

    name = "ollama"
    tier = ProviderTier.LOCAL
    models = [
        "qwen2.5-coder:32b", "qwen2.5:14b", "qwen2.5:7b",
        "llama3.1:8b", "llama3.1:70b", "llama3.2:3b",
        "mistral:7b", "mixtral:8x7b", "codellama:34b",
        "deepseek-coder-v2:16b", "phi-3:14b", "gemma2:9b",
    ]
    default_model = "qwen2.5:7b"

    def __init__(self):
        self.base_url = os.getenv("OLLAMA_URL", os.getenv("LOCAL_LLM_URL", "http://localhost:11434"))
        # Normalise URL — Ollama native API vs OpenAI-compatible
        if self.base_url.endswith("/v1"):
            self.base_url = self.base_url[:-3]

    def is_available(self) -> bool:
        return True  # Always "available" — will fail gracefully if not running

    async def generate(self, request: LLMRequest) -> LLMResponse:
        model = self.get_model(request.model)
        messages = request.messages.copy()
        if request.system_prompt:
            messages.insert(0, {"role": "system", "content": request.system_prompt})

        start = time.perf_counter()
        async with httpx.AsyncClient(timeout=120.0) as client:
            # Use Ollama's OpenAI-compatible endpoint
            resp = await client.post(
                f"{self.base_url}/v1/chat/completions",
                json={
                    "model": model,
                    "messages": messages,
                    "temperature": request.temperature,
                    "max_tokens": request.max_tokens,
                    "stream": False,
                },
            )
            resp.raise_for_status()
            data = resp.json()

        latency = (time.perf_counter() - start) * 1000
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        usage = data.get("usage", {})

        return LLMResponse(
            content=content,
            model=model,
            provider=self.name,
            tier=self.tier.value,
            usage={"prompt_tokens": usage.get("prompt_tokens", 0), "completion_tokens": usage.get("completion_tokens", 0)},
            cost_estimate=0.0,  # Always zero
            latency_ms=round(latency, 2),
        )


# ── Provider: Groq (Free Tier) ──────────────────────────────

class GroqProvider(BaseLLMProvider):
    """Groq — free tier with generous limits, fastest inference."""

    name = "groq"
    tier = ProviderTier.FREE
    models = [
        "llama-3.3-70b-versatile", "llama-3.1-8b-instant",
        "mixtral-8x7b-32768", "gemma2-9b-it",
    ]
    default_model = "llama-3.3-70b-versatile"

    def __init__(self):
        self.api_key = os.getenv("GROQ_API_KEY", "")
        self.base_url = "https://api.groq.com/openai/v1"

    def is_available(self) -> bool:
        return bool(self.api_key)

    async def generate(self, request: LLMRequest) -> LLMResponse:
        model = self.get_model(request.model)
        messages = request.messages.copy()
        if request.system_prompt:
            messages.insert(0, {"role": "system", "content": request.system_prompt})

        start = time.perf_counter()
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": messages,
                    "temperature": request.temperature,
                    "max_tokens": request.max_tokens,
                },
            )
            resp.raise_for_status()
            data = resp.json()

        latency = (time.perf_counter() - start) * 1000
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        usage = data.get("usage", {})

        return LLMResponse(
            content=content,
            model=model,
            provider=self.name,
            tier=self.tier.value,
            usage={"prompt_tokens": usage.get("prompt_tokens", 0), "completion_tokens": usage.get("completion_tokens", 0)},
            cost_estimate=0.0,  # Free tier
            latency_ms=round(latency, 2),
        )


# ── Provider: HuggingFace (Free Tier) ───────────────────────

class HuggingFaceProvider(BaseLLMProvider):
    """HuggingFace Inference API — free tier for open models."""

    name = "huggingface"
    tier = ProviderTier.FREE
    models = [
        "mistralai/Mistral-7B-Instruct-v0.3",
        "meta-llama/Meta-Llama-3.1-8B-Instruct",
        "Qwen/Qwen2.5-7B-Instruct",
        "google/gemma-2-9b-it",
    ]
    default_model = "mistralai/Mistral-7B-Instruct-v0.3"

    def __init__(self):
        self.api_key = os.getenv("HF_API_KEY", "")
        self.base_url = "https://api-inference.huggingface.co/models"

    def is_available(self) -> bool:
        return bool(self.api_key)

    async def generate(self, request: LLMRequest) -> LLMResponse:
        model = self.get_model(request.model)
        # Build prompt from messages
        prompt = ""
        if request.system_prompt:
            prompt += f"[INST] <<SYS>>\n{request.system_prompt}\n<</SYS>>\n\n"
        for msg in request.messages:
            if msg["role"] == "user":
                prompt += f"[INST] {msg['content']} [/INST]\n"
            elif msg["role"] == "assistant":
                prompt += f"{msg['content']}\n"

        start = time.perf_counter()
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{self.base_url}/{model}",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "inputs": prompt,
                    "parameters": {"max_new_tokens": request.max_tokens, "temperature": request.temperature},
                },
            )
            resp.raise_for_status()
            data = resp.json()

        latency = (time.perf_counter() - start) * 1000
        content = data[0].get("generated_text", "") if isinstance(data, list) else str(data)

        return LLMResponse(
            content=content,
            model=model,
            provider=self.name,
            tier=self.tier.value,
            usage={},
            cost_estimate=0.0,  # Free tier
            latency_ms=round(latency, 2),
        )


# ── Provider: OpenAI (Paid, Optional) ───────────────────────

class OpenAIProvider(BaseLLMProvider):
    """OpenAI — paid API, optional. Only used when free options exhausted."""

    name = "openai"
    tier = ProviderTier.PAID
    models = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"]
    default_model = "gpt-4o-mini"

    # Cost per 1M tokens (approximate, 2026 pricing)
    _cost_per_1m = {"gpt-4o": 5.0, "gpt-4o-mini": 0.15, "gpt-4-turbo": 10.0, "gpt-3.5-turbo": 0.5}

    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY", "")
        self.base_url = "https://api.openai.com/v1"

    def is_available(self) -> bool:
        return bool(self.api_key)

    def _estimate_cost(self, model: str, tokens: int) -> float:
        rate = self._cost_per_1m.get(model, 1.0)
        return round((tokens / 1_000_000) * rate, 6)

    async def generate(self, request: LLMRequest) -> LLMResponse:
        model = self.get_model(request.model)
        messages = request.messages.copy()
        if request.system_prompt:
            messages.insert(0, {"role": "system", "content": request.system_prompt})

        start = time.perf_counter()
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": messages,
                    "temperature": request.temperature,
                    "max_tokens": request.max_tokens,
                },
            )
            resp.raise_for_status()
            data = resp.json()

        latency = (time.perf_counter() - start) * 1000
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        usage = data.get("usage", {})
        total_tokens = usage.get("total_tokens", 0)

        return LLMResponse(
            content=content,
            model=model,
            provider=self.name,
            tier=self.tier.value,
            usage={"prompt_tokens": usage.get("prompt_tokens", 0), "completion_tokens": usage.get("completion_tokens", 0)},
            cost_estimate=self._estimate_cost(model, total_tokens),
            latency_ms=round(latency, 2),
        )


# ── Provider: Anthropic (Paid, Optional) ────────────────────

class AnthropicProvider(BaseLLMProvider):
    """Anthropic — paid API, optional. Only used when free options exhausted."""

    name = "anthropic"
    tier = ProviderTier.PAID
    models = ["claude-3-5-sonnet-20241022", "claude-3-haiku-20240307"]
    default_model = "claude-3-5-sonnet-20241022"

    _cost_per_1m = {"claude-3-5-sonnet-20241022": 3.0, "claude-3-haiku-20240307": 0.25}

    def __init__(self):
        self.api_key = os.getenv("ANTHROPIC_API_KEY", "")
        self.base_url = "https://api.anthropic.com/v1"

    def is_available(self) -> bool:
        return bool(self.api_key)

    def _estimate_cost(self, model: str, tokens: int) -> float:
        rate = self._cost_per_1m.get(model, 1.0)
        return round((tokens / 1_000_000) * rate, 6)

    async def generate(self, request: LLMRequest) -> LLMResponse:
        model = self.get_model(request.model)
        messages = [m for m in request.messages if m["role"] != "system"]

        start = time.perf_counter()
        async with httpx.AsyncClient(timeout=60.0) as client:
            body = {
                "model": model,
                "messages": messages,
                "max_tokens": request.max_tokens,
                "temperature": request.temperature,
            }
            if request.system_prompt:
                body["system"] = request.system_prompt

            resp = await client.post(
                f"{self.base_url}/messages",
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()

        latency = (time.perf_counter() - start) * 1000
        content = data.get("content", [{}])[0].get("text", "")
        usage = data.get("usage", {})
        total_tokens = usage.get("input_tokens", 0) + usage.get("output_tokens", 0)

        return LLMResponse(
            content=content,
            model=model,
            provider=self.name,
            tier=self.tier.value,
            usage={"prompt_tokens": usage.get("input_tokens", 0), "completion_tokens": usage.get("output_tokens", 0)},
            cost_estimate=self._estimate_cost(model, total_tokens),
            latency_ms=round(latency, 2),
        )


# ── Unified LLM Gateway ─────────────────────────────────────

# Provider instances (ordered by zero-cost priority)
_PROVIDERS: List[BaseLLMProvider] = [
    OllamaProvider(),
    GroqProvider(),
    HuggingFaceProvider(),
    OpenAIProvider(),
    AnthropicProvider(),
]


def _register_all():
    """Register all LLM providers in the global registry."""
    for p in _PROVIDERS:
        register_provider(
            category=ProviderCategory.LLM.value,
            name=p.name,
            tier=p.tier,
            config={
                "models": p.models,
                "default_model": p.default_model,
                "available": p.is_available(),
            },
        )


# Auto-register on import
_register_all()


async def llm_generate(
    request: LLMRequest,
    preferred_provider: Optional[str] = None,
    zero_cost_only: bool = False,
) -> LLMResponse:
    """Generate LLM completion with automatic provider selection and failover.

    Args:
        request: Unified LLM request
        preferred_provider: Override provider selection
        zero_cost_only: If True, only use local/free providers

    Returns:
        LLMResponse with provider metadata and cost estimate
    """
    # Build provider order
    providers = _PROVIDERS.copy()

    # If preferred provider specified, try it first
    if preferred_provider:
        preferred = [p for p in providers if p.name == preferred_provider]
        others = [p for p in providers if p.name != preferred_provider]
        providers = preferred + others

    # Filter by cost if zero_cost_only
    if zero_cost_only:
        providers = [p for p in providers if p.tier in (ProviderTier.LOCAL, ProviderTier.FREE)]

    errors = []
    for provider in providers:
        if not provider.is_available():
            continue

        try:
            response = await provider.generate(request)
            record_provider_usage(
                ProviderCategory.LLM.value,
                provider.name,
                response.cost_estimate,
            )
            logger.info(
                f"[LLM] {provider.name} ({provider.tier.value}) → "
                f"{response.model} | {response.latency_ms:.0f}ms | "
                f"cost=${response.cost_estimate:.6f}"
            )
            return response

        except Exception as e:
            record_provider_error(ProviderCategory.LLM.value, provider.name)
            errors.append(f"{provider.name}: {str(e)[:100]}")
            logger.warning(f"[LLM] {provider.name} failed: {e}")
            continue

    # All providers failed — return stub response
    logger.error(f"[LLM] All providers failed: {errors}")
    return LLMResponse(
        content="[AI response unavailable — all providers failed. Please check your configuration.]",
        model="stub",
        provider="none",
        tier="none",
        cost_estimate=0.0,
        latency_ms=0.0,
        metadata={"errors": errors, "stub": True},
    )


def get_available_providers() -> List[Dict[str, Any]]:
    """List all LLM providers with their status."""
    return [
        {
            "name": p.name,
            "tier": p.tier.value,
            "available": p.is_available(),
            "models": p.models,
            "default_model": p.default_model,
            "zero_cost": p.tier in (ProviderTier.LOCAL, ProviderTier.FREE),
        }
        for p in _PROVIDERS
    ]
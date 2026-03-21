/**
 * VectorPort — Vector Database / Semantic Search Abstraction
 * ═══════════════════════════════════════════════════════════════
 * Abstracts Cloudflare Vectorize, Pinecone, Weaviate, Qdrant,
 * or any vector store for RAG and semantic search.
 */

export interface VectorMetadata {
  [key: string]: string | number | boolean;
}

export interface VectorRecord {
  id: string;
  values: number[];
  metadata?: VectorMetadata;
  namespace?: string;
}

export interface VectorUpsertResult {
  upsertedCount: number;
  ids: string[];
}

export interface VectorQueryOptions {
  vector: number[];
  topK: number;
  namespace?: string;
  filter?: VectorFilter;
  includeMetadata?: boolean;
  includeValues?: boolean;
  /** Minimum similarity score (0-1) */
  minScore?: number;
}

export interface VectorMatch {
  id: string;
  score: number;
  values?: number[];
  metadata?: VectorMetadata;
}

export interface VectorQueryResult {
  matches: VectorMatch[];
  namespace?: string;
  usage?: {
    readUnits: number;
  };
}

export interface VectorFilter {
  [field: string]:
    | string
    | number
    | boolean
    | { $eq?: string | number | boolean }
    | { $ne?: string | number | boolean }
    | { $gt?: number }
    | { $gte?: number }
    | { $lt?: number }
    | { $lte?: number }
    | { $in?: (string | number)[] };
}

export interface VectorIndexInfo {
  name: string;
  dimension: number;
  metric: 'cosine' | 'euclidean' | 'dot-product';
  totalRecords: number;
  namespaces?: string[];
}

export interface VectorPort {
  readonly provider: string;

  /**
   * Insert or update vectors.
   */
  upsert(vectors: VectorRecord[]): Promise<VectorUpsertResult>;

  /**
   * Query for similar vectors.
   */
  query(options: VectorQueryOptions): Promise<VectorQueryResult>;

  /**
   * Fetch specific vectors by ID.
   */
  fetch(ids: string[], namespace?: string): Promise<VectorRecord[]>;

  /**
   * Delete vectors by ID.
   */
  delete(ids: string[], namespace?: string): Promise<void>;

  /**
   * Delete all vectors in a namespace.
   */
  deleteAll(namespace?: string): Promise<void>;

  /**
   * Get index information.
   */
  describe(): Promise<VectorIndexInfo>;

  /**
   * Check if the vector store is available.
   */
  healthCheck(): Promise<{ healthy: boolean; latencyMs: number; error?: string }>;
}
/**
 * Ports — Barrel Export
 * ═══════════════════════════════════════════════════════════════
 * All port interfaces exported from a single entry point.
 * Workers import from '@trancendos/adapters' to access any port.
 */

// Storage (R2, S3, GCS, Azure Blob)
export type {
  StoragePort,
  StorageObject,
  StorageListOptions,
  StorageListResult,
  StoragePutOptions,
} from './storage';

// AI Completion (Workers AI, OpenAI, Anthropic, Groq)
export type {
  AICompletionPort,
  ChatMessage,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
  EmbeddingOptions,
  EmbeddingResult,
  ToolDefinition,
  ToolCall,
} from './ai-completion';

// Vector Search (Vectorize, Pinecone, Weaviate, Qdrant)
export type {
  VectorPort,
  VectorRecord,
  VectorUpsertResult,
  VectorQueryOptions,
  VectorQueryResult,
  VectorMatch,
  VectorFilter,
  VectorIndexInfo,
  VectorMetadata,
} from './vector';

// Database (D1, PlanetScale, Neon, Turso, SQLite)
export type {
  DatabasePort,
  DatabaseRow,
  DatabaseQueryResult,
  DatabaseBatchResult,
  PreparedStatement,
  MigrationRecord,
} from './database';
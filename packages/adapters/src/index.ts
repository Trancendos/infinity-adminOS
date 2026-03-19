/**
 * @trancendos/adapters — Ports & Adapters Library
 * ═══════════════════════════════════════════════════════════════
 * Hexagonal Architecture for Zero Vendor Lock-in
 *
 * Usage:
 *   import type { StoragePort, AICompletionPort } from '@trancendos/adapters';
 *   import { R2StorageAdapter, WorkersAIAdapter } from '@trancendos/adapters';
 *   import { AdaptiveService } from '@trancendos/adapters';
 *
 *   const storage = new AdaptiveService<StoragePort>([
 *     { adapter: new R2StorageAdapter(env.R2), priority: 1, name: 'r2' },
 *     { adapter: new MemoryStorageAdapter(), priority: 99, name: 'memory' },
 *   ]);
 */

// ─── Ports (Interfaces) ────────────────────────────────────────
export type {
  StoragePort,
  StorageObject,
  StorageListOptions,
  StorageListResult,
  StoragePutOptions,
} from './ports/storage';

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
} from './ports/ai-completion';

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
} from './ports/vector';

export type {
  DatabasePort,
  DatabaseRow,
  DatabaseQueryResult,
  DatabaseBatchResult,
  PreparedStatement,
  MigrationRecord,
} from './ports/database';

// ─── Cloudflare Adapters ────────────────────────────────────────
export { D1DatabaseAdapter } from './adapters/cloudflare/d1-database';
export { R2StorageAdapter } from './adapters/cloudflare/r2-storage';
export { WorkersAIAdapter } from './adapters/cloudflare/workers-ai';
export { VectorizeAdapter } from './adapters/cloudflare/vectorize';

// ─── Fallback Adapters ─────────────────────────────────────────
export { MemoryStorageAdapter } from './adapters/fallback/memory-storage';
export { MemoryDatabaseAdapter } from './adapters/fallback/memory-database';

// ─── Adaptive Service (Auto-Failover) ──────────────────────────
export { AdaptiveService } from './adaptive-service';
export type { AdapterEntry, AdaptiveServiceConfig } from './adaptive-service';
/**
 * Fallback Adapters — Barrel Export
 * ═══════════════════════════════════════════════════════════════
 * In-memory implementations for testing, development,
 * and graceful degradation when cloud services are unavailable.
 */

export { MemoryStorageAdapter } from './memory-storage';
export { MemoryDatabaseAdapter } from './memory-database';
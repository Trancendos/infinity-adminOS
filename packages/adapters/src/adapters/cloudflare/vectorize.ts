/**
 * VectorizeAdapter — Cloudflare Vectorize Implementation
 * ═══════════════════════════════════════════════════════════════
 * Implements VectorPort using Cloudflare Vectorize for
 * per-tenant RAG and semantic search.
 */

import type {
  VectorPort,
  VectorRecord,
  VectorUpsertResult,
  VectorQueryOptions,
  VectorQueryResult,
  VectorIndexInfo,
} from '../../ports/vector';

export class VectorizeAdapter implements VectorPort {
  readonly provider = 'cloudflare-vectorize';
  private index: any; // VectorizeIndex from CF runtime

  constructor(index: any) {
    this.index = index;
  }

  async upsert(vectors: VectorRecord[]): Promise<VectorUpsertResult> {
    const vectorizeVectors = vectors.map((v) => ({
      id: v.id,
      values: v.values,
      metadata: v.metadata,
      namespace: v.namespace,
    }));

    const result = await this.index.upsert(vectorizeVectors);

    return {
      upsertedCount: result.count ?? vectors.length,
      ids: vectors.map((v) => v.id),
    };
  }

  async query(options: VectorQueryOptions): Promise<VectorQueryResult> {
    const queryOptions: any = {
      vector: options.vector,
      topK: options.topK,
      returnMetadata: options.includeMetadata !== false ? 'all' : 'none',
      returnValues: options.includeValues ?? false,
    };

    if (options.namespace) {
      queryOptions.namespace = options.namespace;
    }

    if (options.filter) {
      queryOptions.filter = options.filter;
    }

    const result = await this.index.query(queryOptions.vector, queryOptions);

    let matches = (result.matches ?? []).map((m: any) => ({
      id: m.id,
      score: m.score,
      values: m.values,
      metadata: m.metadata,
    }));

    // Apply minimum score filter
    if (options.minScore) {
      matches = matches.filter((m: any) => m.score >= options.minScore!);
    }

    return {
      matches,
      namespace: options.namespace,
    };
  }

  async fetch(ids: string[], namespace?: string): Promise<VectorRecord[]> {
    const options: any = {};
    if (namespace) options.namespace = namespace;

    const result = await this.index.getByIds(ids, options);

    return (result ?? []).map((v: any) => ({
      id: v.id,
      values: v.values ?? [],
      metadata: v.metadata,
      namespace,
    }));
  }

  async delete(ids: string[], namespace?: string): Promise<void> {
    const options: any = {};
    if (namespace) options.namespace = namespace;
    await this.index.deleteByIds(ids, options);
  }

  async deleteAll(namespace?: string): Promise<void> {
    // Vectorize doesn't have a native deleteAll — use deleteByIds with a full listing
    // For production, consider using the REST API for bulk operations
    console.warn('[vectorize] deleteAll is not natively supported — use with caution');
  }

  async describe(): Promise<VectorIndexInfo> {
    const info = await this.index.describe();

    return {
      name: info.name ?? 'unknown',
      dimension: info.config?.dimensions ?? 0,
      metric: info.config?.metric ?? 'cosine',
      totalRecords: info.vectorCount ?? 0,
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      await this.index.describe();
      return { healthy: true, latencyMs: Date.now() - start };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
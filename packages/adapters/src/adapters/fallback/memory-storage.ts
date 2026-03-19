/**
 * MemoryStorageAdapter — In-Memory Storage Implementation
 * ═══════════════════════════════════════════════════════════════
 * Implements StoragePort using an in-memory Map.
 * Used for testing, development, and as a fallback when
 * no cloud storage is available.
 */

import type {
  StoragePort,
  StorageObject,
  StorageListOptions,
  StorageListResult,
  StoragePutOptions,
} from '../../ports/storage';

interface StoredObject {
  value: ArrayBuffer;
  metadata: StorageObject;
}

export class MemoryStorageAdapter implements StoragePort {
  readonly provider = 'memory';
  private store = new Map<string, StoredObject>();

  async put(
    key: string,
    value: ReadableStream | ArrayBuffer | string,
    options?: StoragePutOptions,
  ): Promise<StorageObject> {
    let buffer: ArrayBuffer;

    if (typeof value === 'string') {
      const encoded = new TextEncoder().encode(value);
      buffer = encoded.slice().buffer;
    } else if (value instanceof ArrayBuffer) {
      buffer = value;
    } else {
      // ReadableStream
      const reader = value.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        chunks.push(chunk);
      }
      const total = chunks.reduce((acc, c) => acc + c.length, 0);
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      buffer = new ArrayBuffer(merged.byteLength);
      new Uint8Array(buffer).set(merged);
    }

    const metadata: StorageObject = {
      key,
      size: buffer.byteLength,
      etag: `"${Date.now().toString(36)}"`,
      contentType: options?.contentType ?? 'application/octet-stream',
      lastModified: new Date(),
      metadata: options?.metadata,
    };

    this.store.set(key, { value: buffer, metadata });
    return metadata;
  }

  async get(key: string): Promise<{ body: ReadableStream; metadata: StorageObject } | null> {
    const stored = this.store.get(key);
    if (!stored) return null;

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(stored.value));
        controller.close();
      },
    });

    return { body: stream, metadata: { ...stored.metadata } };
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async deleteMany(keys: string[]): Promise<void> {
    for (const key of keys) {
      this.store.delete(key);
    }
  }

  async head(key: string): Promise<StorageObject | null> {
    const stored = this.store.get(key);
    return stored ? { ...stored.metadata } : null;
  }

  async list(options?: StorageListOptions): Promise<StorageListResult> {
    let keys = Array.from(this.store.keys());

    if (options?.prefix) {
      keys = keys.filter((k) => k.startsWith(options.prefix!));
    }

    keys.sort();

    // Handle cursor (simple index-based)
    let startIndex = 0;
    if (options?.cursor) {
      startIndex = parseInt(options.cursor, 10) || 0;
    }

    const limit = options?.limit ?? 1000;
    const sliced = keys.slice(startIndex, startIndex + limit);
    const truncated = startIndex + limit < keys.length;

    const objects = sliced.map((key) => ({ ...this.store.get(key)!.metadata }));

    // Handle delimiter for prefix simulation
    let delimitedPrefixes: string[] | undefined;
    if (options?.delimiter) {
      const prefixLen = (options.prefix ?? '').length;
      const prefixes = new Set<string>();
      for (const key of keys) {
        const rest = key.slice(prefixLen);
        const delimIndex = rest.indexOf(options.delimiter);
        if (delimIndex >= 0) {
          prefixes.add(key.slice(0, prefixLen + delimIndex + 1));
        }
      }
      delimitedPrefixes = Array.from(prefixes);
    }

    return {
      objects,
      truncated,
      cursor: truncated ? (startIndex + limit).toString() : undefined,
      delimitedPrefixes,
    };
  }

  /** Get the total number of stored objects (for testing) */
  get size(): number {
    return this.store.size;
  }

  /** Clear all stored objects (for testing) */
  clear(): void {
    this.store.clear();
  }
}
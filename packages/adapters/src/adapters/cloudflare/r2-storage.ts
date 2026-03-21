/**
 * R2StorageAdapter — Cloudflare R2 Implementation
 * ═══════════════════════════════════════════════════════════════
 * Implements StoragePort using Cloudflare R2 (S3-compatible).
 */

import type {
  StoragePort,
  StorageObject,
  StorageListOptions,
  StorageListResult,
  StoragePutOptions,
} from '../../ports/storage';

export class R2StorageAdapter implements StoragePort {
  readonly provider = 'cloudflare-r2';
  private bucket: any; // R2Bucket from CF runtime

  constructor(bucket: any) {
    this.bucket = bucket;
  }

  async put(
    key: string,
    value: ReadableStream | ArrayBuffer | string,
    options?: StoragePutOptions,
  ): Promise<StorageObject> {
    const r2Options: any = {};
    if (options?.contentType) r2Options.httpMetadata = { contentType: options.contentType };
    if (options?.metadata) r2Options.customMetadata = options.metadata;
    if (options?.cacheControl) {
      r2Options.httpMetadata = {
        ...r2Options.httpMetadata,
        cacheControl: options.cacheControl,
      };
    }

    const result = await this.bucket.put(key, value, r2Options);

    return {
      key: result.key,
      size: result.size,
      etag: result.etag,
      contentType: result.httpMetadata?.contentType,
      lastModified: result.uploaded ? new Date(result.uploaded) : undefined,
      metadata: result.customMetadata,
    };
  }

  async get(key: string): Promise<{ body: ReadableStream; metadata: StorageObject } | null> {
    const object = await this.bucket.get(key);
    if (!object) return null;

    return {
      body: object.body,
      metadata: {
        key: object.key,
        size: object.size,
        etag: object.etag,
        contentType: object.httpMetadata?.contentType,
        lastModified: object.uploaded ? new Date(object.uploaded) : undefined,
        metadata: object.customMetadata,
      },
    };
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  async deleteMany(keys: string[]): Promise<void> {
    // R2 supports batch delete up to 1000 keys
    const chunks = [];
    for (let i = 0; i < keys.length; i += 1000) {
      chunks.push(keys.slice(i, i + 1000));
    }
    await Promise.all(chunks.map((chunk) => this.bucket.delete(chunk)));
  }

  async head(key: string): Promise<StorageObject | null> {
    const object = await this.bucket.head(key);
    if (!object) return null;

    return {
      key: object.key,
      size: object.size,
      etag: object.etag,
      contentType: object.httpMetadata?.contentType,
      lastModified: object.uploaded ? new Date(object.uploaded) : undefined,
      metadata: object.customMetadata,
    };
  }

  async list(options?: StorageListOptions): Promise<StorageListResult> {
    const r2Options: any = {};
    if (options?.prefix) r2Options.prefix = options.prefix;
    if (options?.delimiter) r2Options.delimiter = options.delimiter;
    if (options?.cursor) r2Options.cursor = options.cursor;
    if (options?.limit) r2Options.limit = options.limit;

    const result = await this.bucket.list(r2Options);

    return {
      objects: (result.objects ?? []).map((obj: any) => ({
        key: obj.key,
        size: obj.size,
        etag: obj.etag,
        contentType: obj.httpMetadata?.contentType,
        lastModified: obj.uploaded ? new Date(obj.uploaded) : undefined,
        metadata: obj.customMetadata,
      })),
      truncated: result.truncated,
      cursor: result.cursor,
      delimitedPrefixes: result.delimitedPrefixes,
    };
  }
}
/**
 * StoragePort — Object/Blob Storage Abstraction
 * ═══════════════════════════════════════════════════════════════
 * Abstracts R2, S3, GCS, Azure Blob, or local filesystem.
 * All adapters implement this interface for zero vendor lock-in.
 */

export interface StorageObject {
  key: string;
  size: number;
  etag?: string;
  contentType?: string;
  lastModified?: Date;
  metadata?: Record<string, string>;
}

export interface StorageListOptions {
  prefix?: string;
  delimiter?: string;
  cursor?: string;
  limit?: number;
}

export interface StorageListResult {
  objects: StorageObject[];
  truncated: boolean;
  cursor?: string;
  delimitedPrefixes?: string[];
}

export interface StoragePutOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  cacheControl?: string;
  /** Max age in seconds for cache */
  maxAge?: number;
}

export interface StoragePort {
  readonly provider: string;

  /**
   * Store an object.
   */
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | string,
    options?: StoragePutOptions,
  ): Promise<StorageObject>;

  /**
   * Retrieve an object. Returns null if not found.
   */
  get(key: string): Promise<{ body: ReadableStream; metadata: StorageObject } | null>;

  /**
   * Delete an object.
   */
  delete(key: string): Promise<void>;

  /**
   * Delete multiple objects.
   */
  deleteMany(keys: string[]): Promise<void>;

  /**
   * Check if an object exists.
   */
  head(key: string): Promise<StorageObject | null>;

  /**
   * List objects with optional prefix filtering.
   */
  list(options?: StorageListOptions): Promise<StorageListResult>;

  /**
   * Generate a presigned URL for direct upload/download.
   * Not all adapters support this — returns null if unsupported.
   */
  createPresignedUrl?(
    key: string,
    expiresIn: number,
    method: 'GET' | 'PUT',
  ): Promise<string | null>;
}
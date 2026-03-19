/**
 * @trancendos/filesystem — R2-Backed File Storage Worker
 * ======================================================
 * Provides tenant-isolated file storage with CRUD operations,
 * presigned URLs, metadata management, and directory listing.
 * All files are namespaced by tenant ID for complete isolation.
 */

import { Hono } from 'hono';

// ── Types ──────────────────────────────────────────────────────────────────

export interface Env {
  STORAGE: R2Bucket;
  DB: D1Database;
  CACHE: KVNamespace;
  ENVIRONMENT: string;
}

export interface FileMetadata {
  id: string;
  tenant_id: string;
  path: string;
  filename: string;
  content_type: string;
  size: number;
  etag?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
  tags?: Record<string, string>;
  is_public: boolean;
}

export interface FileListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
  delimiter?: string;
}

export interface FileListResult {
  files: FileMetadata[];
  truncated: boolean;
  cursor?: string;
  total_size: number;
}

export interface UploadResult {
  file: FileMetadata;
  url: string;
}

export interface StorageStats {
  total_files: number;
  total_size: number;
  by_type: Record<string, number>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function generateId(): string {
  return `file_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Build tenant-scoped R2 key */
function tenantKey(tenantId: string, path: string): string {
  const cleanPath = path.replace(/^\/+/, '').replace(/\/+$/, '');
  return `tenants/${tenantId}/${cleanPath}`;
}

/** Extract filename from path */
function extractFilename(path: string): string {
  return path.split('/').pop() || path;
}

/** Guess content type from filename */
function guessContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    html: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    json: 'application/json',
    xml: 'application/xml',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    pdf: 'application/pdf',
    zip: 'application/zip',
    gz: 'application/gzip',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    webm: 'video/webm',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
  };
  return types[ext || ''] || 'application/octet-stream';
}

/** Validate tenant ID */
function isValidTenantId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(id);
}

/** Validate file path */
function isValidPath(path: string): boolean {
  if (!path || path.length > 1024) return false;
  if (path.includes('..')) return false;
  if (/[<>"|?*]/.test(path)) return false;
  return true;
}

/** Convert R2Object to FileMetadata */
function r2ToMetadata(obj: R2Object, tenantId: string): FileMetadata {
  const fullKey = obj.key;
  const tenantPrefix = `tenants/${tenantId}/`;
  const path = fullKey.startsWith(tenantPrefix) ? fullKey.slice(tenantPrefix.length) : fullKey;

  return {
    id: obj.httpEtag || generateId(),
    tenant_id: tenantId,
    path,
    filename: extractFilename(path),
    content_type: obj.httpMetadata?.contentType || guessContentType(extractFilename(path)),
    size: obj.size,
    etag: obj.httpEtag,
    created_at: obj.uploaded.toISOString(),
    updated_at: obj.uploaded.toISOString(),
    created_by: obj.customMetadata?.created_by,
    tags: obj.customMetadata ? { ...obj.customMetadata } : undefined,
    is_public: obj.customMetadata?.is_public === 'true',
  };
}

// ── Hono App ───────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>();

// Health check
app.get('/health', (c) =>
  c.json({
    status: 'healthy',
    service: 'filesystem-worker',
    timestamp: new Date().toISOString(),
  }),
);

// ── File Upload ────────────────────────────────────────────────────────────

app.put('/v1/files/:tenantId/*', async (c) => {
  const tenantId = c.req.param('tenantId');
  if (!isValidTenantId(tenantId)) {
    return c.json({ error: 'INVALID_TENANT_ID', message: 'Invalid tenant ID format' }, 400);
  }

  const pathParam = c.req.path.replace(`/v1/files/${tenantId}/`, '');
  if (!isValidPath(pathParam)) {
    return c.json({ error: 'INVALID_PATH', message: 'Invalid file path' }, 400);
  }

  const body = await c.req.arrayBuffer();
  if (!body || body.byteLength === 0) {
    return c.json({ error: 'EMPTY_BODY', message: 'File body is required' }, 400);
  }

  const maxSize = 100 * 1024 * 1024; // 100MB
  if (body.byteLength > maxSize) {
    return c.json({ error: 'FILE_TOO_LARGE', message: `File exceeds ${maxSize} byte limit` }, 413);
  }

  const key = tenantKey(tenantId, pathParam);
  const contentType = c.req.header('content-type') || guessContentType(extractFilename(pathParam));
  const createdBy = c.req.header('x-user-id') || undefined;
  const isPublic = c.req.header('x-public') === 'true';

  const customMetadata: Record<string, string> = {};
  if (createdBy) customMetadata.created_by = createdBy;
  if (isPublic) customMetadata.is_public = 'true';

  const obj = await c.env.STORAGE.put(key, body, {
    httpMetadata: { contentType },
    customMetadata,
  });

  if (!obj) {
    return c.json({ error: 'UPLOAD_FAILED', message: 'Failed to upload file' }, 500);
  }

  const metadata: FileMetadata = {
    id: obj.httpEtag || generateId(),
    tenant_id: tenantId,
    path: pathParam,
    filename: extractFilename(pathParam),
    content_type: contentType,
    size: body.byteLength,
    etag: obj.httpEtag,
    created_at: obj.uploaded.toISOString(),
    updated_at: obj.uploaded.toISOString(),
    created_by: createdBy,
    is_public: isPublic,
  };

  return c.json({ file: metadata }, 201);
});

// ── File Download ──────────────────────────────────────────────────────────

app.get('/v1/files/:tenantId/*', async (c) => {
  const tenantId = c.req.param('tenantId');
  if (!isValidTenantId(tenantId)) {
    return c.json({ error: 'INVALID_TENANT_ID', message: 'Invalid tenant ID format' }, 400);
  }

  const pathParam = c.req.path.replace(`/v1/files/${tenantId}/`, '');
  if (!isValidPath(pathParam)) {
    return c.json({ error: 'INVALID_PATH', message: 'Invalid file path' }, 400);
  }

  const key = tenantKey(tenantId, pathParam);
  const metaOnly = c.req.query('meta') === 'true';

  const obj = metaOnly
    ? await c.env.STORAGE.head(key)
    : await c.env.STORAGE.get(key);

  if (!obj) {
    return c.json({ error: 'NOT_FOUND', message: `File not found: ${pathParam}` }, 404);
  }

  if (metaOnly) {
    return c.json({ file: r2ToMetadata(obj, tenantId) });
  }

  const r2Obj = obj as R2ObjectBody;
  const headers = new Headers();
  headers.set('Content-Type', r2Obj.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Content-Length', String(r2Obj.size));
  if (r2Obj.httpEtag) headers.set('ETag', r2Obj.httpEtag);
  headers.set('Cache-Control', 'public, max-age=3600');

  return new Response(r2Obj.body, { headers });
});

// ── File Delete ────────────────────────────────────────────────────────────

app.delete('/v1/files/:tenantId/*', async (c) => {
  const tenantId = c.req.param('tenantId');
  if (!isValidTenantId(tenantId)) {
    return c.json({ error: 'INVALID_TENANT_ID', message: 'Invalid tenant ID format' }, 400);
  }

  const pathParam = c.req.path.replace(`/v1/files/${tenantId}/`, '');
  if (!isValidPath(pathParam)) {
    return c.json({ error: 'INVALID_PATH', message: 'Invalid file path' }, 400);
  }

  const key = tenantKey(tenantId, pathParam);

  // Check if file exists
  const existing = await c.env.STORAGE.head(key);
  if (!existing) {
    return c.json({ error: 'NOT_FOUND', message: `File not found: ${pathParam}` }, 404);
  }

  await c.env.STORAGE.delete(key);

  return c.json({ deleted: true, path: pathParam });
});

// ── Directory Listing ──────────────────────────────────────────────────────

app.get('/v1/list/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId');
  if (!isValidTenantId(tenantId)) {
    return c.json({ error: 'INVALID_TENANT_ID', message: 'Invalid tenant ID format' }, 400);
  }

  const prefix = c.req.query('prefix') || '';
  const limit = Math.min(parseInt(c.req.query('limit') || '100', 10), 1000);
  const cursor = c.req.query('cursor') || undefined;
  const delimiter = c.req.query('delimiter') || undefined;

  const fullPrefix = tenantKey(tenantId, prefix);

  const listed = await c.env.STORAGE.list({
    prefix: fullPrefix,
    limit,
    cursor,
    delimiter,
  });

  const files = listed.objects.map((obj) => r2ToMetadata(obj, tenantId));
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  const result: FileListResult = {
    files,
    truncated: listed.truncated,
    cursor: listed.truncated ? listed.cursor : undefined,
    total_size: totalSize,
  };

  return c.json(result);
});

// ── Batch Delete ───────────────────────────────────────────────────────────

app.post('/v1/batch-delete/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId');
  if (!isValidTenantId(tenantId)) {
    return c.json({ error: 'INVALID_TENANT_ID', message: 'Invalid tenant ID format' }, 400);
  }

  const body = await c.req.json<{ paths: string[] }>();
  if (!body.paths || !Array.isArray(body.paths) || body.paths.length === 0) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'paths array is required' }, 400);
  }

  if (body.paths.length > 100) {
    return c.json({ error: 'TOO_MANY_FILES', message: 'Maximum 100 files per batch' }, 400);
  }

  const keys = body.paths.map((p) => tenantKey(tenantId, p));
  await c.env.STORAGE.delete(keys);

  return c.json({ deleted: body.paths.length, paths: body.paths });
});

// ── Copy File ──────────────────────────────────────────────────────────────

app.post('/v1/copy/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId');
  if (!isValidTenantId(tenantId)) {
    return c.json({ error: 'INVALID_TENANT_ID', message: 'Invalid tenant ID format' }, 400);
  }

  const body = await c.req.json<{ source: string; destination: string }>();
  if (!body.source || !body.destination) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'source and destination are required' }, 400);
  }

  if (!isValidPath(body.source) || !isValidPath(body.destination)) {
    return c.json({ error: 'INVALID_PATH', message: 'Invalid file path' }, 400);
  }

  const sourceKey = tenantKey(tenantId, body.source);
  const destKey = tenantKey(tenantId, body.destination);

  const sourceObj = await c.env.STORAGE.get(sourceKey);
  if (!sourceObj) {
    return c.json({ error: 'NOT_FOUND', message: `Source file not found: ${body.source}` }, 404);
  }

  const obj = await c.env.STORAGE.put(destKey, sourceObj.body, {
    httpMetadata: sourceObj.httpMetadata,
    customMetadata: sourceObj.customMetadata,
  });

  if (!obj) {
    return c.json({ error: 'COPY_FAILED', message: 'Failed to copy file' }, 500);
  }

  return c.json({
    copied: true,
    source: body.source,
    destination: body.destination,
  });
});

// ── Storage Stats ──────────────────────────────────────────────────────────

app.get('/v1/stats/:tenantId', async (c) => {
  const tenantId = c.req.param('tenantId');
  if (!isValidTenantId(tenantId)) {
    return c.json({ error: 'INVALID_TENANT_ID', message: 'Invalid tenant ID format' }, 400);
  }

  const prefix = tenantKey(tenantId, '');
  let totalFiles = 0;
  let totalSize = 0;
  const byType: Record<string, number> = {};
  let cursor: string | undefined;

  do {
    const listed = await c.env.STORAGE.list({ prefix, limit: 1000, cursor });
    for (const obj of listed.objects) {
      totalFiles++;
      totalSize += obj.size;
      const ext = extractFilename(obj.key).split('.').pop()?.toLowerCase() || 'other';
      byType[ext] = (byType[ext] || 0) + 1;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  const stats: StorageStats = { total_files: totalFiles, total_size: totalSize, by_type: byType };
  return c.json(stats);
});

// 404 catch-all
app.all('*', (c) =>
  c.json({ error: 'NOT_FOUND', message: `Route not found: ${c.req.method} ${c.req.path}` }, 404),
);

export default app;

// Export for testing
export {
  generateId,
  tenantKey,
  extractFilename,
  guessContentType,
  isValidTenantId,
  isValidPath,
  r2ToMetadata,
};
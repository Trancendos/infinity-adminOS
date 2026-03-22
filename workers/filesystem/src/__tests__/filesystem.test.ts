/**
 * @trancendos/filesystem — Test Suite
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateId,
  tenantKey,
  extractFilename,
  guessContentType,
  isValidTenantId,
  isValidPath,
} from '../index.js';

// ── Mock Environment ───────────────────────────────────────────────────────

function createMockR2Object(key: string, size: number, contentType = 'application/octet-stream') {
  return {
    key,
    size,
    httpEtag: `"etag-${key}"`,
    uploaded: new Date(),
    httpMetadata: { contentType },
    customMetadata: {},
    body: new ReadableStream(),
    bodyUsed: false,
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(size)),
    text: vi.fn().mockResolvedValue('content'),
    json: vi.fn().mockResolvedValue({}),
    blob: vi.fn().mockResolvedValue(new Blob()),
  };
}

function createMockEnv() {
  return {
    STORAGE: {
      put: vi.fn().mockResolvedValue({
        key: 'test-key',
        size: 100,
        httpEtag: '"test-etag"',
        uploaded: new Date(),
        httpMetadata: { contentType: 'text/plain' },
        customMetadata: {},
      }),
      get: vi.fn().mockResolvedValue(null),
      head: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue({
        objects: [],
        truncated: false,
        cursor: undefined,
      }),
    },
    DB: {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
        run: vi.fn().mockResolvedValue({ success: true }),
      }),
    },
    CACHE: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
    },
    ENVIRONMENT: 'test',
  };
}

// ── Helper Functions ───────────────────────────────────────────────────────

describe('generateId', () => {
  it('should generate unique IDs', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateId()));
    expect(ids.size).toBe(50);
  });

  it('should have file_ prefix', () => {
    expect(generateId()).toMatch(/^file_/);
  });
});

describe('tenantKey', () => {
  it('should namespace files by tenant', () => {
    expect(tenantKey('tenant-1', 'docs/readme.md')).toBe('tenants/tenant-1/docs/readme.md');
  });

  it('should strip leading slashes', () => {
    expect(tenantKey('t1', '/images/logo.png')).toBe('tenants/t1/images/logo.png');
  });

  it('should strip trailing slashes', () => {
    expect(tenantKey('t1', 'folder/')).toBe('tenants/t1/folder');
  });
});

describe('extractFilename', () => {
  it('should extract filename from path', () => {
    expect(extractFilename('docs/readme.md')).toBe('readme.md');
    expect(extractFilename('image.png')).toBe('image.png');
    expect(extractFilename('a/b/c/file.txt')).toBe('file.txt');
  });
});

describe('guessContentType', () => {
  it('should detect common types', () => {
    expect(guessContentType('file.html')).toBe('text/html');
    expect(guessContentType('file.css')).toBe('text/css');
    expect(guessContentType('file.js')).toBe('application/javascript');
    expect(guessContentType('file.json')).toBe('application/json');
    expect(guessContentType('file.png')).toBe('image/png');
    expect(guessContentType('file.jpg')).toBe('image/jpeg');
    expect(guessContentType('file.pdf')).toBe('application/pdf');
    expect(guessContentType('file.svg')).toBe('image/svg+xml');
    expect(guessContentType('file.mp4')).toBe('video/mp4');
  });

  it('should default to octet-stream for unknown', () => {
    expect(guessContentType('file.xyz')).toBe('application/octet-stream');
    expect(guessContentType('noext')).toBe('application/octet-stream');
  });
});

describe('isValidTenantId', () => {
  it('should accept valid tenant IDs', () => {
    expect(isValidTenantId('tenant-1')).toBe(true);
    expect(isValidTenantId('abc_123')).toBe(true);
    expect(isValidTenantId('T1')).toBe(true);
  });

  it('should reject invalid tenant IDs', () => {
    expect(isValidTenantId('')).toBe(false);
    expect(isValidTenantId('a'.repeat(65))).toBe(false);
    expect(isValidTenantId('tenant/hack')).toBe(false);
    expect(isValidTenantId('tenant..id')).toBe(false);
  });
});

describe('isValidPath', () => {
  it('should accept valid paths', () => {
    expect(isValidPath('docs/readme.md')).toBe(true);
    expect(isValidPath('image.png')).toBe(true);
    expect(isValidPath('a/b/c/d.txt')).toBe(true);
  });

  it('should reject empty path', () => {
    expect(isValidPath('')).toBe(false);
  });

  it('should reject path traversal', () => {
    expect(isValidPath('../../../etc/passwd')).toBe(false);
    expect(isValidPath('docs/../../secret')).toBe(false);
  });

  it('should reject paths with invalid characters', () => {
    expect(isValidPath('file<script>.txt')).toBe(false);
    expect(isValidPath('file|pipe.txt')).toBe(false);
  });

  it('should reject paths that are too long', () => {
    expect(isValidPath('a'.repeat(1025))).toBe(false);
  });
});

// ── Hono App Routes ────────────────────────────────────────────────────────

describe('Filesystem Worker Routes', () => {
  let app: { default: { fetch: (req: Request, env: unknown) => Promise<Response> } };
  let env: ReturnType<typeof createMockEnv>;

  beforeEach(async () => {
    app = await import('../index.js') as typeof app;
    env = createMockEnv();
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const res = await app.default.fetch(
        new Request('http://localhost/health'),
        env,
      );
      expect(res.status).toBe(200);
      const body = await res.json() as Record<string, unknown>;
      expect(body.status).toBe('healthy');
      expect(body.service).toBe('filesystem-worker');
    });
  });

  describe('PUT /v1/files/:tenantId/*', () => {
    it('should reject invalid tenant ID', async () => {
      const res = await app.default.fetch(
        new Request('http://localhost/v1/files/bad%40tenant!/file.txt', {
          method: 'PUT',
          body: 'content',
        }),
        env,
      );
      expect(res.status).toBe(400);
    });

    it('should reject empty body', async () => {
      const res = await app.default.fetch(
        new Request('http://localhost/v1/files/tenant-1/file.txt', {
          method: 'PUT',
          body: '',
        }),
        env,
      );
      expect(res.status).toBe(400);
    });

    it('should upload a file successfully', async () => {
      const res = await app.default.fetch(
        new Request('http://localhost/v1/files/tenant-1/docs/readme.md', {
          method: 'PUT',
          body: 'Hello World',
          headers: { 'content-type': 'text/markdown' },
        }),
        env,
      );
      expect(res.status).toBe(201);
      expect(env.STORAGE.put).toHaveBeenCalledWith(
        'tenants/tenant-1/docs/readme.md',
        expect.any(ArrayBuffer),
        expect.objectContaining({
          httpMetadata: { contentType: 'text/markdown' },
        }),
      );
    });
  });

  describe('GET /v1/files/:tenantId/*', () => {
    it('should return 404 for missing file', async () => {
      const res = await app.default.fetch(
        new Request('http://localhost/v1/files/tenant-1/missing.txt'),
        env,
      );
      expect(res.status).toBe(404);
    });

    it('should return file content', async () => {
      const mockObj = createMockR2Object('tenants/tenant-1/file.txt', 11, 'text/plain');
      env.STORAGE.get = vi.fn().mockResolvedValue(mockObj);

      const res = await app.default.fetch(
        new Request('http://localhost/v1/files/tenant-1/file.txt'),
        env,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/plain');
    });

    it('should return metadata only with ?meta=true', async () => {
      const mockObj = createMockR2Object('tenants/tenant-1/file.txt', 11, 'text/plain');
      env.STORAGE.head = vi.fn().mockResolvedValue(mockObj);

      const res = await app.default.fetch(
        new Request('http://localhost/v1/files/tenant-1/file.txt?meta=true'),
        env,
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { file: { path: string } };
      expect(body.file.path).toBe('file.txt');
    });
  });

  describe('DELETE /v1/files/:tenantId/*', () => {
    it('should return 404 for missing file', async () => {
      const res = await app.default.fetch(
        new Request('http://localhost/v1/files/tenant-1/missing.txt', { method: 'DELETE' }),
        env,
      );
      expect(res.status).toBe(404);
    });

    it('should delete existing file', async () => {
      const mockObj = createMockR2Object('tenants/tenant-1/file.txt', 11);
      env.STORAGE.head = vi.fn().mockResolvedValue(mockObj);

      const res = await app.default.fetch(
        new Request('http://localhost/v1/files/tenant-1/file.txt', { method: 'DELETE' }),
        env,
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { deleted: boolean };
      expect(body.deleted).toBe(true);
      expect(env.STORAGE.delete).toHaveBeenCalledWith('tenants/tenant-1/file.txt');
    });
  });

  describe('GET /v1/list/:tenantId', () => {
    it('should list files for a tenant', async () => {
      env.STORAGE.list = vi.fn().mockResolvedValue({
        objects: [
          createMockR2Object('tenants/tenant-1/a.txt', 100),
          createMockR2Object('tenants/tenant-1/b.txt', 200),
        ],
        truncated: false,
      });

      const res = await app.default.fetch(
        new Request('http://localhost/v1/list/tenant-1'),
        env,
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { files: unknown[]; total_size: number };
      expect(body.files).toHaveLength(2);
      expect(body.total_size).toBe(300);
    });

    it('should support prefix filtering', async () => {
      env.STORAGE.list = vi.fn().mockResolvedValue({ objects: [], truncated: false });

      await app.default.fetch(
        new Request('http://localhost/v1/list/tenant-1?prefix=docs/'),
        env,
      );
      expect(env.STORAGE.list).toHaveBeenCalledWith(
        expect.objectContaining({ prefix: 'tenants/tenant-1/docs' }),
      );
    });

    it('should cap limit at 1000', async () => {
      env.STORAGE.list = vi.fn().mockResolvedValue({ objects: [], truncated: false });

      await app.default.fetch(
        new Request('http://localhost/v1/list/tenant-1?limit=9999'),
        env,
      );
      expect(env.STORAGE.list).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 1000 }),
      );
    });
  });

  describe('POST /v1/batch-delete/:tenantId', () => {
    it('should require paths array', async () => {
      const res = await app.default.fetch(
        new Request('http://localhost/v1/batch-delete/tenant-1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }),
        env,
      );
      expect(res.status).toBe(400);
    });

    it('should reject more than 100 files', async () => {
      const paths = Array.from({ length: 101 }, (_, i) => `file${i}.txt`);
      const res = await app.default.fetch(
        new Request('http://localhost/v1/batch-delete/tenant-1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths }),
        }),
        env,
      );
      expect(res.status).toBe(400);
    });

    it('should batch delete files', async () => {
      const res = await app.default.fetch(
        new Request('http://localhost/v1/batch-delete/tenant-1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths: ['a.txt', 'b.txt'] }),
        }),
        env,
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { deleted: number };
      expect(body.deleted).toBe(2);
      expect(env.STORAGE.delete).toHaveBeenCalledWith([
        'tenants/tenant-1/a.txt',
        'tenants/tenant-1/b.txt',
      ]);
    });
  });

  describe('POST /v1/copy/:tenantId', () => {
    it('should require source and destination', async () => {
      const res = await app.default.fetch(
        new Request('http://localhost/v1/copy/tenant-1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'a.txt' }),
        }),
        env,
      );
      expect(res.status).toBe(400);
    });

    it('should return 404 if source not found', async () => {
      env.STORAGE.get = vi.fn().mockResolvedValue(null);
      const res = await app.default.fetch(
        new Request('http://localhost/v1/copy/tenant-1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'a.txt', destination: 'b.txt' }),
        }),
        env,
      );
      expect(res.status).toBe(404);
    });

    it('should copy file successfully', async () => {
      const mockObj = createMockR2Object('tenants/tenant-1/a.txt', 100, 'text/plain');
      env.STORAGE.get = vi.fn().mockResolvedValue(mockObj);

      const res = await app.default.fetch(
        new Request('http://localhost/v1/copy/tenant-1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'a.txt', destination: 'b.txt' }),
        }),
        env,
      );
      expect(res.status).toBe(200);
      const body = await res.json() as { copied: boolean };
      expect(body.copied).toBe(true);
    });
  });

  describe('GET /v1/stats/:tenantId', () => {
    it('should return storage stats', async () => {
      env.STORAGE.list = vi.fn().mockResolvedValue({
        objects: [
          createMockR2Object('tenants/tenant-1/doc.pdf', 1000),
          createMockR2Object('tenants/tenant-1/img.png', 2000),
          createMockR2Object('tenants/tenant-1/data.json', 500),
        ],
        truncated: false,
      });

      const res = await app.default.fetch(
        new Request('http://localhost/v1/stats/tenant-1'),
        env,
      );
      expect(res.status).toBe(200);
      const body = await res.json() as StorageStats;
      expect(body.total_files).toBe(3);
      expect(body.total_size).toBe(3500);
      expect(body.by_type).toHaveProperty('pdf');
      expect(body.by_type).toHaveProperty('png');
      expect(body.by_type).toHaveProperty('json');
    });
  });

  describe('404 catch-all', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await app.default.fetch(
        new Request('http://localhost/unknown'),
        env,
      );
      expect(res.status).toBe(404);
    });
  });
});

// Import for type usage
import type { StorageStats } from '../index.js';
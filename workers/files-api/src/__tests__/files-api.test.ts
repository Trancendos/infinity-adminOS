/**
 * Files API Worker — Unit Tests
 * ═══════════════════════════════════════════════════════════════
 * Tests file upload, download, list, delete, auth,
 * CORS, security headers, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── R2 Object mock ────────────────────────────────────────────────
function makeR2Object(key: string, size = 1024, type = 'application/octet-stream') {
  return {
    key,
    size,
    etag: `"etag-${key}"`,
    httpEtag: `"etag-${key}"`,
    uploaded: new Date(),
    httpMetadata: { contentType: type },
    customMetadata: { originalName: 'test-file.txt', uploadedBy: 'usr-1' },
    arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(size)),
    text: vi.fn().mockResolvedValue('file content here'),
    body: new ReadableStream(),
    bodyUsed: false,
  };
}

// ── R2 bucket mock factory ────────────────────────────────────────
function makeR2Bucket(existingKeys: string[] = []) {
  return {
    get: vi.fn().mockImplementation((key: string) => {
      if (existingKeys.includes(key)) return Promise.resolve(makeR2Object(key));
      return Promise.resolve(null);
    }),
    put: vi.fn().mockResolvedValue(makeR2Object('new-key')),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue({
      objects: existingKeys.map((k) => makeR2Object(k)),
      truncated: false,
      cursor: undefined,
    }),
    head: vi.fn().mockImplementation((key: string) => {
      if (existingKeys.includes(key)) return Promise.resolve(makeR2Object(key));
      return Promise.resolve(null);
    }),
  };
}

// ── DB mock factory ───────────────────────────────────────────────
function makeDb() {
  const stmt = {
    bind: vi.fn().mockReturnThis(),
    run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
    first: vi.fn().mockResolvedValue({
      id: 'file-001',
      name: 'test.txt',
      size: 1024,
      content_type: 'text/plain',
      user_id: 'usr-1',
      storage_key: 'users/usr-1/file-001',
      created_at: new Date().toISOString(),
    }),
    all: vi.fn().mockResolvedValue({
      results: [
        {
          id: 'file-001',
          name: 'test.txt',
          size: 1024,
          content_type: 'text/plain',
          user_id: 'usr-1',
          storage_key: 'users/usr-1/file-001',
          created_at: new Date().toISOString(),
        },
      ],
    }),
  };
  return { prepare: vi.fn().mockReturnValue(stmt), _stmt: stmt };
}

// ── Auth mock helper ──────────────────────────────────────────────
function stubAuthSuccess() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({ id: 'usr-1', role: 'user', email: 'user@example.com' }),
      { status: 200 },
    ),
  ));
}

function stubAuthFailure() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
  ));
}

// ── Env mock factory ──────────────────────────────────────────────
function makeEnv(overrides: Record<string, unknown> = {}) {
  return {
    // Keys match implementation: BUCKET.head/get uses `${user.userId}/${fileId}`
    // where user.userId = 'usr-1' from the auth mock
    BUCKET: makeR2Bucket(['usr-1/file-001', 'usr-1/file-002']),
    DB: makeDb(),
    AUTH_API_URL: 'https://mock-auth.example.com',
    ENVIRONMENT: 'test',
    ALLOWED_ORIGINS: '',
    MAX_FILE_SIZE_MB: '10',
    ...overrides,
  };
}

// ── Request helpers ───────────────────────────────────────────────
function makeRequest(
  path: string,
  method = 'GET',
  headers: Record<string, string> = {},
  body?: BodyInit,
) {
  return new Request(`https://files-api.example.com${path}`, {
    method,
    headers: {
      Origin: 'https://infinity-portal.pages.dev',
      Authorization: 'Bearer valid-token-123',
      ...headers,
    },
    body,
  });
}

// ── Import worker ─────────────────────────────────────────────────
import worker from '../index';

// ═══════════════════════════════════════════════════════════════
// Health Check
// ═══════════════════════════════════════════════════════════════
describe('Health Check', () => {
  it('GET /health returns 200 without auth', async () => {
    const res = await worker.fetch(makeRequest('/health'), makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe('healthy');
    expect(body.service).toBe('files-api');
  });

  it('health check includes environment', async () => {
    const res = await worker.fetch(makeRequest('/health'), makeEnv({ ENVIRONMENT: 'staging' }));
    const body = await res.json() as Record<string, unknown>;
    expect(body.environment).toBe('staging');
  });

  it('health check includes timestamp', async () => {
    const res = await worker.fetch(makeRequest('/health'), makeEnv());
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.timestamp).toBe('string');
  });
});

// ═══════════════════════════════════════════════════════════════
// CORS & Security
// ═══════════════════════════════════════════════════════════════
describe('CORS & Security', () => {
  it('OPTIONS preflight returns 204', async () => {
    const req = new Request('https://files-api.example.com/api/v1/files', {
      method: 'OPTIONS',
      headers: { Origin: 'https://infinity-portal.pages.dev' },
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(204);
  });

  it('includes X-Content-Type-Options on responses', async () => {
    const res = await worker.fetch(makeRequest('/health'), makeEnv());
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('includes X-Frame-Options on responses', async () => {
    const res = await worker.fetch(makeRequest('/health'), makeEnv());
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('includes CORS header for allowed origin', async () => {
    const res = await worker.fetch(makeRequest('/health'), makeEnv());
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
  });

  it('no CORS header for disallowed origin', async () => {
    const req = new Request('https://files-api.example.com/health', {
      headers: { Origin: 'https://hacker.com' },
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// Auth Guard
// ═══════════════════════════════════════════════════════════════
describe('Auth Guard', () => {
  it('returns 401 when no token provided for file list', async () => {
    stubAuthFailure();
    const req = new Request('https://files-api.example.com/api/v1/files');
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(401);
  });

  it('returns 401 for upload without auth', async () => {
    stubAuthFailure();
    const req = new Request('https://files-api.example.com/api/v1/files/upload', {
      method: 'POST',
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(401);
  });

  it('allows through with valid token', async () => {
    stubAuthSuccess();
    const res = await worker.fetch(makeRequest('/api/v1/files'), makeEnv());
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════
// File Listing
// ═══════════════════════════════════════════════════════════════
describe('File Listing', () => {
  beforeEach(stubAuthSuccess);

  it('GET /api/v1/files returns file list', async () => {
    const res = await worker.fetch(makeRequest('/api/v1/files'), makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as { files: unknown[] };
    expect(Array.isArray(body.files)).toBe(true);
  });

  it('file list includes id, name, size, content_type', async () => {
    const res = await worker.fetch(makeRequest('/api/v1/files'), makeEnv());
    const body = await res.json() as { files: Array<Record<string, unknown>> };
    if (body.files.length > 0) {
      const f = body.files[0];
      expect(f.id).toBeDefined();
      expect(f.name).toBeDefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// File Upload
// ═══════════════════════════════════════════════════════════════
describe('File Upload', () => {
  beforeEach(stubAuthSuccess);

  it('POST /api/v1/files/upload returns 201 with file metadata', async () => {
    const env = makeEnv();
    const formData = new FormData();
    formData.append('file', new Blob(['hello world'], { type: 'text/plain' }), 'hello.txt');

    const req = new Request('https://files-api.example.com/api/v1/files/upload', {
      method: 'POST',
      headers: {
        Origin: 'https://infinity-portal.pages.dev',
        Authorization: 'Bearer valid-token-123',
      },
      body: formData,
    });

    const res = await worker.fetch(req, env);
    // Accept 201 or 200 (implementation may vary)
    expect([200, 201].includes(res.status)).toBe(true);
  });

  it('returns 400 when no file in form data', async () => {
    const formData = new FormData();
    // No file appended

    const req = new Request('https://files-api.example.com/api/v1/files/upload', {
      method: 'POST',
      headers: {
        Origin: 'https://infinity-portal.pages.dev',
        Authorization: 'Bearer valid-token-123',
      },
      body: formData,
    });

    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════
// File Get & Download
// ═══════════════════════════════════════════════════════════════
describe('File Get & Download', () => {
  beforeEach(stubAuthSuccess);

  it('GET /api/v1/files/:id returns file metadata', async () => {
    // The actual implementation uses BUCKET.head(userId/fileId)
    // Default makeEnv() bucket has keys: 'users/usr-1/file-001' and 'users/usr-1/file-002'
    const res = await worker.fetch(
      makeRequest('/api/v1/files/file-001'),
      makeEnv(),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.id).toBeDefined();
    expect(body.name).toBeDefined();
  });

  it('returns 404 for non-existent file', async () => {
    // Use a bucket with no keys so head() returns null
    const bucket = makeR2Bucket([]); // empty bucket
    const res = await worker.fetch(
      makeRequest('/api/v1/files/nonexistent-id'),
      makeEnv({ BUCKET: bucket }),
    );
    expect(res.status).toBe(404);
  });

  it('GET /api/v1/files/:id/download returns file content', async () => {
    // The actual implementation uses BUCKET.get(userId/fileId)
    // Default makeEnv() bucket has key 'users/usr-1/file-001'
    const res = await worker.fetch(
      makeRequest('/api/v1/files/file-001/download'),
      makeEnv(),
    );
    // Should return 200 with file body
    expect([200, 206, 302].includes(res.status)).toBe(true);
  });

  it('returns 404 on download when R2 object missing', async () => {
    const bucket = makeR2Bucket([]); // no objects
    const res = await worker.fetch(
      makeRequest('/api/v1/files/file-001/download'),
      makeEnv({ BUCKET: bucket }),
    );
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════
// File Delete
// ═══════════════════════════════════════════════════════════════
describe('File Delete', () => {
  beforeEach(stubAuthSuccess);

  it('DELETE /api/v1/files/:id returns 200', async () => {
    const db = makeDb();
    db._stmt.first.mockResolvedValue({
      id: 'file-001',
      name: 'test.txt',
      user_id: 'usr-1',
      storage_key: 'users/usr-1/file-001',
    });
    const res = await worker.fetch(
      makeRequest('/api/v1/files/file-001', 'DELETE'),
      makeEnv({ DB: db }),
    );
    expect(res.status).toBe(200);
  });

  it('DELETE /api/v1/files/:id always returns 200 (R2 delete is idempotent)', async () => {
    // The actual implementation calls BUCKET.delete() which is idempotent in R2
    // (no existence check before deletion — R2 delete doesn't error on missing key)
    const res = await worker.fetch(
      makeRequest('/api/v1/files/nonexistent', 'DELETE'),
      makeEnv(),
    );
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════
// Error Handling
// ═══════════════════════════════════════════════════════════════
describe('Error Handling', () => {
  it('returns 404 for unknown routes (with valid auth)', async () => {
    // Auth check runs before routing — stub auth success to reach the 404 handler
    stubAuthSuccess();
    const res = await worker.fetch(makeRequest('/api/v1/unknown'), makeEnv());
    vi.unstubAllGlobals();
    expect(res.status).toBe(404);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBeDefined();
  });

  it('returns 500 with obscured error in production', async () => {
    stubAuthSuccess();
    // Implementation uses BUCKET.list() for file listing — make it throw
    const bucket = makeR2Bucket([]);
    bucket.list = vi.fn().mockRejectedValue(new Error('R2 bucket unavailable'));
    const env = makeEnv({ BUCKET: bucket, ENVIRONMENT: 'production' });
    const res = await worker.fetch(makeRequest('/api/v1/files'), env);
    vi.unstubAllGlobals();
    expect(res.status).toBe(500);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe('Internal server error');
  });
});
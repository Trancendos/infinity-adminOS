// ============================================================
// Infinity OS — Files API Worker (Cloudflare R2)
// ============================================================
// Routes:
//   GET    /health
//   GET    /api/v1/files              — List files
//   POST   /api/v1/files/upload       — Upload file
//   GET    /api/v1/files/:id          — Get file metadata
//   GET    /api/v1/files/:id/download — Download file
//   DELETE /api/v1/files/:id          — Delete file
// ============================================================

export interface Env {
  BUCKET: R2Bucket;
  DB: D1Database;
  AUTH_API_URL: string;
  ENVIRONMENT: string;
  ALLOWED_ORIGINS: string;
  MAX_FILE_SIZE_MB: string;
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
};

function getAllowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const allowed = [
    'https://infinity-portal.pages.dev',
    'https://infinity-portal.com',
    'http://localhost:5173',
    ...(env.ALLOWED_ORIGINS || '').split(',').map((o: string) => o.trim()),
  ];
  if (allowed.includes(origin) || origin.endsWith('.infinity-portal.pages.dev')) return origin;
  return null;
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = getAllowedOrigin(request, env);
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function jsonResponse(data: unknown, status = 200, request?: Request, env?: Env): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...SECURITY_HEADERS,
      ...(request && env ? corsHeaders(request, env) : {}),
    },
  });
}

async function verifyToken(request: Request, env: Env): Promise<{ userId: string; role: string; email: string } | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const authApiUrl = env.AUTH_API_URL || 'https://infinity-auth-api.luminous-aimastermind.workers.dev';
    const res = await fetch(`${authApiUrl}/api/v1/auth/me`, {
      headers: { Authorization: authHeader },
    });
    if (!res.ok) return null;
    const user = await res.json() as { id: string; role: string; email: string };
    return { userId: user.id, role: user.role, email: user.email };
  } catch {
    return null;
  }
}

function generateId(): string {
  return crypto.randomUUID();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...corsHeaders(request, env), ...SECURITY_HEADERS } });
    }

    try {
      // Health
      if (pathname === '/health') {
        return jsonResponse({ status: 'healthy', service: 'files-api', environment: env.ENVIRONMENT, timestamp: new Date().toISOString() }, 200, request, env);
      }

      // Auth required for all file routes
      const user = await verifyToken(request, env);
      if (!user) return jsonResponse({ error: 'Authentication required' }, 401, request, env);

      // List files
      if (pathname === '/api/v1/files' && request.method === 'GET') {
        const prefix = `${user.userId}/`;
        const listed = await env.BUCKET.list({ prefix, limit: 100 });
        const files = listed.objects.map(obj => ({
          id: obj.key.replace(prefix, ''),
          name: obj.key.split('/').pop(),
          size: obj.size,
          uploaded_at: obj.uploaded.toISOString(),
          content_type: obj.httpMetadata?.contentType ?? 'application/octet-stream',
        }));
        return jsonResponse({ files, total: files.length }, 200, request, env);
      }

      // Upload file
      if (pathname === '/api/v1/files/upload' && request.method === 'POST') {
        const maxMB = parseInt(env.MAX_FILE_SIZE_MB || '50', 10);
        const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
        if (contentLength > maxMB * 1024 * 1024) {
          return jsonResponse({ error: `File too large. Max ${maxMB}MB` }, 413, request, env);
        }

        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        if (!file) return jsonResponse({ error: 'No file provided' }, 400, request, env);

        const fileId = generateId();
        const key = `${user.userId}/${fileId}`;
        const arrayBuffer = await file.arrayBuffer();

        await env.BUCKET.put(key, arrayBuffer, {
          httpMetadata: {
            contentType: file.type || 'application/octet-stream',
          },
          customMetadata: {
            originalName: file.name,
            uploadedBy: user.userId,
            uploadedAt: new Date().toISOString(),
          },
        });

        return jsonResponse({
          id: fileId,
          name: file.name,
          size: file.size,
          content_type: file.type,
          url: `/api/v1/files/${fileId}/download`,
          uploaded_at: new Date().toISOString(),
        }, 201, request, env);
      }

      // Get file metadata
      const fileMatch = pathname.match(/^\/api\/v1\/files\/([^/]+)$/);
      if (fileMatch && request.method === 'GET') {
        const fileId = fileMatch[1];
        const key = `${user.userId}/${fileId}`;
        const obj = await env.BUCKET.head(key);
        if (!obj) return jsonResponse({ error: 'File not found' }, 404, request, env);
        return jsonResponse({
          id: fileId,
          name: obj.customMetadata?.originalName ?? fileId,
          size: obj.size,
          content_type: obj.httpMetadata?.contentType ?? 'application/octet-stream',
          uploaded_at: obj.uploaded.toISOString(),
        }, 200, request, env);
      }

      // Download file
      const downloadMatch = pathname.match(/^\/api\/v1\/files\/([^/]+)\/download$/);
      if (downloadMatch && request.method === 'GET') {
        const fileId = downloadMatch[1];
        const key = `${user.userId}/${fileId}`;
        const obj = await env.BUCKET.get(key);
        if (!obj) return jsonResponse({ error: 'File not found' }, 404, request, env);
        const cors = corsHeaders(request, env);
        return new Response(obj.body, {
          headers: {
            'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${obj.customMetadata?.originalName ?? fileId}"`,
            ...SECURITY_HEADERS,
            ...cors,
          },
        });
      }

      // Delete file
      const deleteMatch = pathname.match(/^\/api\/v1\/files\/([^/]+)$/);
      if (deleteMatch && request.method === 'DELETE') {
        const fileId = deleteMatch[1];
        const key = `${user.userId}/${fileId}`;
        await env.BUCKET.delete(key);
        return jsonResponse({ message: 'File deleted' }, 200, request, env);
      }

      return jsonResponse({ error: `Route not found: ${request.method} ${pathname}` }, 404, request, env);

    } catch (err) {
      console.error('Files API error:', err);
      return jsonResponse({ error: env.ENVIRONMENT === 'production' ? 'Internal server error' : String(err) }, 500, request, env);
    }
  },
};
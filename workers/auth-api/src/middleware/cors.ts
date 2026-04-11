// ============================================================
// CORS + Security Headers Middleware
// ============================================================

import { Env } from '../types';

export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

export function getAllowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;

  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim());

  // Always allow Pages deployment and localhost
  const defaultAllowed = [
    'https://infinity-portal.pages.dev',
    'https://infinity-portal.com',
    'https://www.infinity-portal.com',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:4173',
  ];

  const allAllowed = [...new Set([...allowed, ...defaultAllowed])];

  if (allAllowed.includes(origin)) return origin;
  if (origin.endsWith('.infinity-portal.pages.dev')) return origin;
  if (origin.endsWith('.infinity-portal.com')) return origin;

  return null;
}

export function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = getAllowedOrigin(request, env);
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

export function handleCORS(request: Request, env: Env): Response | null {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(request, env),
        ...SECURITY_HEADERS,
      },
    });
  }
  return null;
}

export function jsonResponse(
  data: unknown,
  status = 200,
  extra: Record<string, string> = {},
  request?: Request,
  env?: Env,
): Response {
  const cors = request && env ? corsHeaders(request, env) : {};
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...SECURITY_HEADERS,
      ...cors,
      ...extra,
    },
  });
}

export function errorResponse(
  message: string,
  status = 400,
  request?: Request,
  env?: Env,
  detail?: unknown,
): Response {
  return jsonResponse({ error: message, detail: detail ?? null }, status, {}, request, env);
}
/**
 * Dispatch Worker — Auth Middleware
 * ═══════════════════════════════════════════════════════════════
 * Verifies tenant authentication via JWT (HMAC-SHA256).
 * Extracts tenantId + userId + scopes from the token.
 *
 * In production, each tenant would have its own signing key
 * stored in TenantDO config. For now, we use a shared secret.
 */

import type { AuthResult, JWTPayload, Env } from '../types';

// ─── Constants ──────────────────────────────────────────────────

const ALGORITHM = { name: 'HMAC', hash: 'SHA-256' } as const;
const ENCODER = new TextEncoder();

// ─── JWT Verification ───────────────────────────────────────────

/**
 * Import a raw secret string as a CryptoKey for HMAC verification.
 */
async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    ENCODER.encode(secret),
    ALGORITHM,
    false,
    ['sign', 'verify'],
  );
}

/**
 * Base64url decode (RFC 7515).
 */
function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Verify a JWT token and return the decoded payload.
 * Returns null if verification fails.
 */
async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;

    // Verify header is HS256
    const header = JSON.parse(new TextDecoder().decode(base64urlDecode(headerB64)));
    if (header.alg !== 'HS256') return null;

    // Verify signature
    const key = await importKey(secret);
    const data = ENCODER.encode(`${headerB64}.${payloadB64}`);
    const signature = base64urlDecode(signatureB64);

    const valid = await crypto.subtle.verify(ALGORITHM, key, signature, data);
    if (!valid) return null;

    // Decode payload
    const payload: JWTPayload = JSON.parse(
      new TextDecoder().decode(base64urlDecode(payloadB64)),
    );

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null; // Expired — caller can check specifically
    }

    return payload;
  } catch {
    return null;
  }
}

// ─── Middleware ──────────────────────────────────────────────────

/**
 * Authenticate a request by extracting and verifying the JWT.
 *
 * Supports:
 * - Authorization: Bearer <token>
 * - Cookie: __session=<token>
 * - X-API-Key: <token> (for service-to-service)
 */
export async function authenticateRequest(
  request: Request,
  env: Env,
): Promise<AuthResult> {
  // 1. Extract token from headers
  const token = extractToken(request);
  if (!token) {
    return { authenticated: false, error: 'No authentication token provided' };
  }

  // 2. Verify JWT
  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload) {
    // Check if it's specifically expired
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payloadRaw = JSON.parse(
          new TextDecoder().decode(base64urlDecode(parts[1])),
        );
        if (payloadRaw.exp && payloadRaw.exp < Math.floor(Date.now() / 1000)) {
          return { authenticated: false, error: 'Token expired' };
        }
      }
    } catch {
      // Ignore parse errors
    }
    return { authenticated: false, error: 'Invalid token' };
  }

  // 3. Return verified identity
  return {
    authenticated: true,
    tenantId: payload.tid,
    userId: payload.sub,
    scopes: payload.scopes ?? [],
  };
}

/**
 * Extract the auth token from various request sources.
 */
function extractToken(request: Request): string | null {
  // 1. Authorization header (preferred)
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  // 2. X-API-Key header (service-to-service)
  const apiKey = request.headers.get('X-API-Key');
  if (apiKey) return apiKey;

  // 3. Cookie fallback
  const cookie = request.headers.get('Cookie');
  if (cookie) {
    const match = cookie.match(/__session=([^;]+)/);
    if (match) return match[1];
  }

  return null;
}

/**
 * Check if an auth result has the required scope.
 */
export function hasScope(auth: AuthResult, requiredScope: string): boolean {
  if (!auth.authenticated || !auth.scopes) return false;

  // Support wildcard scopes: 'admin:*' matches 'admin:read', 'admin:write', etc.
  return auth.scopes.some((scope) => {
    if (scope === '*') return true;
    if (scope === requiredScope) return true;
    if (scope.endsWith(':*')) {
      const prefix = scope.slice(0, -1); // 'admin:'
      return requiredScope.startsWith(prefix);
    }
    return false;
  });
}
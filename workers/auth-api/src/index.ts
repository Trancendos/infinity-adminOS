// ============================================================
// Infinity OS — Auth API Worker
// ============================================================
// Full authentication backend running on Cloudflare Workers
// with D1 (SQLite) database, JWT auth, PBKDF2 password hashing
//
// Routes:
//   GET  /health
//   POST /api/v1/auth/register
//   POST /api/v1/auth/login
//   POST /api/v1/auth/logout
//   POST /api/v1/auth/refresh
//   GET  /api/v1/auth/me
//   GET  /api/v1/rbac/users/me/roles
//   POST /api/v1/rbac/evaluate
//   POST /api/v1/rbac/switch-role
// ============================================================

import { Env } from './types';
import { handleCORS, jsonResponse, errorResponse } from './middleware/cors';
import { handleHealth } from './routes/health';
import { handleRegister, handleLogin, handleLogout, handleRefresh, handleMe } from './routes/auth';
import { handleGetMyRoles, handleEvaluate, handleSwitchRole } from './routes/rbac';

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname, method } = Object.assign(url, { method: request.method });

    // ── CORS Preflight ──────────────────────────────────────
    const corsResponse = handleCORS(request, env);
    if (corsResponse) return corsResponse;

    // ── Router ──────────────────────────────────────────────
    try {
      // Health
      if (pathname === '/health' || pathname === '/api/health') {
        return handleHealth(request, env);
      }

      // Auth routes
      if (pathname === '/api/v1/auth/register' && method === 'POST') {
        return handleRegister(request, env);
      }
      if (pathname === '/api/v1/auth/login' && method === 'POST') {
        return handleLogin(request, env);
      }
      if (pathname === '/api/v1/auth/logout' && method === 'POST') {
        return handleLogout(request, env);
      }
      if (pathname === '/api/v1/auth/refresh' && method === 'POST') {
        return handleRefresh(request, env);
      }
      if (pathname === '/api/v1/auth/me' && method === 'GET') {
        return handleMe(request, env);
      }

      // RBAC routes
      if (pathname === '/api/v1/rbac/users/me/roles' && method === 'GET') {
        return handleGetMyRoles(request, env);
      }
      if (pathname === '/api/v1/rbac/evaluate' && method === 'POST') {
        return handleEvaluate(request, env);
      }
      if (pathname === '/api/v1/rbac/switch-role' && method === 'POST') {
        return handleSwitchRole(request, env);
      }

      // API info
      if (pathname === '/' || pathname === '/api/v1') {
        return jsonResponse({
          name: 'Infinity OS Auth API',
          version: '2.0.0',
          environment: env.ENVIRONMENT ?? 'production',
          endpoints: [
            'POST /api/v1/auth/register',
            'POST /api/v1/auth/login',
            'POST /api/v1/auth/logout',
            'POST /api/v1/auth/refresh',
            'GET  /api/v1/auth/me',
            'GET  /api/v1/rbac/users/me/roles',
            'POST /api/v1/rbac/evaluate',
            'POST /api/v1/rbac/switch-role',
          ],
        }, 200, {}, request, env);
      }

      // 404
      return errorResponse(`Route not found: ${method} ${pathname}`, 404, request, env);

    } catch (err) {
      console.error('Unhandled error:', err);
      return errorResponse(
        env.ENVIRONMENT === 'production' ? 'Internal server error' : String(err),
        500,
        request,
        env,
      );
    }
  },
};
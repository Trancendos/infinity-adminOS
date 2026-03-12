// ============================================================
// Health Check Route
// ============================================================

import { Env } from '../types';
import { jsonResponse } from '../middleware/cors';

export async function handleHealth(request: Request, env: Env): Promise<Response> {
  // Quick DB check
  let dbStatus = 'healthy';
  try {
    await env.DB.prepare('SELECT 1').first();
  } catch {
    dbStatus = 'degraded';
  }

  return jsonResponse({
    status: dbStatus === 'healthy' ? 'healthy' : 'degraded',
    service: 'auth-api',
    environment: env.ENVIRONMENT ?? 'production',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    checks: {
      database: dbStatus,
      worker: 'healthy',
    },
  }, 200, {}, request, env);
}
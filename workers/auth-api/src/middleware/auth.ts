// ============================================================
// Auth Guard Middleware
// ============================================================

import { Env, TokenPayload } from '../types';
import { verifyJWT } from '../crypto';
import { errorResponse } from './cors';

export interface AuthContext {
  userId: string;
  email: string;
  role: string;
  organisationId: string | null;
}

export async function requireAuth(
  request: Request,
  env: Env,
): Promise<AuthContext | Response> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return errorResponse('Authentication required', 401, request, env);
  }

  const token = authHeader.slice(7);
  const payload = await verifyJWT<TokenPayload>(token, env.SECRET_KEY);

  if (!payload) {
    return errorResponse('Invalid or expired token', 401, request, env);
  }

  if (payload.type !== 'access') {
    return errorResponse('Invalid token type', 401, request, env);
  }

  return {
    userId: payload.sub,
    email: payload.email,
    role: payload.role,
    organisationId: payload.organisation_id,
  };
}

export function isAuthContext(value: AuthContext | Response): value is AuthContext {
  return !(value instanceof Response);
}
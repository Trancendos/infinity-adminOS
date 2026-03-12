// ============================================================
// Infinity OS — Auth Worker Types
// ============================================================

export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  SECRET_KEY: string;
  ENVIRONMENT: string;
  ALLOWED_ORIGINS: string;
  TOKEN_EXPIRY_MINUTES: string;
  REFRESH_EXPIRY_DAYS: string;
}

export interface User {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  role: string;
  organisation_id: string | null;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  subscription_tier: string;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  refresh_token_hash: string;
  expires_at: string;
  created_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
  organisation_id: string | null;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: PublicUser;
}

export interface PublicUser {
  id: string;
  email: string;
  display_name: string;
  role: string;
  organisation_id: string | null;
  is_active: boolean;
  permissions: string[];
}

export interface RegisterRequest {
  email: string;
  password: string;
  display_name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshRequest {
  refresh_token: string;
}

// Role → permissions mapping
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  superadmin: ['*'],
  admin: [
    'users:read', 'users:write', 'users:delete',
    'organisations:read', 'organisations:write',
    'files:read', 'files:write', 'files:delete',
    'ai:read', 'ai:write',
    'audit:read',
  ],
  manager: [
    'users:read', 'users:write',
    'organisations:read',
    'files:read', 'files:write',
    'ai:read', 'ai:write',
  ],
  member: [
    'users:read',
    'files:read', 'files:write',
    'ai:read',
  ],
  viewer: [
    'users:read',
    'files:read',
    'ai:read',
  ],
};
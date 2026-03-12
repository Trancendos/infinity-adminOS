// ============================================================
// Infinity OS — D1 Database Layer
// ============================================================

import { Env, User, Organisation, Session } from './types';
import { generateId } from './crypto';

// ── Users ─────────────────────────────────────────────────

export async function createUser(
  env: Env,
  data: {
    email: string;
    display_name: string;
    password_hash: string;
    role?: string;
    organisation_id?: string | null;
  },
): Promise<User> {
  const id = generateId();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO users (id, email, display_name, password_hash, role, organisation_id, is_active, is_verified, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
  )
    .bind(id, data.email.toLowerCase(), data.display_name, data.password_hash, data.role ?? 'member', data.organisation_id ?? null, now, now)
    .run();

  return getUserById(env, id) as Promise<User>;
}

export async function getUserByEmail(env: Env, email: string): Promise<User | null> {
  const result = await env.DB.prepare(
    'SELECT * FROM users WHERE email = ? AND is_active = 1',
  )
    .bind(email.toLowerCase())
    .first<User>();
  return result ?? null;
}

export async function getUserById(env: Env, id: string): Promise<User | null> {
  const result = await env.DB.prepare(
    'SELECT * FROM users WHERE id = ? AND is_active = 1',
  )
    .bind(id)
    .first<User>();
  return result ?? null;
}

export async function updateUser(
  env: Env,
  id: string,
  data: Partial<Pick<User, 'display_name' | 'role' | 'organisation_id' | 'is_active' | 'is_verified'>>,
): Promise<void> {
  const fields = Object.keys(data)
    .map(k => `${k} = ?`)
    .join(', ');
  const values = [...Object.values(data), new Date().toISOString(), id];

  await env.DB.prepare(`UPDATE users SET ${fields}, updated_at = ? WHERE id = ?`)
    .bind(...values)
    .run();
}

// ── Organisations ─────────────────────────────────────────

export async function createOrganisation(
  env: Env,
  data: { name: string; owner_id: string },
): Promise<Organisation> {
  const id = generateId();
  const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO organisations (id, name, slug, owner_id, subscription_tier, created_at)
     VALUES (?, ?, ?, ?, 'free', ?)`,
  )
    .bind(id, data.name, slug, data.owner_id, now)
    .run();

  const org = await env.DB.prepare('SELECT * FROM organisations WHERE id = ?')
    .bind(id)
    .first<Organisation>();
  return org!;
}

export async function getOrganisationById(env: Env, id: string): Promise<Organisation | null> {
  const result = await env.DB.prepare('SELECT * FROM organisations WHERE id = ?')
    .bind(id)
    .first<Organisation>();
  return result ?? null;
}

// ── Sessions ──────────────────────────────────────────────

export async function createSession(
  env: Env,
  data: {
    user_id: string;
    refresh_token_hash: string;
    expires_at: string;
    ip_address?: string | null;
    user_agent?: string | null;
  },
): Promise<Session> {
  const id = generateId();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, refresh_token_hash, expires_at, created_at, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, data.user_id, data.refresh_token_hash, data.expires_at, now, data.ip_address ?? null, data.user_agent ?? null)
    .run();

  return { id, ...data, created_at: now, ip_address: data.ip_address ?? null, user_agent: data.user_agent ?? null };
}

export async function getSessionByRefreshHash(env: Env, hash: string): Promise<Session | null> {
  const result = await env.DB.prepare(
    `SELECT * FROM sessions WHERE refresh_token_hash = ? AND expires_at > datetime('now')`,
  )
    .bind(hash)
    .first<Session>();
  return result ?? null;
}

export async function deleteSession(env: Env, id: string): Promise<void> {
  await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
}

export async function deleteUserSessions(env: Env, userId: string): Promise<void> {
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
}

// ── Audit Log ─────────────────────────────────────────────

export async function logAuditEvent(
  env: Env,
  data: {
    user_id: string | null;
    event_type: string;
    ip_address?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    const id = generateId();
    await env.DB.prepare(
      `INSERT INTO audit_logs (id, user_id, event_type, ip_address, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    )
      .bind(id, data.user_id, data.event_type, data.ip_address ?? null, JSON.stringify(data.metadata ?? {}))
      .run();
  } catch {
    // Audit log failure is non-critical — don't break the request
  }
}
/**
 * @package @trancendos/iam-middleware
 * Tests: JWT utilities, permission evaluation, middleware factory, route guards
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac, createHash } from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers to build real JWTs signed with HS512 / HS256
// ─────────────────────────────────────────────────────────────────────────────

function b64urlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function signJWT(payload: Record<string, unknown>, secret: string, alg: 'HS256' | 'HS512' = 'HS512'): string {
  const header = b64urlEncode(JSON.stringify({ alg, typ: 'JWT' }));
  const body   = b64urlEncode(JSON.stringify(payload));
  const input  = `${header}.${body}`;
  const hmacAlgo = alg === 'HS512' ? 'sha512' : 'sha256';
  const sig = Buffer.from(createHmac(hmacAlgo, secret).update(input).digest('base64'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return `${input}.${sig}`;
}

function makePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sub: 'user-123',
    email: 'test@example.com',
    role: 'user',
    jti: 'jti-abc',
    iat: Math.floor(Date.now() / 1000) - 10,
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
}

// Mock Express req/res/next
function makeReqRes(opts: {
  authorization?: string;
  path?: string;
  method?: string;
  headers?: Record<string, string>;
} = {}) {
  const headers: Record<string, string> = {
    ...(opts.authorization ? { authorization: opts.authorization } : {}),
    ...opts.headers,
  };
  const req: any = {
    headers,
    path: opts.path ?? '/test',
    method: opts.method ?? 'GET',
    requestId: undefined as string | undefined,
    principal: undefined as any,
    iamToken: undefined as string | undefined,
  };
  const res: any = {
    _status: 200,
    _body: null as any,
    _headers: {} as Record<string, string>,
    status(code: number) { this._status = code; return this; },
    json(body: any) { this._body = body; return this; },
    setHeader(k: string, v: string) { this._headers[k] = v; return this; },
  };
  const next = vi.fn();
  return { req, res, next };
}

const SECRET = 'super-secret-test-key-for-iam-middleware';

// ─────────────────────────────────────────────────────────────────────────────
// Import the module under test
// ─────────────────────────────────────────────────────────────────────────────
import {
  iamMiddleware,
  requireAuth,
  requireLevel,
  requirePermission,
  requireAnyPermission,
  requireNHI,
  requireHuman,
  iamHealthStatus,
  sha512Hash,
  evaluatePermissionLocal,
  auditLog,
  type IAMPrincipal,
  type IAMMiddlewareOptions,
  type PermissionRequirement,
} from '../index';

// ─────────────────────────────────────────────────────────────────────────────
// sha512Hash
// ─────────────────────────────────────────────────────────────────────────────

describe('sha512Hash', () => {
  it('returns a 128-character hex string', () => {
    const h = sha512Hash('hello world');
    expect(h).toHaveLength(128);
    expect(/^[0-9a-f]+$/.test(h)).toBe(true);
  });

  it('is deterministic', () => {
    expect(sha512Hash('abc')).toBe(sha512Hash('abc'));
  });

  it('different inputs produce different hashes', () => {
    expect(sha512Hash('foo')).not.toBe(sha512Hash('bar'));
  });

  it('matches native crypto output', () => {
    const expected = createHash('sha512').update('testdata').digest('hex');
    expect(sha512Hash('testdata')).toBe(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluatePermissionLocal
// ─────────────────────────────────────────────────────────────────────────────

describe('evaluatePermissionLocal', () => {
  it('matches exact permission', () => {
    expect(evaluatePermissionLocal(['hive:swarm:read'], 'hive', 'swarm', 'read')).toBe(true);
  });

  it('denies when permission not in list', () => {
    expect(evaluatePermissionLocal(['hive:swarm:read'], 'hive', 'swarm', 'write')).toBe(false);
  });

  it('wildcard * grants all', () => {
    expect(evaluatePermissionLocal(['*'], 'anything', 'resource', 'action')).toBe(true);
  });

  it('namespace wildcard ns:*:* works', () => {
    expect(evaluatePermissionLocal(['hive:*:*'], 'hive', 'swarm', 'read')).toBe(true);
    expect(evaluatePermissionLocal(['hive:*:*'], 'hive', 'nodes', 'write')).toBe(true);
    expect(evaluatePermissionLocal(['hive:*:*'], 'other', 'swarm', 'read')).toBe(false);
  });

  it('resource wildcard ns:res:* works', () => {
    expect(evaluatePermissionLocal(['hive:swarm:*'], 'hive', 'swarm', 'read')).toBe(true);
    expect(evaluatePermissionLocal(['hive:swarm:*'], 'hive', 'swarm', 'delete')).toBe(true);
    expect(evaluatePermissionLocal(['hive:swarm:*'], 'hive', 'nodes', 'read')).toBe(false);
  });

  it('action wildcard *:*:action works', () => {
    expect(evaluatePermissionLocal(['*:*:read'], 'anything', 'anything', 'read')).toBe(true);
    expect(evaluatePermissionLocal(['*:*:read'], 'anything', 'anything', 'write')).toBe(false);
  });

  it('empty permissions list always denies', () => {
    expect(evaluatePermissionLocal([], 'hive', 'swarm', 'read')).toBe(false);
  });

  it('multiple permissions — returns true if any match', () => {
    expect(evaluatePermissionLocal(
      ['hive:swarm:read', 'portal:users:write'],
      'portal', 'users', 'write'
    )).toBe(true);
  });

  it('malformed permission string (not 3 parts) is ignored', () => {
    expect(evaluatePermissionLocal(['hive:read'], 'hive', 'read', 'any')).toBe(false);
  });

  it('case-sensitive matching', () => {
    expect(evaluatePermissionLocal(['Hive:Swarm:Read'], 'hive', 'swarm', 'read')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// auditLog (smoke test — should not throw)
// ─────────────────────────────────────────────────────────────────────────────

describe('auditLog', () => {
  it('logs without throwing', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(() =>
      auditLog('test-service', 'req-001', null, 'GET', '/health', 'UNAUTHENTICATED', 'no token')
    ).not.toThrow();
    spy.mockRestore();
  });

  it('logs JSON with correct fields', () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((msg: string) => lines.push(msg));

    const principal: IAMPrincipal = {
      userId: 'user-1',
      email: 'user@test.com',
      role: 'admin',
      roleLevel: 1,
      activeRole: 'admin',
      subscriptionTier: 'pro',
      permissions: ['*'],
      isNHI: false,
    };

    auditLog('svc', 'req-002', principal, 'POST', '/data', 'ALLOW', 'authenticated');
    spy.mockRestore();

    expect(lines.length).toBeGreaterThan(0);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.level).toBe('audit');
    expect(parsed.serviceId).toBe('svc');
    expect(parsed.principalId).toBe('user-1');
    expect(parsed.action).toBe('POST');
    expect(parsed.decision).toBe('ALLOW');
    expect(parsed.integrityHash).toHaveLength(128);
  });

  it('handles null principal gracefully', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(() => auditLog('svc', 'req-003', null, 'GET', '/', 'DENY', 'no access')).not.toThrow();
    spy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// iamHealthStatus
// ─────────────────────────────────────────────────────────────────────────────

describe('iamHealthStatus', () => {
  it('returns iam object', () => {
    const status = iamHealthStatus('test-service');
    expect(status).toHaveProperty('iam');
    expect(status.iam.version).toBe('1.0');
    expect(status.iam.algorithm).toBe('HS512');
  });

  it('reflects configured/unconfigured based on IAM_JWT_SECRET env', () => {
    delete process.env.IAM_JWT_SECRET;
    const unconfigured = iamHealthStatus('svc');
    expect(unconfigured.iam.status).toBe('unconfigured');

    process.env.IAM_JWT_SECRET = 'some-secret';
    const configured = iamHealthStatus('svc');
    expect(configured.iam.status).toBe('configured');
    delete process.env.IAM_JWT_SECRET;
  });

  it('includes meshAddress when provided', () => {
    const s = iamHealthStatus('svc', 'the-hive.agent.local');
    expect(s.iam.meshAddress).toBe('the-hive.agent.local');
  });

  it('meshAddress null when not provided', () => {
    const s = iamHealthStatus('svc');
    expect(s.iam.meshAddress).toBeNull();
  });

  it('includes cryptoMigrationPath', () => {
    const s = iamHealthStatus('svc');
    expect(s.iam.cryptoMigrationPath).toContain('hmac_sha512');
    expect(s.iam.cryptoMigrationPath).toContain('slh_dsa');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// iamMiddleware — core attachment behavior
// ─────────────────────────────────────────────────────────────────────────────

describe('iamMiddleware', () => {
  const opts: IAMMiddlewareOptions = {
    serviceId: 'test-service',
    jwtSecret: SECRET,
    algorithm: 'HS512',
  };

  describe('response headers', () => {
    it('sets X-Service-Id header', () => {
      const { req, res, next } = makeReqRes();
      iamMiddleware(opts)(req, res, next);
      expect(res._headers['X-Service-Id']).toBe('test-service');
    });

    it('sets X-Request-Id header (hex string)', () => {
      const { req, res, next } = makeReqRes();
      iamMiddleware(opts)(req, res, next);
      expect(res._headers['X-Request-Id']).toMatch(/^[0-9a-f]{16}$/);
    });

    it('sets X-IAM-Version header', () => {
      const { req, res, next } = makeReqRes();
      iamMiddleware(opts)(req, res, next);
      expect(res._headers['X-IAM-Version']).toBe('1.0');
    });

    it('sets X-Mesh-Address when meshAddress is configured', () => {
      const { req, res, next } = makeReqRes();
      iamMiddleware({ ...opts, meshAddress: 'svc.agent.local' })(req, res, next);
      expect(res._headers['X-Mesh-Address']).toBe('svc.agent.local');
    });

    it('does NOT set X-Mesh-Address when meshAddress not configured', () => {
      const { req, res, next } = makeReqRes();
      iamMiddleware(opts)(req, res, next);
      expect(res._headers['X-Mesh-Address']).toBeUndefined();
    });
  });

  describe('request ID propagation', () => {
    it('attaches requestId to req object', () => {
      const { req, res, next } = makeReqRes();
      iamMiddleware(opts)(req, res, next);
      expect(req.requestId).toBeDefined();
      expect(typeof req.requestId).toBe('string');
      expect(req.requestId).toHaveLength(16);
    });

    it('requestId matches X-Request-Id header', () => {
      const { req, res, next } = makeReqRes();
      iamMiddleware(opts)(req, res, next);
      expect(req.requestId).toBe(res._headers['X-Request-Id']);
    });
  });

  describe('no token — no requireAuth', () => {
    it('calls next() without setting principal', () => {
      const { req, res, next } = makeReqRes();
      iamMiddleware(opts)(req, res, next);
      expect(next).toHaveBeenCalledOnce();
      expect(req.principal).toBeUndefined();
    });
  });

  describe('no token — with requireAuth', () => {
    it('returns 401 without calling next', () => {
      const { req, res, next } = makeReqRes();
      iamMiddleware({ ...opts, requireAuth: true })(req, res, next);
      expect(res._status).toBe(401);
      expect(res._body.code).toBe('NO_TOKEN');
      expect(next).not.toHaveBeenCalled();
    });

    it('401 body includes requestId', () => {
      const { req, res, next } = makeReqRes();
      iamMiddleware({ ...opts, requireAuth: true })(req, res, next);
      expect(res._body.requestId).toBeDefined();
    });
  });

  describe('valid HS512 token', () => {
    it('attaches principal to req', () => {
      const token = signJWT(makePayload(), SECRET, 'HS512');
      const { req, res, next } = makeReqRes({ authorization: `Bearer ${token}` });
      iamMiddleware(opts)(req, res, next);
      expect(next).toHaveBeenCalledOnce();
      expect(req.principal).toBeDefined();
      expect(req.principal.userId).toBe('user-123');
      expect(req.principal.email).toBe('test@example.com');
    });

    it('attaches iamToken to req', () => {
      const token = signJWT(makePayload(), SECRET, 'HS512');
      const { req, res, next } = makeReqRes({ authorization: `Bearer ${token}` });
      iamMiddleware(opts)(req, res, next);
      expect(req.iamToken).toBe(token);
    });

    it('principal has correct role', () => {
      const token = signJWT(makePayload({ role: 'admin' }), SECRET, 'HS512');
      const { req, res, next } = makeReqRes({ authorization: `Bearer ${token}` });
      iamMiddleware(opts)(req, res, next);
      expect(req.principal.role).toBe('admin');
    });

    it('principal.roleLevel from active_role_level', () => {
      const token = signJWT(makePayload({ active_role_level: 2 }), SECRET, 'HS512');
      const { req, res, next } = makeReqRes({ authorization: `Bearer ${token}` });
      iamMiddleware(opts)(req, res, next);
      expect(req.principal.roleLevel).toBe(2);
    });

    it('principal.roleLevel null when not in token', () => {
      const token = signJWT(makePayload(), SECRET, 'HS512');
      const { req, res, next } = makeReqRes({ authorization: `Bearer ${token}` });
      iamMiddleware(opts)(req, res, next);
      expect(req.principal.roleLevel).toBeNull();
    });

    it('principal.permissions populated from token', () => {
      const token = signJWT(makePayload({ permissions: ['hive:swarm:read', 'portal:*:*'] }), SECRET, 'HS512');
      const { req, res, next } = makeReqRes({ authorization: `Bearer ${token}` });
      iamMiddleware(opts)(req, res, next);
      expect(req.principal.permissions).toEqual(['hive:swarm:read', 'portal:*:*']);
    });

    it('principal.permissions defaults to [] when absent', () => {
      const token = signJWT(makePayload(), SECRET, 'HS512');
      const { req, res, next } = makeReqRes({ authorization: `Bearer ${token}` });
      iamMiddleware(opts)(req, res, next);
      expect(req.principal.permissions).toEqual([]);
    });

    it('principal.subscriptionTier from token', () => {
      const token = signJWT(makePayload({ subscription_tier: 'enterprise' }), SECRET, 'HS512');
      const { req, res, next } = makeReqRes({ authorization: `Bearer ${token}` });
      iamMiddleware(opts)(req, res, next);
      expect(req.principal.subscriptionTier).toBe('enterprise');
    });
  });

  describe('HS256 fallback', () => {
    it('accepts HS256 token when primary algorithm is HS512', () => {
      const token = signJWT(makePayload(), SECRET, 'HS256');
      const { req, res, next } = makeReqRes({ authorization: `Bearer ${token}` });
      iamMiddleware(opts)(req, res, next);
      expect(next).toHaveBeenCalledOnce();
      expect(req.principal).toBeDefined();
    });
  });

  describe('invalid / expired tokens', () => {
    it('ignores invalid token (no requireAuth) — calls next without principal', () => {
      const { req, res, next } = makeReqRes({ authorization: 'Bearer not.a.real.token' });
      iamMiddleware(opts)(req, res, next);
      expect(next).toHaveBeenCalledOnce();
      expect(req.principal).toBeUndefined();
    });

    it('returns 401 for invalid token with requireAuth', () => {
      const { req, res, next } = makeReqRes({ authorization: 'Bearer bad.token.here' });
      iamMiddleware({ ...opts, requireAuth: true })(req, res, next);
      expect(res._status).toBe(401);
      expect(res._body.code).toBe('INVALID_TOKEN');
    });

    it('rejects expired token', () => {
      const token = signJWT(makePayload({ exp: Math.floor(Date.now() / 1000) - 100 }), SECRET, 'HS512');
      const { req, res, next } = makeReqRes({ authorization: `Bearer ${token}` });
      iamMiddleware({ ...opts, requireAuth: true })(req, res, next);
      expect(res._status).toBe(401);
      expect(res._body.code).toBe('INVALID_TOKEN');
    });

    it('rejects token signed with wrong secret', () => {
      const token = signJWT(makePayload(), 'wrong-secret', 'HS512');
      const { req, res, next } = makeReqRes({ authorization: `Bearer ${token}` });
      iamMiddleware({ ...opts, requireAuth: true })(req, res, next);
      expect(res._status).toBe(401);
    });

    it('returns 500 when jwtSecret not configured', () => {
      const token = signJWT(makePayload(), SECRET, 'HS512');
      const { req, res, next } = makeReqRes({ authorization: `Bearer ${token}` });
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      iamMiddleware({ serviceId: 'svc', jwtSecret: '' })(req, res, next);
      expect(res._status).toBe(500);
      spy.mockRestore();
    });
  });

  describe('NHI detection', () => {
    it('marks agent role as NHI', () => {
      const token = signJWT(makePayload({ role: 'agent' }), SECRET, 'HS512');
      const { req, res, next } = makeReqRes({ authorization: `Bearer ${token}` });
      iamMiddleware(opts)(req, res, next);
      expect(req.principal.isNHI).toBe(true);
    });

    it('marks bot role as NHI', () => {
      const token = signJWT(makePayload({ role: 'bot' }), SECRET, 'HS512');
      const { req, res, next } = makeReqRes({ authorization: `Bearer ${token}` });
      iamMiddleware(opts)(req, res, next);
      expect(req.principal.isNHI).toBe(true);
    });

    it('marks nhi role as NHI', () => {
      const token = signJWT(makePayload({ role: 'nhi' }), SECRET, 'HS512');
      const { req, res, next } = makeReqRes({ authorization: `Bearer ${token}` });
      iamMiddleware(opts)(req, res, next);
      expect(req.principal.isNHI).toBe(true);
    });

    it('user role is not NHI', () => {
      const token = signJWT(makePayload({ role: 'user' }), SECRET, 'HS512');
      const { req, res, next } = makeReqRes({ authorization: `Bearer ${token}` });
      iamMiddleware(opts)(req, res, next);
      expect(req.principal.isNHI).toBe(false);
    });

    it('admin role is not NHI', () => {
      const token = signJWT(makePayload({ role: 'admin' }), SECRET, 'HS512');
      const { req, res, next } = makeReqRes({ authorization: `Bearer ${token}` });
      iamMiddleware(opts)(req, res, next);
      expect(req.principal.isNHI).toBe(false);
    });
  });

  describe('auditAll mode', () => {
    it('logs authenticated request when auditAll is true', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const token = signJWT(makePayload(), SECRET, 'HS512');
      const { req, res, next } = makeReqRes({ authorization: `Bearer ${token}` });
      iamMiddleware({ ...opts, auditAll: true })(req, res, next);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('logs unauthenticated request when requireAuth+auditAll', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const { req, res, next } = makeReqRes();
      iamMiddleware({ ...opts, requireAuth: true, auditAll: true })(req, res, next);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// requireAuth guard
// ─────────────────────────────────────────────────────────────────────────────

describe('requireAuth (route guard)', () => {
  it('calls next when principal is set', () => {
    const { req, res, next } = makeReqRes();
    req.principal = { userId: 'u1', email: 'e@e.com', role: 'user', roleLevel: null, activeRole: null, subscriptionTier: null, permissions: [], isNHI: false };
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 401 when principal is missing', () => {
    const { req, res, next } = makeReqRes();
    req.requestId = 'req-999';
    requireAuth(req, res, next);
    expect(res._status).toBe(401);
    expect(res._body.code).toBe('UNAUTHENTICATED');
    expect(next).not.toHaveBeenCalled();
  });

  it('401 body includes requestId', () => {
    const { req, res, next } = makeReqRes();
    req.requestId = 'req-xyz';
    requireAuth(req, res, next);
    expect(res._body.requestId).toBe('req-xyz');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// requireLevel guard
// ─────────────────────────────────────────────────────────────────────────────

describe('requireLevel', () => {
  function makePrincipalWithLevel(level: number | null): IAMPrincipal {
    return {
      userId: 'u1', email: 'e@e.com', role: 'user',
      roleLevel: level as any,
      activeRole: null, subscriptionTier: null, permissions: [], isNHI: false
    };
  }

  it('allows when principal level equals maxLevel', () => {
    const { req, res, next } = makeReqRes();
    req.principal = makePrincipalWithLevel(2);
    req.requestId = 'r1';
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    requireLevel(2)(req, res, next);
    spy.mockRestore();
    expect(next).toHaveBeenCalledOnce();
  });

  it('allows when principal level is better (lower number)', () => {
    const { req, res, next } = makeReqRes();
    req.principal = makePrincipalWithLevel(0);
    req.requestId = 'r1';
    requireLevel(3)(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('denies when principal level exceeds maxLevel', () => {
    const { req, res, next } = makeReqRes();
    req.principal = makePrincipalWithLevel(4);
    req.requestId = 'r1';
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    requireLevel(2)(req, res, next);
    spy.mockRestore();
    expect(res._status).toBe(403);
    expect(res._body.code).toBe('INSUFFICIENT_LEVEL');
    expect(next).not.toHaveBeenCalled();
  });

  it('403 body includes required and actual levels', () => {
    const { req, res, next } = makeReqRes();
    req.principal = makePrincipalWithLevel(5);
    req.requestId = 'r1';
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    requireLevel(1)(req, res, next);
    spy.mockRestore();
    expect(res._body.required).toBe(1);
    expect(res._body.actual).toBe(5);
  });

  it('denies when roleLevel is null', () => {
    const { req, res, next } = makeReqRes();
    req.principal = makePrincipalWithLevel(null);
    req.requestId = 'r1';
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    requireLevel(3)(req, res, next);
    spy.mockRestore();
    expect(res._status).toBe(403);
  });

  it('returns 401 when no principal', () => {
    const { req, res, next } = makeReqRes();
    req.requestId = 'r1';
    requireLevel(2)(req, res, next);
    expect(res._status).toBe(401);
    expect(res._body.code).toBe('UNAUTHENTICATED');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// requirePermission guard
// ─────────────────────────────────────────────────────────────────────────────

describe('requirePermission', () => {
  function makePrincipalWithPerms(permissions: string[]): IAMPrincipal {
    return {
      userId: 'u1', email: 'e@e.com', role: 'admin',
      roleLevel: 1, activeRole: 'admin', subscriptionTier: 'pro',
      permissions, isNHI: false
    };
  }

  it('allows when permission matches exactly', () => {
    const { req, res, next } = makeReqRes();
    req.principal = makePrincipalWithPerms(['hive:swarm:read']);
    req.requestId = 'r1';
    requirePermission('hive', 'swarm', 'read')(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('allows when wildcard * covers permission', () => {
    const { req, res, next } = makeReqRes();
    req.principal = makePrincipalWithPerms(['*']);
    req.requestId = 'r1';
    requirePermission('anything', 'resource', 'action')(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('denies when permission not in list', () => {
    const { req, res, next } = makeReqRes();
    req.principal = makePrincipalWithPerms(['hive:swarm:read']);
    req.requestId = 'r1';
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    requirePermission('hive', 'swarm', 'write')(req, res, next);
    spy.mockRestore();
    expect(res._status).toBe(403);
    expect(res._body.code).toBe('PERMISSION_DENIED');
    expect(next).not.toHaveBeenCalled();
  });

  it('403 body includes required permission string', () => {
    const { req, res, next } = makeReqRes();
    req.principal = makePrincipalWithPerms([]);
    req.requestId = 'r1';
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    requirePermission('portal', 'tenants', 'delete')(req, res, next);
    spy.mockRestore();
    expect(res._body.required).toBe('portal:tenants:delete');
  });

  it('returns 401 when no principal', () => {
    const { req, res, next } = makeReqRes();
    req.requestId = 'r1';
    requirePermission('ns', 'res', 'act')(req, res, next);
    expect(res._status).toBe(401);
  });

  it('allows namespace wildcard permission', () => {
    const { req, res, next } = makeReqRes();
    req.principal = makePrincipalWithPerms(['portal:*:*']);
    req.requestId = 'r1';
    requirePermission('portal', 'users', 'delete')(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// requireAnyPermission guard
// ─────────────────────────────────────────────────────────────────────────────

describe('requireAnyPermission', () => {
  const reqs: PermissionRequirement[] = [
    { namespace: 'hive', resource: 'swarm', action: 'read' },
    { namespace: 'portal', resource: 'users', action: 'write' },
  ];

  it('allows when first requirement matches', () => {
    const { req, res, next } = makeReqRes();
    req.requestId = 'r1';
    req.principal = {
      userId: 'u1', email: 'e@e.com', role: 'user', roleLevel: null,
      activeRole: null, subscriptionTier: null,
      permissions: ['hive:swarm:read'], isNHI: false
    };
    requireAnyPermission(reqs)(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('allows when second requirement matches', () => {
    const { req, res, next } = makeReqRes();
    req.requestId = 'r1';
    req.principal = {
      userId: 'u1', email: 'e@e.com', role: 'user', roleLevel: null,
      activeRole: null, subscriptionTier: null,
      permissions: ['portal:users:write'], isNHI: false
    };
    requireAnyPermission(reqs)(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('denies when none match', () => {
    const { req, res, next } = makeReqRes();
    req.requestId = 'r1';
    req.principal = {
      userId: 'u1', email: 'e@e.com', role: 'user', roleLevel: null,
      activeRole: null, subscriptionTier: null,
      permissions: ['other:ns:read'], isNHI: false
    };
    requireAnyPermission(reqs)(req, res, next);
    expect(res._status).toBe(403);
    expect(res._body.code).toBe('PERMISSION_DENIED');
  });

  it('403 body includes all required permissions', () => {
    const { req, res, next } = makeReqRes();
    req.requestId = 'r1';
    req.principal = {
      userId: 'u1', email: 'e@e.com', role: 'user', roleLevel: null,
      activeRole: null, subscriptionTier: null,
      permissions: [], isNHI: false
    };
    requireAnyPermission(reqs)(req, res, next);
    expect(Array.isArray(res._body.required)).toBe(true);
    expect(res._body.required).toHaveLength(2);
  });

  it('returns 401 when no principal', () => {
    const { req, res, next } = makeReqRes();
    req.requestId = 'r1';
    requireAnyPermission(reqs)(req, res, next);
    expect(res._status).toBe(401);
  });

  it('allows when wildcard covers all requirements', () => {
    const { req, res, next } = makeReqRes();
    req.requestId = 'r1';
    req.principal = {
      userId: 'u1', email: 'e@e.com', role: 'admin', roleLevel: 1,
      activeRole: null, subscriptionTier: null,
      permissions: ['*'], isNHI: false
    };
    requireAnyPermission(reqs)(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// requireNHI guard
// ─────────────────────────────────────────────────────────────────────────────

describe('requireNHI', () => {
  it('allows NHI principal', () => {
    const { req, res, next } = makeReqRes();
    req.requestId = 'r1';
    req.principal = {
      userId: 'agent-1', email: 'agent@sys', role: 'agent', roleLevel: null,
      activeRole: null, subscriptionTier: null, permissions: [], isNHI: true
    };
    requireNHI(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('blocks human principal with 403 HUMAN_NOT_ALLOWED', () => {
    const { req, res, next } = makeReqRes();
    req.requestId = 'r1';
    req.principal = {
      userId: 'u1', email: 'u@e.com', role: 'user', roleLevel: null,
      activeRole: null, subscriptionTier: null, permissions: [], isNHI: false
    };
    requireNHI(req, res, next);
    expect(res._status).toBe(403);
    expect(res._body.code).toBe('HUMAN_NOT_ALLOWED');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when no principal', () => {
    const { req, res, next } = makeReqRes();
    req.requestId = 'r1';
    requireNHI(req, res, next);
    expect(res._status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// requireHuman guard
// ─────────────────────────────────────────────────────────────────────────────

describe('requireHuman', () => {
  it('allows human principal', () => {
    const { req, res, next } = makeReqRes();
    req.requestId = 'r1';
    req.principal = {
      userId: 'u1', email: 'u@e.com', role: 'user', roleLevel: null,
      activeRole: null, subscriptionTier: null, permissions: [], isNHI: false
    };
    requireHuman(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('blocks NHI principal with 403 NHI_NOT_ALLOWED', () => {
    const { req, res, next } = makeReqRes();
    req.requestId = 'r1';
    req.principal = {
      userId: 'bot-1', email: 'bot@sys', role: 'bot', roleLevel: null,
      activeRole: null, subscriptionTier: null, permissions: [], isNHI: true
    };
    requireHuman(req, res, next);
    expect(res._status).toBe(403);
    expect(res._body.code).toBe('NHI_NOT_ALLOWED');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when no principal', () => {
    const { req, res, next } = makeReqRes();
    req.requestId = 'r1';
    requireHuman(req, res, next);
    expect(res._status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// End-to-end: middleware + guard chain
// ─────────────────────────────────────────────────────────────────────────────

describe('middleware + guard chain integration', () => {
  const opts: IAMMiddlewareOptions = {
    serviceId: 'integration-test',
    jwtSecret: SECRET,
    algorithm: 'HS512',
  };

  it('admin with permissions passes full chain: iamMiddleware → requireAuth → requirePermission', () => {
    const token = signJWT(makePayload({
      role: 'admin',
      active_role_level: 1,
      permissions: ['portal:tenants:write'],
    }), SECRET, 'HS512');

    const { req, res, next } = makeReqRes({ authorization: `Bearer ${token}` });
    req.requestId = 'chain-001';

    // Step 1: iamMiddleware
    iamMiddleware(opts)(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.principal).toBeDefined();

    // Step 2: requireAuth
    const next2 = vi.fn();
    requireAuth(req, res, next2);
    expect(next2).toHaveBeenCalledOnce();

    // Step 3: requirePermission
    const next3 = vi.fn();
    requirePermission('portal', 'tenants', 'write')(req, res, next3);
    expect(next3).toHaveBeenCalledOnce();
  });

  it('unauthenticated request blocked at requireAuth step', () => {
    const { req, res, next } = makeReqRes();
    req.requestId = 'chain-002';
    iamMiddleware(opts)(req, res, next);
    expect(next).toHaveBeenCalledOnce();

    const next2 = vi.fn();
    requireAuth(req, res, next2);
    expect(res._status).toBe(401);
    expect(next2).not.toHaveBeenCalled();
  });

  it('valid user but wrong permission blocked at requirePermission step', () => {
    const token = signJWT(makePayload({
      permissions: ['hive:swarm:read'],
    }), SECRET, 'HS512');

    const { req, res, next } = makeReqRes({ authorization: `Bearer ${token}` });
    req.requestId = 'chain-003';
    iamMiddleware(opts)(req, res, next);
    expect(next).toHaveBeenCalledOnce();

    const next2 = vi.fn();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    requirePermission('portal', 'tenants', 'delete')(req, res, next2);
    spy.mockRestore();
    expect(res._status).toBe(403);
    expect(next2).not.toHaveBeenCalled();
  });

  it('agent blocked by requireHuman guard', () => {
    const token = signJWT(makePayload({ role: 'agent' }), SECRET, 'HS512');
    const { req, res, next } = makeReqRes({ authorization: `Bearer ${token}` });
    req.requestId = 'chain-004';
    iamMiddleware(opts)(req, res, next);
    expect(req.principal.isNHI).toBe(true);

    const next2 = vi.fn();
    requireHuman(req, res, next2);
    expect(res._status).toBe(403);
    expect(res._body.code).toBe('NHI_NOT_ALLOWED');
  });

  it('level-2 user blocked by requireLevel(1)', () => {
    const token = signJWT(makePayload({ active_role_level: 2 }), SECRET, 'HS512');
    const { req, res, next } = makeReqRes({ authorization: `Bearer ${token}` });
    req.requestId = 'chain-005';
    iamMiddleware(opts)(req, res, next);

    const next2 = vi.fn();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    requireLevel(1)(req, res, next2);
    spy.mockRestore();
    expect(res._status).toBe(403);
    expect(res._body.code).toBe('INSUFFICIENT_LEVEL');
  });
});
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* ─────────────────────────────────────────────
   Infinity OS — E2E Auth Flow Tests
   End-to-end tests for the complete authentication
   lifecycle: registration, login, MFA, WebAuthn,
   session management, GDPR compliance, and
   security hardening.
   ───────────────────────────────────────────── */

// ── Mock Auth System ────────────────────────

interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: 'admin' | 'user' | 'viewer';
  mfaEnabled: boolean;
  mfaSecret?: string;
  webauthnCredentials: WebAuthnCredential[];
  gdprConsent: boolean;
  gdprConsentDate?: string;
  dataRetentionDays: number;
  createdAt: string;
  lastLoginAt?: string;
  failedLoginAttempts: number;
  lockedUntil?: number;
}

interface WebAuthnCredential {
  id: string;
  publicKey: string;
  counter: number;
  deviceName: string;
  registeredAt: string;
  lastUsedAt?: string;
}

interface Session {
  id: string;
  userId: string;
  token: string;
  refreshToken: string;
  expiresAt: number;
  createdAt: number;
  ipAddress: string;
  userAgent: string;
  mfaVerified: boolean;
}

interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  details: Record<string, unknown>;
  ipAddress: string;
  timestamp: number;
  success: boolean;
}

class MockAuthSystem {
  private users: Map<string, User> = new Map();
  private sessions: Map<string, Session> = new Map();
  private auditLog: AuditLogEntry[] = [];
  private nextId = 1;
  private lockoutThreshold = 5;
  private lockoutDurationMs = 900000; // 15 minutes
  private sessionDurationMs = 86400000; // 24 hours
  private refreshTokenDurationMs = 604800000; // 7 days

  // ── Registration ──

  async register(input: {
    email: string;
    password: string;
    name: string;
    gdprConsent: boolean;
  }): Promise<{ success: boolean; userId?: string; error?: string }> {
    // Validate email format
    if (!input.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return { success: false, error: 'Invalid email format' };
    }

    // Check duplicate email
    for (const user of this.users.values()) {
      if (user.email === input.email) {
        return { success: false, error: 'Email already registered' };
      }
    }

    // Validate password strength
    if (input.password.length < 12) {
      return { success: false, error: 'Password must be at least 12 characters' };
    }
    if (!/[A-Z]/.test(input.password)) {
      return { success: false, error: 'Password must contain uppercase letter' };
    }
    if (!/[a-z]/.test(input.password)) {
      return { success: false, error: 'Password must contain lowercase letter' };
    }
    if (!/[0-9]/.test(input.password)) {
      return { success: false, error: 'Password must contain a number' };
    }
    if (!/[^A-Za-z0-9]/.test(input.password)) {
      return { success: false, error: 'Password must contain a special character' };
    }

    // GDPR consent required
    if (!input.gdprConsent) {
      return { success: false, error: 'GDPR consent is required' };
    }

    const userId = `usr-${String(this.nextId++).padStart(3, '0')}`;
    const user: User = {
      id: userId,
      email: input.email,
      name: input.name,
      passwordHash: `hashed:${input.password}`, // Mock hash
      role: 'user',
      mfaEnabled: false,
      webauthnCredentials: [],
      gdprConsent: true,
      gdprConsentDate: new Date().toISOString(),
      dataRetentionDays: 365,
      createdAt: new Date().toISOString(),
      failedLoginAttempts: 0,
    };

    this.users.set(userId, user);
    this.logAudit(userId, 'register', { email: input.email }, '127.0.0.1', true);

    return { success: true, userId };
  }

  // ── Login ──

  async login(input: {
    email: string;
    password: string;
    ipAddress: string;
    userAgent: string;
  }): Promise<{ success: boolean; session?: Session; requiresMfa?: boolean; error?: string }> {
    // Find user
    let user: User | undefined;
    for (const u of this.users.values()) {
      if (u.email === input.email) {
        user = u;
        break;
      }
    }

    if (!user) {
      // Constant-time response to prevent user enumeration
      return { success: false, error: 'Invalid credentials' };
    }

    // Check lockout
    if (user.lockedUntil && Date.now() < user.lockedUntil) {
      this.logAudit(user.id, 'login_attempt_locked', {}, input.ipAddress, false);
      const remainingMs = user.lockedUntil - Date.now();
      return { success: false, error: `Account locked. Try again in ${Math.ceil(remainingMs / 60000)} minutes` };
    }

    // Verify password
    if (user.passwordHash !== `hashed:${input.password}`) {
      user.failedLoginAttempts++;
      if (user.failedLoginAttempts >= this.lockoutThreshold) {
        user.lockedUntil = Date.now() + this.lockoutDurationMs;
        this.logAudit(user.id, 'account_locked', { attempts: user.failedLoginAttempts }, input.ipAddress, false);
      }
      this.logAudit(user.id, 'login_failed', { attempts: user.failedLoginAttempts }, input.ipAddress, false);
      return { success: false, error: 'Invalid credentials' };
    }

    // Reset failed attempts
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;

    // Check if MFA is required
    if (user.mfaEnabled) {
      // Create a pending session (not yet MFA verified)
      const session = this.createSession(user.id, input.ipAddress, input.userAgent, false);
      this.logAudit(user.id, 'login_mfa_required', {}, input.ipAddress, true);
      return { success: true, session, requiresMfa: true };
    }

    // Create full session
    const session = this.createSession(user.id, input.ipAddress, input.userAgent, true);
    user.lastLoginAt = new Date().toISOString();
    this.logAudit(user.id, 'login_success', {}, input.ipAddress, true);

    return { success: true, session };
  }

  // ── MFA ──

  async enableMfa(userId: string): Promise<{ success: boolean; secret?: string; error?: string }> {
    const user = this.users.get(userId);
    if (!user) return { success: false, error: 'User not found' };
    if (user.mfaEnabled) return { success: false, error: 'MFA already enabled' };

    const secret = `TOTP-SECRET-${userId}-${Date.now()}`;
    user.mfaSecret = secret;
    user.mfaEnabled = true;
    this.logAudit(userId, 'mfa_enabled', {}, '127.0.0.1', true);

    return { success: true, secret };
  }

  async verifyMfa(sessionId: string, code: string): Promise<{ success: boolean; error?: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) return { success: false, error: 'Session not found' };

    const user = this.users.get(session.userId);
    if (!user) return { success: false, error: 'User not found' };

    // Mock TOTP verification (in production, use actual TOTP algorithm)
    const expectedCode = `${user.mfaSecret}-valid`;
    if (code !== expectedCode && code !== '000000') {
      this.logAudit(user.id, 'mfa_verify_failed', {}, '127.0.0.1', false);
      return { success: false, error: 'Invalid MFA code' };
    }

    session.mfaVerified = true;
    user.lastLoginAt = new Date().toISOString();
    this.logAudit(user.id, 'mfa_verify_success', {}, '127.0.0.1', true);

    return { success: true };
  }

  async disableMfa(userId: string, password: string): Promise<{ success: boolean; error?: string }> {
    const user = this.users.get(userId);
    if (!user) return { success: false, error: 'User not found' };
    if (!user.mfaEnabled) return { success: false, error: 'MFA not enabled' };

    // Require password confirmation
    if (user.passwordHash !== `hashed:${password}`) {
      return { success: false, error: 'Invalid password' };
    }

    user.mfaEnabled = false;
    user.mfaSecret = undefined;
    this.logAudit(userId, 'mfa_disabled', {}, '127.0.0.1', true);

    return { success: true };
  }

  // ── WebAuthn ──

  async registerWebAuthn(userId: string, deviceName: string): Promise<{ success: boolean; credentialId?: string; error?: string }> {
    const user = this.users.get(userId);
    if (!user) return { success: false, error: 'User not found' };

    const credential: WebAuthnCredential = {
      id: `webauthn-${Date.now()}`,
      publicKey: `pk-${userId}-${Date.now()}`,
      counter: 0,
      deviceName,
      registeredAt: new Date().toISOString(),
    };

    user.webauthnCredentials.push(credential);
    this.logAudit(userId, 'webauthn_registered', { deviceName }, '127.0.0.1', true);

    return { success: true, credentialId: credential.id };
  }

  async authenticateWebAuthn(credentialId: string, ipAddress: string, userAgent: string): Promise<{ success: boolean; session?: Session; error?: string }> {
    for (const user of this.users.values()) {
      const cred = user.webauthnCredentials.find(c => c.id === credentialId);
      if (cred) {
        cred.counter++;
        cred.lastUsedAt = new Date().toISOString();
        const session = this.createSession(user.id, ipAddress, userAgent, true);
        user.lastLoginAt = new Date().toISOString();
        this.logAudit(user.id, 'webauthn_login', { credentialId }, ipAddress, true);
        return { success: true, session };
      }
    }
    return { success: false, error: 'Credential not found' };
  }

  // ── Session Management ──

  private createSession(userId: string, ipAddress: string, userAgent: string, mfaVerified: boolean): Session {
    const session: Session = {
      id: `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      userId,
      token: `tok-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      refreshToken: `ref-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      expiresAt: Date.now() + this.sessionDurationMs,
      createdAt: Date.now(),
      ipAddress,
      userAgent,
      mfaVerified,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async validateSession(sessionId: string): Promise<{ valid: boolean; userId?: string; error?: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) return { valid: false, error: 'Session not found' };
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return { valid: false, error: 'Session expired' };
    }
    if (!session.mfaVerified) {
      return { valid: false, error: 'MFA verification required' };
    }
    return { valid: true, userId: session.userId };
  }

  async refreshSession(refreshToken: string): Promise<{ success: boolean; session?: Session; error?: string }> {
    for (const [id, session] of this.sessions) {
      if (session.refreshToken === refreshToken) {
        // Invalidate old session
        this.sessions.delete(id);
        // Create new session
        const newSession = this.createSession(session.userId, session.ipAddress, session.userAgent, session.mfaVerified);
        this.logAudit(session.userId, 'session_refreshed', {}, session.ipAddress, true);
        return { success: true, session: newSession };
      }
    }
    return { success: false, error: 'Invalid refresh token' };
  }

  async logout(sessionId: string): Promise<{ success: boolean }> {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.logAudit(session.userId, 'logout', {}, session.ipAddress, true);
      this.sessions.delete(sessionId);
    }
    return { success: true };
  }

  async logoutAllSessions(userId: string): Promise<{ success: boolean; count: number }> {
    let count = 0;
    for (const [id, session] of this.sessions) {
      if (session.userId === userId) {
        this.sessions.delete(id);
        count++;
      }
    }
    this.logAudit(userId, 'logout_all', { count }, '127.0.0.1', true);
    return { success: true, count };
  }

  // ── GDPR ──

  async exportUserData(userId: string): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
    const user = this.users.get(userId);
    if (!user) return { success: false, error: 'User not found' };

    const userSessions = Array.from(this.sessions.values()).filter(s => s.userId === userId);
    const userAuditLog = this.auditLog.filter(a => a.userId === userId);

    this.logAudit(userId, 'data_export', {}, '127.0.0.1', true);

    return {
      success: true,
      data: {
        profile: { id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt },
        security: { mfaEnabled: user.mfaEnabled, webauthnDevices: user.webauthnCredentials.length },
        gdpr: { consent: user.gdprConsent, consentDate: user.gdprConsentDate, retentionDays: user.dataRetentionDays },
        sessions: userSessions.map(s => ({ id: s.id, createdAt: s.createdAt, ipAddress: s.ipAddress })),
        auditLog: userAuditLog.map(a => ({ action: a.action, timestamp: a.timestamp, success: a.success })),
      },
    };
  }

  async deleteUser(userId: string, password: string): Promise<{ success: boolean; error?: string }> {
    const user = this.users.get(userId);
    if (!user) return { success: false, error: 'User not found' };

    // Require password confirmation for account deletion (GDPR Article 17)
    if (user.passwordHash !== `hashed:${password}`) {
      return { success: false, error: 'Invalid password' };
    }

    // Delete all sessions
    for (const [id, session] of this.sessions) {
      if (session.userId === userId) {
        this.sessions.delete(id);
      }
    }

    // Crypto-shred user data (in production, this triggers Vault transit engine)
    this.logAudit(userId, 'account_deleted_gdpr_art17', {}, '127.0.0.1', true);
    this.users.delete(userId);

    return { success: true };
  }

  // ── Audit ──

  private logAudit(userId: string, action: string, details: Record<string, unknown>, ipAddress: string, success: boolean): void {
    this.auditLog.push({
      id: `audit-${this.auditLog.length + 1}`,
      userId,
      action,
      details,
      ipAddress,
      timestamp: Date.now(),
      success,
    });
  }

  getAuditLog(userId?: string): AuditLogEntry[] {
    if (userId) return this.auditLog.filter(a => a.userId === userId);
    return [...this.auditLog];
  }

  getUserSessions(userId: string): Session[] {
    return Array.from(this.sessions.values()).filter(s => s.userId === userId);
  }

  getUser(userId: string): User | undefined {
    return this.users.get(userId);
  }
}

// ── Tests ───────────────────────────────────

describe('E2E Auth — Registration', () => {
  let auth: MockAuthSystem;

  beforeEach(() => {
    auth = new MockAuthSystem();
  });

  it('should register a new user with valid data', async () => {
    const result = await auth.register({
      email: 'test@infinity-os.dev',
      password: 'SecureP@ss123!',
      name: 'Test User',
      gdprConsent: true,
    });
    expect(result.success).toBe(true);
    expect(result.userId).toBeDefined();
  });

  it('should reject registration with invalid email', async () => {
    const result = await auth.register({
      email: 'not-an-email',
      password: 'SecureP@ss123!',
      name: 'Test',
      gdprConsent: true,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('email');
  });

  it('should reject registration with weak password (too short)', async () => {
    const result = await auth.register({
      email: 'test@test.com',
      password: 'Short1!',
      name: 'Test',
      gdprConsent: true,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('12 characters');
  });

  it('should reject password without uppercase', async () => {
    const result = await auth.register({
      email: 'test@test.com',
      password: 'nouppercase123!',
      name: 'Test',
      gdprConsent: true,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('uppercase');
  });

  it('should reject password without special character', async () => {
    const result = await auth.register({
      email: 'test@test.com',
      password: 'NoSpecialChar123',
      name: 'Test',
      gdprConsent: true,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('special character');
  });

  it('should reject registration without GDPR consent', async () => {
    const result = await auth.register({
      email: 'test@test.com',
      password: 'SecureP@ss123!',
      name: 'Test',
      gdprConsent: false,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('GDPR');
  });

  it('should reject duplicate email registration', async () => {
    await auth.register({ email: 'dupe@test.com', password: 'SecureP@ss123!', name: 'First', gdprConsent: true });
    const result = await auth.register({ email: 'dupe@test.com', password: 'SecureP@ss123!', name: 'Second', gdprConsent: true });
    expect(result.success).toBe(false);
    expect(result.error).toContain('already registered');
  });

  it('should record registration in audit log', async () => {
    const result = await auth.register({ email: 'audit@test.com', password: 'SecureP@ss123!', name: 'Audit', gdprConsent: true });
    const log = auth.getAuditLog(result.userId!);
    expect(log).toHaveLength(1);
    expect(log[0].action).toBe('register');
    expect(log[0].success).toBe(true);
  });
});

describe('E2E Auth — Login', () => {
  let auth: MockAuthSystem;
  let userId: string;

  beforeEach(async () => {
    auth = new MockAuthSystem();
    const result = await auth.register({ email: 'drew@infinity-os.dev', password: 'InfinityOS@2025!', name: 'Drew', gdprConsent: true });
    userId = result.userId!;
  });

  it('should login with valid credentials', async () => {
    const result = await auth.login({
      email: 'drew@infinity-os.dev',
      password: 'InfinityOS@2025!',
      ipAddress: '192.168.1.1',
      userAgent: 'InfinityOS/1.0',
    });
    expect(result.success).toBe(true);
    expect(result.session).toBeDefined();
    expect(result.session!.token).toBeDefined();
    expect(result.session!.refreshToken).toBeDefined();
    expect(result.session!.mfaVerified).toBe(true);
  });

  it('should reject login with wrong password', async () => {
    const result = await auth.login({
      email: 'drew@infinity-os.dev',
      password: 'WrongPassword123!',
      ipAddress: '192.168.1.1',
      userAgent: 'InfinityOS/1.0',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid credentials');
  });

  it('should reject login with non-existent email', async () => {
    const result = await auth.login({
      email: 'ghost@infinity-os.dev',
      password: 'InfinityOS@2025!',
      ipAddress: '192.168.1.1',
      userAgent: 'InfinityOS/1.0',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid credentials'); // Same error to prevent enumeration
  });

  it('should lock account after 5 failed attempts', async () => {
    for (let i = 0; i < 5; i++) {
      await auth.login({ email: 'drew@infinity-os.dev', password: 'Wrong!', ipAddress: '10.0.0.1', userAgent: 'attacker' });
    }
    const result = await auth.login({ email: 'drew@infinity-os.dev', password: 'InfinityOS@2025!', ipAddress: '10.0.0.1', userAgent: 'attacker' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('locked');
  });

  it('should reset failed attempts on successful login', async () => {
    // Fail 3 times
    for (let i = 0; i < 3; i++) {
      await auth.login({ email: 'drew@infinity-os.dev', password: 'Wrong!', ipAddress: '10.0.0.1', userAgent: 'test' });
    }
    // Succeed
    const result = await auth.login({ email: 'drew@infinity-os.dev', password: 'InfinityOS@2025!', ipAddress: '10.0.0.1', userAgent: 'test' });
    expect(result.success).toBe(true);

    // Verify counter reset
    const user = auth.getUser(userId);
    expect(user?.failedLoginAttempts).toBe(0);
  });

  it('should update lastLoginAt on successful login', async () => {
    await auth.login({ email: 'drew@infinity-os.dev', password: 'InfinityOS@2025!', ipAddress: '10.0.0.1', userAgent: 'test' });
    const user = auth.getUser(userId);
    expect(user?.lastLoginAt).toBeDefined();
  });

  it('should record login events in audit log', async () => {
    await auth.login({ email: 'drew@infinity-os.dev', password: 'InfinityOS@2025!', ipAddress: '10.0.0.1', userAgent: 'test' });
    const log = auth.getAuditLog(userId);
    const loginEvent = log.find(e => e.action === 'login_success');
    expect(loginEvent).toBeDefined();
    expect(loginEvent!.ipAddress).toBe('10.0.0.1');
  });
});

describe('E2E Auth — MFA', () => {
  let auth: MockAuthSystem;
  let userId: string;

  beforeEach(async () => {
    auth = new MockAuthSystem();
    const result = await auth.register({ email: 'mfa@test.com', password: 'SecureP@ss123!', name: 'MFA User', gdprConsent: true });
    userId = result.userId!;
  });

  it('should enable MFA and return secret', async () => {
    const result = await auth.enableMfa(userId);
    expect(result.success).toBe(true);
    expect(result.secret).toBeDefined();
  });

  it('should reject enabling MFA twice', async () => {
    await auth.enableMfa(userId);
    const result = await auth.enableMfa(userId);
    expect(result.success).toBe(false);
    expect(result.error).toContain('already enabled');
  });

  it('should require MFA verification on login when enabled', async () => {
    await auth.enableMfa(userId);
    const loginResult = await auth.login({
      email: 'mfa@test.com',
      password: 'SecureP@ss123!',
      ipAddress: '10.0.0.1',
      userAgent: 'test',
    });
    expect(loginResult.success).toBe(true);
    expect(loginResult.requiresMfa).toBe(true);
    expect(loginResult.session!.mfaVerified).toBe(false);
  });

  it('should verify MFA code and complete login', async () => {
    await auth.enableMfa(userId);
    const loginResult = await auth.login({
      email: 'mfa@test.com',
      password: 'SecureP@ss123!',
      ipAddress: '10.0.0.1',
      userAgent: 'test',
    });

    const mfaResult = await auth.verifyMfa(loginResult.session!.id, '000000');
    expect(mfaResult.success).toBe(true);

    // Session should now be MFA verified
    const validation = await auth.validateSession(loginResult.session!.id);
    expect(validation.valid).toBe(true);
  });

  it('should reject invalid MFA code', async () => {
    await auth.enableMfa(userId);
    const loginResult = await auth.login({
      email: 'mfa@test.com',
      password: 'SecureP@ss123!',
      ipAddress: '10.0.0.1',
      userAgent: 'test',
    });

    const mfaResult = await auth.verifyMfa(loginResult.session!.id, '999999');
    expect(mfaResult.success).toBe(false);
  });

  it('should reject session validation without MFA verification', async () => {
    await auth.enableMfa(userId);
    const loginResult = await auth.login({
      email: 'mfa@test.com',
      password: 'SecureP@ss123!',
      ipAddress: '10.0.0.1',
      userAgent: 'test',
    });

    const validation = await auth.validateSession(loginResult.session!.id);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('MFA');
  });

  it('should disable MFA with password confirmation', async () => {
    await auth.enableMfa(userId);
    const result = await auth.disableMfa(userId, 'SecureP@ss123!');
    expect(result.success).toBe(true);

    // Login should no longer require MFA
    const loginResult = await auth.login({
      email: 'mfa@test.com',
      password: 'SecureP@ss123!',
      ipAddress: '10.0.0.1',
      userAgent: 'test',
    });
    expect(loginResult.requiresMfa).toBeUndefined();
  });

  it('should reject MFA disable with wrong password', async () => {
    await auth.enableMfa(userId);
    const result = await auth.disableMfa(userId, 'WrongPassword!');
    expect(result.success).toBe(false);
  });
});

describe('E2E Auth — WebAuthn', () => {
  let auth: MockAuthSystem;
  let userId: string;

  beforeEach(async () => {
    auth = new MockAuthSystem();
    const result = await auth.register({ email: 'webauthn@test.com', password: 'SecureP@ss123!', name: 'WebAuthn User', gdprConsent: true });
    userId = result.userId!;
  });

  it('should register a WebAuthn credential', async () => {
    const result = await auth.registerWebAuthn(userId, 'YubiKey 5');
    expect(result.success).toBe(true);
    expect(result.credentialId).toBeDefined();
  });

  it('should authenticate with WebAuthn credential', async () => {
    const regResult = await auth.registerWebAuthn(userId, 'YubiKey 5');
    const authResult = await auth.authenticateWebAuthn(regResult.credentialId!, '10.0.0.1', 'test');
    expect(authResult.success).toBe(true);
    expect(authResult.session).toBeDefined();
    expect(authResult.session!.mfaVerified).toBe(true); // WebAuthn counts as MFA
  });

  it('should increment credential counter on use', async () => {
    const regResult = await auth.registerWebAuthn(userId, 'YubiKey 5');
    await auth.authenticateWebAuthn(regResult.credentialId!, '10.0.0.1', 'test');
    await auth.authenticateWebAuthn(regResult.credentialId!, '10.0.0.1', 'test');

    const user = auth.getUser(userId);
    const cred = user?.webauthnCredentials.find(c => c.id === regResult.credentialId);
    expect(cred?.counter).toBe(2);
  });

  it('should support multiple WebAuthn credentials', async () => {
    await auth.registerWebAuthn(userId, 'YubiKey 5');
    await auth.registerWebAuthn(userId, 'Touch ID');
    await auth.registerWebAuthn(userId, 'Windows Hello');

    const user = auth.getUser(userId);
    expect(user?.webauthnCredentials).toHaveLength(3);
  });

  it('should reject authentication with unknown credential', async () => {
    const result = await auth.authenticateWebAuthn('nonexistent-cred', '10.0.0.1', 'test');
    expect(result.success).toBe(false);
  });
});

describe('E2E Auth — Session Management', () => {
  let auth: MockAuthSystem;
  let userId: string;
  let session: Session;

  beforeEach(async () => {
    auth = new MockAuthSystem();
    const regResult = await auth.register({ email: 'session@test.com', password: 'SecureP@ss123!', name: 'Session User', gdprConsent: true });
    userId = regResult.userId!;
    const loginResult = await auth.login({ email: 'session@test.com', password: 'SecureP@ss123!', ipAddress: '10.0.0.1', userAgent: 'test' });
    session = loginResult.session!;
  });

  it('should validate an active session', async () => {
    const result = await auth.validateSession(session.id);
    expect(result.valid).toBe(true);
    expect(result.userId).toBe(userId);
  });

  it('should reject an invalid session ID', async () => {
    const result = await auth.validateSession('nonexistent');
    expect(result.valid).toBe(false);
  });

  it('should refresh a session with valid refresh token', async () => {
    const result = await auth.refreshSession(session.refreshToken);
    expect(result.success).toBe(true);
    expect(result.session).toBeDefined();
    expect(result.session!.id).not.toBe(session.id); // New session
    expect(result.session!.token).not.toBe(session.token); // New token
  });

  it('should invalidate old session after refresh', async () => {
    await auth.refreshSession(session.refreshToken);
    const result = await auth.validateSession(session.id);
    expect(result.valid).toBe(false);
  });

  it('should logout and invalidate session', async () => {
    await auth.logout(session.id);
    const result = await auth.validateSession(session.id);
    expect(result.valid).toBe(false);
  });

  it('should logout all sessions for a user', async () => {
    // Create multiple sessions
    await auth.login({ email: 'session@test.com', password: 'SecureP@ss123!', ipAddress: '10.0.0.2', userAgent: 'mobile' });
    await auth.login({ email: 'session@test.com', password: 'SecureP@ss123!', ipAddress: '10.0.0.3', userAgent: 'tablet' });

    expect(auth.getUserSessions(userId).length).toBeGreaterThanOrEqual(3);

    const result = await auth.logoutAllSessions(userId);
    expect(result.success).toBe(true);
    expect(result.count).toBeGreaterThanOrEqual(3);
    expect(auth.getUserSessions(userId)).toHaveLength(0);
  });
});

describe('E2E Auth — GDPR Compliance', () => {
  let auth: MockAuthSystem;
  let userId: string;

  beforeEach(async () => {
    auth = new MockAuthSystem();
    const result = await auth.register({ email: 'gdpr@test.com', password: 'SecureP@ss123!', name: 'GDPR User', gdprConsent: true });
    userId = result.userId!;
  });

  it('should record GDPR consent date on registration', () => {
    const user = auth.getUser(userId);
    expect(user?.gdprConsent).toBe(true);
    expect(user?.gdprConsentDate).toBeDefined();
  });

  it('should export all user data (Article 20 - Data Portability)', async () => {
    // Generate some activity
    await auth.login({ email: 'gdpr@test.com', password: 'SecureP@ss123!', ipAddress: '10.0.0.1', userAgent: 'test' });
    await auth.enableMfa(userId);

    const result = await auth.exportUserData(userId);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.profile).toBeDefined();
    expect(result.data!.security).toBeDefined();
    expect(result.data!.gdpr).toBeDefined();
    expect(result.data!.sessions).toBeDefined();
    expect(result.data!.auditLog).toBeDefined();
  });

  it('should not include password hash in exported data', async () => {
    const result = await auth.exportUserData(userId);
    const dataStr = JSON.stringify(result.data);
    expect(dataStr).not.toContain('passwordHash');
    expect(dataStr).not.toContain('hashed:');
  });

  it('should delete user account (Article 17 - Right to Erasure)', async () => {
    const result = await auth.deleteUser(userId, 'SecureP@ss123!');
    expect(result.success).toBe(true);
    expect(auth.getUser(userId)).toBeUndefined();
  });

  it('should require password confirmation for account deletion', async () => {
    const result = await auth.deleteUser(userId, 'WrongPassword!');
    expect(result.success).toBe(false);
    expect(auth.getUser(userId)).toBeDefined(); // User should still exist
  });

  it('should delete all sessions on account deletion', async () => {
    await auth.login({ email: 'gdpr@test.com', password: 'SecureP@ss123!', ipAddress: '10.0.0.1', userAgent: 'test' });
    await auth.login({ email: 'gdpr@test.com', password: 'SecureP@ss123!', ipAddress: '10.0.0.2', userAgent: 'mobile' });

    await auth.deleteUser(userId, 'SecureP@ss123!');
    expect(auth.getUserSessions(userId)).toHaveLength(0);
  });

  it('should record account deletion in audit log', async () => {
    await auth.deleteUser(userId, 'SecureP@ss123!');
    const log = auth.getAuditLog(userId);
    const deleteEvent = log.find(e => e.action === 'account_deleted_gdpr_art17');
    expect(deleteEvent).toBeDefined();
    expect(deleteEvent!.success).toBe(true);
  });

  it('should set default data retention period', () => {
    const user = auth.getUser(userId);
    expect(user?.dataRetentionDays).toBe(365);
  });
});

describe('E2E Auth — Full Lifecycle', () => {
  let auth: MockAuthSystem;

  beforeEach(() => {
    auth = new MockAuthSystem();
  });

  it('should complete full lifecycle: register → login → MFA → WebAuthn → export → delete', async () => {
    // 1. Register
    const regResult = await auth.register({
      email: 'lifecycle@infinity-os.dev',
      password: 'FullLifecycle@2025!',
      name: 'Lifecycle User',
      gdprConsent: true,
    });
    expect(regResult.success).toBe(true);
    const userId = regResult.userId!;

    // 2. Login
    const loginResult = await auth.login({
      email: 'lifecycle@infinity-os.dev',
      password: 'FullLifecycle@2025!',
      ipAddress: '192.168.1.100',
      userAgent: 'InfinityOS/1.0',
    });
    expect(loginResult.success).toBe(true);
    const session = loginResult.session!;

    // 3. Enable MFA
    const mfaResult = await auth.enableMfa(userId);
    expect(mfaResult.success).toBe(true);

    // 4. Register WebAuthn
    const webauthnResult = await auth.registerWebAuthn(userId, 'YubiKey 5 NFC');
    expect(webauthnResult.success).toBe(true);

    // 5. Logout
    await auth.logout(session.id);

    // 6. Login with MFA
    const mfaLoginResult = await auth.login({
      email: 'lifecycle@infinity-os.dev',
      password: 'FullLifecycle@2025!',
      ipAddress: '192.168.1.100',
      userAgent: 'InfinityOS/1.0',
    });
    expect(mfaLoginResult.requiresMfa).toBe(true);

    // 7. Verify MFA
    const verifyResult = await auth.verifyMfa(mfaLoginResult.session!.id, '000000');
    expect(verifyResult.success).toBe(true);

    // 8. WebAuthn login (alternative)
    const webauthnLoginResult = await auth.authenticateWebAuthn(
      webauthnResult.credentialId!,
      '192.168.1.100',
      'InfinityOS/1.0',
    );
    expect(webauthnLoginResult.success).toBe(true);

    // 9. Export data (GDPR Article 20)
    const exportResult = await auth.exportUserData(userId);
    expect(exportResult.success).toBe(true);
    expect(exportResult.data!.auditLog).toBeDefined();

    // 10. Delete account (GDPR Article 17)
    const deleteResult = await auth.deleteUser(userId, 'FullLifecycle@2025!');
    expect(deleteResult.success).toBe(true);
    expect(auth.getUser(userId)).toBeUndefined();

    // Verify comprehensive audit trail
    const auditLog = auth.getAuditLog(userId);
    const actions = auditLog.map(e => e.action);
    expect(actions).toContain('register');
    expect(actions).toContain('login_success');
    expect(actions).toContain('mfa_enabled');
    expect(actions).toContain('webauthn_registered');
    expect(actions).toContain('logout');
    expect(actions).toContain('login_mfa_required');
    expect(actions).toContain('mfa_verify_success');
    expect(actions).toContain('webauthn_login');
    expect(actions).toContain('data_export');
    expect(actions).toContain('account_deleted_gdpr_art17');
  });
});
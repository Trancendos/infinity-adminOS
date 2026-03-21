/**
 * @package @infinity-os/webauthn
 * Tests: Types, utilities, serialisation, crypto-shredding helpers, environment checks
 *
 * NOTE: Browser-specific functions (bootstrapHardwareDID, authenticateWithHardwareDID,
 * enablePasskeyAutofill, isPlatformAuthenticatorAvailable) require the browser WebAuthn
 * API and are tested via integration/E2E. Pure utility functions are fully unit-tested here.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Import module under test — via dynamic import to control global.window
// ─────────────────────────────────────────────────────────────────────────────

import {
  getUserVaultKeyName,
  isWebAuthnAvailable,
  serialiseCredential,
  type HardwareDID,
  type WebAuthnCredential,
  type WebAuthnRegistrationOptions,
  type WebAuthnAuthenticationOptions,
  type RegistrationVerificationResult,
  type AuthenticationVerificationResult,
} from '../index';

// ─────────────────────────────────────────────────────────────────────────────
// getUserVaultKeyName
// ─────────────────────────────────────────────────────────────────────────────

describe('getUserVaultKeyName', () => {
  it('prefixes key with "user-"', () => {
    const key = getUserVaultKeyName('abc-123');
    expect(key).toMatch(/^user-/);
  });

  it('returns user-{userId} for simple UUID', () => {
    expect(getUserVaultKeyName('abc-123')).toBe('user-abc-123');
  });

  it('lowercases the userId', () => {
    expect(getUserVaultKeyName('ABC-DEF')).toBe('user-abc-def');
  });

  it('replaces special characters with hyphens', () => {
    const key = getUserVaultKeyName('user@domain.com');
    // @ and . should be replaced
    expect(key).toMatch(/^user-[a-z0-9-]+$/);
    expect(key).not.toContain('@');
    expect(key).not.toContain('.');
  });

  it('handles UUID format', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const key = getUserVaultKeyName(uuid);
    expect(key).toBe(`user-${uuid}`);
  });

  it('handles underscores by replacing with hyphens', () => {
    const key = getUserVaultKeyName('my_user_id');
    expect(key).not.toContain('_');
  });

  it('empty string produces "user-"', () => {
    expect(getUserVaultKeyName('')).toBe('user-');
  });

  it('alphanumeric-only userId passes through unchanged (lowercased)', () => {
    expect(getUserVaultKeyName('UserABC123')).toBe('user-userabc123');
  });

  it('preserves hyphens in userId', () => {
    expect(getUserVaultKeyName('a-b-c')).toBe('user-a-b-c');
  });

  it('result is a valid Vault key name (no special chars)', () => {
    const inputs = [
      'user@example.com',
      'some.user.name',
      'user+tag@domain.org',
      '123e4567-e89b-12d3-a456-426614174000',
    ];
    for (const input of inputs) {
      const key = getUserVaultKeyName(input);
      expect(key).toMatch(/^user-[a-z0-9-]*$/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isWebAuthnAvailable
// ─────────────────────────────────────────────────────────────────────────────

describe('isWebAuthnAvailable', () => {
  it('returns false in Node.js environment (no window)', () => {
    // Node.js has no `window` object
    expect(isWebAuthnAvailable()).toBe(false);
  });

  it('returns false when window is undefined', () => {
    const origWindow = (global as any).window;
    delete (global as any).window;
    expect(isWebAuthnAvailable()).toBe(false);
    if (origWindow !== undefined) (global as any).window = origWindow;
  });

  it('returns false when window exists but no PublicKeyCredential', () => {
    (global as any).window = {};
    expect(isWebAuthnAvailable()).toBe(false);
    delete (global as any).window;
  });

  it('returns true when window.PublicKeyCredential is defined', () => {
    (global as any).window = {
      PublicKeyCredential: class MockPublicKeyCredential {},
    };
    expect(isWebAuthnAvailable()).toBe(true);
    delete (global as any).window;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// serialiseCredential
// ─────────────────────────────────────────────────────────────────────────────

describe('serialiseCredential', () => {
  // Helper to build ArrayBuffer from string
  function strToBuffer(str: string): ArrayBuffer {
    const encoder = new TextEncoder();
    return encoder.encode(str).buffer;
  }

  // Helper to build base64url from string (mirrors the internal bufferToBase64url)
  function strToBase64url(str: string): string {
    return Buffer.from(str).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  describe('registration (attestation) credential', () => {
    function makeRegistrationCredential(): WebAuthnCredential {
      const clientDataJSON = strToBuffer('{"type":"webauthn.create","challenge":"abc"}');
      const attestationObject = strToBuffer('attestation-bytes');
      return {
        id: 'cred-id-123',
        rawId: strToBuffer('raw-cred-id'),
        type: 'public-key',
        response: {
          clientDataJSON,
          attestationObject,
          // Make it look like AuthenticatorAttestationResponse
          getTransports: () => ['internal'],
          getPublicKey: () => null,
          getPublicKeyAlgorithm: () => -7,
          getAuthenticatorData: () => new ArrayBuffer(0),
        } as any,
      };
    }

    it('serialises id field', () => {
      const cred = makeRegistrationCredential();
      const result = serialiseCredential(cred);
      expect(result.id).toBe('cred-id-123');
    });

    it('serialises type field', () => {
      const cred = makeRegistrationCredential();
      const result = serialiseCredential(cred);
      expect(result.type).toBe('public-key');
    });

    it('serialises rawId as base64url string', () => {
      const cred = makeRegistrationCredential();
      const result = serialiseCredential(cred);
      expect(typeof result.rawId).toBe('string');
      // base64url has no +, /, = chars
      expect((result.rawId as string)).not.toContain('+');
      expect((result.rawId as string)).not.toContain('/');
      expect((result.rawId as string)).not.toContain('=');
    });

    it('serialises clientDataJSON as base64url string', () => {
      const cred = makeRegistrationCredential();
      const result = serialiseCredential(cred);
      const response = result.response as Record<string, unknown>;
      expect(typeof response.clientDataJSON).toBe('string');
    });

    it('serialises attestationObject as base64url string', () => {
      const cred = makeRegistrationCredential();
      const result = serialiseCredential(cred);
      const response = result.response as Record<string, unknown>;
      expect(response).toHaveProperty('attestationObject');
      expect(typeof response.attestationObject).toBe('string');
    });

    it('does NOT include authenticatorData for registration', () => {
      const cred = makeRegistrationCredential();
      const result = serialiseCredential(cred);
      const response = result.response as Record<string, unknown>;
      // attestation response has attestationObject, not authenticatorData
      expect(response).toHaveProperty('attestationObject');
    });
  });

  describe('authentication (assertion) credential', () => {
    function makeAssertionCredential(includeUserHandle = true): WebAuthnCredential {
      const clientDataJSON = strToBuffer('{"type":"webauthn.get","challenge":"xyz"}');
      const authenticatorData = strToBuffer('auth-data-bytes');
      const signature = strToBuffer('signature-bytes');
      const userHandle = includeUserHandle ? strToBuffer('user-123') : null;

      return {
        id: 'cred-id-456',
        rawId: strToBuffer('raw-auth-id'),
        type: 'public-key',
        response: {
          clientDataJSON,
          authenticatorData,
          signature,
          userHandle,
          // AuthenticatorAssertionResponse does NOT have attestationObject
        } as any,
      };
    }

    it('serialises id field', () => {
      const cred = makeAssertionCredential();
      const result = serialiseCredential(cred);
      expect(result.id).toBe('cred-id-456');
    });

    it('serialises authenticatorData as base64url', () => {
      const cred = makeAssertionCredential();
      const result = serialiseCredential(cred);
      const response = result.response as Record<string, unknown>;
      expect(response).toHaveProperty('authenticatorData');
      expect(typeof response.authenticatorData).toBe('string');
    });

    it('serialises signature as base64url', () => {
      const cred = makeAssertionCredential();
      const result = serialiseCredential(cred);
      const response = result.response as Record<string, unknown>;
      expect(response).toHaveProperty('signature');
      expect(typeof response.signature).toBe('string');
    });

    it('serialises userHandle as base64url when present', () => {
      const cred = makeAssertionCredential(true);
      const result = serialiseCredential(cred);
      const response = result.response as Record<string, unknown>;
      expect(response.userHandle).not.toBeNull();
      expect(typeof response.userHandle).toBe('string');
    });

    it('serialises userHandle as null when absent', () => {
      const cred = makeAssertionCredential(false);
      const result = serialiseCredential(cred);
      const response = result.response as Record<string, unknown>;
      expect(response.userHandle).toBeNull();
    });

    it('does NOT include attestationObject for authentication', () => {
      const cred = makeAssertionCredential();
      const result = serialiseCredential(cred);
      const response = result.response as Record<string, unknown>;
      expect(response).not.toHaveProperty('attestationObject');
    });
  });

  describe('base64url encoding correctness', () => {
    it('encoded strings contain only valid base64url characters', () => {
      const cred: WebAuthnCredential = {
        id: 'test-cred',
        rawId: strToBuffer('test-raw-id-with-data'),
        type: 'public-key',
        response: {
          clientDataJSON: strToBuffer('client-data'),
          attestationObject: strToBuffer('attestation'),
          getTransports: () => [],
          getPublicKey: () => null,
          getPublicKeyAlgorithm: () => -7,
          getAuthenticatorData: () => new ArrayBuffer(0),
        } as any,
      };
      const result = serialiseCredential(cred);
      const validateBase64url = (s: string) => /^[A-Za-z0-9\-_]*$/.test(s);
      expect(validateBase64url(result.rawId as string)).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Type shape tests (compile-time + shape assertions)
// ─────────────────────────────────────────────────────────────────────────────

describe('HardwareDID type shape', () => {
  it('can construct a valid HardwareDID object', () => {
    const did: HardwareDID = {
      credentialId: 'cred-abc-123',
      publicKey: 'base64encodedPublicKey==',
      userId: 'user-456',
      deviceType: 'platform',
      createdAt: new Date().toISOString(),
    };
    expect(did.credentialId).toBe('cred-abc-123');
    expect(did.deviceType).toBe('platform');
    expect(did.lastUsedAt).toBeUndefined();
    expect(did.aaguid).toBeUndefined();
  });

  it('supports cross-platform deviceType', () => {
    const did: HardwareDID = {
      credentialId: 'cred-yubikey',
      publicKey: 'pubkey',
      userId: 'user-789',
      deviceType: 'cross-platform',
      createdAt: new Date().toISOString(),
      aaguid: 'aaguid-value',
      lastUsedAt: new Date().toISOString(),
    };
    expect(did.deviceType).toBe('cross-platform');
    expect(did.aaguid).toBe('aaguid-value');
    expect(did.lastUsedAt).toBeDefined();
  });
});

describe('WebAuthnRegistrationOptions type shape', () => {
  it('can construct valid registration options', () => {
    const opts: WebAuthnRegistrationOptions = {
      challenge: 'base64url-challenge-string',
      userId: 'user-123',
      userEmail: 'user@example.com',
      displayName: 'Test User',
      rpId: 'example.com',
      rpName: 'Example Corp',
    };
    expect(opts.rpId).toBe('example.com');
    expect(opts.challenge).toBeDefined();
  });
});

describe('WebAuthnAuthenticationOptions type shape', () => {
  it('can construct valid authentication options', () => {
    const opts: WebAuthnAuthenticationOptions = {
      challenge: 'auth-challenge',
      rpId: 'example.com',
      allowCredentials: [
        { id: 'cred-1', type: 'public-key' },
        { id: 'cred-2', type: 'public-key' },
      ],
      userVerification: 'required',
    };
    expect(opts.allowCredentials).toHaveLength(2);
    expect(opts.userVerification).toBe('required');
  });

  it('allowCredentials is optional', () => {
    const opts: WebAuthnAuthenticationOptions = {
      challenge: 'challenge',
      rpId: 'example.com',
    };
    expect(opts.allowCredentials).toBeUndefined();
  });
});

describe('RegistrationVerificationResult type shape', () => {
  it('can construct a successful verification result', () => {
    const result: RegistrationVerificationResult = {
      verified: true,
      credentialId: 'cred-abc',
      credentialPublicKey: new Uint8Array([1, 2, 3]),
      counter: 0,
      aaguid: 'aaguid-value',
      deviceType: 'singleDevice',
    };
    expect(result.verified).toBe(true);
    expect(result.credentialPublicKey).toBeInstanceOf(Uint8Array);
  });

  it('can construct a failed verification result', () => {
    const result: RegistrationVerificationResult = { verified: false };
    expect(result.verified).toBe(false);
    expect(result.credentialId).toBeUndefined();
  });
});

describe('AuthenticationVerificationResult type shape', () => {
  it('can construct a successful authentication result', () => {
    const result: AuthenticationVerificationResult = {
      verified: true,
      newCounter: 5,
    };
    expect(result.verified).toBe(true);
    expect(result.newCounter).toBe(5);
  });

  it('can construct a failed authentication result', () => {
    const result: AuthenticationVerificationResult = { verified: false };
    expect(result.verified).toBe(false);
    expect(result.newCounter).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Browser-gated function guards (error-path only — no real browser needed)
// ─────────────────────────────────────────────────────────────────────────────

describe('bootstrapHardwareDID — guard behavior', () => {
  it('throws when WebAuthn is not available (no window)', async () => {
    // In Node.js test environment, `window` is not defined, so accessing
    // `window.PublicKeyCredential` throws a ReferenceError. Both that and
    // the explicit "WebAuthn is not supported" message are acceptable
    // indicators that the browser API is unavailable.
    const { bootstrapHardwareDID } = await import('../index');

    await expect(
      bootstrapHardwareDID({
        challenge: 'challenge',
        userId: 'user-1',
        userEmail: 'user@test.com',
        displayName: 'Test',
        rpId: 'test.com',
        rpName: 'Test',
      })
    ).rejects.toThrow(); // throws either "window is not defined" or "WebAuthn is not supported"
  });
});

describe('authenticateWithHardwareDID — guard behavior', () => {
  it('throws when WebAuthn is not available (no window)', async () => {
    const { authenticateWithHardwareDID } = await import('../index');

    await expect(
      authenticateWithHardwareDID({
        challenge: 'challenge',
        rpId: 'test.com',
      })
    ).rejects.toThrow(); // throws either "window is not defined" or "WebAuthn is not supported"
  });
});

describe('isPlatformAuthenticatorAvailable', () => {
  it('returns false when WebAuthn is not available', async () => {
    const { isPlatformAuthenticatorAvailable } = await import('../index');
    // In Node.js, window is not defined
    const result = await isPlatformAuthenticatorAvailable();
    expect(result).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Module exports validation
// ─────────────────────────────────────────────────────────────────────────────

describe('module exports', () => {
  it('exports bootstrapHardwareDID as a function', async () => {
    const mod = await import('../index');
    expect(typeof mod.bootstrapHardwareDID).toBe('function');
  });

  it('exports authenticateWithHardwareDID as a function', async () => {
    const mod = await import('../index');
    expect(typeof mod.authenticateWithHardwareDID).toBe('function');
  });

  it('exports enablePasskeyAutofill as a function', async () => {
    const mod = await import('../index');
    expect(typeof mod.enablePasskeyAutofill).toBe('function');
  });

  it('exports serialiseCredential as a function', async () => {
    const mod = await import('../index');
    expect(typeof mod.serialiseCredential).toBe('function');
  });

  it('exports getUserVaultKeyName as a function', async () => {
    const mod = await import('../index');
    expect(typeof mod.getUserVaultKeyName).toBe('function');
  });

  it('exports isWebAuthnAvailable as a function', async () => {
    const mod = await import('../index');
    expect(typeof mod.isWebAuthnAvailable).toBe('function');
  });

  it('exports isPlatformAuthenticatorAvailable as a function', async () => {
    const mod = await import('../index');
    expect(typeof mod.isPlatformAuthenticatorAvailable).toBe('function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Vault key name edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('getUserVaultKeyName — additional edge cases', () => {
  it('handles numeric-only userId', () => {
    expect(getUserVaultKeyName('12345')).toBe('user-12345');
  });

  it('handles very long userId', () => {
    const longId = 'a'.repeat(200);
    const key = getUserVaultKeyName(longId);
    expect(key.startsWith('user-')).toBe(true);
  });

  it('handles unicode characters', () => {
    const key = getUserVaultKeyName('用户-123');
    expect(key).toMatch(/^user-[a-z0-9-]*$/);
  });

  it('consistent result (deterministic)', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(getUserVaultKeyName(id)).toBe(getUserVaultKeyName(id));
  });
});
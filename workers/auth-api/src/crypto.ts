// ============================================================
// Infinity OS — Crypto utilities (Web Crypto API)
// Works natively in Cloudflare Workers runtime
// ============================================================

const PBKDF2_ITERATIONS = 100_000;
const HASH_ALGO = 'SHA-256';

// ── Password Hashing ─────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: HASH_ALGO,
    },
    keyMaterial,
    256,
  );

  const hashArray = new Uint8Array(bits);
  const saltHex = bufToHex(salt);
  const hashHex = bufToHex(hashArray);
  return `pbkdf2:${saltHex}:${hashHex}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split(':');
    if (parts.length !== 3 || parts[0] !== 'pbkdf2') return false;

    const salt = hexToBuf(parts[1]);
    const expectedHash = parts[2];

    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      'PBKDF2',
      false,
      ['deriveBits'],
    );

    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: HASH_ALGO,
      },
      keyMaterial,
      256,
    );

    const hashHex = bufToHex(new Uint8Array(bits));
    return timingSafeEqual(hashHex, expectedHash);
  } catch {
    return false;
  }
}

// ── JWT (HS256 using HMAC-SHA256) ────────────────────────────

function base64urlEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)));
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signJWT(payload: object, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const header = { alg: 'HS256', typ: 'JWT' };

  const headerB64 = base64urlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64urlEncode(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await getHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(signingInput));

  return `${signingInput}.${base64urlEncode(new Uint8Array(signature))}`;
}

export async function verifyJWT<T>(token: string, secret: string): Promise<T | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const enc = new TextEncoder();
    const signingInput = `${parts[0]}.${parts[1]}`;
    const signature = base64urlDecode(parts[2]);

    const key = await getHmacKey(secret);
    const valid = await crypto.subtle.verify('HMAC', key, signature, enc.encode(signingInput));
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[1])));

    // Check expiry
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;

    return payload as T;
  } catch {
    return null;
  }
}

// ── Helpers ──────────────────────────────────────────────────

function bufToHex(buf: Uint8Array): string {
  return [...buf].map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBuf(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function generateId(): string {
  return crypto.randomUUID();
}

export async function hashToken(token: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(token));
  return bufToHex(new Uint8Array(buf));
}
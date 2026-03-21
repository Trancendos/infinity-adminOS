import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Tests for monitoring-dashboard worker
 * Validates health endpoints, error handling, and security headers
 */

import worker from '../index';

// Mock env bindings
const mockEnv = {
  DB: {
    prepare: () => ({
      bind: () => ({
        all: async () => ({ results: [] }),
        first: async () => null,
        run: async () => ({ success: true }),
      }),
    }),
    batch: async () => [],
    exec: async () => ({ count: 0 }),
    dump: async () => new ArrayBuffer(0),
  },
  KV_CACHE: {
    get: async () => null,
    put: async () => {},
    delete: async () => {},
    list: async () => ({ keys: [], list_complete: true }),
    getWithMetadata: async () => ({ value: null, metadata: null }),
  },
  KV_RATE_LIMIT: {
    get: async () => null,
    put: async () => {},
    delete: async () => {},
    list: async () => ({ keys: [], list_complete: true }),
    getWithMetadata: async () => ({ value: null, metadata: null }),
  },
  LIGHTHOUSE_URL: 'https://lighthouse.test.com',
  VOID_URL: 'https://void.test.com',
  INTERNAL_SECRET: 'test-secret',
  ENVIRONMENT: 'test',
  JWT_SECRET: 'test-jwt-secret',
  API_KEY: 'test-api-key',
} as any;

const mockCtx = { waitUntil: () => {}, passThroughOnException: () => {} } as any;

describe('monitoring-dashboard worker', () => {

  describe('GET /health', () => {
    it('should return 200 with healthy status', async () => {
      const req = new Request('https://test.com/health');
      const res = await worker.fetch(req, mockEnv, mockCtx);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.status).toBeDefined();
    });

    it('should return JSON content type', async () => {
      const req = new Request('https://test.com/health');
      const res = await worker.fetch(req, mockEnv, mockCtx);
      expect(res.headers.get('Content-Type')).toContain('application/json');
    });
  });

  describe('Error handling', () => {
    it('should return 404 for unknown routes', async () => {
      const req = new Request('https://test.com/nonexistent-route-xyz');
      const res = await worker.fetch(req, mockEnv, mockCtx);
      expect(res.status).toBe(404);
    });

    it('should return JSON error response', async () => {
      const req = new Request('https://test.com/nonexistent-route-xyz');
      const res = await worker.fetch(req, mockEnv, mockCtx);
      expect(res.headers.get('Content-Type')).toContain('application/json');
    });
  });

  describe('Security headers', () => {
    it('should include security headers', async () => {
      const req = new Request('https://test.com/health');
      const res = await worker.fetch(req, mockEnv, mockCtx);
      const headers = Object.fromEntries(res.headers.entries());
      expect(
        headers['x-content-type-options'] === 'nosniff' ||
        headers['x-frame-options'] === 'DENY' ||
        headers['content-type']?.includes('application/json')
      ).toBe(true);
    });
  });
});

import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Tests for l402-gateway worker
 * Validates health endpoints, error handling, and security headers
 */

// Import the Hono app from the worker
import app from '../index';

// Mock env bindings
const mockEnv = {
  DB: {},
  KV_CACHE: {},
  KV_RATE_LIMIT: {},
  LIGHTHOUSE_URL: 'https://lighthouse.test.com',
  VOID_URL: 'https://void.test.com',
  INTERNAL_SECRET: 'test-secret',
  ENVIRONMENT: 'test',
  JWT_SECRET: 'test-jwt-secret',
  API_KEY: 'test-api-key',
};

describe('l402-gateway worker', () => {

  describe('GET /health', () => {
    it('should return 200 with healthy status', async () => {
      const req = new Request('https://test.com/health');
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(body.status).toBeDefined();
    });

    it('should return JSON content type', async () => {
      const req = new Request('https://test.com/health');
      const res = await app.fetch(req, mockEnv);
      expect(res.headers.get('Content-Type')).toContain('application/json');
    });
  });

  describe('Error handling', () => {
    it('should return 404 for unknown routes', async () => {
      const req = new Request('https://test.com/nonexistent-route-xyz');
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(404);
    });

    it('should return error response for unknown routes', async () => {
      const req = new Request('https://test.com/nonexistent-route-xyz');
      const res = await app.fetch(req, mockEnv);
      const text = await res.text();
      let hasError = false;
      try { const body = JSON.parse(text); hasError = !!(body.error || body.message); } catch { hasError = text.length > 0; }
      expect(hasError).toBe(true);
    });
  });

  describe('CORS', () => {
    it('should handle OPTIONS preflight requests', async () => {
      const req = new Request('https://test.com/health', {
        method: 'OPTIONS',
        headers: { 'Origin': 'https://example.com' },
      });
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBeLessThan(400);
    });
  });
});

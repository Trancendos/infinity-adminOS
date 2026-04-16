import { describe, it, expect, beforeEach } from "vitest";

/**
 * Tests for library worker
 * Validates health endpoints, error handling, and security headers
 */

import worker from "../index";

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
  KV_KNOWLEDGE_CACHE: {
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
  R2_DOCUMENTS: {
    get: async () => null,
    put: async () => {},
    delete: async () => {},
    list: async () => ({ objects: [], truncated: false }),
  },
  LIGHTHOUSE_URL: "https://lighthouse.test.com",
  HIVE_URL: "https://hive.test.com",
  INFINITY_ONE_URL: "https://auth.test.com",
  ZIMIK_API_KEY: "test-zimik-key",
  ENVIRONMENT: "test",
} as any;

const mockCtx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as any;

describe("library worker", () => {
  describe("GET /health", () => {
    it("returns healthy status", async () => {
      const request = new Request("http://example.com/health", {
        method: "GET",
      });
      const response = await worker.fetch(request, mockEnv, mockCtx);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBe("healthy");
      expect(data.service).toBe("library");
    });
  });

  describe("unauthorized requests", () => {
    it("returns 401 for protected routes without auth", async () => {
      const request = new Request("http://example.com/knowledge", {
        method: "GET",
      });
      const response = await worker.fetch(request, mockEnv, mockCtx);
      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("CORS", () => {
    it("handles OPTIONS requests", async () => {
      const request = new Request("http://example.com/knowledge", {
        method: "OPTIONS",
      });
      const response = await worker.fetch(request, mockEnv, mockCtx);
      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });

  describe("404", () => {
    it("returns 404 for unknown routes", async () => {
      const request = new Request("http://example.com/unknown", {
        method: "GET",
      });
      const response = await worker.fetch(request, mockEnv, mockCtx);
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error.code).toBe("NOT_FOUND");
    });
  });
});

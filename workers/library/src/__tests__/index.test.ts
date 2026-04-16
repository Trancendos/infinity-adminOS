import { describe, it, expect, beforeEach } from "vitest";

/**
 * Tests for library worker
 * Validates knowledge base, wiki, and refinery functionality
 */

// Import the Hono app from the worker
import app from "../index";

// Mock env bindings
const mockEnv = {
  KNOWLEDGE_BASE: {},
  WIKI_STORE: {},
  REFINERY_CACHE: {},
  KNOWLEDGE_DB: {},
  ENVIRONMENT: "test",
  LOG_LEVEL: "info",
  MAX_KNOWLEDGE_SIZE: "10485760",
  WIKI_CONSOLIDATION_INTERVAL: "3600000",
  REFINERY_PROCESSING_TIMEOUT: "300000",
};

describe("library worker", () => {
  describe("GET /health", () => {
    it("should return 200 with healthy status", async () => {
      const req = new Request("https://test.com/health");
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.status).toBeDefined();
      expect(body.services).toBeDefined();
    });

    it("should return JSON content type", async () => {
      const req = new Request("https://test.com/health");
      const res = await app.fetch(req, mockEnv);
      expect(res.headers.get("Content-Type")).toContain("application/json");
    });
  });

  describe("GET /status", () => {
    it("should return operational status with metrics", async () => {
      const req = new Request("https://test.com/status");
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.status).toBe("operational");
      expect(body.metrics).toBeDefined();
      expect(body.recentActivity).toBeDefined();
    });
  });

  describe("Knowledge Base Operations", () => {
    it("should add knowledge entry", async () => {
      const req = new Request("https://test.com/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Test Knowledge",
          content: "This is a test knowledge entry for validation.",
          category: "test",
          tags: ["test", "validation"],
        }),
      });
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.entryId).toBeDefined();
      expect(body.quality).toBeDefined();
    });

    it("should retrieve knowledge entry", async () => {
      // First add an entry
      const addReq = new Request("https://test.com/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test_kb_001",
          title: "Test Entry",
          content: "Test content",
          category: "test",
        }),
      });
      await app.fetch(addReq, mockEnv);

      // Then retrieve it
      const getReq = new Request("https://test.com/knowledge/test_kb_001");
      const res = await app.fetch(getReq, mockEnv);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.id).toBe("test_kb_001");
      expect(body.title).toBe("Test Entry");
    });

    it("should search knowledge base", async () => {
      const req = new Request("https://test.com/knowledge/search?q=test");
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.results).toBeDefined();
      expect(Array.isArray(body.results)).toBe(true);
    });
  });

  describe("Wiki Operations", () => {
    it("should create wiki page", async () => {
      const req = new Request("https://test.com/wiki", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Test Wiki Page",
          content: "This is a test wiki page content.",
          category: "test",
          tags: ["test", "wiki"],
        }),
      });
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.pageId).toBeDefined();
      expect(body.version).toBe(1);
    });

    it("should retrieve wiki page", async () => {
      // First create a page
      const createReq = new Request("https://test.com/wiki", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "test_wiki_001",
          title: "Test Wiki",
          content: "Test wiki content",
          category: "test",
        }),
      });
      await app.fetch(createReq, mockEnv);

      // Then retrieve it
      const getReq = new Request("https://test.com/wiki/test_wiki_001");
      const res = await app.fetch(getReq, mockEnv);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.id).toBe("test_wiki_001");
      expect(body.title).toBe("Test Wiki");
    });

    it("should search wiki pages", async () => {
      const req = new Request("https://test.com/wiki/search?q=test");
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.results).toBeDefined();
      expect(Array.isArray(body.results)).toBe(true);
    });
  });

  describe("Refinery Operations", () => {
    it("should process content through refinery", async () => {
      const req = new Request("https://test.com/refinery/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "summarize",
          source: "test",
          content:
            "This is a long piece of content that should be summarized by the refinery process.",
          format: "text",
        }),
      });
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.processId).toBeDefined();
      expect(body.output).toBeDefined();
    });

    it("should get refinery analytics", async () => {
      const req = new Request("https://test.com/refinery/analytics");
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.totalProcesses).toBeDefined();
      expect(body.processesByType).toBeDefined();
    });
  });

  describe("Error handling", () => {
    it("should return 404 for unknown knowledge entry", async () => {
      const req = new Request("https://test.com/knowledge/nonexistent-id");
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(404);
    });

    it("should return 404 for unknown wiki page", async () => {
      const req = new Request("https://test.com/wiki/nonexistent-id");
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(404);
    });

    it("should return 404 for unknown refinery process", async () => {
      const req = new Request(
        "https://test.com/refinery/process/nonexistent-id",
      );
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(404);
    });

    it("should return 404 for unknown routes", async () => {
      const req = new Request("https://test.com/nonexistent-route-xyz");
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(404);
    });
  });

  describe("Cron endpoints", () => {
    it("should handle 30-minute maintenance cron", async () => {
      const req = new Request("https://test.com/cron/30min");
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.processed).toBe(true);
    });

    it("should handle 2-hour consolidation cron", async () => {
      const req = new Request("https://test.com/cron/2hours");
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.processed).toBe(true);
    });

    it("should handle daily analytics cron", async () => {
      const req = new Request("https://test.com/cron/daily");
      const res = await app.fetch(req, mockEnv);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.processed).toBe(true);
      expect(body.analytics).toBeDefined();
    });
  });
});

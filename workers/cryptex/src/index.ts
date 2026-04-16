// Cryptex Worker — VAI Renik Cyber Defense Application
// ═══════════════════════════════════════════════════════════════
// Main entry point integrating Threat Intelligence, Penetration Testing,
// DDoS Mitigation, and CVE Scanning capabilities.

import { ThreatIntelligence } from "./modules/threat-intelligence";
import { PenetrationTesting } from "./modules/penetration-testing";
import { DDoSMitigation } from "./modules/ddos-mitigation";
import { CVEScanning } from "./modules/cve-scanning";

interface Env {
  DB: D1Database;
  THREAT_CACHE: KVNamespace;
  CVE_CACHE: KVNamespace;
  ENVIRONMENT: string;
}

interface CryptexResponse {
  success: boolean;
  data?: any;
  error?: string;
  timestamp: number;
}

// Initialize modules
let threatIntel: ThreatIntelligence;
let penTesting: PenetrationTesting;
let ddosMitigation: DDoSMitigation;
let cveScanning: CVEScanning;

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    // Initialize modules on first request
    if (!threatIntel) {
      threatIntel = new ThreatIntelligence(env.THREAT_CACHE);
      penTesting = new PenetrationTesting(env.THREAT_CACHE);
      ddosMitigation = new DDoSMitigation(env.THREAT_CACHE);
      cveScanning = new CVEScanning(env.CVE_CACHE);

      // Initialize CVE database
      await cveScanning.initializeCVEDatabase();
    }

    // DDoS monitoring and mitigation
    const clientIP =
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("X-Forwarded-For") ||
      "unknown";

    try {
      const ddosResult = await ddosMitigation.monitorTraffic(request, clientIP);

      if (ddosResult.isAttack) {
        if (ddosResult.attackId) {
          await ddosMitigation.applyMitigation(ddosResult.attackId);
        }

        if (ddosResult.action === "block") {
          return new Response("Access Denied - DDoS Protection Active", {
            status: 403,
            headers: { "Content-Type": "text/plain" },
          });
        }

        if (ddosResult.action === "challenge") {
          return new Response("Security Challenge Required", {
            status: 429,
            headers: { "Content-Type": "text/plain" },
          });
        }
      }
    } catch (error) {
      console.error("DDoS monitoring error:", error);
    }

    // Route to appropriate handler
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Threat Intelligence endpoints
      if (path.startsWith("/api/threats")) {
        return await handleThreatIntelligence(request, url);
      }

      // Penetration Testing endpoints
      if (path.startsWith("/api/pentest")) {
        return await handlePenetrationTesting(request, url);
      }

      // DDoS Mitigation endpoints
      if (path.startsWith("/api/ddos")) {
        return await handleDDoSMitigation(request, url);
      }

      // CVE Scanning endpoints
      if (path.startsWith("/api/cve")) {
        return await handleCVEScanning(request, url);
      }

      // Dashboard endpoint
      if (path === "/api/dashboard") {
        return await handleDashboard(request);
      }

      // Health check
      if (path === "/health") {
        return new Response(
          JSON.stringify({
            status: "healthy",
            timestamp: Date.now(),
            version: "1.0.0",
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      // Default response
      return new Response(
        JSON.stringify({
          message: "Cryptex Cyber Defense API",
          endpoints: {
            threats: "/api/threats/*",
            pentest: "/api/pentest/*",
            ddos: "/api/ddos/*",
            cve: "/api/cve/*",
            dashboard: "/api/dashboard",
          },
          version: "1.0.0",
        }),
        {
          headers: { "Content-Type": "application/json" },
        },
      );
    } catch (error) {
      console.error("Request error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
          timestamp: Date.now(),
        } as CryptexResponse),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};

// Threat Intelligence handlers
async function handleThreatIntelligence(
  request: Request,
  url: URL,
): Promise<Response> {
  const path = url.pathname;

  if (request.method === "POST" && path === "/api/threats/collect") {
    const body = await request.json();
    await threatIntel.collectThreatData(body.source, body);
    return jsonResponse({ success: true, message: "Threat data collected" });
  }

  if (request.method === "GET" && path === "/api/threats/analyze") {
    const analysis = await threatIntel.analyzeThreats();
    return jsonResponse({ success: true, data: analysis });
  }

  if (request.method === "GET" && path.startsWith("/api/threats/search")) {
    const indicators = url.searchParams.get("indicators")?.split(",") || [];
    const results = await threatIntel.getThreatIntel(indicators);
    return jsonResponse({ success: true, data: results });
  }

  return jsonResponse(
    { success: false, error: "Invalid threat intelligence endpoint" },
    404,
  );
}

// Penetration Testing handlers
async function handlePenetrationTesting(
  request: Request,
  url: URL,
): Promise<Response> {
  const path = url.pathname;

  if (request.method === "POST" && path === "/api/pentest/start") {
    const { type, target, config } = await request.json();
    const testId = await penTesting.startTest(type, target, config);
    return jsonResponse({ success: true, data: { testId } });
  }

  if (request.method === "GET" && path.startsWith("/api/pentest/status/")) {
    const testId = path.split("/").pop();
    const status = await penTesting.getTestStatus(testId);
    return jsonResponse({ success: true, data: status });
  }

  return jsonResponse(
    { success: false, error: "Invalid penetration testing endpoint" },
    404,
  );
}

// DDoS Mitigation handlers
async function handleDDoSMitigation(
  request: Request,
  url: URL,
): Promise<Response> {
  const path = url.pathname;

  if (request.method === "GET" && path === "/api/ddos/status") {
    const status = await ddosMitigation.getDDoSStatus();
    return jsonResponse({ success: true, data: status });
  }

  if (request.method === "POST" && path === "/api/ddos/mitigate") {
    const { attackId } = await request.json();
    await ddosMitigation.applyMitigation(attackId);
    return jsonResponse({ success: true, message: "Mitigation applied" });
  }

  return jsonResponse(
    { success: false, error: "Invalid DDoS mitigation endpoint" },
    404,
  );
}

// CVE Scanning handlers
async function handleCVEScanning(
  request: Request,
  url: URL,
): Promise<Response> {
  const path = url.pathname;

  if (request.method === "POST" && path === "/api/cve/scan") {
    const { target, config } = await request.json();
    const scanId = await cveScanning.performScan(target, config);
    return jsonResponse({ success: true, data: { scanId } });
  }

  if (request.method === "GET" && path.startsWith("/api/cve/results/")) {
    const scanId = path.split("/").pop();
    const results = await cveScanning.getScanResults(scanId);
    return jsonResponse({ success: true, data: results });
  }

  if (request.method === "GET" && path === "/api/cve/search") {
    const criteria = Object.fromEntries(url.searchParams);
    const results = await cveScanning.searchCVEs(criteria);
    return jsonResponse({ success: true, data: results });
  }

  if (request.method === "GET" && path.startsWith("/api/cve/report/")) {
    const scanId = path.split("/").pop();
    const report = await cveScanning.generateReport(scanId);
    return new Response(report, {
      headers: { "Content-Type": "application/json" },
    });
  }

  return jsonResponse(
    { success: false, error: "Invalid CVE scanning endpoint" },
    404,
  );
}

// Dashboard handler - provides overview of all systems
async function handleDashboard(request: Request): Promise<Response> {
  const [threatAnalysis, ddosStatus, allCVEs] = await Promise.all([
    threatIntel.analyzeThreats(),
    ddosMitigation.getDDoSStatus(),
    cveScanning.getAllCVEs(),
  ]);

  const dashboard = {
    timestamp: Date.now(),
    threatIntelligence: {
      totalThreats: threatAnalysis.totalThreats,
      highSeverityCount: threatAnalysis.highSeverityCount,
      riskScore: threatAnalysis.riskScore,
    },
    ddosProtection: {
      activeAttacks: ddosStatus.activeAttacks.length,
      threatLevel: ddosStatus.currentThreatLevel,
      totalMitigated: ddosStatus.totalMitigated,
    },
    vulnerabilityManagement: {
      totalCVEs: allCVEs.length,
      criticalCVEs: allCVEs.filter((cve) => cve.severity === "critical").length,
      recentCVEs: allCVEs.filter((cve) => {
        const pubDate = new Date(cve.publishedDate);
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        return pubDate > thirtyDaysAgo;
      }).length,
    },
    systemStatus: "operational",
  };

  return jsonResponse({ success: true, data: dashboard });
}

// Helper function for JSON responses
function jsonResponse(data: CryptexResponse, status: number = 200): Response {
  return new Response(
    JSON.stringify({
      ...data,
      timestamp: data.timestamp || Date.now(),
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/* ─────────────────────────────────────────────
   Infinity OS — Self-Healing Engine Unit Tests
   Tests for CVE scanning, dependency catalog,
   SBOM generation, health monitoring, circuit
   breaker, and auto-remediation.
   ───────────────────────────────────────────── */

// ── Mock Types ──────────────────────────────

interface CVEResult {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'none';
  cvss: number;
  package: string;
  version: string;
  fixedIn?: string;
  description: string;
  published: string;
  suppressed: boolean;
}

interface Dependency {
  name: string;
  version: string;
  latestVersion: string;
  isOutdated: boolean;
  nMinusCompliant: boolean;
  license: string;
  directDependency: boolean;
  vulnerabilities: number;
}

interface SBOMEntry {
  type: 'library' | 'framework' | 'application' | 'operating-system';
  name: string;
  version: string;
  purl: string;
  license: string;
  hashes: { algorithm: string; value: string }[];
}

interface HealthCheck {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latencyMs: number;
  lastCheck: number;
  consecutiveFailures: number;
  uptime: number;
  details?: Record<string, unknown>;
}

interface CircuitBreakerState {
  service: string;
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  failureThreshold: number;
  successCount: number;
  successThreshold: number;
  lastFailure?: number;
  cooldownMs: number;
  nextRetryAt?: number;
}

// ── Mock Implementations ────────────────────

class MockCVEScanner {
  private suppressedCVEs: Set<string> = new Set();
  private scanResults: CVEResult[] = [];

  async scan(dependencies: { name: string; version: string }[]): Promise<CVEResult[]> {
    // Simulate OSV.dev API scanning
    this.scanResults = [];

    for (const dep of dependencies) {
      // Simulate known vulnerabilities
      if (dep.name === 'lodash' && dep.version === '4.17.20') {
        this.scanResults.push({
          id: 'CVE-2021-23337',
          severity: 'high',
          cvss: 7.2,
          package: dep.name,
          version: dep.version,
          fixedIn: '4.17.21',
          description: 'Prototype pollution in lodash',
          published: '2021-02-15',
          suppressed: this.suppressedCVEs.has('CVE-2021-23337'),
        });
      }
      if (dep.name === 'express' && dep.version === '4.17.1') {
        this.scanResults.push({
          id: 'CVE-2024-29041',
          severity: 'medium',
          cvss: 5.3,
          package: dep.name,
          version: dep.version,
          fixedIn: '4.19.2',
          description: 'Open redirect vulnerability in express',
          published: '2024-03-25',
          suppressed: this.suppressedCVEs.has('CVE-2024-29041'),
        });
      }
      if (dep.name === 'critical-lib' && dep.version === '1.0.0') {
        this.scanResults.push({
          id: 'CVE-2025-0001',
          severity: 'critical',
          cvss: 9.8,
          package: dep.name,
          version: dep.version,
          fixedIn: '1.0.1',
          description: 'Remote code execution in critical-lib',
          published: '2025-01-01',
          suppressed: this.suppressedCVEs.has('CVE-2025-0001'),
        });
      }
    }

    return this.scanResults;
  }

  suppress(cveId: string): void {
    this.suppressedCVEs.add(cveId);
  }

  unsuppress(cveId: string): void {
    this.suppressedCVEs.delete(cveId);
  }

  isSuppressed(cveId: string): boolean {
    return this.suppressedCVEs.has(cveId);
  }

  getActiveCVEs(): CVEResult[] {
    return this.scanResults.filter(r => !r.suppressed);
  }

  getCriticalCVEs(): CVEResult[] {
    return this.getActiveCVEs().filter(r => r.severity === 'critical' || r.cvss >= 9.0);
  }

  getRemediableCVEs(): CVEResult[] {
    return this.getActiveCVEs().filter(r => r.fixedIn !== undefined);
  }

  getSeverityCounts(): Record<string, number> {
    const active = this.getActiveCVEs();
    return {
      critical: active.filter(r => r.severity === 'critical').length,
      high: active.filter(r => r.severity === 'high').length,
      medium: active.filter(r => r.severity === 'medium').length,
      low: active.filter(r => r.severity === 'low').length,
    };
  }
}

class MockDependencyCatalog {
  private dependencies: Map<string, Dependency> = new Map();

  add(dep: Dependency): void {
    this.dependencies.set(dep.name, dep);
  }

  remove(name: string): boolean {
    return this.dependencies.delete(name);
  }

  get(name: string): Dependency | undefined {
    return this.dependencies.get(name);
  }

  list(): Dependency[] {
    return Array.from(this.dependencies.values());
  }

  getOutdated(): Dependency[] {
    return this.list().filter(d => d.isOutdated);
  }

  getNonCompliant(): Dependency[] {
    return this.list().filter(d => !d.nMinusCompliant);
  }

  getVulnerable(): Dependency[] {
    return this.list().filter(d => d.vulnerabilities > 0);
  }

  checkNMinusCompliance(name: string): boolean {
    const dep = this.dependencies.get(name);
    if (!dep) return false;
    // N-1 compliance: version must be within 1 major version of latest
    const currentMajor = parseInt(dep.version.split('.')[0]);
    const latestMajor = parseInt(dep.latestVersion.split('.')[0]);
    return latestMajor - currentMajor <= 1;
  }

  generateSBOM(): SBOMEntry[] {
    return this.list().map(dep => ({
      type: 'library' as const,
      name: dep.name,
      version: dep.version,
      purl: `pkg:npm/${dep.name}@${dep.version}`,
      license: dep.license,
      hashes: [
        { algorithm: 'SHA-256', value: `sha256-${dep.name}-${dep.version}-mock` },
      ],
    }));
  }

  getComplianceReport(): {
    total: number;
    compliant: number;
    nonCompliant: number;
    vulnerable: number;
    outdated: number;
    complianceRate: number;
  } {
    const deps = this.list();
    const compliant = deps.filter(d => d.nMinusCompliant).length;
    return {
      total: deps.length,
      compliant,
      nonCompliant: deps.length - compliant,
      vulnerable: this.getVulnerable().length,
      outdated: this.getOutdated().length,
      complianceRate: deps.length > 0 ? (compliant / deps.length) * 100 : 100,
    };
  }
}

class MockHealthMonitor {
  private checks: Map<string, HealthCheck> = new Map();
  private history: Map<string, HealthCheck[]> = new Map();

  register(service: string): void {
    this.checks.set(service, {
      service,
      status: 'unknown',
      latencyMs: 0,
      lastCheck: 0,
      consecutiveFailures: 0,
      uptime: 100,
    });
    this.history.set(service, []);
  }

  recordCheck(service: string, status: HealthCheck['status'], latencyMs: number, details?: Record<string, unknown>): HealthCheck {
    const existing = this.checks.get(service);
    if (!existing) throw new Error(`Service '${service}' not registered`);

    const check: HealthCheck = {
      service,
      status,
      latencyMs,
      lastCheck: Date.now(),
      consecutiveFailures: status === 'unhealthy'
        ? existing.consecutiveFailures + 1
        : 0,
      uptime: this.calculateUptime(service, status),
      details,
    };

    this.checks.set(service, check);
    this.history.get(service)?.push(check);
    return check;
  }

  private calculateUptime(service: string, newStatus: HealthCheck['status']): number {
    const hist = this.history.get(service) ?? [];
    const total = hist.length + 1;
    const healthy = hist.filter(h => h.status === 'healthy').length + (newStatus === 'healthy' ? 1 : 0);
    return total > 0 ? (healthy / total) * 100 : 100;
  }

  getStatus(service: string): HealthCheck | undefined {
    return this.checks.get(service);
  }

  getAllStatuses(): HealthCheck[] {
    return Array.from(this.checks.values());
  }

  getUnhealthyServices(): HealthCheck[] {
    return this.getAllStatuses().filter(c => c.status === 'unhealthy');
  }

  getDegradedServices(): HealthCheck[] {
    return this.getAllStatuses().filter(c => c.status === 'degraded');
  }

  isSystemHealthy(): boolean {
    return this.getUnhealthyServices().length === 0;
  }

  getAverageLatency(): number {
    const statuses = this.getAllStatuses().filter(s => s.latencyMs > 0);
    if (statuses.length === 0) return 0;
    return statuses.reduce((sum, s) => sum + s.latencyMs, 0) / statuses.length;
  }

  getServiceHistory(service: string): HealthCheck[] {
    return this.history.get(service) ?? [];
  }
}

class MockCircuitBreaker {
  private breakers: Map<string, CircuitBreakerState> = new Map();

  register(service: string, options: { failureThreshold?: number; successThreshold?: number; cooldownMs?: number } = {}): void {
    this.breakers.set(service, {
      service,
      state: 'closed',
      failureCount: 0,
      failureThreshold: options.failureThreshold ?? 5,
      successCount: 0,
      successThreshold: options.successThreshold ?? 3,
      cooldownMs: options.cooldownMs ?? 30000,
    });
  }

  recordFailure(service: string): CircuitBreakerState {
    const breaker = this.breakers.get(service);
    if (!breaker) throw new Error(`Circuit breaker for '${service}' not registered`);

    breaker.failureCount++;
    breaker.lastFailure = Date.now();
    breaker.successCount = 0;

    if (breaker.failureCount >= breaker.failureThreshold) {
      breaker.state = 'open';
      breaker.nextRetryAt = Date.now() + breaker.cooldownMs;
    }

    this.breakers.set(service, breaker);
    return { ...breaker };
  }

  recordSuccess(service: string): CircuitBreakerState {
    const breaker = this.breakers.get(service);
    if (!breaker) throw new Error(`Circuit breaker for '${service}' not registered`);

    breaker.successCount++;
    breaker.failureCount = Math.max(0, breaker.failureCount - 1);

    if (breaker.state === 'half-open' && breaker.successCount >= breaker.successThreshold) {
      breaker.state = 'closed';
      breaker.failureCount = 0;
      breaker.successCount = 0;
    }

    this.breakers.set(service, breaker);
    return { ...breaker };
  }

  canExecute(service: string): boolean {
    const breaker = this.breakers.get(service);
    if (!breaker) return true;

    if (breaker.state === 'closed') return true;
    if (breaker.state === 'open') {
      if (breaker.nextRetryAt && Date.now() >= breaker.nextRetryAt) {
        breaker.state = 'half-open';
        breaker.successCount = 0;
        this.breakers.set(service, breaker);
        return true;
      }
      return false;
    }
    // half-open: allow limited requests
    return true;
  }

  getState(service: string): CircuitBreakerState | undefined {
    return this.breakers.get(service);
  }

  reset(service: string): void {
    const breaker = this.breakers.get(service);
    if (breaker) {
      breaker.state = 'closed';
      breaker.failureCount = 0;
      breaker.successCount = 0;
      breaker.lastFailure = undefined;
      breaker.nextRetryAt = undefined;
      this.breakers.set(service, breaker);
    }
  }

  getAllStates(): CircuitBreakerState[] {
    return Array.from(this.breakers.values());
  }

  getOpenCircuits(): CircuitBreakerState[] {
    return this.getAllStates().filter(b => b.state === 'open');
  }
}

// ── Tests ───────────────────────────────────

describe('Self-Healing — CVE Scanner', () => {
  let scanner: MockCVEScanner;

  beforeEach(() => {
    scanner = new MockCVEScanner();
  });

  describe('scan()', () => {
    it('should detect known vulnerabilities', async () => {
      const results = await scanner.scan([
        { name: 'lodash', version: '4.17.20' },
      ]);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('CVE-2021-23337');
      expect(results[0].severity).toBe('high');
    });

    it('should return empty for clean dependencies', async () => {
      const results = await scanner.scan([
        { name: 'safe-lib', version: '1.0.0' },
      ]);
      expect(results).toHaveLength(0);
    });

    it('should detect multiple vulnerabilities across packages', async () => {
      const results = await scanner.scan([
        { name: 'lodash', version: '4.17.20' },
        { name: 'express', version: '4.17.1' },
        { name: 'critical-lib', version: '1.0.0' },
      ]);
      expect(results).toHaveLength(3);
    });

    it('should include fix version when available', async () => {
      const results = await scanner.scan([
        { name: 'lodash', version: '4.17.20' },
      ]);
      expect(results[0].fixedIn).toBe('4.17.21');
    });

    it('should include CVSS score', async () => {
      const results = await scanner.scan([
        { name: 'critical-lib', version: '1.0.0' },
      ]);
      expect(results[0].cvss).toBe(9.8);
    });
  });

  describe('suppression', () => {
    it('should suppress a CVE', async () => {
      await scanner.scan([{ name: 'lodash', version: '4.17.20' }]);
      scanner.suppress('CVE-2021-23337');
      expect(scanner.isSuppressed('CVE-2021-23337')).toBe(true);
    });

    it('should exclude suppressed CVEs from active results', async () => {
      await scanner.scan([
        { name: 'lodash', version: '4.17.20' },
        { name: 'express', version: '4.17.1' },
      ]);
      scanner.suppress('CVE-2021-23337');
      expect(scanner.getActiveCVEs()).toHaveLength(1);
      expect(scanner.getActiveCVEs()[0].id).toBe('CVE-2024-29041');
    });

    it('should unsuppress a CVE', () => {
      scanner.suppress('CVE-2021-23337');
      scanner.unsuppress('CVE-2021-23337');
      expect(scanner.isSuppressed('CVE-2021-23337')).toBe(false);
    });
  });

  describe('filtering', () => {
    it('should identify critical CVEs', async () => {
      await scanner.scan([
        { name: 'lodash', version: '4.17.20' },
        { name: 'critical-lib', version: '1.0.0' },
      ]);
      const critical = scanner.getCriticalCVEs();
      expect(critical).toHaveLength(1);
      expect(critical[0].severity).toBe('critical');
    });

    it('should identify remediable CVEs', async () => {
      await scanner.scan([
        { name: 'lodash', version: '4.17.20' },
        { name: 'express', version: '4.17.1' },
      ]);
      const remediable = scanner.getRemediableCVEs();
      expect(remediable).toHaveLength(2);
      expect(remediable.every(r => r.fixedIn !== undefined)).toBe(true);
    });

    it('should provide severity counts', async () => {
      await scanner.scan([
        { name: 'lodash', version: '4.17.20' },
        { name: 'express', version: '4.17.1' },
        { name: 'critical-lib', version: '1.0.0' },
      ]);
      const counts = scanner.getSeverityCounts();
      expect(counts.critical).toBe(1);
      expect(counts.high).toBe(1);
      expect(counts.medium).toBe(1);
      expect(counts.low).toBe(0);
    });
  });
});

describe('Self-Healing — Dependency Catalog', () => {
  let catalog: MockDependencyCatalog;

  beforeEach(() => {
    catalog = new MockDependencyCatalog();
    catalog.add({ name: 'react', version: '18.3.0', latestVersion: '18.3.1', isOutdated: true, nMinusCompliant: true, license: 'MIT', directDependency: true, vulnerabilities: 0 });
    catalog.add({ name: 'vite', version: '5.4.0', latestVersion: '5.4.2', isOutdated: true, nMinusCompliant: true, license: 'MIT', directDependency: true, vulnerabilities: 0 });
    catalog.add({ name: 'lodash', version: '4.17.20', latestVersion: '4.17.21', isOutdated: true, nMinusCompliant: true, license: 'MIT', directDependency: false, vulnerabilities: 1 });
    catalog.add({ name: 'old-lib', version: '1.0.0', latestVersion: '3.0.0', isOutdated: true, nMinusCompliant: false, license: 'Apache-2.0', directDependency: false, vulnerabilities: 2 });
    catalog.add({ name: 'hono', version: '4.0.0', latestVersion: '4.0.0', isOutdated: false, nMinusCompliant: true, license: 'MIT', directDependency: true, vulnerabilities: 0 });
  });

  describe('CRUD operations', () => {
    it('should list all dependencies', () => {
      expect(catalog.list()).toHaveLength(5);
    });

    it('should get a specific dependency', () => {
      const dep = catalog.get('react');
      expect(dep?.version).toBe('18.3.0');
      expect(dep?.license).toBe('MIT');
    });

    it('should return undefined for non-existent dependency', () => {
      expect(catalog.get('nonexistent')).toBeUndefined();
    });

    it('should remove a dependency', () => {
      expect(catalog.remove('lodash')).toBe(true);
      expect(catalog.get('lodash')).toBeUndefined();
      expect(catalog.list()).toHaveLength(4);
    });

    it('should return false when removing non-existent dependency', () => {
      expect(catalog.remove('ghost')).toBe(false);
    });
  });

  describe('compliance checks', () => {
    it('should identify outdated dependencies', () => {
      const outdated = catalog.getOutdated();
      expect(outdated).toHaveLength(4);
      expect(outdated.every(d => d.isOutdated)).toBe(true);
    });

    it('should identify non-compliant dependencies', () => {
      const nonCompliant = catalog.getNonCompliant();
      expect(nonCompliant).toHaveLength(1);
      expect(nonCompliant[0].name).toBe('old-lib');
    });

    it('should identify vulnerable dependencies', () => {
      const vulnerable = catalog.getVulnerable();
      expect(vulnerable).toHaveLength(2);
    });

    it('should check N-1 compliance for a specific dependency', () => {
      expect(catalog.checkNMinusCompliance('react')).toBe(true); // 18 vs 18
      expect(catalog.checkNMinusCompliance('old-lib')).toBe(false); // 1 vs 3
    });

    it('should return false for N-1 check on non-existent dependency', () => {
      expect(catalog.checkNMinusCompliance('ghost')).toBe(false);
    });

    it('should generate compliance report', () => {
      const report = catalog.getComplianceReport();
      expect(report.total).toBe(5);
      expect(report.compliant).toBe(4);
      expect(report.nonCompliant).toBe(1);
      expect(report.vulnerable).toBe(2);
      expect(report.outdated).toBe(4);
      expect(report.complianceRate).toBe(80);
    });
  });

  describe('SBOM generation', () => {
    it('should generate CycloneDX-compatible SBOM entries', () => {
      const sbom = catalog.generateSBOM();
      expect(sbom).toHaveLength(5);
    });

    it('should include package URLs (purl)', () => {
      const sbom = catalog.generateSBOM();
      const react = sbom.find(e => e.name === 'react');
      expect(react?.purl).toBe('pkg:npm/react@18.3.0');
    });

    it('should include license information', () => {
      const sbom = catalog.generateSBOM();
      expect(sbom.every(e => e.license.length > 0)).toBe(true);
    });

    it('should include hash values', () => {
      const sbom = catalog.generateSBOM();
      expect(sbom.every(e => e.hashes.length > 0)).toBe(true);
      expect(sbom[0].hashes[0].algorithm).toBe('SHA-256');
    });

    it('should set type as library for all entries', () => {
      const sbom = catalog.generateSBOM();
      expect(sbom.every(e => e.type === 'library')).toBe(true);
    });
  });
});

describe('Self-Healing — Health Monitor', () => {
  let monitor: MockHealthMonitor;

  beforeEach(() => {
    monitor = new MockHealthMonitor();
    monitor.register('identity-worker');
    monitor.register('filesystem-worker');
    monitor.register('registry-worker');
    monitor.register('ai-worker');
  });

  describe('health checks', () => {
    it('should register services with unknown status', () => {
      const status = monitor.getStatus('identity-worker');
      expect(status?.status).toBe('unknown');
    });

    it('should record healthy checks', () => {
      monitor.recordCheck('identity-worker', 'healthy', 45);
      const status = monitor.getStatus('identity-worker');
      expect(status?.status).toBe('healthy');
      expect(status?.latencyMs).toBe(45);
      expect(status?.consecutiveFailures).toBe(0);
    });

    it('should track consecutive failures', () => {
      monitor.recordCheck('ai-worker', 'unhealthy', 0);
      monitor.recordCheck('ai-worker', 'unhealthy', 0);
      monitor.recordCheck('ai-worker', 'unhealthy', 0);
      const status = monitor.getStatus('ai-worker');
      expect(status?.consecutiveFailures).toBe(3);
    });

    it('should reset consecutive failures on healthy check', () => {
      monitor.recordCheck('ai-worker', 'unhealthy', 0);
      monitor.recordCheck('ai-worker', 'unhealthy', 0);
      monitor.recordCheck('ai-worker', 'healthy', 120);
      const status = monitor.getStatus('ai-worker');
      expect(status?.consecutiveFailures).toBe(0);
    });

    it('should throw for unregistered services', () => {
      expect(() => monitor.recordCheck('ghost', 'healthy', 0)).toThrow();
    });

    it('should include details in health check', () => {
      monitor.recordCheck('filesystem-worker', 'healthy', 30, { r2Latency: 15, objectCount: 1234 });
      const status = monitor.getStatus('filesystem-worker');
      expect(status?.details).toEqual({ r2Latency: 15, objectCount: 1234 });
    });
  });

  describe('system health', () => {
    it('should report system as healthy when all services are healthy', () => {
      monitor.recordCheck('identity-worker', 'healthy', 45);
      monitor.recordCheck('filesystem-worker', 'healthy', 30);
      monitor.recordCheck('registry-worker', 'healthy', 55);
      monitor.recordCheck('ai-worker', 'healthy', 120);
      expect(monitor.isSystemHealthy()).toBe(true);
    });

    it('should report system as unhealthy when any service is unhealthy', () => {
      monitor.recordCheck('identity-worker', 'healthy', 45);
      monitor.recordCheck('filesystem-worker', 'unhealthy', 0);
      expect(monitor.isSystemHealthy()).toBe(false);
    });

    it('should list unhealthy services', () => {
      monitor.recordCheck('identity-worker', 'healthy', 45);
      monitor.recordCheck('filesystem-worker', 'unhealthy', 0);
      monitor.recordCheck('ai-worker', 'unhealthy', 0);
      const unhealthy = monitor.getUnhealthyServices();
      expect(unhealthy).toHaveLength(2);
    });

    it('should list degraded services', () => {
      monitor.recordCheck('identity-worker', 'degraded', 500);
      monitor.recordCheck('filesystem-worker', 'healthy', 30);
      const degraded = monitor.getDegradedServices();
      expect(degraded).toHaveLength(1);
      expect(degraded[0].service).toBe('identity-worker');
    });

    it('should calculate average latency', () => {
      monitor.recordCheck('identity-worker', 'healthy', 40);
      monitor.recordCheck('filesystem-worker', 'healthy', 60);
      expect(monitor.getAverageLatency()).toBe(50);
    });
  });

  describe('uptime tracking', () => {
    it('should calculate uptime percentage', () => {
      monitor.recordCheck('identity-worker', 'healthy', 45);
      monitor.recordCheck('identity-worker', 'healthy', 42);
      monitor.recordCheck('identity-worker', 'unhealthy', 0);
      monitor.recordCheck('identity-worker', 'healthy', 50);
      const status = monitor.getStatus('identity-worker');
      // 3 healthy out of 4 checks = 75%
      expect(status?.uptime).toBe(75);
    });

    it('should maintain service history', () => {
      monitor.recordCheck('identity-worker', 'healthy', 45);
      monitor.recordCheck('identity-worker', 'degraded', 200);
      monitor.recordCheck('identity-worker', 'healthy', 50);
      const history = monitor.getServiceHistory('identity-worker');
      expect(history).toHaveLength(3);
      expect(history[0].status).toBe('healthy');
      expect(history[1].status).toBe('degraded');
      expect(history[2].status).toBe('healthy');
    });
  });
});

describe('Self-Healing — Circuit Breaker', () => {
  let cb: MockCircuitBreaker;

  beforeEach(() => {
    cb = new MockCircuitBreaker();
    cb.register('identity-worker', { failureThreshold: 3, successThreshold: 2, cooldownMs: 100 });
    cb.register('ai-worker', { failureThreshold: 5, cooldownMs: 200 });
  });

  describe('state transitions', () => {
    it('should start in closed state', () => {
      expect(cb.getState('identity-worker')?.state).toBe('closed');
    });

    it('should allow execution in closed state', () => {
      expect(cb.canExecute('identity-worker')).toBe(true);
    });

    it('should open after reaching failure threshold', () => {
      cb.recordFailure('identity-worker');
      cb.recordFailure('identity-worker');
      const state = cb.recordFailure('identity-worker'); // 3rd failure = threshold
      expect(state.state).toBe('open');
    });

    it('should block execution in open state', () => {
      cb.recordFailure('identity-worker');
      cb.recordFailure('identity-worker');
      cb.recordFailure('identity-worker');
      expect(cb.canExecute('identity-worker')).toBe(false);
    });

    it('should transition to half-open after cooldown', async () => {
      cb.recordFailure('identity-worker');
      cb.recordFailure('identity-worker');
      cb.recordFailure('identity-worker');
      expect(cb.canExecute('identity-worker')).toBe(false);

      // Wait for cooldown (100ms)
      await new Promise(r => setTimeout(r, 150));
      expect(cb.canExecute('identity-worker')).toBe(true);
      expect(cb.getState('identity-worker')?.state).toBe('half-open');
    });

    it('should close after success threshold in half-open state', async () => {
      // Open the circuit
      cb.recordFailure('identity-worker');
      cb.recordFailure('identity-worker');
      cb.recordFailure('identity-worker');

      // Wait for cooldown
      await new Promise(r => setTimeout(r, 150));
      cb.canExecute('identity-worker'); // Triggers half-open

      // Record successes
      cb.recordSuccess('identity-worker');
      const state = cb.recordSuccess('identity-worker'); // 2nd success = threshold
      expect(state.state).toBe('closed');
      expect(state.failureCount).toBe(0);
    });
  });

  describe('failure tracking', () => {
    it('should increment failure count', () => {
      cb.recordFailure('identity-worker');
      expect(cb.getState('identity-worker')?.failureCount).toBe(1);
      cb.recordFailure('identity-worker');
      expect(cb.getState('identity-worker')?.failureCount).toBe(2);
    });

    it('should reset success count on failure', () => {
      cb.recordSuccess('identity-worker');
      cb.recordSuccess('identity-worker');
      cb.recordFailure('identity-worker');
      expect(cb.getState('identity-worker')?.successCount).toBe(0);
    });

    it('should decrement failure count on success', () => {
      cb.recordFailure('identity-worker');
      cb.recordFailure('identity-worker');
      cb.recordSuccess('identity-worker');
      expect(cb.getState('identity-worker')?.failureCount).toBe(1);
    });

    it('should not go below zero failures', () => {
      cb.recordSuccess('identity-worker');
      cb.recordSuccess('identity-worker');
      expect(cb.getState('identity-worker')?.failureCount).toBe(0);
    });

    it('should throw for unregistered services', () => {
      expect(() => cb.recordFailure('ghost')).toThrow();
      expect(() => cb.recordSuccess('ghost')).toThrow();
    });
  });

  describe('management', () => {
    it('should reset a circuit breaker', () => {
      cb.recordFailure('identity-worker');
      cb.recordFailure('identity-worker');
      cb.recordFailure('identity-worker');
      cb.reset('identity-worker');
      expect(cb.getState('identity-worker')?.state).toBe('closed');
      expect(cb.getState('identity-worker')?.failureCount).toBe(0);
    });

    it('should list all circuit breaker states', () => {
      expect(cb.getAllStates()).toHaveLength(2);
    });

    it('should list open circuits', () => {
      cb.recordFailure('identity-worker');
      cb.recordFailure('identity-worker');
      cb.recordFailure('identity-worker');
      expect(cb.getOpenCircuits()).toHaveLength(1);
      expect(cb.getOpenCircuits()[0].service).toBe('identity-worker');
    });

    it('should allow execution for unregistered services (fail-open)', () => {
      expect(cb.canExecute('unknown-service')).toBe(true);
    });

    it('should support different thresholds per service', () => {
      // identity-worker has threshold 3
      cb.recordFailure('identity-worker');
      cb.recordFailure('identity-worker');
      cb.recordFailure('identity-worker');
      expect(cb.getState('identity-worker')?.state).toBe('open');

      // ai-worker has threshold 5
      cb.recordFailure('ai-worker');
      cb.recordFailure('ai-worker');
      cb.recordFailure('ai-worker');
      expect(cb.getState('ai-worker')?.state).toBe('closed'); // Not yet at threshold
    });
  });
});

describe('Self-Healing — Integration Scenarios', () => {
  let scanner: MockCVEScanner;
  let catalog: MockDependencyCatalog;
  let monitor: MockHealthMonitor;
  let cb: MockCircuitBreaker;

  beforeEach(() => {
    scanner = new MockCVEScanner();
    catalog = new MockDependencyCatalog();
    monitor = new MockHealthMonitor();
    cb = new MockCircuitBreaker();

    monitor.register('self-healing-engine');
    cb.register('self-healing-engine', { failureThreshold: 3, cooldownMs: 100 });
  });

  it('should perform full scan → catalog → SBOM pipeline', async () => {
    // Add dependencies to catalog
    catalog.add({ name: 'lodash', version: '4.17.20', latestVersion: '4.17.21', isOutdated: true, nMinusCompliant: true, license: 'MIT', directDependency: false, vulnerabilities: 0 });
    catalog.add({ name: 'react', version: '18.3.0', latestVersion: '18.3.1', isOutdated: true, nMinusCompliant: true, license: 'MIT', directDependency: true, vulnerabilities: 0 });

    // Scan for CVEs
    const deps = catalog.list().map(d => ({ name: d.name, version: d.version }));
    const cves = await scanner.scan(deps);

    // Update vulnerability counts
    for (const cve of cves) {
      const dep = catalog.get(cve.package);
      if (dep) {
        dep.vulnerabilities++;
      }
    }

    // Generate SBOM
    const sbom = catalog.generateSBOM();

    // Verify
    expect(cves).toHaveLength(1); // lodash CVE
    expect(catalog.get('lodash')?.vulnerabilities).toBe(1);
    expect(sbom).toHaveLength(2);
    expect(catalog.getComplianceReport().vulnerable).toBe(1);
  });

  it('should trigger circuit breaker on repeated scan failures', () => {
    // Simulate scan failures
    cb.recordFailure('self-healing-engine');
    cb.recordFailure('self-healing-engine');
    cb.recordFailure('self-healing-engine');

    expect(cb.canExecute('self-healing-engine')).toBe(false);
    monitor.recordCheck('self-healing-engine', 'unhealthy', 0, { reason: 'circuit-open' });
    expect(monitor.getStatus('self-healing-engine')?.status).toBe('unhealthy');
  });

  it('should recover after circuit breaker cooldown', async () => {
    // Trip the breaker
    cb.recordFailure('self-healing-engine');
    cb.recordFailure('self-healing-engine');
    cb.recordFailure('self-healing-engine');

    // Wait for cooldown
    await new Promise(r => setTimeout(r, 150));

    // Should be able to execute again
    expect(cb.canExecute('self-healing-engine')).toBe(true);

    // Record successful scan
    cb.recordSuccess('self-healing-engine');
    cb.recordSuccess('self-healing-engine');
    cb.recordSuccess('self-healing-engine');
    monitor.recordCheck('self-healing-engine', 'healthy', 250);

    expect(cb.getState('self-healing-engine')?.state).toBe('closed');
    expect(monitor.getStatus('self-healing-engine')?.status).toBe('healthy');
  });
});
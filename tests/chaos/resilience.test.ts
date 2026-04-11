import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ─────────────────────────────────────────────
   Infinity OS — Chaos &amp; Resilience Tests
   Tests for system behavior under adverse
   conditions: cascading failures, resource
   exhaustion, network partitions, data
   corruption, and recovery scenarios.
   ───────────────────────────────────────────── */

// ── Mock Resilient System ───────────────────

interface ServiceNode {
  id: string;
  name: string;
  status: 'healthy' | 'degraded' | 'down' | 'recovering';
  dependencies: string[];
  circuitBreakerOpen: boolean;
  requestQueue: number;
  maxQueueSize: number;
  memoryUsageMB: number;
  maxMemoryMB: number;
  cpuPercent: number;
  errorRate: number;
  lastHealthCheck: number;
  recoveryAttempts: number;
  maxRecoveryAttempts: number;
}

interface ChaosEvent {
  type: 'kill' | 'network-partition' | 'memory-pressure' | 'cpu-spike' | 'latency-inject' | 'data-corrupt' | 'dependency-fail' | 'queue-flood';
  targetService: string;
  severity: 'minor' | 'major' | 'critical';
  timestamp: number;
  duration?: number;
}

interface RecoveryAction {
  service: string;
  action: 'restart' | 'failover' | 'scale-up' | 'circuit-break' | 'queue-drain' | 'cache-clear' | 'rollback';
  triggeredAt: number;
  completedAt?: number;
  success: boolean;
  details: string;
}

class MockResilientSystem {
  private services: Map<string, ServiceNode> = new Map();
  private chaosLog: ChaosEvent[] = [];
  private recoveryLog: RecoveryAction[] = [];
  private networkPartitions: Set<string> = new Set(); // "serviceA->serviceB" format

  constructor() {
    this.initializeServices();
  }

  private initializeServices(): void {
    const serviceConfigs: Omit<ServiceNode, 'status' | 'circuitBreakerOpen' | 'requestQueue' | 'memoryUsageMB' | 'cpuPercent' | 'errorRate' | 'lastHealthCheck' | 'recoveryAttempts'>[] = [
      { id: 'identity', name: 'Identity Worker', dependencies: ['database', 'vault'], maxQueueSize: 500, maxMemoryMB: 128, maxRecoveryAttempts: 3 },
      { id: 'filesystem', name: 'Filesystem Worker', dependencies: ['r2-storage'], maxQueueSize: 1000, maxMemoryMB: 256, maxRecoveryAttempts: 3 },
      { id: 'registry', name: 'Registry Worker', dependencies: ['database', 'r2-storage'], maxQueueSize: 300, maxMemoryMB: 128, maxRecoveryAttempts: 3 },
      { id: 'search', name: 'Search Worker', dependencies: ['database', 'kv-cache'], maxQueueSize: 500, maxMemoryMB: 128, maxRecoveryAttempts: 3 },
      { id: 'ai', name: 'AI Worker', dependencies: ['database', 'kv-cache', 'external-ai'], maxQueueSize: 200, maxMemoryMB: 512, maxRecoveryAttempts: 5 },
      { id: 'notifications', name: 'Notifications Worker', dependencies: ['database', 'kv-cache'], maxQueueSize: 2000, maxMemoryMB: 64, maxRecoveryAttempts: 3 },
      { id: 'database', name: 'Supabase PostgreSQL', dependencies: [], maxQueueSize: 5000, maxMemoryMB: 1024, maxRecoveryAttempts: 5 },
      { id: 'r2-storage', name: 'Cloudflare R2', dependencies: [], maxQueueSize: 10000, maxMemoryMB: 0, maxRecoveryAttempts: 3 },
      { id: 'kv-cache', name: 'Cloudflare KV', dependencies: [], maxQueueSize: 50000, maxMemoryMB: 0, maxRecoveryAttempts: 3 },
      { id: 'vault', name: 'HashiCorp Vault', dependencies: [], maxQueueSize: 1000, maxMemoryMB: 256, maxRecoveryAttempts: 5 },
      { id: 'external-ai', name: 'External AI Provider', dependencies: [], maxQueueSize: 100, maxMemoryMB: 0, maxRecoveryAttempts: 2 },
      { id: 'traefik', name: 'Traefik Proxy', dependencies: [], maxQueueSize: 50000, maxMemoryMB: 128, maxRecoveryAttempts: 3 },
    ];

    for (const config of serviceConfigs) {
      this.services.set(config.id, {
        ...config,
        status: 'healthy',
        circuitBreakerOpen: false,
        requestQueue: 0,
        memoryUsageMB: Math.floor(config.maxMemoryMB * 0.3),
        cpuPercent: Math.floor(Math.random() * 20) + 5,
        errorRate: 0,
        lastHealthCheck: Date.now(),
        recoveryAttempts: 0,
      });
    }
  }

  // ── Chaos Injection ──

  injectChaos(event: ChaosEvent): void {
    this.chaosLog.push(event);
    const service = this.services.get(event.targetService);
    if (!service) return;

    switch (event.type) {
      case 'kill':
        service.status = 'down';
        service.requestQueue = 0;
        this.propagateFailure(event.targetService);
        break;

      case 'network-partition':
        service.status = 'degraded';
        service.errorRate = 0.5;
        for (const dep of service.dependencies) {
          this.networkPartitions.add(`${event.targetService}->${dep}`);
        }
        break;

      case 'memory-pressure':
        service.memoryUsageMB = Math.min(service.maxMemoryMB * 0.95, service.memoryUsageMB * 3);
        if (service.memoryUsageMB >= service.maxMemoryMB * 0.9) {
          service.status = 'degraded';
          service.errorRate = 0.3;
        }
        break;

      case 'cpu-spike':
        service.cpuPercent = Math.min(98, service.cpuPercent + 70);
        if (service.cpuPercent > 90) {
          service.status = 'degraded';
          service.errorRate = 0.2;
        }
        break;

      case 'latency-inject':
        service.status = 'degraded';
        service.errorRate = 0.1;
        break;

      case 'data-corrupt':
        service.status = 'degraded';
        service.errorRate = 0.8;
        break;

      case 'dependency-fail':
        for (const dep of service.dependencies) {
          const depService = this.services.get(dep);
          if (depService) {
            depService.status = 'down';
            depService.errorRate = 1.0;
          }
        }
        service.status = 'degraded';
        service.errorRate = 0.7;
        break;

      case 'queue-flood':
        service.requestQueue = service.maxQueueSize * 2;
        if (service.requestQueue > service.maxQueueSize) {
          service.status = 'degraded';
          service.errorRate = 0.4;
        }
        break;
    }
  }

  private propagateFailure(failedServiceId: string): void {
    for (const [id, service] of this.services) {
      if (service.dependencies.includes(failedServiceId) &amp;&amp; service.status === 'healthy') {
        service.status = 'degraded';
        service.errorRate = Math.min(1, service.errorRate + 0.3);
        service.circuitBreakerOpen = true;
      }
    }
  }

  // ── Self-Healing / Recovery ──

  attemptRecovery(serviceId: string): RecoveryAction {
    const service = this.services.get(serviceId);
    if (!service) {
      return { service: serviceId, action: 'restart', triggeredAt: Date.now(), success: false, details: 'Service not found' };
    }

    if (service.recoveryAttempts >= service.maxRecoveryAttempts) {
      const action: RecoveryAction = {
        service: serviceId, action: 'failover', triggeredAt: Date.now(),
        success: false, details: `Max recovery attempts (${service.maxRecoveryAttempts}) exceeded — manual intervention required`,
      };
      this.recoveryLog.push(action);
      return action;
    }

    service.recoveryAttempts++;
    let recoveryAction: RecoveryAction;

    if (service.status === 'down') {
      recoveryAction = {
        service: serviceId, action: 'restart', triggeredAt: Date.now(),
        completedAt: Date.now() + 2000, success: true,
        details: `Service restarted (attempt ${service.recoveryAttempts}/${service.maxRecoveryAttempts})`,
      };
      service.status = 'recovering';
      service.status = 'healthy';
      service.errorRate = 0;
      service.requestQueue = 0;
      service.memoryUsageMB = Math.floor(service.maxMemoryMB * 0.3);
      service.cpuPercent = 15;
    } else if (service.requestQueue > service.maxQueueSize) {
      recoveryAction = {
        service: serviceId, action: 'queue-drain', triggeredAt: Date.now(),
        completedAt: Date.now() + 1000, success: true,
        details: `Queue drained from ${service.requestQueue} to ${Math.floor(service.maxQueueSize * 0.5)}`,
      };
      service.requestQueue = Math.floor(service.maxQueueSize * 0.5);
      service.status = 'healthy';
      service.errorRate = 0;
    } else if (service.memoryUsageMB > service.maxMemoryMB * 0.8) {
      recoveryAction = {
        service: serviceId, action: 'cache-clear', triggeredAt: Date.now(),
        completedAt: Date.now() + 500, success: true,
        details: `Memory freed: ${service.memoryUsageMB}MB → ${Math.floor(service.maxMemoryMB * 0.4)}MB`,
      };
      service.memoryUsageMB = Math.floor(service.maxMemoryMB * 0.4);
      service.status = 'healthy';
      service.errorRate = 0;
    } else if (service.circuitBreakerOpen) {
      recoveryAction = {
        service: serviceId, action: 'circuit-break', triggeredAt: Date.now(),
        completedAt: Date.now() + 100, success: true,
        details: 'Circuit breaker reset to half-open state',
      };
      service.circuitBreakerOpen = false;
      service.status = 'healthy';
      service.errorRate = 0;
    } else {
      recoveryAction = {
        service: serviceId, action: 'restart', triggeredAt: Date.now(),
        completedAt: Date.now() + 2000, success: true,
        details: `Generic recovery restart (attempt ${service.recoveryAttempts})`,
      };
      service.status = 'healthy';
      service.errorRate = 0;
    }

    this.recoveryLog.push(recoveryAction);
    return recoveryAction;
  }

  healNetworkPartitions(): number {
    const count = this.networkPartitions.size;
    this.networkPartitions.clear();
    for (const service of this.services.values()) {
      if (service.status === 'degraded' &amp;&amp; service.errorRate === 0.5) {
        service.status = 'healthy';
        service.errorRate = 0;
      }
    }
    return count;
  }

  // ── Queries ──

  getService(id: string): ServiceNode | undefined {
    return this.services.get(id);
  }

  getAllServices(): ServiceNode[] {
    return Array.from(this.services.values());
  }

  getHealthyServices(): ServiceNode[] {
    return this.getAllServices().filter(s => s.status === 'healthy');
  }

  getUnhealthyServices(): ServiceNode[] {
    return this.getAllServices().filter(s => s.status !== 'healthy');
  }

  isSystemOperational(): boolean {
    const coreServices = ['identity', 'database', 'traefik'];
    return coreServices.every(id => {
      const svc = this.services.get(id);
      return svc &amp;&amp; (svc.status === 'healthy' || svc.status === 'degraded');
    });
  }

  getSystemHealthScore(): number {
    const services = this.getAllServices();
    const weights: Record<string, number> = {
      healthy: 1, degraded: 0.5, recovering: 0.3, down: 0,
    };
    const totalScore = services.reduce((sum, s) => sum + (weights[s.status] ?? 0), 0);
    return Math.round((totalScore / services.length) * 100);
  }

  getChaosLog(): ChaosEvent[] {
    return [...this.chaosLog];
  }

  getRecoveryLog(): RecoveryAction[] {
    return [...this.recoveryLog];
  }

  getNetworkPartitions(): string[] {
    return Array.from(this.networkPartitions);
  }

  getAffectedServices(failedServiceId: string): string[] {
    return this.getAllServices()
      .filter(s => s.dependencies.includes(failedServiceId))
      .map(s => s.id);
  }

  resetAll(): void {
    this.initializeServices();
    this.chaosLog = [];
    this.recoveryLog = [];
    this.networkPartitions.clear();
  }
}

// ── Tests ───────────────────────────────────

describe('Chaos — Service Kill &amp; Recovery', () => {
  let system: MockResilientSystem;

  beforeEach(() => {
    system = new MockResilientSystem();
  });

  it('should start with all services healthy', () => {
    expect(system.getHealthyServices()).toHaveLength(12);
    expect(system.getSystemHealthScore()).toBe(100);
  });

  it('should mark killed service as down', () => {
    system.injectChaos({ type: 'kill', targetService: 'ai', severity: 'critical', timestamp: Date.now() });
    expect(system.getService('ai')?.status).toBe('down');
  });

  it('should recover a killed service via restart', () => {
    system.injectChaos({ type: 'kill', targetService: 'filesystem', severity: 'critical', timestamp: Date.now() });
    const recovery = system.attemptRecovery('filesystem');
    expect(recovery.success).toBe(true);
    expect(recovery.action).toBe('restart');
    expect(system.getService('filesystem')?.status).toBe('healthy');
  });

  it('should fail recovery after max attempts', () => {
    system.injectChaos({ type: 'kill', targetService: 'notifications', severity: 'critical', timestamp: Date.now() });

    for (let i = 0; i < 3; i++) {
      system.injectChaos({ type: 'kill', targetService: 'notifications', severity: 'critical', timestamp: Date.now() });
      system.attemptRecovery('notifications');
    }

    system.injectChaos({ type: 'kill', targetService: 'notifications', severity: 'critical', timestamp: Date.now() });
    const recovery = system.attemptRecovery('notifications');
    expect(recovery.success).toBe(false);
    expect(recovery.details).toContain('manual intervention');
  });

  it('should log all chaos events', () => {
    system.injectChaos({ type: 'kill', targetService: 'ai', severity: 'critical', timestamp: Date.now() });
    system.injectChaos({ type: 'memory-pressure', targetService: 'database', severity: 'major', timestamp: Date.now() });
    expect(system.getChaosLog()).toHaveLength(2);
  });

  it('should log all recovery actions', () => {
    system.injectChaos({ type: 'kill', targetService: 'ai', severity: 'critical', timestamp: Date.now() });
    system.attemptRecovery('ai');
    system.injectChaos({ type: 'kill', targetService: 'search', severity: 'critical', timestamp: Date.now() });
    system.attemptRecovery('search');
    expect(system.getRecoveryLog()).toHaveLength(2);
  });
});

describe('Chaos — Cascading Failures', () => {
  let system: MockResilientSystem;

  beforeEach(() => {
    system = new MockResilientSystem();
  });

  it('should propagate database failure to dependent services', () => {
    system.injectChaos({ type: 'kill', targetService: 'database', severity: 'critical', timestamp: Date.now() });

    const affected = system.getAffectedServices('database');
    expect(affected).toContain('identity');
    expect(affected).toContain('registry');
    expect(affected).toContain('search');
    expect(affected).toContain('ai');
    expect(affected).toContain('notifications');

    for (const svcId of affected) {
      const svc = system.getService(svcId);
      expect(svc?.status).toBe('degraded');
      expect(svc?.circuitBreakerOpen).toBe(true);
    }
  });

  it('should propagate R2 storage failure to filesystem and registry', () => {
    system.injectChaos({ type: 'kill', targetService: 'r2-storage', severity: 'critical', timestamp: Date.now() });
    const affected = system.getAffectedServices('r2-storage');
    expect(affected).toContain('filesystem');
    expect(affected).toContain('registry');
  });

  it('should propagate Vault failure to identity service', () => {
    system.injectChaos({ type: 'kill', targetService: 'vault', severity: 'critical', timestamp: Date.now() });
    expect(system.getService('identity')?.status).toBe('degraded');
    expect(system.getService('identity')?.circuitBreakerOpen).toBe(true);
  });

  it('should keep system operational when non-core service fails', () => {
    system.injectChaos({ type: 'kill', targetService: 'notifications', severity: 'critical', timestamp: Date.now() });
    expect(system.isSystemOperational()).toBe(true);
  });

  it('should report system non-operational when identity fails', () => {
    system.injectChaos({ type: 'kill', targetService: 'identity', severity: 'critical', timestamp: Date.now() });
    expect(system.isSystemOperational()).toBe(false);
  });

  it('should report system non-operational when database fails', () => {
    system.injectChaos({ type: 'kill', targetService: 'database', severity: 'critical', timestamp: Date.now() });
    expect(system.isSystemOperational()).toBe(false);
  });

  it('should degrade health score proportionally to failures', () => {
    expect(system.getSystemHealthScore()).toBe(100);

    system.injectChaos({ type: 'kill', targetService: 'ai', severity: 'critical', timestamp: Date.now() });
    const scoreAfterOne = system.getSystemHealthScore();
    expect(scoreAfterOne).toBeLessThan(100);

    system.injectChaos({ type: 'kill', targetService: 'notifications', severity: 'critical', timestamp: Date.now() });
    const scoreAfterTwo = system.getSystemHealthScore();
    expect(scoreAfterTwo).toBeLessThan(scoreAfterOne);
  });

  it('should recover cascading failure by fixing root cause', () => {
    system.injectChaos({ type: 'kill', targetService: 'database', severity: 'critical', timestamp: Date.now() });
    expect(system.getUnhealthyServices().length).toBeGreaterThan(1);

    system.attemptRecovery('database');
    expect(system.getService('database')?.status).toBe('healthy');

    const affected = system.getAffectedServices('database');
    for (const svcId of affected) {
      system.attemptRecovery(svcId);
    }

    expect(system.getHealthyServices().length).toBe(12);
    expect(system.getSystemHealthScore()).toBe(100);
  });
});

describe('Chaos — Network Partitions', () => {
  let system: MockResilientSystem;

  beforeEach(() => {
    system = new MockResilientSystem();
  });

  it('should create network partitions between service and dependencies', () => {
    system.injectChaos({ type: 'network-partition', targetService: 'identity', severity: 'major', timestamp: Date.now() });
    const partitions = system.getNetworkPartitions();
    expect(partitions.length).toBeGreaterThanOrEqual(2);
  });

  it('should degrade service during network partition', () => {
    system.injectChaos({ type: 'network-partition', targetService: 'search', severity: 'major', timestamp: Date.now() });
    expect(system.getService('search')?.status).toBe('degraded');
    expect(system.getService('search')?.errorRate).toBe(0.5);
  });

  it('should heal all network partitions', () => {
    system.injectChaos({ type: 'network-partition', targetService: 'identity', severity: 'major', timestamp: Date.now() });
    system.injectChaos({ type: 'network-partition', targetService: 'ai', severity: 'major', timestamp: Date.now() });

    const healed = system.healNetworkPartitions();
    expect(healed).toBeGreaterThan(0);
    expect(system.getNetworkPartitions()).toHaveLength(0);
  });

  it('should restore service health after partition heals', () => {
    system.injectChaos({ type: 'network-partition', targetService: 'registry', severity: 'major', timestamp: Date.now() });
    expect(system.getService('registry')?.status).toBe('degraded');

    system.healNetworkPartitions();
    expect(system.getService('registry')?.status).toBe('healthy');
  });
});

describe('Chaos — Resource Exhaustion', () => {
  let system: MockResilientSystem;

  beforeEach(() => {
    system = new MockResilientSystem();
  });

  it('should degrade service under memory pressure', () => {
    system.injectChaos({ type: 'memory-pressure', targetService: 'ai', severity: 'major', timestamp: Date.now() });
    const ai = system.getService('ai');
    expect(ai?.memoryUsageMB).toBeGreaterThan(ai!.maxMemoryMB * 0.8);
    expect(ai?.status).toBe('degraded');
  });

  it('should recover from memory pressure via cache clear', () => {
    system.injectChaos({ type: 'memory-pressure', targetService: 'ai', severity: 'major', timestamp: Date.now() });
    const recovery = system.attemptRecovery('ai');
    expect(recovery.success).toBe(true);
    expect(recovery.action).toBe('cache-clear');
    expect(system.getService('ai')?.status).toBe('healthy');
  });

  it('should degrade service under CPU spike', () => {
    system.injectChaos({ type: 'cpu-spike', targetService: 'identity', severity: 'major', timestamp: Date.now() });
    expect(system.getService('identity')?.cpuPercent).toBeGreaterThan(70);
    expect(system.getService('identity')?.status).toBe('degraded');
  });

  it('should degrade service under queue flood', () => {
    system.injectChaos({ type: 'queue-flood', targetService: 'notifications', severity: 'major', timestamp: Date.now() });
    const svc = system.getService('notifications');
    expect(svc?.requestQueue).toBeGreaterThan(svc!.maxQueueSize);
    expect(svc?.status).toBe('degraded');
  });

  it('should recover from queue flood via drain', () => {
    system.injectChaos({ type: 'queue-flood', targetService: 'notifications', severity: 'major', timestamp: Date.now() });
    const recovery = system.attemptRecovery('notifications');
    expect(recovery.success).toBe(true);
    expect(recovery.action).toBe('queue-drain');
    expect(system.getService('notifications')?.requestQueue).toBeLessThanOrEqual(system.getService('notifications')!.maxQueueSize);
  });
});

describe('Chaos — Dependency Failures', () => {
  let system: MockResilientSystem;

  beforeEach(() => {
    system = new MockResilientSystem();
  });

  it('should handle external AI provider failure gracefully', () => {
    system.injectChaos({ type: 'dependency-fail', targetService: 'ai', severity: 'critical', timestamp: Date.now() });
    expect(system.getService('external-ai')?.status).toBe('down');
    expect(system.getService('ai')?.status).toBe('degraded');
    expect(system.getService('ai')?.errorRate).toBeLessThan(1);
  });

  it('should handle data corruption with high error rate', () => {
    system.injectChaos({ type: 'data-corrupt', targetService: 'database', severity: 'critical', timestamp: Date.now() });
    expect(system.getService('database')?.errorRate).toBe(0.8);
    expect(system.getService('database')?.status).toBe('degraded');
  });

  it('should open circuit breakers on dependency failure', () => {
    system.injectChaos({ type: 'kill', targetService: 'kv-cache', severity: 'critical', timestamp: Date.now() });
    expect(system.getService('search')?.circuitBreakerOpen).toBe(true);
    expect(system.getService('ai')?.circuitBreakerOpen).toBe(true);
    expect(system.getService('notifications')?.circuitBreakerOpen).toBe(true);
  });

  it('should recover circuit breakers after dependency recovery', () => {
    system.injectChaos({ type: 'kill', targetService: 'kv-cache', severity: 'critical', timestamp: Date.now() });

    system.attemptRecovery('kv-cache');

    system.attemptRecovery('search');
    system.attemptRecovery('ai');
    system.attemptRecovery('notifications');

    expect(system.getService('search')?.circuitBreakerOpen).toBe(false);
    expect(system.getService('ai')?.circuitBreakerOpen).toBe(false);
    expect(system.getService('notifications')?.circuitBreakerOpen).toBe(false);
  });
});

describe('Chaos — Multi-Failure Scenarios', () => {
  let system: MockResilientSystem;

  beforeEach(() => {
    system = new MockResilientSystem();
  });

  it('should handle simultaneous failures across multiple services', () => {
    system.injectChaos({ type: 'kill', targetService: 'ai', severity: 'critical', timestamp: Date.now() });
    system.injectChaos({ type: 'memory-pressure', targetService: 'database', severity: 'major', timestamp: Date.now() });
    system.injectChaos({ type: 'network-partition', targetService: 'registry', severity: 'major', timestamp: Date.now() });

    const unhealthy = system.getUnhealthyServices();
    expect(unhealthy.length).toBeGreaterThanOrEqual(3);
    expect(system.getSystemHealthScore()).toBeLessThan(70);
  });

  it('should recover from multi-failure scenario step by step', () => {
    system.injectChaos({ type: 'kill', targetService: 'ai', severity: 'critical', timestamp: Date.now() });
    system.injectChaos({ type: 'queue-flood', targetService: 'notifications', severity: 'major', timestamp: Date.now() });
    system.injectChaos({ type: 'memory-pressure', targetService: 'search', severity: 'major', timestamp: Date.now() });

    const initialScore = system.getSystemHealthScore();

    system.attemptRecovery('ai');
    expect(system.getSystemHealthScore()).toBeGreaterThan(initialScore);

    system.attemptRecovery('notifications');
    system.attemptRecovery('search');

    expect(system.getSystemHealthScore()).toBe(100);
  });

  it('should survive the everything fails scenario and recover', () => {
    const workerServices = ['identity', 'filesystem', 'registry', 'search', 'ai', 'notifications'];
    for (const svc of workerServices) {
      system.injectChaos({ type: 'kill', targetService: svc, severity: 'critical', timestamp: Date.now() });
    }

    expect(system.getSystemHealthScore()).toBeLessThan(50);

    for (const svc of workerServices) {
      system.attemptRecovery(svc);
    }

    for (const svc of system.getUnhealthyServices()) {
      system.attemptRecovery(svc.id);
    }

    expect(system.getSystemHealthScore()).toBe(100);
    expect(system.isSystemOperational()).toBe(true);
  });

  it('should handle rapid chaos injection and recovery cycles', () => {
    for (let cycle = 0; cycle < 5; cycle++) {
      system.injectChaos({ type: 'kill', targetService: 'ai', severity: 'critical', timestamp: Date.now() });
      expect(system.getService('ai')?.status).toBe('down');

      system.attemptRecovery('ai');
      expect(system.getService('ai')?.status).toBe('healthy');
    }

    expect(system.getChaosLog()).toHaveLength(5);
    expect(system.getRecoveryLog()).toHaveLength(5);
  });

  it('should maintain audit trail through chaos and recovery', () => {
    system.injectChaos({ type: 'kill', targetService: 'database', severity: 'critical', timestamp: Date.now() });
    system.attemptRecovery('database');

    const affected = system.getAffectedServices('database');
    for (const svcId of affected) {
      system.attemptRecovery(svcId);
    }

    const chaosLog = system.getChaosLog();
    const recoveryLog = system.getRecoveryLog();

    expect(chaosLog.length).toBeGreaterThan(0);
    expect(recoveryLog.length).toBeGreaterThan(0);
    expect(recoveryLog.every(r => r.triggeredAt > 0)).toBe(true);
    expect(recoveryLog.every(r => r.details.length > 0)).toBe(true);
  });

  it('should reset entire system to healthy state', () => {
    system.injectChaos({ type: 'kill', targetService: 'ai', severity: 'critical', timestamp: Date.now() });
    system.injectChaos({ type: 'kill', targetService: 'database', severity: 'critical', timestamp: Date.now() });

    system.resetAll();

    expect(system.getHealthyServices()).toHaveLength(12);
    expect(system.getSystemHealthScore()).toBe(100);
    expect(system.getChaosLog()).toHaveLength(0);
    expect(system.getRecoveryLog()).toHaveLength(0);
    expect(system.getNetworkPartitions()).toHaveLength(0);
  });
});
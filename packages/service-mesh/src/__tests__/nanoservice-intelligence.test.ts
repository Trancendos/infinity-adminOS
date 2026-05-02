import { describe, expect, it } from 'vitest';
import {
  NanoserviceIntelligence,
  createNanoserviceManifest,
} from '../nanoservice-intelligence';
import type { ServiceDescriptor } from '../types';

function createDescriptor(overrides: Partial<ServiceDescriptor> = {}): ServiceDescriptor {
  return {
    name: 'knowledge-router',
    displayName: 'Knowledge Router',
    version: '1.0.0',
    category: 'ai',
    capabilities: ['knowledge.search', 'knowledge.route'],
    healthEndpoint: '/health',
    rpcMethods: [
      {
        name: 'search',
        authRequired: true,
        requiredScopes: ['knowledge:read'],
        timeoutMs: 500,
      },
    ],
    dependencies: [],
    critical: false,
    metadata: {
      adaptive: true,
      learnsFromEvents: true,
      selfHealing: true,
    },
    ...overrides,
  };
}

describe('NanoserviceIntelligence', () => {
  it('creates a nanoservice manifest from an existing service descriptor', () => {
    const descriptor = createDescriptor();
    const manifest = createNanoserviceManifest(descriptor, {
      autonomy: 'automated',
      runtimeMode: 'event-driven',
    });

    expect(manifest.name).toBe('knowledge-router');
    expect(manifest.capabilities).toContain('knowledge.search');
    expect(manifest.intelligence.adaptive).toBe(true);
    expect(manifest.intelligence.supportsSelfHealing).toBe(true);
    expect(manifest.autonomy).toBe('automated');
    expect(manifest.runtimeMode).toBe('event-driven');
  });

  it('selects the highest scoring healthy nanoservice for a capability', () => {
    const intelligence = new NanoserviceIntelligence();

    intelligence.register(createDescriptor({
      name: 'slow-knowledge-router',
      displayName: 'Slow Knowledge Router',
    }));

    intelligence.register(createDescriptor({
      name: 'fast-knowledge-router',
      displayName: 'Fast Knowledge Router',
    }), {
      autonomy: 'automated',
    });

    intelligence.updateTelemetry({
      serviceName: 'slow-knowledge-router',
      health: {
        name: 'slow-knowledge-router',
        status: 'healthy',
        latencyMs: 250,
        lastCheckedAt: new Date().toISOString(),
        consecutiveFailures: 0,
      },
      currentLoad: 0.8,
      p95LatencyMs: 900,
    });

    intelligence.updateTelemetry({
      serviceName: 'fast-knowledge-router',
      health: {
        name: 'fast-knowledge-router',
        status: 'healthy',
        latencyMs: 20,
        lastCheckedAt: new Date().toISOString(),
        consecutiveFailures: 0,
      },
      currentLoad: 0.1,
      p95LatencyMs: 80,
    });

    const plan = intelligence.planRoute({
      capability: 'knowledge.search',
      preferredCategory: 'ai',
      maxLatencyMs: 500,
      requireAutomation: true,
    });

    expect(plan.selected?.serviceName).toBe('fast-knowledge-router');
    expect(plan.automation).toContain('route');
    expect(plan.candidates[0].score).toBeGreaterThan(plan.candidates[1].score);
  });

  it('avoids degraded services unless degraded routing is explicitly allowed', () => {
    const intelligence = new NanoserviceIntelligence();

    intelligence.register(createDescriptor({
      name: 'healthy-router',
      displayName: 'Healthy Router',
    }));

    intelligence.register(createDescriptor({
      name: 'degraded-router',
      displayName: 'Degraded Router',
    }), {
      autonomy: 'automated',
    });

    intelligence.updateTelemetry({
      serviceName: 'healthy-router',
      health: {
        name: 'healthy-router',
        status: 'healthy',
        latencyMs: 100,
        lastCheckedAt: new Date().toISOString(),
        consecutiveFailures: 0,
      },
      currentLoad: 0.2,
    });

    intelligence.updateTelemetry({
      serviceName: 'degraded-router',
      health: {
        name: 'degraded-router',
        status: 'degraded',
        latencyMs: 10,
        lastCheckedAt: new Date().toISOString(),
        consecutiveFailures: 2,
      },
      currentLoad: 0,
    });

    const strictPlan = intelligence.planRoute({
      capability: 'knowledge.search',
      allowDegraded: false,
    });

    const permissivePlan = intelligence.planRoute({
      capability: 'knowledge.search',
      allowDegraded: true,
    });

    expect(strictPlan.selected?.serviceName).toBe('healthy-router');
    expect(permissivePlan.candidates.map((candidate) => candidate.serviceName)).toContain('degraded-router');
  });

  it('detects missing dependencies and reports orchestration recommendations', () => {
    const intelligence = new NanoserviceIntelligence();

    intelligence.register(createDescriptor({
      name: 'orchestrator',
      displayName: 'Orchestrator',
      category: 'infrastructure',
      capabilities: ['service.orchestrate'],
      dependencies: ['registry', 'missing-ai-worker'],
    }), {
      optionalDependencies: ['optional-analytics-worker'],
    });

    intelligence.register(createDescriptor({
      name: 'registry',
      displayName: 'Registry',
      category: 'infrastructure',
      capabilities: ['module.registry'],
    }));

    const analysis = intelligence.analyzeDependencies('orchestrator');

    expect(analysis.missingRequiredDependencies).toEqual(['missing-ai-worker']);
    expect(analysis.missingOptionalDependencies).toEqual(['optional-analytics-worker']);
    expect(analysis.riskScore).toBeGreaterThan(0);
    expect(analysis.recommendations.join(' ')).toContain('missing required dependencies');
  });

  it('produces a mesh-wide intelligence snapshot', () => {
    const intelligence = new NanoserviceIntelligence();

    intelligence.register(createDescriptor({
      name: 'adaptive-service',
      displayName: 'Adaptive Service',
    }), {
      autonomy: 'automated',
      intelligence: {
        adaptive: true,
        learnsFromEvents: true,
        supportsDynamicRouting: true,
        supportsSelfHealing: true,
      },
    });

    intelligence.register(createDescriptor({
      name: 'manual-service',
      displayName: 'Manual Service',
      metadata: {},
    }), {
      autonomy: 'manual',
      intelligence: {
        adaptive: false,
        learnsFromEvents: false,
        supportsDynamicRouting: true,
        supportsSelfHealing: false,
      },
    });

    const snapshot = intelligence.getSnapshot();

    expect(snapshot.totalServices).toBe(2);
    expect(snapshot.adaptiveServices).toBe(1);
    expect(snapshot.automatedServices).toBe(1);
    expect(snapshot.dynamicRoutingServices).toBe(2);
    expect(snapshot.averageScore).toBeGreaterThan(0);
  });
});
/**
 * Nanoservice Intelligence
 * ============================================================
 * Deterministic smart-service foundation for Infinity Portal.
 *
 * This module makes services self-describing, adaptive, logical,
 * automated, nanoservice-oriented, and modular without requiring
 * external AI calls or changing the existing ServiceMesh API.
 */

import type {
  CircuitBreakerState,
  HealthStatus,
  ServiceCategory,
  ServiceDescriptor,
  ServiceHealth,
} from './types';

export type NanoserviceAutonomyLevel =
  | 'manual'
  | 'advisory'
  | 'supervised'
  | 'automated';

export type NanoserviceRuntimeMode =
  | 'request-response'
  | 'event-driven'
  | 'scheduled'
  | 'streaming'
  | 'durable-object'
  | 'hybrid';

export type NanoserviceAutomationAction =
  | 'route'
  | 'retry'
  | 'observe'
  | 'warm-standby'
  | 'degrade-gracefully'
  | 'rebalance'
  | 'escalate'
  | 'quarantine';

export interface NanoserviceManifest {
  /** Stable nanoservice name. Should match a ServiceDescriptor name when linked to the mesh. */
  name: string;
  displayName: string;
  version: string;
  category: ServiceCategory;
  runtimeMode: NanoserviceRuntimeMode;
  capabilities: string[];
  dependencies: string[];
  optionalDependencies?: string[];
  criticality: 'low' | 'medium' | 'high' | 'critical';
  autonomy: NanoserviceAutonomyLevel;
  intelligence: {
    adaptive: boolean;
    learnsFromEvents: boolean;
    supportsDynamicRouting: boolean;
    supportsSelfHealing: boolean;
  };
  automation: {
    recommendedActions: NanoserviceAutomationAction[];
    maxConcurrentTasks: number;
    requiresHumanApprovalFor?: NanoserviceAutomationAction[];
  };
  metadata?: Record<string, unknown>;
}

export interface NanoserviceTelemetry {
  serviceName: string;
  health?: ServiceHealth;
  circuitBreaker?: CircuitBreakerState;
  currentLoad?: number; // 0-1
  recentErrorRate?: number; // 0-1
  p95LatencyMs?: number;
  lastEventAt?: string;
}

export interface CapabilityRequest {
  capability: string;
  requiredCapabilities?: string[];
  preferredCategory?: ServiceCategory;
  maxLatencyMs?: number;
  allowDegraded?: boolean;
  requireAutomation?: boolean;
  requiredRuntimeModes?: NanoserviceRuntimeMode[];
}

export interface NanoserviceCandidateScore {
  serviceName: string;
  score: number;
  reasons: string[];
  risks: string[];
  actions: NanoserviceAutomationAction[];
  descriptor: ServiceDescriptor;
  manifest: NanoserviceManifest;
}

export interface NanoserviceRoutingPlan {
  request: CapabilityRequest;
  selected?: NanoserviceCandidateScore;
  candidates: NanoserviceCandidateScore[];
  fallbackCandidates: NanoserviceCandidateScore[];
  automation: NanoserviceAutomationAction[];
  explanation: string;
}

export interface DependencyAnalysis {
  serviceName: string;
  missingRequiredDependencies: string[];
  missingOptionalDependencies: string[];
  dependencyDepth: number;
  hasCircularDependency: boolean;
  riskScore: number; // 0-100
  recommendations: string[];
}

export interface NanoserviceIntelligenceSnapshot {
  totalServices: number;
  adaptiveServices: number;
  automatedServices: number;
  selfHealingServices: number;
  dynamicRoutingServices: number;
  averageScore: number;
  highestRiskServices: Array<{
    serviceName: string;
    riskScore: number;
    reasons: string[];
  }>;
}

export interface NanoserviceIntelligenceConfig {
  weights: {
    capabilityFit: number;
    health: number;
    latency: number;
    load: number;
    dependencySafety: number;
    adaptability: number;
    automation: number;
  };
  healthScores: Record<HealthStatus, number>;
  defaultLatencyBudgetMs: number;
}

export const DEFAULT_NANOSERVICE_INTELLIGENCE_CONFIG: NanoserviceIntelligenceConfig = {
  weights: {
    capabilityFit: 35,
    health: 20,
    latency: 10,
    load: 10,
    dependencySafety: 10,
    adaptability: 10,
    automation: 5,
  },
  healthScores: {
    healthy: 1,
    degraded: 0.55,
    unhealthy: 0.05,
    unknown: 0.35,
  },
  defaultLatencyBudgetMs: 1000,
};

/**
 * Create a nanoservice manifest from an existing ServiceDescriptor.
 * This lets existing mesh services opt into the smarter nanoservice
 * model gradually without changing their current descriptor contract.
 */
export function createNanoserviceManifest(
  descriptor: ServiceDescriptor,
  overrides: Partial<NanoserviceManifest> = {},
): NanoserviceManifest {
  const metadata = descriptor.metadata || {};
  const criticality = descriptor.critical ? 'critical' : 'medium';
  const recommendedActions: NanoserviceAutomationAction[] = descriptor.critical
    ? ['route', 'observe', 'warm-standby', 'escalate']
    : ['route', 'observe', 'retry'];

  const baseIntelligence: NanoserviceManifest['intelligence'] = {
    adaptive: Boolean(metadata.adaptive),
    learnsFromEvents: Boolean(metadata.learnsFromEvents),
    supportsDynamicRouting: true,
    supportsSelfHealing: Boolean(metadata.selfHealing),
    ...overrides.intelligence,
  };

  const baseAutomation: NanoserviceManifest['automation'] = {
    recommendedActions,
    maxConcurrentTasks: 10,
    requiresHumanApprovalFor: ['quarantine'],
    ...overrides.automation,
  };

  return {
    name: descriptor.name,
    displayName: descriptor.displayName,
    version: descriptor.version,
    category: descriptor.category,
    runtimeMode: 'request-response',
    capabilities: [...descriptor.capabilities],
    dependencies: [...descriptor.dependencies],
    optionalDependencies: [],
    criticality,
    autonomy: 'advisory',
    metadata,
    ...overrides,
    intelligence: baseIntelligence,
    automation: baseAutomation,
  };
}

export class NanoserviceIntelligence {
  private readonly config: NanoserviceIntelligenceConfig;
  private readonly manifests = new Map<string, NanoserviceManifest>();
  private readonly descriptors = new Map<string, ServiceDescriptor>();
  private readonly telemetry = new Map<string, NanoserviceTelemetry>();

  constructor(config: Partial<NanoserviceIntelligenceConfig> = {}) {
    this.config = {
      ...DEFAULT_NANOSERVICE_INTELLIGENCE_CONFIG,
      ...config,
      weights: {
        ...DEFAULT_NANOSERVICE_INTELLIGENCE_CONFIG.weights,
        ...config.weights,
      },
      healthScores: {
        ...DEFAULT_NANOSERVICE_INTELLIGENCE_CONFIG.healthScores,
        ...config.healthScores,
      },
    };
  }

  register(descriptor: ServiceDescriptor, manifest?: Partial<NanoserviceManifest>): NanoserviceManifest {
    const nanoservice = createNanoserviceManifest(descriptor, manifest);
    this.descriptors.set(descriptor.name, descriptor);
    this.manifests.set(descriptor.name, nanoservice);
    return nanoservice;
  }

  unregister(serviceName: string): boolean {
    this.telemetry.delete(serviceName);
    this.descriptors.delete(serviceName);
    return this.manifests.delete(serviceName);
  }

  updateTelemetry(telemetry: NanoserviceTelemetry): void {
    this.telemetry.set(telemetry.serviceName, telemetry);
  }

  getManifest(serviceName: string): NanoserviceManifest | undefined {
    return this.manifests.get(serviceName);
  }

  getManifests(): NanoserviceManifest[] {
    return Array.from(this.manifests.values());
  }

  planRoute(request: CapabilityRequest): NanoserviceRoutingPlan {
    const candidates = this.scoreCandidates(request)
      .sort((a, b) => b.score - a.score || a.serviceName.localeCompare(b.serviceName));

    const viable = candidates.filter((candidate) => {
      const health = this.telemetry.get(candidate.serviceName)?.health?.status || 'unknown';
      if (!request.allowDegraded && (health === 'degraded' || health === 'unhealthy')) {
        return false;
      }
      if (health === 'unhealthy') return false;
      if (candidate.risks.includes('circuit-open')) return false;
      return candidate.score > 0;
    });

    const selected = viable[0];
    const fallbackCandidates = viable.slice(1, 4);
    const automation: NanoserviceAutomationAction[] = selected
      ? this.recommendAutomation(selected, request)
      : ['escalate', 'observe'];

    return {
      request,
      selected,
      candidates,
      fallbackCandidates,
      automation,
      explanation: selected
        ? `Selected ${selected.serviceName} for capability '${request.capability}' with score ${selected.score}.`
        : `No viable nanoservice found for capability '${request.capability}'. Escalation recommended.`,
    };
  }

  scoreCandidates(request: CapabilityRequest): NanoserviceCandidateScore[] {
    const results: NanoserviceCandidateScore[] = [];

    for (const manifest of this.manifests.values()) {
      const descriptor = this.descriptors.get(manifest.name);
      if (!descriptor) continue;

      const score = this.scoreManifest(manifest, descriptor, request);
      if (score.score > 0 || score.reasons.length > 0) {
        results.push(score);
      }
    }

    return results;
  }

  analyzeDependencies(serviceName: string): DependencyAnalysis {
    const manifest = this.manifests.get(serviceName);
    if (!manifest) {
      return {
        serviceName,
        missingRequiredDependencies: [],
        missingOptionalDependencies: [],
        dependencyDepth: 0,
        hasCircularDependency: false,
        riskScore: 100,
        recommendations: ['Register the nanoservice before dependency analysis.'],
      };
    }

    const missingRequiredDependencies = manifest.dependencies.filter((dep) => !this.manifests.has(dep));
    const missingOptionalDependencies = (manifest.optionalDependencies || []).filter((dep) => !this.manifests.has(dep));
    const visited = new Set<string>();
    const stack = new Set<string>();

    const walk = (name: string, depth: number): { maxDepth: number; circular: boolean } => {
      if (stack.has(name)) return { maxDepth: depth, circular: true };
      if (visited.has(name)) return { maxDepth: depth, circular: false };

      visited.add(name);
      stack.add(name);

      const current = this.manifests.get(name);
      let maxDepth = depth;
      let circular = false;

      for (const dep of current?.dependencies || []) {
        const result = walk(dep, depth + 1);
        maxDepth = Math.max(maxDepth, result.maxDepth);
        circular = circular || result.circular;
      }

      stack.delete(name);
      return { maxDepth, circular };
    };

    const traversal = walk(serviceName, 0);
    const riskScore = Math.min(
      100,
      missingRequiredDependencies.length * 30
        + missingOptionalDependencies.length * 10
        + (traversal.circular ? 40 : 0)
        + Math.max(0, traversal.maxDepth - 3) * 5,
    );

    const recommendations: string[] = [];
    if (missingRequiredDependencies.length > 0) {
      recommendations.push('Register or provision missing required dependencies before automated routing.');
    }
    if (missingOptionalDependencies.length > 0) {
      recommendations.push('Optional dependencies are unavailable; enable graceful degradation paths.');
    }
    if (traversal.circular) {
      recommendations.push('Break circular dependencies or introduce event-driven decoupling.');
    }
    if (recommendations.length === 0) {
      recommendations.push('Dependency graph is ready for modular orchestration.');
    }

    return {
      serviceName,
      missingRequiredDependencies,
      missingOptionalDependencies,
      dependencyDepth: traversal.maxDepth,
      hasCircularDependency: traversal.circular,
      riskScore,
      recommendations,
    };
  }

  getSnapshot(): NanoserviceIntelligenceSnapshot {
    const scores = this.getManifests().map((manifest) => {
      const descriptor = this.descriptors.get(manifest.name);
      if (!descriptor) return 0;
      return this.scoreManifest(manifest, descriptor, { capability: manifest.capabilities[0] || '' }).score;
    });

    const highestRiskServices = this.getManifests()
      .map((manifest) => {
        const analysis = this.analyzeDependencies(manifest.name);
        const telemetry = this.telemetry.get(manifest.name);
        const reasons = [...analysis.recommendations];

        if (telemetry?.health?.status === 'unhealthy') reasons.push('Service health is unhealthy.');
        if (telemetry?.circuitBreaker?.state === 'open') reasons.push('Circuit breaker is open.');
        if ((telemetry?.recentErrorRate || 0) > 0.2) reasons.push('Recent error rate is above 20%.');

        const telemetryRisk =
          (telemetry?.health?.status === 'unhealthy' ? 35 : 0)
          + (telemetry?.circuitBreaker?.state === 'open' ? 35 : 0)
          + Math.round((telemetry?.recentErrorRate || 0) * 30);

        return {
          serviceName: manifest.name,
          riskScore: Math.min(100, analysis.riskScore + telemetryRisk),
          reasons,
        };
      })
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 5);

    const manifests = this.getManifests();

    return {
      totalServices: manifests.length,
      adaptiveServices: manifests.filter((m) => m.intelligence.adaptive).length,
      automatedServices: manifests.filter((m) => m.autonomy === 'automated').length,
      selfHealingServices: manifests.filter((m) => m.intelligence.supportsSelfHealing).length,
      dynamicRoutingServices: manifests.filter((m) => m.intelligence.supportsDynamicRouting).length,
      averageScore: scores.length === 0
        ? 0
        : Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
      highestRiskServices,
    };
  }

  private scoreManifest(
    manifest: NanoserviceManifest,
    descriptor: ServiceDescriptor,
    request: CapabilityRequest,
  ): NanoserviceCandidateScore {
    const telemetry = this.telemetry.get(manifest.name);
    const dependencyAnalysis = this.analyzeDependencies(manifest.name);

    const reasons: string[] = [];
    const risks: string[] = [];

    const requestedCapabilities = [
      request.capability,
      ...(request.requiredCapabilities || []),
    ].filter(Boolean);

    const matchedCapabilities = requestedCapabilities.filter((capability) =>
      manifest.capabilities.includes(capability) || descriptor.capabilities.includes(capability),
    );

    if (matchedCapabilities.length > 0) {
      reasons.push(`Matches capabilities: ${matchedCapabilities.join(', ')}`);
    }

    const capabilityFit = requestedCapabilities.length === 0
      ? 0
      : matchedCapabilities.length / requestedCapabilities.length;

    if (capabilityFit === 0) {
      return {
        serviceName: manifest.name,
        score: 0,
        reasons,
        risks: ['capability-mismatch'],
        actions: ['observe'],
        descriptor,
        manifest,
      };
    }

    if (request.preferredCategory && request.preferredCategory === manifest.category) {
      reasons.push(`Matches preferred category: ${request.preferredCategory}`);
    }

    const health = telemetry?.health?.status || 'unknown';
    const healthScore = this.config.healthScores[health];

    if (health === 'degraded') risks.push('health-degraded');
    if (health === 'unhealthy') risks.push('health-unhealthy');

    const circuitState = telemetry?.circuitBreaker?.state || 'closed';
    if (circuitState === 'open') risks.push('circuit-open');
    if (circuitState === 'half-open') risks.push('circuit-half-open');

    const latencyBudget = request.maxLatencyMs || this.config.defaultLatencyBudgetMs;
    const latency = telemetry?.p95LatencyMs || telemetry?.health?.latencyMs || latencyBudget;
    const latencyScore = Math.max(0, Math.min(1, 1 - latency / Math.max(1, latencyBudget * 2)));
    if (latency > latencyBudget) risks.push('latency-over-budget');

    const load = telemetry?.currentLoad ?? 0.25;
    const loadScore = Math.max(0, Math.min(1, 1 - load));
    if (load > 0.8) risks.push('high-load');

    const dependencySafety = Math.max(0, 1 - dependencyAnalysis.riskScore / 100);
    if (dependencyAnalysis.riskScore >= 50) risks.push('dependency-risk');

    const adaptability =
      (manifest.intelligence.adaptive ? 0.35 : 0)
      + (manifest.intelligence.learnsFromEvents ? 0.2 : 0)
      + (manifest.intelligence.supportsDynamicRouting ? 0.25 : 0)
      + (manifest.intelligence.supportsSelfHealing ? 0.2 : 0);

    const automationFit = request.requireAutomation
      ? manifest.autonomy === 'automated' || manifest.autonomy === 'supervised'
        ? 1
        : 0.2
      : manifest.automation.recommendedActions.length > 0
        ? 1
        : 0;

    const runtimeFit = request.requiredRuntimeModes?.length
      ? request.requiredRuntimeModes.includes(manifest.runtimeMode)
      : true;
    if (!runtimeFit) risks.push('runtime-mode-mismatch');

    const score =
      capabilityFit * this.config.weights.capabilityFit
      + healthScore * this.config.weights.health
      + latencyScore * this.config.weights.latency
      + loadScore * this.config.weights.load
      + dependencySafety * this.config.weights.dependencySafety
      + adaptability * this.config.weights.adaptability
      + automationFit * this.config.weights.automation
      + (request.preferredCategory === manifest.category ? 5 : 0)
      - (circuitState === 'open' ? 50 : 0)
      - (runtimeFit ? 0 : 20)
      - (manifest.criticality === 'critical' && health !== 'healthy' ? 10 : 0);

    if (manifest.intelligence.adaptive) reasons.push('Adaptive intelligence enabled.');
    if (manifest.intelligence.supportsSelfHealing) reasons.push('Self-healing supported.');
    if (manifest.autonomy === 'automated') reasons.push('Automated execution supported.');

    return {
      serviceName: manifest.name,
      score: Math.max(0, Math.round(score)),
      reasons,
      risks,
      actions: this.recommendAutomationFromSignals(manifest, health, risks),
      descriptor,
      manifest,
    };
  }

  private recommendAutomation(
    candidate: NanoserviceCandidateScore,
    request: CapabilityRequest,
  ): NanoserviceAutomationAction[] {
    const actions = new Set<NanoserviceAutomationAction>(candidate.actions);
    actions.add('route');

    if (candidate.risks.length > 0) {
      actions.add('observe');
    }

    if (request.requireAutomation && candidate.manifest.autonomy === 'manual') {
      actions.add('escalate');
    }

    return Array.from(actions);
  }

  private recommendAutomationFromSignals(
    manifest: NanoserviceManifest,
    health: HealthStatus,
    risks: string[],
  ): NanoserviceAutomationAction[] {
    const actions = new Set<NanoserviceAutomationAction>();

    if (health === 'healthy' || health === 'unknown') actions.add('route');
    if (health === 'degraded') {
      actions.add('retry');
      actions.add('observe');
      actions.add('degrade-gracefully');
    }
    if (health === 'unhealthy') {
      actions.add('escalate');
      actions.add('quarantine');
    }
    if (risks.includes('high-load')) actions.add('rebalance');
    if (risks.includes('circuit-open')) actions.add('warm-standby');
    if (manifest.criticality === 'critical') actions.add('warm-standby');

    for (const action of manifest.automation.recommendedActions) {
      actions.add(action);
    }

    return Array.from(actions);
  }
}


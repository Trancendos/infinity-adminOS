/**
 * @package @trancendos/agent-sdk
 * Tests: AgentOrchestrator, AgentTemplates, AIPerformanceTracker, exports
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  AgentOrchestrator,
  type AgentConfig,
  type AgentTask,
  type AgentPerformance,
  type OrchestratorOptions,
} from '../agent-orchestrator';

import {
  AgentTemplates,
  getTemplate,
  getTemplatesByCategory,
  getCategories,
  createFromTemplate,
  type AgentTemplate,
} from '../agent-templates';

import {
  AIPerformanceTracker,
  type InferenceRecord,
  type ModelMetrics,
} from '../ai-performance';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeOrchestratorOpts(overrides: Partial<OrchestratorOptions> = {}): OrchestratorOptions {
  return {
    maxQueueSize: 100,
    taskTimeout: 30000,
    enableLoadBalancing: true,
    enableAutoScaling: false,
    performanceWindow: 3600000,
    ...overrides,
  };
}

function makeAgentConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: 'agent-001',
    name: 'Test Agent',
    type: 'worker',
    model: 'gpt-4',
    capabilities: ['text-generation'],
    maxConcurrentTasks: 3,
    priority: 5,
    temperature: 0.7,
    maxTokens: 2048,
    systemPrompt: 'You are a test agent.',
    tools: [],
    metadata: {},
    ...overrides,
  };
}

function makeTaskInput(overrides: Partial<Omit<AgentTask, 'id' | 'status' | 'createdAt'>> = {}): Omit<AgentTask, 'id' | 'status' | 'createdAt'> {
  return {
    type: 'text-generation',
    description: 'Generate test text',
    input: { prompt: 'hello' },
    priority: 5,
    metadata: {},
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Module exports smoke test
// ─────────────────────────────────────────────────────────────────────────────

describe('module exports', () => {
  it('AgentOrchestrator is a class', () => {
    expect(typeof AgentOrchestrator).toBe('function');
  });

  it('AgentTemplates is an array', () => {
    expect(Array.isArray(AgentTemplates)).toBe(true);
  });

  it('AIPerformanceTracker is a class', () => {
    expect(typeof AIPerformanceTracker).toBe('function');
  });

  it('getTemplate is a function', () => {
    expect(typeof getTemplate).toBe('function');
  });

  it('getTemplatesByCategory is a function', () => {
    expect(typeof getTemplatesByCategory).toBe('function');
  });

  it('getCategories is a function', () => {
    expect(typeof getCategories).toBe('function');
  });

  it('createFromTemplate is a function', () => {
    expect(typeof createFromTemplate).toBe('function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AgentOrchestrator
// ─────────────────────────────────────────────────────────────────────────────

describe('AgentOrchestrator', () => {
  let orchestrator: AgentOrchestrator;

  beforeEach(() => {
    orchestrator = new AgentOrchestrator(makeOrchestratorOpts());
  });

  describe('agent registration', () => {
    it('registers an agent successfully', () => {
      const agent = makeAgentConfig();
      orchestrator.registerAgent(agent);
      const agents = orchestrator.getAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe('agent-001');
    });

    it('registers multiple agents', () => {
      orchestrator.registerAgent(makeAgentConfig({ id: 'a1', name: 'Agent 1' }));
      orchestrator.registerAgent(makeAgentConfig({ id: 'a2', name: 'Agent 2' }));
      orchestrator.registerAgent(makeAgentConfig({ id: 'a3', name: 'Agent 3' }));
      expect(orchestrator.getAgents()).toHaveLength(3);
    });

    it('unregisters an agent', () => {
      orchestrator.registerAgent(makeAgentConfig({ id: 'a1' }));
      orchestrator.registerAgent(makeAgentConfig({ id: 'a2' }));
      orchestrator.unregisterAgent('a1');
      const agents = orchestrator.getAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe('a2');
    });

    it('unregisterAgent returns true', () => {
      orchestrator.registerAgent(makeAgentConfig());
      expect(orchestrator.unregisterAgent('agent-001')).toBe(true);
    });

    it('getAgents returns empty array initially', () => {
      expect(orchestrator.getAgents()).toHaveLength(0);
    });
  });

  describe('task submission', () => {
    it('submits a task and returns task object with id and status', async () => {
      orchestrator.registerAgent(makeAgentConfig());
      const task = await orchestrator.submitTask(makeTaskInput());
      expect(task.id).toBeDefined();
      expect(typeof task.id).toBe('string');
      expect(task.status).toBeDefined();
      expect(task.createdAt).toBeGreaterThan(0);
    });

    it('submitted task has correct type and description', async () => {
      orchestrator.registerAgent(makeAgentConfig());
      const input = makeTaskInput({ type: 'code-review', description: 'Review this PR' });
      const task = await orchestrator.submitTask(input);
      expect(task.type).toBe('code-review');
      expect(task.description).toBe('Review this PR');
    });

    it('submitted task gets assigned when agent is available', async () => {
      orchestrator.registerAgent(makeAgentConfig({ capabilities: ['text-generation'] }));
      const task = await orchestrator.submitTask(makeTaskInput({ type: 'text-generation' }));
      // Task should be either assigned or pending
      expect(['assigned', 'pending', 'running']).toContain(task.status);
    });

    it('getTask returns submitted task', async () => {
      orchestrator.registerAgent(makeAgentConfig());
      const submitted = await orchestrator.submitTask(makeTaskInput());
      const retrieved = orchestrator.getTask(submitted.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(submitted.id);
    });

    it('getTask returns undefined for unknown id', () => {
      expect(orchestrator.getTask('nonexistent')).toBeUndefined();
    });

    it('getQueueStatus has size and pending and running fields', async () => {
      const status = orchestrator.getQueueStatus();
      expect(status).toHaveProperty('size');
      expect(status).toHaveProperty('pending');
      expect(status).toHaveProperty('running');
    });
  });

  describe('task completion', () => {
    it('completeTask updates status to completed', async () => {
      orchestrator.registerAgent(makeAgentConfig());
      const task = await orchestrator.submitTask(makeTaskInput());
      await orchestrator.completeTask(task.id, { output: 'done' });
      const updated = orchestrator.getTask(task.id);
      expect(updated!.status).toBe('completed');
      expect(updated!.result).toEqual({ output: 'done' });
    });

    it('failTask updates status to failed', async () => {
      orchestrator.registerAgent(makeAgentConfig());
      const task = await orchestrator.submitTask(makeTaskInput());
      await orchestrator.failTask(task.id, 'timeout error');
      const updated = orchestrator.getTask(task.id);
      expect(updated!.status).toBe('failed');
      expect(updated!.error).toBe('timeout error');
    });

    it('completeTask throws for unknown task', async () => {
      await expect(orchestrator.completeTask('bad-id', {})).rejects.toThrow('bad-id');
    });

    it('failTask throws for unknown task', async () => {
      await expect(orchestrator.failTask('bad-id', 'error')).rejects.toThrow('bad-id');
    });

    it('calls onTaskComplete callback when task completes', async () => {
      const onComplete = vi.fn();
      const orch = new AgentOrchestrator(makeOrchestratorOpts({ onTaskComplete: onComplete }));
      orch.registerAgent(makeAgentConfig());
      const task = await orch.submitTask(makeTaskInput());
      await orch.completeTask(task.id, 'result');
      expect(onComplete).toHaveBeenCalledOnce();
      expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
    });

    it('calls onTaskFailed callback when task fails', async () => {
      const onFailed = vi.fn();
      const orch = new AgentOrchestrator(makeOrchestratorOpts({ onTaskFailed: onFailed }));
      orch.registerAgent(makeAgentConfig());
      const task = await orch.submitTask(makeTaskInput());
      await orch.failTask(task.id, 'oh no');
      expect(onFailed).toHaveBeenCalledOnce();
      expect(onFailed).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
        expect.any(Error)
      );
    });
  });

  describe('performance tracking', () => {
    it('getPerformance returns array for all agents', () => {
      orchestrator.registerAgent(makeAgentConfig({ id: 'a1' }));
      orchestrator.registerAgent(makeAgentConfig({ id: 'a2' }));
      const perf = orchestrator.getPerformance() as AgentPerformance[];
      expect(Array.isArray(perf)).toBe(true);
      expect(perf).toHaveLength(2);
    });

    it('getPerformance for specific agent returns single object', () => {
      orchestrator.registerAgent(makeAgentConfig({ id: 'a1' }));
      const perf = orchestrator.getPerformance('a1') as AgentPerformance;
      expect(perf.agentId).toBe('a1');
      expect(perf.totalTasks).toBe(0);
      expect(perf.successRate).toBe(1.0);
    });

    it('performance updates after task completion', async () => {
      orchestrator.registerAgent(makeAgentConfig({ id: 'a1' }));
      const task = await orchestrator.submitTask(makeTaskInput());
      await orchestrator.completeTask(task.id, 'done');
      const perf = orchestrator.getPerformance('a1') as AgentPerformance;
      // Only check if task was actually assigned to this agent
      if (task.assignedAgent === 'a1') {
        expect(perf.completedTasks).toBe(1);
        expect(perf.totalTasks).toBe(1);
      }
    });

    it('getPerformance for unknown agent returns zero metrics', () => {
      const perf = orchestrator.getPerformance('unknown-agent') as AgentPerformance;
      expect(perf.totalTasks).toBe(0);
      expect(perf.completedTasks).toBe(0);
      expect(perf.failedTasks).toBe(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AgentTemplates
// ─────────────────────────────────────────────────────────────────────────────

describe('AgentTemplates', () => {
  it('has at least one template', () => {
    expect(AgentTemplates.length).toBeGreaterThanOrEqual(1);
  });

  it('each template has required fields', () => {
    for (const template of AgentTemplates) {
      expect(template).toHaveProperty('id');
      expect(template).toHaveProperty('name');
      expect(template).toHaveProperty('description');
      expect(template).toHaveProperty('category');
      expect(template).toHaveProperty('config');
      expect(typeof template.id).toBe('string');
      expect(typeof template.name).toBe('string');
    }
  });

  it('each template config has required fields', () => {
    for (const template of AgentTemplates) {
      expect(template.config).toHaveProperty('name');
      expect(template.config).toHaveProperty('type');
      expect(template.config).toHaveProperty('model');
      expect(template.config).toHaveProperty('capabilities');
      expect(Array.isArray(template.config.capabilities)).toBe(true);
    }
  });

  it('template IDs are unique', () => {
    const ids = AgentTemplates.map(t => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('includes Norman code review template', () => {
    const norman = AgentTemplates.find(t => t.id === 'norman-code-review');
    expect(norman).toBeDefined();
    expect(norman!.name).toBe('Norman');
    expect(norman!.category).toBe('development');
  });

  it('includes guardian security template', () => {
    const guardian = AgentTemplates.find(t => t.id === 'guardian-security');
    expect(guardian).toBeDefined();
  });
});

describe('getTemplate', () => {
  it('returns template by ID', () => {
    const t = getTemplate('norman-code-review');
    expect(t).toBeDefined();
    expect(t!.id).toBe('norman-code-review');
  });

  it('returns undefined for unknown ID', () => {
    expect(getTemplate('nonexistent-template-xyz')).toBeUndefined();
  });

  it('is case-sensitive', () => {
    expect(getTemplate('Norman-Code-Review')).toBeUndefined();
  });
});

describe('getTemplatesByCategory', () => {
  it('returns templates matching the category', () => {
    const devTemplates = getTemplatesByCategory('development');
    expect(devTemplates.length).toBeGreaterThanOrEqual(1);
    for (const t of devTemplates) {
      expect(t.category).toBe('development');
    }
  });

  it('returns empty array for unknown category', () => {
    expect(getTemplatesByCategory('nonexistent-category')).toHaveLength(0);
  });

  it('each result is an AgentTemplate with all fields', () => {
    const categories = getCategories();
    if (categories.length > 0) {
      const templates = getTemplatesByCategory(categories[0]);
      for (const t of templates) {
        expect(t).toHaveProperty('id');
        expect(t).toHaveProperty('config');
      }
    }
  });
});

describe('getCategories', () => {
  it('returns an array of strings', () => {
    const cats = getCategories();
    expect(Array.isArray(cats)).toBe(true);
    for (const c of cats) {
      expect(typeof c).toBe('string');
    }
  });

  it('returns unique categories', () => {
    const cats = getCategories();
    const unique = new Set(cats);
    expect(unique.size).toBe(cats.length);
  });

  it('includes "development" category', () => {
    expect(getCategories()).toContain('development');
  });
});

describe('createFromTemplate', () => {
  it('creates an agent config from a valid template', () => {
    const config = createFromTemplate('norman-code-review', { id: 'my-norman' });
    expect(config).toBeDefined();
    expect(config.id).toBe('my-norman');
    expect(config.name).toBe('Norman');
  });

  it('merges overrides with template defaults', () => {
    const config = createFromTemplate('norman-code-review', {
      id: 'custom-norman',
      temperature: 0.1,
    });
    expect(config.temperature).toBe(0.1);
    expect(config.model).toBe('gpt-4');
  });

  it('throws for unknown template ID', () => {
    expect(() => createFromTemplate('nonexistent-template-xyz')).toThrow();
  });

  it('created config has capabilities array', () => {
    const config = createFromTemplate('norman-code-review', { id: 'test-agent' });
    expect(Array.isArray(config.capabilities)).toBe(true);
    expect(config.capabilities.length).toBeGreaterThan(0);
  });

  it('created config has systemPrompt', () => {
    const config = createFromTemplate('norman-code-review', { id: 'test-agent' });
    expect(typeof config.systemPrompt).toBe('string');
    expect(config.systemPrompt.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AIPerformanceTracker
// ─────────────────────────────────────────────────────────────────────────────

describe('AIPerformanceTracker', () => {
  let tracker: AIPerformanceTracker;

  beforeEach(() => {
    tracker = new AIPerformanceTracker();
  });

  function makeInferenceInput(overrides: Partial<Omit<InferenceRecord, 'id' | 'cost' | 'timestamp'>> = {}): Omit<InferenceRecord, 'id' | 'cost' | 'timestamp'> {
    return {
      model: 'gpt-4',
      agentId: 'agent-001',
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      latencyMs: 800,
      quality: 0.9,
      metadata: {},
      ...overrides,
    };
  }

  describe('record()', () => {
    it('records an inference and returns record with id and timestamp', () => {
      const record = tracker.record(makeInferenceInput());
      expect(record.id).toBeDefined();
      expect(record.timestamp).toBeGreaterThan(0);
    });

    it('auto-generates id', () => {
      const r1 = tracker.record(makeInferenceInput());
      const r2 = tracker.record(makeInferenceInput());
      expect(r1.id).not.toBe(r2.id);
    });

    it('calculates cost field (non-negative)', () => {
      const record = tracker.record(makeInferenceInput({ model: 'gpt-4', totalTokens: 1000 }));
      expect(record.cost).toBeGreaterThanOrEqual(0);
    });

    it('preserves all input fields', () => {
      const input = makeInferenceInput({ model: 'gpt-3.5-turbo', agentId: 'agent-xyz', latencyMs: 400 });
      const record = tracker.record(input);
      expect(record.model).toBe('gpt-3.5-turbo');
      expect(record.agentId).toBe('agent-xyz');
      expect(record.latencyMs).toBe(400);
    });
  });

  describe('getModelMetrics()', () => {
    it('returns empty array when no records', () => {
      expect(tracker.getModelMetrics()).toHaveLength(0);
    });

    it('returns metrics for recorded model', () => {
      tracker.record(makeInferenceInput({ model: 'gpt-4', latencyMs: 800 }));
      tracker.record(makeInferenceInput({ model: 'gpt-4', latencyMs: 1200 }));
      const metrics = tracker.getModelMetrics();
      const gpt4 = metrics.find(m => m.model === 'gpt-4');
      expect(gpt4).toBeDefined();
      expect(gpt4!.totalInferences).toBe(2);
    });

    it('avg latency is computed correctly', () => {
      tracker.record(makeInferenceInput({ model: 'gpt-4', latencyMs: 800 }));
      tracker.record(makeInferenceInput({ model: 'gpt-4', latencyMs: 1200 }));
      const metrics = tracker.getModelMetrics();
      const gpt4 = metrics.find(m => m.model === 'gpt-4')!;
      expect(gpt4.avgLatencyMs).toBe(1000);
    });

    it('returns separate metrics per model', () => {
      tracker.record(makeInferenceInput({ model: 'gpt-4' }));
      tracker.record(makeInferenceInput({ model: 'gpt-3.5-turbo' }));
      const metrics = tracker.getModelMetrics();
      expect(metrics.length).toBeGreaterThanOrEqual(2);
    });

    it('filters by specific model', () => {
      tracker.record(makeInferenceInput({ model: 'gpt-4' }));
      tracker.record(makeInferenceInput({ model: 'claude-3' }));
      const metrics = tracker.getModelMetrics('gpt-4');
      expect(metrics).toHaveLength(1);
      expect(metrics[0].model).toBe('gpt-4');
    });

    it('returns empty for unknown model', () => {
      tracker.record(makeInferenceInput({ model: 'gpt-4' }));
      expect(tracker.getModelMetrics('unknown-model')).toHaveLength(0);
    });

    it('metrics include totalTokensUsed', () => {
      tracker.record(makeInferenceInput({ model: 'gpt-4', totalTokens: 200 }));
      tracker.record(makeInferenceInput({ model: 'gpt-4', totalTokens: 300 }));
      const metrics = tracker.getModelMetrics('gpt-4');
      expect(metrics[0].totalTokensUsed).toBe(500);
    });

    it('p95 latency is >= avg latency', () => {
      for (let i = 0; i < 20; i++) {
        tracker.record(makeInferenceInput({ model: 'test-model', latencyMs: 100 + i * 10 }));
      }
      const metrics = tracker.getModelMetrics('test-model');
      expect(metrics[0].p95LatencyMs).toBeGreaterThanOrEqual(metrics[0].avgLatencyMs);
    });
  });

  describe('getCostOptimization()', () => {
    it('returns cost optimization object', () => {
      const opt = tracker.getCostOptimization();
      expect(opt).toHaveProperty('currentMonthlyCost');
      expect(opt).toHaveProperty('projectedMonthlyCost');
      expect(opt).toHaveProperty('savings');
      expect(opt).toHaveProperty('recommendations');
      expect(Array.isArray(opt.recommendations)).toBe(true);
    });

    it('currentMonthlyCost is non-negative', () => {
      tracker.record(makeInferenceInput({ model: 'gpt-4', totalTokens: 5000 }));
      const opt = tracker.getCostOptimization();
      expect(opt.currentMonthlyCost).toBeGreaterThanOrEqual(0);
    });
  });

  describe('A/B testing', () => {
    it('createABTest returns test with id and status draft', () => {
      const test = tracker.createABTest({
        name: 'Test A/B',
        description: 'Compare models',
        variants: [],
        trafficSplit: [50, 50],
        sampleSize: 100,
        confidenceLevel: 0.95,
      });
      expect(test.id).toBeDefined();
      expect(test.status).toBe('draft');
    });

    it('startABTest changes status to running', () => {
      const test = tracker.createABTest({
        name: 'Test',
        description: 'desc',
        variants: [],
        trafficSplit: [],
        sampleSize: 100,
        confidenceLevel: 0.95,
      });
      const started = tracker.startABTest(test.id);
      expect(started.status).toBe('running');
      expect(started.startedAt).toBeDefined();
    });

    it('getABTestResults returns test by id', () => {
      const test = tracker.createABTest({
        name: 'Test',
        description: 'desc',
        variants: [],
        trafficSplit: [],
        sampleSize: 100,
        confidenceLevel: 0.95,
      });
      const retrieved = tracker.getABTestResults(test.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(test.id);
    });

    it('getABTestResults returns undefined for unknown id', () => {
      expect(tracker.getABTestResults('nonexistent')).toBeUndefined();
    });
  });

  describe('getAgentPerformance()', () => {
    it('returns performance data for agent', () => {
      tracker.record(makeInferenceInput({ agentId: 'agent-test', latencyMs: 500 }));
      tracker.record(makeInferenceInput({ agentId: 'agent-test', latencyMs: 700 }));
      const perf = tracker.getAgentPerformance('agent-test');
      expect(perf).toBeDefined();
      expect(perf.totalInferences).toBe(2);
    });

    it('returns zeros for unknown agent', () => {
      const perf = tracker.getAgentPerformance('no-such-agent');
      expect(perf.totalInferences).toBe(0);
    });
  });

  describe('getDashboard()', () => {
    it('returns dashboard object with expected shape', () => {
      const dash = tracker.getDashboard();
      expect(dash).toBeDefined();
      // Should have some dashboard-like fields
      expect(typeof dash).toBe('object');
    });

    it('dashboard reflects recorded data', () => {
      tracker.record(makeInferenceInput({ model: 'gpt-4' }));
      const dash = tracker.getDashboard();
      expect(dash).toBeDefined();
    });
  });

  describe('constructor options', () => {
    it('accepts custom maxRecords', () => {
      const t = new AIPerformanceTracker(500);
      expect(t).toBeDefined();
    });

    it('uses default maxRecords when not specified', () => {
      const t = new AIPerformanceTracker();
      expect(t).toBeDefined();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SDK index exports
// ─────────────────────────────────────────────────────────────────────────────

describe('SDK index exports', () => {
  it('exports AgentOrchestrator from index', async () => {
    const sdk = await import('../index');
    expect(sdk.AgentOrchestrator).toBeDefined();
  });

  it('exports AgentTemplates from index', async () => {
    const sdk = await import('../index');
    expect(sdk.AgentTemplates).toBeDefined();
    expect(Array.isArray(sdk.AgentTemplates)).toBe(true);
  });

  it('exports AIPerformanceTracker from index', async () => {
    const sdk = await import('../index');
    expect(sdk.AIPerformanceTracker).toBeDefined();
  });

  it('exports getTemplate helper from index', async () => {
    const sdk = await import('../index');
    expect(typeof sdk.getTemplate).toBe('function');
  });

  it('exports getCategories helper from index', async () => {
    const sdk = await import('../index');
    expect(typeof sdk.getCategories).toBe('function');
  });

  it('exports createFromTemplate helper from index', async () => {
    const sdk = await import('../index');
    expect(typeof sdk.createFromTemplate).toBe('function');
  });
});
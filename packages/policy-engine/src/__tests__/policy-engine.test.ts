/**
 * Policy Engine — Unit Tests
 * ═══════════════════════════════════════════════════════════════
 * Tests condition evaluation, rule matching, policy set strategies,
 * caching, platform policy sets, and error handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PolicyEngine,
  PolicyEngineError,
  PolicyRule,
  PolicySet,
  EvaluationContext,
  evaluateCondition,
  getAttributeValue,
  matchesGlob,
  ruleAppliesToRequest,
  createPlatformPolicySet,
  createPlanPolicySet,
  createPolicyEngine,
  DEFAULT_POLICY_ENGINE_CONFIG,
} from '../index';

// ── Helpers ───────────────────────────────────────────────────────
function makeCtx(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    subject: { id: 'usr-1', role: 'viewer', plan: 'starter', tenantId: 'tenant-1' },
    resource: { type: 'module', id: 'mod-1', tenantId: 'tenant-1' },
    action: 'read',
    environment: { ip: '1.2.3.4', time: new Date() },
    ...overrides,
  };
}

function makeRule(overrides: Partial<PolicyRule> = {}): PolicyRule {
  return {
    id: 'test-rule',
    effect: 'allow',
    conditions: [],
    ...overrides,
  };
}

function makePolicySet(overrides: Partial<PolicySet> = {}): PolicySet {
  return {
    id: 'test-set',
    name: 'Test Policy Set',
    version: '1.0.0',
    combineStrategy: 'first_match',
    defaultEffect: 'deny',
    enabled: true,
    rules: [],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// getAttributeValue
// ═══════════════════════════════════════════════════════════════
describe('getAttributeValue', () => {
  it('retrieves top-level value', () => {
    expect(getAttributeValue({ name: 'Alice' }, 'name')).toBe('Alice');
  });

  it('retrieves nested value via dot notation', () => {
    expect(getAttributeValue({ subject: { role: 'admin' } }, 'subject.role')).toBe('admin');
  });

  it('retrieves deeply nested value', () => {
    const obj = { a: { b: { c: 42 } } };
    expect(getAttributeValue(obj, 'a.b.c')).toBe(42);
  });

  it('returns undefined for missing path', () => {
    expect(getAttributeValue({}, 'missing.key')).toBeUndefined();
  });

  it('returns undefined when intermediate is null', () => {
    expect(getAttributeValue({ a: null }, 'a.b')).toBeUndefined();
  });

  it('returns undefined when intermediate is a primitive', () => {
    expect(getAttributeValue({ a: 42 }, 'a.b')).toBeUndefined();
  });

  it('handles array values', () => {
    expect(getAttributeValue({ tags: ['admin', 'user'] }, 'tags')).toEqual(['admin', 'user']);
  });
});

// ═══════════════════════════════════════════════════════════════
// matchesGlob
// ═══════════════════════════════════════════════════════════════
describe('matchesGlob', () => {
  it('exact match works', () => {
    expect(matchesGlob('module', 'module')).toBe(true);
    expect(matchesGlob('module', 'file')).toBe(false);
  });

  it('wildcard * matches anything', () => {
    expect(matchesGlob('*', 'anything')).toBe(true);
    expect(matchesGlob('**', 'anything')).toBe(true);
  });

  it('single * does not cross /', () => {
    expect(matchesGlob('module/*', 'module/read')).toBe(true);
    expect(matchesGlob('module/*', 'module/sub/read')).toBe(false);
  });

  it('double ** crosses /', () => {
    expect(matchesGlob('module/**', 'module/sub/read')).toBe(true);
  });

  it('prefix glob works', () => {
    expect(matchesGlob('api.*', 'api.users')).toBe(true);
    expect(matchesGlob('api.*', 'other.users')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// evaluateCondition
// ═══════════════════════════════════════════════════════════════
describe('evaluateCondition', () => {
  const ctx = makeCtx();

  it('eq: passes when equal', () => {
    const r = evaluateCondition({ attribute: 'subject.role', operator: 'eq', value: 'viewer' }, ctx);
    expect(r.passed).toBe(true);
  });

  it('eq: fails when not equal', () => {
    const r = evaluateCondition({ attribute: 'subject.role', operator: 'eq', value: 'admin' }, ctx);
    expect(r.passed).toBe(false);
  });

  it('neq: passes when not equal', () => {
    const r = evaluateCondition({ attribute: 'subject.role', operator: 'neq', value: 'admin' }, ctx);
    expect(r.passed).toBe(true);
  });

  it('gt/gte/lt/lte work with numbers', () => {
    const numCtx = { subject: { id: 'u', score: 85 } };
    expect(evaluateCondition({ attribute: 'subject.score', operator: 'gt', value: 80 }, numCtx).passed).toBe(true);
    expect(evaluateCondition({ attribute: 'subject.score', operator: 'gte', value: 85 }, numCtx).passed).toBe(true);
    expect(evaluateCondition({ attribute: 'subject.score', operator: 'lt', value: 90 }, numCtx).passed).toBe(true);
    expect(evaluateCondition({ attribute: 'subject.score', operator: 'lte', value: 85 }, numCtx).passed).toBe(true);
    expect(evaluateCondition({ attribute: 'subject.score', operator: 'gt', value: 90 }, numCtx).passed).toBe(false);
  });

  it('in: passes when value is in list', () => {
    const r = evaluateCondition({ attribute: 'subject.plan', operator: 'in', value: ['starter', 'pro'] }, ctx);
    expect(r.passed).toBe(true);
  });

  it('in: fails when value not in list', () => {
    const r = evaluateCondition({ attribute: 'subject.plan', operator: 'in', value: ['pro', 'enterprise'] }, ctx);
    expect(r.passed).toBe(false);
  });

  it('not_in: passes when value not in list', () => {
    const r = evaluateCondition({ attribute: 'subject.plan', operator: 'not_in', value: ['free'] }, ctx);
    expect(r.passed).toBe(true);
  });

  it('contains: passes when string contains substring', () => {
    const strCtx = { subject: { id: 'user@example.com' } };
    const r = evaluateCondition({ attribute: 'subject.id', operator: 'contains', value: '@example' }, strCtx);
    expect(r.passed).toBe(true);
  });

  it('starts_with / ends_with work', () => {
    const strCtx = { subject: { id: 'usr-admin-007' } };
    expect(evaluateCondition({ attribute: 'subject.id', operator: 'starts_with', value: 'usr-' }, strCtx).passed).toBe(true);
    expect(evaluateCondition({ attribute: 'subject.id', operator: 'ends_with', value: '-007' }, strCtx).passed).toBe(true);
  });

  it('matches: regex match', () => {
    const strCtx = { subject: { email: 'admin@trancendos.com' } };
    expect(evaluateCondition({ attribute: 'subject.email', operator: 'matches', value: '@trancendos\\.com$' }, strCtx).passed).toBe(true);
    expect(evaluateCondition({ attribute: 'subject.email', operator: 'matches', value: '^guest' }, strCtx).passed).toBe(false);
  });

  it('matches: invalid regex returns false', () => {
    const strCtx = { subject: { email: 'test@example.com' } };
    const r = evaluateCondition({ attribute: 'subject.email', operator: 'matches', value: '[invalid regex(' }, strCtx);
    expect(r.passed).toBe(false);
  });

  it('exists: passes when attribute present', () => {
    const r = evaluateCondition({ attribute: 'subject.role', operator: 'exists' }, ctx);
    expect(r.passed).toBe(true);
  });

  it('exists: fails when attribute missing', () => {
    const r = evaluateCondition({ attribute: 'subject.missing_attr', operator: 'exists' }, ctx);
    expect(r.passed).toBe(false);
  });

  it('not_exists: passes when attribute missing', () => {
    const r = evaluateCondition({ attribute: 'subject.nonexistent', operator: 'not_exists' }, ctx);
    expect(r.passed).toBe(true);
  });

  it('condition result includes attribute, operator, expected, actual', () => {
    const r = evaluateCondition({ attribute: 'subject.role', operator: 'eq', value: 'viewer' }, ctx);
    expect(r.attribute).toBe('subject.role');
    expect(r.operator).toBe('eq');
    expect(r.expected).toBe('viewer');
    expect(r.actual).toBe('viewer');
  });
});

// ═══════════════════════════════════════════════════════════════
// ruleAppliesToRequest
// ═══════════════════════════════════════════════════════════════
describe('ruleAppliesToRequest', () => {
  it('applies when no filters specified', () => {
    const rule = makeRule({ actions: [], resources: [] });
    expect(ruleAppliesToRequest(rule, 'read', 'module')).toBe(true);
  });

  it('applies when action matches exactly', () => {
    const rule = makeRule({ actions: ['read', 'list'] });
    expect(ruleAppliesToRequest(rule, 'read', undefined)).toBe(true);
  });

  it('does not apply when action does not match', () => {
    const rule = makeRule({ actions: ['write'] });
    expect(ruleAppliesToRequest(rule, 'read', undefined)).toBe(false);
  });

  it('applies when resource matches glob', () => {
    const rule = makeRule({ resources: ['module/*'] });
    expect(ruleAppliesToRequest(rule, undefined, 'module/my-mod')).toBe(true);
    expect(ruleAppliesToRequest(rule, undefined, 'file/my-file')).toBe(false);
  });

  it('applies when both action and resource match', () => {
    const rule = makeRule({ actions: ['read'], resources: ['module'] });
    expect(ruleAppliesToRequest(rule, 'read', 'module')).toBe(true);
    expect(ruleAppliesToRequest(rule, 'write', 'module')).toBe(false);
    expect(ruleAppliesToRequest(rule, 'read', 'file')).toBe(false);
  });

  it('applies when action is wildcard', () => {
    const rule = makeRule({ actions: ['*'] });
    expect(ruleAppliesToRequest(rule, 'delete', 'anything')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// PolicyEngine — Basic Operations
// ═══════════════════════════════════════════════════════════════
describe('PolicyEngine — Basic Operations', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = createPolicyEngine();
  });

  it('starts with no policy sets', () => {
    expect(engine.listPolicySets()).toHaveLength(0);
  });

  it('loads a policy set', () => {
    engine.loadPolicySet(makePolicySet());
    expect(engine.listPolicySets()).toHaveLength(1);
  });

  it('retrieves a loaded policy set by id', () => {
    const ps = makePolicySet({ id: 'my-set' });
    engine.loadPolicySet(ps);
    expect(engine.getPolicySet('my-set')).toEqual(ps);
  });

  it('removes a policy set', () => {
    engine.loadPolicySet(makePolicySet({ id: 'to-remove' }));
    expect(engine.removePolicySet('to-remove')).toBe(true);
    expect(engine.listPolicySets()).toHaveLength(0);
  });

  it('returns false when removing non-existent set', () => {
    expect(engine.removePolicySet('nonexistent')).toBe(false);
  });

  it('throws when rules exceed limit', () => {
    const engine = createPolicyEngine({ maxRulesPerSet: 2 });
    const ps = makePolicySet({
      rules: [makeRule({ id: 'r1' }), makeRule({ id: 'r2' }), makeRule({ id: 'r3' })],
    });
    expect(() => engine.loadPolicySet(ps)).toThrow(PolicyEngineError);
  });

  it('returns engine default when policy set not found', () => {
    const engine = createPolicyEngine({ defaultEffect: 'deny' });
    const decision = engine.evaluate('nonexistent-set', makeCtx());
    expect(decision.effect).toBe('deny');
    expect(decision.isDefault).toBe(true);
  });

  it('returns set default when no rules match', () => {
    engine.loadPolicySet(makePolicySet({ rules: [], defaultEffect: 'deny' }));
    const decision = engine.evaluate('test-set', makeCtx());
    expect(decision.effect).toBe('deny');
    expect(decision.isDefault).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// PolicyEngine — first_match strategy
// ═══════════════════════════════════════════════════════════════
describe('PolicyEngine — first_match strategy', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = createPolicyEngine();
  });

  it('returns allow when first matching rule allows', () => {
    engine.loadPolicySet(makePolicySet({
      combineStrategy: 'first_match',
      rules: [
        makeRule({
          id: 'admin-allow',
          effect: 'allow',
          conditions: [{ attribute: 'subject.role', operator: 'eq', value: 'admin' }],
        }),
      ],
    }));
    const ctx = makeCtx({ subject: { id: 'u', role: 'admin', plan: 'pro' } });
    const decision = engine.evaluate('test-set', ctx);
    expect(decision.effect).toBe('allow');
    expect(decision.matchedRuleId).toBe('admin-allow');
  });

  it('respects rule priority — higher priority wins', () => {
    engine.loadPolicySet(makePolicySet({
      combineStrategy: 'first_match',
      rules: [
        makeRule({
          id: 'low-priority',
          priority: 10,
          effect: 'deny',
          conditions: [{ attribute: 'subject.role', operator: 'eq', value: 'viewer' }],
        }),
        makeRule({
          id: 'high-priority',
          priority: 100,
          effect: 'allow',
          conditions: [{ attribute: 'subject.role', operator: 'eq', value: 'viewer' }],
        }),
      ],
    }));
    const decision = engine.evaluate('test-set', makeCtx());
    expect(decision.matchedRuleId).toBe('high-priority');
    expect(decision.effect).toBe('allow');
  });

  it('uses default when no rules match', () => {
    engine.loadPolicySet(makePolicySet({
      defaultEffect: 'deny',
      rules: [
        makeRule({
          id: 'admin-only',
          effect: 'allow',
          conditions: [{ attribute: 'subject.role', operator: 'eq', value: 'admin' }],
        }),
      ],
    }));
    const decision = engine.evaluate('test-set', makeCtx()); // viewer, not admin
    expect(decision.isDefault).toBe(true);
    expect(decision.effect).toBe('deny');
  });
});

// ═══════════════════════════════════════════════════════════════
// PolicyEngine — deny_overrides strategy
// ═══════════════════════════════════════════════════════════════
describe('PolicyEngine — deny_overrides strategy', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = createPolicyEngine();
  });

  it('deny wins over allow', () => {
    engine.loadPolicySet(makePolicySet({
      combineStrategy: 'deny_overrides',
      rules: [
        makeRule({ id: 'allow', effect: 'allow', conditions: [{ attribute: 'subject.role', operator: 'eq', value: 'viewer' }] }),
        makeRule({ id: 'deny', effect: 'deny', conditions: [{ attribute: 'subject.plan', operator: 'eq', value: 'starter' }] }),
      ],
    }));
    const decision = engine.evaluate('test-set', makeCtx());
    expect(decision.effect).toBe('deny');
  });

  it('returns allow when no deny matches', () => {
    engine.loadPolicySet(makePolicySet({
      combineStrategy: 'deny_overrides',
      rules: [
        makeRule({ id: 'allow-viewer', effect: 'allow', conditions: [{ attribute: 'subject.role', operator: 'eq', value: 'viewer' }] }),
      ],
    }));
    const decision = engine.evaluate('test-set', makeCtx());
    expect(decision.effect).toBe('allow');
  });
});

// ═══════════════════════════════════════════════════════════════
// PolicyEngine — allow_overrides strategy
// ═══════════════════════════════════════════════════════════════
describe('PolicyEngine — allow_overrides strategy', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = createPolicyEngine();
  });

  it('allow wins over deny', () => {
    engine.loadPolicySet(makePolicySet({
      combineStrategy: 'allow_overrides',
      rules: [
        makeRule({ id: 'deny', effect: 'deny', conditions: [{ attribute: 'subject.plan', operator: 'eq', value: 'starter' }] }),
        makeRule({ id: 'allow', effect: 'allow', conditions: [{ attribute: 'subject.role', operator: 'eq', value: 'viewer' }] }),
      ],
    }));
    const decision = engine.evaluate('test-set', makeCtx());
    expect(decision.effect).toBe('allow');
  });
});

// ═══════════════════════════════════════════════════════════════
// PolicyEngine — majority strategy
// ═══════════════════════════════════════════════════════════════
describe('PolicyEngine — majority strategy', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = createPolicyEngine();
  });

  it('majority allow wins', () => {
    engine.loadPolicySet(makePolicySet({
      combineStrategy: 'majority',
      rules: [
        makeRule({ id: 'allow1', effect: 'allow', conditions: [{ attribute: 'subject.id', operator: 'exists' }] }),
        makeRule({ id: 'allow2', effect: 'allow', conditions: [{ attribute: 'subject.id', operator: 'exists' }] }),
        makeRule({ id: 'deny1', effect: 'deny', conditions: [{ attribute: 'subject.id', operator: 'exists' }] }),
      ],
    }));
    const decision = engine.evaluate('test-set', makeCtx());
    expect(decision.effect).toBe('allow');
  });

  it('majority deny wins', () => {
    engine.loadPolicySet(makePolicySet({
      combineStrategy: 'majority',
      rules: [
        makeRule({ id: 'allow1', effect: 'allow', conditions: [{ attribute: 'subject.id', operator: 'exists' }] }),
        makeRule({ id: 'deny1', effect: 'deny', conditions: [{ attribute: 'subject.id', operator: 'exists' }] }),
        makeRule({ id: 'deny2', effect: 'deny', conditions: [{ attribute: 'subject.id', operator: 'exists' }] }),
      ],
    }));
    const decision = engine.evaluate('test-set', makeCtx());
    expect(decision.effect).toBe('deny');
  });
});

// ═══════════════════════════════════════════════════════════════
// PolicyEngine — Caching
// ═══════════════════════════════════════════════════════════════
describe('PolicyEngine — Caching', () => {
  it('caches decisions and returns same result', () => {
    const engine = createPolicyEngine({ cacheTtl: 5000 });
    engine.loadPolicySet(makePolicySet({ rules: [] }));
    const ctx = makeCtx();
    const d1 = engine.evaluate('test-set', ctx);
    const d2 = engine.evaluate('test-set', ctx);
    expect(d1.effect).toBe(d2.effect);
    expect(engine.getCacheSize()).toBeGreaterThan(0);
  });

  it('clears cache on policy set load', () => {
    const engine = createPolicyEngine({ cacheTtl: 5000 });
    engine.loadPolicySet(makePolicySet({ rules: [] }));
    engine.evaluate('test-set', makeCtx());
    expect(engine.getCacheSize()).toBeGreaterThan(0);
    engine.loadPolicySet(makePolicySet({ id: 'new-set', rules: [] }));
    expect(engine.getCacheSize()).toBe(0);
  });

  it('no caching when cacheTtl is 0', () => {
    const engine = createPolicyEngine({ cacheTtl: 0 });
    engine.loadPolicySet(makePolicySet({ rules: [] }));
    engine.evaluate('test-set', makeCtx());
    expect(engine.getCacheSize()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// PolicyEngine — evaluateAll
// ═══════════════════════════════════════════════════════════════
describe('PolicyEngine — evaluateAll', () => {
  it('returns default when no policy sets loaded', () => {
    const engine = createPolicyEngine({ defaultEffect: 'deny' });
    const d = engine.evaluateAll(makeCtx());
    expect(d.effect).toBe('deny');
    expect(d.isDefault).toBe(true);
  });

  it('evaluates across multiple sets with deny_overrides', () => {
    const engine = createPolicyEngine();
    engine.loadPolicySet(makePolicySet({
      id: 'set1',
      combineStrategy: 'first_match',
      defaultEffect: 'allow',
      rules: [makeRule({ id: 'allow-all', effect: 'allow', conditions: [] })],
    }));
    engine.loadPolicySet(makePolicySet({
      id: 'set2',
      combineStrategy: 'first_match',
      defaultEffect: 'deny',
      rules: [makeRule({ id: 'deny-all', effect: 'deny', conditions: [] })],
    }));
    const d = engine.evaluateAll(makeCtx(), undefined, undefined, 'deny_overrides');
    expect(d.effect).toBe('deny');
  });
});

// ═══════════════════════════════════════════════════════════════
// Platform Policy Sets
// ═══════════════════════════════════════════════════════════════
describe('createPlatformPolicySet', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = createPolicyEngine({ trace: true });
    engine.loadPolicySet(createPlatformPolicySet());
  });

  it('owner gets full access', () => {
    const ctx = makeCtx({ subject: { id: 'u', role: 'owner', plan: 'free' } });
    const d = engine.evaluate('platform-default', ctx, 'delete', 'billing');
    expect(d.effect).toBe('allow');
  });

  it('viewer gets read access to modules', () => {
    const ctx = makeCtx({ subject: { id: 'u', role: 'viewer', plan: 'starter' } });
    const d = engine.evaluate('platform-default', ctx, 'read', 'module');
    expect(d.effect).toBe('allow');
  });

  it('suspended user is denied regardless of role', () => {
    const ctx = makeCtx({
      subject: { id: 'u', role: 'owner', plan: 'enterprise', status: 'suspended' },
    });
    const d = engine.evaluate('platform-default', ctx, 'read', 'module');
    expect(d.effect).toBe('deny');
  });

  it('platform policy set has enabled=true', () => {
    const ps = createPlatformPolicySet();
    expect(ps.enabled).toBe(true);
  });

  it('platform policy set uses deny_overrides strategy', () => {
    const ps = createPlatformPolicySet();
    expect(ps.combineStrategy).toBe('deny_overrides');
  });

  it('accepts custom tenant ID', () => {
    const ps = createPlatformPolicySet('tenant-xyz');
    expect(ps.id).toBe('platform-tenant-xyz');
  });
});

describe('createPlanPolicySet', () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = createPolicyEngine();
    engine.loadPolicySet(createPlanPolicySet());
  });

  it('enterprise gets full feature access', () => {
    const ctx = makeCtx({ subject: { id: 'u', role: 'admin', plan: 'enterprise' } });
    const d = engine.evaluate('plan-gating', ctx, 'export', 'analytics');
    expect(d.effect).toBe('allow');
  });

  it('pro can export analytics', () => {
    const ctx = makeCtx({ subject: { id: 'u', role: 'admin', plan: 'pro' } });
    const d = engine.evaluate('plan-gating', ctx, 'export', 'analytics');
    expect(d.effect).toBe('allow');
  });

  it('free tier only gets read on modules', () => {
    const ctx = makeCtx({ subject: { id: 'u', role: 'admin', plan: 'free' } });
    const d = engine.evaluate('plan-gating', ctx, 'read', 'module');
    expect(d.effect).toBe('allow');
  });

  it('plan policy set has deny default effect', () => {
    const ps = createPlanPolicySet();
    expect(ps.defaultEffect).toBe('deny');
  });
});

// ═══════════════════════════════════════════════════════════════
// PolicyEngine — Trace Mode
// ═══════════════════════════════════════════════════════════════
describe('PolicyEngine — Trace Mode', () => {
  it('includes trace when trace=true', () => {
    const engine = createPolicyEngine({ trace: true });
    engine.loadPolicySet(makePolicySet({
      rules: [makeRule({ id: 'test', effect: 'allow', conditions: [] })],
    }));
    const d = engine.evaluate('test-set', makeCtx());
    expect(d.trace).toBeDefined();
    expect(Array.isArray(d.trace)).toBe(true);
  });

  it('omits trace when trace=false', () => {
    const engine = createPolicyEngine({ trace: false });
    engine.loadPolicySet(makePolicySet({
      rules: [makeRule({ id: 'test', effect: 'allow', conditions: [] })],
    }));
    const d = engine.evaluate('test-set', makeCtx());
    expect(d.trace).toBeUndefined();
  });

  it('trace includes ruleId, matched, effect, conditionResults', () => {
    const engine = createPolicyEngine({ trace: true });
    engine.loadPolicySet(makePolicySet({
      rules: [
        makeRule({
          id: 'admin-rule',
          effect: 'allow',
          conditions: [{ attribute: 'subject.role', operator: 'eq', value: 'admin' }],
        }),
      ],
    }));
    const d = engine.evaluate('test-set', makeCtx({ subject: { id: 'u', role: 'viewer' } }));
    expect(d.trace![0].ruleId).toBe('admin-rule');
    expect(d.trace![0].matched).toBe(false);
    expect(Array.isArray(d.trace![0].conditionResults)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// PolicyEngine — Stats & Config
// ═══════════════════════════════════════════════════════════════
describe('PolicyEngine — Stats & Config', () => {
  it('getStats returns policy set count', () => {
    const engine = createPolicyEngine();
    engine.loadPolicySet(makePolicySet({ id: 'ps1' }));
    engine.loadPolicySet(makePolicySet({ id: 'ps2' }));
    const stats = engine.getStats();
    expect(stats.policySets).toBe(2);
  });

  it('getStats includes config', () => {
    const engine = createPolicyEngine({ trace: true });
    const stats = engine.getStats();
    expect(stats.config.trace).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// DEFAULT_POLICY_ENGINE_CONFIG
// ═══════════════════════════════════════════════════════════════
describe('DEFAULT_POLICY_ENGINE_CONFIG', () => {
  it('has safe defaults', () => {
    expect(DEFAULT_POLICY_ENGINE_CONFIG.defaultEffect).toBe('deny');
    expect(DEFAULT_POLICY_ENGINE_CONFIG.trace).toBe(false);
    expect(DEFAULT_POLICY_ENGINE_CONFIG.cacheTtl).toBeGreaterThan(0);
    expect(DEFAULT_POLICY_ENGINE_CONFIG.maxRulesPerSet).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Disabled Policy Set
// ═══════════════════════════════════════════════════════════════
describe('Disabled Policy Set', () => {
  it('returns set default when policy set is disabled', () => {
    const engine = createPolicyEngine();
    engine.loadPolicySet(makePolicySet({
      enabled: false,
      defaultEffect: 'allow',
      rules: [makeRule({ id: 'deny-all', effect: 'deny', conditions: [] })],
    }));
    const d = engine.evaluate('test-set', makeCtx());
    expect(d.effect).toBe('allow'); // set default, rules not evaluated
    expect(d.isDefault).toBe(true);
  });
});
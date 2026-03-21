/**
 * @trancendos/policy-engine — CEL-inspired Policy Rule Engine
 * ============================================================
 * A lightweight, composable policy evaluation engine for the
 * Trancendos platform. Evaluates structured policy rules against
 * request contexts to produce allow/deny decisions with full
 * audit trail support.
 *
 * Features:
 *  - Declarative rule DSL with conditions and effects
 *  - Policy sets with priority ordering
 *  - Attribute-based access control (ABAC)
 *  - Role and plan-tier integration
 *  - Audit logging and decision explanations
 *  - Caching for repeated evaluations
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type PolicyEffect = 'allow' | 'deny';

export type PolicyOperator =
  | 'eq'        // equals
  | 'neq'       // not equals
  | 'gt'        // greater than
  | 'gte'       // greater than or equal
  | 'lt'        // less than
  | 'lte'       // less than or equal
  | 'in'        // value in list
  | 'not_in'    // value not in list
  | 'contains'  // string contains
  | 'starts_with'
  | 'ends_with'
  | 'matches'   // regex match
  | 'exists'    // attribute exists
  | 'not_exists';

export type PolicyCombineStrategy =
  | 'first_match'    // use first matching rule
  | 'deny_overrides' // any deny = deny
  | 'allow_overrides'// any allow = allow
  | 'majority';      // majority wins

export interface PolicyCondition {
  /** Dot-notation path into the evaluation context, e.g. "subject.role" */
  attribute: string;
  operator: PolicyOperator;
  /** Value to compare against (not used for exists/not_exists) */
  value?: unknown;
}

export interface PolicyRule {
  id: string;
  description?: string;
  /** Priority — higher runs first (default 0) */
  priority?: number;
  effect: PolicyEffect;
  /** All conditions must match for this rule to apply */
  conditions: PolicyCondition[];
  /** Resources this rule applies to (glob patterns) */
  resources?: string[];
  /** Actions this rule applies to */
  actions?: string[];
  /** Optional metadata for audit trails */
  metadata?: Record<string, unknown>;
}

export interface PolicySet {
  id: string;
  name: string;
  description?: string;
  version: string;
  combineStrategy: PolicyCombineStrategy;
  rules: PolicyRule[];
  /** Default effect when no rules match */
  defaultEffect: PolicyEffect;
  enabled: boolean;
}

export interface EvaluationContext {
  /** Subject (caller) attributes */
  subject: {
    id: string;
    role?: string;
    plan?: string;
    tenantId?: string;
    [key: string]: unknown;
  };
  /** Resource being accessed */
  resource?: {
    type?: string;
    id?: string;
    ownerId?: string;
    tenantId?: string;
    [key: string]: unknown;
  };
  /** Action being performed */
  action?: string;
  /** Environment context */
  environment?: {
    ip?: string;
    time?: Date;
    [key: string]: unknown;
  };
  /** Additional arbitrary attributes */
  [key: string]: unknown;
}

export interface PolicyDecision {
  effect: PolicyEffect;
  /** The rule that determined this decision (if any) */
  matchedRuleId?: string;
  /** Policy set that was evaluated */
  policySetId?: string;
  /** Whether the default effect was used */
  isDefault: boolean;
  /** Human-readable explanation */
  reason: string;
  /** All rules evaluated with their outcomes */
  trace?: RuleTrace[];
}

export interface RuleTrace {
  ruleId: string;
  matched: boolean;
  effect: PolicyEffect;
  conditionResults: ConditionResult[];
}

export interface ConditionResult {
  attribute: string;
  operator: PolicyOperator;
  expected: unknown;
  actual: unknown;
  passed: boolean;
}

export interface PolicyEngineConfig {
  /** Enable detailed trace in decisions */
  trace: boolean;
  /** Cache TTL in ms (0 = no cache) */
  cacheTtl: number;
  /** Default effect when no policy set is loaded */
  defaultEffect: PolicyEffect;
  /** Maximum rules per policy set */
  maxRulesPerSet: number;
}

export const DEFAULT_POLICY_ENGINE_CONFIG: PolicyEngineConfig = {
  trace: false,
  cacheTtl: 5000,
  defaultEffect: 'deny',
  maxRulesPerSet: 500,
};

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Safely retrieve a nested value by dot-notation path from an object.
 *
 * @example
 * getAttributeValue({ subject: { role: 'admin' } }, 'subject.role') // => 'admin'
 */
export function getAttributeValue(ctx: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = ctx;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Match a resource string against a glob pattern.
 * Supports * (single segment) and ** (multi-segment) wildcards.
 */
export function matchesGlob(pattern: string, value: string): boolean {
  if (pattern === '*' || pattern === '**') return true;
  if (pattern === value) return true;

  // Convert glob to regex
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__DOUBLE_STAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DOUBLE_STAR__/g, '.*');

  return new RegExp(`^${escaped}$`).test(value);
}

/**
 * Evaluate a single condition against an evaluation context.
 */
export function evaluateCondition(
  condition: PolicyCondition,
  ctx: EvaluationContext,
): ConditionResult {
  const actual = getAttributeValue(ctx as Record<string, unknown>, condition.attribute);
  const expected = condition.value;

  let passed = false;

  switch (condition.operator) {
    case 'eq':
      passed = actual === expected;
      break;
    case 'neq':
      passed = actual !== expected;
      break;
    case 'gt':
      passed = typeof actual === 'number' && typeof expected === 'number' && actual > expected;
      break;
    case 'gte':
      passed = typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
      break;
    case 'lt':
      passed = typeof actual === 'number' && typeof expected === 'number' && actual < expected;
      break;
    case 'lte':
      passed = typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
      break;
    case 'in':
      passed = Array.isArray(expected) && expected.includes(actual);
      break;
    case 'not_in':
      passed = Array.isArray(expected) && !expected.includes(actual);
      break;
    case 'contains':
      passed = typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected);
      break;
    case 'starts_with':
      passed = typeof actual === 'string' && typeof expected === 'string' && actual.startsWith(expected);
      break;
    case 'ends_with':
      passed = typeof actual === 'string' && typeof expected === 'string' && actual.endsWith(expected);
      break;
    case 'matches':
      try {
        passed = typeof actual === 'string' && typeof expected === 'string' && new RegExp(expected).test(actual);
      } catch {
        passed = false;
      }
      break;
    case 'exists':
      passed = actual !== undefined && actual !== null;
      break;
    case 'not_exists':
      passed = actual === undefined || actual === null;
      break;
    default:
      passed = false;
  }

  return { attribute: condition.attribute, operator: condition.operator, expected, actual, passed };
}

/**
 * Check if a rule applies to the given action and resource.
 */
export function ruleAppliesToRequest(
  rule: PolicyRule,
  action?: string,
  resource?: string,
): boolean {
  // Check action filter
  if (rule.actions && rule.actions.length > 0 && action) {
    const actionMatch = rule.actions.some(
      (a) => a === '*' || a === action || matchesGlob(a, action),
    );
    if (!actionMatch) return false;
  }

  // Check resource filter
  if (rule.resources && rule.resources.length > 0 && resource) {
    const resourceMatch = rule.resources.some((r) => matchesGlob(r, resource));
    if (!resourceMatch) return false;
  }

  return true;
}

// ── Policy Engine ──────────────────────────────────────────────────────────

export class PolicyEngine {
  private policySets: Map<string, PolicySet> = new Map();
  private decisionCache: Map<string, { decision: PolicyDecision; expiresAt: number }> = new Map();
  private readonly config: PolicyEngineConfig;

  constructor(config: Partial<PolicyEngineConfig> = {}) {
    this.config = { ...DEFAULT_POLICY_ENGINE_CONFIG, ...config };
  }

  // ── Policy Set Management ────────────────────────────────────────

  loadPolicySet(policySet: PolicySet): void {
    if (policySet.rules.length > this.config.maxRulesPerSet) {
      throw new PolicyEngineError(
        `Policy set "${policySet.id}" exceeds max rules limit of ${this.config.maxRulesPerSet}`,
        'RULES_LIMIT_EXCEEDED',
      );
    }
    this.policySets.set(policySet.id, policySet);
    this.clearCache();
  }

  removePolicySet(policySetId: string): boolean {
    const removed = this.policySets.delete(policySetId);
    if (removed) this.clearCache();
    return removed;
  }

  getPolicySet(policySetId: string): PolicySet | undefined {
    return this.policySets.get(policySetId);
  }

  listPolicySets(): PolicySet[] {
    return Array.from(this.policySets.values());
  }

  // ── Evaluation ───────────────────────────────────────────────────

  /**
   * Evaluate a context against a specific policy set.
   */
  evaluate(
    policySetId: string,
    ctx: EvaluationContext,
    action?: string,
    resource?: string,
  ): PolicyDecision {
    const policySet = this.policySets.get(policySetId);

    if (!policySet) {
      return {
        effect: this.config.defaultEffect,
        isDefault: true,
        reason: `Policy set "${policySetId}" not found — using engine default`,
      };
    }

    if (!policySet.enabled) {
      return {
        effect: policySet.defaultEffect,
        policySetId,
        isDefault: true,
        reason: `Policy set "${policySetId}" is disabled — using set default`,
      };
    }

    // Check cache
    if (this.config.cacheTtl > 0) {
      const cacheKey = this.buildCacheKey(policySetId, ctx, action, resource);
      const cached = this.decisionCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.decision;
      }
    }

    // Sort rules by priority (descending)
    const sortedRules = [...policySet.rules].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    );

    const traces: RuleTrace[] = [];

    // Evaluate rules based on combination strategy
    const decision = this.applyStrategy(
      policySet,
      sortedRules,
      ctx,
      action,
      resource,
      traces,
    );

    const result: PolicyDecision = {
      ...decision,
      policySetId,
      trace: this.config.trace ? traces : undefined,
    };

    // Cache result
    if (this.config.cacheTtl > 0) {
      const cacheKey = this.buildCacheKey(policySetId, ctx, action, resource);
      this.decisionCache.set(cacheKey, {
        decision: result,
        expiresAt: Date.now() + this.config.cacheTtl,
      });
    }

    return result;
  }

  /**
   * Evaluate context against ALL loaded policy sets and combine results.
   */
  evaluateAll(
    ctx: EvaluationContext,
    action?: string,
    resource?: string,
    strategy: PolicyCombineStrategy = 'deny_overrides',
  ): PolicyDecision {
    const activeSets = Array.from(this.policySets.values()).filter((ps) => ps.enabled);

    if (activeSets.length === 0) {
      return {
        effect: this.config.defaultEffect,
        isDefault: true,
        reason: 'No active policy sets — using engine default',
      };
    }

    const decisions = activeSets.map((ps) =>
      this.evaluate(ps.id, ctx, action, resource),
    );

    return this.combineDecisions(decisions, strategy);
  }

  // ── Private Helpers ──────────────────────────────────────────────

  private applyStrategy(
    policySet: PolicySet,
    rules: PolicyRule[],
    ctx: EvaluationContext,
    action: string | undefined,
    resource: string | undefined,
    traces: RuleTrace[],
  ): Omit<PolicyDecision, 'policySetId' | 'trace'> {
    switch (policySet.combineStrategy) {
      case 'first_match':
        return this.firstMatchStrategy(policySet, rules, ctx, action, resource, traces);
      case 'deny_overrides':
        return this.denyOverridesStrategy(policySet, rules, ctx, action, resource, traces);
      case 'allow_overrides':
        return this.allowOverridesStrategy(policySet, rules, ctx, action, resource, traces);
      case 'majority':
        return this.majorityStrategy(policySet, rules, ctx, action, resource, traces);
      default:
        return this.firstMatchStrategy(policySet, rules, ctx, action, resource, traces);
    }
  }

  private evaluateRule(
    rule: PolicyRule,
    ctx: EvaluationContext,
    action: string | undefined,
    resource: string | undefined,
    traces: RuleTrace[],
  ): { matched: boolean; effect: PolicyEffect } {
    // Check if rule applies to this action/resource
    if (!ruleAppliesToRequest(rule, action, resource)) {
      if (this.config.trace) {
        traces.push({
          ruleId: rule.id,
          matched: false,
          effect: rule.effect,
          conditionResults: [],
        });
      }
      return { matched: false, effect: rule.effect };
    }

    // Evaluate all conditions (ALL must pass)
    const conditionResults = rule.conditions.map((c) => evaluateCondition(c, ctx));
    const allPassed = conditionResults.every((r) => r.passed);

    if (this.config.trace) {
      traces.push({
        ruleId: rule.id,
        matched: allPassed,
        effect: rule.effect,
        conditionResults,
      });
    }

    return { matched: allPassed, effect: rule.effect };
  }

  private firstMatchStrategy(
    policySet: PolicySet,
    rules: PolicyRule[],
    ctx: EvaluationContext,
    action: string | undefined,
    resource: string | undefined,
    traces: RuleTrace[],
  ): Omit<PolicyDecision, 'policySetId' | 'trace'> {
    for (const rule of rules) {
      const { matched, effect } = this.evaluateRule(rule, ctx, action, resource, traces);
      if (matched) {
        return {
          effect,
          matchedRuleId: rule.id,
          isDefault: false,
          reason: `Rule "${rule.id}" matched (${rule.description || effect})`,
        };
      }
    }
    return {
      effect: policySet.defaultEffect,
      isDefault: true,
      reason: 'No rules matched — using policy set default',
    };
  }

  private denyOverridesStrategy(
    policySet: PolicySet,
    rules: PolicyRule[],
    ctx: EvaluationContext,
    action: string | undefined,
    resource: string | undefined,
    traces: RuleTrace[],
  ): Omit<PolicyDecision, 'policySetId' | 'trace'> {
    let hasAllow = false;
    let firstDenyRuleId: string | undefined;

    for (const rule of rules) {
      const { matched, effect } = this.evaluateRule(rule, ctx, action, resource, traces);
      if (matched) {
        if (effect === 'deny') {
          firstDenyRuleId = rule.id;
          return {
            effect: 'deny',
            matchedRuleId: firstDenyRuleId,
            isDefault: false,
            reason: `Deny rule "${rule.id}" matched — deny overrides`,
          };
        }
        if (effect === 'allow') hasAllow = true;
      }
    }

    if (hasAllow) {
      return { effect: 'allow', isDefault: false, reason: 'Allow rule matched, no denies' };
    }

    return {
      effect: policySet.defaultEffect,
      isDefault: true,
      reason: 'No matching rules — using policy set default',
    };
  }

  private allowOverridesStrategy(
    policySet: PolicySet,
    rules: PolicyRule[],
    ctx: EvaluationContext,
    action: string | undefined,
    resource: string | undefined,
    traces: RuleTrace[],
  ): Omit<PolicyDecision, 'policySetId' | 'trace'> {
    for (const rule of rules) {
      const { matched, effect } = this.evaluateRule(rule, ctx, action, resource, traces);
      if (matched && effect === 'allow') {
        return {
          effect: 'allow',
          matchedRuleId: rule.id,
          isDefault: false,
          reason: `Allow rule "${rule.id}" matched — allow overrides`,
        };
      }
    }

    // Check if any deny matched
    const anyDeny = traces.some((t) => t.matched && t.effect === 'deny');
    if (anyDeny) {
      const denyTrace = traces.find((t) => t.matched && t.effect === 'deny');
      return {
        effect: 'deny',
        matchedRuleId: denyTrace?.ruleId,
        isDefault: false,
        reason: 'No allow rules matched but deny rule found',
      };
    }

    return {
      effect: policySet.defaultEffect,
      isDefault: true,
      reason: 'No matching rules — using policy set default',
    };
  }

  private majorityStrategy(
    policySet: PolicySet,
    rules: PolicyRule[],
    ctx: EvaluationContext,
    action: string | undefined,
    resource: string | undefined,
    traces: RuleTrace[],
  ): Omit<PolicyDecision, 'policySetId' | 'trace'> {
    let allows = 0;
    let denies = 0;

    for (const rule of rules) {
      const { matched, effect } = this.evaluateRule(rule, ctx, action, resource, traces);
      if (matched) {
        if (effect === 'allow') allows++;
        else denies++;
      }
    }

    if (allows === 0 && denies === 0) {
      return {
        effect: policySet.defaultEffect,
        isDefault: true,
        reason: 'No matching rules — using policy set default',
      };
    }

    const effect = allows >= denies ? 'allow' : 'deny';
    return {
      effect,
      isDefault: false,
      reason: `Majority decision: ${allows} allows vs ${denies} denies`,
    };
  }

  private combineDecisions(
    decisions: PolicyDecision[],
    strategy: PolicyCombineStrategy,
  ): PolicyDecision {
    if (decisions.length === 0) {
      return {
        effect: this.config.defaultEffect,
        isDefault: true,
        reason: 'No decisions to combine',
      };
    }

    switch (strategy) {
      case 'deny_overrides': {
        const deny = decisions.find((d) => d.effect === 'deny');
        if (deny) return { ...deny, reason: `Deny overrides: ${deny.reason}` };
        return { ...decisions[0], reason: `All policies allow` };
      }
      case 'allow_overrides': {
        const allow = decisions.find((d) => d.effect === 'allow');
        if (allow) return { ...allow, reason: `Allow overrides: ${allow.reason}` };
        return { ...decisions[0], reason: `All policies deny` };
      }
      case 'first_match':
        return decisions[0];
      case 'majority': {
        const allows = decisions.filter((d) => d.effect === 'allow').length;
        const denies = decisions.filter((d) => d.effect === 'deny').length;
        return {
          effect: allows >= denies ? 'allow' : 'deny',
          isDefault: false,
          reason: `Majority: ${allows} allows, ${denies} denies`,
        };
      }
      default:
        return decisions[0];
    }
  }

  private buildCacheKey(
    policySetId: string,
    ctx: EvaluationContext,
    action?: string,
    resource?: string,
  ): string {
    return `${policySetId}|${action ?? ''}|${resource ?? ''}|${JSON.stringify(ctx)}`;
  }

  clearCache(): void {
    this.decisionCache.clear();
  }

  getCacheSize(): number {
    return this.decisionCache.size;
  }

  getStats(): { policySets: number; cachedDecisions: number; config: PolicyEngineConfig } {
    return {
      policySets: this.policySets.size,
      cachedDecisions: this.decisionCache.size,
      config: this.config,
    };
  }
}

// ── PolicyEngineError ──────────────────────────────────────────────────────

export class PolicyEngineError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'PolicyEngineError';
  }
}

// ── Predefined Policy Sets for Platform ───────────────────────────────────

/** Create a standard platform policy set with RBAC rules */
export function createPlatformPolicySet(tenantId?: string): PolicySet {
  return {
    id: tenantId ? `platform-${tenantId}` : 'platform-default',
    name: 'Platform RBAC Policy',
    description: 'Standard role-based access control for the Trancendos platform',
    version: '1.0.0',
    combineStrategy: 'deny_overrides',
    defaultEffect: 'deny',
    enabled: true,
    rules: [
      // Owner has full access
      {
        id: 'owner-full-access',
        description: 'Owners have unrestricted access',
        priority: 100,
        effect: 'allow',
        conditions: [{ attribute: 'subject.role', operator: 'eq', value: 'owner' }],
        resources: ['*'],
        actions: ['*'],
      },
      // Admin has broad access except billing management
      {
        id: 'admin-broad-access',
        description: 'Admins have broad access excluding billing',
        priority: 90,
        effect: 'allow',
        conditions: [{ attribute: 'subject.role', operator: 'eq', value: 'admin' }],
        resources: ['tenant', 'user', 'module', 'workflow', 'file', 'api_key', 'settings', 'analytics', 'integration'],
        actions: ['create', 'read', 'update', 'delete', 'list', 'manage', 'invite'],
      },
      // Editor can manage content
      {
        id: 'editor-content-access',
        description: 'Editors can manage content and files',
        priority: 80,
        effect: 'allow',
        conditions: [{ attribute: 'subject.role', operator: 'eq', value: 'editor' }],
        resources: ['module', 'workflow', 'file'],
        actions: ['create', 'read', 'update', 'delete', 'list', 'execute'],
      },
      // Viewer can only read
      {
        id: 'viewer-read-only',
        description: 'Viewers have read-only access',
        priority: 70,
        effect: 'allow',
        conditions: [{ attribute: 'subject.role', operator: 'eq', value: 'viewer' }],
        resources: ['module', 'workflow', 'file', 'analytics'],
        actions: ['read', 'list'],
      },
      // Guests can only read public resources
      {
        id: 'guest-minimal-access',
        description: 'Guests have minimal read access',
        priority: 60,
        effect: 'allow',
        conditions: [{ attribute: 'subject.role', operator: 'eq', value: 'guest' }],
        resources: ['module'],
        actions: ['read', 'list'],
      },
      // Deny suspended accounts
      {
        id: 'deny-suspended',
        description: 'Deny all access for suspended accounts',
        priority: 200,
        effect: 'deny',
        conditions: [{ attribute: 'subject.status', operator: 'eq', value: 'suspended' }],
        resources: ['*'],
        actions: ['*'],
      },
    ],
  };
}

/** Create a plan-tier gating policy set */
export function createPlanPolicySet(): PolicySet {
  return {
    id: 'plan-gating',
    name: 'Plan Tier Feature Gating',
    description: 'Gates features based on subscription plan tier',
    version: '1.0.0',
    combineStrategy: 'deny_overrides',
    defaultEffect: 'deny',
    enabled: true,
    rules: [
      // Enterprise gets everything
      {
        id: 'enterprise-all-features',
        description: 'Enterprise plan has access to all features',
        priority: 100,
        effect: 'allow',
        conditions: [{ attribute: 'subject.plan', operator: 'eq', value: 'enterprise' }],
        resources: ['*'],
        actions: ['*'],
      },
      // Pro gets most features
      {
        id: 'pro-most-features',
        description: 'Pro plan has access to most features',
        priority: 90,
        effect: 'allow',
        conditions: [{ attribute: 'subject.plan', operator: 'in', value: ['pro', 'enterprise'] }],
        resources: ['module', 'workflow', 'file', 'analytics', 'integration', 'api_key'],
        actions: ['create', 'read', 'update', 'delete', 'list', 'execute', 'export'],
      },
      // Starter gets basic features
      {
        id: 'starter-basic-features',
        description: 'Starter plan has access to basic features',
        priority: 80,
        effect: 'allow',
        conditions: [{ attribute: 'subject.plan', operator: 'in', value: ['starter', 'pro', 'enterprise'] }],
        resources: ['module', 'workflow', 'file'],
        actions: ['create', 'read', 'update', 'delete', 'list'],
      },
      // Free tier gets read-only basic
      {
        id: 'free-read-basic',
        description: 'Free plan has read-only access to basic features',
        priority: 70,
        effect: 'allow',
        conditions: [{ attribute: 'subject.plan', operator: 'exists' }],
        resources: ['module'],
        actions: ['read', 'list'],
      },
    ],
  };
}

// ── Factory ────────────────────────────────────────────────────────────────

export function createPolicyEngine(config?: Partial<PolicyEngineConfig>): PolicyEngine {
  return new PolicyEngine(config);
}
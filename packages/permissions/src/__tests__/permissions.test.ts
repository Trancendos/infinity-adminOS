/**
 * @trancendos/permissions — Test Suite
 * =====================================
 * Tests for RBAC permission engine with plan-tier gating.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Plan tier utilities
  isPlanAtLeast,
  comparePlanTiers,
  PLAN_TIER_LEVELS,
  getPlanLimits,
  hasFeature,
  isWithinLimit,
  PLAN_LIMITS,
  // Role utilities
  getRoleDefinition,
  getRolePriority,
  isRoleAtLeast,
  ROLE_DEFINITIONS,
  // Condition evaluator
  evaluateCondition,
  // Permission engine
  PermissionEngine,
  // Convenience
  checkPermission,
  isResourceOwner,
  createProductionEngine,
  getAvailableRoles,
  // Types
  type PolicyContext,
  type PlanTier,
  type Role,
  type Action,
  type ResourceType,
  type PermissionCondition,
} from '../index';

// ── Helpers ────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<PolicyContext> = {}): PolicyContext {
  return {
    role: 'editor',
    planTier: 'pro',
    userId: 'user-1',
    tenantId: 'tenant-1',
    ...overrides,
  };
}

// ── Plan Tier Hierarchy ────────────────────────────────────────────────

describe('Plan Tier Hierarchy', () => {
  describe('PLAN_TIER_LEVELS', () => {
    it('has correct ordering', () => {
      expect(PLAN_TIER_LEVELS.free).toBe(0);
      expect(PLAN_TIER_LEVELS.starter).toBe(1);
      expect(PLAN_TIER_LEVELS.pro).toBe(2);
      expect(PLAN_TIER_LEVELS.enterprise).toBe(3);
    });
  });

  describe('isPlanAtLeast', () => {
    it('enterprise >= all tiers', () => {
      expect(isPlanAtLeast('enterprise', 'free')).toBe(true);
      expect(isPlanAtLeast('enterprise', 'starter')).toBe(true);
      expect(isPlanAtLeast('enterprise', 'pro')).toBe(true);
      expect(isPlanAtLeast('enterprise', 'enterprise')).toBe(true);
    });

    it('free < all paid tiers', () => {
      expect(isPlanAtLeast('free', 'starter')).toBe(false);
      expect(isPlanAtLeast('free', 'pro')).toBe(false);
      expect(isPlanAtLeast('free', 'enterprise')).toBe(false);
    });

    it('same tier returns true', () => {
      expect(isPlanAtLeast('pro', 'pro')).toBe(true);
      expect(isPlanAtLeast('free', 'free')).toBe(true);
    });
  });

  describe('comparePlanTiers', () => {
    it('returns positive when first is higher', () => {
      expect(comparePlanTiers('pro', 'free')).toBeGreaterThan(0);
    });

    it('returns negative when first is lower', () => {
      expect(comparePlanTiers('free', 'enterprise')).toBeLessThan(0);
    });

    it('returns zero for same tier', () => {
      expect(comparePlanTiers('starter', 'starter')).toBe(0);
    });
  });
});

// ── Plan Limits ────────────────────────────────────────────────────────

describe('Plan Limits', () => {
  describe('getPlanLimits', () => {
    it('returns limits for each tier', () => {
      const free = getPlanLimits('free');
      expect(free.maxUsers).toBe(3);
      expect(free.maxModules).toBe(5);
      expect(free.maxStorage).toBe(100);

      const enterprise = getPlanLimits('enterprise');
      expect(enterprise.maxUsers).toBe(-1); // unlimited
    });
  });

  describe('hasFeature', () => {
    it('free tier has basic features', () => {
      expect(hasFeature('free', 'basic_analytics')).toBe(true);
      expect(hasFeature('free', 'community_support')).toBe(true);
    });

    it('free tier lacks advanced features', () => {
      expect(hasFeature('free', 'sso')).toBe(false);
      expect(hasFeature('free', 'audit_log')).toBe(false);
      expect(hasFeature('free', 'white_label')).toBe(false);
    });

    it('enterprise tier has all features', () => {
      expect(hasFeature('enterprise', 'sso')).toBe(true);
      expect(hasFeature('enterprise', 'white_label')).toBe(true);
      expect(hasFeature('enterprise', 'sla')).toBe(true);
    });

    it('pro tier has SSO but not white label', () => {
      expect(hasFeature('pro', 'sso')).toBe(true);
      expect(hasFeature('pro', 'white_label')).toBe(false);
    });
  });

  describe('isWithinLimit', () => {
    it('returns true when under limit', () => {
      expect(isWithinLimit('free', 'maxUsers', 2)).toBe(true);
    });

    it('returns false when at limit', () => {
      expect(isWithinLimit('free', 'maxUsers', 3)).toBe(false);
    });

    it('returns false when over limit', () => {
      expect(isWithinLimit('free', 'maxUsers', 10)).toBe(false);
    });

    it('returns true for unlimited (-1)', () => {
      expect(isWithinLimit('enterprise', 'maxUsers', 999999)).toBe(true);
    });
  });
});

// ── Role Definitions ───────────────────────────────────────────────────

describe('Role Definitions', () => {
  describe('getRoleDefinition', () => {
    it('returns correct role definitions', () => {
      const owner = getRoleDefinition('owner');
      expect(owner.name).toBe('Owner');
      expect(owner.assignable).toBe(false);
      expect(owner.priority).toBe(100);

      const guest = getRoleDefinition('guest');
      expect(guest.name).toBe('Guest');
      expect(guest.assignable).toBe(true);
      expect(guest.priority).toBe(20);
    });
  });

  describe('getRolePriority', () => {
    it('owner has highest priority', () => {
      expect(getRolePriority('owner')).toBe(100);
    });

    it('guest has lowest priority', () => {
      expect(getRolePriority('guest')).toBe(20);
    });

    it('priorities are strictly ordered', () => {
      expect(getRolePriority('owner')).toBeGreaterThan(getRolePriority('admin'));
      expect(getRolePriority('admin')).toBeGreaterThan(getRolePriority('editor'));
      expect(getRolePriority('editor')).toBeGreaterThan(getRolePriority('viewer'));
      expect(getRolePriority('viewer')).toBeGreaterThan(getRolePriority('guest'));
    });
  });

  describe('isRoleAtLeast', () => {
    it('owner >= all roles', () => {
      expect(isRoleAtLeast('owner', 'owner')).toBe(true);
      expect(isRoleAtLeast('owner', 'admin')).toBe(true);
      expect(isRoleAtLeast('owner', 'guest')).toBe(true);
    });

    it('guest < all other roles', () => {
      expect(isRoleAtLeast('guest', 'viewer')).toBe(false);
      expect(isRoleAtLeast('guest', 'editor')).toBe(false);
      expect(isRoleAtLeast('guest', 'admin')).toBe(false);
    });

    it('same role returns true', () => {
      expect(isRoleAtLeast('editor', 'editor')).toBe(true);
    });
  });

  describe('role permissions coverage', () => {
    it('owner has all actions on all resources', () => {
      const owner = getRoleDefinition('owner');
      const allResources = ['tenant', 'user', 'module', 'workflow', 'file', 'api_key', 'billing', 'settings', 'analytics', 'integration'];
      for (const resource of allResources) {
        const perm = owner.permissions.find((p) => p.resource === resource);
        expect(perm, `owner should have permission for ${resource}`).toBeTruthy();
        expect(perm!.actions).toContain('read');
        expect(perm!.actions).toContain('create');
        expect(perm!.actions).toContain('delete');
      }
    });

    it('viewer has read-only access', () => {
      const viewer = getRoleDefinition('viewer');
      for (const perm of viewer.permissions) {
        for (const action of perm.actions) {
          expect(['read', 'list']).toContain(action);
        }
      }
    });

    it('guest has very limited access', () => {
      const guest = getRoleDefinition('guest');
      expect(guest.permissions.length).toBeLessThanOrEqual(3);
      const resources = guest.permissions.map((p) => p.resource);
      expect(resources).toContain('module');
    });
  });
});

// ── Condition Evaluator ────────────────────────────────────────────────

describe('evaluateCondition', () => {
  const ctx = makeContext({ userId: 'user-1', role: 'editor', planTier: 'pro' });

  it('eq operator', () => {
    expect(evaluateCondition({ field: 'role', operator: 'eq', value: 'editor' }, ctx)).toBe(true);
    expect(evaluateCondition({ field: 'role', operator: 'eq', value: 'admin' }, ctx)).toBe(false);
  });

  it('neq operator', () => {
    expect(evaluateCondition({ field: 'role', operator: 'neq', value: 'admin' }, ctx)).toBe(true);
    expect(evaluateCondition({ field: 'role', operator: 'neq', value: 'editor' }, ctx)).toBe(false);
  });

  it('in operator', () => {
    expect(evaluateCondition({ field: 'role', operator: 'in', value: ['editor', 'admin'] }, ctx)).toBe(true);
    expect(evaluateCondition({ field: 'role', operator: 'in', value: ['admin', 'owner'] }, ctx)).toBe(false);
  });

  it('nin operator', () => {
    expect(evaluateCondition({ field: 'role', operator: 'nin', value: ['admin', 'owner'] }, ctx)).toBe(true);
    expect(evaluateCondition({ field: 'role', operator: 'nin', value: ['editor', 'admin'] }, ctx)).toBe(false);
  });

  it('gt/lt/gte/lte operators with metadata', () => {
    const numCtx = makeContext({ metadata: { count: 10 } });
    expect(evaluateCondition({ field: 'metadata.count', operator: 'gt', value: 5 }, numCtx)).toBe(true);
    expect(evaluateCondition({ field: 'metadata.count', operator: 'gt', value: 10 }, numCtx)).toBe(false);
    expect(evaluateCondition({ field: 'metadata.count', operator: 'gte', value: 10 }, numCtx)).toBe(true);
    expect(evaluateCondition({ field: 'metadata.count', operator: 'lt', value: 20 }, numCtx)).toBe(true);
    expect(evaluateCondition({ field: 'metadata.count', operator: 'lte', value: 10 }, numCtx)).toBe(true);
  });

  it('exists operator', () => {
    const ctxWithOwner = makeContext({ resourceOwnerId: 'owner-1' });
    expect(evaluateCondition({ field: 'resourceOwnerId', operator: 'exists', value: true }, ctxWithOwner)).toBe(true);
    expect(evaluateCondition({ field: 'resourceOwnerId', operator: 'exists', value: false }, ctxWithOwner)).toBe(false);
  });

  it('metadata field resolution', () => {
    const metaCtx = makeContext({ metadata: { region: 'us-east' } });
    expect(evaluateCondition({ field: 'metadata.region', operator: 'eq', value: 'us-east' }, metaCtx)).toBe(true);
  });

  it('unknown field returns undefined for comparisons', () => {
    expect(evaluateCondition({ field: 'unknown', operator: 'eq', value: 'test' }, ctx)).toBe(false);
  });

  it('unknown operator returns false', () => {
    expect(evaluateCondition({ field: 'role', operator: 'invalid' as any, value: 'test' }, ctx)).toBe(false);
  });
});

// ── PermissionEngine ───────────────────────────────────────────────────

describe('PermissionEngine', () => {
  let engine: PermissionEngine;

  beforeEach(() => {
    engine = new PermissionEngine();
  });

  describe('basic role evaluation', () => {
    it('owner can do anything', () => {
      const ctx = makeContext({ role: 'owner' });
      expect(engine.evaluate('tenant', 'manage', ctx).allowed).toBe(true);
      expect(engine.evaluate('billing', 'delete', ctx).allowed).toBe(true);
      expect(engine.evaluate('settings', 'configure', ctx).allowed).toBe(true);
    });

    it('admin can manage users but not billing', () => {
      const ctx = makeContext({ role: 'admin' });
      expect(engine.evaluate('user', 'create', ctx).allowed).toBe(true);
      expect(engine.evaluate('user', 'delete', ctx).allowed).toBe(true);
      expect(engine.evaluate('billing', 'delete', ctx).allowed).toBe(false);
      expect(engine.evaluate('billing', 'read', ctx).allowed).toBe(true);
    });

    it('editor can CRUD modules but not manage users', () => {
      const ctx = makeContext({ role: 'editor' });
      expect(engine.evaluate('module', 'create', ctx).allowed).toBe(true);
      expect(engine.evaluate('module', 'update', ctx).allowed).toBe(true);
      expect(engine.evaluate('module', 'delete', ctx).allowed).toBe(true);
      expect(engine.evaluate('user', 'create', ctx).allowed).toBe(false);
      expect(engine.evaluate('user', 'delete', ctx).allowed).toBe(false);
    });

    it('viewer can only read', () => {
      const ctx = makeContext({ role: 'viewer' });
      expect(engine.evaluate('module', 'read', ctx).allowed).toBe(true);
      expect(engine.evaluate('module', 'list', ctx).allowed).toBe(true);
      expect(engine.evaluate('module', 'create', ctx).allowed).toBe(false);
      expect(engine.evaluate('module', 'delete', ctx).allowed).toBe(false);
    });

    it('guest has very limited access', () => {
      const ctx = makeContext({ role: 'guest' });
      expect(engine.evaluate('module', 'read', ctx).allowed).toBe(true);
      expect(engine.evaluate('module', 'list', ctx).allowed).toBe(true);
      expect(engine.evaluate('module', 'create', ctx).allowed).toBe(false);
      expect(engine.evaluate('user', 'read', ctx).allowed).toBe(false);
      expect(engine.evaluate('billing', 'read', ctx).allowed).toBe(false);
    });
  });

  describe('resolvedBy tracking', () => {
    it('reports role-based resolution', () => {
      const result = engine.evaluate('module', 'read', makeContext({ role: 'editor' }));
      expect(result.resolvedBy).toBe('role');
    });

    it('reports default denial', () => {
      const result = engine.evaluate('billing', 'delete', makeContext({ role: 'guest' }));
      expect(result.resolvedBy).toBe('default');
      expect(result.reason).toContain('guest');
    });
  });

  describe('deny rules', () => {
    it('deny rule overrides role permission', () => {
      engine.addDenyRule('module', 'delete');
      const ctx = makeContext({ role: 'owner' });

      const result = engine.evaluate('module', 'delete', ctx);
      expect(result.allowed).toBe(false);
      expect(result.resolvedBy).toBe('override');
    });

    it('conditional deny rule only applies when condition matches', () => {
      engine.addDenyRule('file', 'delete', { field: 'role', operator: 'eq', value: 'editor' });

      const editorCtx = makeContext({ role: 'editor' });
      const adminCtx = makeContext({ role: 'admin' });

      expect(engine.evaluate('file', 'delete', editorCtx).allowed).toBe(false);
      expect(engine.evaluate('file', 'delete', adminCtx).allowed).toBe(true);
    });
  });

  describe('role overrides', () => {
    it('adds custom permissions to a role', () => {
      engine.addRoleOverride('viewer', [
        { resource: 'analytics', actions: ['export'] },
      ]);

      const ctx = makeContext({ role: 'viewer' });

      // Base viewer cannot export
      const baseEngine = new PermissionEngine();
      expect(baseEngine.evaluate('analytics', 'export', ctx).allowed).toBe(false);

      // With override, viewer can export
      expect(engine.evaluate('analytics', 'export', ctx).allowed).toBe(true);
      expect(engine.evaluate('analytics', 'export', ctx).resolvedBy).toBe('override');
    });

    it('override with conditions', () => {
      engine.addRoleOverride('viewer', [
        {
          resource: 'file',
          actions: ['delete'],
          conditions: [{ field: 'resourceOwnerId', operator: 'eq', value: 'user-1' }],
        },
      ]);

      // user-1 matches condition via resourceOwnerId field
      const ownerCtx = makeContext({ role: 'viewer', userId: 'user-1', resourceOwnerId: 'user-1' });
      expect(engine.evaluate('file', 'delete', ownerCtx).allowed).toBe(true);

      // Different resourceOwnerId — condition not met
      const otherCtx = makeContext({ role: 'viewer', userId: 'user-1', resourceOwnerId: 'user-2' });
      expect(engine.evaluate('file', 'delete', otherCtx).allowed).toBe(false);
    });
  });

  describe('reset', () => {
    it('clears overrides and deny rules', () => {
      engine.addDenyRule('module', 'delete');
      engine.addRoleOverride('guest', [{ resource: 'billing', actions: ['read'] }]);

      engine.reset();

      const ownerCtx = makeContext({ role: 'owner' });
      expect(engine.evaluate('module', 'delete', ownerCtx).allowed).toBe(true);

      const guestCtx = makeContext({ role: 'guest' });
      expect(engine.evaluate('billing', 'read', guestCtx).allowed).toBe(false);
    });
  });

  describe('evaluateMany', () => {
    it('evaluates multiple checks at once', () => {
      const ctx = makeContext({ role: 'editor' });
      const results = engine.evaluateMany([
        { resource: 'module', action: 'create' },
        { resource: 'module', action: 'read' },
        { resource: 'billing', action: 'delete' },
        { resource: 'user', action: 'delete' },
      ], ctx);

      expect(results.length).toBe(4);
      expect(results[0].allowed).toBe(true);
      expect(results[1].allowed).toBe(true);
      expect(results[2].allowed).toBe(false);
      expect(results[3].allowed).toBe(false);
    });
  });

  describe('getAllowedActions', () => {
    it('returns all allowed actions for owner', () => {
      const ctx = makeContext({ role: 'owner' });
      const actions = engine.getAllowedActions('tenant', ctx);
      expect(actions).toContain('create');
      expect(actions).toContain('read');
      expect(actions).toContain('update');
      expect(actions).toContain('delete');
      expect(actions).toContain('manage');
    });

    it('returns limited actions for viewer', () => {
      const ctx = makeContext({ role: 'viewer' });
      const actions = engine.getAllowedActions('module', ctx);
      expect(actions).toContain('read');
      expect(actions).toContain('list');
      expect(actions).not.toContain('create');
      expect(actions).not.toContain('delete');
    });

    it('returns empty for guest on billing', () => {
      const ctx = makeContext({ role: 'guest' });
      const actions = engine.getAllowedActions('billing', ctx);
      expect(actions).toEqual([]);
    });
  });

  describe('hasAnyAccess', () => {
    it('returns true when at least one action allowed', () => {
      expect(engine.hasAnyAccess('module', makeContext({ role: 'guest' }))).toBe(true);
    });

    it('returns false when no actions allowed', () => {
      expect(engine.hasAnyAccess('billing', makeContext({ role: 'guest' }))).toBe(false);
    });
  });
});

// ── Convenience Functions ──────────────────────────────────────────────

describe('checkPermission', () => {
  it('performs a quick permission check', () => {
    const result = checkPermission('module', 'read', makeContext({ role: 'viewer' }));
    expect(result.allowed).toBe(true);
  });

  it('denies unauthorized access', () => {
    const result = checkPermission('billing', 'delete', makeContext({ role: 'editor' }));
    expect(result.allowed).toBe(false);
  });
});

describe('isResourceOwner', () => {
  it('returns true when userId matches resourceOwnerId', () => {
    expect(isResourceOwner(makeContext({ userId: 'u1', resourceOwnerId: 'u1' }))).toBe(true);
  });

  it('returns false when IDs do not match', () => {
    expect(isResourceOwner(makeContext({ userId: 'u1', resourceOwnerId: 'u2' }))).toBe(false);
  });

  it('returns false when no resourceOwnerId', () => {
    expect(isResourceOwner(makeContext({ userId: 'u1' }))).toBe(false);
  });
});

describe('createProductionEngine', () => {
  it('creates engine with guest deny rules', () => {
    const engine = createProductionEngine();
    const guestCtx = makeContext({ role: 'guest' });

    // Guest cannot delete modules (deny rule)
    expect(engine.evaluate('module', 'delete', guestCtx).allowed).toBe(false);
    expect(engine.evaluate('module', 'delete', guestCtx).resolvedBy).toBe('override');

    // Guest can still read modules
    expect(engine.evaluate('module', 'read', guestCtx).allowed).toBe(true);
  });
});

describe('getAvailableRoles', () => {
  it('all roles available on free tier', () => {
    const roles = getAvailableRoles('free');
    expect(roles).toContain('owner');
    expect(roles).toContain('admin');
    expect(roles).toContain('editor');
    expect(roles).toContain('viewer');
    expect(roles).toContain('guest');
  });

  it('returns all 5 roles for enterprise', () => {
    const roles = getAvailableRoles('enterprise');
    expect(roles.length).toBe(5);
  });
});
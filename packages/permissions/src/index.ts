/**
 * @trancendos/permissions — RBAC Permission Engine
 * =================================================
 * Role-based access control with plan-tier gating, resource-level
 * permissions, and tenant-scoped policy evaluation for the
 * Trancendos multi-tenant platform.
 */

// ── Types ──────────────────────────────────────────────────────────────

export type PlanTier = 'free' | 'starter' | 'pro' | 'enterprise';

export type Role = 'owner' | 'admin' | 'editor' | 'viewer' | 'guest';

export type Action =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'list'
  | 'manage'
  | 'execute'
  | 'export'
  | 'invite'
  | 'configure';

export type ResourceType =
  | 'tenant'
  | 'user'
  | 'module'
  | 'workflow'
  | 'file'
  | 'api_key'
  | 'billing'
  | 'settings'
  | 'analytics'
  | 'integration';

export interface Permission {
  /** Resource type this permission applies to */
  resource: ResourceType;
  /** Allowed actions on the resource */
  actions: Action[];
  /** Optional conditions for fine-grained control */
  conditions?: PermissionCondition[];
}

export interface PermissionCondition {
  /** Field to evaluate */
  field: string;
  /** Comparison operator */
  operator: 'eq' | 'neq' | 'in' | 'nin' | 'gt' | 'lt' | 'gte' | 'lte' | 'exists';
  /** Value to compare against */
  value: unknown;
}

export interface RoleDefinition {
  /** Role identifier */
  role: Role;
  /** Human-readable name */
  name: string;
  /** Description */
  description: string;
  /** Permissions granted to this role */
  permissions: Permission[];
  /** Whether this role can be assigned to others */
  assignable: boolean;
  /** Minimum plan tier required */
  minPlanTier: PlanTier;
  /** Priority for conflict resolution (higher = more powerful) */
  priority: number;
}

export interface PlanLimits {
  maxUsers: number;
  maxModules: number;
  maxWorkflows: number;
  maxStorage: number; // MB
  maxApiKeys: number;
  maxIntegrations: number;
  features: string[];
}

export interface PolicyContext {
  /** User's role */
  role: Role;
  /** Tenant's plan tier */
  planTier: PlanTier;
  /** User ID performing the action */
  userId: string;
  /** Tenant ID */
  tenantId: string;
  /** Resource owner ID (if applicable) */
  resourceOwnerId?: string;
  /** Additional metadata for condition evaluation */
  metadata?: Record<string, unknown>;
}

export interface PolicyResult {
  /** Whether the action is allowed */
  allowed: boolean;
  /** Reason for denial (if denied) */
  reason?: string;
  /** Which check denied/allowed */
  resolvedBy: 'role' | 'plan' | 'condition' | 'override' | 'default';
}

// ── Plan Tier Hierarchy ────────────────────────────────────────────────

export const PLAN_TIER_LEVELS: Record<PlanTier, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  enterprise: 3,
};

export function isPlanAtLeast(current: PlanTier, required: PlanTier): boolean {
  return PLAN_TIER_LEVELS[current] >= PLAN_TIER_LEVELS[required];
}

export function comparePlanTiers(a: PlanTier, b: PlanTier): number {
  return PLAN_TIER_LEVELS[a] - PLAN_TIER_LEVELS[b];
}

// ── Plan Limits ────────────────────────────────────────────────────────

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    maxUsers: 3,
    maxModules: 5,
    maxWorkflows: 10,
    maxStorage: 100,
    maxApiKeys: 2,
    maxIntegrations: 1,
    features: ['basic_analytics', 'community_support'],
  },
  starter: {
    maxUsers: 10,
    maxModules: 20,
    maxWorkflows: 50,
    maxStorage: 1_000,
    maxApiKeys: 10,
    maxIntegrations: 5,
    features: ['basic_analytics', 'advanced_analytics', 'email_support', 'custom_domain'],
  },
  pro: {
    maxUsers: 50,
    maxModules: 100,
    maxWorkflows: 500,
    maxStorage: 10_000,
    maxApiKeys: 50,
    maxIntegrations: 25,
    features: [
      'basic_analytics', 'advanced_analytics', 'custom_analytics',
      'priority_support', 'custom_domain', 'sso', 'audit_log', 'api_access',
    ],
  },
  enterprise: {
    maxUsers: -1, // unlimited
    maxModules: -1,
    maxWorkflows: -1,
    maxStorage: -1,
    maxApiKeys: -1,
    maxIntegrations: -1,
    features: [
      'basic_analytics', 'advanced_analytics', 'custom_analytics',
      'priority_support', 'custom_domain', 'sso', 'audit_log', 'api_access',
      'dedicated_support', 'sla', 'custom_integrations', 'white_label',
    ],
  },
};

export function getPlanLimits(tier: PlanTier): PlanLimits {
  return PLAN_LIMITS[tier];
}

export function hasFeature(tier: PlanTier, feature: string): boolean {
  return PLAN_LIMITS[tier].features.includes(feature);
}

export function isWithinLimit(tier: PlanTier, limitKey: keyof Omit<PlanLimits, 'features'>, currentUsage: number): boolean {
  const limit = PLAN_LIMITS[tier][limitKey];
  if (limit === -1) return true; // unlimited
  return currentUsage < limit;
}

// ── Role Definitions ───────────────────────────────────────────────────

const ALL_ACTIONS: Action[] = ['create', 'read', 'update', 'delete', 'list', 'manage', 'execute', 'export', 'invite', 'configure'];
const CRUD_ACTIONS: Action[] = ['create', 'read', 'update', 'delete', 'list'];
const READ_ACTIONS: Action[] = ['read', 'list'];

const ALL_RESOURCES: ResourceType[] = [
  'tenant', 'user', 'module', 'workflow', 'file', 'api_key', 'billing', 'settings', 'analytics', 'integration',
];

function allPermissions(resources: ResourceType[], actions: Action[]): Permission[] {
  return resources.map((resource) => ({ resource, actions: [...actions] }));
}

export const ROLE_DEFINITIONS: Record<Role, RoleDefinition> = {
  owner: {
    role: 'owner',
    name: 'Owner',
    description: 'Full access to all resources. Can manage billing and transfer ownership.',
    permissions: allPermissions(ALL_RESOURCES, ALL_ACTIONS),
    assignable: false,
    minPlanTier: 'free',
    priority: 100,
  },
  admin: {
    role: 'admin',
    name: 'Administrator',
    description: 'Full access to most resources. Cannot manage billing or transfer ownership.',
    permissions: [
      ...allPermissions(
        ['user', 'module', 'workflow', 'file', 'api_key', 'settings', 'analytics', 'integration'],
        ALL_ACTIONS,
      ),
      { resource: 'tenant', actions: ['read', 'update', 'list'] },
      { resource: 'billing', actions: ['read', 'list'] },
    ],
    assignable: true,
    minPlanTier: 'free',
    priority: 80,
  },
  editor: {
    role: 'editor',
    name: 'Editor',
    description: 'Can create and edit content. Cannot manage users or settings.',
    permissions: [
      ...allPermissions(['module', 'workflow', 'file', 'integration'], CRUD_ACTIONS),
      { resource: 'analytics', actions: ['read', 'list', 'export'] },
      { resource: 'tenant', actions: ['read'] },
      { resource: 'user', actions: ['read', 'list'] },
      { resource: 'api_key', actions: ['read', 'list'] },
    ],
    assignable: true,
    minPlanTier: 'free',
    priority: 60,
  },
  viewer: {
    role: 'viewer',
    name: 'Viewer',
    description: 'Read-only access to most resources.',
    permissions: [
      ...allPermissions(
        ['tenant', 'user', 'module', 'workflow', 'file', 'analytics', 'integration'],
        READ_ACTIONS,
      ),
    ],
    assignable: true,
    minPlanTier: 'free',
    priority: 40,
  },
  guest: {
    role: 'guest',
    name: 'Guest',
    description: 'Very limited read access. Can only view public resources.',
    permissions: [
      { resource: 'module', actions: ['read', 'list'] },
      { resource: 'workflow', actions: ['read'] },
    ],
    assignable: true,
    minPlanTier: 'free',
    priority: 20,
  },
};

export function getRoleDefinition(role: Role): RoleDefinition {
  return ROLE_DEFINITIONS[role];
}

export function getRolePriority(role: Role): number {
  return ROLE_DEFINITIONS[role].priority;
}

export function isRoleAtLeast(current: Role, required: Role): boolean {
  return ROLE_DEFINITIONS[current].priority >= ROLE_DEFINITIONS[required].priority;
}

// ── Condition Evaluator ────────────────────────────────────────────────

export function evaluateCondition(condition: PermissionCondition, context: PolicyContext): boolean {
  const { field, operator, value } = condition;

  // Resolve field value from context
  let fieldValue: unknown;
  if (field === 'userId') fieldValue = context.userId;
  else if (field === 'tenantId') fieldValue = context.tenantId;
  else if (field === 'role') fieldValue = context.role;
  else if (field === 'planTier') fieldValue = context.planTier;
  else if (field === 'resourceOwnerId') fieldValue = context.resourceOwnerId;
  else if (field.startsWith('metadata.') && context.metadata) {
    fieldValue = context.metadata[field.slice(9)];
  } else {
    fieldValue = undefined;
  }

  switch (operator) {
    case 'eq':
      return fieldValue === value;
    case 'neq':
      return fieldValue !== value;
    case 'in':
      return Array.isArray(value) && value.includes(fieldValue);
    case 'nin':
      return Array.isArray(value) && !value.includes(fieldValue);
    case 'gt':
      return typeof fieldValue === 'number' && typeof value === 'number' && fieldValue > value;
    case 'lt':
      return typeof fieldValue === 'number' && typeof value === 'number' && fieldValue < value;
    case 'gte':
      return typeof fieldValue === 'number' && typeof value === 'number' && fieldValue >= value;
    case 'lte':
      return typeof fieldValue === 'number' && typeof value === 'number' && fieldValue <= value;
    case 'exists':
      return value ? fieldValue !== undefined : fieldValue === undefined;
    default:
      return false;
  }
}

// ── Policy Engine ──────────────────────────────────────────────────────

export class PermissionEngine {
  private roleOverrides: Map<string, Permission[]> = new Map();
  private denyRules: Array<{ resource: ResourceType; action: Action; condition?: PermissionCondition }> = [];

  /**
   * Add custom permissions for a specific role (e.g., tenant-level customization).
   */
  addRoleOverride(role: Role, permissions: Permission[]): void {
    const key = role;
    const existing = this.roleOverrides.get(key) || [];
    this.roleOverrides.set(key, [...existing, ...permissions]);
  }

  /**
   * Add a deny rule that takes precedence over allow rules.
   */
  addDenyRule(resource: ResourceType, action: Action, condition?: PermissionCondition): void {
    this.denyRules.push({ resource, action, condition });
  }

  /**
   * Clear all overrides and deny rules.
   */
  reset(): void {
    this.roleOverrides.clear();
    this.denyRules.length = 0;
  }

  /**
   * Evaluate whether an action is allowed for a given context.
   */
  evaluate(
    resource: ResourceType,
    action: Action,
    context: PolicyContext,
  ): PolicyResult {
    // 1. Check deny rules first (explicit deny always wins)
    for (const rule of this.denyRules) {
      if (rule.resource === resource && rule.action === action) {
        if (!rule.condition || evaluateCondition(rule.condition, context)) {
          return { allowed: false, reason: `Explicitly denied by deny rule`, resolvedBy: 'override' };
        }
      }
    }

    // 2. Check plan tier — role must be available on plan
    const roleDef = ROLE_DEFINITIONS[context.role];
    if (!isPlanAtLeast(context.planTier, roleDef.minPlanTier)) {
      return {
        allowed: false,
        reason: `Role "${context.role}" requires plan "${roleDef.minPlanTier}" or higher`,
        resolvedBy: 'plan',
      };
    }

    // 3. Check role overrides first (custom permissions)
    const overrides = this.roleOverrides.get(context.role);
    if (overrides) {
      for (const perm of overrides) {
        if (perm.resource === resource && perm.actions.includes(action)) {
          // Evaluate conditions if present
          if (perm.conditions && perm.conditions.length > 0) {
            const allConditionsMet = perm.conditions.every((c) => evaluateCondition(c, context));
            if (allConditionsMet) {
              return { allowed: true, resolvedBy: 'override' };
            }
          } else {
            return { allowed: true, resolvedBy: 'override' };
          }
        }
      }
    }

    // 4. Check base role permissions
    for (const perm of roleDef.permissions) {
      if (perm.resource === resource && perm.actions.includes(action)) {
        // Evaluate conditions if present
        if (perm.conditions && perm.conditions.length > 0) {
          const allConditionsMet = perm.conditions.every((c) => evaluateCondition(c, context));
          if (allConditionsMet) {
            return { allowed: true, resolvedBy: 'condition' };
          }
          // Conditions not met — continue checking other permissions
          continue;
        }
        return { allowed: true, resolvedBy: 'role' };
      }
    }

    // 5. Default deny
    return {
      allowed: false,
      reason: `Role "${context.role}" does not have "${action}" permission on "${resource}"`,
      resolvedBy: 'default',
    };
  }

  /**
   * Batch evaluate multiple actions.
   */
  evaluateMany(
    checks: Array<{ resource: ResourceType; action: Action }>,
    context: PolicyContext,
  ): PolicyResult[] {
    return checks.map(({ resource, action }) => this.evaluate(resource, action, context));
  }

  /**
   * Get all allowed actions for a given resource and context.
   */
  getAllowedActions(resource: ResourceType, context: PolicyContext): Action[] {
    const allActions: Action[] = ['create', 'read', 'update', 'delete', 'list', 'manage', 'execute', 'export', 'invite', 'configure'];
    return allActions.filter((action) => this.evaluate(resource, action, context).allowed);
  }

  /**
   * Check if a user can access any action on a resource.
   */
  hasAnyAccess(resource: ResourceType, context: PolicyContext): boolean {
    return this.getAllowedActions(resource, context).length > 0;
  }
}

// ── Convenience Functions ──────────────────────────────────────────────

/**
 * Quick permission check without instantiating an engine.
 */
export function checkPermission(
  resource: ResourceType,
  action: Action,
  context: PolicyContext,
): PolicyResult {
  const engine = new PermissionEngine();
  return engine.evaluate(resource, action, context);
}

/**
 * Check if a user is the resource owner.
 */
export function isResourceOwner(context: PolicyContext): boolean {
  return !!context.resourceOwnerId && context.userId === context.resourceOwnerId;
}

/**
 * Create a permission engine with standard deny rules for production.
 */
export function createProductionEngine(): PermissionEngine {
  const engine = new PermissionEngine();

  // Guests cannot delete anything
  engine.addDenyRule('module', 'delete', { field: 'role', operator: 'eq', value: 'guest' });
  engine.addDenyRule('workflow', 'delete', { field: 'role', operator: 'eq', value: 'guest' });
  engine.addDenyRule('file', 'delete', { field: 'role', operator: 'eq', value: 'guest' });

  return engine;
}

/**
 * Get available roles for a plan tier.
 */
export function getAvailableRoles(planTier: PlanTier): Role[] {
  return (Object.values(ROLE_DEFINITIONS) as RoleDefinition[])
    .filter((def) => isPlanAtLeast(planTier, def.minPlanTier))
    .map((def) => def.role);
}
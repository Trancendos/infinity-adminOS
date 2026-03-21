/**
 * @module registry/types
 * Module Registry — Type Definitions
 * Central registry for the Trancendos plug-and-play ecosystem
 */

// ── Environment Bindings ────────────────────────────────────

export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  MODULE_STORE: R2Bucket;
  TENANT_DO: DurableObjectNamespace;
  EVENTS_QUEUE: Queue<PlatformEvent>;
  JWT_SECRET: string;
  ENVIRONMENT: string;
}

// ── Module Types ────────────────────────────────────────────

export type ModuleType = 'worker' | 'package' | 'app' | 'adapter' | 'plugin' | 'theme' | 'integration';
export type ModuleCategory = 'core' | 'ai' | 'finance' | 'security' | 'analytics' | 'communication' | 'storage' | 'utility' | 'ui' | 'integration';
export type ModuleStatus = 'draft' | 'review' | 'published' | 'deprecated' | 'archived';
export type ModuleVisibility = 'public' | 'private' | 'unlisted' | 'internal';
export type VersionStatus = 'draft' | 'testing' | 'published' | 'yanked';
export type DeployStatus = 'pending' | 'deploying' | 'active' | 'failed' | 'suspended' | 'uninstalling';

export interface Module {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  type: ModuleType;
  category: ModuleCategory;
  author_id: string | null;
  author_name: string | null;
  repository_url: string | null;
  icon_url: string | null;
  capabilities: string[];
  required_bindings: string[];
  required_plan: string;
  status: ModuleStatus;
  visibility: ModuleVisibility;
  install_count: number;
  rating_sum: number;
  rating_count: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface ModuleVersion {
  id: string;
  module_id: string;
  version: string;
  changelog: string | null;
  entry_point: string;
  worker_script: string | null;
  bundle_url: string | null;
  bundle_hash: string | null;
  bundle_size: number;
  min_platform_version: string;
  compatibility_flags: string[];
  wrangler_overrides: Record<string, unknown>;
  status: VersionStatus;
  created_at: string;
  published_at: string | null;
}

export interface TenantModule {
  id: string;
  tenant_id: string;
  module_id: string;
  version_id: string;
  config: Record<string, unknown>;
  enabled: boolean;
  deploy_status: DeployStatus;
  worker_name: string | null;
  last_deployed_at: string | null;
  last_error: string | null;
  installed_by: string;
  installed_at: string;
  updated_at: string;
}

// ── API Request/Response Types ──────────────────────────────

export interface CreateModuleRequest {
  name: string;
  display_name: string;
  description?: string;
  type: ModuleType;
  category?: ModuleCategory;
  capabilities?: string[];
  required_bindings?: string[];
  required_plan?: string;
  visibility?: ModuleVisibility;
  repository_url?: string;
  icon_url?: string;
}

export interface PublishVersionRequest {
  version: string;
  changelog?: string;
  entry_point: string;
  compatibility_flags?: string[];
  wrangler_overrides?: Record<string, unknown>;
  min_platform_version?: string;
}

export interface InstallModuleRequest {
  module_id: string;
  version?: string;       // Defaults to latest published
  config?: Record<string, unknown>;
}

export interface UpdateModuleConfigRequest {
  config?: Record<string, unknown>;
  enabled?: boolean;
}

export interface SearchModulesQuery {
  q?: string;
  type?: ModuleType;
  category?: ModuleCategory;
  plan?: string;
  page?: number;
  limit?: number;
}

// ── Dependency Resolution ───────────────────────────────────

export interface DependencyNode {
  module_name: string;
  version: string;
  version_id: string;
  dependencies: DependencyNode[];
}

export interface ResolutionResult {
  resolved: DependencyNode[];
  missing: string[];
  conflicts: Array<{
    module: string;
    requested: string[];
  }>;
}

// ── Events ──────────────────────────────────────────────────

export interface PlatformEvent {
  id: string;
  tenant_id: string;
  event_type: string;
  source: string;
  subject?: string;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  version: string;
  created_at: string;
}

// ── API Helpers ─────────────────────────────────────────────

export enum RegistryError {
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  INVALID_INPUT = 'INVALID_INPUT',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  DEPENDENCY_ERROR = 'DEPENDENCY_ERROR',
  PLAN_REQUIRED = 'PLAN_REQUIRED',
  VERSION_CONFLICT = 'VERSION_CONFLICT',
  DEPLOY_FAILED = 'DEPLOY_FAILED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export function errorResponse(
  error: RegistryError,
  message: string,
  status: number = 400,
): Response {
  return new Response(
    JSON.stringify({ error, message, timestamp: new Date().toISOString() }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

export function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
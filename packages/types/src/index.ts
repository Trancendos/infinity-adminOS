/**
 * @package @infinity-os/types
 * Shared TypeScript types for the entire Infinity OS platform
 * 2060 Modular Standard — composable, replaceable, portable
 */

// ============================================================
// CORE IDENTITY & AUTH TYPES
// ============================================================

export type UserRole = 'super_admin' | 'org_admin' | 'power_user' | 'user';

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: UserRole;
  organisationId: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  mfaEnabled: boolean;
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'high-contrast' | 'system';
  language: string;
  timezone: string;
  desktopBackground?: string;
  widgetLayout?: WidgetLayout[];
  keyboardShortcuts?: Record<string, string>;
  notificationSettings?: NotificationSettings;
  aiEnabled: boolean;
  analyticsEnabled: boolean;
}

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  plan: 'free' | 'pro' | 'enterprise';
  settings: OrganisationSettings;
  createdAt: string;
  updatedAt: string;
}

export interface OrganisationSettings {
  allowedModules?: string[];
  blockedModules?: string[];
  mfaRequired: boolean;
  sessionTimeoutMinutes: number;
  dataResidency: 'global' | 'eu' | 'us';
  customBranding?: {
    primaryColor?: string;
    logoUrl?: string;
    faviconUrl?: string;
  };
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: User;
}

// ============================================================
// FILE SYSTEM TYPES
// ============================================================

export type FilePermission = 'read' | 'write' | 'execute';
export type FileType = 'file' | 'directory' | 'symlink';

export interface FileSystemNode {
  id: string;
  name: string;
  path: string;
  type: FileType;
  mimeType?: string;
  size: number;
  ownerId: string;
  organisationId: string;
  permissions: FilePermissions;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  version: number;
  parentId?: string;
  metadata?: Record<string, unknown>;
}

export interface FilePermissions {
  owner: FilePermission[];
  group: FilePermission[];
  world: FilePermission[];
  acl?: ACLEntry[];
}

export interface ACLEntry {
  principalId: string;
  principalType: 'user' | 'group' | 'role';
  permissions: FilePermission[];
}

export interface FileVersion {
  id: string;
  fileId: string;
  version: number;
  size: number;
  storageKey: string;
  createdAt: string;
  createdBy: string;
  changeDescription?: string;
}

// ============================================================
// MODULE / APPLICATION TYPES
// ============================================================

export type ModuleCategory =
  | 'productivity'
  | 'development'
  | 'communication'
  | 'media'
  | 'utilities'
  | 'security'
  | 'ai'
  | 'finance'
  | 'education'
  | 'games';

export type ModulePermission =
  | 'filesystem:read'
  | 'filesystem:write'
  | 'filesystem:delete'
  | 'network:fetch'
  | 'notifications:send'
  | 'clipboard:read'
  | 'clipboard:write'
  | 'camera:access'
  | 'microphone:access'
  | 'location:access'
  | 'users:read'
  | 'ai:access';

export interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  authorUrl?: string;
  iconUrl: string;
  entryPoint: string;
  category: ModuleCategory;
  permissions: ModulePermission[];
  minKernelVersion: string;
  dependencies?: Record<string, string>;
  keywords?: string[];
  screenshots?: string[];
  changelog?: string;
  privacyPolicyUrl?: string;
  supportUrl?: string;
  isBuiltIn?: boolean;
  isSandboxed?: boolean;
}

export interface InstalledModule {
  id: string;
  manifestId: string;
  manifest: ModuleManifest;
  installedAt: string;
  installedBy: string;
  organisationId: string;
  userId?: string;
  grantedPermissions: ModulePermission[];
  isEnabled: boolean;
  settings?: Record<string, unknown>;
}

export interface AppStoreListing {
  id: string;
  manifest: ModuleManifest;
  publishedAt: string;
  updatedAt: string;
  downloads: number;
  rating: number;
  reviewCount: number;
  isFeatured: boolean;
  isVerified: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
}

// ============================================================
// KERNEL / IPC TYPES
// ============================================================

export interface KernelProcess {
  pid: string;
  moduleId: string;
  status: 'initialising' | 'running' | 'suspended' | 'terminated';
  startedAt: number;
  memoryUsage?: number;
  cpuUsage?: number;
}

export interface IPCMessage<T = unknown> {
  id: string;
  from: string;
  to: string | 'broadcast';
  type: string;
  payload: T;
  timestamp: number;
  replyTo?: string;
}

export interface KernelEvent {
  type: KernelEventType;
  payload: unknown;
  timestamp: number;
  source: string;
}

export type KernelEventType =
  | 'user:login'
  | 'user:logout'
  | 'module:installed'
  | 'module:uninstalled'
  | 'module:started'
  | 'module:stopped'
  | 'file:created'
  | 'file:updated'
  | 'file:deleted'
  | 'permission:granted'
  | 'permission:revoked'
  | 'notification:received'
  | 'system:alert'
  | 'system:update';

// ============================================================
// NOTIFICATION TYPES
// ============================================================

export type NotificationChannel = 'in-app' | 'push' | 'email';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  iconUrl?: string;
  actionUrl?: string;
  priority: NotificationPriority;
  channels: NotificationChannel[];
  readAt?: string;
  createdAt: string;
  expiresAt?: string;
  sourceModule?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationSettings {
  inApp: boolean;
  push: boolean;
  email: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  allowedModules?: string[];
  blockedModules?: string[];
}

// ============================================================
// UI / SHELL TYPES
// ============================================================

export interface Window {
  id: string;
  moduleId: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isMinimised: boolean;
  isMaximised: boolean;
  isFocused: boolean;
  zIndex: number;
}

export interface WidgetLayout {
  id: string;
  widgetType: string;
  x: number;
  y: number;
  w: number;
  h: number;
  settings?: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  type: 'file' | 'module' | 'user' | 'setting' | 'content';
  title: string;
  description?: string;
  iconUrl?: string;
  path?: string;
  moduleId?: string;
  score: number;
  metadata?: Record<string, unknown>;
}

// ============================================================
// API RESPONSE TYPES
// ============================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
    cursor?: string;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

// ============================================================
// AUDIT & COMPLIANCE TYPES
// ============================================================

export interface AuditLog {
  id: string;
  userId: string;
  organisationId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ConsentRecord {
  id: string;
  userId: string;
  consentType: 'analytics' | 'marketing' | 'ai' | 'data-processing';
  granted: boolean;
  version: string;
  grantedAt: string;
  revokedAt?: string;
  ipAddress?: string;
}

// ============================================================
// INTEGRATION TYPES
// ============================================================

export type IntegrationCategory = 'communication' | 'project-management' | 'devops' | 'monitoring' | 'cloud' | 'database' | 'ai';
export type IntegrationStatus = 'connected' | 'disconnected' | 'error' | 'rate-limited';

export interface IntegrationManifest {
  id: string;
  name: string;
  icon: string;
  category: IntegrationCategory;
  description: string;
  authType: 'oauth2' | 'api-key' | 'webhook' | 'basic';
  scopes: string[];
  version: string;
  docsUrl: string;
  webhookEvents?: string[];
  rateLimitPerMinute?: number;
}

export interface IntegrationConnection {
  id: string;
  integrationId: string;
  userId: string;
  organisationId: string;
  status: IntegrationStatus;
  connectedAt: string;
  lastSyncAt?: string;
  webhooksActive: number;
  rateLimitRemaining?: number;
  rateLimitTotal?: number;
  metadata?: Record<string, unknown>;
}

export interface WebhookEvent {
  id: string;
  integrationId: string;
  connectionId: string;
  event: string;
  payload: unknown;
  status: 'delivered' | 'failed' | 'pending' | 'retrying';
  responseCode?: number;
  retryCount: number;
  timestamp: string;
}

export interface OAuth2TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  tokenType: string;
  scopes: string[];
}

// ============================================================
// SANDBOX / VM TYPES
// ============================================================

export type SandboxType = 'wasm' | 'iframe' | 'worker';
export type SandboxStatus = 'created' | 'running' | 'paused' | 'stopped' | 'error';

export interface SandboxConfig {
  type: SandboxType;
  name: string;
  template?: string;
  resourceQuota: ResourceQuota;
  permissions: SandboxPermissions;
  networkConfig?: NetworkConfig;
  storageConfig?: StorageConfig;
}

export interface ResourceQuota {
  maxMemoryMB: number;
  maxCpuTimeSeconds: number;
  maxStorageMB: number;
  maxNetworkBandwidthKBps?: number;
}

export interface SandboxPermissions {
  allowNetwork: boolean;
  allowFileSystem: boolean;
  allowClipboard: boolean;
  allowNotifications: boolean;
  allowedDomains?: string[];
}

export interface NetworkConfig {
  allowOutbound: boolean;
  allowedHosts: string[];
  proxyUrl?: string;
}

export interface StorageConfig {
  persistent: boolean;
  maxSizeMB: number;
  encryptAtRest: boolean;
}

export interface SandboxInstance {
  id: string;
  config: SandboxConfig;
  status: SandboxStatus;
  createdAt: number;
  startedAt?: number;
  memoryUsageMB: number;
  cpuTimeSeconds: number;
  storageUsedMB: number;
}

export interface SandboxSnapshot {
  id: string;
  sandboxId: string;
  createdAt: number;
  sizeMB: number;
  description?: string;
}

// ============================================================
// GIT INTEGRATION TYPES
// ============================================================

export type GitProvider = 'github' | 'gitlab' | 'bitbucket' | 'gitea';

export interface GitConnection {
  id: string;
  provider: GitProvider;
  username: string;
  avatarUrl?: string;
  connectedAt: string;
  status: 'active' | 'expired' | 'error';
  repoCount: number;
}

export interface Repository {
  id: string;
  provider: GitProvider;
  name: string;
  fullName: string;
  description: string;
  language: string;
  stars: number;
  forks: number;
  openIssues: number;
  visibility: 'public' | 'private' | 'internal';
  defaultBranch: string;
  lastPush: string;
  size: number;
  topics: string[];
  cloneUrl: string;
}

export interface GitCommit {
  sha: string;
  message: string;
  author: string;
  authorEmail: string;
  date: string;
  additions: number;
  deletions: number;
  files: string[];
}

export interface PullRequest {
  id: number;
  title: string;
  author: string;
  state: 'open' | 'merged' | 'closed';
  createdAt: string;
  updatedAt: string;
  labels: string[];
  reviewers: string[];
  sourceBranch: string;
  targetBranch: string;
  additions: number;
  deletions: number;
  comments: number;
  checksStatus: 'passing' | 'failing' | 'pending';
}

export interface GitIssue {
  id: number;
  title: string;
  author: string;
  state: 'open' | 'closed';
  createdAt: string;
  labels: { name: string; color: string }[];
  assignees: string[];
  comments: number;
  milestone?: string;
}

export interface CIPipeline {
  id: string;
  name: string;
  status: 'success' | 'failure' | 'running' | 'pending' | 'cancelled';
  branch: string;
  commitSha: string;
  duration: string;
  triggeredBy: string;
  startedAt: string;
  jobs: CIPipelineJob[];
}

export interface CIPipelineJob {
  id: string;
  name: string;
  status: 'success' | 'failure' | 'running' | 'pending' | 'skipped';
  duration: string;
  startedAt?: string;
}

// ============================================================
// AI BUILDER TYPES
// ============================================================

export type AIModelType = 'chat' | 'embedding' | 'image' | 'audio' | 'code' | 'multimodal';
export type AIStrategy = 'direct' | 'chain-of-thought' | 'react' | 'tree-of-thought' | 'self-consistency';

export interface AIModel {
  id: string;
  provider: string;
  name: string;
  type: AIModelType;
  contextWindow: number;
  costPer1kTokens: number;
  status: 'active' | 'inactive' | 'rate-limited';
  latencyMs: number;
  description: string;
}

export interface AIPlugin {
  id: string;
  name: string;
  icon: string;
  description: string;
  version: string;
  author: string;
  category: 'tool' | 'memory' | 'retrieval' | 'output' | 'guard' | 'transform';
  enabled: boolean;
  functions: string[];
  config: Record<string, string>;
}

export interface CustomAI {
  id: string;
  name: string;
  icon: string;
  description: string;
  baseModel: string;
  plugins: string[];
  functions: string[];
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  strategy: AIStrategy;
  guardrails: string[];
  status: 'active' | 'draft' | 'testing';
  createdAt: string;
  totalInvocations: number;
  avgLatencyMs: number;
  successRate: number;
}

export interface AIFunction {
  id: string;
  name: string;
  description: string;
  parameters: AIFunctionParameter[];
  returnType: string;
  category: 'data' | 'action' | 'query' | 'transform' | 'external';
  policyGated: boolean;
}

export interface AIFunctionParameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface AIConversationMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  functionName?: string;
  timestamp: string;
  tokens?: number;
  latencyMs?: number;
}

// ============================================================
// SELF-HEALING TYPES
// ============================================================

export type CVESeverity = 'critical' | 'high' | 'medium' | 'low' | 'none';

export interface CVEResult {
  id: string;
  severity: CVESeverity;
  cvss: number;
  package: string;
  version: string;
  fixedIn?: string;
  description: string;
  published: string;
  suppressed: boolean;
}

export interface DependencyEntry {
  name: string;
  version: string;
  latestVersion: string;
  isOutdated: boolean;
  nMinusCompliant: boolean;
  license: string;
  directDependency: boolean;
  vulnerabilities: number;
}

export interface SBOMEntry {
  type: 'library' | 'framework' | 'application' | 'operating-system';
  name: string;
  version: string;
  purl: string;
  license: string;
  hashes: { algorithm: string; value: string }[];
}

export interface HealthCheck {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latencyMs: number;
  lastCheck: number;
  consecutiveFailures: number;
  uptime: number;
  details?: Record<string, unknown>;
}

export interface CircuitBreakerState {
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

// ============================================================
// AGENT / BOT FACTORY TYPES
// ============================================================

export type AgentType = 'content' | 'trading' | 'support' | 'monitoring' | 'scraping' | 'custom';
export type AgentStatus = 'active' | 'paused' | 'draft' | 'error';

export interface Agent {
  id: string;
  name: string;
  icon: string;
  type: AgentType;
  description: string;
  directives: string[];
  capabilities: string[];
  status: AgentStatus;
  createdAt: string;
  lastRunAt?: string;
  totalEarnings: number;
  totalTasks: number;
  successRate: number;
  config: Record<string, unknown>;
}

// ============================================================
// FINOPS TYPES
// ============================================================

export type FreeTierProvider = 'cloudflare' | 'supabase' | 'oracle' | 'letsencrypt';

export interface FreeTierService {
  id: string;
  provider: FreeTierProvider;
  name: string;
  currentUsage: number;
  maxUsage: number;
  unit: string;
  usagePercent: number;
  status: 'safe' | 'warning' | 'danger';
  scalingThreshold: string;
}

export interface FinOpsReport {
  totalMonthlyCost: number;
  projectedAnnualCost: number;
  services: FreeTierService[];
  optimizationStrategies: string[];
  lastUpdated: string;
}

// ============================================================
// CLI TYPES
// ============================================================

export interface CLICommand {
  name: string;
  description: string;
  usage: string;
  options: CLIOption[];
  handler: string;
}

export interface CLIOption {
  flag: string;
  description: string;
  required: boolean;
  defaultValue?: string;
}

export interface CLIOutput {
  format: 'text' | 'json' | 'table';
  data: unknown;
  exitCode: number;
}
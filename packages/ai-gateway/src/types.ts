/**
 * AI Gateway — Type Definitions
 * ═══════════════════════════════════════════════════════════════
 * Shared types for the AI routing and failover system.
 */

// ─── Messages ───────────────────────────────────────────────────

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
}

// ─── Request / Response ─────────────────────────────────────────

export interface AIRequest {
  messages: AIMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
  responseFormat?: 'text' | 'json';
  /** Tenant ID for routing and metering */
  tenantId?: string;
  /** Request tags for analytics */
  tags?: Record<string, string>;
}

export interface AIResponse {
  content: string;
  model: string;
  provider: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs: number;
  cached: boolean;
  /** Which provider in the chain served this */
  failoverIndex?: number;
}

// ─── Provider Interface ─────────────────────────────────────────

export interface AIProvider {
  readonly name: string;
  readonly displayName: string;

  complete(request: AIRequest): Promise<AIResponse>;
  healthCheck(): Promise<ProviderHealth>;
}

export interface ProviderHealth {
  healthy: boolean;
  latencyMs: number;
  provider: string;
  error?: string;
}

// ─── Routing Configuration ──────────────────────────────────────

export interface RouteRule {
  /** Provider name to route to */
  provider: string;
  /** Priority (lower = higher priority) */
  priority: number;
  /** Model to use on this provider */
  model?: string;
  /** Max latency before failover (ms) */
  maxLatency?: number;
  /** Weight for load balancing (0-100) */
  weight?: number;
  /** Conditions for this route */
  conditions?: RouteCondition;
}

export interface RouteCondition {
  /** Only match these tenant plans */
  plans?: string[];
  /** Only match these tags */
  tags?: Record<string, string>;
  /** Only match if estimated tokens < threshold */
  maxTokens?: number;
  /** Time-based routing (e.g., off-peak hours) */
  schedule?: {
    startHour: number; // UTC
    endHour: number;
  };
}

export interface TenantAIConfig {
  tenantId: string;
  /** Ordered routing rules (failover chain) */
  routes: RouteRule[];
  /** Global token budget per day */
  dailyTokenBudget?: number;
  /** Tokens used today */
  tokensUsedToday?: number;
  /** Enable response caching */
  cacheEnabled?: boolean;
  /** Cache TTL in seconds */
  cacheTtl?: number;
}

// ─── Gateway Metrics ────────────────────────────────────────────

export interface GatewayMetrics {
  totalRequests: number;
  totalTokens: number;
  totalLatencyMs: number;
  failoverCount: number;
  cacheHits: number;
  errors: number;
  byProvider: Record<string, {
    requests: number;
    tokens: number;
    avgLatencyMs: number;
    errors: number;
  }>;
}
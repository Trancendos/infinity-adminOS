/**
 * @trancendos/ai-gateway — AI Routing & Failover Engine
 * ═══════════════════════════════════════════════════════════════
 * Per-tenant conditional AI routing with automatic failover,
 * token budgeting, response caching, and multi-provider support.
 */

// ─── Gateway ────────────────────────────────────────────────────
export { AIGateway, AIGatewayError } from './router';
export type { AIGatewayConfig } from './router';

// ─── Types ──────────────────────────────────────────────────────
export type {
  AIProvider,
  AIRequest,
  AIResponse,
  AIMessage,
  ProviderHealth,
  RouteRule,
  RouteCondition,
  TenantAIConfig,
  GatewayMetrics,
} from './types';

// ─── Providers ──────────────────────────────────────────────────
export { WorkersAIProvider } from './providers/workers-ai';
export { OpenAIProvider } from './providers/openai';
export type { OpenAIConfig } from './providers/openai';
export { AnthropicProvider } from './providers/anthropic';
export type { AnthropicConfig } from './providers/anthropic';
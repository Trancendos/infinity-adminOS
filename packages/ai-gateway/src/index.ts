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
export { OpenRouterProvider } from './providers/openrouter';
export type { OpenRouterConfig } from './providers/openrouter';
export { HuggingFaceProvider } from './providers/huggingface';
export type { HuggingFaceConfig } from './providers/huggingface';
export { OfflineProvider } from './providers/offline';
export type { OfflineConfig, OfflineModel } from './providers/offline';
export { TransformersProvider } from './providers/transformers';
export type { TransformersConfig } from './providers/transformers';
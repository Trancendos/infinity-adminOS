/**
 * Workers AI Provider — Cloudflare-Native AI
 * ═══════════════════════════════════════════════════════════════
 * Wraps the @trancendos/adapters WorkersAIAdapter with
 * gateway-level routing, metering, and caching support.
 */

import type { AIProvider, AIRequest, AIResponse, ProviderHealth } from '../types';

export class WorkersAIProvider implements AIProvider {
  readonly name = 'workers-ai';
  readonly displayName = 'Cloudflare Workers AI';
  private ai: any; // AI binding from CF runtime

  /** Models available on Workers AI */
  static readonly MODELS = {
    'llama-3.1-8b': '@cf/meta/llama-3.1-8b-instruct',
    'llama-3.1-70b': '@cf/meta/llama-3.1-70b-instruct',
    'mistral-7b': '@cf/mistral/mistral-7b-instruct-v0.2',
    'gemma-7b': '@cf/google/gemma-7b-it',
    'qwen-1.5-14b': '@cf/qwen/qwen1.5-14b-chat-awq',
    'embedding-base': '@cf/baai/bge-base-en-v1.5',
    'embedding-large': '@cf/baai/bge-large-en-v1.5',
  } as const;

  constructor(ai: any) {
    this.ai = ai;
  }

  async complete(request: AIRequest): Promise<AIResponse> {
    const model = this.resolveModel(request.model);
    const start = Date.now();

    try {
      const response = await this.ai.run(model, {
        messages: request.messages,
        max_tokens: request.maxTokens ?? 1024,
        temperature: request.temperature ?? 0.7,
        stream: false,
      });

      return {
        content: response.response ?? '',
        model,
        provider: this.name,
        usage: {
          promptTokens: response.usage?.prompt_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0,
        },
        latencyMs: Date.now() - start,
        cached: false,
      };
    } catch (error) {
      throw new Error(
        `[workers-ai] ${model} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      await this.ai.run(WorkersAIProvider.MODELS['llama-3.1-8b'], {
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      });
      return { healthy: true, latencyMs: Date.now() - start, provider: this.name };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        provider: this.name,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private resolveModel(model?: string): string {
    if (!model) return WorkersAIProvider.MODELS['llama-3.1-8b'];
    // Check if it's an alias
    if (model in WorkersAIProvider.MODELS) {
      return WorkersAIProvider.MODELS[model as keyof typeof WorkersAIProvider.MODELS];
    }
    // Assume it's a full model path
    return model;
  }
}
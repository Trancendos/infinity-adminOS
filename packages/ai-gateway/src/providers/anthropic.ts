/**
 * Anthropic Provider — Claude AI Gateway
 * ═══════════════════════════════════════════════════════════════
 * Implements the AIProvider interface for Anthropic's Claude API.
 * Uses fetch() for Cloudflare Workers compatibility.
 */

import type { AIProvider, AIRequest, AIResponse, ProviderHealth } from '../types';

export interface AnthropicConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  apiVersion?: string;
}

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  readonly displayName = 'Anthropic Claude';
  private config: AnthropicConfig;

  static readonly MODELS = {
    'claude-4-sonnet': 'claude-sonnet-4-20250514',
    'claude-3.5-sonnet': 'claude-3-5-sonnet-20241022',
    'claude-3.5-haiku': 'claude-3-5-haiku-20241022',
    'claude-3-opus': 'claude-3-opus-20240229',
  } as const;

  constructor(config: AnthropicConfig) {
    this.config = {
      baseUrl: 'https://api.anthropic.com',
      defaultModel: 'claude-3-5-haiku-20241022',
      apiVersion: '2023-06-01',
      ...config,
    };
  }

  async complete(request: AIRequest): Promise<AIResponse> {
    const model = this.resolveModel(request.model);
    const start = Date.now();

    // Anthropic separates system from messages
    const systemMessage = request.messages.find((m) => m.role === 'system');
    const chatMessages = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const body: Record<string, unknown> = {
      model,
      messages: chatMessages,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature ?? 0.7,
    };

    if (systemMessage) {
      body.system = systemMessage.content;
    }
    if (request.topP !== undefined) body.top_p = request.topP;
    if (request.stop) body.stop_sequences = request.stop;

    const response = await fetch(`${this.config.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': this.config.apiVersion!,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`[anthropic] ${response.status}: ${errorBody}`);
    }

    const data: any = await response.json();
    const content = data.content
      ?.filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('') ?? '';

    return {
      content,
      model: data.model ?? model,
      provider: this.name,
      usage: {
        promptTokens: data.usage?.input_tokens ?? 0,
        completionTokens: data.usage?.output_tokens ?? 0,
        totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      },
      latencyMs: Date.now() - start,
      cached: false,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      // Anthropic doesn't have a /models endpoint, so we try a minimal request
      const response = await fetch(`${this.config.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': this.config.apiVersion!,
        },
        body: JSON.stringify({
          model: this.config.defaultModel,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
      });

      return {
        healthy: response.ok,
        latencyMs: Date.now() - start,
        provider: this.name,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
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
    if (!model) return this.config.defaultModel!;
    if (model in AnthropicProvider.MODELS) {
      return AnthropicProvider.MODELS[model as keyof typeof AnthropicProvider.MODELS];
    }
    return model;
  }
}
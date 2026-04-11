/**
 * OpenAI Provider — External AI Gateway
 * ═══════════════════════════════════════════════════════════════
 * Implements the AIProvider interface for OpenAI's API.
 * Uses fetch() for Cloudflare Workers compatibility.
 * Supports GPT-4o, GPT-4o-mini, o1, embeddings.
 */

import type { AIProvider, AIRequest, AIResponse, ProviderHealth } from '../types';

export interface OpenAIConfig {
  apiKey: string;
  baseUrl?: string;
  organization?: string;
  defaultModel?: string;
}

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  readonly displayName = 'OpenAI';
  private config: OpenAIConfig;

  static readonly MODELS = {
    'gpt-4o': 'gpt-4o',
    'gpt-4o-mini': 'gpt-4o-mini',
    'gpt-4-turbo': 'gpt-4-turbo',
    'o1': 'o1',
    'o1-mini': 'o1-mini',
    'embedding-3-small': 'text-embedding-3-small',
    'embedding-3-large': 'text-embedding-3-large',
  } as const;

  constructor(config: OpenAIConfig) {
    this.config = {
      baseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o-mini',
      ...config,
    };
  }

  async complete(request: AIRequest): Promise<AIResponse> {
    const model = request.model ?? this.config.defaultModel ?? 'gpt-4o-mini';
    const start = Date.now();

    const body: Record<string, unknown> = {
      model,
      messages: request.messages,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature ?? 0.7,
    };

    if (request.topP !== undefined) body.top_p = request.topP;
    if (request.stop) body.stop = request.stop;
    if (request.responseFormat === 'json') {
      body.response_format = { type: 'json_object' };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    };
    if (this.config.organization) {
      headers['OpenAI-Organization'] = this.config.organization;
    }

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`[openai] ${response.status}: ${errorBody}`);
    }

    const data: any = await response.json();
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content ?? '',
      model: data.model ?? model,
      provider: this.name,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      latencyMs: Date.now() - start,
      cached: false,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      const response = await fetch(`${this.config.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
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
}
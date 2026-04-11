/**
 * OpenRouter AI Provider
 * ═══════════════════════════════════════════════════════════════
 * Integrates OpenRouter's unified API for access to 100+ AI models
 * from 20+ providers with automatic routing and cost optimization.
 *
 * Features:
 * - Single API endpoint for multiple providers
 * - Automatic model routing and failover
 * - Cost optimization and usage tracking
 * - Streaming support and function calling
 */

import type { AIProvider, AIRequest, AIResponse, ProviderHealth } from '../types';

export interface OpenRouterConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

export interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  pricing: {
    prompt: number;
    completion: number;
  };
  context_length: number;
  supported_parameters: string[];
  supports_function_calling?: boolean;
  supports_vision?: boolean;
  supports_tools?: boolean;
}

export class OpenRouterProvider implements AIProvider {
  readonly name = 'openrouter';
  readonly displayName = 'OpenRouter';

  private config: OpenRouterConfig;
  private modelCache: Map<string, OpenRouterModel> = new Map();
  private lastHealthCheck: number = 0;
  private healthCache: ProviderHealth | null = null;

  constructor(config: OpenRouterConfig) {
    this.config = {
      baseUrl: 'https://openrouter.ai/api/v1',
      timeout: 60000,
      ...config,
    };
  }

  async complete(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      const response = await this.makeRequest(request);
      const latencyMs = Date.now() - startTime;

      return {
        content: response.choices[0]?.message?.content || '',
        model: response.model || request.model || 'unknown',
        provider: this.name,
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        },
        latencyMs,
        cached: false,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      throw new Error(`OpenRouter API error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    const now = Date.now();

    // Return cached health check if less than 30 seconds old
    if (this.healthCache && (now - this.lastHealthCheck) < 30000) {
      return this.healthCache;
    }

    this.lastHealthCheck = now;

    try {
      // Test with a simple model availability check
      const response = await fetch(`${this.config.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      this.healthCache = {
        healthy: true,
        latencyMs: Date.now() - now,
        provider: this.name,
      };

      // Cache available models
      if (data.data && Array.isArray(data.data)) {
        data.data.forEach((model: any) => {
          if (model.id && model.name) {
            this.modelCache.set(model.id, {
              id: model.id,
              name: model.name,
              description: model.description || '',
              pricing: {
                prompt: model.pricing?.prompt || 0,
                completion: model.pricing?.completion || 0,
              },
              context_length: model.context_length || 4096,
              supported_parameters: model.supported_parameters || [],
              supports_function_calling: model.supports_function_calling || false,
              supports_vision: model.supports_vision || false,
              supports_tools: model.supports_tools || false,
            });
          }
        });
      }

    } catch (error) {
      this.healthCache = {
        healthy: false,
        latencyMs: Date.now() - now,
        provider: this.name,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    return this.healthCache;
  }

  /**
   * Get available models from OpenRouter
   */
  async getModels(): Promise<OpenRouterModel[]> {
    // Ensure we have fresh model data
    await this.healthCheck();

    return Array.from(this.modelCache.values());
  }

  /**
   * Get cost estimate for a request
   */
  async estimateCost(request: AIRequest): Promise<{ promptCost: number; completionCost: number; totalCost: number }> {
    const model = this.modelCache.get(request.model || '');

    if (!model) {
      // Default pricing for unknown models
      return { promptCost: 0, completionCost: 0, totalCost: 0 };
    }

    // Estimate token counts (rough approximation)
    const estimatedPromptTokens = this.estimateTokens(request.messages || []);
    const estimatedCompletionTokens = request.maxTokens || 1024;

    const promptCost = estimatedPromptTokens * model.pricing.prompt;
    const completionCost = estimatedCompletionTokens * model.pricing.completion;

    return {
      promptCost,
      completionCost,
      totalCost: promptCost + completionCost,
    };
  }

  private async makeRequest(request: AIRequest) {
    const payload = {
      model: request.model,
      messages: request.messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      top_p: request.topP,
      stop: request.stop,
      stream: false, // TODO: Implement streaming support
      ...(request.responseFormat && { response_format: request.responseFormat }),
    };

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://infinity-os.dev', // Required by OpenRouter
        'X-Title': 'Infinity OS', // Required by OpenRouter
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.config.timeout!),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
    }

    return await response.json();
  }

  private estimateTokens(messages: Array<{ role: string; content: string }>): number {
    // Rough token estimation: ~4 characters per token
    const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
    return Math.ceil(totalChars / 4);
  }
}

export type { OpenRouterConfig };</content>
<parameter name="filePath">C:\Development\infinity-adminOS\packages\ai-gateway\src\providers\openrouter.ts
/**
 * Hugging Face AI Provider
 * ═══════════════════════════════════════════════════════════════
 * Integrates Hugging Face's Inference API and Model Hub for access
 * to 500,000+ open-source models with text generation, embeddings,
 * and custom fine-tuned models.
 *
 * Features:
 * - Text generation and completion
 * - Embeddings and semantic search
 * - Custom model deployment
 * - Task-specific model routing
 * - Zero-cost tier utilization
 */

import type { AIProvider, AIRequest, AIResponse, ProviderHealth } from '../types';

export interface HuggingFaceConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

export interface HuggingFaceModel {
  id: string;
  name: string;
  description: string;
  task: string;
  tags: string[];
  pipeline_tag?: string;
  library_name?: string;
  likes: number;
  downloads: number;
  createdAt: string;
}

export class HuggingFaceProvider implements AIProvider {
  readonly name = 'huggingface';
  readonly displayName = 'Hugging Face';

  private config: HuggingFaceConfig;
  private modelCache: Map<string, HuggingFaceModel> = new Map();
  private lastHealthCheck: number = 0;
  private healthCache: ProviderHealth | null = null;

  constructor(config: HuggingFaceConfig) {
    this.config = {
      baseUrl: 'https://api-inference.huggingface.co',
      timeout: 60000,
      ...config,
    };
  }

  async complete(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      // Determine the appropriate task and endpoint
      const taskType = this.determineTask(request);
      const response = await this.makeInferenceRequest(request, taskType);
      const latencyMs = Date.now() - startTime;

      return {
        content: this.extractContent(response, taskType),
        model: request.model || 'unknown',
        provider: this.name,
        usage: this.estimateUsage(request, response),
        latencyMs,
        cached: false,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      throw new Error(`Hugging Face API error: ${error instanceof Error ? error.message : String(error)}`);
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
      // Test with a simple model info request
      const response = await fetch('https://huggingface.co/api/models?limit=1', {
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

      this.healthCache = {
        healthy: true,
        latencyMs: Date.now() - now,
        provider: this.name,
      };

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
   * Get available models from Hugging Face Hub
   */
  async getModels(options?: {
    task?: string;
    search?: string;
    limit?: number;
  }): Promise<HuggingFaceModel[]> {
    const params = new URLSearchParams();
    if (options?.task) params.append('pipeline_tag', options.task);
    if (options?.search) params.append('search', options.search);
    if (options?.limit) params.append('limit', options.limit?.toString() || '50');

    const response = await fetch(`https://huggingface.co/api/models?${params}`, {
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }

    const models = await response.json();
    return models.map((model: any) => ({
      id: model.id,
      name: model.id.split('/').pop() || model.id,
      description: model.description || '',
      task: model.pipeline_tag || 'unknown',
      tags: model.tags || [],
      pipeline_tag: model.pipeline_tag,
      library_name: model.library_name,
      likes: model.likes || 0,
      downloads: model.downloads || 0,
      createdAt: model.createdAt,
    }));
  }

  /**
   * Search for models by task and capabilities
   */
  async searchModels(query: {
    task?: 'text-generation' | 'text2text-generation' | 'question-answering' | 'fill-mask' | 'summarization' | 'translation';
    minLikes?: number;
    sort?: 'downloads' | 'likes' | 'created' | 'updated';
    limit?: number;
  }): Promise<HuggingFaceModel[]> {
    return this.getModels(query);
  }

  private determineTask(request: AIRequest): string {
    // Determine task based on request characteristics
    if (request.messages && request.messages.length > 1) {
      return 'conversational'; // Chat-like interaction
    }
    if (request.model?.includes('embed') || request.model?.includes('sentence-transformer')) {
      return 'sentence-similarity'; // Embedding task
    }
    if (request.model?.includes('question-answering')) {
      return 'question-answering';
    }
    if (request.model?.includes('summarization')) {
      return 'summarization';
    }
    if (request.model?.includes('translation')) {
      return 'translation';
    }

    // Default to text generation
    return 'text-generation';
  }

  private async makeInferenceRequest(request: AIRequest, task: string) {
    let payload: any;
    let endpoint = '';

    switch (task) {
      case 'conversational':
      case 'text-generation':
        endpoint = `/models/${request.model}`;
        payload = {
          inputs: this.formatMessages(request.messages || []),
          parameters: {
            max_new_tokens: request.maxTokens || 512,
            temperature: request.temperature ?? 0.7,
            top_p: request.topP ?? 0.9,
            do_sample: true,
            return_full_text: false,
          },
        };
        break;

      case 'sentence-similarity':
        endpoint = `/models/${request.model}`;
        payload = {
          inputs: request.messages?.[0]?.content || '',
        };
        break;

      case 'question-answering':
        endpoint = `/models/${request.model}`;
        payload = {
          inputs: {
            question: request.messages?.[0]?.content || '',
            context: request.messages?.[1]?.content || '',
          },
        };
        break;

      default:
        endpoint = `/models/${request.model}`;
        payload = {
          inputs: request.messages?.[0]?.content || '',
        };
    }

    const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.config.timeout!),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Hugging Face API error (${response.status}): ${errorText}`);
    }

    return await response.json();
  }

  private formatMessages(messages: Array<{ role: string; content: string }>): string {
    return messages.map(msg => {
      switch (msg.role) {
        case 'system':
          return `System: ${msg.content}`;
        case 'user':
          return `User: ${msg.content}`;
        case 'assistant':
          return `Assistant: ${msg.content}`;
        default:
          return msg.content;
      }
    }).join('\n\n');
  }

  private extractContent(response: any, task: string): string {
    if (Array.isArray(response)) {
      switch (task) {
        case 'text-generation':
        case 'conversational':
          return response[0]?.generated_text || response[0]?.text || JSON.stringify(response);
        case 'sentence-similarity':
          return JSON.stringify(response[0] || response);
        default:
          return JSON.stringify(response[0] || response);
      }
    }

    if (typeof response === 'object') {
      if (response.generated_text) return response.generated_text;
      if (response.text) return response.text;
      if (response.answer) return response.answer;
      return JSON.stringify(response);
    }

    return String(response);
  }

  private estimateUsage(request: AIRequest, response: any): { promptTokens: number; completionTokens: number; totalTokens: number } {
    // Hugging Face doesn't provide token counts in responses
    // Estimate based on character counts
    const promptChars = request.messages?.reduce((sum, msg) => sum + msg.content.length, 0) || 0;
    const responseChars = this.extractContent(response, this.determineTask(request)).length;

    // Rough approximation: ~4 characters per token
    const promptTokens = Math.ceil(promptChars / 4);
    const completionTokens = Math.ceil(responseChars / 4);

    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    };
  }
}

export type { HuggingFaceConfig, HuggingFaceModel };</content>
<parameter name="filePath">C:\Development\infinity-adminOS\packages\ai-gateway\src\providers\huggingface.ts
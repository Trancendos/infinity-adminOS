/**
 * Local Transformers.js Provider
 * ═══════════════════════════════════════════════════════════════
 * Runs Hugging Face models locally in the browser using Transformers.js.
 * Supports text generation, embeddings, and other common AI tasks offline.
 *
 * Features:
 * - Zero server dependency for inference
 * - Client-side model execution
 * - Automatic model downloading and caching
 * - Progressive enhancement with online fallback
 */

import { OfflineProvider } from './offline';
import type { AIRequest, AIResponse } from '../types';

export interface TransformersConfig {
  modelCacheName?: string;
  maxCacheSize?: number;
  enableBackgroundDownload?: boolean;
  defaultModel?: string;
}

export class TransformersProvider extends OfflineProvider {
  private pipeline: any = null;
  private initialized = false;

  constructor(config: TransformersConfig = {}) {
    super('transformers', 'Local Transformers.js', config);
  }

  async complete(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      await this.ensureInitialized();

      const modelId = request.model || this.config.defaultModel || 'Xenova/distilbert-base-uncased-finetuned-sst-2-english';
      await this.loadModel(modelId);

      const result = await this.runInference(modelId, request);
      const latencyMs = Date.now() - startTime;

      return {
        content: this.extractContent(result),
        model: modelId,
        provider: this.name,
        usage: this.estimateUsage(request, result),
        latencyMs,
        cached: false,
      };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      throw new Error(`Transformers.js error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  protected async instantiateModel(data: ArrayBuffer, type: string): Promise<any> {
    // For Transformers.js, we don't need to instantiate from binary data
    // The library handles model loading automatically
    // This is just a placeholder for the abstract method
    return { type, loaded: true };
  }

  protected async runInference(modelId: string, request: AIRequest): Promise<any> {
    await this.ensureInitialized();

    // Determine the task based on model and request
    const task = this.determineTask(modelId, request);

    // Create pipeline if needed
    if (!this.pipeline || this.pipeline.task !== task) {
      const { pipeline } = await import('@xenova/transformers');
      this.pipeline = await pipeline(task, modelId);
    }

    // Prepare input
    const input = this.prepareInput(request, task);

    // Run inference
    const output = await this.pipeline(input);

    return output;
  }

  protected async testBasicFunctionality(): Promise<boolean> {
    try {
      await this.ensureInitialized();
      return true;
    } catch {
      return false;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize model registry with common models
      this.initializeModelRegistry();

      // Mark as initialized
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize Transformers.js:', error);
      throw error;
    }
  }

  private initializeModelRegistry(): void {
    // Common models that work well with Transformers.js
    const models: Array<{ id: string; name: string; file: string; size: number; type: 'transformers'; capabilities: string[] }> = [
      {
        id: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
        name: 'DistilBERT SST-2',
        file: 'https://huggingface.co/Xenova/distilbert-base-uncased-finetuned-sst-2-english/resolve/main/onnx/model.onnx',
        size: 67000000, // ~67MB
        type: 'transformers',
        capabilities: ['sentiment-analysis'],
      },
      {
        id: 'Xenova/distilbart-cnn-6-6',
        name: 'DistilBART CNN',
        file: 'https://huggingface.co/Xenova/distilbart-cnn-6-6/resolve/main/onnx/model.onnx',
        size: 470000000, // ~470MB
        type: 'transformers',
        capabilities: ['summarization'],
      },
      {
        id: 'Xenova/all-MiniLM-L6-v2',
        name: 'All MiniLM L6 v2',
        file: 'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx',
        size: 23000000, // ~23MB
        type: 'transformers',
        capabilities: ['embeddings', 'semantic-search'],
      },
      {
        id: 'Xenova/gpt2',
        name: 'GPT-2 Small',
        file: 'https://huggingface.co/Xenova/gpt2/resolve/main/onnx/model.onnx',
        size: 550000000, // ~550MB
        type: 'transformers',
        capabilities: ['text-generation'],
      },
    ];

    models.forEach(model => {
      this.availableModels.set(model.id, {
        ...model,
        downloaded: false,
        lastUsed: 0,
      });
    });
  }

  private determineTask(modelId: string, request: AIRequest): string {
    // Determine task based on model name and request
    if (modelId.includes('gpt2') || modelId.includes('text-generation')) {
      return 'text-generation';
    }
    if (modelId.includes('summarization') || modelId.includes('bart')) {
      return 'summarization';
    }
    if (modelId.includes('sentiment') || modelId.includes('sst')) {
      return 'sentiment-analysis';
    }
    if (modelId.includes('embedding') || modelId.includes('MiniLM')) {
      return 'feature-extraction'; // For embeddings
    }

    // Default to text generation
    return 'text-generation';
  }

  private prepareInput(request: AIRequest, task: string): any {
    const messages = request.messages || [];
    const lastMessage = messages[messages.length - 1];

    switch (task) {
      case 'text-generation':
        return lastMessage?.content || '';

      case 'summarization':
        return lastMessage?.content || '';

      case 'sentiment-analysis':
        return lastMessage?.content || '';

      case 'feature-extraction':
        return lastMessage?.content || '';

      default:
        return lastMessage?.content || '';
    }
  }

  private extractContent(result: any): string {
    if (Array.isArray(result)) {
      if (result[0]?.generated_text) {
        return result[0].generated_text;
      }
      if (result[0]?.summary_text) {
        return result[0].summary_text;
      }
      if (result[0]?.label) {
        return `Sentiment: ${result[0].label} (${(result[0].score * 100).toFixed(1)}%)`;
      }
      return JSON.stringify(result[0]);
    }

    if (typeof result === 'object') {
      if (result.generated_text) return result.generated_text;
      if (result.summary_text) return result.summary_text;
      if (result.label) return `Sentiment: ${result.label} (${(result.score * 100).toFixed(1)}%)`;
      return JSON.stringify(result);
    }

    return String(result);
  }

  private estimateUsage(request: AIRequest, result: any): { promptTokens: number; completionTokens: number; totalTokens: number } {
    // Transformers.js doesn't provide token counts
    // Estimate based on character counts
    const promptChars = request.messages?.reduce((sum, msg) => sum + msg.content.length, 0) || 0;
    const responseChars = this.extractContent(result).length;

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

export type { TransformersConfig };</content>
<parameter name="filePath">C:\Development\infinity-adminOS\packages\ai-gateway\src\providers\transformers.ts
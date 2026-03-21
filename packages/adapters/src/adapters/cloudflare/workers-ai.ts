/**
 * WorkersAIAdapter — Cloudflare Workers AI Implementation
 * ═══════════════════════════════════════════════════════════════
 * Implements AICompletionPort using Cloudflare Workers AI.
 * Supports chat completion, streaming, and embeddings.
 */

import type {
  AICompletionPort,
  CompletionOptions,
  CompletionResult,
  StreamChunk,
  EmbeddingOptions,
  EmbeddingResult,
} from '../../ports/ai-completion';

/** Default model mappings */
const DEFAULT_CHAT_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const DEFAULT_EMBEDDING_MODEL = '@cf/baai/bge-base-en-v1.5';

export class WorkersAIAdapter implements AICompletionPort {
  readonly provider = 'cloudflare-workers-ai';
  private ai: any; // AI binding from CF runtime

  constructor(ai: any) {
    this.ai = ai;
  }

  async complete(options: CompletionOptions): Promise<CompletionResult> {
    const model = options.model ?? DEFAULT_CHAT_MODEL;
    const start = Date.now();

    try {
      const response = await this.ai.run(model, {
        messages: options.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        max_tokens: options.maxTokens ?? 1024,
        temperature: options.temperature ?? 0.7,
        top_p: options.topP,
        stream: false,
      });

      const latencyMs = Date.now() - start;

      // Workers AI response format
      const content = response.response ?? response.result ?? '';

      return {
        content,
        model,
        provider: this.provider,
        usage: {
          promptTokens: response.usage?.prompt_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0,
        },
        finishReason: 'stop',
        latencyMs,
      };
    } catch (error) {
      return {
        content: '',
        model,
        provider: this.provider,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        finishReason: 'error',
        latencyMs: Date.now() - start,
      };
    }
  }

  async *stream(options: CompletionOptions): AsyncIterable<StreamChunk> {
    const model = options.model ?? DEFAULT_CHAT_MODEL;

    try {
      const response = await this.ai.run(model, {
        messages: options.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        max_tokens: options.maxTokens ?? 1024,
        temperature: options.temperature ?? 0.7,
        stream: true,
      });

      // Workers AI streaming returns a ReadableStream of SSE events
      if (response instanceof ReadableStream) {
        const reader = response.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            yield { content: '', done: true };
            break;
          }

          const text = decoder.decode(value, { stream: true });
          // Parse SSE data lines
          const lines = text.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') {
                yield { content: '', done: true };
                return;
              }
              try {
                const parsed = JSON.parse(data);
                yield {
                  content: parsed.response ?? parsed.choices?.[0]?.delta?.content ?? '',
                  done: false,
                };
              } catch {
                // Skip malformed SSE events
              }
            }
          }
        }
      } else {
        // Non-streaming fallback
        yield { content: response.response ?? '', done: true };
      }
    } catch (error) {
      yield { content: '', done: true };
    }
  }

  async embed(options: EmbeddingOptions): Promise<EmbeddingResult> {
    const model = options.model ?? DEFAULT_EMBEDDING_MODEL;
    const inputs = Array.isArray(options.input) ? options.input : [options.input];

    const response = await this.ai.run(model, {
      text: inputs,
    });

    return {
      embeddings: response.data ?? [response.result ?? []],
      model,
      provider: this.provider,
      usage: {
        totalTokens: response.usage?.total_tokens ?? 0,
      },
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    try {
      // Simple health check: generate a tiny completion
      await this.ai.run(DEFAULT_CHAT_MODEL, {
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      });
      return { healthy: true, latencyMs: Date.now() - start };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
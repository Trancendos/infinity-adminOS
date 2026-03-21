/**
 * AICompletionPort — AI/LLM Abstraction
 * ═══════════════════════════════════════════════════════════════
 * Abstracts Workers AI, OpenAI, Anthropic, Groq, Mistral, etc.
 * Supports streaming, tool calling, and structured output.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string; // JSON string
}

export interface CompletionOptions {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
  tools?: ToolDefinition[];
  /** Force JSON output */
  responseFormat?: 'text' | 'json';
  /** Per-request timeout in ms */
  timeout?: number;
}

export interface CompletionResult {
  content: string;
  model: string;
  provider: string;
  toolCalls?: ToolCall[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: 'stop' | 'length' | 'tool_calls' | 'error';
  latencyMs: number;
}

export interface StreamChunk {
  content: string;
  done: boolean;
  toolCalls?: ToolCall[];
}

export interface EmbeddingOptions {
  model?: string;
  input: string | string[];
}

export interface EmbeddingResult {
  embeddings: number[][];
  model: string;
  provider: string;
  usage: {
    totalTokens: number;
  };
}

export interface AICompletionPort {
  readonly provider: string;

  /**
   * Generate a chat completion.
   */
  complete(options: CompletionOptions): Promise<CompletionResult>;

  /**
   * Generate a streaming chat completion.
   * Returns an async iterator of chunks.
   */
  stream(options: CompletionOptions): AsyncIterable<StreamChunk>;

  /**
   * Generate embeddings for text.
   */
  embed(options: EmbeddingOptions): Promise<EmbeddingResult>;

  /**
   * Check if the provider is available and healthy.
   */
  healthCheck(): Promise<{ healthy: boolean; latencyMs: number; error?: string }>;

  /**
   * List available models for this provider.
   */
  listModels?(): Promise<string[]>;
}
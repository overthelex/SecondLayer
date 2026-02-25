/**
 * LLM port interface and domain-owned LLM types.
 *
 * These types intentionally duplicate the shared-package Unified* types so
 * the domain layer does not depend on infrastructure.  Structural
 * compatibility with the shared types is maintained so that adapters are
 * trivial (often a no-op cast).
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

export type LLMProvider = 'openai' | 'anthropic';
export type BudgetLevel = 'quick' | 'standard' | 'deep';

// ---------------------------------------------------------------------------
// Message & tool types
// ---------------------------------------------------------------------------

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  /** JSON Schema describing the tool's parameters. */
  parameters: Record<string, unknown>;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: LLMToolCall[];
  /** Present when role === 'tool'. */
  tool_call_id?: string;
}

// ---------------------------------------------------------------------------
// Request / response
// ---------------------------------------------------------------------------

export interface LLMUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface LLMRequest {
  messages: LLMMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' | 'text' };
  tools?: LLMToolDefinition[];
  tool_choice?: 'auto' | 'none';
}

export interface LLMResponse {
  model: string;
  provider: LLMProvider;
  content: string;
  usage: LLMUsage;
  tool_calls?: LLMToolCall[];
  finish_reason: 'stop' | 'tool_calls';
}

export interface LLMStreamChunk {
  type: 'text_delta' | 'tool_call_delta' | 'usage' | 'done';
  text?: string;
  tool_call?: Partial<LLMToolCall> & { index?: number };
  usage?: LLMUsage;
  finish_reason?: 'stop' | 'tool_calls';
  tool_calls?: LLMToolCall[];
  model?: string;
  provider?: LLMProvider;
}

// ---------------------------------------------------------------------------
// Cost tracker (used by the LLM port for billing callbacks)
// ---------------------------------------------------------------------------

export interface ICostTracker {
  trackUsage(params: {
    model: string;
    provider: LLMProvider;
    prompt_tokens: number;
    completion_tokens: number;
    task: string;
  }): void;
}

// ---------------------------------------------------------------------------
// Port interface
// ---------------------------------------------------------------------------

export interface ILLMPort {
  /** Run a chat completion and return the full response. */
  chatCompletion(
    request: LLMRequest,
    budget?: BudgetLevel,
    preferredProvider?: LLMProvider,
  ): Promise<LLMResponse>;

  /** Stream a chat completion as an async generator. */
  chatCompletionStream(
    request: LLMRequest,
    budget?: BudgetLevel,
    preferredProvider?: LLMProvider,
    signal?: AbortSignal,
  ): AsyncGenerator<LLMStreamChunk>;

  /** Check whether a specific provider is configured and reachable. */
  isAvailable(provider: LLMProvider): boolean;

  /** Attach a cost tracker for automatic usage billing. */
  setCostTracker(tracker: ICostTracker): void;
}

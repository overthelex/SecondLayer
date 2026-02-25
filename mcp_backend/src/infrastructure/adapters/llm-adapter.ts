/**
 * Adapter that wraps the shared-package LLMClientManager behind ILLMPort.
 *
 * The shared package cannot depend on mcp_backend's domain ports, so we
 * adapt it here instead of adding `implements` directly to the class.
 */

import { LLMClientManager } from '@secondlayer/shared';
import type {
  ILLMPort,
  ICostTracker,
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  BudgetLevel,
  LLMProvider,
} from '../../domain/ports/index.js';

export class LLMAdapter implements ILLMPort {
  constructor(private readonly manager: LLMClientManager) {}

  async chatCompletion(
    request: LLMRequest,
    budget?: BudgetLevel,
    preferredProvider?: LLMProvider,
  ): Promise<LLMResponse> {
    // Structurally compatible — no mapping needed
    return this.manager.chatCompletion(request as any, budget, preferredProvider);
  }

  async *chatCompletionStream(
    request: LLMRequest,
    budget?: BudgetLevel,
    preferredProvider?: LLMProvider,
    signal?: AbortSignal,
  ): AsyncGenerator<LLMStreamChunk> {
    yield* this.manager.chatCompletionStream(
      request as any,
      budget,
      preferredProvider,
      signal,
    ) as AsyncGenerator<LLMStreamChunk>;
  }

  isAvailable(provider: LLMProvider): boolean {
    return this.manager.isProviderAvailable(provider);
  }

  setCostTracker(tracker: ICostTracker): void {
    this.manager.setCostTracker(tracker as any);
  }
}

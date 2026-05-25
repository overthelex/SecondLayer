import { AsyncLocalStorage } from 'async_hooks';
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
import type { ABTestingService } from '../../services/ab-testing-service.js';
import { logger } from '../../utils/logger.js';

const abUserContext = new AsyncLocalStorage<{ userId: string }>();

export function runWithABUser<T>(userId: string, fn: () => T): T {
  return abUserContext.run({ userId }, fn);
}

export class LLMAdapter implements ILLMPort {
  private abTestingService?: ABTestingService;

  constructor(private readonly manager: LLMClientManager) {}

  setABTestingService(service: ABTestingService): void {
    this.abTestingService = service;
    logger.info('A/B testing service wired to LLM adapter');
  }

  async chatCompletion(
    request: LLMRequest,
    budget?: BudgetLevel,
    preferredProvider?: LLMProvider,
  ): Promise<LLMResponse> {
    const userId = abUserContext.getStore()?.userId;
    if (this.abTestingService && userId && budget) {
      try {
        const override = await this.abTestingService.resolveModelForUser(userId, budget);
        if (override) {
          const callStart = Date.now();
          const result = await this.manager.chatCompletionWithModel(
            request as any,
            override.model,
            'bedrock',
          );
          const latencyMs = Date.now() - callStart;
          this.abTestingService.trackEvent({
            experimentId: override.experimentId,
            userId,
            variantName: override.variant,
            eventType: 'llm_call',
            eventData: {
              model: override.model,
              budget,
              tokens: (result as any).usage?.total_tokens,
              cost_usd: (result as any).usage
                ? estimateCost(override.model, (result as any).usage.prompt_tokens, (result as any).usage.completion_tokens)
                : undefined,
              latency_ms: latencyMs,
            },
          });
          return result as LLMResponse;
        }
      } catch (err: any) {
        logger.warn('A/B model override failed, falling back to default', { error: err.message });
      }
    }
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

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates: Record<string, [number, number]> = {
    'claude-haiku': [0.25 / 1e6, 1.25 / 1e6],
    'claude-sonnet-4-5': [3 / 1e6, 15 / 1e6],
    'claude-sonnet-4-6': [3 / 1e6, 15 / 1e6],
    'claude-opus': [15 / 1e6, 75 / 1e6],
  };
  const key = Object.keys(rates).find(k => model.includes(k)) ?? 'claude-sonnet-4-6';
  const [inRate, outRate] = rates[key];
  return inputTokens * inRate + outputTokens * outRate;
}

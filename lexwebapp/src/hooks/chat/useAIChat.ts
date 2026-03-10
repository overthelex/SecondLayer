/**
 * useAIChat Hook
 * Calls the agentic /api/chat endpoint with SSE streaming.
 * Supports two-phase flow: plan review -> approved execution.
 *
 * Composed from:
 *   - useAIChatStream — SSE streaming, evidence accumulation, thinking steps
 *   - useAIChatPlan   — plan request / confirm / skip flow
 */

import { useAIChatStream } from './useAIChatStream';
import { useAIChatPlan } from './useAIChatPlan';

export interface UseAIChatOptions {
  onSuccess?: (result: unknown) => void;
  onError?: (error: Error) => void;
}

export function useAIChat(options: UseAIChatOptions = {}) {
  const { onSuccess, onError } = options;

  const { runChatStream } = useAIChatStream({ onSuccess, onError });
  const { executeChat, confirmPlanAndExecute, skipPlanReview } = useAIChatPlan({
    runChatStream,
    onError,
  });

  return { executeChat, confirmPlanAndExecute, skipPlanReview };
}

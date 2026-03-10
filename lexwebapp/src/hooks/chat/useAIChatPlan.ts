/**
 * useAIChatPlan Hook
 * Plan review flow: request plan, pending state, approval/rejection, skip.
 * Extracted from useAIChat to keep each hook focused.
 */

import { useCallback } from 'react';
import { useChatStore } from '../../stores';
import { mcpService } from '../../services';
import type { ExecutionPlan } from '../../types/models/Message';
import { handleCatchError } from './chat-error-utils';

export interface UseAIChatPlanOptions {
  runChatStream: (
    query: string,
    assistantMessageId: string,
    approvedPlan?: ExecutionPlan,
    planSessionId?: string
  ) => Promise<void>;
  onError?: (error: Error) => void;
}

export function useAIChatPlan(options: UseAIChatPlanOptions) {
  const {
    addMessage,
    updateMessage,
    setStreaming,
    setCurrentTool,
    setPendingPlanReview,
    setIsPlanLoading,
  } = useChatStore();

  const { runChatStream, onError } = options;

  /**
   * Phase 1: Request plan for user review, then pause.
   */
  const executeChat = useCallback(
    async (query: string, _documentIds?: string[]) => {
      const userMessage = {
        id: Date.now().toString(),
        role: 'user' as const,
        content: query,
      };
      addMessage(userMessage);

      const state = useChatStore.getState();
      if (!state.conversationId && localStorage.getItem('auth_token')) {
        const title = query.slice(0, 60).trim() || undefined;
        await state.createConversation(title);
      }
      // Server-side persistence handles saving user messages
      // (chat-service.ts saves both user and assistant messages)

      const assistantMessageId = (Date.now() + 1).toString();
      addMessage({
        id: assistantMessageId,
        role: 'assistant' as const,
        content: '',
        isStreaming: true,
        thinkingSteps: [],
      });

      setIsPlanLoading(true);
      try {
        const planResult = await mcpService.requestPlan(query, 'standard');

        if (planResult.plan && planResult.planSessionId) {
          setIsPlanLoading(false);
          updateMessage(assistantMessageId, { isStreaming: false });
          setPendingPlanReview({
            plan: planResult.plan,
            planSessionId: planResult.planSessionId,
            query,
            assistantMessageId,
          });
          return;
        }
      } catch (err) {
        console.warn('[AIChat] Plan request failed, falling through to direct execution', err);
      }

      // No plan or plan failed -> direct execution
      setIsPlanLoading(false);
      setStreaming(true);
      setCurrentTool('ai_chat');

      try {
        await runChatStream(query, assistantMessageId);
      } catch (error: unknown) {
        handleCatchError(assistantMessageId, error, {
          updateMessage, setStreaming, setCurrentTool, onError,
        });
      }
    },
    [addMessage, updateMessage, setStreaming, setCurrentTool, setIsPlanLoading, setPendingPlanReview, runChatStream, onError]
  );

  /**
   * Phase 2: User confirmed the plan with depth choices -> execute.
   */
  const confirmPlanAndExecute = useCallback(
    async (approvedPlan: ExecutionPlan) => {
      const pending = useChatStore.getState().pendingPlanReview;
      if (!pending) return;

      const { query, assistantMessageId, planSessionId } = pending;

      setPendingPlanReview(null);
      updateMessage(assistantMessageId, { isStreaming: true, content: '' });
      setStreaming(true);
      setCurrentTool('ai_chat');

      try {
        await runChatStream(query, assistantMessageId, approvedPlan, planSessionId);
      } catch (error: unknown) {
        handleCatchError(assistantMessageId, error, {
          updateMessage, setStreaming, setCurrentTool, onError,
        });
      }
    },
    [updateMessage, setStreaming, setCurrentTool, setPendingPlanReview, runChatStream, onError]
  );

  /**
   * Skip plan review -> execute with default depths.
   */
  const skipPlanReview = useCallback(
    async () => {
      const pending = useChatStore.getState().pendingPlanReview;
      if (!pending) return;

      const { query, assistantMessageId } = pending;

      setPendingPlanReview(null);
      updateMessage(assistantMessageId, { isStreaming: true, content: '' });
      setStreaming(true);
      setCurrentTool('ai_chat');

      try {
        await runChatStream(query, assistantMessageId);
      } catch (error: unknown) {
        handleCatchError(assistantMessageId, error, {
          updateMessage, setStreaming, setCurrentTool, onError,
        });
      }
    },
    [updateMessage, setStreaming, setCurrentTool, setPendingPlanReview, runChatStream, onError]
  );

  return { executeChat, confirmPlanAndExecute, skipPlanReview };
}

/**
 * useAIChatExecute Hook
 * Starts a chat turn and streams the answer directly.
 *
 * The previous two-phase plan-review flow (request plan → show depth dialog →
 * confirm/skip → execute) was removed. Analysis depth (standard/deep) is now
 * decided automatically inside the secondlayer-core pipeline, so the chat runs
 * straight through without an intermediate confirmation dialog.
 */

import { useCallback } from 'react';
import { useChatStore } from '../../stores';
import type { ExecutionPlan } from '../../types/models/Message';
import { handleCatchError } from './chat-error-utils';

export interface UseAIChatPlanOptions {
  runChatStream: (
    query: string,
    assistantMessageId: string,
    approvedPlan?: ExecutionPlan,
    planSessionId?: string,
    allowDeepEscalation?: boolean
  ) => Promise<void>;
  onError?: (error: Error) => void;
}

export function useAIChatPlan(options: UseAIChatPlanOptions) {
  const {
    addMessage,
    updateMessage,
    setStreaming,
    setCurrentTool,
  } = useChatStore();

  const { runChatStream, onError } = options;

  const executeChat = useCallback(
    async (query: string, _documentIds?: string[], allowDeepEscalation?: boolean) => {
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

      setStreaming(true);
      setCurrentTool('ai_chat');

      try {
        await runChatStream(query, assistantMessageId, undefined, undefined, allowDeepEscalation);
      } catch (error: unknown) {
        handleCatchError(assistantMessageId, error, {
          updateMessage, setStreaming, setCurrentTool, onError,
        });
      }
    },
    [addMessage, updateMessage, setStreaming, setCurrentTool, runChatStream, onError]
  );

  return { executeChat };
}

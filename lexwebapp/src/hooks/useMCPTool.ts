/**
 * useMCPTool Hook
 * Shared hook for calling any MCP tool with streaming support.
 * Used by ChatPage for manual tool mode.
 *
 * Re-exports useAIChat for backward compatibility.
 */

import { useCallback } from 'react';
import { useChatStore } from '../stores';
import { useSettingsStore } from '../stores';
import { mcpService } from '../services';
import showToast from '../utils/toast';
import { getErrorMessage } from '../utils/errors';
import { buildContextualQuery } from './chat/chat-helpers';

// Re-export useAIChat so existing imports from './useMCPTool' keep working
export { useAIChat } from './chat/useAIChat';
export type { UseAIChatOptions } from './chat/useAIChat';

// Re-export shared utilities for consumers
export { getToolLabel, TOOL_LABELS } from './chat/tool-labels';
export { extractEvidenceFromToolResult } from './chat/evidence-extractor';

export interface UseMCPToolOptions {
  enableStreaming?: boolean;
  onSuccess?: (result: any) => void;
  onError?: (error: Error) => void;
}

export function useMCPTool(
  toolName: string,
  options: UseMCPToolOptions = {}
) {
  const {
    addMessage,
    updateMessage,
    addThinkingStep,
    setStreaming,
    setStreamController,
    setCurrentTool,
  } = useChatStore();

  const { maxPrecedents } = useSettingsStore();

  const { enableStreaming = true, onSuccess, onError } = options;

  const executeTool = useCallback(
    async (params: any) => {
      // 1. Add user message
      const userMessage = {
        id: Date.now().toString(),
        role: 'user' as const,
        content:
          typeof params === 'string'
            ? params
            : params.query || JSON.stringify(params, null, 2),
      };
      addMessage(userMessage);

      // 2. Auto-create conversation if needed (for persistence)
      const state = useChatStore.getState();
      if (!state.conversationId && localStorage.getItem('auth_token')) {
        await state.createConversation();
      }
      // Sync user message to server
      useChatStore.getState().syncMessage(userMessage);

      // 3. Build contextual query from prior messages
      const currentMessages = useChatStore.getState().messages;
      const priorMessages = currentMessages.slice(0, -1);
      let toolParams = typeof params === 'string' ? { query: params } : { ...params };
      if (priorMessages.length >= 2 && typeof toolParams.query === 'string') {
        toolParams.query = buildContextualQuery(toolParams.query, priorMessages);
      }

      // 4. Create placeholder for assistant message
      const assistantMessageId = (Date.now() + 1).toString();
      const assistantMessage = {
        id: assistantMessageId,
        role: 'assistant' as const,
        content: '',
        isStreaming: true,
        thinkingSteps: [],
      };
      addMessage(assistantMessage);
      setStreaming(true);
      setCurrentTool(toolName);

      try {
        if (enableStreaming) {
          // Streaming mode
          const controller = await mcpService.streamTool(toolName, toolParams, {
            onConnected: (data) => {
              console.log('SSE connected:', data);
            },

            onProgress: (data) => {
              const step = {
                id: `step-${data.step}`,
                title: `${data.action}: ${data.message}`,
                content: data.result
                  ? JSON.stringify(data.result, null, 2)
                  : '',
                isComplete: !!data.result,
              };
              addThinkingStep(assistantMessageId, step);
            },

            onComplete: (data) => {
              const finalMessage = mcpService.transformToolResultToMessage(
                toolName,
                data
              );

              updateMessage(assistantMessageId, {
                content: finalMessage.content,
                isStreaming: false,
                decisions: finalMessage.decisions,
                citations: finalMessage.citations,
                thinkingSteps: finalMessage.thinkingSteps,
              });

              setStreaming(false);
              setStreamController(null);
              setCurrentTool(null);

              // Sync assistant message to server
              const completedState = useChatStore.getState();
              const completedMsg = completedState.messages.find(
                (m) => m.id === assistantMessageId
              );
              if (completedMsg) {
                completedState.syncMessage(completedMsg);
              }

              // Auto-title on first exchange
              if (completedState.conversationId && completedState.messages.length <= 3) {
                const firstUserMsg = completedState.messages.find((m) => m.role === 'user');
                if (firstUserMsg) {
                  const title = firstUserMsg.content.slice(0, 60).trim();
                  completedState.renameConversation(completedState.conversationId, title);
                }
              }

              onSuccess?.(data);
            },

            onError: (error) => {
              updateMessage(assistantMessageId, {
                content: `Помилка: ${error.message}`,
                isStreaming: false,
              });
              setStreaming(false);
              setStreamController(null);
              setCurrentTool(null);
              showToast.error(error.message);

              onError?.(new Error(error.message));
            },

            onEnd: () => {
              console.log('SSE stream ended');
            },
          });

          setStreamController(controller);
        } else {
          // Synchronous mode (fallback)
          const result = await mcpService.callTool(toolName, toolParams);
          const finalMessage = mcpService.transformToolResultToMessage(
            toolName,
            result
          );

          updateMessage(assistantMessageId, {
            ...finalMessage,
            id: assistantMessageId,
            isStreaming: false,
          });

          setStreaming(false);
          setCurrentTool(null);

          // Sync assistant message to server
          const completedState = useChatStore.getState();
          const completedMsg = completedState.messages.find(
            (m) => m.id === assistantMessageId
          );
          if (completedMsg) {
            completedState.syncMessage(completedMsg);
          }

          // Auto-title on first exchange
          if (completedState.conversationId && completedState.messages.length <= 3) {
            const firstUserMsg = completedState.messages.find((m) => m.role === 'user');
            if (firstUserMsg) {
              const title = firstUserMsg.content.slice(0, 60).trim();
              completedState.renameConversation(completedState.conversationId, title);
            }
          }

          onSuccess?.(result);
        }
      } catch (error: unknown) {
        const msg = getErrorMessage(error);
        updateMessage(assistantMessageId, {
          content: `Помилка: ${msg}`,
          isStreaming: false,
        });
        setStreaming(false);
        setCurrentTool(null);
        showToast.error(msg);

        onError?.(error instanceof Error ? error : new Error(msg));
      }
    },
    [
      toolName,
      enableStreaming,
      addMessage,
      updateMessage,
      addThinkingStep,
      setStreaming,
      setStreamController,
      setCurrentTool,
      maxPrecedents,
      onSuccess,
      onError,
    ]
  );

  return { executeTool };
}

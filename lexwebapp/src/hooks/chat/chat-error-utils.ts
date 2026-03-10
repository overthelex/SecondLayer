/**
 * Shared error handling and conversation utilities for chat hooks.
 * Extracted from useAIChat and useMCPTool to eliminate duplication.
 */

import { useChatStore } from '../../stores';
import showToast from '../../utils/toast';
import { getErrorMessage } from '../../utils/errors';

/**
 * Handles stream/tool errors: updates the message, resets streaming state,
 * shows a toast, and invokes the optional onError callback.
 */
export function handleStreamError(
  assistantMessageId: string,
  error: { message: string },
  deps: {
    updateMessage: ReturnType<typeof useChatStore.getState>['updateMessage'];
    setStreaming: ReturnType<typeof useChatStore.getState>['setStreaming'];
    setStreamController: ReturnType<typeof useChatStore.getState>['setStreamController'];
    setCurrentTool: ReturnType<typeof useChatStore.getState>['setCurrentTool'];
    onError?: (error: Error) => void;
  }
) {
  const { updateMessage, setStreaming, setStreamController, setCurrentTool, onError } = deps;

  updateMessage(assistantMessageId, {
    content: `Помилка: ${error.message}`,
    isStreaming: false,
  });
  setStreaming(false);
  setStreamController(null);
  setCurrentTool(null);
  showToast.error(error.message);

  onError?.(new Error(error.message));
}

/**
 * Handles catch-block errors (unknown type): extracts message,
 * then delegates to handleStreamError.
 *
 * Note: setStreamController is not called here because catch blocks
 * in the original code did not reset it (the controller was never set
 * when these errors occur). We still accept it for consistency.
 */
export function handleCatchError(
  assistantMessageId: string,
  error: unknown,
  deps: {
    updateMessage: ReturnType<typeof useChatStore.getState>['updateMessage'];
    setStreaming: ReturnType<typeof useChatStore.getState>['setStreaming'];
    setCurrentTool: ReturnType<typeof useChatStore.getState>['setCurrentTool'];
    onError?: (error: Error) => void;
  }
) {
  const msg = getErrorMessage(error);
  const { updateMessage, setStreaming, setCurrentTool, onError } = deps;

  updateMessage(assistantMessageId, {
    content: `Помилка: ${msg}`,
    isStreaming: false,
  });
  setStreaming(false);
  setCurrentTool(null);
  showToast.error(msg);

  onError?.(error instanceof Error ? error : new Error(msg));
}

/**
 * Auto-rename a conversation to the first user message content
 * if the conversation still has the default title.
 *
 * @param opts.maxMessages - When set, only auto-title if message count
 *   is at most this value (used by useMCPTool for first-exchange guard).
 */
export function autoTitleConversation(opts?: { maxMessages?: number }) {
  const state = useChatStore.getState();
  if (!state.conversationId) return;

  if (opts?.maxMessages != null && state.messages.length > opts.maxMessages) {
    return;
  }

  const conv = state.conversations.find(
    (c) => c.id === state.conversationId
  );
  const needsRename =
    !conv || conv.title === 'New conversation' || conv.title === 'Нова розмова';

  if (needsRename) {
    const firstUserMsg = state.messages.find((m) => m.role === 'user');
    if (firstUserMsg) {
      const title = firstUserMsg.content.slice(0, 60).trim();
      state.renameConversation(state.conversationId!, title);
    }
  }
}

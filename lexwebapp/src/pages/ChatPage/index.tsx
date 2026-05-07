/**
 * Chat Page
 * Main chat interface with message thread and input
 * Now using MCP streaming with all 43 tools support
 */

import { useCallback, useEffect, useRef } from 'react';
import { ChatInput } from '../../components/ChatInput';
import { MessageThread } from '../../components/MessageThread';
import { EmptyState } from '../../components/EmptyState';
import { PlanReviewDisplay } from '../../components/PlanReviewDisplay';
import { useChatStore, useSettingsStore } from '../../stores';
import { useAIChat } from '../../hooks/useMCPTool';
import showToast from '../../utils/toast';
import { getErrorMessage } from '../../utils/errors';

export function ChatPage() {
  const internetEnabled = useSettingsStore(s => s.internetEnabled);

  // Zustand stores — individual selectors to avoid full-store re-renders
  const messages = useChatStore(s => s.messages);
  const isStreaming = useChatStore(s => s.isStreaming);
  const pendingPlanReview = useChatStore(s => s.pendingPlanReview);
  const isPlanLoading = useChatStore(s => s.isPlanLoading);
  const cancelStream = useChatStore(s => s.cancelStream);
  const removeMessage = useChatStore(s => s.removeMessage);
  const queuedQuery = useChatStore(s => s.queuedQuery);
  const setQueuedQuery = useChatStore(s => s.setQueuedQuery);

  // AI Chat hook (agentic mode)
  const { executeChat, confirmPlanAndExecute, skipPlanReview } = useAIChat();

  const handleSend = async (content: string, _toolName?: string, documentIds?: string[]) => {
    // If streaming is active, queue the message for execution after current stream ends
    if (isStreaming || isPlanLoading) {
      setQueuedQuery({ content, documentIds });
      return;
    }
    try {
      await executeChat(content, documentIds, undefined, internetEnabled);
    } catch (error: unknown) {
      console.error('Chat execution error:', error);
      showToast.error(getErrorMessage(error));
    }
  };

  // Auto-execute queued query when streaming ends
  const executingQueueRef = useRef(false);
  useEffect(() => {
    if (!isStreaming && !isPlanLoading && queuedQuery && !executingQueueRef.current) {
      executingQueueRef.current = true;
      const { content, documentIds } = queuedQuery;
      setQueuedQuery(null);
      executeChat(content, documentIds, undefined, internetEnabled)
        .catch((error: unknown) => {
          console.error('Queued chat execution error:', error);
          showToast.error(getErrorMessage(error));
        })
        .finally(() => {
          executingQueueRef.current = false;
        });
    }
  }, [isStreaming, isPlanLoading, queuedQuery, setQueuedQuery, executeChat, internetEnabled]);

  const handleRegenerate = useCallback((userQuery: string) => {
    // Find the last assistant message and remove it
    const msgs = useChatStore.getState().messages;
    const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant');
    if (lastAssistant) {
      removeMessage(lastAssistant.id);
    }
    // Also remove the user message that triggered it
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
    if (lastUser) {
      removeMessage(lastUser.id);
    }
    // Re-send the query
    handleSend(userQuery);
  }, [removeMessage, internetEnabled]);

  const handleEdit = useCallback((messageId: string, newContent: string) => {
    // Remove the edited message and all messages after it, then re-send
    const msgs = useChatStore.getState().messages;
    const idx = msgs.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    // Remove from the edited message onwards
    msgs.slice(idx).forEach((m) => removeMessage(m.id));
    handleSend(newContent);
  }, [removeMessage, internetEnabled]);

  return (
    <>
      {messages.length === 0 ? (
        <EmptyState onSelectPrompt={handleSend} />
      ) : (
        <MessageThread messages={messages} onRegenerate={handleRegenerate} onEdit={handleEdit} />
      )}

      {/* Plan review questionnaire — shown between messages and input */}
      {pendingPlanReview && (
        <div className="w-full max-w-3xl mx-auto px-4">
          <PlanReviewDisplay
            plan={pendingPlanReview.plan}
            onConfirm={confirmPlanAndExecute}
            onSkip={skipPlanReview}
            isLoading={isStreaming}
          />
        </div>
      )}

      <div className="w-full bg-claude-bg pt-3 pb-5 z-20 border-t border-claude-border/60">
        <ChatInput
          onSend={handleSend}
          disabled={!!pendingPlanReview}
          isStreaming={isStreaming || isPlanLoading}
          hasQueuedQuery={!!queuedQuery}
          onCancel={cancelStream}
        />
        <p className="text-center text-[11px] text-zinc-400 mt-2.5 font-sans">
          Lex може допускати помилки. Перевіряйте важливу інформацію.
        </p>
      </div>
    </>
  );
}

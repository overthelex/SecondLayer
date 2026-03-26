/**
 * Chat Page
 * Main chat interface with message thread and input
 * Now using MCP streaming with all 43 tools support
 */

import { useCallback } from 'react';
import { TrendingUp } from 'lucide-react';
import { ChatInput } from '../../components/ChatInput';
import { MessageThread } from '../../components/MessageThread';
import { EmptyState } from '../../components/EmptyState';
import { PlanReviewDisplay } from '../../components/PlanReviewDisplay';
import { useCurrencyRate } from '../../hooks/useCurrencyRate';
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
  const pendingBudgetEscalation = useChatStore(s => s.pendingBudgetEscalation);
  const setPendingBudgetEscalation = useChatStore(s => s.setPendingBudgetEscalation);

  // AI Chat hook (agentic mode)
  const { executeChat, confirmPlanAndExecute, skipPlanReview } = useAIChat();
  const { formatUah } = useCurrencyRate();

  const handleConfirmDeepBudget = useCallback(() => {
    const esc = useChatStore.getState().pendingBudgetEscalation;
    if (!esc) return;
    setPendingBudgetEscalation(null);
    // Re-send the same query with allowDeepEscalation
    executeChat(esc.query, undefined, true, internetEnabled);
  }, [executeChat, setPendingBudgetEscalation, internetEnabled]);

  const handleSkipDeepBudget = useCallback(() => {
    setPendingBudgetEscalation(null);
  }, [setPendingBudgetEscalation]);

  const handleSend = async (content: string, _toolName?: string, documentIds?: string[]) => {
    try {
      await executeChat(content, documentIds, undefined, internetEnabled);
    } catch (error: unknown) {
      console.error('Chat execution error:', error);
      showToast.error(getErrorMessage(error));
    }
  };

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

      {/* Budget escalation confirmation */}
      {pendingBudgetEscalation && (
        <div className="w-full max-w-3xl mx-auto px-4 mb-3">
          <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <TrendingUp size={20} className="text-amber-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900">
                Рекомендовано глибокий аналіз
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Орієнтовна вартість: {formatUah(pendingBudgetEscalation.estimatedCostMin)}–{formatUah(pendingBudgetEscalation.estimatedCostMax)}
              </p>
            </div>
            <button
              onClick={handleSkipDeepBudget}
              className="px-3 py-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 transition-colors"
            >
              Залишити стандартний
            </button>
            <button
              onClick={handleConfirmDeepBudget}
              className="px-4 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
            >
              Глибокий аналіз
            </button>
          </div>
        </div>
      )}

      <div className="w-full bg-claude-bg pt-3 pb-5 z-20 border-t border-claude-border/60">
        <ChatInput
          onSend={handleSend}
          disabled={isStreaming || isPlanLoading || !!pendingPlanReview}
          isStreaming={isStreaming || isPlanLoading}
          onCancel={cancelStream}
        />
        <p className="text-center text-[11px] text-zinc-400 mt-2.5 font-sans">
          Lex може допускати помилки. Перевіряйте важливу інформацію.
        </p>
      </div>
    </>
  );
}

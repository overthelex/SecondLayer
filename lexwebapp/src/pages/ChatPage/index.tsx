/**
 * Chat Page
 * Main chat interface with message thread and input
 * Now using MCP streaming with all 43 tools support
 */

import { useState, useCallback } from 'react';
import { TrendingUp } from 'lucide-react';
import { ChatInput } from '../../components/ChatInput';
import { MessageThread } from '../../components/MessageThread';
import { EmptyState } from '../../components/EmptyState';
import { PlanReviewDisplay } from '../../components/PlanReviewDisplay';
import { useCurrencyRate } from '../../hooks/useCurrencyRate';
import { useChatStore } from '../../stores';
import { useMCPTool, useAIChat } from '../../hooks/useMCPTool';
import { AI_CHAT_MODE } from '../../hooks/chat/tool-categories';
import showToast from '../../utils/toast';
import { getErrorMessage } from '../../utils/errors';

export function ChatPage() {
  const [selectedTool, setSelectedTool] = useState(AI_CHAT_MODE);

  // Zustand stores — individual selectors to avoid full-store re-renders
  const messages = useChatStore(s => s.messages);
  const isStreaming = useChatStore(s => s.isStreaming);
  const pendingPlanReview = useChatStore(s => s.pendingPlanReview);
  const isPlanLoading = useChatStore(s => s.isPlanLoading);
  const cancelStream = useChatStore(s => s.cancelStream);
  const removeMessage = useChatStore(s => s.removeMessage);
  const pendingBudgetEscalation = useChatStore(s => s.pendingBudgetEscalation);
  const setPendingBudgetEscalation = useChatStore(s => s.setPendingBudgetEscalation);

  // MCP Tool hook (for manual tool mode)
  const { executeTool } = useMCPTool(selectedTool === AI_CHAT_MODE ? 'search_legal_precedents' : selectedTool, {
    enableStreaming: import.meta.env.VITE_ENABLE_SSE_STREAMING !== 'false',
  });

  // AI Chat hook (agentic mode)
  const { executeChat, confirmPlanAndExecute, skipPlanReview } = useAIChat();
  const { formatUah } = useCurrencyRate();

  const handleConfirmDeepBudget = useCallback(() => {
    const esc = useChatStore.getState().pendingBudgetEscalation;
    if (!esc) return;
    setPendingBudgetEscalation(null);
    // Re-send the same query with allowDeepEscalation
    executeChat(esc.query, undefined, true);
  }, [executeChat, setPendingBudgetEscalation]);

  const handleSkipDeepBudget = useCallback(() => {
    setPendingBudgetEscalation(null);
  }, [setPendingBudgetEscalation]);

  /**
   * Parse content to tool-specific parameters
   */
  const parseContentToToolParams = (toolName: string, content: string, documentIds?: string[]): any => {
    const base: any = {};
    if (documentIds && documentIds.length > 0) {
      base.document_ids = documentIds;
    }

    switch (toolName) {
      case 'search_legal_precedents':
        return {
          ...base,
          query: content,
          limit: 10,
        };

      case 'search_legislation':
        return {
          ...base,
          query: content,
          limit: 5,
        };

      case 'classify_intent':
        return {
          ...base,
          query: content,
        };

      case 'rada_get_deputy_info':
        return {
          ...base,
          query: content,
          limit: 10,
        };

      case 'openreyestr_search_entities':
        return {
          ...base,
          query: content,
          entity_type: 'all',
          limit: 10,
        };

      default:
        // Generic fallback
        return { ...base, query: content };
    }
  };

  const handleSend = async (content: string, toolName?: string, documentIds?: string[]) => {
    const tool = toolName || selectedTool;

    try {
      if (tool === AI_CHAT_MODE) {
        // AI Chat mode — agentic LLM loop
        await executeChat(content, documentIds);
      } else {
        // Manual tool mode — direct tool call
        const params = parseContentToToolParams(tool, content, documentIds);
        await executeTool(params);
      }
    } catch (error: unknown) {
      console.error('MCP tool execution error:', error);
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
  }, [selectedTool, removeMessage]);

  const handleEdit = useCallback((messageId: string, newContent: string) => {
    // Remove the edited message and all messages after it, then re-send
    const msgs = useChatStore.getState().messages;
    const idx = msgs.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    // Remove from the edited message onwards
    msgs.slice(idx).forEach((m) => removeMessage(m.id));
    handleSend(newContent);
  }, [selectedTool, removeMessage]);

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
          selectedTool={selectedTool}
          onToolChange={setSelectedTool}
        />
        <p className="text-center text-[11px] text-zinc-400 mt-2.5 font-sans">
          Lex може допускати помилки. Перевіряйте важливу інформацію.
        </p>
      </div>
    </>
  );
}

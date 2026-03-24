/**
 * useAIChatStream Hook
 * SSE streaming logic, evidence accumulation, thinking steps, delta message updates.
 * Extracted from useAIChat to keep each hook focused.
 */

import { useCallback, useRef } from 'react';
import { useChatStore } from '../../stores';
import { mcpService } from '../../services';
import showToast from '../../utils/toast';
import { toastTDynamic } from '../../i18n/toast-i18n';
import type { Decision, Citation, VaultDocument, ExecutionPlan, CostSummary } from '../../types/models/Message';
import { getToolLabel } from './tool-labels';
import { extractEvidenceFromToolResult } from './evidence-extractor';
import { extractNormsFromAnswer } from './chat-helpers';
import { useCurrencyRate } from '../useCurrencyRate';
import { handleStreamError, autoTitleConversation } from './chat-error-utils';

export interface UseAIChatStreamOptions {
  onSuccess?: (result: unknown) => void;
  onError?: (error: Error) => void;
}

export function useAIChatStream(options: UseAIChatStreamOptions = {}) {
  const {
    updateMessage,
    addThinkingStep,
    setStreaming,
    setStreamController,
    setCurrentTool,
  } = useChatStore();

  const { onSuccess, onError } = options;
  const { formatUah } = useCurrencyRate();

  // Accumulate evidence across multiple tool calls in one chat session
  const accumulatedDecisions = useRef<Decision[]>([]);
  const accumulatedCitations = useRef<Citation[]>([]);
  const accumulatedDocuments = useRef<VaultDocument[]>([]);
  const contentRef = useRef('');
  const planRef = useRef<ExecutionPlan | null>(null);
  const costSummaryRef = useRef<Partial<CostSummary>>({});
  const responseIdRef = useRef<string | null>(null);
  const rafPendingRef = useRef<number | null>(null);

  /**
   * Run the SSE chat stream (shared between direct and approved-plan flows).
   */
  const runChatStream = useCallback(
    async (
      query: string,
      assistantMessageId: string,
      approvedPlan?: ExecutionPlan,
      planSessionId?: string
    ) => {
      // Reset accumulators
      accumulatedDecisions.current = [];
      accumulatedCitations.current = [];
      accumulatedDocuments.current = [];
      contentRef.current = '';
      planRef.current = null;
      costSummaryRef.current = {};
      responseIdRef.current = null;

      // Build full conversation history — backend handles compression via ChatContextBuilder
      const currentMessages = useChatStore.getState().messages;
      const history = currentMessages
        .filter((m) => m.id !== assistantMessageId && (m.role === 'user' || m.role === 'assistant'))
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }));

      const chatConversationId = useChatStore.getState().conversationId || undefined;

      const controller = await mcpService.streamChat(query, history, {
        onResponseId: (data) => {
          responseIdRef.current = data.response_id;
        },

        onPlan: (data) => {
          const plan: ExecutionPlan = {
            goal: data.goal,
            steps: data.steps.map((s) => ({ ...s, completed: false })),
            expected_iterations: data.expected_iterations,
          };
          planRef.current = plan;
          updateMessage(assistantMessageId, { executionPlan: plan });

          const planSummary = data.steps
            .map((s) => `${s.id}. ${s.purpose}`)
            .join('\n');
          addThinkingStep(assistantMessageId, {
            id: 'plan',
            title: `Стратегія: ${data.goal}`,
            content: planSummary,
            isComplete: true,
          });
        },

        onBudgetEscalated: (data) => {
          showToast.info(
            toastTDynamic('budgetEscalated', formatUah(data.estimatedCost.minUsd), formatUah(data.estimatedCost.maxUsd)),
            6000
          );
        },

        onThinking: (data) => {
          // Flush any pending RAF before clearing — prevents race condition
          // where accumulated answer_delta text gets wiped before RAF commits it
          if (rafPendingRef.current) {
            cancelAnimationFrame(rafPendingRef.current);
            rafPendingRef.current = null;
            if (contentRef.current) {
              updateMessage(assistantMessageId, { content: contentRef.current });
            }
          }
          contentRef.current = '';

          if (planRef.current) {
            const matchingStep = planRef.current.steps.find((s) => s.tool === data.tool);
            if (matchingStep && !matchingStep.completed) {
              matchingStep.completed = true;
              updateMessage(assistantMessageId, {
                executionPlan: { ...planRef.current, steps: [...planRef.current.steps] },
              });
            }
          }

          const costSuffix = data.cost_usd ? ` · ${formatUah(data.cost_usd)}` : '';
          addThinkingStep(assistantMessageId, {
            id: `step-${data.step}`,
            title: (data.description || `${getToolLabel(data.tool)}`) + costSuffix,
            content: JSON.stringify(data.params, null, 2),
            isComplete: false,
          });
        },

        onToolResult: (data) => {
          const toolPreview = typeof data.result === 'string'
            ? data.result
            : JSON.stringify(data.result, null, 2);

          const costSuffix = data.cost_usd ? ` · ${formatUah(data.cost_usd)}` : '';
          addThinkingStep(assistantMessageId, {
            id: `result-${data.tool}`,
            title: `${getToolLabel(data.tool)}` + costSuffix,
            content: toolPreview,
            isComplete: true,
          });

          // Use server-side evidence if available, fall back to client-side extraction
          const evidence = data.evidence || extractEvidenceFromToolResult(data.tool, data.result);
          console.log('[AIChat] Evidence extraction', {
            tool: data.tool,
            decisions: evidence.decisions.length,
            citations: evidence.citations.length,
            documents: evidence.documents.length,
            source: data.evidence ? 'server' : 'client',
          });
          if (evidence.decisions.length > 0) {
            accumulatedDecisions.current.push(...evidence.decisions);
          }
          if (evidence.citations.length > 0) {
            accumulatedCitations.current.push(...evidence.citations);
          }
          if (evidence.documents.length > 0) {
            accumulatedDocuments.current.push(...evidence.documents);
          }

          if (accumulatedDecisions.current.length > 0 || accumulatedCitations.current.length > 0 || accumulatedDocuments.current.length > 0) {
            updateMessage(assistantMessageId, {
              decisions: [...accumulatedDecisions.current],
              citations: [...accumulatedCitations.current],
              documents: [...accumulatedDocuments.current],
            });
          }
        },

        onAnswerDelta: (data) => {
          contentRef.current += data.text;
          if (!rafPendingRef.current) {
            rafPendingRef.current = requestAnimationFrame(() => {
              updateMessage(assistantMessageId, { content: contentRef.current });
              rafPendingRef.current = null;
            });
          }
        },

        onAnswer: (data) => {
          // Flush any pending RAF before final answer
          if (rafPendingRef.current) {
            cancelAnimationFrame(rafPendingRef.current);
            rafPendingRef.current = null;
          }
          contentRef.current = data.text;

          // Use server-side norms if available, fall back to client-side extraction
          const answerNorms = data.norms || extractNormsFromAnswer(data.text);
          if (answerNorms.length > 0) {
            const existingSources = new Set(
              accumulatedCitations.current.map(c => c.source.toLowerCase().replace(/\s+/g, ' ').trim())
            );
            const newNorms = answerNorms.filter(n => {
              const key = n.source.toLowerCase().replace(/\s+/g, ' ').trim();
              return !existingSources.has(key);
            });
            if (newNorms.length > 0) {
              accumulatedCitations.current.push(...newNorms);
            }
          }

          updateMessage(assistantMessageId, {
            content: data.text,
            isStreaming: false,
            decisions: accumulatedDecisions.current.length > 0
              ? [...accumulatedDecisions.current]
              : undefined,
            citations: accumulatedCitations.current.length > 0
              ? [...accumulatedCitations.current]
              : undefined,
            documents: accumulatedDocuments.current.length > 0
              ? [...accumulatedDocuments.current]
              : undefined,
            metadata: (data as { workflowSetId?: string }).workflowSetId
              ? { workflowSetId: (data as { workflowSetId?: string }).workflowSetId }
              : undefined,
          });

          setStreaming(false);
          setStreamController(null);
          setCurrentTool(null);

          // Server-side persistence handles saving assistant messages
          // (chat-service.ts saves with full tool_calls/cost_summary data)

          // Auto-rename conversation if it still has the default title
          autoTitleConversation();

          onSuccess?.(data);
        },

        onEvidenceUpdate: (data) => {
          // Server sends cumulative deduplicated evidence — use directly
          updateMessage(assistantMessageId, {
            decisions: data.decisions.length > 0 ? data.decisions : undefined,
            citations: data.citations.length > 0 ? data.citations : undefined,
            documents: data.documents.length > 0 ? data.documents : undefined,
          });
          // Sync refs to keep local accumulators in sync
          accumulatedDecisions.current = [...data.decisions];
          accumulatedCitations.current = [...data.citations];
          accumulatedDocuments.current = [...data.documents];
        },

        onCitationWarning: (data) => {
          const currentMsg = useChatStore.getState().messages.find(
            (m) => m.id === assistantMessageId
          );
          const existing = currentMsg?.citationWarnings || [];
          updateMessage(assistantMessageId, {
            citationWarnings: [
              ...existing,
              {
                case_number: data.case_number,
                status: data.status,
                confidence: data.confidence,
                message: data.message,
              },
            ],
          });
        },

        onError: (error) => {
          handleStreamError(assistantMessageId, error, {
            updateMessage, setStreaming, setStreamController, setCurrentTool, onError,
          });
        },

        onComplete: (data) => {
          // Pick up auto-created conversationId from backend
          if (data.conversationId && !useChatStore.getState().conversationId) {
            const store = useChatStore.getState();
            useChatStore.setState({ conversationId: data.conversationId });
            // Refresh sidebar conversation list
            store.loadConversations();
          }

          if (data.tools_used || data.total_cost_usd != null || data.charged_usd != null) {
            costSummaryRef.current = {
              ...costSummaryRef.current,
              tools_used: data.tools_used || [],
              total_cost_usd: data.total_cost_usd || 0,
              charged_usd: data.charged_usd || 0,
              response_id: data.response_id || responseIdRef.current || undefined,
            };
            updateMessage(assistantMessageId, {
              costSummary: costSummaryRef.current as CostSummary,
            });
          }
          console.log('[AIChat] Complete', data);
        },

        onCostSummary: (data) => {
          costSummaryRef.current = {
            ...costSummaryRef.current,
            charged_usd: data.charged_usd,
            balance_usd: data.balance_usd,
          };
          updateMessage(assistantMessageId, {
            costSummary: costSummaryRef.current as CostSummary,
          });
        },
      }, 'standard', chatConversationId, approvedPlan, planSessionId);

      setStreamController(controller);
    },
    [addThinkingStep, updateMessage, setStreaming, setStreamController, setCurrentTool, onSuccess, onError, formatUah]
  );

  return { runChatStream };
}

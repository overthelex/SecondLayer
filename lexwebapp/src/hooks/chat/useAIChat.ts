/**
 * useAIChat Hook
 * Calls the agentic /api/chat endpoint with SSE streaming.
 * Supports two-phase flow: plan review -> approved execution.
 */

import { useCallback, useRef } from 'react';
import { useChatStore } from '../../stores';
import { mcpService } from '../../services';
import showToast from '../../utils/toast';
import type { Decision, Citation, VaultDocument, ExecutionPlan, CostSummary } from '../../types/models/Message';
import { getToolLabel } from './tool-labels';
import { extractEvidenceFromToolResult } from './evidence-extractor';
import { extractNormsFromAnswer } from './chat-helpers';

export interface UseAIChatOptions {
  onSuccess?: (result: any) => void;
  onError?: (error: Error) => void;
}

export function useAIChat(options: UseAIChatOptions = {}) {
  const {
    addMessage,
    updateMessage,
    addThinkingStep,
    setStreaming,
    setStreamController,
    setCurrentTool,
    setPendingPlanReview,
    setIsPlanLoading,
  } = useChatStore();

  const { onSuccess, onError } = options;

  // Accumulate evidence across multiple tool calls in one chat session
  const accumulatedDecisions = useRef<Decision[]>([]);
  const accumulatedCitations = useRef<Citation[]>([]);
  const accumulatedDocuments = useRef<VaultDocument[]>([]);
  const contentRef = useRef('');
  const planRef = useRef<ExecutionPlan | null>(null);
  const costSummaryRef = useRef<Partial<CostSummary>>({});
  const responseIdRef = useRef<string | null>(null);

  /**
   * Internal: run the SSE chat stream (shared between direct and approved-plan flows).
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

      // Build history from prior messages
      const currentMessages = useChatStore.getState().messages;
      const history = currentMessages
        .filter((m) => m.id !== assistantMessageId && (m.role === 'user' || m.role === 'assistant'))
        .slice(-6)
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content.slice(0, 1000),
        }));

      const chatConversationId = useChatStore.getState().conversationId || undefined;

      const controller = await mcpService.streamChat(query, history, {
        onResponseId: (data) => {
          responseIdRef.current = data.response_id;
          addThinkingStep(assistantMessageId, {
            id: 'response-id',
            title: `#${data.response_id}`,
            content: '',
            isComplete: true,
          });
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
            `Глибокий аналіз — орієнтовна вартість $${data.estimatedCost.minUsd.toFixed(2)}–$${data.estimatedCost.maxUsd.toFixed(2)}`,
            6000
          );
        },

        onThinking: (data) => {
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

          const costSuffix = data.cost_usd ? ` · $${data.cost_usd.toFixed(4)}` : '';
          addThinkingStep(assistantMessageId, {
            id: `step-${data.step}`,
            title: (data.description || `${getToolLabel(data.tool)}`) + costSuffix,
            content: JSON.stringify(data.params, null, 2),
            isComplete: false,
          });
        },

        onToolResult: (data) => {
          const toolPreview = typeof data.result === 'string'
            ? data.result.slice(0, 500)
            : JSON.stringify(data.result, null, 2).slice(0, 500);

          const costSuffix = data.cost_usd ? ` · $${data.cost_usd.toFixed(4)}` : '';
          addThinkingStep(assistantMessageId, {
            id: `result-${data.tool}`,
            title: `${getToolLabel(data.tool)}` + costSuffix,
            content: toolPreview,
            isComplete: true,
          });

          const evidence = extractEvidenceFromToolResult(data.tool, data.result);
          console.log('[AIChat] Evidence extraction', {
            tool: data.tool,
            decisions: evidence.decisions.length,
            citations: evidence.citations.length,
            documents: evidence.documents.length,
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
          updateMessage(assistantMessageId, { content: contentRef.current });
        },

        onAnswer: (data) => {
          contentRef.current = data.text;

          const answerNorms = extractNormsFromAnswer(data.text);
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
          });

          setStreaming(false);
          setStreamController(null);
          setCurrentTool(null);

          const completedState = useChatStore.getState();
          const completedMsg = completedState.messages.find(
            (m) => m.id === assistantMessageId
          );
          if (completedMsg) {
            completedState.syncMessage(completedMsg);
          }

          if (completedState.conversationId && completedState.messages.length <= 3) {
            const firstUserMsg = completedState.messages.find((m) => m.role === 'user');
            if (firstUserMsg) {
              const title = firstUserMsg.content.slice(0, 60).trim();
              completedState.renameConversation(completedState.conversationId, title);
            }
          }

          onSuccess?.(data);
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

        onComplete: (data) => {
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
    [addThinkingStep, updateMessage, setStreaming, setStreamController, setCurrentTool, onSuccess, onError]
  );

  /**
   * Phase 1: Request plan for user review, then pause.
   */
  const executeChat = useCallback(
    async (query: string, documentIds?: string[]) => {
      const userMessage = {
        id: Date.now().toString(),
        role: 'user' as const,
        content: query,
      };
      addMessage(userMessage);

      const state = useChatStore.getState();
      if (!state.conversationId && localStorage.getItem('auth_token')) {
        await state.createConversation();
      }
      useChatStore.getState().syncMessage(userMessage);

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
      } catch (error: any) {
        updateMessage(assistantMessageId, {
          content: `Помилка: ${error.message || 'Невідома помилка'}`,
          isStreaming: false,
        });
        setStreaming(false);
        setCurrentTool(null);
        showToast.error(error.message || 'Невідома помилка');
        onError?.(error);
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
      } catch (error: any) {
        updateMessage(assistantMessageId, {
          content: `Помилка: ${error.message || 'Невідома помилка'}`,
          isStreaming: false,
        });
        setStreaming(false);
        setCurrentTool(null);
        showToast.error(error.message || 'Невідома помилка');
        onError?.(error);
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
      } catch (error: any) {
        updateMessage(assistantMessageId, {
          content: `Помилка: ${error.message || 'Невідома помилка'}`,
          isStreaming: false,
        });
        setStreaming(false);
        setCurrentTool(null);
        showToast.error(error.message || 'Невідома помилка');
        onError?.(error);
      }
    },
    [updateMessage, setStreaming, setCurrentTool, setPendingPlanReview, runChatStream, onError]
  );

  return { executeChat, confirmPlanAndExecute, skipPlanReview };
}

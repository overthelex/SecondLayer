/**
 * useAIChatStream Hook
 * SSE streaming logic, evidence accumulation, thinking steps, delta message updates.
 * Extracted from useAIChat to keep each hook focused.
 */

import { useCallback, useRef } from 'react';
import { useChatStore } from '../../stores';
import { mcpService } from '../../services';
import type { Decision, Citation, VaultDocument, ExecutionPlan, CostSummary } from '../../types/models/Message';
import { getToolLabel } from './tool-labels';
import { extractEvidenceFromToolResult } from './evidence-extractor';
import { extractNormsFromAnswer } from './chat-helpers';
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

  // Accumulate evidence across multiple tool calls in one chat session
  const accumulatedDecisions = useRef<Decision[]>([]);
  const accumulatedCitations = useRef<Citation[]>([]);
  const accumulatedDocuments = useRef<VaultDocument[]>([]);
  const contentRef = useRef('');
  const planRef = useRef<ExecutionPlan | null>(null);
  const costSummaryRef = useRef<Partial<CostSummary>>({});
  const responseIdRef = useRef<string | null>(null);
  const rafPendingRef = useRef<number | null>(null);

  // Preamble suppression (LEXAI-861): the model sometimes streams a self-correcting
  // "preamble" before a tool_use block ("я вигадав деталі, зараз перевірю..."). We
  // buffer answer_delta while it's ambiguous whether a tool call is coming. Phases:
  //   'uncertain' — buffer deltas; discard if thinking/plan arrives, else flush via timer
  //   'tool'      — tool call in progress; deltas (rare) are buffered for later discard
  //   'streaming' — committed to rendering deltas directly (post-timer or post-answer)
  const streamPhaseRef = useRef<'uncertain' | 'tool' | 'streaming'>('uncertain');
  const preambleBufferRef = useRef('');
  const preambleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const PREAMBLE_SUPPRESS_MS = 500;

  /**
   * Run the SSE chat stream (shared between direct and approved-plan flows).
   */
  const runChatStream = useCallback(
    async (
      query: string,
      assistantMessageId: string,
      approvedPlan?: ExecutionPlan,
      planSessionId?: string,
      _allowDeepEscalation?: boolean,
      internetEnabled?: boolean
    ) => {
      // Reset accumulators
      accumulatedDecisions.current = [];
      accumulatedCitations.current = [];
      accumulatedDocuments.current = [];
      contentRef.current = '';
      planRef.current = null;
      costSummaryRef.current = {};
      responseIdRef.current = null;
      streamPhaseRef.current = 'uncertain';
      preambleBufferRef.current = '';
      if (preambleTimerRef.current) {
        clearTimeout(preambleTimerRef.current);
        preambleTimerRef.current = null;
      }

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
          // Plan implies tool calls will follow — any preamble buffered so far is discarded
          if (preambleTimerRef.current) {
            clearTimeout(preambleTimerRef.current);
            preambleTimerRef.current = null;
          }
          preambleBufferRef.current = '';
          streamPhaseRef.current = 'tool';

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

        onBudgetEscalated: () => {
          // Budget escalation is now fully automatic — no UI confirmation needed
        },

        onThinking: (data) => {
          // Tool call starts — discard any buffered preamble and ALSO clear any
          // preamble that may already have been rendered (LEXAI-861). Previously
          // this handler explicitly committed contentRef to the UI before clearing,
          // which made the hallucination-admission preamble visible until the final
          // answer arrived.
          if (preambleTimerRef.current) {
            clearTimeout(preambleTimerRef.current);
            preambleTimerRef.current = null;
          }
          preambleBufferRef.current = '';
          streamPhaseRef.current = 'tool';

          if (rafPendingRef.current) {
            cancelAnimationFrame(rafPendingRef.current);
            rafPendingRef.current = null;
          }
          const hadContent = contentRef.current.length > 0;
          contentRef.current = '';
          if (hadContent) {
            updateMessage(assistantMessageId, { content: '' });
          }

          if (planRef.current) {
            const matchingStep = planRef.current.steps.find((s) => s.tool === data.tool);
            if (matchingStep && !matchingStep.completed) {
              matchingStep.completed = true;
              updateMessage(assistantMessageId, {
                executionPlan: { ...planRef.current, steps: [...planRef.current.steps] },
              });
            }
          }

          addThinkingStep(assistantMessageId, {
            id: `step-${data.step}`,
            title: (data.description || `${getToolLabel(data.tool)}`),
            content: JSON.stringify(data.params, null, 2),
            isComplete: false,
          });
        },

        onToolResult: (data) => {
          const toolPreview = typeof data.result === 'string'
            ? data.result
            : JSON.stringify(data.result, null, 2);

          addThinkingStep(assistantMessageId, {
            id: `result-${data.tool}`,
            title: `${getToolLabel(data.tool)}`,
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

          // Re-enter 'uncertain' — the next answer_delta may be a preamble before
          // another tool call, or the start of the final answer. We can't tell yet.
          streamPhaseRef.current = 'uncertain';
          preambleBufferRef.current = '';
          if (preambleTimerRef.current) {
            clearTimeout(preambleTimerRef.current);
            preambleTimerRef.current = null;
          }
        },

        onAnswerDelta: (data) => {
          // In 'uncertain' or 'tool' phase we buffer deltas so a potential
          // preamble-before-tool-use never reaches the UI (LEXAI-861). The timer
          // flushes the buffer if no tool-call signal arrives within the window.
          if (streamPhaseRef.current !== 'streaming') {
            preambleBufferRef.current += data.text;
            if (!preambleTimerRef.current) {
              preambleTimerRef.current = setTimeout(() => {
                preambleTimerRef.current = null;
                if (streamPhaseRef.current === 'streaming') return;
                streamPhaseRef.current = 'streaming';
                if (preambleBufferRef.current) {
                  contentRef.current += preambleBufferRef.current;
                  preambleBufferRef.current = '';
                  updateMessage(assistantMessageId, { content: contentRef.current });
                }
              }, PREAMBLE_SUPPRESS_MS);
            }
            return;
          }
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
          // Clear any pending preamble buffer/timer — the server-authoritative
          // final text replaces whatever we had (LEXAI-861).
          if (preambleTimerRef.current) {
            clearTimeout(preambleTimerRef.current);
            preambleTimerRef.current = null;
          }
          preambleBufferRef.current = '';
          streamPhaseRef.current = 'streaming';
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
          const normalized: import('../../types/models/Message').CitationWarning =
            data.reason === 'fabricated_case_numbers'
              ? { kind: 'fabricated', fabricated: data.fabricated, message: data.message }
              : data.reason === 'unverified_law_articles'
                ? { kind: 'unverified_articles', unverified: data.unverified, message: data.message }
                : {
                    kind: 'overruled',
                    case_number: data.case_number,
                    status: data.status,
                    confidence: data.confidence,
                    message: data.message,
                  };
          updateMessage(assistantMessageId, {
            citationWarnings: [...existing, normalized],
          });
        },

        onError: (error) => {
          if (preambleTimerRef.current) {
            clearTimeout(preambleTimerRef.current);
            preambleTimerRef.current = null;
          }
          preambleBufferRef.current = '';
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
              search_stats: data.search_stats ?? costSummaryRef.current?.search_stats,
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

        onStreamEnd: () => {
          if (preambleTimerRef.current) {
            clearTimeout(preambleTimerRef.current);
            preambleTimerRef.current = null;
          }
          // If the stream ended while we were still buffering a preamble, flush
          // it to the UI — better to show late text than lose a legit answer.
          if (streamPhaseRef.current !== 'streaming' && preambleBufferRef.current) {
            contentRef.current += preambleBufferRef.current;
            preambleBufferRef.current = '';
            updateMessage(assistantMessageId, { content: contentRef.current });
          }
          streamPhaseRef.current = 'streaming';

          // Safety net: if the stream ended without an 'answer' event
          // (e.g. backend timeout, abort, or crash), reset the UI streaming state
          // so the chat input is not permanently disabled.
          if (useChatStore.getState().isStreaming) {
            console.warn('[AIChat] Stream ended without answer event — resetting streaming state');
            updateMessage(assistantMessageId, { isStreaming: false });
            setStreaming(false);
            setStreamController(null);
            setCurrentTool(null);
          }
        },
      }, 'standard', chatConversationId, approvedPlan, planSessionId, true, internetEnabled);

      setStreamController(controller);
    },
    [addThinkingStep, updateMessage, setStreaming, setStreamController, setCurrentTool, onSuccess, onError]
  );

  return { runChatStream };
}

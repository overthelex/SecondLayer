/**
 * ChatService — Agentic LLM loop for the /api/chat endpoint.
 *
 * Flow:
 * 1. Classify user intent → filter tools to relevant subset
 * 2. Anthropic pre-analysis: generate response template (structure, legal norms, strategy)
 * 3. Inject template into system prompt for the main LLM
 * 4. Stream LLM response with function calling / tool_use
 * 5. Execute tool calls via ToolRegistry
 * 6. Feed results back → loop until LLM produces final answer
 * 7. Stream token-level events to client via SSE
 */

import { createHash, randomBytes } from 'crypto';
import { logger } from '../utils/logger.js';
import { ToolRegistry, ToolDefinition } from '../api/tool-registry.js';
import { QueryPlanner } from './query-planner.js';
import { generateThinkingDescription } from './thinking-descriptions.js';
import { CostTracker } from './cost-tracker.js';
import { ConversationService } from './conversation-service.js';
import {
  UnifiedMessage,
  ToolDefinitionParam,
  ToolCall,
  type LLMProvider,
} from '@secondlayer/shared';
import { ModelSelector } from '@secondlayer/shared';
import type { IEmbeddingPort, ILLMPort } from '../domain/ports/index.js';
import {
  buildPlanGenerationMessages,
  ExecutionPlan,
  type QueryType,
  type ChatIntentClassification,
} from '../prompts/chat-system-prompt.js';
import { QUERY_TYPE_CONFIG } from '../prompts/query-type-config.js';
import { ChatSearchCacheService, isCourtSearchTool } from './chat-search-cache-service.js';
import type { ShepardizationService, ShepardizationResult } from './shepardization-service.js';
import { extractAllEvidence } from './evidence-extractor.js';

import { BUDGET_LIMITS, CASE_NUMBER_REGEX, type BudgetKey } from './chat-constants.js';
import { IntentClassifier } from './chat-intent-classifier.js';
import { ResultCompactor } from './chat-result-compactor.js';
import { ChatContextBuilder } from './chat-context-builder.js';
import type { WorkflowGeneratorService } from './workflow-generator-service.js';
import type { WorkflowService } from './workflow-service.js';

// ============================
// Types
// ============================

export interface ChatEvent {
  type: 'plan' | 'thinking' | 'tool_result' | 'answer_delta' | 'answer' | 'citation_warning' | 'complete' | 'error' | 'budget_escalated';
  data: any;
}

export interface ChatRequest {
  query: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  budget?: 'quick' | 'standard' | 'deep';
  conversationId?: string;
  userId?: string;
  requestId?: string;
  signal?: AbortSignal;
  /** Pre-approved plan with per-step depth choices — skips plan generation */
  approvedPlan?: ExecutionPlan;
  /** Session ID from a prior /api/chat/plan call — reuses cached classification */
  planSessionId?: string;
}

/** Cached result from /api/chat/plan for reuse during execution */
interface PlanSession {
  classification: ChatIntentClassification;
  toolDefs: ToolDefinition[];
  plan: ExecutionPlan;
  query: string;
  createdAt: number;
}

// ============================
// Constants
// ============================

const CITATION_CHECK_TIMEOUT_MS = 5_000;

// Tools where deduplication hashes only on the primary key (e.g. caseNumber),
// ignoring secondary params like groupByInstance, includeFullText, maxDocs.
const COARSE_HASH_TOOLS: Record<string, string[]> = {
  get_case_documents_chain: ['caseNumber'],
  get_court_decision: ['caseNumber'],
  load_full_texts: ['doc_ids'],
};

/**
 * Compute a deduplication key for a tool call.
 * For court-chain tools, hash only the primary key to catch "same query, different flags" loops.
 */
function toolCallHash(toolName: string, params: Record<string, any>): string {
  const primaryKeys = COARSE_HASH_TOOLS[toolName];
  let payload: string;
  if (primaryKeys) {
    const subset: Record<string, any> = {};
    for (const k of primaryKeys) {
      if (params[k] !== undefined) subset[k] = params[k];
    }
    payload = JSON.stringify(subset);
  } else {
    // Sort keys for deterministic hashing
    payload = JSON.stringify(params, Object.keys(params).sort());
  }
  const hash = createHash('md5').update(payload).digest('hex').slice(0, 12);
  return `${toolName}:${hash}`;
}

/** Depth-based parameter overrides for search tools (deep = larger limits) */
const DEPTH_OVERRIDES: Record<string, { standard: Record<string, any>; deep: Record<string, any> }> = {
  search_legal_precedents:        { standard: { limit: 20 }, deep: { limit: 50 } },
  search_supreme_court_practice:  { standard: { limit: 20 }, deep: { limit: 50 } },
  find_similar_fact_pattern_cases: { standard: { limit: 10 }, deep: { limit: 30 } },
  compare_practice_pro_contra:    { standard: { limit: 20 }, deep: { limit: 50 } },
  search_legislation:             { standard: { limit: 10 }, deep: { limit: 30 } },
  find_relevant_law_articles:     { standard: { limit: 10 }, deep: { limit: 25 } },
  search_procedural_norms:        { standard: { limit: 10 }, deep: { limit: 25 } },
};

/**
 * Estimated cost per step (USD) based on tool type and depth.
 * Includes LLM processing cost (token estimation) + embedding/API costs.
 */
const STEP_COST_ESTIMATES: Record<string, { standard: number; deep: number }> = {
  // Search tools — cost scales with result limit
  search_legal_precedents:         { standard: 0.008, deep: 0.025 },
  search_supreme_court_practice:   { standard: 0.008, deep: 0.025 },
  find_similar_fact_pattern_cases: { standard: 0.005, deep: 0.015 },
  compare_practice_pro_contra:     { standard: 0.008, deep: 0.025 },
  search_legislation:              { standard: 0.004, deep: 0.012 },
  find_relevant_law_articles:      { standard: 0.004, deep: 0.010 },
  search_procedural_norms:         { standard: 0.004, deep: 0.010 },
  // Fixed-cost tools
  get_court_decision:              { standard: 0.005, deep: 0.005 },
  get_case_documents_chain:        { standard: 0.010, deep: 0.010 },
  get_legislation_article:         { standard: 0.003, deep: 0.003 },
  get_legislation_structure:       { standard: 0.002, deep: 0.002 },
  load_full_texts:                 { standard: 0.008, deep: 0.008 },
  semantic_search:                 { standard: 0.004, deep: 0.004 },
  list_documents:                  { standard: 0.002, deep: 0.002 },
  count_cases_by_party:            { standard: 0.003, deep: 0.003 },
};

const DEFAULT_STEP_COST = { standard: 0.004, deep: 0.004 };

const PLAN_SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================
// Service
// ============================

export class ChatService {
  /** In-memory cache: planSessionId → classification + plan for two-phase flow */
  private planSessions = new Map<string, PlanSession>();

  private intentClassifier: IntentClassifier;
  private resultCompactor: ResultCompactor;
  private contextBuilder: ChatContextBuilder;

  constructor(
    private toolRegistry: ToolRegistry,
    private queryPlanner: QueryPlanner,
    private costTracker: CostTracker,
    private llm: ILLMPort,
    private searchCache?: ChatSearchCacheService,
    private conversationService?: ConversationService,
    private shepardizationService?: ShepardizationService,
    private embeddingService?: IEmbeddingPort,
    private workflowGenerator?: WorkflowGeneratorService,
    private workflowService?: WorkflowService
  ) {
    // Wire up cost recorder adapter for sub-modules
    const costRecorder = {
      recordStreamingCost: (requestId: string, provider: string, model: string, usage: any, task: string) => {
        this.recordStreamingCost(requestId, provider as LLMProvider, model, usage, task);
      },
    };

    this.intentClassifier = new IntentClassifier(toolRegistry, queryPlanner, llm, costRecorder);
    this.resultCompactor = new ResultCompactor(embeddingService);
    this.contextBuilder = new ChatContextBuilder(llm, costRecorder);

    // Periodic cleanup of expired plan sessions (every 2 minutes)
    setInterval(() => {
      const now = Date.now();
      for (const [id, session] of this.planSessions) {
        if (now - session.createdAt > PLAN_SESSION_TTL_MS) {
          this.planSessions.delete(id);
        }
      }
    }, 2 * 60 * 1000);
  }

  /**
   * Phase 1: Generate execution plan for user review.
   * Returns plan + session ID that can be passed to chat() for execution.
   */
  async generatePlanForReview(
    query: string,
    budget: 'quick' | 'standard' | 'deep' = 'standard',
    userId?: string,
    requestId?: string
  ): Promise<{ plan: ExecutionPlan; planSessionId: string; queryType: QueryType } | null> {
    const classification = await this.intentClassifier.classify(query, requestId);
    const toolDefs = await this.intentClassifier.filterTools(classification.domains, classification.slots);
    const plan = await this.generateExecutionPlan(query, classification, toolDefs, requestId);

    if (!plan) return null;

    // Apply LLM-recommended depth and estimate costs per step
    for (const step of plan.steps) {
      // Use LLM-recommended depth if provided, otherwise default to 'standard'
      if (step.recommendedDepth) {
        step.depth = step.recommendedDepth;
      } else if (!step.depth) {
        step.depth = 'standard';
      }
      // Calculate estimated cost for this step at current depth
      const costMap = STEP_COST_ESTIMATES[step.tool] || DEFAULT_STEP_COST;
      step.estimatedCost = costMap[step.depth || 'standard'];
    }

    // Cache session for reuse
    const planSessionId = `plan-${Date.now()}-${randomBytes(4).toString('hex')}`;
    this.planSessions.set(planSessionId, {
      classification,
      toolDefs,
      plan,
      query,
      createdAt: Date.now(),
    });

    logger.info('[ChatService] Plan generated for review', {
      planSessionId,
      steps: plan.steps.length,
      goal: plan.goal.slice(0, 100),
      queryType: classification.queryType,
    });

    return { plan, planSessionId, queryType: classification.queryType };
  }

  /**
   * Apply user-chosen depth overrides to plan step parameters.
   * Deep steps get larger limits for search tools.
   */
  private applyStepDepths(plan: ExecutionPlan): ExecutionPlan {
    const adjustedSteps = plan.steps.map(step => {
      const depth = step.depth || 'standard';
      const overrides = DEPTH_OVERRIDES[step.tool];
      if (!overrides) return step;
      return {
        ...step,
        params: { ...step.params, ...overrides[depth] },
      };
    });
    return { ...plan, steps: adjustedSteps };
  }

  /**
   * Run the agentic chat loop. Yields ChatEvents for SSE streaming.
   */
  async *chat(request: ChatRequest): AsyncGenerator<ChatEvent> {
    const { query, history = [], budget = 'standard', signal, requestId } = request;
    const startTime = Date.now();

    // Auto-create conversation if userId is present but no conversationId was provided
    if (this.conversationService && request.userId && !request.conversationId) {
      try {
        const titlePreview = query.slice(0, 80) || 'New conversation';
        const conv = await this.conversationService.createConversation(request.userId, titlePreview);
        request.conversationId = conv.id;
        logger.info('[ChatService] Auto-created conversation for request without conversationId', {
          conversationId: conv.id,
          userId: request.userId,
          requestId,
        });
      } catch (e) {
        logger.warn('[ChatService] Failed to auto-create conversation', { error: (e as Error).message });
      }
    }

    // Create cost tracking record if requestId provided
    if (requestId) {
      try {
        await this.costTracker.createTrackingRecord({
          requestId,
          toolName: 'ai_chat',
          userId: request.userId,
          userQuery: query,
          queryParams: { budget, conversationId: request.conversationId },
        });
      } catch (e) {
        logger.warn('[ChatService] Failed to create tracking record', { error: (e as Error).message });
      }
    }

    try {
      // --- Two-phase support: reuse cached session if approvedPlan is provided ---
      let classification: ChatIntentClassification;
      let toolDefs: ToolDefinition[];
      let plan: ExecutionPlan | undefined;

      if (request.approvedPlan && request.planSessionId) {
        const session = this.planSessions.get(request.planSessionId);
        if (session && Date.now() - session.createdAt <= PLAN_SESSION_TTL_MS) {
          classification = session.classification;
          toolDefs = session.toolDefs;
          // Use the user-approved plan with depth overrides applied
          plan = this.applyStepDepths(request.approvedPlan);
          this.planSessions.delete(request.planSessionId);
          logger.info('[ChatService] Using approved plan from session', {
            planSessionId: request.planSessionId,
            steps: plan.steps.length,
            deepSteps: plan.steps.filter(s => s.depth === 'deep').length,
          });
        } else {
          logger.warn('[ChatService] Plan session expired or not found, regenerating', {
            planSessionId: request.planSessionId,
          });
          classification = await this.intentClassifier.classify(query, requestId);
          toolDefs = await this.intentClassifier.filterTools(classification.domains, classification.slots);
          plan = await this.generateExecutionPlan(query, classification, toolDefs, requestId);
        }
      } else {
        // Standard flow: classify + generate plan
        classification = await this.intentClassifier.classify(query, requestId);
        toolDefs = await this.intentClassifier.filterTools(classification.domains, classification.slots);
        plan = await this.generateExecutionPlan(query, classification, toolDefs, requestId);
      }

      // --- 6a. Unsupported short-circuit ---
      if (classification.queryType === 'unsupported') {
        const reason = classification.unsupportedReason || 'Цей запит виходить за межі можливостей системи SecondLayer.';
        logger.info('[ChatService] Query classified as unsupported', { reason, query: query.slice(0, 100) });
        yield {
          type: 'answer',
          data: {
            text: reason,
            queryType: 'unsupported',
          },
        };
        yield {
          type: 'complete',
          data: {
            iterations: 0,
            elapsed_ms: Date.now() - startTime,
            tools_used: [],
            total_cost_usd: 0,
            queryType: 'unsupported',
          },
        };
        return;
      }

      // --- 6b. Institutional analysis → generate workflows ---
      if (classification.queryType === 'institutional_analysis' && this.workflowGenerator && this.workflowService) {
        logger.info('[ChatService] Generating workflows for institutional analysis', { query: query.slice(0, 100) });
        yield {
          type: 'thinking',
          data: {
            step: 0,
            tool: '_classify',
            params: { queryType: 'institutional_analysis' },
            description: 'Генерую план глибокого аналізу',
          },
        };

        try {
          const generated = await this.workflowGenerator.generateWorkflows(query, classification);
          const workflowSet = await this.workflowService.createWorkflowSet({
            userId: request.userId || 'anonymous',
            conversationId: request.conversationId,
            title: generated.title,
            description: generated.description,
            sourceQuery: query,
            workflows: generated.workflows.map(w => ({
              sequenceNumber: w.sequenceNumber,
              title: w.title,
              description: w.description,
              plan: w.plan,
            })),
          });

          yield {
            type: 'answer',
            data: {
              text: `Для вашого запиту згенеровано **${generated.workflows.length} робочих процесів** у наборі "${generated.title}".\n\n${generated.description}\n\nПерейдіть на сторінку [Workflows](/workflows/${workflowSet.id}) для перегляду та запуску.`,
              queryType: 'institutional_analysis',
              workflowSetId: workflowSet.id,
            },
          };
          yield {
            type: 'complete',
            data: {
              iterations: 0,
              elapsed_ms: Date.now() - startTime,
              tools_used: [],
              total_cost_usd: 0,
              queryType: 'institutional_analysis',
              workflowSetId: workflowSet.id,
            },
          };
        } catch (err: any) {
          logger.error('[ChatService] Workflow generation failed', { error: err.message });
          yield {
            type: 'answer',
            data: {
              text: `Не вдалося згенерувати робочі процеси: ${err.message}. Спробуйте уточнити запит.`,
              queryType: 'institutional_analysis',
            },
          };
          yield {
            type: 'complete',
            data: {
              iterations: 0,
              elapsed_ms: Date.now() - startTime,
              tools_used: [],
              total_cost_usd: 0,
              queryType: 'institutional_analysis',
            },
          };
        }
        return;
      }

      // --- 6b2. Document listing fast-path ---
      // When the user just asks "what documents do I have?" — skip plan generation
      // and LLM summarization, directly call list_documents and return a formatted list.
      if (classification.queryType === 'document_query' && this.isSimpleDocumentListQuery(query, classification)) {
        logger.info('[ChatService] Fast-path: simple document listing', { query: query.slice(0, 100) });
        yield {
          type: 'thinking',
          data: {
            step: 0,
            tool: '_classify',
            params: { queryType: 'document_query' },
            description: 'Отримую список документів',
          },
        };

        try {
          const toolArgs: Record<string, any> = {
            query: '',
            limit: 50,
            offset: 0,
            sortBy: 'uploadedAt',
            sortOrder: 'desc',
          };
          if (request.userId) toolArgs.userId = request.userId;

          const toolResult = await this.toolRegistry.executeTool('list_documents', toolArgs);

          // Emit tool_result so evidence panel gets populated
          yield {
            type: 'tool_result',
            data: {
              tool: 'list_documents',
              result: toolResult,
              cached: false,
              cost_usd: 0,
            },
          };

          // Format a simple document list without LLM
          const answerText = this.formatDocumentListAnswer(toolResult);

          yield {
            type: 'answer',
            data: {
              text: answerText,
              queryType: 'document_query',
            },
          };
          yield {
            type: 'complete',
            data: {
              iterations: 0,
              elapsed_ms: Date.now() - startTime,
              tools_used: ['list_documents'],
              total_cost_usd: 0,
              queryType: 'document_query',
            },
          };
        } catch (err: any) {
          logger.error('[ChatService] Document listing fast-path failed', { error: err.message });
          yield {
            type: 'answer',
            data: {
              text: `Не вдалося отримати список документів: ${err.message}`,
              queryType: 'document_query',
            },
          };
          yield {
            type: 'complete',
            data: {
              iterations: 0,
              elapsed_ms: Date.now() - startTime,
              tools_used: [],
              total_cost_usd: 0,
              queryType: 'document_query',
            },
          };
        }
        return;
      }

      // --- 6c. Synthetic thinking event (step 0) ---
      const qtConfig = QUERY_TYPE_CONFIG[classification.queryType];
      if (qtConfig?.thinkingPrefix) {
        yield {
          type: 'thinking',
          data: {
            step: 0,
            tool: '_classify',
            params: { queryType: classification.queryType },
            description: qtConfig.thinkingPrefix,
          },
        };
      }

      // Emit plan to client via SSE (Step 7: include queryType)
      if (plan) {
        yield {
          type: 'plan',
          data: {
            ...plan,
            queryType: classification.queryType,
            thinkingPrefix: qtConfig?.thinkingPrefix,
          },
        };
      }

      // --- 6b. Budget floor from queryType config ---
      const budgetOrder: Record<string, number> = { quick: 0, standard: 1, deep: 2 };
      const configBudget = qtConfig?.defaultBudget || 'standard';

      // Budget escalation:
      //    - Any step marked "deep" by user → deep budget
      //    - Plan with >= 3 steps → deep
      //    - Complex case analysis (case_number + long query) → deep even without a plan
      //    - Court practice analysis query → deep (needs full doc content + long response)
      let effectiveBudget: BudgetKey = budget;
      const hasDeepSteps = plan?.steps.some(s => s.depth === 'deep');
      const PRACTICE_ANALYSIS_KEYWORDS = /проаналізу|аналіз практик|судова практика|знайти справи|знайти практику|огляд практики|яка практика|як суди|позиція судів/i;
      if (hasDeepSteps) {
        effectiveBudget = 'deep';
        logger.info('[ChatService] Escalated to deep budget (user chose deep steps)', {
          deepSteps: plan!.steps.filter(s => s.depth === 'deep').map(s => s.tool),
        });
      } else if (plan && plan.steps.length >= 3) {
        effectiveBudget = 'deep';
      } else if (
        !plan &&
        classification.slots?.case_number &&
        query.length > 100
      ) {
        effectiveBudget = 'deep';
        logger.info('[ChatService] Auto-escalated to deep budget (case_number + long query, no plan)', {
          caseNumber: classification.slots.case_number,
          queryLength: query.length,
        });
      } else if (
        classification.domains.includes('court') &&
        PRACTICE_ANALYSIS_KEYWORDS.test(query)
      ) {
        effectiveBudget = 'deep';
        logger.info('[ChatService] Auto-escalated to deep budget (court practice analysis query)', {
          queryLength: query.length,
          domains: classification.domains,
        });
        yield {
          type: 'budget_escalated',
          data: {
            reason: 'court_practice_analysis',
            estimatedCost: { minUsd: 0.30, maxUsd: 0.90 },
          },
        };
      }

      // Apply budget floor from queryType config (never downgrade below config minimum)
      if ((budgetOrder[configBudget] || 0) > (budgetOrder[effectiveBudget] || 0)) {
        logger.info('[ChatService] Budget floor applied from queryType config', {
          queryType: classification.queryType,
          configBudget,
          previousBudget: effectiveBudget,
        });
        effectiveBudget = configBudget as BudgetKey;
      }

      logger.info('[ChatService] Starting agentic loop', {
        query: query.slice(0, 100),
        domains: classification.domains,
        keywords: classification.keywords,
        queryType: classification.queryType,
        toolCount: toolDefs.length,
        budget: effectiveBudget,
        budgetEscalated: effectiveBudget !== budget,
        hasPlan: !!plan,
        planSteps: plan?.steps.length || 0,
      });

      // 4. Pick LLM model for the main loop
      const selection = ModelSelector.getModelSelection(effectiveBudget);

      logger.info('[ChatService] Selected LLM', {
        provider: selection.provider,
        model: selection.model,
      });

      // 5. Build messages with token-aware context window + injected plan
      const limits = BUDGET_LIMITS[effectiveBudget as BudgetKey] || BUDGET_LIMITS.standard;
      const messages = await this.contextBuilder.build(history, query, classification.domains, plan, limits.maxContextChars, request.conversationId, requestId, classification.queryType);

      // Log estimated prompt size for rate-limit debugging
      const totalChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
      const estimatedTokens = Math.ceil(totalChars / 3.5); // ~3.5 chars per token for multilingual
      logger.info('[ChatService] Prompt size estimate', {
        totalChars,
        estimatedTokens,
        messageCount: messages.length,
        systemPromptChars: messages[0]?.content?.length || 0,
        provider: selection.provider,
        model: selection.model,
      });

      if (estimatedTokens > 25000) {
        logger.warn('[ChatService] Prompt exceeds 25K tokens — risk of Anthropic rate limit', {
          estimatedTokens,
          provider: selection.provider,
        });
      }

      // 4. Convert tool definitions for LLM
      const llmTools = this.convertToolDefs(toolDefs);

      // 5. Agentic loop with streaming
      const llm = this.llm;
      let iteration = 0;
      let fullAnswerText = '';
      let totalCostUsd = 0;
      const toolsUsed: string[] = [];
      const collectedToolCalls: ToolCall[] = [];
      const collectedThinkingSteps: Array<{ tool: string; params: any; result: any }> = [];
      const previousToolCallHashes = new Set<string>();

      while (iteration < limits.maxToolCalls) {
        if (signal?.aborted) break;

        // Stream LLM response
        let fullContent = '';
        let toolCalls: ToolCall[] = [];
        let finishReason: 'stop' | 'tool_calls' = 'stop';
        let hasToolCallDelta = false;
        let iterationUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        let iterationModel = '';
        let iterationProvider: LLMProvider = 'openai';

        for await (const chunk of llm.chatCompletionStream(
          {
            messages,
            tools: llmTools.length > 0 ? llmTools : undefined,
            tool_choice: llmTools.length > 0 ? 'auto' : undefined,
            max_tokens: limits.maxTokens,
            temperature: 0.3,
          },
          effectiveBudget,
          selection.provider,
          signal
        )) {
          if (signal?.aborted) break;

          if (chunk.type === 'text_delta' && chunk.text) {
            fullContent += chunk.text;
            // Always stream text deltas — if tool calls follow, the frontend
            // clears partial text when it receives the next 'thinking' event
            yield { type: 'answer_delta', data: { text: chunk.text } };
          }

          if (chunk.type === 'tool_call_delta') {
            hasToolCallDelta = true;
          }

          if (chunk.type === 'usage' && chunk.usage) {
            iterationUsage = chunk.usage;
          }

          if (chunk.type === 'done') {
            finishReason = chunk.finish_reason || 'stop';
            if (chunk.tool_calls) {
              toolCalls = chunk.tool_calls;
            }
            if (chunk.model) iterationModel = chunk.model;
            if (chunk.provider) iterationProvider = chunk.provider;
          }
        }

        if (signal?.aborted) break;

        // Record LLM cost for this iteration
        // Anthropic streaming may not report usage; estimate from content length
        let iterationCostUsd = 0;
        if (requestId && iterationModel) {
          if (iterationUsage.total_tokens > 0) {
            iterationCostUsd = ModelSelector.estimateCostAccurate(iterationModel, iterationUsage.prompt_tokens, iterationUsage.completion_tokens);
          } else {
            // Estimate tokens from content length (~3.5 chars/token for multilingual)
            const estPromptTokens = Math.ceil(messages.reduce((s, m) => s + (m.content?.length || 0), 0) / 3.5);
            const estCompletionTokens = Math.ceil((fullContent.length + JSON.stringify(toolCalls).length) / 3.5);
            iterationCostUsd = ModelSelector.estimateCostAccurate(iterationModel, estPromptTokens, estCompletionTokens);
            iterationUsage = { prompt_tokens: estPromptTokens, completion_tokens: estCompletionTokens, total_tokens: estPromptTokens + estCompletionTokens };
            logger.warn('[ChatService] No usage from streaming, estimated tokens', {
              iteration,
              model: iterationModel,
              provider: iterationProvider,
              estPromptTokens,
              estCompletionTokens,
              estimatedCost: iterationCostUsd,
            });
          }
          totalCostUsd += iterationCostUsd;
          this.recordStreamingCost(requestId, iterationProvider, iterationModel, iterationUsage, `chat_iteration_${iteration}`);
        }

        // Final answer — no tool calls
        if (finishReason === 'stop' || toolCalls.length === 0) {
          fullAnswerText = fullContent;
          yield {
            type: 'answer',
            data: { text: fullContent, provider: selection.provider, model: selection.model },
          };
          break;
        }

        // Tool-calling iteration — deduplicate before executing

        // Filter out duplicate tool calls (same tool + same/similar params)
        const uniqueToolCalls: ToolCall[] = [];
        const duplicateToolCalls: ToolCall[] = [];
        for (const call of toolCalls) {
          const hash = toolCallHash(call.name, (call.arguments || {}) as Record<string, any>);
          if (previousToolCallHashes.has(hash)) {
            duplicateToolCalls.push(call);
            logger.warn('[ChatService] Skipping duplicate tool call', {
              tool: call.name,
              hash,
              iteration,
            });
          } else {
            previousToolCallHashes.add(hash);
            uniqueToolCalls.push(call);
          }
        }

        // If ALL tool calls are duplicates, force exit and generate answer from collected data
        if (uniqueToolCalls.length === 0) {
          logger.warn('[ChatService] All tool calls are duplicates — forcing answer generation', {
            iteration,
            duplicates: duplicateToolCalls.map(c => c.name),
          });
          // Push assistant message with the duplicate calls so context is valid,
          // then inject a nudge to synthesize
          messages.push({
            role: 'assistant',
            content: fullContent || '',
            tool_calls: toolCalls,
          });
          for (const call of toolCalls) {
            messages.push({
              role: 'tool',
              content: JSON.stringify({ note: 'Цей інструмент вже було викликано з такими параметрами. Використай наявні результати.' }),
              tool_call_id: call.id,
            });
          }
          messages.push({
            role: 'user',
            content: 'Дані вже отримано. Перейди до аналізу на основі зібраних результатів. Не повторюй виклики інструментів.',
          });
          // Continue to next iteration — the model should now produce a text answer
          iteration++;
          continue;
        }

        // Replace toolCalls with only unique ones for execution
        toolCalls = uniqueToolCalls;

        // Step 1: Emit all thinking events upfront
        for (const call of toolCalls) {
          collectedToolCalls.push(call);
          if (!toolsUsed.includes(call.name)) toolsUsed.push(call.name);
          yield {
            type: 'thinking',
            data: {
              step: iteration + 1,
              tool: call.name,
              params: call.arguments,
              description: generateThinkingDescription(call.name, call.arguments as Record<string, unknown>),
              cost_usd: iterationCostUsd,
            },
          };
        }

        // Step 2: Execute all tools in parallel
        const settled = await Promise.allSettled(
          toolCalls.map(call => this.executeToolWithCache(call, request.userId))
        );

        // Step 3: Build correct message format — ONE assistant message with ALL tool_calls
        messages.push({
          role: 'assistant',
          content: fullContent || '',
          tool_calls: toolCalls,
        });

        // Step 4: Yield results and append individual tool result messages
        for (let i = 0; i < settled.length; i++) {
          const outcome = settled[i];
          const call = toolCalls[i];

          const toolResult = outcome.status === 'fulfilled'
            ? outcome.value.result
            : { error: (outcome.reason as Error).message };
          const cached = outcome.status === 'fulfilled' ? outcome.value.cached : false;

          collectedThinkingSteps.push({ tool: call.name, params: call.arguments, result: toolResult });

          const summarized = this.resultCompactor.summarize(toolResult, limits);

          // Send the FULL result to the frontend for evidence extraction (decisions, citations).
          // The summarized version is only used for the LLM conversation to save tokens.
          yield {
            type: 'tool_result',
            data: {
              tool: call.name,
              result: toolResult,
              cached,
              cost_usd: iterationCostUsd,
            },
          };

          messages.push({
            role: 'tool',
            content: JSON.stringify(summarized),
            tool_call_id: call.id,
          });
        }

        // After first tool execution round, nudge the model to synthesize —
        // but ONLY if there is no multi-step plan that requires further tool calls.
        if (iteration === 0 && settled.some(o => o.status === 'fulfilled')) {
          const planExpectsMoreSteps = plan && plan.steps.length > 1;
          if (planExpectsMoreSteps) {
            messages.push({
              role: 'user',
              content: 'Перший крок виконано. Продовжуй план — виконай наступні кроки. Якщо всі кроки завершено, перейди до фінального аналізу.',
            });
          } else {
            messages.push({
              role: 'user',
              content: 'Дані вже отримано. Якщо потрібні додаткові інструменти (наприклад, load_full_texts для завантаження повних текстів) — виклич їх. Інакше перейди до аналізу на основі зібраних результатів.',
            });
          }
        }

        // Document fallback nudge: if list_documents with query returned 0 docs, hint to retry without query
        if (iteration === 0) {
          const hasEmptyDocSearch = settled.some((outcome, idx) => {
            if (outcome.status !== 'fulfilled') return false;
            const call = toolCalls[idx];
            if (call.name !== 'list_documents') return false;
            const result = outcome.value.result;
            const resultText = typeof result === 'string' ? result : JSON.stringify(result);
            const hasQuery = call.arguments?.query && String(call.arguments.query).trim().length > 0;
            return hasQuery && resultText.includes('"total":0');
          });
          if (hasEmptyDocSearch) {
            messages.push({
              role: 'user',
              content: 'УВАГА: list_documents з ключовими словами повернув 0 документів. Це може означати що документи мають інші назви. Обовʼязково виклич list_documents(query="", limit=50) щоб побачити ВСІ документи, і semantic_search для пошуку по змісту.',
            });
          }
        }

        // RAG compaction: if accumulated tool results are too large, compact them
        if (this.embeddingService && iteration >= 2) {
          const toolMessages = messages.filter(m => m.role === 'tool');
          if (toolMessages.length >= 3) {
            const toolContents = toolMessages.map(m => ({
              tool: (m as any).tool_call_id || 'unknown',
              content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            }));
            const compacted = await this.resultCompactor.ragCompact(query, toolContents, limits.maxResultChars * 2);
            // Replace tool message contents with compacted versions
            let compIdx = 0;
            for (const msg of messages) {
              if (msg.role === 'tool' && compIdx < compacted.length) {
                msg.content = compacted[compIdx].content;
                compIdx++;
              }
            }
          }
        }

        iteration++;
      }

      // If loop exhausted MAX_TOOL_CALLS without a final answer, generate fallback
      if (!fullAnswerText && collectedThinkingSteps.length > 0 && !signal?.aborted) {
        logger.warn('[ChatService] Agentic loop exhausted maxToolCalls without final answer', {
          iterations: iteration,
          toolCalls: collectedToolCalls.length,
          maxToolCalls: limits.maxToolCalls,
        });
        // Attempt one more LLM call without tools to force a text answer
        try {
          const summaryPrompt = collectedThinkingSteps
            .map(s => `[${s.tool}]: ${JSON.stringify(s.result).slice(0, 2000)}`)
            .join('\n\n');
          messages.push({
            role: 'user',
            content: `На основі зібраних даних дай повну аналітичну відповідь. Не викликай інструменти.\n\nЗібрані дані:\n${summaryPrompt.slice(0, limits.maxContextChars / 2)}`,
          });
          let fallbackContent = '';
          for await (const chunk of llm.chatCompletionStream(
            { messages, max_tokens: limits.maxTokens, temperature: 0.3 },
            effectiveBudget,
            selection.provider,
            signal
          )) {
            if (signal?.aborted) break;
            if (chunk.type === 'text_delta' && chunk.text) {
              fallbackContent += chunk.text;
              yield { type: 'answer_delta', data: { text: chunk.text } };
            }
          }
          if (fallbackContent) {
            fullAnswerText = fallbackContent;
            yield { type: 'answer', data: { text: fallbackContent, provider: selection.provider, model: selection.model } };
          }
        } catch (fallbackErr: any) {
          logger.warn('[ChatService] Fallback answer generation failed', { error: fallbackErr.message });
        }
      }

      // Post-answer citation verification (non-blocking, with timeout)
      if (this.shepardizationService && fullAnswerText) {
        yield* this.verifyCitationsInAnswer(fullAnswerText);
      }

      // Yield completion event
      const elapsed = Date.now() - startTime;
      yield {
        type: 'complete',
        data: {
          iterations: iteration,
          elapsed_ms: elapsed,
          tools_used: toolsUsed,
          total_cost_usd: totalCostUsd,
          queryType: classification.queryType,
        },
      };

      // Server-side message persistence — always persist if we have any data,
      // even if client disconnected (user may have refreshed or navigated away).
      const hasData = fullAnswerText || collectedThinkingSteps.length > 0 || collectedToolCalls.length > 0;
      if (this.conversationService && request.conversationId && request.userId && hasData) {
        try {
          if (signal?.aborted) {
            logger.info('[ChatService] Client disconnected but persisting partial results', {
              conversationId: request.conversationId,
              hadAnswer: !!fullAnswerText,
              toolCallsCount: collectedToolCalls.length,
            });
          }

          await this.conversationService.addMessage(request.conversationId, request.userId, {
            role: 'user',
            content: request.query,
          });
          // Extract decisions/citations/documents from tool results for persistence
          const evidence = collectedThinkingSteps.length > 0
            ? extractAllEvidence(collectedThinkingSteps, fullAnswerText)
            : undefined;

          const contentToSave = fullAnswerText || (collectedThinkingSteps.length > 0
            ? '[Відповідь не завершена — клієнт від\'єднався під час генерації]'
            : '');

          await this.conversationService.addMessage(request.conversationId, request.userId, {
            role: 'assistant',
            content: contentToSave,
            tool_calls: collectedToolCalls.length > 0 ? collectedToolCalls : undefined,
            thinking_steps: collectedThinkingSteps.length > 0 ? collectedThinkingSteps : undefined,
            decisions: evidence?.decisions && evidence.decisions.length > 0 ? evidence.decisions : undefined,
            citations: evidence?.citations && evidence.citations.length > 0 ? evidence.citations : undefined,
            documents: evidence?.documents && evidence.documents.length > 0 ? evidence.documents : undefined,
            cost_summary: totalCostUsd > 0 ? { total_cost_usd: totalCostUsd, tools_used: toolsUsed } : undefined,
          });
        } catch (e) {
          logger.warn('[ChatService] Failed to persist messages', { error: (e as Error).message });
        }
      }
    } catch (err: any) {
      logger.error('[ChatService] Error in agentic loop', { error: err.message, stack: err.stack });

      // Complete tracking as failed
      if (requestId) {
        try {
          await this.costTracker.completeTrackingRecord({
            requestId,
            executionTimeMs: Date.now() - startTime,
            status: 'failed',
            errorMessage: err.message,
          });
        } catch (e) {
          logger.warn('[ChatService] Failed to complete tracking record', { error: (e as Error).message });
        }
      }

      yield {
        type: 'error',
        data: { message: err.message },
      };
      return;
    }

    // Complete tracking as successful
    if (requestId) {
      try {
        await this.costTracker.completeTrackingRecord({
          requestId,
          executionTimeMs: Date.now() - startTime,
          status: 'completed',
        });
      } catch (e) {
        logger.warn('[ChatService] Failed to complete tracking record', { error: (e as Error).message });
      }
    }
  }

  /**
   * Generate a structured execution plan: which tools to call, in what order,
   * with what parameters. Uses a fast LLM call (quick budget, ~200-400ms).
   * Falls back to undefined on error → agentic loop runs without a plan.
   */
  private async generateExecutionPlan(
    query: string,
    classification: { domains: string[]; keywords: string; slots?: Record<string, any> },
    toolDefs: ToolDefinition[],
    requestId?: string
  ): Promise<ExecutionPlan | undefined> {
    try {
      const llm = this.llm;

      // Build tool descriptions for the prompt
      const toolDescriptions = toolDefs
        .map((d) => `- ${d.name}: ${d.description}`)
        .join('\n');

      const planMessages = buildPlanGenerationMessages(query, classification, toolDescriptions);

      const totalChars = planMessages.reduce((s, m) => s + m.content.length, 0);
      logger.debug('[ChatService] Execution plan prompt size', {
        chars: totalChars,
        estimatedTokens: Math.ceil(totalChars / 3.5),
      });

      const startTime = Date.now();

      const response = await llm.chatCompletion(
        {
          messages: planMessages,
          max_tokens: 2000,
        },
        'deep'
      );

      // Record plan generation LLM cost
      if (requestId && response.usage) {
        this.recordStreamingCost(requestId, response.provider, response.model, response.usage, 'plan_generation');
      }

      const content = response.content || '{}';
      const elapsed = Date.now() - startTime;

      logger.debug('[ChatService] Plan generation response', {
        model: response.model,
        contentLength: content.length,
        contentPreview: content.slice(0, 500),
      });

      // Extract JSON from response (may be wrapped in markdown code blocks)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in plan response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Empty object — model failed to generate a plan despite instructions
      if (Object.keys(parsed).length === 0) {
        logger.warn('[ChatService] Plan generation returned empty object, model did not follow instructions', {
          model: response.model,
          query: query.slice(0, 200),
        });
        return undefined;
      }

      // Validate plan structure
      if (!parsed.goal || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
        logger.warn('[ChatService] Plan validation failed - invalid structure', {
          parsed: JSON.stringify(parsed).slice(0, 500),
          hasGoal: !!parsed.goal,
          hasSteps: Array.isArray(parsed.steps),
          stepsLength: parsed.steps?.length,
          model: response.model,
          provider: response.provider,
        });
        throw new Error('Invalid plan structure: missing goal or steps');
      }

      // Cap at 5 steps
      const steps = parsed.steps.slice(0, 5);

      // Validate each step has required fields
      for (const step of steps) {
        if (!step.tool || !step.purpose) {
          throw new Error(`Invalid step: missing tool or purpose`);
        }
        step.params = step.params || {};
      }

      const plan: ExecutionPlan = {
        goal: parsed.goal,
        steps,
        expected_iterations: parsed.expected_iterations || steps.length,
      };

      logger.info('[ChatService] Execution plan generated', {
        provider: response.provider,
        elapsed_ms: elapsed,
        steps: plan.steps.length,
        goal: plan.goal.slice(0, 100),
      });

      return plan;
    } catch (err: any) {
      logger.warn('[ChatService] Plan generation failed, proceeding without plan', {
        error: err.message,
      });
      return undefined;
    }
  }

  /**
   * Convert ToolRegistry definitions to LLM function calling format.
   */
  private convertToolDefs(defs: ToolDefinition[]): ToolDefinitionParam[] {
    return defs.map((d) => ({
      name: d.name,
      description: d.description,
      parameters: d.inputSchema || { type: 'object', properties: {} },
    }));
  }

  /**
   * Record LLM cost for a single call (streaming or non-streaming).
   * Fire-and-forget — errors are logged but don't break the chat flow.
   */
  private recordStreamingCost(
    requestId: string,
    provider: LLMProvider,
    model: string,
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number },
    task: string
  ): void {
    const costUsd = ModelSelector.estimateCostAccurate(model, usage.prompt_tokens, usage.completion_tokens);

    const params = {
      requestId,
      model,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      costUsd,
      task,
    };

    this.costTracker.recordOpenAICall(params).catch((e: Error) => {
      logger.warn('[ChatService] Failed to record LLM cost', { error: e.message, task });
    });
  }

  /**
   * Extract case numbers from the LLM answer and verify their precedent status.
   * Yields citation_warning events for overruled or limited decisions.
   */
  private async *verifyCitationsInAnswer(answerText: string): AsyncGenerator<ChatEvent> {
    try {
      const matches = answerText.match(CASE_NUMBER_REGEX);
      if (!matches || matches.length === 0) return;

      const caseNumbers = [...new Set(matches)];
      logger.info('[ChatService] Verifying citations in answer', { count: caseNumbers.length });

      const results = await Promise.race([
        this.shepardizationService!.batchAnalyze(caseNumbers),
        new Promise<ShepardizationResult[]>((_, reject) =>
          setTimeout(() => reject(new Error('citation check timeout')), CITATION_CHECK_TIMEOUT_MS)
        ),
      ]);

      for (const result of results) {
        if (result.status === 'explicitly_overruled' || result.status === 'limited') {
          yield {
            type: 'citation_warning',
            data: {
              case_number: result.case_number,
              status: result.status,
              confidence: result.confidence,
              affecting_decisions: result.affecting_decisions,
              message: result.status === 'explicitly_overruled'
                ? `Рішення у справі ${result.case_number} було скасовано вищою інстанцією`
                : `Рішення у справі ${result.case_number} було змінено вищою інстанцією`,
            },
          };
        }
      }
    } catch (err: any) {
      logger.debug('[ChatService] Citation verification skipped', { error: err.message });
      // Non-critical — don't yield error, just skip
    }
  }

  /**
   * Execute a single tool call with cache check/store logic.
   * Extracted to enable parallel execution via Promise.allSettled().
   */
  private async executeToolWithCache(
    call: ToolCall,
    userId?: string
  ): Promise<{ call: ToolCall; result: any; cached: boolean }> {
    let toolResult: any;
    let cached = false;

    // Check cache for court search tools
    if (this.searchCache && isCourtSearchTool(call.name)) {
      const hit = await this.searchCache.getCachedResult(call.name, call.arguments);
      if (hit) {
        toolResult = hit;
        cached = true;
        logger.info('[ChatService] Cache hit for tool', { tool: call.name });
      }
    }

    if (!cached) {
      try {
        const VAULT_TOOLS = new Set(['store_document', 'get_document', 'list_documents', 'semantic_search', 'list_folders', 'delete_document', 'update_document']);
        const toolArgs = (userId && VAULT_TOOLS.has(call.name))
          ? { ...call.arguments, userId }
          : call.arguments;
        toolResult = await this.toolRegistry.executeTool(call.name, toolArgs);
      } catch (err: any) {
        toolResult = { error: err.message };
      }

      // Post-execution: cache result & trigger background downloads
      if (this.searchCache && isCourtSearchTool(call.name) && !toolResult?.error) {
        this.searchCache.cacheResult(call.name, call.arguments, toolResult);
        const docIds = this.searchCache.extractDocIds(toolResult);
        if (docIds.length > 0) {
          this.searchCache.triggerBackgroundDownloads(docIds);
        }
      }
    }

    return { call, result: toolResult, cached };
  }

  /**
   * Detect whether a document_query is a simple "list my documents" request
   * (as opposed to a semantic search like "find contract about rent in my docs").
   */
  private isSimpleDocumentListQuery(query: string, classification: ChatIntentClassification): boolean {
    const SIMPLE_LIST_PATTERNS = /^(як[іі]\s+документ|покажи\s+(мо[їі]|документ|файл)|список\s+документ|що\s+(я\s+)?завантажи|що\s+ти\s+бачиш|які\s+файли|мо[їі]\s+документ|мо[їі]\s+файл|what\s+document|show\s+(my\s+)?document|list\s+document|я\s+загрузил|я\s+завантажи|документи\s+загружен|які\s+є\s+документ|які\s+є\s+файл|що\s+в\s+(мене|моєму|моїй)|документи\s+в\s+(vault|сховищ)|файли\s+в\s+(vault|сховищ)|що\s+у\s+мене)/i;

    // If query matches simple list patterns OR if keywords are very generic
    if (SIMPLE_LIST_PATTERNS.test(query)) return true;

    // Short queries with only "documents" domain are likely simple listings
    const kw = classification.keywords.toLowerCase();
    const genericKeywords = /^(документ|файл|завантажен|загружен|vault|сховищ|список|мої)\s*$/i;
    if (query.length < 60 && classification.domains.length === 1 && classification.domains[0] === 'documents' && !kw.includes(' ')) {
      return true;
    }

    return false;
  }

  /**
   * Format list_documents tool result into a simple readable list.
   */
  private formatDocumentListAnswer(toolResult: any): string {
    try {
      // Parse the tool result content
      let data: any;
      if (toolResult?.content && Array.isArray(toolResult.content)) {
        const textBlock = toolResult.content.find((b: any) => b.type === 'text');
        if (textBlock?.text) {
          data = JSON.parse(textBlock.text);
        }
      } else if (typeof toolResult === 'object') {
        data = toolResult;
      }

      if (!data?.documents || data.documents.length === 0) {
        return 'У вас поки немає завантажених документів.';
      }

      const docs = data.documents;
      const total = data.total || docs.length;

      let text = `У вас ${total} ${this.pluralizeDocuments(total)}:\n\n`;
      text += '| # | Назва | Тип | Дата завантаження |\n';
      text += '|---|-------|-----|-------------------|\n';

      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        const title = doc.title || 'Без назви';
        const type = doc.type || '—';
        const date = doc.metadata?.uploadedAt
          ? new Date(doc.metadata.uploadedAt).toLocaleDateString('uk-UA')
          : (doc.storage_type === 'vault' ? '—' : '—');
        text += `| ${i + 1} | ${title} | ${type} | ${date} |\n`;
      }

      if (total > docs.length) {
        text += `\n*Показано ${docs.length} з ${total} документів.*`;
      }

      return text;
    } catch (err: any) {
      logger.warn('[ChatService] Failed to format document list', { error: err.message });
      return 'Документи отримано, але не вдалося відформатувати список.';
    }
  }

  private pluralizeDocuments(n: number): string {
    const lastTwo = n % 100;
    const lastOne = n % 10;
    if (lastTwo >= 11 && lastTwo <= 19) return 'документів';
    if (lastOne === 1) return 'документ';
    if (lastOne >= 2 && lastOne <= 4) return 'документи';
    return 'документів';
  }
}

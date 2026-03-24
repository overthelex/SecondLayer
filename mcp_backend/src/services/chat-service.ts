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
import { extractAllEvidence, extractFromToolResult, extractNormsFromAnswer } from './evidence-extractor.js';

import { BUDGET_LIMITS, CASE_NUMBER_REGEX, type BudgetKey } from './chat-constants.js';
import { IntentClassifier } from './chat-intent-classifier.js';
import { ResultCompactor } from './chat-result-compactor.js';
import { ChatContextBuilder } from './chat-context-builder.js';
import type { WorkflowGeneratorService } from './workflow-generator-service.js';
import type { WorkflowService } from './workflow-service.js';
import { NameVariationService } from './name-variation-service.js';

// ============================
// Types
// ============================

export interface ChatEvent {
  type: 'plan' | 'thinking' | 'tool_result' | 'answer_delta' | 'answer' | 'citation_warning' | 'complete' | 'error' | 'budget_escalated' | 'evidence_update';
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
  /** If true, allow auto-escalation to deep budget without user confirmation */
  allowDeepEscalation?: boolean;
}

/** Cached result from /api/chat/plan for reuse during execution */
interface PlanSession {
  classification: ChatIntentClassification;
  toolDefs: ToolDefinition[];
  plan: ExecutionPlan;
  query: string;
  createdAt: number;
  /** Pre-fetched document chain result (to avoid re-fetching during execution) */
  prefetchedChainResult?: any;
}

// ============================
// Constants
// ============================

const CITATION_CHECK_TIMEOUT_MS = 5_000;

// Tools where deduplication hashes only on the primary key (e.g. caseNumber),
// ignoring secondary params like groupByInstance, includeFullText, maxDocs.
const COARSE_HASH_TOOLS: Record<string, string[]> = {
  get_case_documents_chain: ['case_number'],
  get_court_decision: ['doc_id', 'case_number'],
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
 * Estimated cost per SINGLE tool call (USD) at two budget tiers.
 * Includes BOTH tool API cost AND LLM processing cost for one iteration.
 *
 * Budget tiers map to different models on prod:
 *   standard → Sonnet 4.6  ($3/M input,  $15/M output)  — ~$0.03-0.06/iter
 *   deep     → Opus 4.6    ($15/M input, $75/M output)  — ~$0.20-0.80/iter
 *
 * Calibrated from production cost_tracking data (2026-03-11):
 *   Sonnet sessions (2-3 iters): $0.33-$0.74 total
 *   Opus sessions (5 iters):     $5-$15 total
 */
const STEP_COST_PER_CALL: Record<string, { standard: number; deep: number }> = {
  // Search tools — deep mode uses Opus + returns more results → much larger cost
  search_legal_precedents:         { standard: 0.05, deep: 0.40 },
  search_supreme_court_practice:   { standard: 0.05, deep: 0.40 },
  find_similar_fact_pattern_cases: { standard: 0.04, deep: 0.30 },
  compare_practice_pro_contra:     { standard: 0.05, deep: 0.40 },
  search_legislation:              { standard: 0.03, deep: 0.25 },
  find_relevant_law_articles:      { standard: 0.03, deep: 0.25 },
  search_procedural_norms:         { standard: 0.03, deep: 0.25 },
  // Fixed-output tools — cost still differs because deep → Opus model
  get_court_decision:              { standard: 0.04, deep: 0.30 },
  get_case_documents_chain:        { standard: 0.05, deep: 0.35 },
  get_legislation_article:         { standard: 0.02, deep: 0.15 },
  get_legislation_structure:       { standard: 0.01, deep: 0.10 },
  load_full_texts:                 { standard: 0.06, deep: 0.50 },
  semantic_search:                 { standard: 0.03, deep: 0.25 },
  list_documents:                  { standard: 0.01, deep: 0.10 },
  count_cases_by_party:            { standard: 0.02, deep: 0.15 },
};

const DEFAULT_STEP_COST_PER_CALL = { standard: 0.04, deep: 0.30 };

/**
 * Typical number of tool invocations per plan step.
 * Some tools are called once, others are called multiple times
 * (e.g., get_court_decision is called per each decision in the case chain).
 */
const TYPICAL_CALLS: Record<string, number> = {
  get_court_decision:              4,  // Per decision: district, appeal, cassation, Grand Chamber
  load_full_texts:                 2,  // May need multiple batches for many documents
  get_legislation_article:         2,  // Often multiple articles referenced
  get_case_documents_chain:        1,
  search_legal_precedents:         1,
  search_supreme_court_practice:   1,
  find_similar_fact_pattern_cases: 1,
  compare_practice_pro_contra:     1,
  search_legislation:              1,
  find_relevant_law_articles:      1,
  search_procedural_norms:         1,
  get_legislation_structure:       1,
  semantic_search:                 1,
  list_documents:                  1,
  count_cases_by_party:            1,
};

const DEFAULT_TYPICAL_CALLS = 1;

/**
 * Fixed overhead cost (USD) per request by budget tier.
 * - Classification: ~$0.005 (always Haiku)
 * - Plan generation: ~$0.08 (always Opus 4.6)
 * - Final synthesis: ~$0.04 (Sonnet) or ~$0.50 (Opus)
 *
 * Calibrated from prod: plan_generation alone costs $0.055-$0.107
 */
const PLAN_OVERHEAD_COST: Record<string, number> = { standard: 0.14, deep: 0.70 };

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
  private nameVariationService: NameVariationService;
  private toolGroupMetricsCallback?: (groups: string) => void;

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
    this.nameVariationService = new NameVariationService(llm);

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

  setToolGroupMetricsCallback(cb: (groups: string) => void): void {
    this.toolGroupMetricsCallback = cb;
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
    const toolDefs = await this.intentClassifier.filterTools(classification.domains, classification.slots, classification.queryType);

    // Fast plan queries (case_number, EDRPOU, legislation, deputy) skip plan review —
    // they're deterministic and don't need user confirmation
    const fastPlan = this.fastPlanLookup(classification, toolDefs);
    if (fastPlan) {
      logger.info('[ChatService] Fast plan detected in generatePlanForReview, skipping review', {
        queryType: classification.queryType,
        steps: fastPlan.steps.map(s => s.tool),
      });
      return null;
    }

    const plan = await this.generateExecutionPlan(query, classification, toolDefs, requestId);

    if (!plan) return null;

    // Pre-fetch document count for case-based queries to get accurate cost estimates.
    // get_case_documents_chain is fast (~200-500ms) and gives us exact document counts.
    // The result is cached in the plan session so execution doesn't re-fetch it.
    let docCount = 0;
    let prefetchedChainResult: any = undefined;
    const caseNumber = classification.slots?.case_number;
    if (caseNumber && plan.steps.some(s => ['get_court_decision', 'load_full_texts', 'get_case_documents_chain'].includes(s.tool))) {
      try {
        prefetchedChainResult = await this.toolRegistry.executeTool('get_case_documents_chain', {
          case_number: caseNumber,
          group_by_instance: false,
        });
        const parsed = typeof prefetchedChainResult === 'string' ? JSON.parse(prefetchedChainResult) : prefetchedChainResult;
        docCount = parsed?.total_documents || parsed?.data?.total_documents || 0;
        logger.info('[ChatService] Pre-fetched document chain for cost estimation', {
          caseNumber,
          docCount,
        });
      } catch (e) {
        logger.warn('[ChatService] Failed to pre-fetch document chain for cost estimation', {
          error: (e as Error).message,
        });
      }
    }

    // Apply LLM-recommended depth and estimate costs per step
    for (const step of plan.steps) {
      if (step.recommendedDepth) {
        step.depth = step.recommendedDepth;
      } else if (!step.depth) {
        step.depth = 'standard';
      }
    }

    // Predict effective budget tier (mirrors escalation logic in chat()):
    //   any deep step → deep, 5+ steps → deep, court practice analysis → deep
    const hasDeepSteps = plan.steps.some(s => s.depth === 'deep');
    const PRACTICE_KW = /проаналізу|аналіз практик|судова практика|знайти справи|знайти практику|огляд практики|яка практика|як суди|позиція судів/i;
    const willEscalateToDeep =
      hasDeepSteps ||
      plan.steps.length >= 5 ||
      (classification.domains.includes('court') && PRACTICE_KW.test(query));
    const effectiveTier: 'standard' | 'deep' = willEscalateToDeep ? 'deep' : 'standard';

    // Calculate cost per step using predicted budget tier
    for (const step of plan.steps) {
      let calls = TYPICAL_CALLS[step.tool] || DEFAULT_TYPICAL_CALLS;
      if (docCount > 0) {
        if (step.tool === 'get_court_decision') {
          calls = docCount;
        } else if (step.tool === 'load_full_texts') {
          calls = Math.ceil(docCount / 5);
        }
      }
      const costPerCall = STEP_COST_PER_CALL[step.tool] || DEFAULT_STEP_COST_PER_CALL;
      step.estimatedCalls = calls;
      step.estimatedCost = costPerCall[effectiveTier] * calls;
    }

    // Overhead: classification + plan gen (Opus) + final synthesis (model depends on tier)
    const baseOverhead = PLAN_OVERHEAD_COST[effectiveTier] || PLAN_OVERHEAD_COST.standard;
    plan.overheadCost = docCount > 5
      ? baseOverhead + (docCount - 5) * (effectiveTier === 'deep' ? 0.03 : 0.005)
      : baseOverhead;

    // Cache session for reuse
    const planSessionId = `plan-${Date.now()}-${randomBytes(4).toString('hex')}`;
    this.planSessions.set(planSessionId, {
      classification,
      toolDefs,
      plan,
      query,
      createdAt: Date.now(),
      prefetchedChainResult,
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
   * Fast plan lookup for deterministic query types.
   * Returns a pre-built plan if the classification is simple enough,
   * skipping the plan-generation LLM call (saves 200-400ms).
   */
  private fastPlanLookup(
    classification: ChatIntentClassification,
    toolDefs: ToolDefinition[]
  ): ExecutionPlan | null {
    const slots = classification.slots || {};
    const toolNames = new Set(toolDefs.map(t => t.name));

    // EDRPOU → single registry lookup
    if (slots.edrpou && classification.queryType === 'registry_lookup' && toolNames.has('openreyestr_get_by_edrpou')) {
      return {
        goal: `Пошук юридичної особи за ЄДРПОУ ${slots.edrpou}`,
        steps: [{
          id: 1,
          tool: 'openreyestr_get_by_edrpou',
          params: { edrpou: slots.edrpou },
          purpose: 'Отримати дані з реєстру',
        }],
        expected_iterations: 1,
      };
    }

    // Single case number → case document chain
    if (
      slots.case_number &&
      !slots.law_reference &&
      classification.queryType === 'case_lookup' &&
      toolNames.has('get_case_documents_chain')
    ) {
      return {
        goal: `Отримати документи справи ${slots.case_number}`,
        steps: [{
          id: 1,
          tool: 'get_case_documents_chain',
          params: { case_number: slots.case_number, include_full_text: true },
          purpose: 'Отримати всі документи справи',
        }],
        expected_iterations: 2,
      };
    }

    // Legislation article lookup
    if (
      slots.law_reference &&
      !slots.case_number &&
      classification.queryType === 'legislation_lookup' &&
      toolNames.has('get_legislation_article')
    ) {
      return {
        goal: `Отримати текст ${slots.law_reference}`,
        steps: [{
          id: 1,
          tool: 'get_legislation_article',
          params: { query: slots.law_reference },
          purpose: 'Знайти статтю закону',
        }],
        expected_iterations: 1,
      };
    }

    // Deputy info lookup
    if (
      slots.deputy_name &&
      classification.queryType === 'parliament_query' &&
      toolNames.has('rada_get_deputy_info')
    ) {
      return {
        goal: `Інформація про депутата ${slots.deputy_name}`,
        steps: [{
          id: 1,
          tool: 'rada_get_deputy_info',
          params: { name: slots.deputy_name },
          purpose: 'Отримати інформацію про депутата',
        }],
        expected_iterations: 1,
      };
    }

    return null;
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
        const conv = await this.conversationService.createConversation(request.userId, titlePreview, { requestId });
        request.conversationId = conv.id;
        logger.info('[ChatService] Auto-created conversation for request without conversationId', {
          conversationId: conv.id,
          userId: request.userId,
          requestId,
        });
      } catch (e) {
        logger.warn('[ChatService] Failed to auto-create conversation', { error: (e as Error).message });
      }
    } else if (this.conversationService && request.conversationId && requestId) {
      // Link request_id to existing conversation for log traceability
      this.conversationService.updateRequestId(request.conversationId, requestId).catch(() => {});
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

    // Emit early thinking event so client sees immediate feedback
    yield {
      type: 'thinking',
      data: { step: 0, tool: '_init', description: 'Аналізую запит...' },
    };

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
          // Seed search cache with pre-fetched document chain result
          if (session.prefetchedChainResult && this.searchCache) {
            const caseNum = classification.slots?.case_number;
            if (caseNum) {
              this.searchCache.cacheResult(
                'get_case_documents_chain',
                { case_number: caseNum, group_by_instance: false },
                session.prefetchedChainResult,
                request.userId
              ).catch(() => {});
            }
          }
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
          toolDefs = await this.intentClassifier.filterTools(classification.domains, classification.slots, classification.queryType);
          plan = await this.generateExecutionPlan(query, classification, toolDefs, requestId);
        }
      } else {
        // Standard flow: classify + generate plan
        classification = await this.intentClassifier.classify(query, requestId);
        toolDefs = await this.intentClassifier.filterTools(classification.domains, classification.slots, classification.queryType);

        // Try fast plan lookup for deterministic query types (skips LLM plan generation)
        const fastPlan = this.fastPlanLookup(classification, toolDefs);
        if (fastPlan) {
          plan = fastPlan;
          logger.info('[ChatService] Used fast plan lookup, skipped plan generation LLM call', {
            queryType: classification.queryType,
            steps: fastPlan.steps.map(s => s.tool),
          });
        } else {
          plan = await this.generateExecutionPlan(query, classification, toolDefs, requestId);
        }
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
          const listDocEvidence = extractFromToolResult('list_documents', toolResult);
          yield {
            type: 'tool_result',
            data: {
              tool: 'list_documents',
              result: toolResult,
              evidence: listDocEvidence,
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

      // Budget escalation (tightened to avoid unnecessary slow-model paths):
      //    - Any step marked "deep" by user → deep budget
      //    - Plan with >= 5 steps → deep (raised from 3 to keep most queries on standard)
      //    - Court practice analysis query → deep (needs full doc content + long response)
      let effectiveBudget: BudgetKey = budget;
      const hasDeepSteps = plan?.steps.some(s => s.depth === 'deep');
      const PRACTICE_ANALYSIS_KEYWORDS = /проаналізу|аналіз практик|судова практика|знайти справи|знайти практику|огляд практики|яка практика|як суди|позиція судів/i;
      if (hasDeepSteps) {
        effectiveBudget = 'deep';
        logger.info('[ChatService] Escalated to deep budget (user chose deep steps)', {
          deepSteps: plan!.steps.filter(s => s.depth === 'deep').map(s => s.tool),
        });
      } else if (plan && plan.steps.length >= 5) {
        effectiveBudget = 'deep';
        logger.info('[ChatService] Escalated to deep budget (plan >= 5 steps)', {
          stepCount: plan.steps.length,
        });
      } else if (
        classification.domains.includes('court') &&
        PRACTICE_ANALYSIS_KEYWORDS.test(query)
      ) {
        if (request.allowDeepEscalation) {
          effectiveBudget = 'deep';
          logger.info('[ChatService] Escalated to deep budget (user confirmed court practice analysis)', {
            queryLength: query.length,
            domains: classification.domains,
          });
        } else {
          // Stay on standard, notify user they can re-run with deep
          logger.info('[ChatService] Deep budget recommended but not confirmed, staying on standard', {
            queryLength: query.length,
            domains: classification.domains,
          });
          yield {
            type: 'budget_escalated',
            data: {
              reason: 'court_practice_analysis',
              estimatedCost: { minUsd: 0.30, maxUsd: 0.90 },
              requiresConfirmation: true,
            },
          };
        }
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
      const estimatedTokens = Math.ceil(totalChars / 2.2); // ~2.2 chars per token for Cyrillic/Ukrainian
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

      // Cumulative evidence tracking for evidence_update events (Phase 3)
      const cumulativeDecisions: import('@secondlayer/shared').Decision[] = [];
      const cumulativeCitations: import('@secondlayer/shared').Citation[] = [];
      const cumulativeDocuments: import('@secondlayer/shared').VaultDocument[] = [];
      const seenDecisionIds = new Set<string>();
      const seenCitationKeys = new Set<string>();
      const seenDocumentIds = new Set<string>();

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
            // Estimate tokens from content length (~2.2 chars/token for Cyrillic/Ukrainian)
            const estPromptTokens = Math.ceil(messages.reduce((s, m) => s + (m.content?.length || 0), 0) / 2.2);
            const estCompletionTokens = Math.ceil((fullContent.length + JSON.stringify(toolCalls).length) / 2.2);
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

          // Extract norm references from the answer text (Phase 2)
          const answerNorms = extractNormsFromAnswer(fullContent);
          // Add answer norms to cumulative citations
          for (const n of answerNorms) {
            const key = n.source.toLowerCase().replace(/\s+/g, ' ').trim();
            if (!seenCitationKeys.has(key)) {
              seenCitationKeys.add(key);
              cumulativeCitations.push(n);
            }
          }

          yield {
            type: 'answer',
            data: {
              text: fullContent,
              provider: selection.provider,
              model: selection.model,
              norms: answerNorms.length > 0 ? answerNorms : undefined,
            },
          };

          // Final evidence_update with norms included
          if (cumulativeDecisions.length > 0 || cumulativeCitations.length > 0 || cumulativeDocuments.length > 0) {
            yield {
              type: 'evidence_update',
              data: {
                decisions: cumulativeDecisions,
                citations: cumulativeCitations,
                documents: cumulativeDocuments,
              },
            };
          }
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
          // Build per-tool nudge with alternative suggestions
          for (const call of toolCalls) {
            let note = 'Цей інструмент вже було викликано з такими параметрами. Використай наявні результати.';
            if (call.name === 'get_legislation_article') {
              note += ' Якщо потрібний закон не знайдено — спробуй search_legislation або find_relevant_law_articles для пошуку за описом ситуації.';
            } else if (call.name === 'get_court_decision' || call.name === 'get_case_documents_chain') {
              note += ' Якщо потрібна справа не знайдена — спробуй search_edrsr_fulltext з іншими ключовими словами.';
            }
            messages.push({
              role: 'tool',
              content: JSON.stringify({ note }),
              tool_call_id: call.id,
            });
          }
          // Detect if duplicate calls include legislation lookups without prior search
          const hasLegislationDupes = duplicateToolCalls.some(c => c.name === 'get_legislation_article');
          const hasUsedSearch = collectedToolCalls.some(c =>
            c.name === 'search_legislation' || c.name === 'find_relevant_law_articles'
          );
          let nudge = 'Дані вже отримано. Перейди до аналізу на основі зібраних результатів. Не повторюй виклики інструментів.';
          if (hasLegislationDupes && !hasUsedSearch) {
            nudge = 'get_legislation_article не дав результату. Спочатку визнач потрібний закон через find_relevant_law_articles або search_legislation, а потім виклич get_legislation_article з отриманим rada_id. Не повторюй попередні виклики.';
          }
          messages.push({
            role: 'user',
            content: nudge,
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

          // Extract evidence server-side and include in tool_result event.
          // The FULL result is kept for backward compatibility; `evidence` is the new field.
          const toolEvidence = extractFromToolResult(call.name, toolResult);

          yield {
            type: 'tool_result',
            data: {
              tool: call.name,
              result: toolResult,
              evidence: toolEvidence,
              cached,
              cost_usd: iterationCostUsd,
            },
          };

          // Accumulate cumulative evidence (deduplicated) for evidence_update
          for (const d of toolEvidence.decisions) {
            if (!seenDecisionIds.has(d.id)) {
              seenDecisionIds.add(d.id);
              cumulativeDecisions.push(d);
            }
          }
          for (const c of toolEvidence.citations) {
            const key = c.source.toLowerCase().replace(/\s+/g, ' ').trim();
            if (!seenCitationKeys.has(key)) {
              seenCitationKeys.add(key);
              cumulativeCitations.push(c);
            }
          }
          for (const doc of toolEvidence.documents) {
            if (!seenDocumentIds.has(doc.id)) {
              seenDocumentIds.add(doc.id);
              cumulativeDocuments.push(doc);
            }
          }

          // Emit cumulative evidence_update after each tool result
          if (cumulativeDecisions.length > 0 || cumulativeCitations.length > 0 || cumulativeDocuments.length > 0) {
            yield {
              type: 'evidence_update',
              data: {
                decisions: cumulativeDecisions,
                citations: cumulativeCitations,
                documents: cumulativeDocuments,
              },
            };
          }

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
            const fallbackNorms = extractNormsFromAnswer(fallbackContent);
            for (const n of fallbackNorms) {
              const key = n.source.toLowerCase().replace(/\s+/g, ' ').trim();
              if (!seenCitationKeys.has(key)) {
                seenCitationKeys.add(key);
                cumulativeCitations.push(n);
              }
            }
            yield {
              type: 'answer',
              data: {
                text: fallbackContent,
                provider: selection.provider,
                model: selection.model,
                norms: fallbackNorms.length > 0 ? fallbackNorms : undefined,
              },
            };
            if (cumulativeDecisions.length > 0 || cumulativeCitations.length > 0 || cumulativeDocuments.length > 0) {
              yield {
                type: 'evidence_update',
                data: {
                  decisions: cumulativeDecisions,
                  citations: cumulativeCitations,
                  documents: cumulativeDocuments,
                },
              };
            }
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
            cost_summary: totalCostUsd > 0 ? { total_cost_usd: totalCostUsd, tools_used: toolsUsed, response_id: requestId } : undefined,
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
        estimatedTokens: Math.ceil(totalChars / 2.2),
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

    // Meta-tool: request_additional_tools — returns available tools by group
    if (call.name === 'request_additional_tools') {
      const { resolveToolGroupsByIds } = await import('../prompts/tool-registry-catalog.js');
      const groupIds = call.arguments?.groups;
      if (Array.isArray(groupIds)) {
        const toolNames = resolveToolGroupsByIds(groupIds);
        const allDefs = await this.toolRegistry.getAllToolDefinitions();
        const matchedTools = allDefs
          .filter(d => toolNames.includes(d.name))
          .map(d => ({ name: d.name, description: d.description }));
        toolResult = {
          message: `Додаткові інструменти для груп [${groupIds.join(', ')}]:`,
          tools: matchedTools,
          hint: 'Тепер ви можете використовувати ці інструменти у наступних кроках.',
        };
        logger.info('[ChatService] Meta-tool request_additional_tools invoked', {
          groups: groupIds,
          toolsReturned: matchedTools.length,
        });
        this.toolGroupMetricsCallback?.(groupIds.join(','));
      } else {
        toolResult = { error: 'Параметр groups має бути масивом ідентифікаторів груп (edrsr_search, court_practice, legislation, registry, parliament, vault, procedural, due_diligence, echr)' };
        logger.warn('[ChatService] Meta-tool request_additional_tools called with invalid args', {
          args: call.arguments,
        });
      }
      return { call, result: toolResult, cached: false };
    }

    // Check cache for court search tools
    if (this.searchCache && isCourtSearchTool(call.name)) {
      const hit = await this.searchCache.getCachedResult(call.name, call.arguments, userId);
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

      // Post-execution: retry entity search with name variations if not found
      if (call.name === 'openreyestr_search_entities' && this.isEntityNotFound(toolResult) && call.arguments?.query) {
        toolResult = await this.retryWithNameVariations(call.name, call.arguments, toolResult);
      }

      // Post-execution: cache result & trigger background downloads
      if (this.searchCache && isCourtSearchTool(call.name) && !toolResult?.error) {
        this.searchCache.cacheResult(call.name, call.arguments, toolResult, userId);
        const docIds = this.searchCache.extractDocIds(toolResult);
        if (docIds.length > 0) {
          this.searchCache.triggerBackgroundDownloads(docIds);
        }
      }
    }

    return { call, result: toolResult, cached };
  }

  /**
   * Check if an OpenReyestr search result indicates "not found".
   */
  private isEntityNotFound(result: any): boolean {
    if (Array.isArray(result) && result.length === 1 && result[0]?.found === false) {
      return true;
    }
    // Result may come wrapped in MCP content format
    if (result?.content && Array.isArray(result.content)) {
      try {
        const textBlock = result.content.find((b: any) => b.type === 'text');
        if (textBlock?.text) {
          const parsed = JSON.parse(textBlock.text);
          if (Array.isArray(parsed) && parsed.length === 1 && parsed[0]?.found === false) {
            return true;
          }
        }
      } catch { /* not JSON, ignore */ }
    }
    return false;
  }

  /**
   * Retry entity search with LLM-generated name spelling variations.
   * Searches sequentially with early exit on first match.
   */
  private async retryWithNameVariations(
    toolName: string,
    originalArgs: any,
    originalResult: any
  ): Promise<any> {
    const variations = await this.nameVariationService.generateVariations(originalArgs.query);
    if (variations.length === 0) return originalResult;

    logger.info('[ChatService] Retrying entity search with name variations', {
      original: originalArgs.query,
      variations,
    });

    for (const variant of variations) {
      try {
        const variantResult = await this.toolRegistry.executeTool(toolName, {
          ...originalArgs,
          query: variant,
        });

        if (!this.isEntityNotFound(variantResult)) {
          logger.info('[ChatService] Name variation matched', {
            original: originalArgs.query,
            matchedVariant: variant,
          });

          // Return results with metadata about the name variation
          if (Array.isArray(variantResult)) {
            return {
              _nameVariation: {
                originalQuery: originalArgs.query,
                matchedVariant: variant,
                attemptedVariants: variations,
              },
              results: variantResult,
            };
          }
          return variantResult;
        }
      } catch (err: any) {
        logger.warn('[ChatService] Variant search failed', { variant, error: err.message });
      }
    }

    // No matches found — enrich original result with attempted variants
    if (Array.isArray(originalResult) && originalResult.length > 0) {
      originalResult[0].attemptedVariants = variations;
    }
    return originalResult;
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

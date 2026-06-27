/**
 * MCPQueryAPI - Core query routing tools
 *
 * After extraction, this class keeps only 4 lightweight routing/validation tools:
 * - classify_intent
 * - retrieve_legal_sources
 * - validate_response
 * - check_precedent_status
 *
 * Consolidated tools:
 * - analyze_legal_patterns → merged into analyze_patterns (pattern-analysis-tools.ts)
 * - find_relevant_law_articles → merged into search_legislation (legislation-tools.ts)
 *
 * Domain tools have been extracted to:
 * - CourtDecisionTools (tools/court-decision-tools.ts)
 * - ProceduralTools (tools/procedural-tools.ts)
 * - LegalAdviceTools (tools/legal-advice-tools.ts)
 */

import {
  QueryPlanner,
} from '../services/query-planner.js';
import { EdsrLocalAdapter } from '../adapters/edrsr-local-adapter.js';
import type { IEmbeddingPort } from '../domain/ports/index.js';
import { LegalPatternStore } from '../services/legal-pattern-store.js';
import { CitationValidator } from '../services/citation-validator.js';
import { HallucinationGuard } from '../services/hallucination-guard.js';
import { logger } from '../utils/logger.js';
import { LegislationTools } from './legislation-tools.js';
import { BaseToolHandler, ToolDefinition, ToolResult } from './base-tool-handler.js';
import { extractSourceStrings, generateCaseNumberVariations } from './tool-utils.js';
import type { CitationGraphService } from '../services/citation-graph-service.js';

export type StreamEventCallback = (event: {
  type: string;
  data: any;
  id?: string;
}) => void;

export class MCPQueryAPI extends BaseToolHandler {
  constructor(
    private queryPlanner: QueryPlanner,
    private zoAdapter: EdsrLocalAdapter,
    private zoPracticeAdapter: EdsrLocalAdapter,
    private embeddingService: IEmbeddingPort,
    private patternStore: LegalPatternStore,
    private citationValidator: CitationValidator,
    private hallucinationGuard: HallucinationGuard,
    private legislationTools: LegislationTools,
    private citationGraphService?: CitationGraphService
  ) {
    super();
  }

  private async classifyIntentTool(args: any) {
    const query = String(args?.query || '').trim();
    if (!query) {
      throw new Error('query parameter is required');
    }
    const budget = (args?.budget || args?.reasoning_budget || 'standard') as 'quick' | 'standard' | 'deep';

    logger.info('[MCP Tool] classify_intent started', { query: query.substring(0, 100), budget });
    const intent = await this.queryPlanner.classifyIntent(query, budget);
    const domains = Array.isArray(intent?.domains) ? intent.domains : [];

    const looksLikeWorkflow = domains.includes('workflow') || /workflow|інтеграц|integration/i.test(query);
    const looksLikeVault = /vault|сховищ|хранилищ/i.test(query);
    const looksLikeDD = /due\s*diligence|dd\b|перевірк|провер|m&a/i.test(query);

    const service = looksLikeWorkflow
      ? 'workflow_automation'
      : looksLikeVault
        ? 'document_vault'
        : looksLikeDD
          ? 'due_diligence'
          : 'legal_research';

    const task = service === 'document_vault'
      ? 'semantic_search'
      : service === 'workflow_automation'
        ? 'run_workflow'
        : service === 'due_diligence'
          ? 'bulk_review'
          : 'answer_question';

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              service,
              task,
              inputs: {
                question: query,
                jurisdiction: 'UA',
                language: 'uk',
              },
              depth: budget,
              confidence: typeof intent?.confidence === 'number' ? intent.confidence : 0.7,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async retrieveLegalSourcesTool(args: any) {
    const ctx = args?.context && typeof args.context === 'object' ? args.context : {};
    const query = String(ctx?.query || ctx?.search_query || args?.query || '').trim();
    if (!query) {
      throw new Error('context.query is required');
    }

    const casesLimitRaw = args?.limits?.cases ?? args?.limit ?? 10;
    const lawsLimitRaw = args?.limits?.laws ?? 10;
    const guidanceLimitRaw = args?.limits?.guidance ?? 5;
    const casesLimit = Math.min(50, Math.max(0, Number(casesLimitRaw)));
    const lawsLimit = Math.min(50, Math.max(0, Number(lawsLimitRaw)));
    const guidanceLimit = Math.min(50, Math.max(0, Number(guidanceLimitRaw)));

    const searchParams: any = {
      meta: { search: query },
      limit: Math.min(50, Math.max(0, casesLimit)),
      offset: 0,
    };

    const resp = await this.zoAdapter.searchCourtDecisions(searchParams);
    const norm = await this.zoAdapter.normalizeResponse(resp);
    const rawCases = Array.isArray(norm?.data) ? norm.data : [];

    const cases = rawCases.slice(0, casesLimit).map((d: any) => {
      const docId = d?._raw?.doc_id ?? d?.doc_id ?? d?.zakononline_id;
      const title = d?.title || d?.case_title || d?.doc_title || `case_${docId}`;
      const url = d?.url || d?.link || d?._raw?.url;
      const date = d?.adjudication_date || d?.date_publ || d?.date;
      const court = d?.court || d?.court_name || d?.chamber;
      const text = typeof d?.full_text === 'string'
        ? d.full_text
        : typeof d?.snippet === 'string'
          ? d.snippet
          : '';

      return {
        id: String(docId ?? ''),
        source: 'zakononline',
        title: String(title || ''),
        url: url ? String(url) : undefined,
        date: date ? String(date).slice(0, 10) : undefined,
        court: court ? String(court) : undefined,
        text: text ? String(text) : undefined,
      };
    });

    const lawsResp = lawsLimit > 0
      ? await this.legislationTools.searchLegislation({ query, limit: lawsLimit } as any)
      : { articles: [] };
    const lawArticles = Array.isArray(lawsResp?.articles) ? lawsResp.articles : [];
    const laws = lawArticles.slice(0, lawsLimit).map((a: any) => ({
      id: `${a?.rada_id || ''}:${a?.article_number || ''}`.replace(/:$/, ''),
      source: 'rada',
      title: a?.title || 'law_article',
      url: a?.url,
      article: a?.article_number,
      text: a?.full_text,
      rada_id: a?.rada_id,
    }));

    const guidance = guidanceLimit > 0 ? [] : [];

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              cases,
              laws,
              guidance,
              confidence: cases.length > 0 || laws.length > 0 ? 0.75 : 0.3,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async validateResponseTool(args: any) {
    const answer = String(args?.answer || '').trim();
    if (!answer) {
      throw new Error('answer parameter is required');
    }

    const sources = extractSourceStrings(args?.sources);
    const validation = await this.hallucinationGuard.validateResponse(answer, sources);

    const issues: Array<{ type: string; message: string }> = [];
    for (const c of validation.claims_without_sources || []) {
      issues.push({ type: 'missing_source', message: c });
    }
    for (const c of validation.invalid_citations || []) {
      issues.push({ type: 'invalid_citation', message: c });
    }
    for (const w of validation.warnings || []) {
      issues.push({ type: 'warning', message: w });
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              is_valid: Boolean(validation.is_valid),
              confidence: typeof validation.confidence === 'number' ? validation.confidence : 0.5,
              issues,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  private async checkPrecedentStatus(args: any) {
    const caseId = args.case_id || args.doc_id || '';
    const caseNumber = args.case_number || '';

    const status = await this.citationValidator.validatePrecedentStatus(caseId, caseNumber || undefined);

    // Best-effort precedent-weight signal from the decision↔case graph (Neo4j,
    // LEXAI-1777): how many decisions cite this case. Gated by CITATION_BACKEND=neo4j;
    // non-fatal. The PG shepardization above remains the authoritative validity check.
    let citationGraph: any = undefined;
    if (this.citationGraphService?.isEnabled() && caseNumber) {
      try {
        const variations = generateCaseNumberVariations(caseNumber);
        const stat = await this.citationGraphService.getCaseStats(variations);
        if (stat && (stat.citingDecisions > 0 || stat.departedByDecision)) {
          citationGraph = {
            backend: 'neo4j',
            cited_by_decisions: stat.citingDecisions,
            documents_in_case: stat.memberCount || undefined,
            latest_doc_id: stat.latestDocId || undefined,
            ...(stat.departedByDecision
              ? {
                  position_departed_from: {
                    by_grand_chamber_decision: stat.departedByDecision,
                    on: stat.departedOn || undefined,
                    note: 'Правову позицію у цій справі відступлено Великою Палатою ВС — прецедент може бути нечинним.',
                  },
                }
              : {}),
          };
        }
      } catch (error: any) {
        logger.warn('[check_precedent_status] citation-graph enrichment failed (non-fatal)', {
          caseNumber,
          error: error?.message,
        });
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ status, ...(citationGraph ? { citation_graph: citationGraph } : {}) }, null, 2),
        },
      ],
    };
  }

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'classify_intent',
        annotations: { title: 'Класифікація запиту', readOnlyHint: true },
        description: 'Класифікація запиту: service/task/depth (entry-point для роутингу pipeline)',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            context: { type: 'object' },
            reasoning_budget: { type: 'string', enum: ['quick', 'standard', 'deep'] },
          },
          required: ['query'],
        },
      },
      {
        name: 'retrieve_legal_sources',
        annotations: { title: 'RAG витяг джерел', readOnlyHint: true },
        description: 'RAG retrieval: повертає сирі джерела (справи/закони/роз\'яснення) без аналізу',
        inputSchema: {
          type: 'object',
          properties: {
            context: { type: 'object' },
            limits: {
              type: 'object',
              properties: {
                cases: { type: 'number' },
                laws: { type: 'number' },
                guidance: { type: 'number' },
              },
            },
          },
          required: ['context'],
        },
      },
      {
        name: 'validate_response',
        annotations: { title: 'Валідація відповіді', readOnlyHint: true },
        description: 'Trust layer: перевірка, що відповідь спирається на джерела (anti-hallucination)',
        inputSchema: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
            sources: { type: 'array', items: { type: 'object' } },
          },
          required: ['answer', 'sources'],
        },
      },
      {
        name: 'check_precedent_status',
        annotations: { title: 'Статус прецеденту', readOnlyHint: true, idempotentHint: true },
        description: `Перевіряє актуальність судового рішення: чи не скасовано вищою інстанцією. Шукає ланцюг інстанцій у ZakonOnline, визначає статус: valid, explicitly_overruled, limited, unknown.

Приймає: case_number (номер справи, наприклад 922/989/18), case_id (UUID документа) або doc_id (zakononline_id).

💰 Вартість: $0.00-$0.02 USD (кешується 24 год у Redis, 7 днів у PostgreSQL)`,
        inputSchema: {
          type: 'object',
          properties: {
            case_id: { type: 'string', description: 'UUID документа з бази даних' },
            case_number: { type: 'string', description: 'Номер справи (наприклад: 922/989/18)' },
            doc_id: { type: 'string', description: 'ZakonOnline document ID' },
          },
        },
      },
    ];
  }

  /** Backward-compat alias for getToolDefinitions() */
  getTools() {
    return this.getToolDefinitions();
  }

  async executeTool(name: string, args: any): Promise<ToolResult | null> {
    if (!this.handles(name)) return null;
    return await this.handleToolCall(name, args);
  }

  async handleToolCall(name: string, args: any): Promise<any> {
    const startTime = Date.now();
    logger.info('[MCP] Tool call initiated', { toolName: name });

    try {
      let result;
      switch (name) {
        case 'classify_intent':
          result = await this.classifyIntentTool(args);
          break;
        case 'retrieve_legal_sources':
          result = await this.retrieveLegalSourcesTool(args);
          break;
        case 'validate_response':
          result = await this.validateResponseTool(args);
          break;
        case 'check_precedent_status':
          result = await this.checkPrecedentStatus(args);
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      const duration = Date.now() - startTime;
      logger.info('[MCP] Tool call completed', { toolName: name, durationMs: duration });
      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error('[MCP] Tool call failed', { toolName: name, durationMs: duration, error: error.message });
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
}

/**
 * Legal Advice Tools - Handlers for precedent search, citation analysis, and answer formatting
 *
 * 4 tools:
 * - format_answer_pack
 * - search_legal_precedents
 * - get_similar_reasoning
 * - get_citation_graph
 */

import { QueryPlanner } from '../../services/query-planner.js';
import { ZOAdapter } from '../../adapters/zo-adapter.js';
import { SemanticSectionizer } from '../../services/semantic-sectionizer.js';
import { EmbeddingService } from '../../services/embedding-service.js';
import { LegalPatternStore } from '../../services/legal-pattern-store.js';
import { CitationValidator } from '../../services/citation-validator.js';
import { ShepardizationService, ShepardizationResult } from '../../services/shepardization-service.js';
import { SectionType } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { CourtDecisionHTMLParser, extractSearchTermsWithAI } from '../../utils/html-parser.js';
import { BaseToolHandler, ToolDefinition, ToolResult } from '../base-tool-handler.js';
import { countAllResults } from '../tool-utils.js';

/** Max cases to enrich with precedent status per search (cost/latency guard) */
const MAX_SHEPARDIZATION_BATCH = 15;

export class LegalAdviceTools extends BaseToolHandler {
  constructor(
    private queryPlanner: QueryPlanner,
    private zoAdapter: ZOAdapter,
    private zoPracticeAdapter: ZOAdapter,
    private sectionizer: SemanticSectionizer,
    private embeddingService: EmbeddingService,
    private patternStore: LegalPatternStore,
    private citationValidator: CitationValidator,
    private shepardizationService?: ShepardizationService
  ) {
    super();
  }

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'format_answer_pack',
        description: `Упаковщик результата в структуру norm/position/conclusion/risks (структурно, без генерации текста)`,
        inputSchema: {
          type: 'object',
          properties: {
            desired_output: { type: 'string' },
            norm: { type: ['object', 'string', 'null'] },
            position: { type: ['object', 'string', 'null'] },
            conclusion: { type: ['object', 'string', 'null'] },
            risks: { type: ['object', 'string', 'null'] },
          },
          required: [],
        },
      },
      {
        name: 'search_legal_precedents',
        description: `Поиск юридических прецедентов с семантическим анализом

💰 Примерная стоимость: $0.03-$0.10 USD
Стоимость зависит от сложности запроса и количества результатов. Включает OpenAI API (embeddings), ZakonOnline API (поиск), SecondLayer MCP (обработка документов).`,
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Поисковый запрос' },
            domain: {
              type: 'string',
              enum: ['court', 'npa', 'echr', 'all'],
              default: 'all',
            },
            time_range: {
              type: 'object',
              properties: { from: { type: 'string' }, to: { type: 'string' } },
            },
            limit: { type: 'number', default: 10 },
            offset: { type: 'number', default: 0 },
            count_all: {
              type: 'boolean',
              default: false,
              description: 'Подсчитать ВСЕ результаты через пагинацию (может быть дорого и долго).',
            },
            sections: {
              type: 'array',
              items: { type: 'string', enum: Object.values(SectionType) },
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_similar_reasoning',
        description: `Находит похожие судебные обоснования по векторному сходству

💰 Примерная стоимость: $0.01-$0.03 USD
Векторный поиск по эмбеддингам. Включает OpenAI API (embeddings) и Qdrant (векторная БД).`,
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            section_type: { type: 'string', enum: Object.values(SectionType) },
            date_from: { type: 'string', description: 'YYYY-MM-DD' },
            date_to: { type: 'string', description: 'YYYY-MM-DD' },
            court: { type: 'string' },
            chamber: { type: 'string' },
            dispute_category: { type: 'string' },
            outcome: { type: 'string' },
            deviation_flag: { type: ['boolean', 'null'] },
            precedent_status: { type: 'string' },
            case_number: { type: 'string' },
            limit: { type: 'number', default: 10 },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_citation_graph',
        description: `Строит граф цитирований между делами: прямые и обратные связи

💰 Примерная стоимость: $0.005-$0.02 USD
Построение графа из базы данных. Минимальная стоимость (только PostgreSQL запросы).`,
        inputSchema: {
          type: 'object',
          properties: {
            case_id: { type: 'string' },
            depth: { type: 'number', default: 2 },
          },
          required: ['case_id'],
        },
      },
    ];
  }

  async executeTool(name: string, args: any): Promise<ToolResult | null> {
    switch (name) {
      case 'format_answer_pack':
        return await this.formatAnswerPack(args);
      case 'search_legal_precedents':
        return await this.searchLegalPrecedents(args);
      case 'get_similar_reasoning':
        return await this.getSimilarReasoning(args);
      case 'get_citation_graph':
        return await this.getCitationGraph(args);
      default:
        return null;
    }
  }

  private async formatAnswerPack(args: any): Promise<ToolResult> {
    const desiredOutput = typeof args.desired_output === 'string' ? args.desired_output : undefined;
    return this.wrapResponse({
      desired_output: desiredOutput,
      norm: args.norm || args.legal_framework || null,
      position: args.position || args.practice || null,
      conclusion: args.conclusion || null,
      risks: args.risks || args.counterarguments_and_risks || null,
      warning: 'format_answer_pack currently performs a structural packaging only.',
    });
  }

  private async getSimilarReasoning(args: any): Promise<ToolResult> {
    const defaultDateFrom = (() => {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 3);
      return d.toISOString().slice(0, 10);
    })();
    const defaultSupremeCourtChambers = ['ВП ВС', 'КЦС', 'КГС', 'КАС', 'ККС'];

    const queryEmbedding = await this.embeddingService.generateEmbedding(args.query);
    const similar = await this.embeddingService.searchSimilar(
      queryEmbedding,
      {
        section_type: args.section_type as SectionType,
        date_from: args.date_from || defaultDateFrom,
        date_to: args.date_to,
        court: args.court,
        chamber: args.chamber || defaultSupremeCourtChambers,
        dispute_category: args.dispute_category,
        outcome: args.outcome,
        deviation_flag: args.deviation_flag,
        precedent_status: args.precedent_status,
        case_number: args.case_number,
      },
      args.limit || 10
    );

    return this.wrapResponse({ similar });
  }

  private async getCitationGraph(args: any): Promise<ToolResult> {
    const graph = await this.citationValidator.buildCitationGraph(args.case_id, args.depth || 2);
    return this.wrapResponse({ graph });
  }

  private async searchLegalPrecedents(args: any): Promise<ToolResult> {
    const query = String(args.query || '').trim();
    if (!query) throw new Error('query parameter is required and cannot be empty');

    logger.info('[MCP Tool] search_legal_precedents called', {
      query: query.substring(0, 100),
      limit: args.limit || 10,
      offset: args.offset || 0,
      count_all: args.count_all || false,
    });

    if (args.count_all === true) {
      const countResult = await countAllResults(this.zoAdapter, query);
      return this.wrapResponse({
        query,
        count_all_mode: true,
        total_count: countResult.total_count,
        pages_fetched: countResult.pages_fetched,
        time_taken_ms: countResult.time_taken_ms,
        cost_estimate_usd: countResult.cost_estimate_usd,
        note: 'Підраховано через пагінацію. Перші результати включені для відображення в правій панелі.',
        warning: countResult.total_count >= 10000000
          ? 'Достигнут лимит безопасности в 10,000,000 результатов.'
          : null,
        // Include first page results so the right panel can display decisions
        results: countResult.first_results,
      });
    }

    // Case number detection for semantic search
    const caseNumberPattern = /\b(\d{1,4}\/\d{1,6}\/\d{2}(-\w)?)\b/;
    const caseNumberMatch = query.match(caseNumberPattern);

    if (caseNumberMatch) {
      const caseNumber = caseNumberMatch[1];
      try {
        const sourceCase = await this.zoAdapter.getDocumentByCaseNumber(caseNumber);
        if (!sourceCase) return await this.performRegularSearch(args);

        let textForAnalysis = '';
        let textSource = 'metadata';

        if (sourceCase.full_text) {
          try {
            if (sourceCase.full_text.includes('<html') || sourceCase.full_text.includes('<!DOCTYPE')) {
              const parser = new CourtDecisionHTMLParser(sourceCase.full_text);
              const paragraphs = parser.extractMainText();
              const sections = parser.identifySections(paragraphs);
              textForAnalysis = parser.extractKeyContent(sections);
              textSource = 'parsed_html_key_sections';
            } else {
              textForAnalysis = sourceCase.full_text.substring(0, 5000);
              textSource = 'full_text_truncated';
            }
            if (textForAnalysis.length > 5000) textForAnalysis = textForAnalysis.substring(0, 5000);
          } catch {
            textForAnalysis = sourceCase.full_text.substring(0, 5000);
            textSource = 'full_text_truncated_fallback';
          }
        } else {
          const parts = [sourceCase.title, sourceCase.resolution, sourceCase.snippet?.replace(/<[^>]*>/g, '')].filter(Boolean);
          textForAnalysis = parts.join('\n');
          textSource = 'combined_metadata';
        }

        if (!textForAnalysis || textForAnalysis.length < 50) return await this.performRegularSearch(args);

        const searchTerms = await extractSearchTermsWithAI(textForAnalysis);
        const smartQuery = searchTerms.searchQuery || searchTerms.disputeType || '';

        const requestedDisplay = args.limit || 10;
        const userOffset = args.offset || 0;
        const maxApiLimit = 1000;
        let similarCasesForDisplay: any[] = [];
        let totalFound = 0;
        let offset = userOffset;
        let pagesFetched = 0;
        let hasMore = true;
        const maxPages = 10000;

        while (hasMore && pagesFetched < maxPages) {
          const similarResponse = await this.zoAdapter.searchCourtDecisions({
            meta: { search: smartQuery },
            limit: maxApiLimit,
            offset,
          });
          const normalized = await this.zoAdapter.normalizeResponse(similarResponse);
          const pageResults = normalized.data.filter((doc: any) => doc.doc_id !== sourceCase.doc_id);

          if (similarCasesForDisplay.length < requestedDisplay) {
            const remainingSlots = requestedDisplay - similarCasesForDisplay.length;
            similarCasesForDisplay.push(...pageResults.slice(0, remainingSlots).map((doc: any) => ({
              cause_num: doc.cause_num,
              doc_id: doc.doc_id,
              title: doc.title,
              resolution: doc.resolution,
              judge: doc.judge,
              court_code: doc.court_code,
              adjudication_date: doc.adjudication_date,
              url: doc.url,
              similarity_reason: 'metadata_and_keywords',
            })));
          }

          totalFound += pageResults.length;
          pagesFetched++;

          if (normalized.data.length < maxApiLimit) {
            hasMore = false;
          } else if (similarCasesForDisplay.length >= requestedDisplay) {
            hasMore = false;
          } else {
            offset += maxApiLimit;
          }
        }

        const reachedLimit = pagesFetched >= maxPages;

        if (similarCasesForDisplay.length > 0) {
          this.zoAdapter.saveDocumentsToDatabase(similarCasesForDisplay, 1000).catch(err => {
            logger.error('Failed to save documents to database:', err);
          });
        }

        const enrichedSimilar = await this.enrichWithPrecedentStatus(similarCasesForDisplay);

        return this.wrapResponse({
          source_case: {
            cause_num: sourceCase.cause_num,
            doc_id: sourceCase.doc_id,
            title: sourceCase.title,
            resolution: sourceCase.resolution,
            judge: sourceCase.judge,
            court_code: sourceCase.court_code,
            adjudication_date: sourceCase.adjudication_date,
            url: sourceCase.url,
            category_code: sourceCase.category_code,
            justice_kind: sourceCase.justice_kind,
          },
          search_method: 'smart_text_search_with_pagination',
          text_source: textSource,
          text_length: textForAnalysis.length,
          extracted_terms: {
            law_articles: searchTerms.lawArticles,
            keywords: searchTerms.keywords,
            dispute_type: searchTerms.disputeType,
            case_essence: searchTerms.caseEssence,
          },
          search_query: smartQuery,
          similar_cases: enrichedSimilar,
          total_found: totalFound,
          pages_fetched: pagesFetched,
          reached_safety_limit: reachedLimit,
          displaying: enrichedSimilar.length,
          total_available_info: reachedLimit
            ? `Найдено минимум ${totalFound} прецедентов (показано первых ${enrichedSimilar.length}).`
            : `Найдено ${totalFound} прецедентов через ${pagesFetched} страниц.`,
        });
      } catch (error: any) {
        logger.error('Semantic search failed, falling back to regular search', error);
        return await this.performRegularSearch(args);
      }
    }

    return await this.performRegularSearch(args);
  }

  private async performRegularSearch(args: any): Promise<ToolResult> {
    const query = String(args.query || '').trim();
    if (!query) throw new Error('query parameter is required and cannot be empty');

    const limit = Math.min(50, Math.max(1, Number(args.limit || 10)));
    const offset = Math.max(0, Number(args.offset || 0));

    const budget = query.length < 30 ? 'quick' : 'standard';
    const intent = await this.queryPlanner.classifyIntent(query, budget as 'quick' | 'standard');
    // Optimize query for sph04 AND-mode: long queries with many words return 0 results
    const searchQuery = query.length > 40
      ? await this.queryPlanner.generateOptimizedSearchQuery(query, intent, budget as 'quick' | 'standard')
      : query;
    const queryParams = this.queryPlanner.buildQueryParams(intent, searchQuery);
    const endpoints = this.queryPlanner.selectEndpoints(intent).filter(e => e === 'court');

    const results: any[] = [];
    const errors: string[] = [];

    for (const endpoint of endpoints) {
      try {
        let response;
        switch (endpoint) {
          case 'court':
            response = await this.zoAdapter.searchCourtDecisions(queryParams);
            break;
          default:
            continue;
        }
        const normalized = await this.zoAdapter.normalizeResponse(response);
        results.push(...normalized.data.slice(offset, offset + limit));
      } catch (error: any) {
        errors.push(`${endpoint}: ${error.message}`);
      }
    }

    // Fallback: if 0 results, retry with stripped keywords (remove all quotes and Sphinx operators).
    // Fires even when searchQuery === query (optimizer returned input unchanged) — in that case
    // we still strip quotes/operators and retry with broader bare-keyword search.
    if (results.length === 0 && errors.length === 0) {
      const stripped = query.replace(/["'|()]/g, ' ').replace(/\s+/g, ' ').trim();
      if (stripped && stripped !== searchQuery) {
        logger.info('[search_legal_precedents] 0 results with optimized query, retrying with stripped keywords', {
          optimized: searchQuery,
          fallback: stripped.substring(0, 100),
        });
        const fallbackParams = this.queryPlanner.buildQueryParams(intent, stripped);
        try {
          const fallbackResponse = await this.zoAdapter.searchCourtDecisions(fallbackParams);
          const fallbackNormalized = await this.zoAdapter.normalizeResponse(fallbackResponse);
          results.push(...fallbackNormalized.data.slice(offset, offset + limit));
        } catch (error: any) {
          errors.push(`fallback: ${error.message}`);
        }

        // Second-level fallback: sph04 AND-mode requires ALL words present in the doc.
        // A stripped multi-word phrase (8+ words) still returns 0. Retry with only the
        // 4 longest words (most distinctive nouns), which greatly broadens the match.
        if (results.length === 0) {
          const keyWords = stripped.split(/\s+/).filter(w => w.length >= 6).slice(0, 4).join(' ');
          if (keyWords && keyWords !== stripped) {
            logger.info('[search_legal_precedents] 0 results with stripped query, retrying with key words only', {
              stripped: stripped.substring(0, 100),
              keyWords,
            });
            const shortParams = this.queryPlanner.buildQueryParams(intent, keyWords);
            try {
              const shortResponse = await this.zoAdapter.searchCourtDecisions(shortParams);
              const shortNormalized = await this.zoAdapter.normalizeResponse(shortResponse);
              results.push(...shortNormalized.data.slice(offset, offset + limit));
            } catch (error: any) {
              errors.push(`fallback2: ${error.message}`);
            }
          }
        }
      }
    }

    const enriched = await this.enrichWithPrecedentStatus(results);

    return this.wrapResponse({
      results: enriched,
      intent,
      search_method: 'text_based',
      total: enriched.length,
      ...(errors.length > 0 && { warnings: errors }),
    });
  }

  /**
   * Enrich an array of search results with precedent status (case stability).
   * Uses ShepardizationService.batchAnalyze() to check the procedural chain
   * for each case and determine if it was upheld, overruled, or modified.
   */
  private async enrichWithPrecedentStatus(results: any[]): Promise<any[]> {
    if (!this.shepardizationService || results.length === 0) return results;

    // Extract unique case numbers from results (limit batch size for cost/latency)
    const caseNumbers = results
      .map(r => r.cause_num || r.case_number)
      .filter(Boolean)
      .slice(0, MAX_SHEPARDIZATION_BATCH);

    if (caseNumbers.length === 0) return results;

    try {
      const startTime = Date.now();
      const statuses = await this.shepardizationService.batchAnalyze(caseNumbers);
      const elapsed = Date.now() - startTime;

      // Build lookup map: case_number → ShepardizationResult
      const statusMap = new Map<string, ShepardizationResult>();
      for (const s of statuses) {
        statusMap.set(s.case_number, s);
      }

      logger.info('[LegalAdviceTools] Precedent status enrichment complete', {
        cases: caseNumbers.length,
        enriched: statuses.length,
        elapsed_ms: elapsed,
        statuses: {
          valid: statuses.filter(s => s.status === 'valid').length,
          overruled: statuses.filter(s => s.status === 'explicitly_overruled').length,
          limited: statuses.filter(s => s.status === 'limited').length,
          unknown: statuses.filter(s => s.status === 'unknown').length,
        },
      });

      // Merge status into each result
      return results.map(r => {
        const cn = r.cause_num || r.case_number;
        const status = cn ? statusMap.get(cn) : undefined;
        if (!status) return r;

        // Determine the highest court instance that reviewed this case
        const highestInstance = status.affecting_decisions.length > 0
          ? status.affecting_decisions[status.affecting_decisions.length - 1].instance
          : undefined;

        return {
          ...r,
          precedent_status: {
            status: status.status,
            confidence: status.confidence,
            highest_instance: highestInstance,
            affecting_decisions: status.affecting_decisions.map(d => ({
              instance: d.instance,
              court: d.court,
              date: d.date,
              outcome: d.outcome,
              effect: d.effect,
            })),
            check_source: status.check_source,
            chain_length: status.chain_length,
          },
        };
      });
    } catch (err: any) {
      logger.warn('[LegalAdviceTools] Precedent status enrichment failed, returning results without status', {
        error: err.message,
        cases: caseNumbers.length,
      });
      return results;
    }
  }
}

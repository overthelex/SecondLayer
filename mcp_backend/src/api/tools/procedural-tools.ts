/**
 * Procedural Tools - Handlers for procedural law analysis
 *
 * 6 tools:
 * - search_procedural_norms
 * - compare_practice_pro_contra
 * - find_similar_fact_pattern_cases
 * - calculate_procedural_deadlines
 * - build_procedural_checklist
 * - calculate_monetary_claims
 *
 * Note: search_supreme_court_practice was merged into search_legal_precedents (legal-advice-tools.ts)
 */

import { EdsrLocalAdapter } from '../../adapters/edrsr-local-adapter.js';
import type { IEmbeddingPort, ILLMPort } from '../../domain/ports/index.js';
import { LegalPatternStore } from '../../services/legal-pattern-store.js';
import { EdsrFtsService, EdsrFtsFilters } from '../../services/edrsr-fts-service.js';
import { SectionType } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { extractSearchTermsWithAI } from '../../utils/html-parser.js';
import { SemanticSectionizer } from '../../services/semantic-sectionizer.js';
import { BaseToolHandler, ToolDefinition, ToolResult } from '../base-tool-handler.js';
import {
  callRadaTool,
  mapProcedureCodeToShort,
  parseTimeRangeToDates,
  addDaysYMD,
  extractSnippets,
  buildSupremeCourtHints,
  buildSupremeCourtWhereFilter,
  searchWithInstanceCascade,
  mapProcedureCodeToJusticeKind,
  extractCaseNumberFromText,
  safeParseJsonFromToolResult,
  resolveCourtDecisionDocIdByCaseNumber,
} from '../tool-utils.js';

/**
 * Extract court name from ZakonOnline title.
 * Example: "Постанова від 26.09.2024 по справі № 927/995/21 Касаційний господарський суд"
 *       -> "Касаційний господарський суд"
 */
function extractCourtFromTitle(title?: string): string {
  if (!title) return '';
  // Court name is typically the last part of the title after the case number
  const match = title.match(/(?:Касаційний \S+ суд|Велика палата Верховного Суду|Верховний Суд)/i);
  return match ? match[0] : '';
}

const UK_STOP_WORDS = new Set([
  'та', 'і', 'або', 'що', 'як', 'це', 'у', 'в', 'на', 'з', 'із', 'за', 'до', 'від',
  'по', 'для', 'при', 'без', 'про', 'через', 'між', 'над', 'під', 'після', 'перед',
  'він', 'вона', 'воно', 'вони', 'його', 'її', 'їх', 'який', 'яка', 'яке', 'які',
  'цей', 'ця', 'ці', 'той', 'та', 'ті', 'свій', 'свою', 'своє', 'свої',
  'не', 'ні', 'так', 'але', 'також', 'ще', 'вже', 'навіть', 'лише', 'тільки',
  'є', 'був', 'була', 'було', 'були', 'бути', 'може', 'має', 'мають',
  'а', 'й', 'чи', 'коли', 'якщо', 'тому', 'тобто', 'зокрема', 'проте',
  'себе', 'собі', 'нього', 'неї', 'них', 'тому', 'цього', 'тим',
]);

/** Trim FTS query to max N significant words — plainto_tsquery ANDs all terms */
function trimFtsQuery(query: string, maxWords: number = 6): string {
  const words = query
    .replace(/[""«»()[\]{}<>:;,!?.]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !UK_STOP_WORDS.has(w.toLowerCase()));
  return words.slice(0, maxWords).join(' ');
}

export class ProceduralTools extends BaseToolHandler {
  constructor(
    private zoAdapter: EdsrLocalAdapter,
    private zoPracticeAdapter: EdsrLocalAdapter,
    private sectionizer: SemanticSectionizer,
    private embeddingService: IEmbeddingPort,
    private patternStore: LegalPatternStore,
    private readonly llm?: ILLMPort,
    private readonly ftsService?: EdsrFtsService,
    private readonly db?: any,
  ) {
    super();
  }

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'search_procedural_norms',
        annotations: { title: 'Процесуальні норми (ЦПК/ГПК)', readOnlyHint: true },
        description: `Пошук процесуальних норм у ЦПК/ГПК через RADA MCP

Повертає релевантні статті/фрагменти та структуровану витяжку (строки, умови, вимоги).
Використовуйте для пошуку конкретних норм процесуального права — строки оскарження, порядок подання, вимоги до документів.
Джерело: RADA MCP (локальна БД/кеш).`,
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              enum: ['cpc', 'gpc'],
              description: 'Процесуальний кодекс: cpc (ЦПК — цивільний), gpc (ГПК — господарський)'
            },
            query: {
              type: 'string',
              description: 'Що шукати (наприклад: "строк апеляційного оскарження", "забезпечення позову")'
            },
            article: {
              type: ['string', 'number'],
              description: 'Номер статті (якщо відомий)'
            },
            limit: {
              type: 'number',
              default: 5,
              description: 'Макс. результатів'
            }
          },
          required: ['code']
        }
      },
      {
        name: 'compare_practice_pro_contra',
        annotations: { title: 'Практика за/проти', readOnlyHint: true },
        description: `Підбірка судової практики "за" і "проти" по правовій тезі

Знаходить дві лінії практики — рішення, що підтверджують тезу, та рішення, що їй суперечать.
Використовуйте для аналізу суперечливої практики або підготовки правової позиції.
Повертає: списки справ pro/contra з цитатами з мотивувальної частини.`,
        inputSchema: {
          type: 'object',
          properties: {
            procedure_code: { type: 'string', enum: ['cpc', 'gpc', 'cac', 'crpc'], description: 'Вид судочинства: cpc (цивільне), gpc (господарське), cac (адміністративне), crpc (кримінальне)' },
            query: { type: 'string', description: 'Правова теза для аналізу (наприклад: "поновлення строку апеляційного оскарження через несвоєчасне отримання повного тексту")' },
            time_range: {
              oneOf: [
                { type: 'string' },
                { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } } },
              ],
              description: 'Часовий діапазон: рядок або {from, to} у форматі YYYY-MM-DD',
            },
            limit: { type: 'number', default: 7, description: 'Макс. справ у кожній лінії практики' },
          },
          required: ['procedure_code', 'query'],
        },
      },
      {
        name: 'find_similar_fact_pattern_cases',
        annotations: { title: 'Схожі за фактами справи', readOnlyHint: true },
        description: `Пошук судових справ зі схожими фактичними обставинами

Витягує ключові терміни з опису фактів та шукає справи з аналогічними обставинами.
Використовуйте для пошуку релевантної практики, коли є опис ситуації клієнта.
Повертає: список справ з релевантністю та ключовими фрагментами.`,
        inputSchema: {
          type: 'object',
          properties: {
            procedure_code: { type: 'string', enum: ['cpc', 'gpc', 'cac', 'crpc'], description: 'Вид судочинства: cpc (цивільне), gpc (господарське), cac (адміністративне), crpc (кримінальне)' },
            facts_text: { type: 'string', description: 'Опис фактичних обставин справи (довільний текст)' },
            time_range: {
              oneOf: [
                { type: 'string' },
                { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } } },
              ],
              description: 'Часовий діапазон: рядок або {from, to} у форматі YYYY-MM-DD',
            },
            limit: { type: 'number', default: 10, description: 'Макс. результатів' },
          },
          required: ['procedure_code', 'facts_text'],
        },
      },
      {
        name: 'calculate_procedural_deadlines',
        annotations: { title: 'Калькулятор строків', readOnlyHint: true },
        description: `Калькулятор процесуальних строків з аналізом практики

Розраховує строки оскарження (апеляція, касація) на основі процесуального кодексу та дати події.
Додатково шукає практику щодо поновлення/продовження строків.
Повертає: розраховані дедлайни, релевантні норми, практику щодо строків.
Результат орієнтовний — потребує перевірки за конкретною нормою.`,
        inputSchema: {
          type: 'object',
          properties: {
            procedure_code: { type: 'string', enum: ['cpc', 'gpc', 'cac', 'crpc'], description: 'Вид судочинства: cpc (цивільне), gpc (господарське), cac (адміністративне), crpc (кримінальне)' },
            event_type: { type: 'string', description: 'Тип процесуальної події (наприклад: "ухвалення рішення", "отримання повного тексту")' },
            event_date: { type: 'string', description: 'Дата події (YYYY-MM-DD)' },
            received_full_text_date: { type: 'string', description: 'Дата отримання повного тексту рішення (YYYY-MM-DD)' },
            appeal_type: { type: 'string', description: 'Тип оскарження (наприклад: "апеляція", "касація")' },
            time_range: {
              oneOf: [
                { type: 'string' },
                { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } } },
              ],
              description: 'Часовий діапазон для пошуку практики',
            },
            practice_limit: { type: 'number', default: 15, description: 'Макс. справ для аналізу практики' },
            practice_queries_max: { type: 'number', default: 4 },
            practice_broad_queries_max: { type: 'number', default: 2 },
            practice_disable_time_range: { type: 'boolean', default: false },
            practice_use_court_practice: { type: 'boolean', default: true },
            practice_case_map_max: { type: 'number', default: 8 },
            practice_expand_docs: { type: 'number', default: 3 },
            practice_expand_depth: { type: 'number', default: 2 },
            reasoning_budget: { type: 'string', enum: ['quick', 'standard', 'deep'], default: 'standard', description: 'Глибина аналізу: quick (швидкий), standard (стандартний), deep (глибокий)' },
          },
          required: ['procedure_code', 'event_date', 'appeal_type'],
        },
      },
      {
        name: 'build_procedural_checklist',
        annotations: { title: 'Процесуальний чекліст', readOnlyHint: true },
        description: `Генерація процесуального чеклісту для конкретної стадії справи

Створює покроковий чеклист з посиланнями на норми (через search_procedural_norms).
Використовуйте для перевірки повноти підготовки документів на конкретній стадії.
Повертає: структурований чеклист з нормами, строками, вимогами до документів.`,
        inputSchema: {
          type: 'object',
          properties: {
            procedure_code: { type: 'string', enum: ['cpc', 'gpc', 'cac', 'crpc'], description: 'Вид судочинства' },
            stage: { type: 'string', description: 'Стадія справи (наприклад: "подання позову", "апеляційне оскарження", "виконавче провадження")' },
            case_category: { type: 'string', description: 'Категорія справи (наприклад: "стягнення боргу", "визнання недійсним договору")' },
          },
          required: ['procedure_code', 'stage'],
        },
      },
      {
        name: 'calculate_monetary_claims',
        annotations: { title: 'Розрахунок грошових вимог', readOnlyHint: true, idempotentHint: true },
        description: `Розрахунок грошових вимог (3% річних, інфляційні втрати)

Розраховує суму боргу з урахуванням 3% річних (ст. 625 ЦК України) за вказаний період.
Використовуйте для підготовки розрахунку до позовної заяви про стягнення заборгованості.
Повертає: основну суму, нараховані відсотки, загальну суму вимог.`,
        inputSchema: {
          type: 'object',
          properties: {
            amount: { type: 'number', description: 'Сума основного боргу (грн)' },
            date_from: { type: 'string', description: 'Дата початку нарахування (YYYY-MM-DD)' },
            date_to: { type: 'string', description: 'Дата кінця нарахування (YYYY-MM-DD)' },
            claim_type: { type: 'string', default: 'three_percent', description: 'Тип нарахування: three_percent (3% річних за ст.625 ЦК)' },
          },
          required: ['amount', 'date_from', 'date_to'],
        },
      },
    ];
  }

  async executeTool(name: string, args: any): Promise<ToolResult | null> {
    switch (name) {
      case 'search_procedural_norms':
        return await this.searchProceduralNorms(args);
      case 'compare_practice_pro_contra':
        return await this.comparePracticeProContra(args);
      case 'find_similar_fact_pattern_cases':
        return await this.findSimilarFactPatternCases(args);
      case 'calculate_procedural_deadlines':
        return await this.calculateProceduralDeadlines(args);
      case 'build_procedural_checklist':
        return await this.buildProceduralChecklist(args);
      case 'calculate_monetary_claims':
        return await this.calculateMonetaryClaims(args);
      default:
        return null;
    }
  }

  private async searchProceduralNorms(args: any): Promise<ToolResult> {
    const code = String(args.code || '').trim().toLowerCase();
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    const article = args.article !== undefined && args.article !== null ? String(args.article).trim() : '';

    if (code !== 'cpc' && code !== 'gpc') {
      throw new Error('code must be one of: cpc, gpc');
    }
    if (!query && !article) {
      throw new Error('Either query or article must be provided');
    }

    const lawIdentifier = code === 'cpc' ? 'цпк' : 'гпк';
    const radaArgs: any = {
      law_identifier: lawIdentifier,
      ...(article ? { article } : {}),
      ...(query ? { search_text: query } : {}),
      include_court_citations: false,
    };

    const radaResponse = await callRadaTool('search_legislation_text', radaArgs);

    let radaParsed: any = null;
    try {
      const text = radaResponse?.result?.content?.[0]?.text;
      if (typeof text === 'string' && text.trim().length > 0) {
        radaParsed = JSON.parse(text);
      }
    } catch (_e) {
      radaParsed = null;
    }

    const text = radaParsed
      ? this.buildProceduralNormsAnswer({ code, query: query || undefined, article: article || undefined, radaParsed })
      : `B. Норма / правова рамка\n\nПомилка: не вдалося розібрати відповідь провайдера законодавства.`;

    return { content: [{ type: 'text', text }] };
  }

  private buildProceduralNormsAnswer(params: { code: string; query?: string; article?: string; radaParsed: any }): string {
    const { code, query, article, radaParsed } = params;
    const title = typeof radaParsed?.title === 'string' ? radaParsed.title : '';
    const lawNumber = typeof radaParsed?.law_number === 'string' ? radaParsed.law_number : '';
    const url = typeof radaParsed?.url === 'string' ? radaParsed.url : '';

    const header = title || lawNumber
      ? `${title}${title && lawNumber ? ' ' : ''}${lawNumber ? `(№ ${lawNumber})` : ''}`.trim()
      : (code === 'cpc' ? 'ЦПК' : 'ГПК');

    let quoteBlocks: string[] = [];
    const articleText = typeof radaParsed?.article?.text === 'string' ? radaParsed.article.text : '';
    if (article && articleText) {
      const cleaned = articleText.replace(/\s+/g, ' ').trim();
      quoteBlocks = [cleaned.length > 900 ? `${cleaned.slice(0, 900)}…` : cleaned];
    } else if (typeof radaParsed?.full_text_plain === 'string' && query) {
      quoteBlocks = extractSnippets(radaParsed.full_text_plain, query, 4);
    }

    const lines: string[] = [];
    lines.push(`B. Норма / правова рамка`);
    lines.push('');
    lines.push(`Норма: ${header}`);
    if (article) lines.push(`Стаття: ${article}`);
    if (url) lines.push(`Джерело: ${url}`);
    if (quoteBlocks.length > 0) {
      lines.push('');
      lines.push('Цитата:');
      for (const q of quoteBlocks) lines.push(`- ${q}`);
    }
    return lines.join('\n');
  }

  /**
   * Internal SC practice search (used by calculateProceduralDeadlines).
   * Kept as private helper after search_supreme_court_practice tool was merged into search_legal_precedents.
   */
  private async searchSupremeCourtPractice(args: any): Promise<ToolResult> {
    const procedureCode = mapProcedureCodeToShort(args.procedure_code || args.code);
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    const limit = Math.min(50, Math.max(1, Number(args.limit || 10)));
    const sectionFocus = Array.isArray(args.section_focus) ? args.section_focus : undefined;
    const courtLevel = args.court_level ? String(args.court_level) : undefined;

    if (!query) throw new Error('query parameter is required');

    const timeRangeParsed = parseTimeRangeToDates(args.time_range);
    const whereFilters: any[] = [
      ...(courtLevel ? buildSupremeCourtWhereFilter(courtLevel) : []),
    ];
    if (procedureCode) {
      const justiceKind = mapProcedureCodeToJusticeKind(procedureCode);
      if (justiceKind !== null) {
        whereFilters.push({ field: 'justice_kind', operator: '=', value: justiceKind });
      }
    }

    const searchParams: any = {
      meta: { search: query },
      where: whereFilters.length > 0 ? whereFilters : undefined,
      limit: Math.max(limit, 20),
      offset: 0,
      ...(timeRangeParsed.date_from ? { date_from: timeRangeParsed.date_from } : {}),
      ...(timeRangeParsed.date_to ? { date_to: timeRangeParsed.date_to } : {}),
    };

    const response = await this.zoAdapter.searchCourtDecisions(searchParams);
    const normalized = await this.zoAdapter.normalizeResponse(response);

    const scCourtCodePrefix = '99';
    const filtered = normalized.data.filter((d: any) => {
      if (courtLevel !== 'SC' && courtLevel !== 'GrandChamber') return true;
      const code = String(d?.court_code || '');
      if (!code.startsWith(scCourtCodePrefix)) return false;
      if (courtLevel === 'GrandChamber') return code === '9901';
      return true;
    });

    const results = filtered.slice(0, limit).map((d: any) => {
      const fullText = typeof d.full_text === 'string' ? d.full_text : '';
      const courtName = extractCourtFromTitle(d?.title);
      return {
        doc_id: d?._raw?.doc_id ?? d?.doc_id ?? d?.zakononline_id,
        court: d?.court || courtName,
        chamber: courtName,
        date: d?.date || d?.adjudication_date,
        case_number: d?.case_number || d?.cause_num,
        url: d?._raw?.url || d?.url,
        section_focus: sectionFocus,
        snippets: extractSnippets(fullText, query, 2),
      };
    });

    return this.wrapResponse({
      procedure_code: procedureCode || 'all',
      query,
      results,
      total_returned: results.length,
    });
  }

  private async comparePracticeProContra(args: any): Promise<ToolResult> {
    const procedureCode = mapProcedureCodeToShort(args.procedure_code || args.code);
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    const limit = Math.min(20, Math.max(1, Number(args.limit || 7)));
    if (!procedureCode) throw new Error('procedure_code must be one of: cpc, gpc, cac, crpc');
    if (!query) throw new Error('query parameter is required');

    const timeRangeParsed = parseTimeRangeToDates(args.time_range);
    const justiceKind = mapProcedureCodeToJusticeKind(procedureCode);

    const ftsSearch = async (suffix: string) => {
      if (!this.ftsService || !this.db) return { results: [], instanceLabel: '' };

      const baseFilters: EdsrFtsFilters = {
        ...(justiceKind !== null ? { justice_kind: justiceKind } : {}),
        ...(timeRangeParsed.date_from ? { date_from: timeRangeParsed.date_from } : {}),
        ...(timeRangeParsed.date_to ? { date_to: timeRangeParsed.date_to } : {}),
      };

      for (const inst of [
        { code: 1, label: 'Верховний Суд' },
        { code: 2, label: 'апеляційні суди' },
        { code: 3, label: 'суди першої інстанції' },
      ] as const) {
        const resp = await this.ftsService.searchFulltext(
          `${trimFtsQuery(query)} ${suffix}`, this.db,
          { ...baseFilters, instance_code: inst.code }, limit,
        );
        if (resp.results.length > 0) {
          return { results: resp.results, instanceLabel: inst.label };
        }
      }
      return { results: [], instanceLabel: '' };
    };

    const [proResult, contraResult] = await Promise.all([
      ftsSearch('задовольнити позов'),
      ftsSearch('відмовити у задоволенні позову'),
    ]);

    const mapFtsCase = (d: any) => ({
      doc_id: d.doc_id,
      court_code: d.court_code,
      date: d.adjudication_date,
      case_number: d.cause_num,
      snippet: d.headline,
    });

    const payload: any = {
      procedure_code: procedureCode,
      query,
      time_range: args.time_range,
      court_level_pro: proResult.instanceLabel || undefined,
      court_level_contra: contraResult.instanceLabel || undefined,
      pro: proResult.results.slice(0, limit).map(mapFtsCase),
      contra: contraResult.results.slice(0, limit).map(mapFtsCase),
      total_pro: proResult.results.length,
      total_contra: contraResult.results.length,
    };
    if (timeRangeParsed.warning) payload.warning = timeRangeParsed.warning;

    return this.wrapResponse(payload);
  }

  private async findSimilarFactPatternCases(args: any): Promise<ToolResult> {
    const procedureCode = mapProcedureCodeToShort(args.procedure_code || args.code);
    const factsText = typeof args.facts_text === 'string' ? args.facts_text.trim() : '';
    const limit = Math.min(20, Math.max(1, Number(args.limit || 10)));
    if (!procedureCode) {
      const providedValue = args.procedure_code || args.code;
      throw new Error(
        `procedure_code must be one of: cpc, gpc, cac, crpc. ` +
        `Received: ${providedValue ? `'${providedValue}'` : 'undefined'}.`
      );
    }
    if (!factsText) throw new Error('facts_text parameter is required');

    const timeRangeParsed = parseTimeRangeToDates(args.time_range);
    const extracted = await extractSearchTermsWithAI(factsText, this.llm);
    const extractedTerms = Array.isArray(extracted?.keywords) ? extracted.keywords : [];
    const query = typeof extracted?.searchQuery === 'string' && extracted.searchQuery.trim().length > 0
      ? extracted.searchQuery.trim()
      : (extractedTerms.length > 0 ? extractedTerms.join(' ') : factsText.slice(0, 180));

    const justiceKind = mapProcedureCodeToJusticeKind(procedureCode);

    let results: any[] = [];
    let courtLevel = '';

    if (this.ftsService && this.db) {
      const baseFilters: EdsrFtsFilters = {
        ...(justiceKind !== null ? { justice_kind: justiceKind } : {}),
        ...(timeRangeParsed.date_from ? { date_from: timeRangeParsed.date_from } : {}),
        ...(timeRangeParsed.date_to ? { date_to: timeRangeParsed.date_to } : {}),
      };

      for (const inst of [
        { code: 1, label: 'Верховний Суд' },
        { code: 2, label: 'апеляційні суди' },
        { code: 3, label: 'суди першої інстанції' },
      ] as const) {
        const resp = await this.ftsService.searchFulltext(
          trimFtsQuery(query), this.db, { ...baseFilters, instance_code: inst.code }, limit,
        );
        if (resp.results.length > 0) {
          courtLevel = inst.label;
          results = resp.results.slice(0, limit).map((d) => ({
            doc_id: d.doc_id,
            court_code: d.court_code,
            date: d.adjudication_date,
            case_number: d.cause_num,
            snippet: d.headline,
          }));
          break;
        }
      }
    }

    const payload: any = {
      procedure_code: procedureCode,
      time_range: args.time_range,
      court_level: courtLevel || undefined,
      extracted_search_terms: extractedTerms,
      search_query: query,
      results,
    };
    if (timeRangeParsed.warning) payload.time_range_warning = timeRangeParsed.warning;

    return this.wrapResponse(payload);
  }

  private async calculateProceduralDeadlines(args: any): Promise<ToolResult> {
    const procedureCode = mapProcedureCodeToShort(args.procedure_code || args.code);
    const eventType = String(args.event_type || '').trim().toLowerCase();
    const eventDate = typeof args.event_date === 'string' ? args.event_date.slice(0, 10) : '';
    const receivedFullTextDate = typeof args.received_full_text_date === 'string' ? args.received_full_text_date.slice(0, 10) : '';
    const appealType = String(args.appeal_type || '').trim().toLowerCase();
    const timeRange = args.time_range;
    const reasoningBudget = args.reasoning_budget || 'standard';
    const practiceLimit = Math.min(25, Math.max(3, Number(args.practice_limit || 15)));
    const practiceQueriesMax = Math.min(10, Math.max(1, Number(args.practice_queries_max || 4)));
    const practiceBroadQueriesMax = Math.min(10, Math.max(0, Number(args.practice_broad_queries_max || 2)));
    const practiceExpandDocs = Math.min(10, Math.max(0, Number(args.practice_expand_docs || 3)));
    const practiceExpandDepth = Math.min(5, Math.max(1, Number(args.practice_expand_depth || 2)));
    const practiceDisableTimeRange = args.practice_disable_time_range === true;
    const practiceUseCourtPractice = args.practice_use_court_practice !== false;
    const practiceCaseMapMax = Math.min(30, Math.max(0, Number(args.practice_case_map_max || 8)));

    if (!procedureCode) throw new Error('procedure_code must be one of: cpc, gpc, cac, crpc');
    if (!eventDate) throw new Error('event_date parameter is required (YYYY-MM-DD)');
    if (!appealType) throw new Error('appeal_type parameter is required');

    const defaults: Record<string, number> = {
      'cpc:appeal:decision': 30, 'cpc:appeal:ruling': 15, 'cpc:cassation:decision': 30, 'cpc:cassation:ruling': 30,
      'gpc:appeal:decision': 20, 'gpc:appeal:ruling': 10, 'gpc:cassation:decision': 20, 'gpc:cassation:ruling': 20,
      'cac:appeal:decision': 30, 'cac:appeal:ruling': 15, 'cac:cassation:decision': 30, 'cac:cassation:ruling': 30,
      'crpc:appeal:decision': 30, 'crpc:appeal:ruling': 7, 'crpc:cassation:decision': 3, 'crpc:cassation:ruling': 3,
    };

    const normalizedEvent = (eventType.includes('ухвал') || eventType.includes('ruling')) ? 'ruling' : 'decision';
    const normalizedAppeal = appealType.includes('кас') || appealType.includes('cass') ? 'cassation' : 'appeal';
    const key = `${procedureCode}:${normalizedAppeal}:${normalizedEvent}`;
    const days = defaults[key];
    if (!days) throw new Error('Unsupported combination of procedure_code / appeal_type / event_type');

    const variants: any[] = [{ rule: 'from_event_date', start_date: eventDate, end_date: addDaysYMD(eventDate, days) }];
    if (receivedFullTextDate) {
      variants.push({ rule: 'from_received_full_text_date', start_date: receivedFullTextDate, end_date: addDaysYMD(receivedFullTextDate, days) });
    }

    // Norms reference
    const normCode = procedureCode === 'cpc' || procedureCode === 'gpc' ? procedureCode : null;
    const normsQuery = `${normalizedAppeal === 'cassation' ? 'касаційна' : 'апеляційна'} скарга строк ${normalizedEvent === 'ruling' ? 'ухвала' : 'рішення'} з якого моменту обчислюється`;
    let normsReference: any = null;
    let normsError: string | null = null;
    if (normCode) {
      try {
        normsReference = await this.searchProceduralNorms({ code: normCode, query: normsQuery });
      } catch (e: any) {
        normsError = String(e?.message || e);
      }
    }

    // Practice search
    const practiceTimeRange = timeRange || 'last 5 years';
    const appealKey = normalizedAppeal === 'cassation' ? 'касаційн' : 'апеляційн';
    const decisionKey = normalizedEvent === 'ruling' ? 'ухвал' : 'рішенн';
    const primaryQueries = Array.from(new Set([
      `строк ${appealKey}ого оскарження ${decisionKey} отримання повного тексту`,
      `строк ${appealKey}ого оскарження ${decisionKey} складення повного тексту`,
      `строк ${appealKey}ого оскарження ${decisionKey} з дня вручення`,
      `строк ${appealKey}ого оскарження ${decisionKey} отримання копії`,
      `строк ${appealKey}ого оскарження ${decisionKey} повний текст`,
      `апеляційна скарга строк повний текст`,
      `строк апеляційного оскарження повного тексту рішення`,
      `строк апеляції отримання повного тексту`,
      `строк апеляційної скарги з дня складення повного тексту`,
      `поновлення строку ${appealKey}ого оскарження несвоєчасне отримання повного тексту`,
      `поновлення строку ${appealKey}ого оскарження поважні причини`,
      `строк ${appealKey}ого оскарження ${decisionKey} з якого моменту`,
    ])).slice(0, practiceQueriesMax);

    const broadQueries = Array.from(new Set([
      `${appealKey}а скарга строк ${decisionKey}`,
      `строк ${appealKey}ого оскарження ${decisionKey}`,
      `поновлення строку ${appealKey}ого оскарження`,
      `несвоєчасне отримання повного тексту поновлення строку`,
      `з якого моменту обчислюється строк апеляційного оскарження`,
      `відлік строку апеляційного оскарження`,
    ])).slice(0, practiceBroadQueriesMax);

    const aggregated: any[] = [];
    const seen = new Set<string>();
    let practiceError: string | null = null;
    const minEnough = Math.min(practiceLimit, 8);
    const triedQueries: string[] = [];

    const runQuery = async (q: string) => {
      triedQueries.push(q);
      try {
        const raw = await this.searchSupremeCourtPractice({
          procedure_code: procedureCode,
          query: q,
          ...(practiceDisableTimeRange ? {} : { time_range: practiceTimeRange }),
          court_level: 'SC',
          section_focus: [SectionType.COURT_REASONING, SectionType.DECISION],
          limit: practiceLimit,
          reasoning_budget: reasoningBudget,
        });
        const parsed = safeParseJsonFromToolResult(raw);
        const results = Array.isArray(parsed?.results) ? parsed.results : [];
        for (const r of results) {
          const id = r?.doc_id != null ? String(r.doc_id) : '';
          if (!id || seen.has(id)) continue;
          seen.add(id);
          aggregated.push(r);
          if (aggregated.length >= practiceLimit) break;
        }
      } catch (e: any) {
        practiceError = String(e?.message || e);
      }
      return aggregated.length >= practiceLimit || aggregated.length >= minEnough;
    };

    for (const q of primaryQueries) { if (await runQuery(q)) break; }
    const minWanted = Math.min(3, practiceLimit);
    if (aggregated.length < minWanted) {
      for (const q of broadQueries) { if (await runQuery(q)) break; }
    }

    // Court practice recall
    if (practiceUseCourtPractice && practiceCaseMapMax > 0 && aggregated.length < minWanted) {
      try {
        const courtPracticeQueries = Array.from(new Set([
          primaryQueries[0] || '',
          `строк апеляційного оскарження повний текст`,
          `поновлення строку апеляційного оскарження`,
          `з якого моменту обчислюється строк апеляційного оскарження`,
        ].map(s => String(s || '').trim()).filter(Boolean))).slice(0, 4);

        const mapped: Array<{ case_number: string; doc_id: number }> = [];
        const unmapped: string[] = [];
        const caseNumbers: string[] = [];
        let practiceCandidatesTotal = 0;

        for (const q of courtPracticeQueries) {
          const resp = await this.zoPracticeAdapter.searchCourtDecisions({
            meta: { search: q },
            limit: Math.min(50, practiceCaseMapMax * 3),
            offset: 0,
            ...(practiceDisableTimeRange ? {} : parseTimeRangeToDates(practiceTimeRange)),
          } as any);
          const norm = await this.zoPracticeAdapter.normalizeResponse(resp);
          const candidates = Array.isArray(norm?.data) ? norm.data : [];
          practiceCandidatesTotal += candidates.length;

          for (const d of candidates) {
            const cnRaw = String(d?.case_number || d?._raw?.cause_num || d?._raw?.case_number || d?.case_number_text || '').trim();
            const cn = cnRaw || extractCaseNumberFromText(String(d?.title || d?._raw?.title || d?._raw?.name || d?.name || '')) || '';
            if (!cn || caseNumbers.includes(cn)) continue;
            caseNumbers.push(cn);
            if (caseNumbers.length >= practiceCaseMapMax) break;
          }
          if (caseNumbers.length >= practiceCaseMapMax) break;
        }

        for (const cn of caseNumbers) {
          const docId = await resolveCourtDecisionDocIdByCaseNumber(this.zoAdapter, cn);
          if (!docId) { unmapped.push(cn); continue; }
          mapped.push({ case_number: cn, doc_id: docId });
          const id = String(docId);
          if (seen.has(id)) continue;
          seen.add(id);
          aggregated.push({ doc_id: docId, case_number: cn, source: 'court_practice' });
          if (aggregated.length >= practiceLimit) break;
        }

        (args.__debug_stats ??= {});
        args.__debug_stats.court_practice = {
          queries: courtPracticeQueries,
          candidates_total: practiceCandidatesTotal,
          case_numbers_collected: caseNumbers.length,
          mapped: mapped.length,
          unmapped: unmapped.length,
        };
      } catch (e: any) {
        practiceError = practiceError || String(e?.message || e);
      }
    }

    // Build structured payload sections
    const conclusion = {
      summary: `Строк ${normalizedAppeal === 'cassation' ? 'касаційного' : 'апеляційного'} оскарження ${normalizedEvent === 'ruling' ? 'ухвали' : 'рішення'} становить ${days} днів.`,
      conditions: `Строк обчислюється з дня ${normalizedEvent === 'ruling' ? 'проголошення ухвали' : 'проголошення рішення'} або з дня отримання повного тексту судового рішення (залежно від конкретних обставин справи).`,
      risks: `Ризик пропуску строку у разі несвоєчасного отримання повного тексту рішення. Поновлення строку можливе лише за наявності поважних причин, які суд оцінює за сукупністю критеріїв.`,
    };

    const normsSection = {
      act: procedureCode === 'cpc' ? 'Цивільний процесуальний кодекс України' : procedureCode === 'gpc' ? 'Господарський процесуальний кодекс України' : procedureCode === 'cac' ? 'Кодекс адміністративного судочинства України' : 'Кримінальний процесуальний кодекс України',
      article: procedureCode === 'cpc' ? 'стаття 354' : procedureCode === 'gpc' ? 'стаття 256' : procedureCode === 'cac' ? 'стаття 295' : 'стаття 395',
      quote: normsReference?.content?.[0]?.text || 'Норма не знайдена через обмеження пошуку',
      commentary: `Ключовим є момент початку перебігу строку: з дня проголошення рішення або з дня отримання його повного тексту. Суди застосовують правило "на користь особи" при неясності щодо дати отримання.`,
      source_url: 'https://zakon.rada.gov.ua/laws/show/1618-15',
      query_used: normsQuery,
      ...(normsError ? { error: normsError } : {}),
    };

    const renewalCriteria = {
      title: 'Критерії поновлення пропущеного строку (позиція ВС)',
      criteria: [
        { criterion: 'Тривалість пропущеного строку', explanation: 'Суд оцінює, наскільки довго особа пропустила строк після його закінчення' },
        { criterion: 'Об\'єктивна непереборність обставин', explanation: 'Причини мають бути непереборними, не залежати від волевиявлення особи' },
        { criterion: 'Поведінка особи', explanation: 'Чи вживала особа розумних заходів для реалізації права у строк' },
        { criterion: 'Своєчасність звернення з клопотанням', explanation: 'Клопотання про поновлення має бути подано негайно після усунення перешкод' },
        { criterion: 'Наявність доказів поважності причин', explanation: 'Особа повинна документально підтвердити обставини, що перешкоджали своєчасному оскарженню' },
      ],
      source_note: 'Критерії сформульовані на основі усталеної практики Верховного Суду',
    };

    const risksAndCounterarguments = {
      title: 'Контраргументи та процесуальні ризики',
      counterarguments: [
        { argument: 'Строк обчислюється з дня проголошення, а не отримання', basis: 'За загальним правилом строк починається з дня проголошення рішення', mitigation: 'Довести, що особа не була присутня при проголошенні' },
        { argument: 'Несвоєчасне отримання повного тексту не є поважною причиною', basis: 'Суд може вважати, що особа мала можливість отримати текст через Електронний суд', mitigation: 'Довести об\'єктивну неможливість отримання' },
      ],
      procedural_risks: [
        'Повернення апеляційної скарги без розгляду через пропуск строку',
        'Відмова у поновленні строку через недостатність доказів',
        'Залишення клопотання без задоволення через несвоєчасність подання',
        'Відмова у відкритті касаційного провадження через пропуск строку',
      ],
    };

    const actionChecklist = {
      title: 'Чеклист дій та доказів',
      steps: [
        { step: 'Визначити точну дату початку перебігу строку', details: 'З\'ясувати дату проголошення рішення або дату отримання повного тексту' },
        { step: 'Розрахувати кінцеву дату строку', details: `Додати ${days} днів до дати початку` },
        { step: 'У разі пропуску строку - підготувати клопотання про поновлення', details: 'Обґрунтувати поважність причин' },
        { step: 'Підготувати апеляційну скаргу', details: 'Перевірити наявність всіх обов\'язкових реквізитів' },
        { step: 'Сплатити судовий збір', details: 'Розрахувати розмір збору відповідно до предмета оскарження' },
        { step: 'Подати скаргу через Електронний суд або канцелярію', details: 'Зберегти підтвердження подання' },
      ],
      required_evidence: [
        'Копія оскаржуваного рішення з відміткою про дату проголошення',
        'Підтвердження дати отримання повного тексту',
        'Докази поважності причин пропуску строку (якщо пропущено)',
        'Докази вжиття розумних заходів для своєчасного оскарження',
        'Квитанція про сплату судового збору',
        'Докази надіслання копій скарги іншим учасникам справи',
      ],
    };

    const payload: any = {
      conclusion,
      procedure_code: procedureCode,
      event_type: args.event_type,
      appeal_type: args.appeal_type,
      event_date: eventDate,
      received_full_text_date: receivedFullTextDate || undefined,
      days,
      variants,
      norms: normsSection,
      renewal_criteria: renewalCriteria,
      sources: {
        supreme_court_practice: aggregated,
        practice_query: triedQueries[0] || primaryQueries[0],
        practice_queries_tried: triedQueries,
        practice_time_range: practiceDisableTimeRange ? null : practiceTimeRange,
        practice_disable_time_range: practiceDisableTimeRange,
        practice_use_court_practice: practiceUseCourtPractice,
        practice_case_map_max: practiceCaseMapMax,
        ...(args?.__debug_stats?.court_practice ? { court_practice_map_stats: args.__debug_stats.court_practice } : {}),
        ...(practiceError ? { practice_error: practiceError } : {}),
      },
      risks_and_counterarguments: risksAndCounterarguments,
      action_checklist: actionChecklist,
      warnings: [
        ...(normCode ? [] : ['Norms lookup is available only for cpc/gpc via search_procedural_norms.']),
        'Deadlines and starting-point rules must be verified against the applicable procedural code and Supreme Court practice for the specific situation.',
      ],
    };

    // Practice expansion
    if (practiceExpandDocs > 0 && aggregated.length > 0) {
      const toExpand = aggregated.slice(0, practiceExpandDocs);
      const expanded: any[] = [];
      let expandError: string | null = null;
      const expandStart = Date.now();

      for (const item of toExpand) {
        const docIdRaw = item?.doc_id;
        if (docIdRaw == null) continue;
        try {
          const toolResp = await this.getCourtDecisionForExpansion(docIdRaw, 5, reasoningBudget);
          const parsed = safeParseJsonFromToolResult(toolResp);
          const sections = Array.isArray(parsed?.sections) ? parsed.sections : [];
          const focus = sections.filter((s: any) => s?.type === SectionType.COURT_REASONING || s?.type === SectionType.DECISION);
          expanded.push({
            doc_id: item.doc_id,
            url: parsed?.url || item?.url,
            case_number: parsed?.case_number || item?.case_number,
            sections: focus.slice(0, practiceExpandDepth).map((s: any) => ({
              type: s.type,
              text: typeof s.text === 'string' && s.text.length > 1200 ? `${s.text.slice(0, 1200)}…` : s.text,
            })),
          });
        } catch (e: any) {
          expandError = String(e?.message || e);
        }
      }

      // SC theses
      const scTheses: any[] = [];
      for (const exp of expanded) {
        const reasoningSections = exp.sections?.filter((s: any) => s.type === SectionType.COURT_REASONING) || [];
        const decisionSections = exp.sections?.filter((s: any) => s.type === SectionType.DECISION) || [];
        if (reasoningSections.length > 0 || decisionSections.length > 0) {
          const mainQuote = reasoningSections[0]?.text || decisionSections[0]?.text || '';
          scTheses.push({
            thesis: `Позиція ВС щодо ${normalizedAppeal === 'cassation' ? 'касаційного' : 'апеляційного'} оскарження та поновлення строків`,
            court_and_date: `Верховний Суд, справа № ${exp.case_number || 'невідомо'}`,
            quote: mainQuote.slice(0, 600) + (mainQuote.length > 600 ? '…' : ''),
            context: `Справа стосується питання обчислення строку ${normalizedAppeal === 'cassation' ? 'касаційного' : 'апеляційного'} оскарження`,
            section_type: reasoningSections.length > 0 ? 'COURT_REASONING' : 'DECISION',
            doc_id: exp.doc_id,
            url: exp.url,
          });
        }
      }

      // Structured cases
      const structuredCases: any[] = [];
      for (const exp of expanded) {
        const caseRelevance = exp.sections?.some((s: any) =>
          s.text?.toLowerCase().includes('апеляц') || s.text?.toLowerCase().includes('строк')
        ) ? 'Містить позицію щодо строків апеляційного оскарження' :
        exp.sections?.some((s: any) => s.text?.toLowerCase().includes('поновлення')) ? 'Містить критерії поновлення пропущеного строку' :
        'Релевантна практика щодо процесуальних строків';

        structuredCases.push({
          case_number: exp.case_number || 'Номер справи не вказано',
          court: 'Верховний Суд',
          date: 'Дата не вказана',
          relevance_reason: caseRelevance,
          quote: exp.sections?.[0]?.text?.slice(0, 400) || 'Текст недоступний',
          section_type: exp.sections?.[0]?.type || 'UNKNOWN',
          doc_id: exp.doc_id,
          url: exp.url,
        });
      }

      payload.sources.supreme_court_practice_expanded = {
        requested: practiceExpandDocs,
        depth: practiceExpandDepth,
        returned: expanded.length,
        time_taken_ms: Date.now() - expandStart,
        items: expanded,
        ...(expandError ? { warning: expandError } : {}),
      };
      payload.supreme_court_theses = scTheses;
      payload.structured_cases = structuredCases;

      if (expanded.length === 0) {
        payload.warnings.push('Practice auto-expand did not return any extracted sections.');
      }
    }

    if (aggregated.length === 0) {
      payload.warnings.push('No Supreme Court practice results were retrieved.');
    }

    return this.wrapResponse(payload);
  }

  /** Helper for practice expansion - fetches a court decision by doc_id */
  private async getCourtDecisionForExpansion(docId: number, depth: number, budget: string): Promise<ToolResult> {
    const searchResult = await this.zoAdapter.searchCourtDecisions({
      meta: { search: String(docId) },
      limit: 1,
      fulldata: 1,
    });

    const metadata = searchResult?.data?.[0] || null;
    const fullTextData = await this.zoAdapter.getDocumentFullText(docId);
    const doc = {
      ...metadata,
      text: fullTextData?.text,
      html: fullTextData?.html,
      case_number: fullTextData?.case_number || metadata?.case_number,
    };

    const fullText = typeof doc?.full_text === 'string' ? doc.full_text : (typeof doc?.text === 'string' ? doc.text : '');
    const url = typeof doc?.url === 'string' ? doc.url : `https://zakononline.ua/court-decisions/show/${docId}`;

    const extractedSections = fullText
      ? await this.sectionizer.extractSections(fullText, budget === 'deep')
      : [];

    const sections = Array.isArray(extractedSections)
      ? extractedSections
          .filter((s: any) => s && typeof s.text === 'string')
          .slice(0, 10)
          .map((s: any) => ({ type: s.type, text: s.text }))
      : [];

    return this.wrapResponse({
      doc_id: doc?.doc_id || doc?.zakononline_id || docId,
      case_number: doc?.case_number || undefined,
      url,
      depth,
      sections: sections.slice(0, depth),
      full_text_length: fullText.length,
    });
  }

  private async buildProceduralChecklist(args: any): Promise<ToolResult> {
    const procedureCode = mapProcedureCodeToShort(args.procedure_code || args.code);
    const stage = String(args.stage || '').trim().toLowerCase();
    const caseCategory = typeof args.case_category === 'string' ? args.case_category.trim() : undefined;

    if (!procedureCode) throw new Error('procedure_code must be one of: cpc, gpc, cac, crpc');
    if (!stage) throw new Error('stage parameter is required');

    const stageKey = stage.includes('апел') ? 'апеляція'
      : stage.includes('кас') ? 'касація'
      : stage.includes('забезпеч') ? 'забезпечення'
      : stage.includes('зустр') ? 'зустрічний позов'
      : 'позов';

    const normQuery = `${stageKey} вимоги форма зміст додатки строк`;
    const norms = await this.searchProceduralNorms({ code: procedureCode === 'gpc' ? 'gpc' : 'cpc', query: normQuery });

    return this.wrapResponse({
      stage: args.stage,
      procedure_code: procedureCode,
      case_category: caseCategory,
      steps: [
        'Визначити юрисдикцію і підсудність',
        'Перевірити строки та підстави для поновлення (якщо потрібно)',
        'Підготувати процесуальний документ відповідно до вимог кодексу',
        'Додати докази та підтвердження направлення копій іншим учасникам',
        'Сплатити судовий збір або підготувати заяву про звільнення/відстрочку',
        'Подати через належний канал (Е-суд/канцелярія) та зберегти підтвердження',
      ],
      typical_refusal_grounds: [
        'Пропуск строку без належного клопотання/обґрунтування',
        'Відсутні обов\'язкові реквізити/додатки',
        'Не надіслано копії іншим учасникам',
        'Не сплачено судовий збір без підстав',
        'Неправильна підсудність/юрисдикція',
      ],
      norms_reference: norms?.content?.[0]?.text,
      warning: 'Checklist is a generic template. Tailor it to the specific procedure.',
    });
  }

  private async calculateMonetaryClaims(args: any): Promise<ToolResult> {
    const amount = Number(args.amount || args.sum || 0);
    const fromDate = typeof args.date_from === 'string' ? args.date_from.slice(0, 10) : '';
    const toDate = typeof args.date_to === 'string' ? args.date_to.slice(0, 10) : '';
    const claimType = typeof args.claim_type === 'string' ? args.claim_type.trim() : 'three_percent';

    if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount must be a positive number');
    if (!fromDate || !toDate) throw new Error('date_from and date_to are required (YYYY-MM-DD)');

    const d1 = new Date(fromDate);
    const d2 = new Date(toDate);
    if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime()) || d2 < d1) throw new Error('Invalid date range');

    const days = Math.ceil((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
    let computed: any = { days };
    if (claimType === 'three_percent' || claimType === '3percent' || claimType === '3%') {
      computed = { ...computed, three_percent: parseFloat((amount * 0.03 * (days / 365)).toFixed(2)) };
    }

    return this.wrapResponse({
      amount,
      date_from: fromDate,
      date_to: toDate,
      claim_type: claimType,
      calculation: computed,
      warning: 'Inflation index and penalties depend on external official indices/contract terms and are not calculated here.',
    });
  }
}

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
import { EdsrVectorizerService, EdrsrSearchFilters } from '../../services/edrsr-vectorizer-service.js';
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
  safeParseJsonFromToolResult,
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
    private readonly edsrVectorizer?: EdsrVectorizerService,
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
Позиція кожного рішення визначається LLM-класифікацією (за/проти/не по суті), а не збігом ключових слів.
Використовуйте для аналізу суперечливої практики або підготовки правової позиції.
Повертає: списки справ pro/contra з цитатою та впевненістю (confidence). Якщо однієї зі сторін немає — повертає insufficient_practice.`,
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

Семантичний (векторний) пошук по реєстру судових рішень: знаходить справи з аналогічною
фабулою за змістом, а не лише за точним збігом слів. Використовуйте для пошуку релевантної
практики, коли є опис ситуації клієнта.
Повертає: список справ з релевантністю (score) та ключовими фрагментами.`,
        inputSchema: {
          type: 'object',
          properties: {
            procedure_code: { type: 'string', enum: ['cpc', 'gpc', 'cac', 'crpc'], description: 'Вид судочинства: cpc (цивільне), gpc (господарське), cac (адміністративне), crpc (кримінальне)' },
            facts_text: { type: 'string', description: 'Опис фактичних обставин справи (довільний текст)' },
            court_level: {
              type: 'string',
              enum: ['SC', 'GrandChamber'],
              description: 'Обмежити пошук інстанцією: SC — лише Верховний Суд (касаційні суди, код суду 99*), GrandChamber — лише Велика Палата ВС (9901). Використовуйте, коли питання саме про позицію Верховного Суду. За замовчуванням — усі інстанції.',
            },
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

    if (!this.ftsService || !this.db) throw new Error('FTS сервіс недоступний для пошуку практики');

    const timeRangeParsed = parseTimeRangeToDates(args.time_range);
    const filters: EdsrFtsFilters = {
      ...(timeRangeParsed.date_from ? { date_from: timeRangeParsed.date_from } : {}),
      ...(timeRangeParsed.date_to ? { date_to: timeRangeParsed.date_to } : {}),
    };
    if (procedureCode) {
      const justiceKind = mapProcedureCodeToJusticeKind(procedureCode);
      if (justiceKind !== null) filters.justice_kind = justiceKind;
    }
    // Supreme Court / Grand Chamber == cassation instance in the EDRSR court table.
    if (courtLevel === 'SC' || courtLevel === 'GrandChamber') filters.instance_code = 1;

    const ftsResp = await this.ftsService.searchFulltext(query, this.db, filters, Math.max(limit, 20), 0);

    // Grand Chamber lives under a single court_code (9901); narrow when explicitly requested.
    let rows = ftsResp.results;
    if (courtLevel === 'GrandChamber') {
      rows = rows.filter((r) => String(r.court_code || '') === '9901');
    }

    const results = rows.slice(0, limit).map((r) => ({
      doc_id: r.doc_id,
      court_code: r.court_code,
      date: r.adjudication_date,
      case_number: r.cause_num,
      url: `https://reyestr.court.gov.ua/Review/${r.doc_id}`,
      section_focus: sectionFocus,
      snippets: r.headline ? [r.headline] : [],
    }));

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

    // Primary path: retrieve candidates once (no pro/contra keyword suffix) and let the LLM
    // classify each decision's holding relative to the user's thesis (supports / opposes /
    // not-on-point) with a cited fragment. The legacy keyword suffix (задовольнити/відмовити)
    // is non-discriminative and cannot separate opposing holdings — kept only as a fallback
    // when the LLM or vectorizer is unavailable.
    if (this.llm) {
      try {
        const gathered = await this.gatherProContraCandidates(
          query, justiceKind, timeRangeParsed, Math.min(12, Math.max(6, limit * 2)),
        );
        if (gathered.candidates.length > 0) {
          const stances = await this.classifyHoldings(query, gathered.candidates);
          if (stances) {
            const pro: any[] = [];
            const contra: any[] = [];
            for (const c of gathered.candidates) {
              const v = stances.get(c.doc_id);
              if (!v) continue;
              const row = {
                doc_id: c.doc_id,
                court_code: c.court_code,
                date: c.date,
                case_number: c.case_number,
                snippet: v.quote || c.fragment,
                confidence: v.confidence,
              };
              if (v.stance === 'supports') pro.push(row);
              else if (v.stance === 'opposes') contra.push(row);
              // not_on_point → dropped
            }
            const byConf = (a: any, b: any) => (b.confidence || 0) - (a.confidence || 0);
            pro.sort(byConf);
            contra.sort(byConf);
            const proCases = pro.slice(0, limit);
            const contraCases = contra.slice(0, limit);

            const payload: any = {
              procedure_code: procedureCode,
              query,
              time_range: args.time_range,
              search_method: `llm_holding_${gathered.method}`,
              pro: proCases,
              contra: contraCases,
              total_pro: proCases.length,
              total_contra: contraCases.length,
            };
            if (proCases.length === 0 || contraCases.length === 0) {
              payload.insufficient_practice = true;
              payload.hint = proCases.length === 0 && contraCases.length === 0
                ? 'Серед знайдених рішень немає таких, що прямо підтверджують або спростовують тезу. Спробуйте переформулювати тезу або скористайтесь find_similar_fact_pattern_cases.'
                : (proCases.length === 0
                    ? 'Знайдено лише практику ПРОТИ тези; практики ЗА не виявлено серед кандидатів.'
                    : 'Знайдено лише практику ЗА тезу; практики ПРОТИ не виявлено серед кандидатів.');
            }
            if (timeRangeParsed.warning) payload.warning = timeRangeParsed.warning;
            return this.wrapResponse(payload);
          }
        }
      } catch (err: any) {
        logger.warn('[comparePracticeProContra] holding-classification path failed, falling back to keyword FTS', {
          error: err?.message,
        });
      }
    }

    const ftsSearch = async (suffix: string) => {
      if (!this.ftsService || !this.db) return { results: [], instanceLabel: '' };

      const baseFilters: EdsrFtsFilters = {
        ...(justiceKind !== null ? { justice_kind: justiceKind } : {}),
        ...(timeRangeParsed.date_from ? { date_from: timeRangeParsed.date_from } : {}),
        ...(timeRangeParsed.date_to ? { date_to: timeRangeParsed.date_to } : {}),
      };

      const bareQuery = trimFtsQuery(query, 3);
      for (const inst of [
        { code: 1, label: 'Верховний Суд' },
        { code: 2, label: 'апеляційні суди' },
        { code: 3, label: 'суди першої інстанції' },
      ] as const) {
        const resp = await this.ftsService.searchFulltext(
          `${bareQuery} ${suffix}`, this.db,
          { ...baseFilters, instance_code: inst.code }, limit,
          0,
          // Snippet highlights the topic, not the "задовольнити/відмовити" discriminator suffix.
          bareQuery,
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

    // The pro/contra discriminator (keyword suffix) is non-discriminative: SC decisions
    // routinely contain both "задовольнити" and "відмовити", so the same document can rank
    // on both sides. Cross-dedupe by doc_id, keeping each document on the side where it
    // ranks higher, so one decision can never appear as both pro and contra.
    const proByDoc = new Map<number, any>();
    for (const d of proResult.results) if (!proByDoc.has(d.doc_id)) proByDoc.set(d.doc_id, d);
    const contraByDoc = new Map<number, any>();
    for (const d of contraResult.results) if (!contraByDoc.has(d.doc_id)) contraByDoc.set(d.doc_id, d);

    for (const [docId, proDoc] of [...proByDoc.entries()]) {
      const contraDoc = contraByDoc.get(docId);
      if (!contraDoc) continue;
      // Same doc on both sides → keep on the higher-ranked side only.
      if ((contraDoc.rank || 0) >= (proDoc.rank || 0)) {
        proByDoc.delete(docId);
      } else {
        contraByDoc.delete(docId);
      }
    }

    const mapFtsCase = (d: any) => ({
      doc_id: d.doc_id,
      court_code: d.court_code,
      date: d.adjudication_date,
      case_number: d.cause_num,
      snippet: d.headline,
    });

    const proCases = [...proByDoc.values()].slice(0, limit).map(mapFtsCase);
    const contraCases = [...contraByDoc.values()].slice(0, limit).map(mapFtsCase);
    const distinctDocs = new Set<number>([
      ...proCases.map(c => c.doc_id),
      ...contraCases.map(c => c.doc_id),
    ]);

    const payload: any = {
      procedure_code: procedureCode,
      query,
      time_range: args.time_range,
      court_level_pro: proCases.length > 0 ? (proResult.instanceLabel || undefined) : undefined,
      court_level_contra: contraCases.length > 0 ? (contraResult.instanceLabel || undefined) : undefined,
      pro: proCases,
      contra: contraCases,
      total_pro: proCases.length,
      total_contra: contraCases.length,
    };

    // Honest signalling instead of fabricating a 1-vs-1 controversy out of a single
    // boilerplate-matched decision. The keyword discriminator cannot reliably separate
    // opposing holdings; when too little distinct practice is found, say so.
    if (distinctDocs.size <= 1) {
      payload.insufficient_practice = true;
      payload.hint =
        'Недостатньо різної практики для протиставлення позицій «за/проти» за цим запитом. ' +
        'Розбиття за ключовими словами не є надійним для класифікації позицій суду — ' +
        'перевірте знайдені рішення вручну або скористайтесь find_similar_fact_pattern_cases ' +
        'чи search_edrsr_fulltext із вужчим запитом.';
    }
    if (timeRangeParsed.warning) payload.warning = timeRangeParsed.warning;

    return this.wrapResponse(payload);
  }

  /**
   * Retrieve distinct candidate decisions for pro/contra classification — semantic search
   * (preferred: relevant chunk text becomes the fragment) with an FTS fallback. No pro/contra
   * keyword suffix here; discrimination is done downstream by the LLM.
   */
  private async gatherProContraCandidates(
    query: string,
    justiceKind: number | null,
    timeRangeParsed: { date_from?: string; date_to?: string },
    maxN: number,
  ): Promise<{ candidates: Array<{ doc_id: number; court_code?: number; date?: string; case_number?: string; fragment: string }>; method: string }> {
    // Semantic (preferred)
    if (this.edsrVectorizer) {
      try {
        const semFilters: EdrsrSearchFilters = {
          ...(justiceKind !== null ? { justice_kind: justiceKind } : {}),
          ...(timeRangeParsed.date_from ? { date_from: timeRangeParsed.date_from } : {}),
          ...(timeRangeParsed.date_to ? { date_to: timeRangeParsed.date_to } : {}),
        };
        const hits = await this.edsrVectorizer.semanticSearch(query, semFilters, maxN * 3);
        const seen = new Set<number>();
        const out: any[] = [];
        for (const h of hits) {
          if (seen.has(h.doc_id)) continue;
          seen.add(h.doc_id);
          out.push({
            doc_id: h.doc_id,
            court_code: h.metadata.court_code,
            date: h.metadata.adjudication_date,
            case_number: h.metadata.cause_num,
            fragment: (h.text || '').slice(0, 900),
          });
          if (out.length >= maxN) break;
        }
        if (out.length > 0) return { candidates: out, method: 'semantic_hnsw' };
      } catch (err: any) {
        logger.warn('[gatherProContraCandidates] semantic search failed, falling back to FTS', { error: err?.message });
      }
    }

    // FTS fallback (headline as fragment)
    if (this.ftsService && this.db) {
      const baseFilters: EdsrFtsFilters = {
        ...(justiceKind !== null ? { justice_kind: justiceKind } : {}),
        ...(timeRangeParsed.date_from ? { date_from: timeRangeParsed.date_from } : {}),
        ...(timeRangeParsed.date_to ? { date_to: timeRangeParsed.date_to } : {}),
      };
      for (const inst of [
        { code: 1 }, { code: 2 }, { code: 3 },
      ] as const) {
        const resp = await this.ftsService.searchFulltext(
          trimFtsQuery(query), this.db, { ...baseFilters, instance_code: inst.code }, maxN,
        );
        if (resp.results.length > 0) {
          const seen = new Set<number>();
          const out: any[] = [];
          for (const d of resp.results) {
            if (seen.has(d.doc_id)) continue;
            seen.add(d.doc_id);
            out.push({
              doc_id: d.doc_id,
              court_code: d.court_code,
              date: d.adjudication_date,
              case_number: d.cause_num,
              fragment: d.headline || '',
            });
          }
          if (out.length > 0) return { candidates: out, method: 'fts' };
        }
      }
    }

    return { candidates: [], method: '' };
  }

  /**
   * LLM holding classification: for each candidate decision, classify its holding relative to
   * the user's thesis as supports / opposes / not_on_point, with a short cited fragment and
   * confidence. One batched call. Returns null on parse failure so the caller can fall back.
   */
  private async classifyHoldings(
    thesis: string,
    candidates: Array<{ doc_id: number; case_number?: string; court_code?: number; fragment: string }>,
  ): Promise<Map<number, { stance: 'supports' | 'opposes' | 'not_on_point'; quote: string; confidence: number }> | null> {
    if (!this.llm) return null;
    const items = candidates.map((c, i) => (
      `#${i} doc_id=${c.doc_id} справа=${c.case_number || '—'}\nФрагмент: ${(c.fragment || '').replace(/\s+/g, ' ').slice(0, 800)}`
    )).join('\n\n');

    const system =
      'Ти суддя-аналітик. Тобі дано ТЕЗУ та фрагменти судових рішень. ' +
      'Для КОЖНОГО рішення визнач його позицію щодо тези: ' +
      '"supports" — рішення підтверджує тезу; "opposes" — спростовує тезу; ' +
      '"not_on_point" — фрагмент не дозволяє визначити позицію щодо тези. ' +
      'Якщо не впевнений — став "not_on_point". Відповідай ВИКЛЮЧНО валідним JSON.';
    const user =
      `ТЕЗА: ${thesis}\n\nРІШЕННЯ:\n${items}\n\n` +
      'Поверни JSON: {"classifications":[{"doc_id":<число>,"stance":"supports|opposes|not_on_point",' +
      '"quote":"<коротка цитата з фрагмента українською, ≤200 симв.>","confidence":<0..1>}]}';

    const response = await this.llm.chatCompletion(
      {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      },
      'standard',
    );

    let parsed: any;
    try {
      parsed = JSON.parse(response.content || '{}');
    } catch {
      logger.warn('[classifyHoldings] non-JSON LLM response');
      return null;
    }
    const list = Array.isArray(parsed?.classifications) ? parsed.classifications : [];
    if (list.length === 0) return null;

    const validDocIds = new Set(candidates.map(c => c.doc_id));
    const map = new Map<number, { stance: 'supports' | 'opposes' | 'not_on_point'; quote: string; confidence: number }>();
    for (const item of list) {
      const docId = Number(item?.doc_id);
      if (!validDocIds.has(docId)) continue;
      const stance = item?.stance;
      if (stance !== 'supports' && stance !== 'opposes' && stance !== 'not_on_point') continue;
      const confidence = typeof item?.confidence === 'number' ? Math.max(0, Math.min(1, item.confidence)) : 0.5;
      map.set(docId, { stance, quote: typeof item?.quote === 'string' ? item.quote.slice(0, 300) : '', confidence });
    }
    return map.size > 0 ? map : null;
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

    // Optional instance filter: SC = Supreme Court (cassation courts, court_code 99*),
    // GrandChamber = Велика Палата (9901). Lets the orchestrator answer "what does the
    // Supreme Court say" instead of being crowded out by long first-instance texts that
    // dominate pure cosine ranking.
    const courtLevelFilter: 'SC' | 'GrandChamber' | undefined =
      args.court_level === 'SC' || args.court_level === 'GrandChamber' ? args.court_level : undefined;
    const matchesCourtLevel = (courtCode: any): boolean => {
      if (!courtLevelFilter) return true;
      const code = String(courtCode ?? '');
      if (!code.startsWith('99')) return false;
      return courtLevelFilter === 'GrandChamber' ? code === '9901' : true;
    };

    const timeRangeParsed = parseTimeRangeToDates(args.time_range);
    const justiceKind = mapProcedureCodeToJusticeKind(procedureCode);

    let results: any[] = [];
    let courtLevel = '';
    let searchMethod = '';
    // Term extraction is deferred to the FTS fallback (below). The semantic path
    // embeds the full fact pattern directly, so we no longer block on an upfront
    // keyword-extraction LLM call that — when it returned no keywords — collapsed
    // the query to a truncated literal and zeroed out the results.
    let extractedTerms: string[] = [];
    let ftsQuery = '';
    // BGE-M3 is the ideal consumer of natural-language facts; pass the fact pattern
    // straight through (capped — the model truncates long input anyway).
    const semanticQuery = factsText.slice(0, 4000);

    // Primary path: HNSW semantic search over the unified edrsr_serving collection
    // (BGE-M3 vectors, 296M chunks). Semantic similarity is the natural fit for
    // "find cases with a similar fact pattern", and HNSW is fast (~300ms warm) —
    // unlike the multi-instance FTS loop below, which scans the full-text index 3×
    // and routinely blew the 60s tool timeout on practice_analysis queries.
    if (this.edsrVectorizer) {
      try {
        const semFilters: EdrsrSearchFilters = {
          ...(justiceKind !== null ? { justice_kind: justiceKind } : {}),
          ...(timeRangeParsed.date_from ? { date_from: timeRangeParsed.date_from } : {}),
          ...(timeRangeParsed.date_to ? { date_to: timeRangeParsed.date_to } : {}),
        };
        // Over-fetch chunks, then dedupe to distinct cases (a case may match on
        // several chunks; we want the top distinct decisions). When restricting to a
        // court level (SC is a minority of the corpus), over-fetch much wider so enough
        // 99* decisions survive the post-filter.
        const overfetch = courtLevelFilter ? Math.max(limit * 20, 200) : limit * 4;
        const hits = await this.edsrVectorizer.semanticSearch(semanticQuery, semFilters, overfetch);
        const seen = new Set<number>();
        for (const h of hits) {
          if (seen.has(h.doc_id)) continue;
          if (!matchesCourtLevel(h.metadata.court_code)) continue;
          seen.add(h.doc_id);
          results.push({
            doc_id: h.doc_id,
            court_code: h.metadata.court_code,
            date: h.metadata.adjudication_date,
            case_number: h.metadata.cause_num,
            snippet: (h.text || '').slice(0, 600) + ((h.text || '').length > 600 ? '…' : ''),
            score: typeof h.score === 'number' ? Number(h.score.toFixed(4)) : undefined,
          });
          if (results.length >= limit) break;
        }
        if (results.length > 0) searchMethod = 'semantic_hnsw';
      } catch (err: any) {
        logger.warn('[findSimilarFactPatternCases] semantic HNSW search failed, falling back to FTS', { error: err.message });
      }
    }

    // Fallback: multi-instance FTS (when the vectorizer is unavailable or returns
    // nothing — e.g. very rare terminology not well represented in embeddings).
    if (results.length === 0 && this.ftsService && this.db) {
      // FTS is lexical, so here (and only here) we extract keywords from the facts.
      const extracted = await extractSearchTermsWithAI(factsText, this.llm);
      extractedTerms = Array.isArray(extracted?.keywords) ? extracted.keywords : [];
      ftsQuery = typeof extracted?.searchQuery === 'string' && extracted.searchQuery.trim().length > 0
        ? extracted.searchQuery.trim()
        : (extractedTerms.length > 0 ? extractedTerms.join(' ') : factsText.slice(0, 180));

      const baseFilters: EdsrFtsFilters = {
        ...(justiceKind !== null ? { justice_kind: justiceKind } : {}),
        ...(timeRangeParsed.date_from ? { date_from: timeRangeParsed.date_from } : {}),
        ...(timeRangeParsed.date_to ? { date_to: timeRangeParsed.date_to } : {}),
      };

      // When the caller asked for Supreme Court only, restrict the FTS fallback to
      // instance_code=1 (Верховний Суд) rather than walking down to first instance.
      const instances = courtLevelFilter
        ? ([{ code: 1, label: 'Верховний Суд' }] as const)
        : ([
            { code: 1, label: 'Верховний Суд' },
            { code: 2, label: 'апеляційні суди' },
            { code: 3, label: 'суди першої інстанції' },
          ] as const);
      for (const inst of instances) {
        const resp = await this.ftsService.searchFulltext(
          trimFtsQuery(ftsQuery), this.db, { ...baseFilters, instance_code: inst.code }, limit,
        );
        if (resp.results.length > 0) {
          courtLevel = inst.label;
          results = resp.results
            .filter((d) => matchesCourtLevel(d.court_code))
            .slice(0, limit)
            .map((d) => ({
            doc_id: d.doc_id,
            court_code: d.court_code,
            date: d.adjudication_date,
            case_number: d.cause_num,
            snippet: d.headline,
          }));
          searchMethod = 'fts';
          break;
        }
      }
    }

    const payload: any = {
      procedure_code: procedureCode,
      time_range: args.time_range,
      court_level: courtLevel || (courtLevelFilter === 'GrandChamber' ? 'Велика Палата ВС' : courtLevelFilter === 'SC' ? 'Верховний Суд' : undefined),
      court_level_filter: courtLevelFilter || undefined,
      search_method: searchMethod || undefined,
      extracted_search_terms: extractedTerms,
      search_query: searchMethod === 'fts' ? ftsQuery : factsText.slice(0, 200),
      results,
    };
    if (timeRangeParsed.warning) payload.time_range_warning = timeRangeParsed.warning;
    if (results.length === 0) {
      payload.hint = courtLevelFilter
        ? `Практику ${courtLevelFilter === 'GrandChamber' ? 'Великої Палати ВС' : 'Верховного Суду'} за цією фабулою не знайдено. Спробуйте без court_level (усі інстанції), ширшу фабулу, або search_supreme_court_practice / search_edrsr_fulltext.`
        : 'Результатів не знайдено. Спробуйте переформулювати фабулу ширше або скористайтесь search_edrsr_fulltext з коротшим запитом (2-3 слова) чи compare_practice_pro_contra.';
    }

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

    // (Removed) Legacy "court practice recall" fallback — it depended on the deleted
    // ZakonOnline adapter stubs (zoPracticeAdapter.searchCourtDecisions +
    // resolveCourtDecisionDocIdByCaseNumber) and only ever returned empty. Primary
    // (searchSupremeCourtPractice over EDRSR FTS) + broad queries cover recall now.

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
    // Read full text + case number straight from the prod EDRSR DB (replaces the deleted
    // ZakonOnline adapter stubs searchCourtDecisions/getDocumentFullText).
    let fullText = '';
    let caseNumber: string | undefined;
    if (this.db) {
      const r = await this.db.query(
        `SELECT f.full_text, d.cause_num
         FROM edrsr_fulltext f
         LEFT JOIN edrsr_documents d ON d.doc_id = f.doc_id
         WHERE f.doc_id = $1 LIMIT 1`,
        [docId],
      );
      const row = r.rows?.[0];
      fullText = typeof row?.full_text === 'string' ? row.full_text : '';
      caseNumber = row?.cause_num || undefined;
    }

    const url = `https://reyestr.court.gov.ua/Review/${docId}`;

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
      doc_id: docId,
      case_number: caseNumber,
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

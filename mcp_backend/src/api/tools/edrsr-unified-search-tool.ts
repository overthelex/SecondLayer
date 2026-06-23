/**
 * EDRSR Unified Search — single search_court_decisions tool replacing 4 overlapping search tools.
 *
 * Modes:
 * - structured — SQL WHERE on metadata (cause_num, judge, court, date, category, military presets)
 * - fulltext   — PostgreSQL tsvector FTS with highlights
 * - hybrid     — FTS + Qdrant vectors merged via Reciprocal Rank Fusion
 * - semantic   — Pure vector search (available for КУпАП/justice_kind=5, FTS fallback for others)
 *
 * Replaces: search_edrsr_decisions, search_edrsr_fulltext, search_edrsr_semantic, edrsr_hybrid_search
 * Also removes: get_edrsr_decision_fulltext (duplicate of get_court_decision)
 */

import { BaseToolHandler, ToolDefinition, ToolResult } from '../base-tool-handler.js';
import { logger } from '../../utils/logger.js';
import { EDRSR_METADATA_SEARCH_ORDER } from '../../services/search-ranking-config.js';
import type { SearchResultFilter } from '../../services/search-result-filter.js';
import type { QueryReformulator } from '../../services/query-reformulator.js';
import type { EdsrFtsService, EdsrFtsFilters, EdsrFtsSearchResponse } from '../../services/edrsr-fts-service.js';
import { selectFtsTerms } from '../../services/edrsr-fts-service.js';
import type { EdsrVectorizerService, EdrsrSearchFilters, EdrsrSearchResult } from '../../services/edrsr-vectorizer-service.js';

const DEFAULT_RRF_K = 60;
const DEFAULT_OVERSAMPLE = 3;
const MAX_OVERSAMPLE = 5;
// plainto_tsquery ANDs every token, and a party filter adds ~2 more conjuncts, so one
// rare term can collapse the whole conjunction to ~0 (observed: "…вантажу логістика" +
// defendant → 0 while 6 tokens → 144; and "Нова Пошта кур'єрська служба пошкодження
// вантажу" + defendant → 1, starving the precise FTS leg). Rather than guess a single
// fixed cap, start from the leading FULLTEXT_MAX_TOKENS and relax DOWNWARD while the probe
// stays near-empty — dropping the trailing (least-salient) token and retrying down to
// FTS_MIN_TOKENS. Dropping a conjunct can only widen the match set (monotone), so this
// stops at the narrowest query that clears FTS_RELAX_MIN_RESULTS — the most precise probe
// that still feeds the leg. The party filter is part of every probe, so relaxation is
// selectivity-aware for free. FTS_MAX_RELAX_STEPS bounds the extra probes on the hot path.
const FULLTEXT_MAX_TOKENS = 6;
const FTS_MIN_TOKENS = 2;
const FTS_MAX_RELAX_STEPS = 4;
// Relax not just on a hard 0, but on near-collapse: 1–2 hits means the AND-chain is
// over-narrow and the FTS leg can't carry recall (the semantic leg ends up masking it).
const FTS_RELAX_MIN_RESULTS = 3;

const KUPAP_PRESETS: Record<string, { category_codes: number[]; label: string }> = {
  'traffic_dui':        { category_codes: [41090, 5952], label: 'П\'яне водіння (ст. 130 КУпАП)' },
  'traffic_accident':   { category_codes: [41080, 5861], label: 'ДТП з пошкодженням (ст. 124 КУпАП)' },
  'domestic_violence':  { category_codes: [41237, 6062], label: 'Домашнє насильство (ст. 173-2 КУпАП)' },
  'hooliganism':        { category_codes: [41235, 6060], label: 'Дрібне хуліганство (ст. 173 КУпАП)' },
  'drugs_alcohol':      { category_codes: [41233], label: 'Розпивання / наркотики (ст. 178, 44 КУпАП)' },
  'admin_oversight':    { category_codes: [41280, 6097], label: 'Порушення адмінагляду (ст. 187 КУпАП)' },
  'child_neglect':      { category_codes: [41256, 6076], label: 'Невиконання обов\'язків щодо дітей (ст. 184 КУпАП)' },
  'petty_theft':        { category_codes: [40956], label: 'Дрібне викрадення (ст. 51 КУпАП)' },
  'border_crossing':    { category_codes: [41352], label: 'Незаконне перетинання кордону (ст. 204-1 КУпАП)' },
  'quarantine':         { category_codes: [13123], label: 'Порушення карантину (ст. 44-3 КУпАП)' },
  'tax_violations':     { category_codes: [5997, 6001], label: 'Податкові правопорушення (ст. 163-1, 163-2 КУпАП)' },
  'no_license':         { category_codes: [41083], label: 'Водіння без документів (ст. 126 КУпАП)' },
  'all_kupap':          { category_codes: [41090, 5952, 41080, 5861, 41237, 6062, 41235, 6060, 41233, 41280, 6097, 41256, 6076, 40956, 41352, 13123, 5997, 6001, 41083], label: 'Всі основні категорії КУпАП' },
};

const MILITARY_PRESETS: Record<string, { category_codes: number[]; label: string }> = {
  'awol':             { category_codes: [40851, 5459, 10660, 12440], label: 'Самовільне залишення частини (ст.407 КК)' },
  'desertion':        { category_codes: [40852, 2050], label: 'Дезертирство (ст.408 КК)' },
  'insubordination':  { category_codes: [40846, 5456], label: 'Непокора (ст.402 КК)' },
  'disobedience':     { category_codes: [40847, 5457], label: 'Невиконання наказу (ст.403 КК)' },
  'draft_evasion':    { category_codes: [40752, 40751, 5390], label: 'Ухилення від мобілізації' },
  'self_harm':        { category_codes: [40853, 5460], label: 'Ухилення через самокалічення (ст.409 КК)' },
  'negligence':       { category_codes: [40867, 2042, 10683], label: 'Недбале ставлення до військової служби (ст.425 КК)' },
  'abuse_of_power':   { category_codes: [40869, 2043, 10682, 11320], label: 'Перевищення влади (ст.426 КК)' },
  'looting':          { category_codes: [40875, 5476], label: 'Мародерство (ст.432 КК)' },
  'all_military':     { category_codes: [40845, 40846, 40847, 40850, 40851, 40852, 40853, 40854, 40855, 40856, 40857, 40862, 40865, 40866, 40867, 40868, 40869, 40871, 40872, 40874, 40875, 40877, 40752, 2039, 2049, 2050, 5459], label: 'Всі військові кримінальні правопорушення' },
};

interface FusedHit {
  doc_id: number;
  rrf_score: number;
  fts_rank: number | null;
  fts_position: number | null;
  fts_headline: string | null;
  qdrant_score: number | null;
  qdrant_position: number | null;
  qdrant_best_chunk_text: string | null;
  qdrant_best_chunk_index: number | null;
  metadata: Record<string, any>;
}

export class EdsrUnifiedSearchTool extends BaseToolHandler {
  private resultFilter?: SearchResultFilter;
  private queryReformulator?: QueryReformulator;

  constructor(
    private db: any,
    private ftsService?: EdsrFtsService,
    private vectorizer?: EdsrVectorizerService,
  ) {
    super();
  }

  setResultFilter(filter: SearchResultFilter): void {
    this.resultFilter = filter;
  }

  setQueryReformulator(reformulator: QueryReformulator): void {
    this.queryReformulator = reformulator;
  }

  getToolDefinitions(): ToolDefinition[] {
    return [{
      name: 'search_court_decisions',
      annotations: { title: 'Пошук судових рішень ЄДРСР', readOnlyHint: true, openWorldHint: true },
      description: `Єдиний інструмент пошуку судових рішень у ЄДРСР (82M+ рішень усіх українських судів з 2006 року).

4 режими пошуку:
• **structured** — за метаданими: номер справи, суддя, суд, дата, категорія, військові пресети. Найшвидший, коли відомі точні параметри.
• **fulltext** — повнотекстовий пошук (PostgreSQL tsvector) з підсвіченими фрагментами. Для пошуку за ключовими словами та юридичними термінами.
• **hybrid** — FTS + семантичний пошук (Qdrant BGE-M3) з мерджем через Reciprocal Rank Fusion. Найкращий recall, коли запит містить і семантику, і точні токени. Семантична нога працює для ВСІХ видів судочинства (justice_kind 1-5).
• **semantic** — чистий семантичний пошук по векторній базі Qdrant (296M чанків, увесь ЄДРСР). Працює для ВСІХ видів судочинства (justice_kind 1-5); justice_kind не обов'язковий (без нього шукає по всіх кодексах). Найкраще для концептуальних/розмовних запитів.

⚠️ Роль сторони (конкретна особа/компанія саме ЯК відповідач або позивач) → передавай party_name + party_role у режимі fulltext/hybrid, а НЕ дописуй слово «відповідач» у query. party_name прив'язується до тексту як фраза, party_role — до рольового слова, тож «де X — відповідач» дасть точніший результат, ніж семантика чи ключові слова. Для точного № справи/статті → structured або fulltext.

Фільтри (спільні для всіх режимів): court_code/court_name, judge, justice_kind, judgment_code, category_code, date_from/date_to, party_name, party_role, court_level (SC=Верховний Суд).
Пресети: military_preset (військові справи), kupap_preset (адмінправопорушення — traffic_dui, traffic_accident, domestic_violence, hooliganism тощо).
Для повного тексту рішення — get_court_decision. Для резолютивки — edrsr_get_decision_dispositive.`,
      inputSchema: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['structured', 'fulltext', 'hybrid', 'semantic'],
            description: 'Режим пошуку: structured (метадані), fulltext (FTS), hybrid (FTS+семантика), semantic (семантика)',
          },
          query: {
            type: 'string',
            description: 'Пошуковий запит (обов\'язковий для fulltext/hybrid/semantic). Наприклад: "ст. 210-1 КУпАП ТЦК неналежне оповіщення". НЕ додавай сюди роль сторони — для цього є party_name/party_role.',
          },
          party_name: {
            type: 'string',
            description: 'Розрізняльне найменування сторони БЕЗ організаційно-правової форми (наприклад "Нова Пошта", а не "ТОВ «Нова Пошта»"). Матчиться як фраза в тексті рішення. Тільки fulltext/hybrid.',
          },
          party_role: {
            type: 'string',
            enum: ['plaintiff', 'defendant', 'any'],
            description: 'Процесуальна роль party_name: plaintiff (позивач), defendant (відповідач), any (будь-яка). Звужує до рішень, де поряд із назвою фігурує відповідне рольове слово. Тільки fulltext/hybrid.',
          },
          cause_num: {
            type: 'string',
            description: 'Номер справи (наприклад, "922/989/18")',
          },
          judge: {
            type: 'string',
            description: 'ПІБ судді або частина ПІБ',
          },
          court_code: {
            type: 'number',
            description: 'Код суду (з таблиці edrsr_courts)',
          },
          court_name: {
            type: 'string',
            description: 'Назва суду або частина назви',
          },
          justice_kind: {
            type: 'number',
            description: 'Вид судочинства: 1=Цивільне, 2=Кримінальне, 3=Господарське, 4=Адміністративне, 5=Адмінправопорушення',
          },
          judgment_code: {
            type: 'number',
            description: 'Форма рішення: 1=Вирок, 2=Постанова, 3=Рішення, 5=Ухвала, 6=Окрема ухвала, 10=Окрема думка',
          },
          category_code: {
            type: 'number',
            description: 'Код категорії справи (з таблиці edrsr_cause_categories)',
          },
          date_from: {
            type: 'string',
            description: 'Дата ухвалення ВІД (YYYY-MM-DD)',
          },
          date_to: {
            type: 'string',
            description: 'Дата ухвалення ДО (YYYY-MM-DD)',
          },
          instance_code: {
            type: 'number',
            description: 'Інстанція суду: 1=Касаційна, 2=Апеляційна, 3=Перша. Працює в усіх режимах (structured/fulltext/hybrid).',
          },
          court_level: {
            type: 'string',
            enum: ['all', 'SC', 'GrandChamber'],
            description: 'Рівень суду: all (всі), SC (Верховний Суд: КЦС/КГС/КАС/ККС), GrandChamber (Велика Палата ВС). SC/GrandChamber → касаційна інстанція (мапиться на instance_code=1). Узгоджено з search_legal_precedents / find_similar_fact_pattern_cases.',
          },
          military_preset: {
            type: 'string',
            enum: ['awol', 'desertion', 'insubordination', 'disobedience', 'draft_evasion', 'self_harm', 'negligence', 'abuse_of_power', 'looting', 'all_military'],
            description: 'Пресет для військових справ (тільки structured). Автоматично встановлює justice_kind=2 та category_code.',
          },
          kupap_preset: {
            type: 'string',
            enum: ['traffic_dui', 'traffic_accident', 'domestic_violence', 'hooliganism', 'drugs_alcohol', 'admin_oversight', 'child_neglect', 'petty_theft', 'border_crossing', 'quarantine', 'tax_violations', 'no_license', 'all_kupap'],
            description: 'Пресет для справ КУпАП. Автоматично встановлює justice_kind=5 та відповідні category_code. traffic_dui=п\'яне водіння, traffic_accident=ДТП, domestic_violence=домашнє насильство, hooliganism=дрібне хуліганство, petty_theft=дрібне викрадення, border_crossing=перетинання кордону, tax_violations=податкові, no_license=без документів.',
          },
          include_fulltext: {
            type: 'boolean',
            default: false,
            description: 'Включити повний текст рішення (тільки structured, знижує швидкість)',
          },
          limit: {
            type: 'number',
            default: 20,
            maximum: 100,
            description: 'Максимальна кількість результатів',
          },
          offset: {
            type: 'number',
            default: 0,
            description: 'Зміщення для пагінації',
          },
          oversample: {
            type: 'number',
            default: 3,
            maximum: 5,
            description: 'Множник кандидатів для hybrid (limit × oversample). Більше — кращий recall.',
          },
          rrf_k: {
            type: 'number',
            default: 60,
            description: 'Параметр RRF для hybrid (стандарт 60).',
          },
        },
        required: ['mode'],
      },
    }];
  }

  async executeTool(name: string, args: any): Promise<ToolResult | null> {
    if (name !== 'search_court_decisions') return null;

    // court_level is the cross-tool convention (search_legal_precedents,
    // find_similar_fact_pattern_cases): SC / GrandChamber → cassation instance. Map it onto
    // instance_code so every mode honours it; explicit instance_code wins if both are given.
    if (!args.instance_code && (args.court_level === 'SC' || args.court_level === 'GrandChamber')) {
      args.instance_code = 1;
    }

    switch (args.mode) {
      case 'structured': return this.searchStructured(args);
      case 'fulltext':   return this.searchFulltext(args);
      case 'hybrid':     return this.searchHybrid(args);
      case 'semantic':   return this.searchSemantic(args);
      default:
        return this.wrapError('Невідомий режим. Доступні: structured, fulltext, hybrid, semantic');
    }
  }

  // ── Structured search (SQL WHERE on metadata) ────────────────────

  private async searchStructured(args: any): Promise<ToolResult> {
    const limit = Math.min(Math.max(args.limit || 20, 1), 100);
    const offset = Math.max(args.offset || 0, 0);

    if (args.military_preset && MILITARY_PRESETS[args.military_preset]) {
      const preset = MILITARY_PRESETS[args.military_preset];
      args._military_category_codes = preset.category_codes;
      args._military_label = preset.label;
      if (!args.justice_kind) args.justice_kind = 2;
    }

    if (args.kupap_preset && KUPAP_PRESETS[args.kupap_preset]) {
      const preset = KUPAP_PRESETS[args.kupap_preset];
      args._kupap_category_codes = preset.category_codes;
      args._kupap_label = preset.label;
      if (!args.justice_kind) args.justice_kind = 5;
    }

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    let resolvedCourtCodes: number[] | null = null;
    if (args.court_name && !args.court_code) {
      const courtResult = await this.db.query(
        `SELECT court_code FROM edrsr_courts WHERE LOWER(name) LIKE LOWER($1) LIMIT 20`,
        [`%${args.court_name}%`]
      );
      if (courtResult.rows.length > 0) {
        resolvedCourtCodes = courtResult.rows.map((r: any) => r.court_code);
      } else {
        return this.wrapResponse({ query: args, total: 0, results: [], note: `Суд "${args.court_name}" не знайдено.` });
      }
    }

    if (args.cause_num) { conditions.push(`d.cause_num = $${paramIdx}`); params.push(args.cause_num); paramIdx++; }
    if (args.judge) { conditions.push(`LOWER(d.judge) LIKE LOWER($${paramIdx})`); params.push(`%${args.judge}%`); paramIdx++; }
    if (args.court_code) { conditions.push(`d.court_code = $${paramIdx}`); params.push(args.court_code); paramIdx++; }
    else if (resolvedCourtCodes?.length) { conditions.push(`d.court_code = ANY($${paramIdx})`); params.push(resolvedCourtCodes); paramIdx++; }
    if (args.justice_kind) { conditions.push(`d.justice_kind = $${paramIdx}`); params.push(args.justice_kind); paramIdx++; }
    if (args.judgment_code) { conditions.push(`d.judgment_code = $${paramIdx}`); params.push(args.judgment_code); paramIdx++; }
    if (args._military_category_codes?.length) { conditions.push(`d.category_code = ANY($${paramIdx})`); params.push(args._military_category_codes); paramIdx++; }
    else if (args._kupap_category_codes?.length) { conditions.push(`d.category_code = ANY($${paramIdx})`); params.push(args._kupap_category_codes); paramIdx++; }
    else if (args.category_code) { conditions.push(`d.category_code = $${paramIdx}`); params.push(args.category_code); paramIdx++; }
    if (args.date_from) { conditions.push(`d.adjudication_date >= $${paramIdx}`); params.push(args.date_from); paramIdx++; }
    if (args.date_to) { conditions.push(`d.adjudication_date <= $${paramIdx}`); params.push(args.date_to); paramIdx++; }
    if (args.instance_code) { conditions.push(`c.instance_code = $${paramIdx}`); params.push(args.instance_code); paramIdx++; }

    if (conditions.length === 0) {
      return this.wrapError('Потрібен хоча б один параметр пошуку');
    }

    const whereClause = conditions.join(' AND ');
    const needsCourtJoin = args.instance_code || args.court_name;
    const includeFulltext = args.include_fulltext === true;

    const fromClause = `edrsr_documents d
      ${needsCourtJoin ? 'LEFT JOIN edrsr_courts c ON c.court_code = d.court_code' : ''}
      ${includeFulltext ? 'LEFT JOIN edrsr_fulltext f ON f.doc_id = d.doc_id' : ''}`;

    const selectFields = `d.doc_id, d.cause_num, d.judge, d.court_code, d.justice_kind,
      d.judgment_code, d.category_code, d.adjudication_date, d.receipt_date,
      d.doc_url, d.status, d.date_publ
      ${includeFulltext ? ', f.full_text' : ''}`;

    try {
      const countSql = `SELECT COUNT(*)::int as total FROM ${fromClause} WHERE ${whereClause}`;
      const countResult = await this.db.query(countSql, params);
      const total = countResult.rows[0]?.total || 0;

      const dataSql = `SELECT ${selectFields} FROM ${fromClause}
        WHERE ${whereClause} ORDER BY ${EDRSR_METADATA_SEARCH_ORDER}
        LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;
      const dataResult = await this.db.query(dataSql, [...params, limit, offset]);

      const enriched = await this.enrichResults(dataResult.rows);

      return this.wrapResponse({
        mode: 'structured',
        query: { ...args, _military_category_codes: undefined, _kupap_category_codes: undefined },
        ...(args._military_label ? { military_filter: args._military_label } : {}),
        ...(args._kupap_label ? { kupap_filter: args._kupap_label } : {}),
        total, returned: enriched.length, offset, has_more: offset + enriched.length < total,
        results: enriched,
      });
    } catch (err: any) {
      if (includeFulltext && err.code === '22021') {
        return this.searchStructured({ ...args, include_fulltext: false });
      }
      logger.error('[EdsrUnifiedSearch] structured failed', { error: err.message });
      return this.wrapError(`Помилка пошуку: ${err.message}`);
    }
  }

  // ── Term-budget FTS (cap + relax-on-empty) ──────────────────────

  /**
   * Run FTS with reactive term relaxation. Start from the leading FULLTEXT_MAX_TOKENS
   * (a long all-AND query already matches little); if a probe returns nothing, drop the
   * trailing token and retry, down to FTS_MIN_TOKENS, bounded by FTS_MAX_RELAX_STEPS.
   * Because the supplied filters (incl. party_name/party_role) are part of every probe,
   * relaxation stops as soon as the conjunction is satisfiable — selectivity-aware
   * without any precomputed term-frequency table.
   */
  private async ftsWithRelaxation(
    topicalQuery: string,
    filters: EdsrFtsFilters,
    limit: number,
    offset: number,
  ): Promise<{ result: EdsrFtsSearchResponse; usedQuery: string; startTokens: number; usedTokens: number; relaxedFromTokens?: number }> {
    const rawTokens = String(topicalQuery).trim().split(/\s+/).filter(Boolean);
    // CORE-21 P1.5a: order tokens by IDF (discriminative first) so the probe keeps rare
    // terms (донецьк/окупован/ДРРП) and relaxation drops the commonest (податок/майно),
    // instead of the positional tail. Empty idf map → original order (no regression).
    const idf = this.ftsService ? await this.ftsService.lexemeDf(rawTokens, this.db) : new Map<string, number>();
    const tokens = selectFtsTerms(rawTokens, idf);
    const idfRanked = idf.size > 0;
    const startTokens = tokens.length;
    let n = Math.min(startTokens, FULLTEXT_MAX_TOKENS) || 1;
    const cappedFrom = n; // token count at the first (capped) probe
    let usedQuery = tokens.slice(0, n).join(' ') || String(topicalQuery).trim();

    let result = await this.ftsService!.searchFulltext(usedQuery, this.db, filters, limit, offset);

    let steps = 0;
    // Relax while near-empty (not just hard 0): dropping the LEAST discriminative AND-term
    // (the idf-ranked tail) only widens the match set, so we keep broadening until the probe
    // clears the floor or we hit the bounds.
    while (result.total < FTS_RELAX_MIN_RESULTS && n > FTS_MIN_TOKENS && steps < FTS_MAX_RELAX_STEPS) {
      n -= 1; steps += 1;
      usedQuery = tokens.slice(0, n).join(' ');
      logger.info('[EdsrUnifiedSearch] FTS relax-on-near-empty', {
        from_tokens: n + 1, to_tokens: n, prev_total: result.total, query: usedQuery, idf_ranked: idfRanked,
      });
      result = await this.ftsService!.searchFulltext(usedQuery, this.db, filters, limit, offset);
    }

    return {
      result, usedQuery, startTokens, usedTokens: n,
      ...(n < cappedFrom ? { relaxedFromTokens: cappedFrom } : {}),
    };
  }

  // ── Fulltext search (tsvector FTS) ───────────────────────────────

  private async searchFulltext(args: any): Promise<ToolResult> {
    if (!args.query) return this.wrapError('query є обов\'язковим для режиму fulltext');
    if (!this.ftsService) return this.wrapError('FTS сервіс недоступний');

    try {
      let courtCode = args.court_code;
      if (args.court_name && !courtCode) {
        const courtResult = await this.db.query(
          `SELECT court_code FROM edrsr_courts WHERE LOWER(name) LIKE LOWER($1) LIMIT 1`,
          [`%${args.court_name}%`]
        );
        if (courtResult.rows.length > 0) courtCode = courtResult.rows[0].court_code;
      }

      const originalQuery = String(args.query).trim();
      const baseFilters: EdsrFtsFilters = {
        court_code: courtCode, judge: args.judge, date_from: args.date_from, date_to: args.date_to,
        justice_kind: args.justice_kind, judgment_code: args.judgment_code, category_code: args.category_code,
        instance_code: args.instance_code,
      };
      const partyName = typeof args.party_name === 'string' ? args.party_name.trim() : undefined;
      const partyRole = args.party_role as EdsrFtsFilters['party_role'] | undefined;

      // Term-budget search: cap to the leading tokens and relax downward on an empty hit.
      let fts = await this.ftsWithRelaxation(
        originalQuery,
        { ...baseFilters, party_name: partyName || undefined, party_role: partyRole },
        args.limit || 20, args.offset || 0,
      );
      let result = fts.result;

      // Role-relaxation tier: the role keyword may simply not co-occur in the text even
      // when the party IS a party (court phrasing varies). Before the costlier hybrid
      // fallback, retry (with term relaxation) keeping the name phrase but dropping the role.
      let partyRoleRelaxed = false;
      if (result.total === 0 && partyName && partyRole && partyRole !== 'any') {
        partyRoleRelaxed = true;
        logger.info('[EdsrUnifiedSearch] fulltext 0 with party_role, relaxing role', {
          party_name: partyName, party_role: partyRole,
        });
        fts = await this.ftsWithRelaxation(
          originalQuery, { ...baseFilters, party_name: partyName },
          args.limit || 20, args.offset || 0,
        );
        result = fts.result;
      }

      // Genuine no-match (not merely relevance-filtered) → fall back to hybrid, whose
      // semantic leg doesn't require every token to co-occur. Uses the ORIGINAL query.
      if (result.total === 0 && this.vectorizer) {
        logger.info('[EdsrUnifiedSearch] fulltext 0 results, falling back to hybrid', {
          query: originalQuery, ftsQuery: fts.usedQuery, justice_kind: args.justice_kind,
        });
        return this.searchHybrid({ ...args, query: originalQuery, _fallback_from: 'fulltext' });
      }

      const enriched = await this.enrichResults(result.results);
      const output = await this.maybeFilter(enriched, fts.usedQuery);

      return this.wrapResponse({
        mode: 'fulltext', ...result,
        ...(fts.usedTokens < fts.startTokens ? { query_truncated: { from_tokens: fts.startTokens, used: fts.usedQuery } } : {}),
        ...(fts.relaxedFromTokens ? { term_relaxed: { from_tokens: fts.relaxedFromTokens, to_tokens: fts.usedTokens } } : {}),
        ...(partyRoleRelaxed ? { party_role_relaxed: true } : {}),
        results: output.filtered,
        ...(output.original_count !== output.filtered_count
          ? { relevance_filter: { from: output.original_count, to: output.filtered_count } }
          : {}),
      });
    } catch (err: any) {
      logger.error('[EdsrUnifiedSearch] fulltext failed', { error: err.message });
      return this.wrapError(`Помилка FTS пошуку: ${err.message}`);
    }
  }

  // ── Hybrid search (FTS + Qdrant + RRF) ──────────────────────────

  private async searchHybrid(args: any): Promise<ToolResult> {
    if (!args.query) return this.wrapError('query є обов\'язковим для режиму hybrid');
    if (!this.ftsService) return this.wrapError('FTS сервіс недоступний');

    const query = args.query.trim();
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
    const oversample = Math.min(Math.max(Number(args.oversample) || DEFAULT_OVERSAMPLE, 1), MAX_OVERSAMPLE);
    const rrfK = Math.max(Number(args.rrf_k) || DEFAULT_RRF_K, 1);
    const candidateLimit = limit * oversample;

    const partyName = typeof args.party_name === 'string' ? args.party_name.trim() || undefined : undefined;
    const partyRole = args.party_role as EdsrFtsFilters['party_role'] | undefined;
    const instanceCode = args.instance_code ? Number(args.instance_code) : undefined;

    const filters: EdsrFtsFilters = {
      court_code: args.court_code, justice_kind: args.justice_kind,
      judge: args.judge, date_from: args.date_from, date_to: args.date_to,
      instance_code: instanceCode,
      // Party/instance constraints apply to the FTS leg here; the semantic leg can't filter
      // by them, so RRF still surfaces topically-relevant vector hits. The structural
      // post-fusion pass below re-checks those vector-only hits and drops non-matching ones.
      party_name: partyName,
      party_role: partyRole,
    };

    const reformulated = this.queryReformulator
      ? await this.queryReformulator.reformulate(query).catch(() => null)
      : null;
    const ftsQuery = reformulated?.fts || query;
    const semanticQuery = reformulated?.semantic || query;

    // Same term-budget relaxation as fulltext mode — the hybrid FTS leg previously passed
    // the full reformulated query uncapped, so one rare term collapsed it to 0 (the
    // semantic leg masked it, but lost the precise FTS hits). Cap + relax here too.
    const ftsPromise = this
      .ftsWithRelaxation(ftsQuery, filters, candidateLimit, 0)
      .then(r => r.result)
      .catch((err: any) => { logger.warn('[EdsrUnifiedSearch] FTS leg failed', { error: err.message }); return null; });

    const justiceKind = args.justice_kind ? Number(args.justice_kind) : undefined;
    const hasVectors = justiceKind
      ? EdsrUnifiedSearchTool.VECTORIZED_JUSTICE_KINDS.has(justiceKind)
      : true; // no justice_kind filter → search the whole unified collection (all codices vectorized)

    // The vector leg gets only the filters Qdrant can enforce via payload indices
    // (court_code/justice_kind/judge/date) — with justice_kind coerced to a number so the
    // integer index matches. Pushing justice_kind into the Qdrant filter pre-constrains the
    // candidates by codex instead of returning cross-codex hits that the post-fusion pass
    // would otherwise drop. party_name/party_role/instance_code stay FTS-only and are
    // re-checked post-fusion below.
    const vectorFilters: EdrsrSearchFilters = {
      court_code: args.court_code,
      justice_kind: justiceKind,
      judge: args.judge,
      date_from: args.date_from,
      date_to: args.date_to,
    };

    const vectorPromise = (this.vectorizer && hasVectors)
      ? this.vectorizer.semanticSearch(semanticQuery, vectorFilters, candidateLimit)
          .catch((err: any) => { logger.warn('[EdsrUnifiedSearch] Qdrant leg failed', { error: err.message }); return null; })
      : Promise.resolve(null);

    const [ftsResponse, vectorResults] = await Promise.all([ftsPromise, vectorPromise]);

    if (!ftsResponse && !vectorResults) return this.wrapError('Обидва джерела пошуку недоступні');

    const ftsResults = ftsResponse?.results || [];
    const vectorHits: EdrsrSearchResult[] = vectorResults || [];
    let fused = this.fuseRRF(ftsResults, vectorHits, rrfK);

    // Post-fusion structural enforcement. The Qdrant leg cannot filter by party_name/
    // party_role/instance_code, so vector-only hits arrive unconstrained and previously
    // diluted the result (e.g. "Нова Пошта as defendant" returned cases without the party;
    // court_level=SC returned lower-instance courts). Re-check the fused candidates against
    // edrsr_fulltext/edrsr_courts and drop the ones that don't actually satisfy the
    // constraints. FTS-leg hits already match, so only vector-only hits can be removed.
    let structuralFilter: { dropped: number; party_role_relaxed?: boolean } | undefined;
    if ((partyName || instanceCode) && fused.length > 0) {
      const docIds = fused.map(h => h.doc_id);
      let allowed = await this.ftsService.filterDocIdsByConstraints(
        docIds, { party_name: partyName, party_role: partyRole, instance_code: instanceCode }, this.db,
      );
      // Role may simply not co-occur as a keyword even when the party IS a party (court
      // phrasing varies) — mirror fulltext mode: if the role wipes everything, drop the role
      // but keep the name + instance constraint rather than returning nothing.
      let roleRelaxed = false;
      if (allowed.size === 0 && partyName && partyRole && partyRole !== 'any') {
        roleRelaxed = true;
        allowed = await this.ftsService.filterDocIdsByConstraints(
          docIds, { party_name: partyName, instance_code: instanceCode }, this.db,
        );
      }
      const before = fused.length;
      fused = fused.filter(h => allowed.has(h.doc_id));
      if (before !== fused.length || roleRelaxed) {
        structuralFilter = { dropped: before - fused.length, ...(roleRelaxed ? { party_role_relaxed: true } : {}) };
      }
    }

    const top = fused.slice(0, limit);
    const enriched = await this.enrichFusedHits(top);
    // Evidence parity for the relevance filter: FTS-only hits carry no semantic chunk and
    // would be judged on an uninformative ts_headline (often the decision's boilerplate
    // header), so on-topic FTS matches with scattered terms get wrongly dropped. Backfill
    // each such hit's best query-relevant chunk so both legs feed the filter comparable
    // evidence. Bounded to the post-slice top set (≤ limit), no-op when nothing needs it.
    const chunkBackfilled = await this.backfillEvidenceChunks(enriched, semanticQuery);
    const output = await this.maybeFilter(enriched, query);

    return this.wrapResponse({
      mode: 'hybrid', query, rrf_k: rrfK, oversample,
      ...(args._fallback_from ? { fallback_from: args._fallback_from } : {}),
      ...(reformulated ? { reformulated: { fts: reformulated.fts, semantic: reformulated.semantic } } : {}),
      ...(partyName ? { party_filter: { party_name: partyName, party_role: partyRole || 'any' } } : {}),
      ...(instanceCode ? { instance_code: instanceCode } : {}),
      legs: { fts_available: !!ftsResponse, vector_available: !!vectorResults, fts_candidates: ftsResults.length, vector_candidates: vectorHits.length, ...(chunkBackfilled > 0 ? { fts_chunks_backfilled: chunkBackfilled } : {}) },
      ...(structuralFilter ? { structural_filter: structuralFilter } : {}),
      total_fused: fused.length, returned: output.filtered.length,
      results: output.filtered,
      ...(output.original_count !== output.filtered_count
        ? { relevance_filter: { from: output.original_count, to: output.filtered_count } }
        : {}),
    });
  }

  // ── Semantic search (Qdrant vectors) ─────────────────────────────

  private static readonly VECTORIZED_JUSTICE_KINDS = new Set([1, 2, 3, 4, 5]); // ЦПК, КПК, ГПК, КАС, КУпАП (unified edrsr_serving 296.56M)

  private async searchSemantic(args: any): Promise<ToolResult> {
    if (!args.query) return this.wrapError('query є обов\'язковим для режиму semantic');

    const justiceKind = args.justice_kind ? Number(args.justice_kind) : undefined;
    const hasVectors = justiceKind
      ? EdsrUnifiedSearchTool.VECTORIZED_JUSTICE_KINDS.has(justiceKind)
      : true; // no justice_kind filter → search the whole unified collection (all codices vectorized)

    if (!this.vectorizer || !hasVectors) {
      logger.info('[EdsrUnifiedSearch] Semantic fallback to FTS', { justice_kind: justiceKind, vectorizer: !!this.vectorizer });
      const result = await this.searchFulltext({ ...args, limit: args.limit || 10 });
      if (result.content?.[0]?.text) {
        try {
          const parsed = JSON.parse(result.content[0].text);
          parsed.mode = 'semantic (fallback to fulltext)';
          parsed._notice = 'Семантичний пошук тимчасово недоступний (векторний сервіс), результати через FTS.';
          result.content[0].text = JSON.stringify(parsed, null, 2);
        } catch { /* keep original */ }
      }
      return result;
    }

    try {
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
      const filters: EdrsrSearchFilters = {
        court_code: args.court_code, justice_kind: justiceKind,
        judge: args.judge, date_from: args.date_from, date_to: args.date_to,
      };

      const reformulated = this.queryReformulator
        ? await this.queryReformulator.reformulate(args.query).catch(() => null)
        : null;
      const semanticQuery = reformulated?.semantic || args.query;

      const results = await this.vectorizer.semanticSearch(semanticQuery, filters, limit * 3);

      const deduped = new Map<number, EdrsrSearchResult>();
      for (const r of results) {
        const existing = deduped.get(r.doc_id);
        if (!existing || r.score > existing.score) deduped.set(r.doc_id, r);
      }
      let ranked = Array.from(deduped.values()).sort((a, b) => b.score - a.score);

      // Structural enforcement. The Qdrant leg cannot filter by instance_code / party_name /
      // party_role (court_level=SC/GrandChamber maps onto instance_code=1 upstream), so pure
      // semantic hits arrive unconstrained. Without this, a court_level=SC query leaked
      // lower-instance courts (окружні/апеляційні) and off-party cases into the result —
      // mirrors the post-fusion pass in searchHybrid. Re-check candidates against
      // edrsr_fulltext/edrsr_courts and drop the ones that don't satisfy the constraints.
      const partyName = typeof args.party_name === 'string' ? args.party_name.trim() || undefined : undefined;
      const partyRole = args.party_role as EdsrFtsFilters['party_role'] | undefined;
      const instanceCode = args.instance_code ? Number(args.instance_code) : undefined;
      let structuralFilter: { dropped: number; party_role_relaxed?: boolean } | undefined;
      if ((partyName || instanceCode) && ranked.length > 0 && this.ftsService) {
        const docIds = ranked.map(r => r.doc_id);
        let allowed = await this.ftsService.filterDocIdsByConstraints(
          docIds, { party_name: partyName, party_role: partyRole, instance_code: instanceCode }, this.db,
        );
        // Role may not co-occur as a keyword even when the party IS a party — mirror
        // hybrid/fulltext: if the role wipes everything, keep name + instance, drop the role.
        let roleRelaxed = false;
        if (allowed.size === 0 && partyName && partyRole && partyRole !== 'any') {
          roleRelaxed = true;
          allowed = await this.ftsService.filterDocIdsByConstraints(
            docIds, { party_name: partyName, instance_code: instanceCode }, this.db,
          );
        }
        const before = ranked.length;
        ranked = ranked.filter(r => allowed.has(r.doc_id));
        if (before !== ranked.length || roleRelaxed) {
          structuralFilter = { dropped: before - ranked.length, ...(roleRelaxed ? { party_role_relaxed: true } : {}) };
        }
      }
      const topResults = ranked.slice(0, limit);

      const enriched = await this.enrichResults(topResults.map(r => ({
        doc_id: r.doc_id, cause_num: r.metadata.cause_num, judge: r.metadata.judge,
        court_code: r.metadata.court_code, justice_kind: r.metadata.justice_kind,
        judgment_code: r.metadata.judgment_code, adjudication_date: r.metadata.adjudication_date,
        rank: r.score,
      })));

      const withChunks = enriched.map((e, i) => ({
        ...e,
        qdrant_score: Number(topResults[i].score.toFixed(6)),
        qdrant_best_chunk_text: topResults[i].text?.substring(0, 500) || null,
        qdrant_best_chunk_index: topResults[i].chunk_index,
      }));

      const output = await this.maybeFilter(withChunks, args.query);

      return this.wrapResponse({
        mode: 'semantic', query: args.query,
        ...(reformulated ? { reformulated: { semantic: reformulated.semantic } } : {}),
        ...(instanceCode ? { instance_code: instanceCode } : {}),
        ...(partyName ? { party_filter: { party_name: partyName, party_role: partyRole || 'any' } } : {}),
        ...(structuralFilter ? { structural_filter: structuralFilter } : {}),
        total: deduped.size, returned: output.filtered.length,
        results: output.filtered,
        ...(output.original_count !== output.filtered_count
          ? { relevance_filter: { from: output.original_count, to: output.filtered_count } }
          : {}),
      });
    } catch (err: any) {
      logger.error('[EdsrUnifiedSearch] semantic failed, falling back to FTS', { error: err.message });
      return this.searchFulltext({ ...args, limit: args.limit || 10 });
    }
  }

  // ── Pre-filter via Haiku ────────────────────────────────────────

  private async maybeFilter(
    results: any[],
    query: string,
  ): Promise<{ filtered: any[]; original_count: number; filtered_count: number }> {
    if (!this.resultFilter) {
      return { filtered: results, original_count: results.length, filtered_count: results.length };
    }
    return this.resultFilter.filterResults(results, query);
  }

  // ── RRF fusion ──────────────────────────────────────────────────

  private fuseRRF(ftsResults: any[], vectorHits: EdrsrSearchResult[], k: number): FusedHit[] {
    const byDocId = new Map<number, FusedHit>();

    ftsResults.forEach((r, idx) => {
      if (!r.doc_id) return;
      const docId = Number(r.doc_id);
      const rank = idx + 1;
      byDocId.set(docId, {
        doc_id: docId, rrf_score: 1 / (k + rank),
        fts_rank: Number(r.rank) || 0, fts_position: rank, fts_headline: r.headline || null,
        qdrant_score: null, qdrant_position: null, qdrant_best_chunk_text: null, qdrant_best_chunk_index: null,
        metadata: { cause_num: r.cause_num, judge: r.judge, court_code: r.court_code, justice_kind: r.justice_kind, judgment_code: r.judgment_code, adjudication_date: r.adjudication_date },
      });
    });

    const seenVectorDocs = new Set<number>();
    let vectorRank = 0;
    for (const v of vectorHits) {
      if (!v.doc_id) continue;
      const docId = Number(v.doc_id);
      if (seenVectorDocs.has(docId)) {
        const existing = byDocId.get(docId);
        if (existing && (existing.qdrant_score === null || v.score > existing.qdrant_score)) {
          existing.qdrant_score = v.score;
          existing.qdrant_best_chunk_text = v.text || existing.qdrant_best_chunk_text;
          existing.qdrant_best_chunk_index = v.chunk_index;
        }
        continue;
      }
      seenVectorDocs.add(docId);
      vectorRank++;
      const rrfContribution = 1 / (k + vectorRank);
      const existing = byDocId.get(docId);
      if (existing) {
        existing.rrf_score += rrfContribution;
        existing.qdrant_score = v.score;
        existing.qdrant_position = vectorRank;
        existing.qdrant_best_chunk_text = v.text || null;
        existing.qdrant_best_chunk_index = v.chunk_index;
        if (v.metadata) Object.assign(existing.metadata, Object.fromEntries(Object.entries(v.metadata).filter(([, val]) => val != null && existing.metadata[val] == null)));
      } else {
        byDocId.set(docId, {
          doc_id: docId, rrf_score: rrfContribution,
          fts_rank: null, fts_position: null, fts_headline: null,
          qdrant_score: v.score, qdrant_position: vectorRank,
          qdrant_best_chunk_text: v.text || null, qdrant_best_chunk_index: v.chunk_index,
          metadata: v.metadata ? { ...v.metadata } : {},
        });
      }
    }

    return Array.from(byDocId.values()).sort((a, b) => b.rrf_score - a.rrf_score);
  }

  // ── Enrichment (shared) ─────────────────────────────────────────

  private async enrichResults(rows: any[]): Promise<any[]> {
    if (rows.length === 0) return [];
    const courtCodes = new Set<number>();
    const justiceKinds = new Set<number>();
    const judgmentCodes = new Set<number>();
    for (const row of rows) {
      if (row.court_code) courtCodes.add(row.court_code);
      if (row.justice_kind) justiceKinds.add(row.justice_kind);
      if (row.judgment_code) judgmentCodes.add(row.judgment_code);
    }
    const [courtsMap, justiceMap, judgmentMap] = await Promise.all([
      this.batchLookup('edrsr_courts', 'court_code', Array.from(courtCodes)),
      this.batchLookup('edrsr_justice_kinds', 'justice_kind', Array.from(justiceKinds)),
      this.batchLookup('edrsr_judgment_forms', 'judgment_code', Array.from(judgmentCodes)),
    ]);
    return rows.map(row => ({
      doc_id: row.doc_id, cause_num: row.cause_num, judge: row.judge,
      court_code: row.court_code, court_name: courtsMap.get(row.court_code) || null,
      justice_kind: row.justice_kind, justice_kind_name: justiceMap.get(row.justice_kind) || null,
      judgment_code: row.judgment_code, judgment_form: judgmentMap.get(row.judgment_code) || null,
      adjudication_date: row.adjudication_date, receipt_date: row.receipt_date,
      doc_url: row.doc_url, external_url: `https://reyestr.court.gov.ua/Review/${row.doc_id}`,
      ...(row.full_text ? { full_text: row.full_text } : {}),
      ...(row.headline ? { headline: row.headline } : {}),
      ...(row.rank != null ? { rank: Number(row.rank) || 0 } : {}),
    }));
  }

  /**
   * Give FTS-only hybrid hits a query-relevant semantic chunk so the LLM relevance filter
   * (search-result-filter) judges every candidate on comparable evidence. Mutates the
   * enriched hits in place (populates qdrant_best_chunk_text/_index, flags
   * evidence_chunk_backfilled) and returns how many were backfilled. No-op when the
   * vectorizer is unavailable or no enriched hit lacks a chunk. Best-effort: a failure
   * leaves the hits unchanged rather than failing the whole search.
   */
  private async backfillEvidenceChunks(enriched: any[], semanticQuery: string): Promise<number> {
    if (!this.vectorizer || !semanticQuery?.trim()) return 0;
    const needing = enriched
      .filter(h => !h.qdrant_best_chunk_text && h.fts_position != null)
      .map(h => h.doc_id);
    if (needing.length === 0) return 0;
    try {
      const chunks = await this.vectorizer.bestChunkForDocs(semanticQuery, needing);
      if (chunks.size === 0) return 0;
      let count = 0;
      for (const h of enriched) {
        const c = chunks.get(h.doc_id);
        if (c) {
          h.qdrant_best_chunk_text = c.text;
          h.qdrant_best_chunk_index = c.chunk_index;
          h.evidence_chunk_backfilled = true;
          count++;
        }
      }
      return count;
    } catch (err: any) {
      logger.warn('[EdsrUnifiedSearch] evidence chunk backfill failed', { error: err.message });
      return 0;
    }
  }

  private async enrichFusedHits(hits: FusedHit[]): Promise<any[]> {
    if (hits.length === 0) return [];
    const docsNeedingMeta = hits.filter(h => !h.metadata.court_code && !h.metadata.cause_num).map(h => h.doc_id);
    if (docsNeedingMeta.length > 0) {
      const metaMap = await this.fetchDocumentMetadata(docsNeedingMeta);
      for (const h of hits) {
        const meta = metaMap.get(h.doc_id);
        if (meta) Object.entries(meta).forEach(([k, v]) => { if (v != null && h.metadata[k] == null) h.metadata[k] = v; });
      }
    }
    const courtCodes = new Set<number>();
    const justiceKinds = new Set<number>();
    const judgmentCodes = new Set<number>();
    for (const h of hits) {
      if (h.metadata.court_code) courtCodes.add(h.metadata.court_code);
      if (h.metadata.justice_kind) justiceKinds.add(h.metadata.justice_kind);
      if (h.metadata.judgment_code) judgmentCodes.add(h.metadata.judgment_code);
    }
    const [courtsMap, justiceMap, judgmentMap] = await Promise.all([
      this.batchLookup('edrsr_courts', 'court_code', Array.from(courtCodes)),
      this.batchLookup('edrsr_justice_kinds', 'justice_kind', Array.from(justiceKinds)),
      this.batchLookup('edrsr_judgment_forms', 'judgment_code', Array.from(judgmentCodes)),
    ]);
    return hits.map(h => ({
      doc_id: h.doc_id, cause_num: h.metadata.cause_num || null, judge: h.metadata.judge || null,
      court_code: h.metadata.court_code ?? null, court_name: h.metadata.court_code ? courtsMap.get(h.metadata.court_code) || null : null,
      justice_kind: h.metadata.justice_kind ?? null, justice_kind_name: h.metadata.justice_kind ? justiceMap.get(h.metadata.justice_kind) || null : null,
      judgment_code: h.metadata.judgment_code ?? null, judgment_form: h.metadata.judgment_code ? judgmentMap.get(h.metadata.judgment_code) || null : null,
      adjudication_date: h.metadata.adjudication_date || null,
      rrf_score: Number(h.rrf_score.toFixed(6)),
      fts_position: h.fts_position, fts_rank: h.fts_rank, fts_headline: h.fts_headline,
      qdrant_position: h.qdrant_position, qdrant_score: h.qdrant_score !== null ? Number(h.qdrant_score.toFixed(6)) : null,
      qdrant_best_chunk_index: h.qdrant_best_chunk_index, qdrant_best_chunk_text: h.qdrant_best_chunk_text,
      external_url: `https://reyestr.court.gov.ua/Review/${h.doc_id}`,
    }));
  }

  private async fetchDocumentMetadata(docIds: number[]): Promise<Map<number, Record<string, any>>> {
    const map = new Map<number, Record<string, any>>();
    if (docIds.length === 0) return map;
    try {
      const result = await this.db.query(
        `SELECT doc_id, court_code, cause_num, judge, justice_kind, judgment_code, category_code, adjudication_date FROM edrsr_documents WHERE doc_id = ANY($1)`,
        [docIds]
      );
      for (const row of result.rows) map.set(Number(row.doc_id), row);
    } catch { /* non-critical */ }
    return map;
  }

  private static readonly ALLOWED_LOOKUP_TABLES: Record<string, Set<string>> = {
    edrsr_courts: new Set(['court_code']),
    edrsr_justice_kinds: new Set(['justice_kind']),
    edrsr_judgment_forms: new Set(['judgment_code']),
  };

  private async batchLookup(table: string, idColumn: string, ids: number[]): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    if (ids.length === 0) return map;
    const allowed = EdsrUnifiedSearchTool.ALLOWED_LOOKUP_TABLES[table];
    if (!allowed || !allowed.has(idColumn)) return map;
    try {
      const result = await this.db.query(`SELECT ${idColumn}, name FROM ${table} WHERE ${idColumn} = ANY($1)`, [ids]);
      for (const row of result.rows) map.set(row[idColumn], row.name);
    } catch { /* non-critical */ }
    return map;
  }
}

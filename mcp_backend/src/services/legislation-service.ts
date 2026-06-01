import type { IDatabase, IEmbeddingPort } from '../domain/ports/index.js';
import { RadaLegislationAdapter, LegislationArticle } from '../adapters/rada-legislation-adapter';
import { logger } from '../utils/logger';
import { createHash } from 'crypto';
import { LegislationClassifier } from './legislation-classifier';
import type { ICachePort, ILLMPort } from '../domain/ports/index.js';

export interface LegislationReference {
  rada_id: string;
  article_number: string;
  title?: string;
  full_text: string;
  full_text_html?: string;
  url: string;
  metadata?: any;
  /** НПА title, e.g. "Цивільний кодекс України" */
  npa_title?: string;
  /** Hierarchy: section (Розділ) */
  section_number?: string;
  section_title?: string;
  /** Hierarchy: chapter (Глава) */
  chapter_number?: string;
  chapter_title?: string;
}

export interface LegislationSearchResult {
  articles: LegislationArticle[];
  total_found: number;
  legislation_title: string;
  rada_id: string;
}

/**
 * Парсит ссылку на законодательство из текста, используя regexp.
 * Для сложных случаев следует использовать parseLegislationReferenceWithAI.
 */
export function parseLegislationReference(text: string): { radaId: string; articleNumber: string } | null {
  const input = String(text || '').trim();
  if (!input) return null;

  const codeMap: Record<string, string> = {
    'ЦПК': '1618-15',
    'ГПК': '1798-12',
    'КАС': '2747-15',
    'КПК': '4651-17',
    'ЦК': '435-15',
    'ГК': '436-15',
    'ПКУ': '2755-17',
    'ПОДАТКОВИЙ КОДЕКС': '2755-17',
    'КЗПП': '322-08',
    'КЗпП': '322-08',
    'СК': '2947-14',
    'ЗК': '2768-14',
    'КК': '2341-14',
    'КУ': '254к/96-вр',
    'КОНСТИТУЦІЯ': '254к/96-вр',
    'КУПАП': '80731-10',
    'КУпАП': '80731-10',
  };

  // Full-name aliases mapping → codeMap key
  const fullNameAliases: Record<string, string> = {
    'КОНСТИТУЦІЯ УКРАЇНИ': '254к/96-вр',
    'КОНСТИТУЦIЯ УКРАЇНИ': '254к/96-вр',    // with Latin I
    'ЦИВІЛЬНИЙ КОДЕКС': '435-15',
    'ЦИВІЛЬНИЙ ПРОЦЕСУАЛЬНИЙ КОДЕКС': '1618-15',
    'ГОСПОДАРСЬКИЙ КОДЕКС': '436-15',
    'ГОСПОДАРСЬКИЙ ПРОЦЕСУАЛЬНИЙ КОДЕКС': '1798-12',
    'КРИМІНАЛЬНИЙ КОДЕКС': '2341-14',
    'КРИМІНАЛЬНИЙ ПРОЦЕСУАЛЬНИЙ КОДЕКС': '4651-17',
    'КОДЕКС АДМІНІСТРАТИВНОГО СУДОЧИНСТВА': '2747-15',
    'СІМЕЙНИЙ КОДЕКС': '2947-14',
    'ЗЕМЕЛЬНИЙ КОДЕКС': '2768-14',
    'КОДЕКС ЗАКОНІВ ПРО ПРАЦЮ': '322-08',
    'КОДЕКС ПРО АДМІНІСТРАТИВНІ ПРАВОПОРУШЕННЯ': '80731-10',
    'КОДЕКС АДМІНІСТРАТИВНИХ ПРАВОПОРУШЕНЬ': '80731-10',
    'ПРО ВІЙСЬКОВИЙ ОБОВ\'ЯЗОК І ВІЙСЬКОВУ СЛУЖБУ': '2232-12',
    'ПРО ВІЙСЬКОВИЙ ОБОВ\'ЯЗОК': '2232-12',
    'ЗАКОН ПРО ВІЙСЬКОВИЙ ОБОВ\'ЯЗОК': '2232-12',
    'ПРО МОБІЛІЗАЦІЙНУ ПІДГОТОВКУ ТА МОБІЛІЗАЦІЮ': '3543-12',
    'ПРО МОБІЛІЗАЦІЮ': '3543-12',
    'ЗАКОН ПРО МОБІЛІЗАЦІЮ': '3543-12',
    'ПРО ПРАВОВИЙ РЕЖИМ ВОЄННОГО СТАНУ': '389-19',
    'ПРО ВОЄННИЙ СТАН': '389-19',
    'ЗАКОН ПРО ВОЄННИЙ СТАН': '389-19',
    'ПРО ОБОРОНУ УКРАЇНИ': '1932-12',
    'ПРО ОБОРОНУ': '1932-12',
    'ПРО ЗБРОЙНІ СИЛИ УКРАЇНИ': '1934-12',
    'ПРО ЗБРОЙНІ СИЛИ': '1934-12',
    'ПРО СОЦІАЛЬНИЙ І ПРАВОВИЙ ЗАХИСТ ВІЙСЬКОВОСЛУЖБОВЦІВ': '2011-12',
    'ПРО СОЦІАЛЬНИЙ ЗАХИСТ ВІЙСЬКОВОСЛУЖБОВЦІВ': '2011-12',
    'ПРО СТАТУС ВЕТЕРАНІВ ВІЙНИ': '3551-12',
    'ПРО СТАТУС ВЕТЕРАНІВ': '3551-12',
    'ПРО ЗАГАЛЬНООБОВ\'ЯЗКОВЕ ДЕРЖАВНЕ СОЦІАЛЬНЕ СТРАХУВАННЯ': '1105-14',
    'ПРО СОЦІАЛЬНЕ СТРАХУВАННЯ': '1105-14',
    'ДИСЦИПЛІНАРНИЙ СТАТУТ ЗБРОЙНИХ СИЛ': '551-14',
    'ДИСЦИПЛІНАРНИЙ СТАТУТ': '551-14',
    'СТАТУТ ВНУТРІШНЬОЇ СЛУЖБИ': '548-14',
    'СТАТУТ ГАРНІЗОННОЇ ТА ВАРТОВОЇ СЛУЖБ': '550-14',
    'СТАТУТ ГАРНІЗОННОЇ СЛУЖБИ': '550-14',
    'СТРОЙОВИЙ СТАТУТ': '549-14',
    'ПОЛОЖЕННЯ ПРО ТЕРИТОРІАЛЬНІ ЦЕНТРИ КОМПЛЕКТУВАННЯ': '154-2022-п',
    'ПОЛОЖЕННЯ ПРО ТЦК': '154-2022-п',
    'ПРО ТЦК': '154-2022-п',
    'ПРО ПРАВОВИЙ РЕЖИМ МАЙНА У ЗБРОЙНИХ СИЛАХ': '1075-14',
    'ПРО ПРАВОВИЙ РЕЖИМ МАЙНА ЗСУ': '1075-14',
    'ПРО ПЕНСІЙНЕ ЗАБЕЗПЕЧЕННЯ ВІЙСЬКОВОСЛУЖБОВЦІВ': '2262-12',
    'ПРО ПЕНСІЙНЕ ЗАБЕЗПЕЧЕННЯ ОСІБ ЗВІЛЬНЕНИХ З ВІЙСЬКОВОЇ СЛУЖБИ': '2262-12',
    'ПРО ПЕНСІЇ ВІЙСЬКОВИХ': '2262-12',
    'ПРО ГРОШОВЕ ЗАБЕЗПЕЧЕННЯ ВІЙСЬКОВОСЛУЖБОВЦІВ': '704-2017-п',
    'КМУ 704': '704-2017-п',
    'ПРО ОДНОРАЗОВУ ГРОШОВУ ДОПОМОГУ ВІЙСЬКОВОСЛУЖБОВЦЯМ': '975-2013-п',
    'КМУ 975': '975-2013-п',
    'РЕФОРМА МОБІЛІЗАЦІЇ 2024': '3633-20',
    'ПРО ДОРОЖНІЙ РУХ': '3353-12',
    'ЗАКОН ПРО ДОРОЖНІЙ РУХ': '3353-12',
  };

  const normalized = input
    .replace(/\s+/g, ' ')
    .replace(/\u00A0/g, ' ')
    .trim();

  // Try to match "постанова КМУ №1388" / "ПКМУ 1388" / "КМУ №1388" patterns
  // These resolve to rada_id format like "1388-98-п" (most common КМУ suffix)
  const kmuMatch = normalized.match(
    /(?:постанов[аиі]?\s+(?:Кабінету?\s+Міністрів|КМУ|кабміну?)|ПКМУ|КМУ\s*№?\s*)\s*№?\s*(\d+)(?:\s*(?:від\s+\d{1,2}[./]\d{1,2}[./](\d{4}|\d{2})))?/iu
  );
  if (kmuMatch) {
    const kmuNumber = kmuMatch[1];
    // Extract article/punkt if present
    const punktMatch = normalized.match(/(?:пункт|п\.?)\s*(\d+(?:\.\d+)?(?:-\d+)?)/iu);
    const articleNumber = punktMatch ? punktMatch[1] : '';

    // Try common year suffixes for КМУ постанови
    // Format: {number}-{year}-п (e.g. 1388-98-п, 704-2017-п)
    const yearSuffixes = ['98', '99', '2000', '2001', '2002', '2003', '2004', '2005',
      '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014', '2015',
      '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026'];

    // If year is explicitly mentioned, use it
    if (kmuMatch[2]) {
      const year = kmuMatch[2].length === 4 ? kmuMatch[2] : (parseInt(kmuMatch[2]) < 50 ? `20${kmuMatch[2]}` : `19${kmuMatch[2]}`);
      const yearSuffix = year.length === 4 && parseInt(year) >= 2000 ? year : year.slice(-2);
      const radaId = `${kmuNumber}-${yearSuffix}-п`;
      return articleNumber ? { radaId, articleNumber } : { radaId, articleNumber: '' };
    }

    // No year — return partial match (radaId pattern without year, will be resolved later)
    // Store as special marker for downstream resolution
    return { radaId: `KMU:${kmuNumber}`, articleNumber };
  }

  const patterns: Array<{ regex: RegExp; codeGroupIndex: number; articleGroupIndex: number } | { regex: RegExp; radaIdIndex: number; articleIndex: number }> = [
    // Note: don't use \b for Cyrillic words (JS \b is ASCII-centric)
    { regex: /(?:^|\s)ст\.?\s*(\d+(?:-\d+)?)\s*(ЦПК|ГПК|КАС|КПК|ЦК|ГК|ПКУ|КЗПП|КЗпП|СК|ЗК|КК|КУ|КОНСТИТУЦІЯ|КУПАП|КУпАП)(?=\s|$|[.,;:])/iu, codeGroupIndex: 2, articleGroupIndex: 1 },
    { regex: /(?:^|\s)(ЦПК|ГПК|КАС|КПК|ЦК|ГК|ПКУ|КЗПП|КЗпП|СК|ЗК|КК|КУ|КОНСТИТУЦІЯ|КУПАП|КУпАП)\s*ст\.?\s*(\d+(?:-\d+)?)(?=\s|$|[.,;:])/iu, codeGroupIndex: 1, articleGroupIndex: 2 },
    { regex: /(?:^|\s)статт(?:я|і)\s*(\d+(?:-\d+)?)\s*(ЦПК|ГПК|КАС|КПК|ЦК|ГК|ПКУ|КЗПП|КЗпП|СК|ЗК|КК|КУ|КОНСТИТУЦІЯ|КУПАП|КУпАП)(?=\s|$|[.,;:])/iu, codeGroupIndex: 2, articleGroupIndex: 1 },
    { regex: /(?:^|\s)(\d{3,4}-\d{2}).*?ст\.?\s*(\d+(?:-\d+)?)(?=\s|$|[.,;:])/iu, radaIdIndex: 1, articleIndex: 2 },
  ];

  for (const p of patterns) {
    const match = normalized.match(p.regex);
    if (!match) continue;

    if ('radaIdIndex' in p) {
      const radaId = match[p.radaIdIndex];
      const articleNumber = match[p.articleIndex];
      if (radaId && articleNumber) {
        return { radaId, articleNumber };
      }
      continue;
    }

    const code = String(match[p.codeGroupIndex] || '').toUpperCase();
    const articleNumber = String(match[p.articleGroupIndex] || '').trim();
    const radaId = codeMap[code];
    if (radaId && articleNumber) {
      return { radaId, articleNumber };
    }
  }

  const longForm = normalized.toUpperCase();
  const longFormMatch = longForm.match(/(?:^|\s)(?:ст(?:атт[яі])?\.?\s*)?(\d+(?:-\d+)?)(?=\s|$|[.,;:])/iu);
  if (longFormMatch) {
    const articleNumber = longFormMatch[1];
    if (longForm.includes('ПОДАТКОВ') && codeMap['ПОДАТКОВИЙ КОДЕКС']) {
      return { radaId: codeMap['ПОДАТКОВИЙ КОДЕКС'], articleNumber };
    }
  }

  // Try full-name aliases: "ст. 44 Конституції України" etc.
  const articleInTextMatch = normalized.match(/(?:^|\s)(?:ст(?:атт[яіей])?\.?\s*)(\d+(?:-\d+)?)/iu);
  if (articleInTextMatch) {
    const articleNumber = articleInTextMatch[1];
    const upperNorm = normalized.toUpperCase();
    // Sort by alias length descending so "ЦИВІЛЬНИЙ ПРОЦЕСУАЛЬНИЙ КОДЕКС" matches before "ЦИВІЛЬНИЙ КОДЕКС"
    const sortedAliases = Object.entries(fullNameAliases).sort((a, b) => b[0].length - a[0].length);
    for (const [alias, radaId] of sortedAliases) {
      // Build stems for each word in the alias (drop last 1-2 chars for Ukrainian declension)
      const aliasWords = alias.split(' ');
      const stems = aliasWords.map(w => w.substring(0, Math.max(w.length - 2, 3)).toUpperCase());
      const allStemsMatch = stems.every(stem => upperNorm.includes(stem));
      if (allStemsMatch) {
        return { radaId, articleNumber };
      }
    }
  }

  return null;
}

/**
 * Парсит ссылку на законодательство используя AI-классификацию как fallback,
 * когда regexp не дает результата.
 */
export async function parseLegislationReferenceWithAI(
  text: string,
  classifier?: LegislationClassifier,
  confidenceThreshold: number = 0.7
): Promise<{ radaId: string; articleNumber: string; source: 'regexp' | 'ai'; confidence?: number } | null> {
  // Сначала пробуем regexp
  const regexpResult = parseLegislationReference(text);
  if (regexpResult) {
    return { ...regexpResult, source: 'regexp' };
  }

  // Если regexp не сработал и есть classifier, используем AI
  if (classifier) {
    logger.info('[parseLegislationReferenceWithAI] Regexp failed, trying AI classification', {
      query: text.substring(0, 100),
    });

    const aiResult = await classifier.classify(text, 'quick');

    // Lower threshold for KMU: / KMU-Р: patterns — they need downstream resolution anyway
    const effectiveThreshold = hasKmuPrefix(aiResult.rada_id) ? 0.4 : confidenceThreshold;

    if (aiResult.rada_id && (aiResult.article_number || hasKmuPrefix(aiResult.rada_id)) && aiResult.confidence >= effectiveThreshold) {
      logger.info('[parseLegislationReferenceWithAI] AI classification successful', {
        rada_id: aiResult.rada_id,
        article: aiResult.article_number,
        confidence: aiResult.confidence,
        code: aiResult.code_name,
      });

      return {
        radaId: aiResult.rada_id,
        articleNumber: aiResult.article_number || '',
        source: 'ai',
        confidence: aiResult.confidence,
      };
    } else {
      logger.warn('[parseLegislationReferenceWithAI] AI classification low confidence or incomplete', {
        rada_id: aiResult.rada_id,
        article: aiResult.article_number,
        confidence: aiResult.confidence,
      });
    }
  }

  return null;
}

/**
 * Normalizes rada_id by fixing common Latin/Cyrillic character confusion.
 * The Rada API uses Cyrillic characters in IDs (e.g., 254к/96-вр),
 * but LLMs often output Latin lookalikes (254k/96-vr).
 */
export function normalizeRadaId(radaId: string): string {
  // Known Latin→Cyrillic rada_id mappings
  const knownMappings: Record<string, string> = {
    '254k/96-vr': '254к/96-вр',
    '254k/96-bp': '254к/96-вр',
  };
  const lower = radaId.toLowerCase();
  if (knownMappings[lower]) {
    return knownMappings[lower];
  }
  return radaId;
}

/**
 * Parses KMU prefix patterns — "KMU:{N}" for постанови (-п)
 * and "KMU-Р:{N}" for розпорядження (-р). Returns null if no prefix match.
 */
export function parseKmuPrefix(radaId: string): { kmuNumber: string; docType: '-п' | '-р' } | null {
  if (radaId.startsWith('KMU-Р:')) {
    return { kmuNumber: radaId.substring(6), docType: '-р' };
  }
  if (radaId.startsWith('KMU:')) {
    return { kmuNumber: radaId.substring(4), docType: '-п' };
  }
  return null;
}

/** Matches either "KMU:" or "KMU-Р:" prefix. */
export function hasKmuPrefix(radaId: string | null | undefined): boolean {
  return !!radaId && (radaId.startsWith('KMU:') || radaId.startsWith('KMU-Р:'));
}

export class LegislationService {
  private adapter: RadaLegislationAdapter;
  private embeddingService: IEmbeddingPort;
  private db: IDatabase;
  private classifier: LegislationClassifier | null = null;

  constructor(
    db: IDatabase,
    embeddingService: IEmbeddingPort,
    redis?: ICachePort,
    llm?: ILLMPort,
    adapter?: RadaLegislationAdapter,
    classifier?: LegislationClassifier
  ) {
    this.db = db;
    this.adapter = adapter || new RadaLegislationAdapter(db);
    this.embeddingService = embeddingService;
    this.classifier = classifier || new LegislationClassifier(redis, llm);
  }

  getAdapter(): RadaLegislationAdapter {
    return this.adapter;
  }

  /**
   * Устанавливает Redis клиент для AI-классификации законодательства.
   * Используется для кэширования результатов классификации.
   */
  setRedisClient(redis: ICachePort | null): void {
    if (this.classifier) {
      this.classifier.setRedisClient(redis);
    }
  }

  /**
   * Resolves KMU:{number} pattern to actual rada_id by trying year suffixes
   * against the RADA API in parallel batches. Returns resolved rada_id or null.
   *
   * @param kmuNumber — document number (e.g. "1388", "265")
   * @param docType — "-п" for постанови (default), "-р" for розпорядження КМУ
   */
  async resolveKmuRadaId(kmuNumber: string, docType: '-п' | '-р' = '-п'): Promise<string | null> {
    // Match DB entries with the correct suffix type so "KMU:265" doesn't
    // accidentally resolve to "265-2019-р" when the user meant постанова,
    // and "KMU-Р:265" doesn't match "265-2017-п".
    const likePattern = `${kmuNumber}-%${docType}`;
    // First check if we already have it in DB with any year suffix
    // Only trust DB entries that have title (non-empty = successfully fetched)
    const dbResult = await this.db.query(
      `SELECT rada_id FROM legislation WHERE rada_id LIKE $1 AND title IS NOT NULL AND title != '' AND total_articles > 0 ORDER BY LENGTH(rada_id) ASC, rada_id ASC LIMIT 1`,
      [likePattern]
    );
    if (dbResult.rows.length > 0) {
      logger.info(`[resolveKmuRadaId] Found KMU${docType === '-р' ? '-Р' : ''}:${kmuNumber} in DB: ${dbResult.rows[0].rada_id}`);
      return dbResult.rows[0].rada_id;
    }

    // Clean up stale/empty DB entries for this KMU number (matching this docType)
    const staleResult = await this.db.query(
      `DELETE FROM legislation WHERE rada_id LIKE $1 AND (title IS NULL OR title = '' OR total_articles = 0) RETURNING rada_id`,
      [likePattern]
    );
    if (staleResult.rows.length > 0) {
      logger.info(`[resolveKmuRadaId] Cleaned up ${staleResult.rows.length} stale entries for KMU${docType === '-р' ? '-Р' : ''}:${kmuNumber}`, {
        cleaned: staleResult.rows.map((r: any) => r.rada_id),
      });
    }

    // Generate candidate rada_ids with year suffixes in batches (parallel within batch)
    // Most КМУ постанови are from 1993-2026, format: {number}-{YY}-п or {number}-{YYYY}-п
    // Order: oldest first — legal references typically cite established (older) regulations
    const yearSuffixes = [
      // 90s use 2-digit format (oldest first)
      '93', '94', '95', '96', '97', '98', '99',
      '2000', '2001', '2002', '2003', '2004', '2005', '2006', '2007', '2008', '2009',
      '2010', '2011', '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019',
      '2020', '2021', '2022', '2023', '2024', '2025', '2026',
    ];

    // Try ALL year suffixes in parallel batches, collect all found, save all, return oldest
    const allFound: Array<{ candidateId: string; result: any; yearNum: number }> = [];
    const BATCH_SIZE = 8;
    for (let i = 0; i < yearSuffixes.length; i += BATCH_SIZE) {
      const batch = yearSuffixes.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (suffix) => {
          const candidateId = `${kmuNumber}-${suffix}${docType}`;
          const result = await this.adapter.fetchLegislation(candidateId);
          if (result && result.metadata && result.metadata.title) {
            const yearNum = suffix.length === 2 ? 1900 + parseInt(suffix) : parseInt(suffix);
            return { candidateId, result, yearNum };
          }
          throw new Error('not found');
        })
      );

      for (const res of results) {
        if (res.status === 'fulfilled' && res.value) {
          allFound.push(res.value);
        }
      }

      // If we found at least one in the oldest batches, stop searching newer years
      if (allFound.length > 0 && i >= 14) break;
    }

    if (allFound.length === 0) {
      logger.warn(`[resolveKmuRadaId] Could not resolve KMU${docType === '-р' ? '-Р' : ''}:${kmuNumber} — no valid year suffix found`);
      return null;
    }

    // Save all found variants to DB
    // Sort by year (oldest first) — legal references typically cite older base regulations
    allFound.sort((a, b) => a.yearNum - b.yearNum);

    for (const found of allFound) {
      logger.info(`[resolveKmuRadaId] Found KMU:${kmuNumber} variant: ${found.candidateId}`, {
        title: found.result.metadata.title,
        year: found.yearNum,
      });
      try {
        await this.adapter.saveLegislationToDatabase(found.result.metadata, found.result.articles);
        await this.indexArticlesForVectorSearch(found.candidateId);
      } catch (e: any) {
        logger.warn(`[resolveKmuRadaId] Failed to save ${found.candidateId}: ${e.message}`);
      }
    }

    // Return the oldest variant (most likely the one being referenced)
    const chosen = allFound[0];
    logger.info(`[resolveKmuRadaId] Resolved KMU${docType === '-р' ? '-Р' : ''}:${kmuNumber} → ${chosen.candidateId} (oldest of ${allFound.length} variants)`);
    return chosen.candidateId;
  }

  async ensureLegislationExists(radaId: string): Promise<boolean> {
    const kmuPrefix = parseKmuPrefix(radaId);
    if (kmuPrefix) {
      const resolved = await this.resolveKmuRadaId(kmuPrefix.kmuNumber, kmuPrefix.docType);
      return resolved !== null;
    }

    radaId = normalizeRadaId(radaId);
    // Case-insensitive lookup — RADA API may return different casing (e.g. 254к/96-ВР vs 254к/96-вр)
    const result = await this.db.query(
      'SELECT id, rada_id, total_articles FROM legislation WHERE LOWER(rada_id) = LOWER($1)',
      [radaId]
    );
    if (result.rows.length > 0) {
      const row = result.rows[0];
      // If metadata was saved but parser failed to extract any text
      // (total_articles = 0), retry the fetch. Previously this record
      // was considered "present" and user got an empty document.
      if (row.total_articles === 0 || row.total_articles === null) {
        logger.info(`Legislation ${radaId} exists but has no articles (total_articles=${row.total_articles}), refetching...`);
        return this.refetchLegislation(radaId);
      }
      return true;
    }

    logger.info(`Legislation ${radaId} not found in database, fetching...`);
    return this.refetchLegislation(radaId);
  }

  private async refetchLegislation(radaId: string): Promise<boolean> {
    try {
      const { metadata, articles } = await this.adapter.fetchLegislation(radaId);
      await this.adapter.saveLegislationToDatabase(metadata, articles);

      await this.indexArticlesForVectorSearch(radaId);

      return true;
    } catch (error: any) {
      logger.error(`Failed to fetch and save legislation ${radaId}: ${error.message}`);
      return false;
    }
  }

  async getArticle(radaId: string, articleNumber: string, asOfDate?: string): Promise<LegislationReference | null> {
    const kmuPrefix = parseKmuPrefix(radaId);
    if (kmuPrefix) {
      const resolved = await this.resolveKmuRadaId(kmuPrefix.kmuNumber, kmuPrefix.docType);
      if (!resolved) return null;
      radaId = resolved;
    }
    radaId = normalizeRadaId(radaId);
    await this.ensureLegislationExists(radaId);

    let article = await this.adapter.getArticleByNumber(radaId, articleNumber, asOfDate);
    // Fallback: transitional provisions stored as "п.38.6" but LLM may request "38.6"
    if (!article && /^\d+\.\d/.test(articleNumber)) {
      article = await this.adapter.getArticleByNumber(radaId, `п.${articleNumber}`, asOfDate);
    }
    if (!article) {
      return null;
    }

    // Fetch NPA title from legislation table
    const legResult = await this.db.query(
      `SELECT title FROM legislation WHERE LOWER(rada_id) = LOWER($1) LIMIT 1`,
      [radaId]
    );
    const npaTitle = legResult.rows[0]?.title || undefined;

    // Use the actual article_number from the DB row, not the input arg —
    // header and body must come from the same record (LEXAI-823).
    const actualArticleNumber = article.article_number || articleNumber;

    const ref: LegislationReference = {
      rada_id: radaId,
      article_number: actualArticleNumber,
      title: article.title,
      full_text: article.full_text,
      full_text_html: article.full_text_html,
      url: `https://zakon.rada.gov.ua/laws/show/${radaId}#n${actualArticleNumber}`,
      metadata: article.metadata,
      npa_title: npaTitle,
      section_number: article.section_number,
      section_title: article.section_title,
      chapter_number: article.chapter_number,
      chapter_title: article.chapter_title,
    };

    if (asOfDate) {
      ref.metadata = { ...ref.metadata, is_historical: true, as_of_date: asOfDate };
    }

    return ref;
  }

  async getMultipleArticles(radaId: string, articleNumbers: string[], asOfDate?: string): Promise<LegislationReference[]> {
    await this.ensureLegislationExists(radaId);

    let result;
    if (asOfDate) {
      result = await this.db.query(
        `SELECT DISTINCT ON (la.article_number) la.*, l.rada_id, l.title as npa_title
         FROM legislation_articles la
         JOIN legislation l ON la.legislation_id = l.id
         WHERE LOWER(l.rada_id) = LOWER($1) AND la.article_number = ANY($2) AND la.version_date <= $3
         ORDER BY la.article_number, la.version_date DESC`,
        [radaId, articleNumbers, asOfDate]
      );
    } else {
      result = await this.db.query(
        `SELECT DISTINCT ON (la.article_number) la.*, l.rada_id, l.title as npa_title
         FROM legislation_articles la
         JOIN legislation l ON la.legislation_id = l.id
         WHERE LOWER(l.rada_id) = LOWER($1) AND la.article_number = ANY($2) AND la.is_current = true
         ORDER BY la.article_number, la.version_date DESC NULLS LAST, la.id DESC`,
        [radaId, articleNumbers]
      );
    }

    return result.rows.map((row: any) => ({
      rada_id: radaId,
      article_number: row.article_number,
      title: row.title,
      full_text: row.full_text,
      full_text_html: row.full_text_html,
      url: `https://zakon.rada.gov.ua/laws/show/${radaId}#n${row.article_number}`,
      metadata: asOfDate ? { ...row.metadata, is_historical: true, as_of_date: asOfDate } : row.metadata,
      npa_title: row.npa_title,
      section_number: row.section_number,
      section_title: row.section_title,
      chapter_number: row.chapter_number,
      chapter_title: row.chapter_title,
    }));
  }

  async listLegislation(
    limit: number = 50,
    offset: number = 0,
    search?: string,
    filters?: { type?: string; status?: string; dateFrom?: string; dateTo?: string }
  ): Promise<{
    items: Array<{
      rada_id: string;
      title: string;
      short_title: string | null;
      type: string | null;
      status: string | null;
      total_articles: number | null;
      adoption_date: string | null;
      effective_date: string | null;
      last_amended_date: string | null;
      url: string;
    }>;
    total: number;
  }> {
    const conditions: string[] = [];
    const params: any[] = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(title ILIKE $${params.length} OR short_title ILIKE $${params.length} OR rada_id ILIKE $${params.length})`);
    }

    if (filters?.type) {
      params.push(filters.type);
      conditions.push(`type = $${params.length}`);
    }

    if (filters?.status) {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }

    if (filters?.dateFrom) {
      params.push(filters.dateFrom);
      conditions.push(`adoption_date >= $${params.length}`);
    }

    if (filters?.dateTo) {
      params.push(filters.dateTo);
      conditions.push(`adoption_date <= $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.db.query(
      `SELECT COUNT(*) as total FROM legislation ${whereClause}`,
      params
    );

    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const result = await this.db.query(
      `SELECT rada_id, title, short_title, type, status, total_articles,
              adoption_date, effective_date, last_amended_date
       FROM legislation
       ${whereClause}
       ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    return {
      items: result.rows.map((row: any) => ({
        rada_id: row.rada_id,
        title: row.title,
        short_title: row.short_title,
        type: row.type,
        status: row.status,
        total_articles: row.total_articles,
        adoption_date: row.adoption_date,
        effective_date: row.effective_date,
        last_amended_date: row.last_amended_date,
        url: `https://zakon.rada.gov.ua/laws/show/${row.rada_id}`,
      })),
      total: parseInt(countResult.rows[0].total, 10),
    };
  }

  async getLegislationStats(): Promise<{
    total: number;
    active: number;
    totalArticles: number;
  }> {
    const result = await this.db.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'active') AS active,
              COALESCE(SUM(total_articles), 0) AS total_articles
       FROM legislation`
    );
    const row = result.rows[0];
    return {
      total: parseInt(row.total, 10),
      active: parseInt(row.active, 10),
      totalArticles: parseInt(row.total_articles, 10),
    };
  }

  async getDistinctTypes(): Promise<string[]> {
    const result = await this.db.query(
      `SELECT DISTINCT type FROM legislation WHERE type IS NOT NULL ORDER BY type`
    );
    return result.rows.map((row: any) => row.type);
  }

  async getEditionDates(radaId: string): Promise<Array<{ edition_date: string; article_count: number }>> {
    const result = await this.db.query(
      `SELECT le.edition_date, le.article_count
       FROM legislation_editions le
       JOIN legislation l ON le.legislation_id = l.id
       WHERE LOWER(l.rada_id) = LOWER($1)
       ORDER BY le.edition_date DESC`,
      [radaId]
    );
    return result.rows.map((row: any) => ({
      edition_date: row.edition_date,
      article_count: row.article_count,
    }));
  }

  async getAmendmentHistory(radaId: string): Promise<Array<{
    article_number: string;
    title: string | null;
    version_date: string | null;
    created_at: string;
  }>> {
    const result = await this.db.query(
      `SELECT la.article_number, la.title, la.metadata->>'version_date' AS version_date, la.created_at
       FROM legislation_articles la
       JOIN legislation l ON la.legislation_id = l.id
       WHERE LOWER(l.rada_id) = LOWER($1) AND la.is_current = false
       ORDER BY la.article_number, la.created_at DESC`,
      [radaId]
    );
    return result.rows.map((row: any) => ({
      article_number: row.article_number,
      title: row.title,
      version_date: row.version_date,
      created_at: row.created_at,
    }));
  }

  async searchLegislation(query: string, radaId?: string, limit: number = 10): Promise<LegislationSearchResult[]> {
    if (radaId) {
      await this.ensureLegislationExists(radaId);
    }

    const articles = await this.adapter.searchArticles(query, radaId, limit);

    const groupedByLegislation = articles.reduce((acc: any, article: any) => {
      const key = article.rada_id;
      if (!acc[key]) {
        acc[key] = {
          rada_id: article.rada_id,
          legislation_title: article.legislation_title,
          articles: [],
        };
      }
      acc[key].articles.push(article);
      return acc;
    }, {});

    return Object.values(groupedByLegislation).map((group: any) => ({
      articles: group.articles,
      total_found: group.articles.length,
      legislation_title: group.legislation_title,
      rada_id: group.rada_id,
    }));
  }

  async getLegislationStructure(radaId: string, forceRefresh?: boolean): Promise<any> {
    radaId = normalizeRadaId(radaId);

    if (forceRefresh) {
      logger.info(`Force refreshing legislation ${radaId}`);
      await this.db.query('DELETE FROM legislation_articles WHERE legislation_id IN (SELECT id FROM legislation WHERE rada_id = $1)', [radaId]);
      await this.db.query('DELETE FROM legislation WHERE rada_id = $1', [radaId]);
    }

    await this.ensureLegislationExists(radaId);

    const result = await this.db.query(
      `SELECT
         l.title,
         l.short_title,
         l.type,
         l.total_articles,
         l.structure_metadata,
         json_agg(
           json_build_object(
             'article_number', la.article_number,
             'title', la.title,
             'full_text', la.full_text,
             'section_number', la.section_number,
             'section_title', la.section_title,
             'chapter_number', la.chapter_number,
             'chapter_title', la.chapter_title,
             'byte_size', la.byte_size,
             'metadata', la.metadata
           ) ORDER BY (regexp_match(la.article_number, '^\d+'))[1]::integer NULLS LAST, la.article_number
         ) as articles
       FROM legislation l
       LEFT JOIN legislation_articles la ON l.id = la.legislation_id AND la.is_current = true
       WHERE LOWER(l.rada_id) = LOWER($1)
       GROUP BY l.id`,
      [radaId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const data = result.rows[0];
    return {
      rada_id: radaId,
      title: data.title,
      short_title: data.short_title,
      type: data.type,
      total_articles: data.total_articles,
      structure: data.structure_metadata || {},
      articles: data.articles || [],
      table_of_contents: this.buildTableOfContents(data.articles || []),
    };
  }

  private buildTableOfContents(articles: any[]): any[] {
    const toc: any[] = [];
    let currentBook: any = null;
    let currentSection: any = null;
    let currentSubsection: any = null;
    let currentChapter: any = null;
    let currentParagraph: any = null;

    for (const article of articles) {
      const meta = article.metadata || {};

      // Handle book level
      const bookNumber = meta.book_number;
      if (bookNumber && (!currentBook || currentBook.number !== bookNumber)) {
        currentBook = {
          type: 'book',
          number: bookNumber,
          title: meta.book_title || undefined,
          children: [],
        };
        toc.push(currentBook);
        currentSection = null;
        currentSubsection = null;
        currentChapter = null;
        currentParagraph = null;
      }

      // Handle section level (section_number may include book prefix like "1.2")
      if (article.section_number && (!currentSection || currentSection.number !== article.section_number)) {
        // Extract display number (strip book prefix for display)
        const displayNumber = article.section_number.includes('.')
          ? article.section_number.split('.').pop()
          : article.section_number;

        currentSection = {
          type: 'section',
          number: displayNumber,
          title: article.section_title || undefined,
          articles: [],
        };

        if (currentBook) {
          currentBook.children.push(currentSection);
        } else {
          toc.push(currentSection);
        }
        currentSubsection = null;
        currentChapter = null;
        currentParagraph = null;
      }

      // Handle subsection level
      const subsectionNumber = meta.subsection_number;
      if (subsectionNumber && (!currentSubsection || currentSubsection.number !== subsectionNumber)) {
        currentSubsection = {
          type: 'subsection',
          number: subsectionNumber,
          title: meta.subsection_title || undefined,
          articles: [],
          chapters: [],
        };
        if (currentSection) {
          currentSection.subsections = currentSection.subsections || [];
          currentSection.subsections.push(currentSubsection);
        } else if (currentBook) {
          currentBook.children.push(currentSubsection);
        } else {
          toc.push(currentSubsection);
        }
        currentChapter = null;
        currentParagraph = null;
      }

      // Handle chapter level
      if (article.chapter_number && (!currentChapter || currentChapter.number !== article.chapter_number)) {
        currentChapter = {
          type: 'chapter',
          number: article.chapter_number,
          title: article.chapter_title || undefined,
          articles: [],
        };
        if (currentSubsection) {
          currentSubsection.chapters.push(currentChapter);
        } else if (currentSection) {
          currentSection.chapters = currentSection.chapters || [];
          currentSection.chapters.push(currentChapter);
        } else if (currentBook) {
          currentBook.children.push(currentChapter);
        } else {
          toc.push(currentChapter);
        }
        currentParagraph = null;
      }

      // Handle paragraph (§) level
      const paragraphNumber = meta.paragraph_number;
      if (paragraphNumber && (!currentParagraph || currentParagraph.number !== paragraphNumber)) {
        currentParagraph = {
          type: 'paragraph',
          number: paragraphNumber,
          title: meta.paragraph_title || undefined,
          articles: [],
        };
        if (currentChapter) {
          currentChapter.paragraphs = currentChapter.paragraphs || [];
          currentChapter.paragraphs.push(currentParagraph);
        } else if (currentSubsection) {
          currentSubsection.paragraphs = currentSubsection.paragraphs || [];
          currentSubsection.paragraphs.push(currentParagraph);
        } else if (currentSection) {
          currentSection.paragraphs = currentSection.paragraphs || [];
          currentSection.paragraphs.push(currentParagraph);
        } else {
          toc.push(currentParagraph);
        }
      }

      const articleEntry = {
        article_number: article.article_number,
        title: article.title,
        byte_size: article.byte_size,
      };

      // Place article in the deepest available container
      if (currentParagraph) {
        currentParagraph.articles.push(articleEntry);
      } else if (currentChapter) {
        currentChapter.articles.push(articleEntry);
      } else if (currentSubsection) {
        currentSubsection.articles.push(articleEntry);
      } else if (currentSection) {
        currentSection.articles.push(articleEntry);
      } else if (currentBook) {
        currentBook.children.push(articleEntry);
      } else {
        toc.push(articleEntry);
      }
    }

    return toc;
  }

  async indexArticlesForVectorSearch(radaId: string): Promise<void> {
    logger.info(`Starting vector indexing for legislation ${radaId}`);

    const result = await this.db.query(
      `SELECT la.id, la.article_number, la.full_text, la.section_number, la.chapter_number, la.title
       FROM legislation_articles la
       JOIN legislation l ON la.legislation_id = l.id
       WHERE LOWER(l.rada_id) = LOWER($1) AND la.is_current = true`,
      [radaId]
    );

    const articles = result.rows;
    let totalChunks = 0;

    for (const article of articles) {
      const chunks = this.adapter.createArticleChunks(article);

      for (const chunk of chunks) {
        try {
          const embedding = await this.embeddingService.generateEmbedding(chunk.text);

          // Create UUID-based vector ID (Qdrant requires UUID or unsigned integer)
          // Format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (UUID v4 style from MD5 hash)
          const idString = `leg_${radaId}_art_${article.article_number}_chunk_${chunk.chunk_index}`;
          const hash = createHash('md5').update(idString).digest('hex');
          const vectorId = `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`;

          await this.embeddingService.upsertVector(
            vectorId,
            embedding,
            {
              rada_id: radaId,
              article_id: article.id,
              article_number: article.article_number,
              section_number: article.section_number,
              chapter_number: article.chapter_number,
              article_title: article.title,
              chunk_index: chunk.chunk_index,
              text: chunk.text,
              context_before: chunk.context_before,
              context_after: chunk.context_after,
              document_type: 'legislation',
            }
          );

          await this.db.query(
            `INSERT INTO legislation_chunks 
             (article_id, legislation_id, chunk_index, text, vector_id, context_before, context_after, metadata)
             SELECT $1, l.id, $2, $3, $4, $5, $6, $7
             FROM legislation l
             WHERE LOWER(l.rada_id) = LOWER($8)
             ON CONFLICT (article_id, chunk_index) DO UPDATE SET
               text = EXCLUDED.text,
               vector_id = EXCLUDED.vector_id`,
            [
              article.id,
              chunk.chunk_index,
              chunk.text,
              vectorId,
              chunk.context_before,
              chunk.context_after,
              chunk.metadata,
              radaId,
            ]
          );

          totalChunks++;
        } catch (error: any) {
          logger.error(`Failed to index chunk for article ${article.article_number}:`, error.message);
        }
      }
    }

    logger.info(`Indexed ${totalChunks} chunks for ${articles.length} articles in legislation ${radaId}`);
  }

  async findRelevantArticles(query: string, radaId?: string, limit: number = 5): Promise<LegislationReference[]> {
    try {
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);
      
      const filter: any = { document_type: 'legislation' };
      if (radaId) {
        filter.rada_id = radaId;
      }

      const MIN_SCORE = 0.6;
      const allResults = await this.embeddingService.searchVectors(queryEmbedding, Math.max(limit * 3, 20), filter);
      const searchResults = allResults.filter((r: any) => (r.score || 0) >= MIN_SCORE);

      if (searchResults.length === 0) {
        logger.warn('[LegislationService] Vector search returned 0 results, falling back to text search', {
          query: query.substring(0, 50),
        });
        const textResults = await this.searchLegislation(query, radaId, limit);
        return textResults.flatMap(r => r.articles.map((a: any) => ({
          rada_id: r.rada_id,
          article_number: a.article_number,
          title: a.title,
          full_text: a.full_text,
          full_text_html: a.full_text_html,
          url: `https://zakon.rada.gov.ua/laws/show/${r.rada_id}#n${a.article_number}`,
          metadata: a.metadata,
          npa_title: r.legislation_title,
          section_number: a.section_number,
          section_title: a.section_title,
          chapter_number: a.chapter_number,
          chapter_title: a.chapter_title,
        })));
      }

      // Resolve vector results to DB records via integer IDs or payload lookup
      const integerIds: number[] = [];
      const payloadLookups: Array<{ rada_id: string; article_number: string }> = [];

      for (const r of searchResults) {
        if (r.payload?.article_id) {
          integerIds.push(r.payload.article_id);
        } else if (typeof r.id === 'number') {
          integerIds.push(r.id);
        } else if (r.payload?.rada_id && r.payload?.article_number) {
          payloadLookups.push({ rada_id: r.payload.rada_id, article_number: r.payload.article_number });
        }
      }

      const queries: Promise<any>[] = [];
      if (integerIds.length > 0) {
        queries.push(this.db.query(
          `SELECT la.*, l.rada_id, l.title as npa_title
           FROM legislation_articles la JOIN legislation l ON la.legislation_id = l.id
           WHERE la.id = ANY($1)`, [[...new Set(integerIds)]]
        ));
      }
      for (const pl of payloadLookups.slice(0, limit)) {
        queries.push(this.db.query(
          `SELECT la.*, l.rada_id, l.title as npa_title
           FROM legislation_articles la JOIN legislation l ON la.legislation_id = l.id
           WHERE LOWER(l.rada_id) = LOWER($1) AND la.article_number = $2 AND la.is_current = true
           LIMIT 1`, [pl.rada_id, pl.article_number]
        ));
      }

      const queryResults = await Promise.all(queries);
      const seen = new Set<string>();
      const allRows: any[] = [];
      for (const qr of queryResults) {
        for (const row of qr.rows) {
          const key = `${row.rada_id}:${row.article_number}`;
          if (!seen.has(key)) { seen.add(key); allRows.push(row); }
        }
      }

      // Return all rows above MIN_SCORE threshold, capped at 15 to avoid maxToolCalls exhaustion
      const result = { rows: allRows.slice(0, 15) };

      return result.rows.map((row: any) => ({
        rada_id: row.rada_id,
        article_number: row.article_number,
        title: row.title,
        full_text: row.full_text,
        full_text_html: row.full_text_html,
        url: `https://zakon.rada.gov.ua/laws/show/${row.rada_id}#n${row.article_number}`,
        metadata: row.metadata,
        npa_title: row.npa_title,
        section_number: row.section_number,
        section_title: row.section_title,
        chapter_number: row.chapter_number,
        chapter_title: row.chapter_title,
      }));
    } catch (error: any) {
      logger.error('Vector search failed, falling back to text search:', error.message);
      const results = await this.searchLegislation(query, radaId, limit);
      return results.flatMap(r => r.articles.map((a: any) => ({
        rada_id: r.rada_id,
        article_number: a.article_number,
        title: a.title,
        full_text: a.full_text,
        full_text_html: a.full_text_html,
        url: `https://zakon.rada.gov.ua/laws/show/${r.rada_id}#n${a.article_number}`,
        metadata: a.metadata,
        npa_title: r.legislation_title,
        section_number: a.section_number,
        section_title: a.section_title,
        chapter_number: a.chapter_number,
        chapter_title: a.chapter_title,
      })));
    }
  }

  /**
   * Синхронный парсинг через regexp (для обратной совместимости)
   */
  parseArticleReference(text: string): { radaId: string; articleNumber: string } | null {
    return parseLegislationReference(text);
  }

  /**
   * Асинхронный парсинг с использованием AI как fallback
   */
  async parseArticleReferenceWithAI(
    text: string,
    confidenceThreshold: number = 0.7
  ): Promise<{ radaId: string; articleNumber: string; source: 'regexp' | 'ai'; confidence?: number } | null> {
    return await parseLegislationReferenceWithAI(text, this.classifier || undefined, confidenceThreshold);
  }
}

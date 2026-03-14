/**
 * EDRSR Semantic Tools — Full Text Search + On-Demand Vectorization + Semantic Search
 *
 * 3 tools:
 * - search_edrsr_fulltext — FTS search using PostgreSQL tsvector
 * - search_edrsr_semantic — Semantic search via Voyage embeddings in Qdrant
 * - vectorize_edrsr_results — On-demand vectorize specific EDRSR doc_ids
 */

import { BaseToolHandler, ToolDefinition, ToolResult } from '../base-tool-handler.js';
import { EdsrFtsService } from '../../services/edrsr-fts-service.js';
import { EdsrVectorizerService } from '../../services/edrsr-vectorizer-service.js';
import { logger } from '../../utils/logger.js';

export class EdsrSemanticTools extends BaseToolHandler {
  constructor(
    private db: any,
    private ftsService: EdsrFtsService,
    private vectorizer: EdsrVectorizerService,
  ) {
    super();
  }

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'search_edrsr_fulltext',
        description: `Повнотекстовий пошук у ЄДРСР (96М+ судових рішень).

Пошук за ключовими словами з ранжуванням релевантності.
Підтримує фільтрацію за судом, суддею, датою, видом судочинства, формою рішення, категорією.
Повертає фрагменти тексту з підсвіченими збігами.

Використовуйте для: пошуку рішень за темою ("земельний спір", "оренда"), ключовими словами, юридичними термінами.
Для семантичного пошуку (за змістом, а не точними словами) використовуйте search_edrsr_semantic.`,
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Пошуковий запит (ключові слова українською)',
            },
            court_code: {
              type: 'number',
              description: 'Код суду',
            },
            court_name: {
              type: 'string',
              description: 'Назва суду (пошук по входженню)',
            },
            judge: {
              type: 'string',
              description: 'ПІБ судді (пошук по входженню)',
            },
            justice_kind: {
              type: 'number',
              description: 'Вид судочинства: 1=Цивільне, 2=Кримінальне, 3=Господарське, 4=Адміністративне',
            },
            judgment_code: {
              type: 'number',
              description: 'Форма рішення: 1=Вирок, 2=Постанова, 3=Рішення, 5=Ухвала',
            },
            category_code: {
              type: 'number',
              description: 'Код категорії справи',
            },
            date_from: {
              type: 'string',
              description: 'Дата ухвалення ВІД (YYYY-MM-DD)',
            },
            date_to: {
              type: 'string',
              description: 'Дата ухвалення ДО (YYYY-MM-DD)',
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
          },
          required: ['query'],
        },
      },
      {
        name: 'search_edrsr_semantic',
        description: `Семантичний пошук у ЄДРСР — пошук за змістом, а не точними словами.

Використовує векторні embeddings (Voyage AI) для знаходження семантично схожих рішень.
Працює тільки по вже векторизованих документах (векторизація відбувається автоматично при пошуку).

Підтримує фільтрацію за судом, суддею, датою, видом судочинства.
Ідеально для: "знайди рішення з подібною аргументацією", "схожі справи про самовільне зайняття".`,
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Семантичний запит (опис ситуації, аргументація)',
            },
            court_code: {
              type: 'number',
              description: 'Код суду',
            },
            justice_kind: {
              type: 'number',
              description: 'Вид судочинства',
            },
            judge: {
              type: 'string',
              description: 'ПІБ судді',
            },
            date_from: {
              type: 'string',
              description: 'Дата ухвалення ВІД (YYYY-MM-DD)',
            },
            date_to: {
              type: 'string',
              description: 'Дата ухвалення ДО (YYYY-MM-DD)',
            },
            auto_vectorize: {
              type: 'boolean',
              default: true,
              description: 'Автоматично векторизувати документи з FTS-результатів перед семантичним пошуком',
            },
            limit: {
              type: 'number',
              default: 10,
              maximum: 50,
              description: 'Максимальна кількість результатів',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'vectorize_edrsr_results',
        description: `Векторизація конкретних ЄДРСР документів для подальшого семантичного пошуку.

Приймає масив doc_id, перевіряє чи вже є вектори, і створює embeddings для відсутніх.
Використовуйте після search_edrsr_decisions для підготовки результатів до семантичного аналізу.`,
        inputSchema: {
          type: 'object',
          properties: {
            doc_ids: {
              type: 'array',
              items: { type: 'number' },
              description: 'Масив doc_id документів ЄДРСР для векторизації',
              maxItems: 200,
            },
          },
          required: ['doc_ids'],
        },
      },
    ];
  }

  async executeTool(name: string, args: any): Promise<ToolResult | null> {
    switch (name) {
      case 'search_edrsr_fulltext':
        return await this.searchFulltext(args);
      case 'search_edrsr_semantic':
        return await this.searchSemantic(args);
      case 'vectorize_edrsr_results':
        return await this.vectorizeResults(args);
      default:
        return null;
    }
  }

  private async searchFulltext(args: any): Promise<ToolResult> {
    if (!args.query) return this.wrapError('query є обов\'язковим параметром');

    try {
      // Resolve court_name to court_code if needed
      let courtCode = args.court_code;
      if (args.court_name && !courtCode) {
        const courtResult = await this.db.query(
          `SELECT court_code FROM edrsr_courts WHERE LOWER(name) LIKE LOWER($1) LIMIT 1`,
          [`%${args.court_name}%`]
        );
        if (courtResult.rows.length > 0) {
          courtCode = courtResult.rows[0].court_code;
        }
      }

      const result = await this.ftsService.searchFulltext(
        args.query,
        this.db,
        {
          court_code: courtCode,
          judge: args.judge,
          date_from: args.date_from,
          date_to: args.date_to,
          justice_kind: args.justice_kind,
          judgment_code: args.judgment_code,
          category_code: args.category_code,
        },
        args.limit || 20,
        args.offset || 0,
      );

      // Enrich with court/justice names
      const enriched = await this.enrichResults(result.results);

      return this.wrapResponse({
        ...result,
        results: enriched,
      });
    } catch (err: any) {
      logger.error('[EdsrSemanticTools] searchFulltext failed', { error: err.message });
      return this.wrapError(`Помилка FTS пошуку: ${err.message}`);
    }
  }

  private async searchSemantic(args: any): Promise<ToolResult> {
    if (!args.query) return this.wrapError('query є обов\'язковим параметром');

    try {
      // If auto_vectorize, first do FTS search and vectorize results
      if (args.auto_vectorize !== false) {
        const ftsResults = await this.ftsService.searchFulltext(
          args.query,
          this.db,
          {
            court_code: args.court_code,
            justice_kind: args.justice_kind,
            judge: args.judge,
            date_from: args.date_from,
            date_to: args.date_to,
          },
          100, // Get more results for vectorization pool
          0,
        );

        if (ftsResults.results.length > 0) {
          const docIds = ftsResults.results.map(r => r.doc_id);
          await this.vectorizer.ensureVectorized(docIds, this.db);
        }
      }

      // Semantic search in Qdrant
      const results = await this.vectorizer.semanticSearch(
        args.query,
        {
          court_code: args.court_code,
          justice_kind: args.justice_kind,
          judge: args.judge,
          date_from: args.date_from,
          date_to: args.date_to,
        },
        args.limit || 10,
      );

      const stats = await this.vectorizer.getVectorizationStats();

      return this.wrapResponse({
        query: args.query,
        total_vectorized: stats.total_points,
        returned: results.length,
        results: results.map(r => ({
          doc_id: r.doc_id,
          score: Math.round(r.score * 1000) / 1000,
          text_snippet: r.text.slice(0, 500),
          chunk_index: r.chunk_index,
          ...r.metadata,
          external_url: `https://reyestr.court.gov.ua/Review/${r.doc_id}`,
        })),
      });
    } catch (err: any) {
      logger.error('[EdsrSemanticTools] searchSemantic failed', { error: err.message });
      return this.wrapError(`Помилка семантичного пошуку: ${err.message}`);
    }
  }

  private async vectorizeResults(args: any): Promise<ToolResult> {
    if (!args.doc_ids || !Array.isArray(args.doc_ids) || args.doc_ids.length === 0) {
      return this.wrapError('doc_ids має бути непорожнім масивом чисел');
    }

    if (args.doc_ids.length > 200) {
      return this.wrapError('Максимум 200 doc_ids за один запит');
    }

    try {
      const resultMap = await this.vectorizer.ensureVectorized(args.doc_ids, this.db);
      const stats = await this.vectorizer.getVectorizationStats();

      const vectorized: number[] = [];
      const skipped: number[] = [];

      for (const docId of args.doc_ids) {
        if (resultMap.has(docId) && resultMap.get(docId)!.length > 0) {
          vectorized.push(docId);
        } else {
          skipped.push(docId);
        }
      }

      return this.wrapResponse({
        requested: args.doc_ids.length,
        vectorized: vectorized.length,
        skipped: skipped.length,
        skipped_doc_ids: skipped.length > 0 ? skipped : undefined,
        total_collection_points: stats.total_points,
        note: skipped.length > 0
          ? `${skipped.length} документів не мають повного тексту в базі`
          : 'Усі документи успішно векторизовано',
      });
    } catch (err: any) {
      logger.error('[EdsrSemanticTools] vectorizeResults failed', { error: err.message });
      return this.wrapError(`Помилка векторизації: ${err.message}`);
    }
  }

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
      ...row,
      court_name: courtsMap.get(row.court_code) || undefined,
      justice_kind_name: justiceMap.get(row.justice_kind) || undefined,
      judgment_form: judgmentMap.get(row.judgment_code) || undefined,
      external_url: `https://reyestr.court.gov.ua/Review/${row.doc_id}`,
    }));
  }

  private async batchLookup(table: string, idColumn: string, ids: number[]): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    if (ids.length === 0) return map;
    try {
      const result = await this.db.query(
        `SELECT ${idColumn}, name FROM ${table} WHERE ${idColumn} = ANY($1)`,
        [ids]
      );
      for (const row of result.rows) {
        map.set(row[idColumn], row.name);
      }
    } catch { /* Reference table might not exist */ }
    return map;
  }
}

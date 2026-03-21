/**
 * Court Decision Tools - Handlers for court decision retrieval and analysis
 *
 * 7 tools:
 * - get_court_decision
 * - get_case_documents_chain
 * - extract_document_sections
 * - load_full_texts
 * - bulk_ingest_court_decisions
 * - analyze_case_pattern
 * - count_cases_by_party
 */

import { EdsrLocalAdapter } from '../../adapters/edrsr-local-adapter.js';
import { SemanticSectionizer } from '../../services/semantic-sectionizer.js';
import type { IEmbeddingPort } from '../../domain/ports/index.js';
import { LegalPatternStore } from '../../services/legal-pattern-store.js';
import { SectionType } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { BaseToolHandler, ToolDefinition, ToolResult } from '../base-tool-handler.js';
import { generateCaseNumberVariations, extractSnippets } from '../tool-utils.js';

export class CourtDecisionTools extends BaseToolHandler {
  constructor(
    private zoAdapter: EdsrLocalAdapter,
    private zoPracticeAdapter: EdsrLocalAdapter,
    private sectionizer: SemanticSectionizer,
    private embeddingService: IEmbeddingPort,
    private patternStore: LegalPatternStore,
    private db?: any
  ) {
    super();
  }

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'get_court_decision',
        description: `Загрузка полного текста решения/постановления и извлечение секций (FACTS/COURT_REASONING/DECISION)

💰 Примерная стоимость: $0.01-$0.04 USD
Стоимость зависит от глубины анализа (depth). Включает Zakononline API (поиск + HTML парсинг) и опционально OpenAI API для извлечения секций.`,
        inputSchema: {
          type: 'object',
          properties: {
            doc_id: { type: ['string', 'number'] },
            case_number: { type: 'string' },
            depth: { type: 'number', default: 2 },
            reasoning_budget: { type: 'string', enum: ['quick', 'standard', 'deep'], default: 'standard' },
          },
          required: [],
        },
      },
      {
        name: 'get_case_documents_chain',
        description: `Получение всех связанных документов по номеру дела (все инстанции, все решения/постановления/ухвалы)

💰 Примерная стоимость: $0.005-$0.02 USD
Находит ВСЕ судебные документы по номеру дела:
- Решения первой инстанции
- Постановления апелляционной инстанции
- Постановления кассационной инстанции (КЦС/КГС/КАС/ККС ВС)
- Постановления Великой Палаты ВС
- Ухвалы (определения)
- Решения после нового рассмотрения

Возвращает структурированный список всех документов с группировкой по инстанциям и типам.
Используйте этот инструмент когда нужно проанализировать полную историю дела через все судебные инстанции.`,
        inputSchema: {
          type: 'object',
          properties: {
            case_number: {
              type: 'string',
              description: 'Номер дела (например, "123/456/23")'
            },
            include_full_text: {
              type: 'boolean',
              default: false,
              description: 'Включить полный текст документов. Установите true когда пользователь просит "полный текст", "текст решения", анализ конкретного дела или любой глубокий анализ содержания решений. false возвращает только метаданные (суд, дата, тип) без текста.'
            },
            max_docs: {
              type: 'number',
              default: 50,
              description: 'Максимальное количество документов для возврата (1-100)'
            },
            group_by_instance: {
              type: 'boolean',
              default: true,
              description: 'Группировать документы по инстанциям (перша/апеляція/касація)'
            },
          },
          required: ['case_number'],
        },
      },
      {
        name: 'extract_document_sections',
        description: `Извлекает структурированные секции из полного текста документа (ФАКТЫ, ОБОСНУВАННЯ, РІШЕННЯ)

💰 Примерная стоимость: $0.005-$0.05 USD
При use_llm=false: минимальная стоимость (только парсинг HTML). При use_llm=true: включает OpenAI API для точной экстракции секций.`,
        inputSchema: {
          type: 'object',
          properties: {
            doc_id: {
              type: ['string', 'number'],
              description: 'ID документа из Zakononline для загрузки полного текста'
            },
            document_id: {
              type: 'string',
              description: 'Альтернативное название для doc_id'
            },
            text: {
              type: 'string',
              description: 'Полный текст документа (если уже есть)'
            },
            use_llm: { type: 'boolean', default: false },
          },
          required: [],
        },
      },
      {
        name: 'load_full_texts',
        description: `Загружает полные тексты судебных решений и сохраняет в базу данных

💰 Примерная стоимость: зависит от количества документов
~$0.007 за каждый документ (Zakononline web scraping). Проверяет наличие в PostgreSQL и Redis кэше перед загрузкой.`,
        inputSchema: {
          type: 'object',
          properties: {
            doc_ids: {
              type: 'array',
              items: { type: 'number' },
              description: 'Массив ID документов для загрузки (например, [110679112, 110441965])'
            },
            max_docs: {
              type: 'number',
              default: 1000,
              description: 'Максимальное количество документов для загрузки (защита от перегрузки)'
            },
            batch_size: {
              type: 'number',
              default: 100,
              description: 'Размер батча для обработки (по умолчанию 100)'
            }
          },
          required: ['doc_ids'],
        },
      },
      {
        name: 'bulk_ingest_court_decisions',
        description: `Массово находит и загружает судебные решения (пагинация) и индексирует ключевые секции (DECISION + COURT_REASONING)

💰 Примерная стоимость: зависит от количества документов
1) Поиск через Zakononline API (страницы по 1000)
2) Web scraping полного текста для документов, которых нет в кэше/БД
3) Извлечение секций + эмбеддинги + Qdrant

По умолчанию применяет фильтр date_from=today-3y (локально), чтобы не тянуть старые решения.`,
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Поисковый запрос (например: "поновлення строку апеляції несвоєчасне отримання повного тексту")'
            },
            date_from: { type: 'string', description: 'YYYY-MM-DD (по умолчанию today-3y)' },
            date_to: { type: 'string', description: 'YYYY-MM-DD (опционально)' },
            max_docs: {
              type: 'number',
              default: 1000,
              description: 'Максимальное количество уникальных doc_id для загрузки (лимит безопасности)'
            },
            max_pages: {
              type: 'number',
              default: 50,
              description: 'Максимальное число страниц поиска (limit=1000)'
            },
            page_size: {
              type: 'number',
              default: 1000,
              description: 'Размер страницы поиска (max 1000)'
            },
            supreme_court_hint: {
              type: 'boolean',
              default: false,
              description: 'Если true - добавляет в поисковую строку подсказку для ВС (Верховн/КЦС/КГС/КАС/ККС/Велика палата). По умолчанию false для максимального охвата.'
            }
          },
          required: ['query'],
        },
      },
      {
        name: 'analyze_case_pattern',
        description: `Анализирует паттерны судебной практики: аргументы, риски, статистика исходов

💰 Примерная стоимость: $0.02-$0.08 USD
Анализ существующих дел в базе данных. Включает OpenAI API (анализ паттернов) и доступ к PostgreSQL.`,
        inputSchema: {
          type: 'object',
          properties: {
            intent: { type: 'string' },
            case_ids: { type: 'array', items: { type: 'string' } },
          },
          required: ['intent'],
        },
      },
      {
        name: 'count_cases_by_party',
        description: `Подсчитывает точное количество судебных дел по названию стороны (истец/ответчик)

💰 Примерная стоимость: зависит от количества результатов
Использует пагинацию через API Zakononline для точного подсчёта всех дел. Стоимость ~$0.007 за каждую страницу (1000 дел).`,
        inputSchema: {
          type: 'object',
          properties: {
            party_name: {
              type: 'string',
              description: 'Название компании или ФИО (например, "Фінансова компанія Фангарант груп")'
            },
            party_type: {
              type: 'string',
              enum: ['plaintiff', 'defendant', 'any'],
              default: 'any',
              description: 'Тип стороны: истец (plaintiff), ответчик (defendant), или любая (any)'
            },
            date_from: {
              type: 'string',
              description: 'Дата начала периода поиска (формат: YYYY-MM-DD)'
            },
            date_to: {
              type: 'string',
              description: 'Дата окончания периода поиска (формат: YYYY-MM-DD)'
            },
            return_cases: {
              type: 'boolean',
              default: false,
              description: 'Вернуть список дел вместе с подсчётом'
            },
            max_cases_to_return: {
              type: 'number',
              default: 100,
              description: 'Максимальное количество дел для возврата в списке (по умолчанию 100)'
            }
          },
          required: ['party_name'],
        },
      },
    ];
  }

  async executeTool(name: string, args: any): Promise<ToolResult | null> {
    switch (name) {
      case 'get_court_decision':
        return await this.getCourtDecision(args);
      case 'get_case_documents_chain':
        return await this.getCaseDocumentsChain(args);
      case 'extract_document_sections':
        return await this.extractDocumentSections(args);
      case 'load_full_texts':
        return await this.loadFullTexts(args);
      case 'bulk_ingest_court_decisions':
        return await this.bulkIngestCourtDecisions(args);
      case 'analyze_case_pattern':
        return await this.analyzeCasePattern(args);
      case 'count_cases_by_party':
        return await this.countCasesByParty(args);
      default:
        return null;
    }
  }

  private async getCourtDecision(args: any): Promise<ToolResult> {
    const docIdRaw = args.doc_id ?? args.document_id ?? args.case_id;
    const caseNumber = typeof args.case_number === 'string' ? args.case_number.trim() : '';
    const depth = Math.min(5, Math.max(1, Number(args.depth || 2)));
    const budget = args.reasoning_budget || 'standard';

    logger.info('[MCP Tool] get_court_decision started', {
      docId: docIdRaw,
      caseNumber,
      depth,
      budget
    });

    let docId: number | null = null;
    if (docIdRaw !== undefined && docIdRaw !== null && String(docIdRaw).trim().length > 0) {
      const n = Number(docIdRaw);
      if (!Number.isNaN(n) && Number.isFinite(n)) docId = n;
    }

    if (!docId && !caseNumber) {
      throw new Error('Provide doc_id (preferred) or case_number');
    }

    if (!this.db) {
      return this.wrapError('Database not configured');
    }

    let row: any = null;

    if (docId) {
      const result = await this.db.query(`
        SELECT
          d.doc_id, d.cause_num, d.judge, d.court_code, d.justice_kind,
          d.judgment_code, d.category_code, d.adjudication_date, d.receipt_date,
          d.doc_url, d.status, d.date_publ,
          f.full_text
        FROM edrsr_documents d
        LEFT JOIN edrsr_fulltext f ON f.doc_id = d.doc_id
        WHERE d.doc_id = $1
      `, [docId]);

      if (result.rows.length > 0) {
        row = result.rows[0];
      } else {
        // Try fulltext-only
        const ftResult = await this.db.query(
          `SELECT doc_id, full_text FROM edrsr_fulltext WHERE doc_id = $1`, [docId]
        );
        if (ftResult.rows.length > 0) {
          row = { doc_id: docId, full_text: ftResult.rows[0].full_text };
        }
      }
    } else if (caseNumber) {
      // Find most recent decision for this case number
      const result = await this.db.query(`
        SELECT
          d.doc_id, d.cause_num, d.judge, d.court_code, d.justice_kind,
          d.judgment_code, d.category_code, d.adjudication_date, d.receipt_date,
          d.doc_url, d.status, d.date_publ,
          f.full_text
        FROM edrsr_documents d
        LEFT JOIN edrsr_fulltext f ON f.doc_id = d.doc_id
        WHERE d.cause_num = $1
        ORDER BY d.adjudication_date DESC NULLS LAST
        LIMIT 1
      `, [caseNumber]);

      if (result.rows.length > 0) {
        row = result.rows[0];
      }
    }

    if (!row) {
      return this.wrapError(`Рішення не знайдено в ЄДРСР (doc_id=${docId || 'N/A'}, cause_num=${caseNumber || 'N/A'})`);
    }

    // Enrich with court/judge names
    const courtName = row.court_code ? await this.lookupName('edrsr_courts', 'court_code', row.court_code) : null;
    const judgmentForm = row.judgment_code ? await this.lookupName('edrsr_judgment_forms', 'judgment_code', row.judgment_code) : null;

    const fullText = row.full_text || '';
    const url = `https://reyestr.court.gov.ua/Review/${row.doc_id}`;

    const extractedSections = fullText
      ? await this.sectionizer.extractSections(fullText, budget === 'deep')
      : [];

    const sections = Array.isArray(extractedSections)
      ? extractedSections
          .filter((s: any) => s && typeof s.text === 'string')
          .slice(0, 10)
          .map((s: any) => ({
            type: s.type,
            text: s.text,
          }))
      : [];

    const payload: any = {
      doc_id: row.doc_id,
      case_number: row.cause_num || caseNumber || undefined,
      judge: row.judge || undefined,
      court_name: courtName || undefined,
      judgment_form: judgmentForm || undefined,
      adjudication_date: row.adjudication_date || undefined,
      url,
      depth,
      sections: sections.slice(0, depth),
      full_text: fullText || undefined,
      full_text_length: fullText.length,
    };

    return this.wrapResponse(payload);
  }

  private async lookupName(table: string, idColumn: string, id: number): Promise<string | null> {
    if (!this.db) return null;
    try {
      const result = await this.db.query(`SELECT name FROM ${table} WHERE ${idColumn} = $1 LIMIT 1`, [id]);
      return result.rows.length > 0 ? result.rows[0].name : null;
    } catch {
      return null;
    }
  }

  private async getCaseDocumentsChain(args: any): Promise<ToolResult> {
    const caseNumber = typeof args.case_number === 'string' ? args.case_number.trim() : '';
    const includeFullText = args.include_full_text !== false;
    const maxDocs = Math.min(100, Math.max(1, Number(args.max_docs || 50)));
    const groupByInstance = args.group_by_instance !== false;

    if (!caseNumber) {
      throw new Error('case_number parameter is required');
    }

    if (!this.db) {
      throw new Error('Database connection not available for get_case_documents_chain');
    }

    logger.info('[MCP Tool] get_case_documents_chain started', {
      caseNumber,
      includeFullText,
      maxDocs,
      groupByInstance
    });

    const caseVariations = generateCaseNumberVariations(caseNumber);
    logger.info('Generated case number variations', { variations: caseVariations });

    // Query edrsr_documents directly with all case number variations
    const fulltextJoin = includeFullText
      ? 'LEFT JOIN edrsr_fulltext f ON f.doc_id = d.doc_id'
      : '';
    const fulltextField = includeFullText
      ? ', f.full_text'
      : '';

    const sql = `
      SELECT d.doc_id, d.cause_num, d.judge, d.court_code, d.justice_kind,
             d.judgment_code, d.category_code, d.adjudication_date, d.receipt_date,
             d.doc_url, d.status, d.date_publ,
             c.name AS court_name, c.instance_code
             ${fulltextField}
      FROM edrsr_documents d
      LEFT JOIN edrsr_courts c ON c.court_code = d.court_code
      ${fulltextJoin}
      WHERE d.cause_num = ANY($1)
      ORDER BY d.adjudication_date ASC NULLS LAST
      LIMIT $2
    `;

    const result = await this.db.query(sql, [caseVariations, maxDocs]);
    const rows = result.rows || [];

    logger.info('[MCP Tool] get_case_documents_chain DB result', {
      caseNumber,
      variationsCount: caseVariations.length,
      rowsFound: rows.length
    });

    if (rows.length === 0) {
      return this.wrapResponse({
        case_number: caseNumber,
        total_documents: 0,
        documents: [],
        search_stats: { variations_tried: caseVariations },
        message: `Документів не знайдено за номером справи: ${caseNumber} (перевірено варіації: ${caseVariations.join(', ')})`,
      });
    }

    // Batch lookup judgment form names
    const judgmentCodes = new Set<number>();
    for (const row of rows) {
      if (row.judgment_code != null) judgmentCodes.add(row.judgment_code);
    }
    const judgmentMap = new Map<number, string>();
    if (judgmentCodes.size > 0) {
      try {
        const jfResult = await this.db.query(
          'SELECT judgment_code, name FROM edrsr_judgment_forms WHERE judgment_code = ANY($1)',
          [Array.from(judgmentCodes)]
        );
        for (const r of jfResult.rows) {
          judgmentMap.set(r.judgment_code, r.name);
        }
      } catch { /* non-critical */ }
    }

    const classifyInstance = (row: any): string => {
      const courtName = (row.court_name || '').toLowerCase();
      if (courtName.includes('велика палата')) return 'Велика Палата ВС';
      if (row.instance_code === 1) {
        if (courtName.includes('касаційний цивільний')) return 'Касація (КЦС ВС)';
        if (courtName.includes('касаційний господарський')) return 'Касація (КГС ВС)';
        if (courtName.includes('касаційний адміністративний')) return 'Касація (КАС ВС)';
        if (courtName.includes('касаційний кримінальний')) return 'Касація (ККС ВС)';
        return 'Касація';
      }
      if (row.instance_code === 2) return 'Апеляція';
      if (row.instance_code === 3) return 'Перша інстанція';
      return 'Невідомо';
    };

    const mappedDocs = rows.map((row: any) => ({
      doc_id: row.doc_id,
      case_number: row.cause_num || caseNumber,
      document_type: judgmentMap.get(row.judgment_code) || 'Невідомо',
      instance: classifyInstance(row),
      court: row.court_name || null,
      judge: row.judge,
      date: row.adjudication_date,
      url: `https://reyestr.court.gov.ua/Review/${row.doc_id}`,
      ...(includeFullText && row.full_text ? { full_text: row.full_text } : {}),
    }));

    let groupedDocs: any = null;
    if (groupByInstance) {
      groupedDocs = {
        'Перша інстанція': [] as any[],
        'Апеляція': [] as any[],
        'Касація': [] as any[],
        'Велика Палата ВС': [] as any[],
        'Невідомо': [] as any[],
      };
      for (const doc of mappedDocs) {
        const instance = doc.instance || 'Невідомо';
        if (instance.startsWith('Касація')) {
          if (!groupedDocs['Касація']) groupedDocs['Касація'] = [];
          groupedDocs['Касація'].push(doc);
        } else if (groupedDocs[instance]) {
          groupedDocs[instance].push(doc);
        } else {
          groupedDocs['Невідомо'].push(doc);
        }
      }
      Object.keys(groupedDocs).forEach(key => {
        if (groupedDocs[key].length === 0) delete groupedDocs[key];
      });
    }

    const payload: any = {
      case_number: caseNumber,
      total_documents: mappedDocs.length,
      documents: groupByInstance ? undefined : mappedDocs,
      grouped_documents: groupByInstance ? groupedDocs : undefined,
      search_stats: {
        variations_tried: caseVariations,
        source: 'edrsr_documents',
      },
      summary: {
        instances: {
          first_instance: mappedDocs.filter((d: any) => d.instance === 'Перша інстанція').length,
          appeal: mappedDocs.filter((d: any) => d.instance === 'Апеляція').length,
          cassation: mappedDocs.filter((d: any) => d.instance.includes('Касація')).length,
          grand_chamber: mappedDocs.filter((d: any) => d.instance === 'Велика Палата ВС').length,
        },
        document_types: {
          decisions: mappedDocs.filter((d: any) => d.document_type === 'Рішення' || d.document_type === 'Вирок').length,
          rulings: mappedDocs.filter((d: any) => d.document_type === 'Постанова').length,
          orders: mappedDocs.filter((d: any) => d.document_type.includes('Ухвала')).length,
        },
      },
    };

    return this.wrapResponse(payload);
  }

  private async extractDocumentSections(args: any): Promise<ToolResult> {
    let text = args.text;
    const docId = args.doc_id || args.document_id;

    if (!text && docId) {
      logger.info('Fetching document by doc_id', { docId });
      try {
        const fullTextData = await this.zoAdapter.getDocumentFullText(docId);
        if (fullTextData && fullTextData.text) {
          text = fullTextData.text;
        } else {
          throw new Error(`Failed to load document ${docId}: no text returned`);
        }
      } catch (error: any) {
        throw new Error(`Failed to fetch document ${docId}: ${error.message}`);
      }
    }

    if (!text) {
      throw new Error('Either "text" or "doc_id"/"document_id" must be provided');
    }

    const sections = await this.sectionizer.extractSections(text, args.use_llm || false);
    return this.wrapResponse({ sections });
  }

  private async loadFullTexts(args: any): Promise<ToolResult> {
    const docIds: number[] = args.doc_ids || [];
    const maxDocs = args.max_docs || 1000;

    if (!docIds || docIds.length === 0) {
      throw new Error('doc_ids parameter is required and must be a non-empty array');
    }

    const uniqueDocIds = Array.from(new Set(docIds));
    const duplicatesRemoved = docIds.length - uniqueDocIds.length;

    if (duplicatesRemoved > 0) {
      logger.warn('Removed duplicate doc_ids', {
        totalProvided: docIds.length,
        uniqueCount: uniqueDocIds.length,
        duplicatesRemoved
      });
    }

    const startTime = Date.now();
    const docs = uniqueDocIds.slice(0, maxDocs).map(docId => ({ doc_id: docId }));
    await this.zoAdapter.saveDocumentsToDatabase(docs, maxDocs);
    const timeTaken = Date.now() - startTime;
    const estimatedCost = docs.length * 0.00714;

    const result: any = {
      requested_docs: docIds.length,
      unique_docs: uniqueDocIds.length,
      duplicates_removed: duplicatesRemoved,
      processed_docs: docs.length,
      limited_to: maxDocs,
      time_taken_ms: timeTaken,
      estimated_cost_usd: parseFloat(estimatedCost.toFixed(6)),
      note: 'Документы проверены на наличие в PostgreSQL и Redis кэше перед загрузкой. Загружены только отсутствующие документы.',
    };

    if (duplicatesRemoved > 0) {
      result.deduplication_note = `Обнаружено и удалено ${duplicatesRemoved} дубликатов doc_id из входного списка`;
    }
    if (uniqueDocIds.length > maxDocs) {
      result.warning = `Запрошено ${uniqueDocIds.length} уникальных документов, но обработано только ${maxDocs} из-за лимита безопасности`;
    }

    return this.wrapResponse(result);
  }

  private async bulkIngestCourtDecisions(args: any): Promise<ToolResult> {
    const query = String(args.query || '').trim();
    if (!query) throw new Error('query parameter is required');

    const defaultDateFrom = (() => {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 3);
      return d.toISOString().slice(0, 10);
    })();

    const dateFrom = args.date_from || defaultDateFrom;
    const dateTo = args.date_to;
    const maxDocs = Number(args.max_docs || 1000);
    const maxPages = Number(args.max_pages || 50);
    const pageSize = Math.min(1000, Math.max(1, Number(args.page_size || 1000)));
    const supremeCourtHint = args.supreme_court_hint === true;

    const scHints = supremeCourtHint
      ? ' Верховн КЦС КГС КАС ККС "Велика палата" "ВП ВС"'
      : '';
    const searchQuery = `${query}${scHints}`.trim();

    const startTime = Date.now();
    const seenDocIds = new Set<number>();
    let pagesFetched = 0;
    let offset = 0;
    let emptyPages = 0;

    while (pagesFetched < maxPages && seenDocIds.size < maxDocs) {
      const searchParams: any = {
        meta: { search: searchQuery },
        limit: pageSize,
        offset,
      };

      const rawResponse = await this.zoAdapter.searchCourtDecisions(searchParams);
      pagesFetched++;

      // Handle both array and { data: [...] } response formats
      const responseData = Array.isArray(rawResponse)
        ? rawResponse
        : (rawResponse?.data && Array.isArray(rawResponse.data) ? rawResponse.data : []);

      if (responseData.length === 0) {
        emptyPages++;
        if (emptyPages >= 2) break; // Stop after 2 consecutive empty pages
        offset += pageSize;
        continue;
      }
      emptyPages = 0;

      const filtered = responseData.filter((doc: any) => {
        if (!doc?.doc_id) return false;
        const docDate = doc.adjudication_date ? new Date(doc.adjudication_date) : null;
        if (!docDate) return false;
        if (dateFrom && docDate < new Date(dateFrom)) return false;
        if (dateTo && docDate > new Date(dateTo)) return false;
        return true;
      });

      for (const doc of filtered) {
        if (typeof doc.doc_id !== 'number') continue;
        if (seenDocIds.size >= maxDocs) break;
        seenDocIds.add(doc.doc_id);
      }

      if (responseData.length < pageSize) break;
      offset += pageSize;
    }

    const docIds = Array.from(seenDocIds);
    const docs = docIds.map((docId) => ({ doc_id: docId }));
    await this.zoAdapter.saveDocumentsToDatabase(docs, maxDocs);

    const timeTaken = Date.now() - startTime;
    const costEstimateSearchUsd = pagesFetched * 0.00714;
    const costEstimateScrapeMaxUsd = docIds.length * 0.00714;

    return this.wrapResponse({
      query,
      search_query_used: searchQuery,
      date_from: dateFrom,
      ...(dateTo ? { date_to: dateTo } : {}),
      pages_fetched: pagesFetched,
      unique_doc_ids_collected: docIds.length,
      max_docs: maxDocs,
      max_pages: maxPages,
      time_taken_ms: timeTaken,
      cost_estimate_usd: {
        search_api: parseFloat(costEstimateSearchUsd.toFixed(6)),
        scrape_max: parseFloat(costEstimateScrapeMaxUsd.toFixed(6)),
      },
      note: 'Далее: документы будут сохранены в PostgreSQL, секции извлечены, DECISION+COURT_REASONING проиндексированы в Qdrant. Реальная стоимость ниже за счет кэша/уже загруженных документов.',
    });
  }

  private async analyzeCasePattern(args: any): Promise<ToolResult> {
    const patterns = await this.patternStore.findPatterns(args.intent);

    if (args.case_ids && args.case_ids.length > 0) {
      const newPattern = await this.patternStore.extractPatterns(args.case_ids, args.intent);
      if (newPattern) {
        await this.patternStore.savePattern(newPattern);
        patterns.unshift(newPattern);
      }
    }

    return this.wrapResponse({ patterns });
  }

  private async countCasesByParty(args: any): Promise<ToolResult> {
    const partyName = args.party_name;
    const partyType = args.party_type || 'any';
    const returnCases = args.return_cases || false;
    const maxCasesToReturn = args.max_cases_to_return || 100;

    let searchQuery = partyName;
    if (partyType === 'plaintiff') searchQuery = `позивач ${partyName}`;
    else if (partyType === 'defendant') searchQuery = `відповідач ${partyName}`;

    const startTime = Date.now();
    const maxApiLimit = 1000;
    let offset = 0;
    let totalCount = 0;
    let pagesFetched = 0;
    let hasMore = true;
    const allCases: any[] = [];
    const seenDocIds = new Set<number>();
    const SAFETY_LIMIT = 100000;
    const MAX_PAGES_WITH_DATE_FILTER = 100;
    const hasDateFilter = !!(args.date_from || args.date_to);
    let reachedPageLimit = false;

    while (hasMore && totalCount < SAFETY_LIMIT) {
      if (hasDateFilter && pagesFetched >= MAX_PAGES_WITH_DATE_FILTER) {
        reachedPageLimit = true;
        break;
      }

      const searchParams: any = {
        meta: { search: searchQuery },
        limit: maxApiLimit,
        offset,
      };

      const response = await this.zoAdapter.searchCourtDecisions(searchParams);
      pagesFetched++;

      if (Array.isArray(response) && response.length > 0) {
        let filteredResponse: any[] = response;
        if (args.date_from || args.date_to) {
          filteredResponse = response.filter(doc => {
            const docDate = doc.adjudication_date ? new Date(doc.adjudication_date) : null;
            if (!docDate) return false;
            if (args.date_from && docDate < new Date(args.date_from)) return false;
            if (args.date_to && docDate > new Date(args.date_to)) return false;
            return true;
          });
        }

        const uniqueResults = filteredResponse.filter(doc => {
          if (!doc.doc_id) return false;
          if (seenDocIds.has(doc.doc_id)) return false;
          seenDocIds.add(doc.doc_id);
          return true;
        });

        if (uniqueResults.length === 0 && filteredResponse.length > 0) {
          hasMore = false;
          break;
        }

        totalCount += uniqueResults.length;

        if (returnCases && allCases.length < maxCasesToReturn) {
          const casesToAdd = uniqueResults.slice(0, maxCasesToReturn - allCases.length);
          allCases.push(...casesToAdd.map(doc => ({
            cause_num: doc.cause_num,
            doc_id: doc.doc_id,
            title: doc.title,
            resolution: doc.resolution,
            judge: doc.judge,
            court_code: doc.court_code,
            adjudication_date: doc.adjudication_date,
            url: `https://zakononline.ua/court-decisions/show/${doc.doc_id}`,
          })));
        }

        if (response.length < maxApiLimit) {
          hasMore = false;
        } else {
          offset += maxApiLimit;
        }
      } else {
        hasMore = false;
      }
    }

    const timeTaken = Date.now() - startTime;
    const costEstimate = pagesFetched * 0.00714;

    const result: any = {
      party_name: partyName,
      party_type: partyType,
      search_query: searchQuery,
      total_unique_cases: totalCount,
      unique_doc_ids_found: seenDocIds.size,
      pages_fetched: pagesFetched,
      time_taken_ms: timeTaken,
      cost_estimate_usd: parseFloat(costEstimate.toFixed(6)),
    };

    if (args.date_from) result.date_from = args.date_from;
    if (args.date_to) result.date_to = args.date_to;
    if (args.date_from || args.date_to) {
      result.filtering_method = 'local';
      result.note = 'Фільтрація по датах виконана локально (API-фільтр надто повільний)';
    }
    if (reachedPageLimit) {
      result.warning = `Досягнуто ліміт у ${MAX_PAGES_WITH_DATE_FILTER} сторінок. Просканировано ${pagesFetched * maxApiLimit} справ, знайдено ${totalCount}.`;
      result.scanned_documents = pagesFetched * maxApiLimit;
    } else if (totalCount >= SAFETY_LIMIT) {
      result.warning = `Досягнуто ліміт безпеки у ${SAFETY_LIMIT} справ. Реальна кількість може бути більшою.`;
    }
    if (returnCases) {
      result.cases = allCases;
      result.cases_returned = allCases.length;
    }

    return this.wrapResponse(result);
  }
}

/**
 * Court Session Tools - Search and bulk ingest court sessions from ZakonOnline
 *
 * 2 tools:
 * - search_court_sessions
 * - bulk_ingest_court_sessions
 */

import { EdsrLocalAdapter } from '../../adapters/edrsr-local-adapter.js';
import { logger } from '../../utils/logger.js';
import { BaseToolHandler, ToolDefinition, ToolResult } from '../base-tool-handler.js';

export class CourtSessionTools extends BaseToolHandler {
  constructor(
    private zoSessionsAdapter: EdsrLocalAdapter,
    private db: any
  ) {
    super();
  }

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'search_court_sessions',
        annotations: { title: 'Судові засідання', readOnlyHint: true },
        description: `Пошук судових засідань за номером справи, учасниками, суддею або назвою суду

💰 Примерная стоимость: $0.001-$0.01 USD
Пошук запланованих та завершених судових засідань. Підтримує пошук по API (query) та локальній базі (структуровані фільтри).
Джерела: source=api (ZakonOnline API), source=opendata (481K засідань з відкритих даних), source=all (обидва).`,
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Пошуковий запит (номер справи або ім\'я учасника). Обов\'язковий для source=api.',
            },
            source: {
              type: 'string',
              enum: ['api', 'opendata', 'all'],
              default: 'all',
              description: 'Джерело: api (ZakonOnline), opendata (локальна БД відкритих даних), all (обидва)',
            },
            target: {
              type: 'string',
              enum: ['cause_num', 'case_involved'],
              default: 'case_involved',
              description: 'Тип пошуку для API: cause_num (номер справи) або case_involved (учасники)',
            },
            case_number: {
              type: 'string',
              description: 'Номер справи (для opendata пошуку)',
            },
            judge: {
              type: 'string',
              description: 'Прізвище судді (для opendata пошуку)',
            },
            participant: {
              type: 'string',
              description: 'Прізвище або назва учасника справи (для opendata пошуку)',
            },
            court_name: {
              type: 'string',
              description: 'Назва суду (для opendata пошуку)',
            },
            date_from: {
              type: 'string',
              description: 'Дата від (YYYY-MM-DD)',
            },
            date_to: {
              type: 'string',
              description: 'Дата до (YYYY-MM-DD)',
            },
            limit: {
              type: 'number',
              default: 50,
              maximum: 1000,
              description: 'Максимальна кількість результатів',
            },
          },
        },
      },
      {
        name: 'bulk_ingest_court_sessions',
        annotations: { title: 'Масовий імпорт засідань' },
        description: `Масове завантаження судових засідань в локальну базу

💰 Примерная стоимость: $0.01-$0.05 USD
Завантажує метадані судових засідань з ZakonOnline API і зберігає в PostgreSQL.
Не потребує скрапінгу HTML — тільки метадані через API.`,
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Пошуковий запит',
            },
            date_from: {
              type: 'string',
              description: 'Дата від (YYYY-MM-DD). За замовчуванням: рік тому',
            },
            date_to: {
              type: 'string',
              description: 'Дата до (YYYY-MM-DD)',
            },
            max_sessions: {
              type: 'number',
              default: 5000,
              description: 'Максимальна кількість засідань для завантаження',
            },
            max_pages: {
              type: 'number',
              default: 50,
              description: 'Максимальна кількість сторінок API',
            },
          },
          required: ['query'],
        },
      },
    ];
  }

  async executeTool(name: string, args: any): Promise<ToolResult | null> {
    switch (name) {
      case 'search_court_sessions':
      case 'search_court_schedule': // backward-compat alias
        return this.searchCourtSessions(args);
      case 'bulk_ingest_court_sessions':
        return this.bulkIngestCourtSessions(args);
      default:
        return null;
    }
  }

  private async searchCourtSessions(args: any): Promise<ToolResult> {
    const query = String(args.query || '').trim();
    const source = String(args.source || 'all').trim();
    const limit = Math.min(1000, Math.max(1, Number(args.limit || 50)));

    const apiResults: any[] = [];
    const opendataResults: any[] = [];

    // Source: API (ZakonOnline)
    if ((source === 'api' || source === 'all') && query) {
      const target = args.target || 'case_involved';
      const searchParams: any = {
        meta: { search: query, target },
        limit,
        offset: 0,
      };
      if (args.date_from) searchParams.date_session_from = args.date_from;
      if (args.date_to) searchParams.date_session_to = args.date_to;

      const rawResponse = await this.zoSessionsAdapter.searchCourtDecisions(searchParams);
      const responseData = Array.isArray(rawResponse)
        ? rawResponse
        : (rawResponse?.data && Array.isArray(rawResponse.data) ? rawResponse.data : []);

      // Save to local DB for caching
      for (const session of responseData) {
        try { await this.saveSessionToDb(session); } catch (_) { /* skip duplicates */ }
      }
      apiResults.push(...responseData);
    }

    // Source: OpenData (local PostgreSQL)
    if (source === 'opendata' || source === 'all') {
      const odResults = await this.searchScheduleFromOpendata(args, limit);
      opendataResults.push(...odResults);
    }

    const totalFound = apiResults.length + opendataResults.length;
    if (totalFound === 0) {
      if (!query && source !== 'opendata') {
        return this.wrapResponse('Вкажіть query для пошуку через API або використайте source=opendata з фільтрами (case_number, judge, participant, court_name)');
      }
      return this.wrapResponse({
        query: query || undefined,
        sessions_found: 0,
        message: 'Судових засідань не знайдено за вашим запитом',
      });
    }

    const response: any = {
      query: query || undefined,
      source,
      sessions_found: totalFound,
    };

    if (apiResults.length > 0) {
      response.api_results = apiResults.slice(0, 20);
      if (apiResults.length > 20) response.api_total = apiResults.length;
    }
    if (opendataResults.length > 0) {
      response.opendata_results = opendataResults.slice(0, limit);
    }

    return this.wrapResponse(response);
  }

  private async searchScheduleFromOpendata(args: any, limit: number): Promise<any[]> {
    const { case_number, judge, participant, court_name, date_from, date_to, query } = args;

    const conditions: string[] = [];
    const values: any[] = [];
    let pi = 1;

    if (case_number) {
      conditions.push(`case_number = $${pi}`);
      values.push(case_number);
      pi++;
    }
    if (judge) {
      conditions.push(`judges ILIKE $${pi}`);
      values.push(`%${judge}%`);
      pi++;
    }
    if (participant) {
      conditions.push(`case_involved ILIKE $${pi}`);
      values.push(`%${participant}%`);
      pi++;
    } else if (query && !case_number) {
      // Use query as participant search fallback for opendata
      conditions.push(`case_involved ILIKE $${pi}`);
      values.push(`%${query}%`);
      pi++;
    }
    if (court_name) {
      conditions.push(`court_name ILIKE $${pi}`);
      values.push(`%${court_name}%`);
      pi++;
    }
    if (date_from) {
      conditions.push(`hearing_date >= $${pi}`);
      values.push(date_from);
      pi++;
    }
    if (date_to) {
      conditions.push(`hearing_date <= $${pi}`);
      values.push(date_to);
      pi++;
    }

    if (conditions.length === 0) return [];

    values.push(Math.min(Number(limit) || 50, 100));

    const sql = `SELECT hearing_date, court_name, case_number, judges, court_room, case_involved, case_description
      FROM opendata_court_schedule
      WHERE ${conditions.join(' AND ')}
      ORDER BY hearing_date DESC
      LIMIT $${pi}`;

    try {
      const result = await this.db.query(sql, values);
      return result.rows;
    } catch (error: any) {
      logger.error('search_court_schedule opendata error', { error: error.message });
      return [];
    }
  }

  private async bulkIngestCourtSessions(args: any): Promise<ToolResult> {
    const query = String(args.query || '').trim();
    if (!query) throw new Error('query parameter is required');

    const defaultDateFrom = (() => {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 1);
      return d.toISOString().slice(0, 10);
    })();

    const dateFrom = args.date_from || defaultDateFrom;
    const dateTo = args.date_to;
    const maxSessions = Number(args.max_sessions || 5000);
    const maxPages = Number(args.max_pages || 50);
    const pageSize = 1000;

    const startTime = Date.now();
    const seenIds = new Set<string>();
    let pagesFetched = 0;
    let offset = 0;
    let emptyPages = 0;
    let savedCount = 0;

    while (pagesFetched < maxPages && seenIds.size < maxSessions) {
      const searchParams: any = {
        meta: { search: query },
        limit: pageSize,
        offset,
      };

      if (dateFrom) searchParams.date_session_from = dateFrom;
      if (dateTo) searchParams.date_session_to = dateTo;

      const rawResponse = await this.zoSessionsAdapter.searchCourtDecisions(searchParams);
      pagesFetched++;

      const responseData = Array.isArray(rawResponse)
        ? rawResponse
        : (rawResponse?.data && Array.isArray(rawResponse.data) ? rawResponse.data : []);

      if (responseData.length === 0) {
        emptyPages++;
        if (emptyPages >= 2) break;
        offset += pageSize;
        continue;
      }
      emptyPages = 0;

      // Filter by date locally
      const filtered = responseData.filter((session: any) => {
        const sessionDate = session.date_session ? new Date(session.date_session) : null;
        if (!sessionDate) return true; // Include sessions without date
        if (dateFrom && sessionDate < new Date(dateFrom)) return false;
        if (dateTo && sessionDate > new Date(dateTo)) return false;
        return true;
      });

      for (const session of filtered) {
        const sessionId = String(session.doc_id || session.id || session.session_id || '');
        if (!sessionId || seenIds.has(sessionId)) continue;
        if (seenIds.size >= maxSessions) break;

        seenIds.add(sessionId);
        try {
          await this.saveSessionToDb(session);
          savedCount++;
        } catch (err) {
          // Skip errors silently
        }
      }

      if (responseData.length < pageSize) break;
      offset += pageSize;
    }

    const timeTaken = Date.now() - startTime;
    const costEstimate = pagesFetched * 0.00714;

    return this.wrapResponse({
      query,
      date_from: dateFrom,
      ...(dateTo ? { date_to: dateTo } : {}),
      pages_fetched: pagesFetched,
      unique_sessions_found: seenIds.size,
      sessions_saved: savedCount,
      max_sessions: maxSessions,
      time_taken_ms: timeTaken,
      cost_estimate_usd: parseFloat(costEstimate.toFixed(6)),
      note: 'Метадані засідань збережено в PostgreSQL. Скрапінг HTML не потрібен.',
    });
  }

  private async saveSessionToDb(session: any): Promise<void> {
    const sessionId = String(session.doc_id || session.id || session.session_id || '');
    if (!sessionId) return;

    await this.db.query(
      `INSERT INTO court_sessions (
        zakononline_id, case_number, court_name, judge_name,
        session_date, session_time, session_form, justice_kind,
        involved_parties, session_place, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (zakononline_id) DO UPDATE SET
        case_number = EXCLUDED.case_number,
        court_name = EXCLUDED.court_name,
        judge_name = EXCLUDED.judge_name,
        session_date = EXCLUDED.session_date,
        session_time = EXCLUDED.session_time,
        session_form = EXCLUDED.session_form,
        justice_kind = EXCLUDED.justice_kind,
        involved_parties = EXCLUDED.involved_parties,
        session_place = EXCLUDED.session_place,
        metadata = EXCLUDED.metadata,
        updated_at = CURRENT_TIMESTAMP`,
      [
        sessionId,
        session.cause_num || session.case_number || null,
        session.court_name || session.court || null,
        session.judge || session.judge_name || null,
        session.date_session || null,
        session.time_session || session.session_time || null,
        session.session_form || session.form || null,
        session.justice_kind || session.justice || null,
        session.involved || session.case_involved || session.parties || null,
        session.session_place || session.place || null,
        JSON.stringify(session),
      ]
    );
  }
}

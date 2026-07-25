/**
 * Bill Service
 * CRUD operations for bills (законопроекти) with intelligent PostgreSQL caching (1-day TTL)
 */

import { Database } from '../database/database';
import { logger } from '../utils/logger';
import { RadaAPIAdapter } from '../adapters/rada-api-adapter';
import { v4 as uuidv4 } from 'uuid';
import { Bill, BillSearchParams, BillSearchResult } from '../types';

export class BillService {
  private cacheTTLSeconds: number;

  constructor(
    private db: Database,
    private radaAdapter: RadaAPIAdapter
  ) {
    // Default: 1 day, can be overridden by env
    this.cacheTTLSeconds = parseInt(process.env.CACHE_TTL_BILLS || '86400', 10);
    logger.info('BillService initialized', { cacheTTL: this.cacheTTLSeconds });
  }

  /**
   * Validate date format (YYYY-MM-DD)
   */
  private validateDateFormat(dateString: string): boolean {
    // Check format with regex
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateString)) {
      return false;
    }

    // Check if it's a valid date
    const date = new Date(dateString);
    const timestamp = date.getTime();

    // Check if date is valid (not NaN) and matches the input
    if (isNaN(timestamp)) {
      return false;
    }

    // Verify the date components match (prevents cases like 2024-02-30)
    const [year, month, day] = dateString.split('-').map(Number);
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  /**
   * Get bill by number with cache-first strategy
   */
  async getBillByNumber(
    billNumber: string,
    forceRefresh: boolean = false
  ): Promise<Bill | null> {
    try {
      // Step 1: Check cache if not forcing refresh
      if (!forceRefresh) {
        const cached = await this.getCachedBill(billNumber);
        if (cached) {
          logger.debug('Bill found in cache', { billNumber });
          return cached;
        }
      }

      // Step 2: Fetch from RADA API (get all bills and filter)
      logger.info('Fetching bill from RADA API', { billNumber });
      const allBills = await this.radaAdapter.fetchBills();
      const rawBill = allBills.find(
        (b) => b.number === billNumber || b.number?.replace(/\s/g, '') === billNumber
      );

      if (!rawBill) {
        logger.warn('Bill not found in RADA API', { billNumber });
        return null;
      }

      // Step 3: Transform and upsert to database
      const bill = this.transformRawBill(rawBill);
      await this.upsertBill(bill);

      return bill;
    } catch (error: any) {
      logger.error('Failed to get bill', { billNumber, error: error.message });
      throw error;
    }
  }

  /**
   * Search bills with flexible filters
   */
  async searchBills(params: BillSearchParams): Promise<BillSearchResult> {
    try {
      // Validate date parameters
      if (params.date_from && !this.validateDateFormat(params.date_from)) {
        throw new Error(
          `Invalid date_from format: "${params.date_from}". Expected YYYY-MM-DD (e.g., 2024-01-15)`
        );
      }

      if (params.date_to && !this.validateDateFormat(params.date_to)) {
        throw new Error(
          `Invalid date_to format: "${params.date_to}". Expected YYYY-MM-DD (e.g., 2024-12-31)`
        );
      }

      let query = 'SELECT * FROM bills WHERE 1=1';
      const queryParams: any[] = [];
      let paramIndex = 1;

      // Filter by query (search in title, initiator names, and subject area)
      if (params.query) {
        query += ` AND (title ILIKE $${paramIndex} OR EXISTS (SELECT 1 FROM unnest(initiator_names) AS n WHERE n ILIKE $${paramIndex}) OR subject_area ILIKE $${paramIndex})`;
        queryParams.push(`%${params.query}%`);
        paramIndex++;
      }

      // Filter by status
      if (params.status && params.status !== 'all') {
        query += ` AND status = $${paramIndex}`;
        queryParams.push(params.status);
        paramIndex++;
      }

      // Filter by initiator
      if (params.initiator) {
        query += ` AND ($${paramIndex} = ANY(initiator_names) OR initiator_type ILIKE $${paramIndex})`;
        queryParams.push(params.initiator);
        paramIndex++;
      }

      // Filter by committee
      if (params.committee) {
        query += ` AND (main_committee_id = $${paramIndex} OR main_committee_name ILIKE $${paramIndex + 1})`;
        queryParams.push(params.committee, `%${params.committee}%`);
        paramIndex += 2;
      }

      // Filter by date range
      if (params.date_from) {
        query += ` AND registration_date >= $${paramIndex}`;
        queryParams.push(params.date_from);
        paramIndex++;
      }

      if (params.date_to) {
        query += ` AND registration_date <= $${paramIndex}`;
        queryParams.push(params.date_to);
        paramIndex++;
      }

      // Limit
      const limit = params.limit || 50;
      query += ` ORDER BY registration_date DESC LIMIT ${limit}`;

      const result = await this.db.query(query, queryParams);
      const bills = result.rows as Bill[];

      // If no results and query provided, try fetching fresh data
      if (bills.length === 0 && params.query) {
        logger.info('No cached bills found, fetching from API', { params });
        await this.syncRecentBills();
        // Retry query
        const retryResult = await this.db.query(query, queryParams);
        return {
          bills: retryResult.rows as Bill[],
          total: retryResult.rows.length,
          query: params.query,
          filters: params,
        };
      }

      logger.info('Bills search completed', {
        params,
        resultsCount: bills.length,
      });

      return {
        bills,
        total: bills.length,
        query: params.query,
        filters: params,
      };
    } catch (error: any) {
      logger.error('Failed to search bills', {
        params,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Ukrainian inflectional endings, longest-first. Full-word prefixes break on
   * inflection under the 'simple' FTS config («патентний:*» does not match
   * «патентним»), so Cyrillic tokens are truncated to a stem before `:*`.
   * One suffix is stripped only when the remaining stem keeps >= 4 chars
   * (LEXAI-1819).
   */
  private static readonly UK_SUFFIXES = [
    'ього', 'ьому', 'ами', 'ями', 'ові', 'еві', 'ого', 'ому', 'ими', 'іми',
    'ій', 'ий', 'им', 'ім', 'их', 'іх', 'ої', 'ою', 'ею', 'ах', 'ях',
    'ам', 'ям', 'ів', 'їв', 'ом', 'ем', 'ей',
    'и', 'і', 'ї', 'а', 'я', 'о', 'е', 'у', 'ю', 'ь',
  ];

  private static stemPrefix(token: string): string {
    if (!/^[а-щьюяіїєґ]+$/.test(token)) return token;
    for (const suffix of BillService.UK_SUFFIXES) {
      if (token.length - suffix.length >= 4 && token.endsWith(suffix)) {
        return token.slice(0, token.length - suffix.length);
      }
    }
    return token;
  }

  /**
   * Build a `simple`-config prefix tsquery from free text.
   * The bill_documents FTS indexes use the 'simple' config (no Ukrainian stemmer),
   * so we match on stem prefixes (`патентн:*`) to tolerate inflected forms.
   * Returns '' when the input has no usable tokens.
   */
  static toPrefixTsQuery(input: string, op: '&' | '|' = '&'): string {
    const tokens = (input.match(/[\p{L}\p{N}]+/gu) || [])
      .map(t => t.toLowerCase())
      .filter(t => t.length > 1);
    return tokens.map(t => `${BillService.stemPrefix(t)}:*`).join(` ${op} `);
  }

  /**
   * Search bill supporting documents (rada.bill_documents): ГНЕУ scientific-expert
   * conclusions, committee conclusions, legal-office remarks, etc. Full-text over the
   * verdict summaries (short_review/formal_review/full_text) + bill title, with filters
   * by document kind, bill number, convocation, initiator and registration date.
   */
  async searchBillDocuments(params: {
    query?: string;
    bill_number?: string;
    doc_kind?: 'gneu' | 'committee' | 'legal' | 'all';
    convocation?: number;
    initiator?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
  }): Promise<{ documents: any[]; total: number; relaxed?: boolean }> {
    if (params.date_from && !this.validateDateFormat(params.date_from)) {
      throw new Error(
        `Invalid date_from format: "${params.date_from}". Expected YYYY-MM-DD (e.g., 2024-01-15)`
      );
    }
    if (params.date_to && !this.validateDateFormat(params.date_to)) {
      throw new Error(
        `Invalid date_to format: "${params.date_to}". Expected YYYY-MM-DD (e.g., 2024-12-31)`
      );
    }

    let sql = `
      SELECT doc_id, bill_number, convocation, kind, kind_id,
             registration_date, publish_date,
             short_review, formal_review,
             bill_title, bill_subject, bill_initiators,
             file_url, file_zip_url
      FROM bill_documents
      WHERE 1=1`;
    const queryParams: any[] = [];
    let i = 1;

    // Full-text over verdict summaries + bill title
    let tsqIndex = 0;
    let andTsq = '';
    if (params.query) {
      andTsq = BillService.toPrefixTsQuery(params.query);
      if (andTsq) {
        sql += ` AND (
          to_tsvector('simple', coalesce(short_review,'') || ' ' || coalesce(formal_review,'') || ' ' || coalesce(full_text,'')) @@ to_tsquery('simple', $${i})
          OR to_tsvector('simple', coalesce(bill_title,'')) @@ to_tsquery('simple', $${i})
        )`;
        queryParams.push(andTsq);
        tsqIndex = i;
        i++;
      }
    }

    if (params.bill_number) {
      sql += ` AND bill_number = $${i}`;
      queryParams.push(params.bill_number);
      i++;
    }

    // Document kind filter
    switch (params.doc_kind) {
      case 'gneu':
        sql += ` AND (kind_id = 100 OR kind ILIKE '%науково-експерт%')`;
        break;
      case 'committee':
        sql += ` AND kind ILIKE '%комітет%'`;
        break;
      case 'legal':
        sql += ` AND kind ILIKE '%юридичн%'`;
        break;
      // 'all' or undefined → no kind filter
    }

    if (params.convocation) {
      sql += ` AND convocation = $${i}`;
      queryParams.push(params.convocation);
      i++;
    }

    if (params.initiator) {
      sql += ` AND bill_initiators ILIKE $${i}`;
      queryParams.push(`%${params.initiator}%`);
      i++;
    }

    if (params.date_from) {
      sql += ` AND registration_date >= $${i}`;
      queryParams.push(params.date_from);
      i++;
    }
    if (params.date_to) {
      sql += ` AND registration_date <= $${i}`;
      queryParams.push(params.date_to);
      i++;
    }

    const limit = Math.min(Math.max(params.limit || 20, 1), 100);

    let result = await this.db.query(
      sql + ` ORDER BY registration_date DESC NULLS LAST LIMIT ${limit}`,
      queryParams
    );

    // Strict AND over all tokens makes multi-word natural queries brittle
    // (one unmatched word form → 0 rows). Retry with OR semantics, ranked by
    // relevance so the date ordering doesn't surface loosely-matching noise.
    let relaxed = false;
    if (result.rows.length === 0 && tsqIndex > 0 && andTsq.includes(' & ')) {
      const orParams = [...queryParams];
      orParams[tsqIndex - 1] = BillService.toPrefixTsQuery(params.query!, '|');
      result = await this.db.query(
        sql +
          ` ORDER BY ts_rank(to_tsvector('simple', coalesce(short_review,'') || ' ' || coalesce(formal_review,'') || ' ' || coalesce(bill_title,'')), to_tsquery('simple', $${tsqIndex})) DESC, registration_date DESC NULLS LAST LIMIT ${limit}`,
        orParams
      );
      relaxed = true;
      logger.info('Bill documents search relaxed to OR semantics', {
        query: params.query,
        found: result.rows.length,
      });
    }

    logger.info('Bill documents search completed', {
      query: params.query,
      doc_kind: params.doc_kind,
      found: result.rows.length,
      relaxed,
    });
    return {
      documents: result.rows,
      total: result.rows.length,
      ...(relaxed ? { relaxed: true } : {}),
    };
  }

  /**
   * Sync recent bills (last 30 days)
   */
  async syncRecentBills(convocation: number = 9): Promise<number> {
    try {
      const dateTo = new Date().toISOString().split('T')[0];
      const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      logger.info('Syncing recent bills', { dateFrom, dateTo, convocation });

      const allBills = await this.radaAdapter.fetchBills({
        dateFrom,
        dateTo,
        convocation,
      });

      let syncedCount = 0;

      for (const rawBill of allBills) {
        const bill = this.transformRawBill(rawBill);
        await this.upsertBill(bill);
        syncedCount++;
      }

      logger.info('Bills sync completed', { syncedCount });
      return syncedCount;
    } catch (error: any) {
      logger.error('Failed to sync bills', { error: error.message });
      throw error;
    }
  }

  /**
   * Sync all bills for a convocation (use with caution - can be large)
   */
  async syncAllBills(convocation: number = 9): Promise<number> {
    try {
      logger.info('Syncing all bills', { convocation });

      const allBills = await this.radaAdapter.fetchBills({ convocation });
      let syncedCount = 0;

      for (const rawBill of allBills) {
        const bill = this.transformRawBill(rawBill);
        await this.upsertBill(bill);
        syncedCount++;
      }

      logger.info('All bills sync completed', { convocation, syncedCount });
      return syncedCount;
    } catch (error: any) {
      logger.error('Failed to sync all bills', {
        convocation,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update bill full text
   */
  async updateBillFullText(billNumber: string, fullText: string): Promise<boolean> {
    try {
      const result = await this.db.query(
        `UPDATE bills
         SET full_text = $1, updated_at = NOW()
         WHERE bill_number = $2
         RETURNING id`,
        [fullText, billNumber]
      );

      if (result.rows.length === 0) {
        logger.warn('Bill not found for full text update', { billNumber });
        return false;
      }

      logger.info('Bill full text updated', {
        billNumber,
        textLength: fullText.length,
      });

      return true;
    } catch (error: any) {
      logger.error('Failed to update bill full text', {
        billNumber,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Get cached bill (only if not expired)
   */
  private async getCachedBill(billNumber: string): Promise<Bill | null> {
    try {
      const result = await this.db.query(
        'SELECT * FROM bills WHERE bill_number = $1 AND cache_expires_at > NOW()',
        [billNumber]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0] as Bill;
    } catch (error: any) {
      logger.error('Failed to get cached bill', {
        billNumber,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Upsert bill with new TTL
   */
  private async upsertBill(bill: Bill): Promise<string> {
    try {
      const id = bill.id || uuidv4();
      const cacheExpires = new Date(Date.now() + this.cacheTTLSeconds * 1000);

      const query = `
        INSERT INTO bills (
          id, bill_number, title, registration_date, status, stage,
          initiator_type, initiator_names, initiator_ids,
          main_committee_id, main_committee_name, subject_area, law_articles,
          full_text, explanatory_note, url, metadata,
          cached_at, cache_expires_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9,
          $10, $11, $12, $13,
          $14, $15, $16, $17,
          NOW(), $18, NOW()
        )
        ON CONFLICT (bill_number)
        DO UPDATE SET
          title = EXCLUDED.title,
          registration_date = EXCLUDED.registration_date,
          status = EXCLUDED.status,
          stage = EXCLUDED.stage,
          initiator_type = EXCLUDED.initiator_type,
          initiator_names = EXCLUDED.initiator_names,
          initiator_ids = EXCLUDED.initiator_ids,
          main_committee_id = EXCLUDED.main_committee_id,
          main_committee_name = EXCLUDED.main_committee_name,
          subject_area = EXCLUDED.subject_area,
          law_articles = EXCLUDED.law_articles,
          full_text = COALESCE(EXCLUDED.full_text, bills.full_text),
          explanatory_note = COALESCE(EXCLUDED.explanatory_note, bills.explanatory_note),
          url = EXCLUDED.url,
          metadata = bills.metadata || EXCLUDED.metadata,
          cached_at = NOW(),
          cache_expires_at = EXCLUDED.cache_expires_at,
          updated_at = NOW()
        RETURNING id
      `;

      const result = await this.db.query(query, [
        id,
        bill.bill_number,
        bill.title,
        bill.registration_date || null,
        bill.status || null,
        bill.stage || null,
        bill.initiator_type || null,
        bill.initiator_names || [],
        bill.initiator_ids || [],
        bill.main_committee_id || null,
        bill.main_committee_name || null,
        bill.subject_area || null,
        bill.law_articles || [],
        bill.full_text || null,
        bill.explanatory_note || null,
        bill.url || null,
        JSON.stringify(bill.metadata || {}),
        cacheExpires,
      ]);

      const savedId = result.rows[0].id;

      logger.debug('Bill upserted', {
        bill_number: bill.bill_number,
        id: savedId,
        cacheExpires,
      });

      return savedId;
    } catch (error: any) {
      logger.error('Failed to upsert bill', {
        bill_number: bill.bill_number,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Transform raw RADA API data to Bill type
   */
  private transformRawBill(raw: any): Bill {
    // Parse initiator/subject names
    // API field: "subject" contains initiator (e.g. "Кабінет Міністрів України")
    let initiatorNames: string[] = [];
    let initiatorIds: string[] = [];

    const initiatorSource = raw.subject || raw.initiator;
    if (initiatorSource) {
      if (typeof initiatorSource === 'string') {
        initiatorNames = [initiatorSource];
      } else if (Array.isArray(initiatorSource)) {
        initiatorNames = initiatorSource;
      }
    }

    // API uses "currentPhase_title" for status (e.g. "Закон підписано")
    const status = raw.currentPhase_title || raw.status || null;

    return {
      id: raw.id || uuidv4(),
      bill_number: raw.number || raw.bill_number,
      title: raw.title || raw.name,
      registration_date: raw.registrationDate || raw.reg_date || raw.registration_date || null,
      status,
      stage: raw.stage || null,
      initiator_type: raw.type || raw.initiator_type || null,
      initiator_names: initiatorNames,
      initiator_ids: initiatorIds,
      main_committee_id: raw.committee_id || raw.main_committee_id || null,
      main_committee_name: raw.rubric || raw.committee || raw.main_committee_name || null,
      subject_area: raw.rubric || raw.subject_area || null,
      law_articles: raw.law_articles || [],
      full_text: raw.full_text || null,
      explanatory_note: raw.explanatory_note || null,
      url: raw.url || null,
      metadata: raw,
    };
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<any> {
    try {
      const result = await this.db.query(`
        SELECT
          COUNT(*) as total_bills,
          COUNT(CASE WHEN cache_expires_at > NOW() THEN 1 END) as cached_bills,
          COUNT(CASE WHEN status = 'adopted' THEN 1 END) as adopted_bills,
          COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_bills,
          COUNT(CASE WHEN full_text IS NOT NULL THEN 1 END) as bills_with_text,
          COUNT(DISTINCT main_committee_id) as unique_committees,
          MIN(registration_date) as oldest_bill_date,
          MAX(registration_date) as newest_bill_date
        FROM bills
      `);

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to get bill stats:', error);
      return null;
    }
  }
}

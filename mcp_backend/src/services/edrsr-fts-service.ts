/**
 * EdsrFtsService — Full Text Search over EDRSR court decisions
 *
 * Provides:
 * - searchFulltext()  — FTS query with metadata filters, ranking, and highlighted snippets
 * - indexBatch()      — Background indexing: populates tsv column in batches
 * - getIndexProgress() — Reports indexing progress (total / indexed / remaining)
 *
 * The tsv column uses 'simple' PG text search config (no Ukrainian stemmer in stock PG,
 * but 'simple' tokenizes correctly for Ukrainian text matching).
 *
 * Data is sharded across 4 databases; this service operates on whichever pool it receives.
 * edrsr_documents (metadata) lives only in the main DB.
 */

import { logger } from '../utils/logger.js';
import type { EdsrCacheService } from './edrsr-cache-service.js';

export interface EdsrFtsFilters {
  court_code?: number;
  judge?: string;
  date_from?: string;
  date_to?: string;
  justice_kind?: number;
  judgment_code?: number;
  category_code?: number;
  instance_code?: number;
}

export interface EdsrFtsResult {
  doc_id: number;
  headline: string | null;
  rank: number;
  adjudication_date?: string;
  cause_num?: string;
  judge?: string;
  court_code?: number;
  justice_kind?: number;
  judgment_code?: number;
}

export interface EdsrFtsSearchResponse {
  query: string;
  total: number;
  returned: number;
  offset: number;
  has_more: boolean;
  results: EdsrFtsResult[];
}

export interface EdsrIndexProgress {
  total: number;
  indexed: number;
  remaining: number;
  percentComplete: number;
}

export class EdsrFtsService {
  private edsrCache: EdsrCacheService | null = null;

  setEdsrCache(cache: EdsrCacheService): void {
    this.edsrCache = cache;
  }

  /**
   * Full text search over edrsr_fulltext with optional metadata filters from edrsr_documents.
   *
   * Uses ts_rank_cd for relevance scoring and ts_headline for snippet generation.
   * Falls back to ILIKE when tsv column is not yet populated for matching rows.
   */
  async searchFulltext(
    query: string,
    dbPool: any,
    filters: EdsrFtsFilters = {},
    limit: number = 20,
    offset: number = 0,
  ): Promise<EdsrFtsSearchResponse> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safeOffset = Math.max(offset, 0);

    // Check cache first
    if (this.edsrCache) {
      const cached = await this.edsrCache.getCachedFtsResults(query, filters, safeLimit, safeOffset);
      if (cached) {
        logger.debug('[EdsrFtsService] Cache hit for FTS query', { query });
        return cached;
      }
    }

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    // FTS condition on tsv column
    conditions.push(`f.tsv @@ plainto_tsquery('simple', $${paramIdx})`);
    params.push(query);
    paramIdx++;

    // Metadata filters — require JOIN with edrsr_documents
    const hasMetadataFilter = filters.court_code || filters.judge || filters.date_from ||
      filters.date_to || filters.justice_kind || filters.judgment_code ||
      filters.category_code || filters.instance_code;

    if (filters.court_code) {
      conditions.push(`d.court_code = $${paramIdx}`);
      params.push(filters.court_code);
      paramIdx++;
    }
    if (filters.judge) {
      conditions.push(`LOWER(d.judge) LIKE LOWER($${paramIdx})`);
      params.push(`%${filters.judge}%`);
      paramIdx++;
    }
    if (filters.date_from) {
      conditions.push(`d.adjudication_date >= $${paramIdx}`);
      params.push(filters.date_from);
      paramIdx++;
    }
    if (filters.date_to) {
      conditions.push(`d.adjudication_date <= $${paramIdx}`);
      params.push(filters.date_to);
      paramIdx++;
    }
    if (filters.justice_kind) {
      conditions.push(`d.justice_kind = $${paramIdx}`);
      params.push(filters.justice_kind);
      paramIdx++;
    }
    if (filters.judgment_code) {
      conditions.push(`d.judgment_code = $${paramIdx}`);
      params.push(filters.judgment_code);
      paramIdx++;
    }
    if (filters.category_code) {
      conditions.push(`d.category_code = $${paramIdx}`);
      params.push(filters.category_code);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    // Build FROM clause — only join edrsr_documents when metadata filters are used
    const fromClause = hasMetadataFilter
      ? `edrsr_fulltext f INNER JOIN edrsr_documents d ON d.doc_id = f.doc_id`
      : `edrsr_fulltext f`;

    // Instance code needs court join
    let extraJoin = '';
    if (filters.instance_code) {
      extraJoin = ` LEFT JOIN edrsr_courts c ON c.court_code = d.court_code`;
      conditions.push(`c.instance_code = $${paramIdx}`);
      params.push(filters.instance_code);
      paramIdx++;
    }

    const buildSelectFields = (withHeadline: boolean) => {
      const headlineExpr = withHeadline
        ? `safe_ts_headline('simple'::regconfig, LEFT(f.full_text, 2000), plainto_tsquery('simple', $1),
           'MaxWords=60, MinWords=20, StartSel=**, StopSel=**') AS headline`
        : `NULL AS headline`;

      return hasMetadataFilter
        ? `f.doc_id,
           ts_rank_cd(f.tsv, plainto_tsquery('simple', $1)) AS rank,
           ${headlineExpr},
           d.adjudication_date, d.cause_num, d.judge, d.court_code,
           d.justice_kind, d.judgment_code`
        : `f.doc_id,
           ts_rank_cd(f.tsv, plainto_tsquery('simple', $1)) AS rank,
           ${headlineExpr}`;
    };

    const executeQuery = async (withHeadline: boolean) => {
      const selectFields = buildSelectFields(withHeadline);

      // Count query
      const countSql = `SELECT COUNT(*)::int AS total FROM ${fromClause}${extraJoin} WHERE ${whereClause}`;
      const countResult = await dbPool.query(countSql, params);
      const total = countResult.rows[0]?.total || 0;

      // Data query with ranking
      const dataSql = `
        SELECT ${selectFields}
        FROM ${fromClause}${extraJoin}
        WHERE ${whereClause}
        ORDER BY rank DESC
        LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`;

      const dataResult = await dbPool.query(dataSql, [...params, safeLimit, safeOffset]);
      return { total, dataResult };
    };

    try {
      let total: number;
      let dataResult: any;

      try {
        ({ total, dataResult } = await executeQuery(true));
      } catch (headlineErr: any) {
        // Retry without ts_headline if encoding error (some records have invalid UTF-8 bytes)
        if (headlineErr.code === '22021') {
          logger.warn('[EdsrFtsService] Retrying without ts_headline due to encoding error', { query });
          ({ total, dataResult } = await executeQuery(false));
        } else {
          throw headlineErr;
        }
      }

      logger.info('[EdsrFtsService] searchFulltext', {
        query,
        filters: Object.keys(filters).filter(k => (filters as any)[k] !== undefined),
        total,
        returned: dataResult.rows.length,
      });

      const response = {
        query,
        total,
        returned: dataResult.rows.length,
        offset: safeOffset,
        has_more: safeOffset + dataResult.rows.length < total,
        results: dataResult.rows.map((row: any) => ({
          doc_id: row.doc_id,
          headline: row.headline || null,
          rank: parseFloat(row.rank) || 0,
          ...(row.adjudication_date !== undefined ? { adjudication_date: row.adjudication_date } : {}),
          ...(row.cause_num !== undefined ? { cause_num: row.cause_num } : {}),
          ...(row.judge !== undefined ? { judge: row.judge } : {}),
          ...(row.court_code !== undefined ? { court_code: row.court_code } : {}),
          ...(row.justice_kind !== undefined ? { justice_kind: row.justice_kind } : {}),
          ...(row.judgment_code !== undefined ? { judgment_code: row.judgment_code } : {}),
        })),
      };

      // Cache the result
      if (this.edsrCache) {
        this.edsrCache.setCachedFtsResults(query, filters, safeLimit, safeOffset, response).catch(() => {});
      }

      return response;
    } catch (err: any) {
      logger.error('[EdsrFtsService] searchFulltext failed', { error: err.message, query });
      throw new Error(`FTS search failed: ${err.message}`);
    }
  }

  /**
   * Populate tsv column for rows that haven't been indexed yet.
   * Designed to be called repeatedly by a background job / cron.
   *
   * @param batchSize Number of rows to index per call (default 1000)
   * @param dbPool    PostgreSQL pool to use (can be main or shard DB)
   * @returns Number of rows indexed in this batch
   */
  async indexBatch(batchSize: number = 1000, dbPool: any): Promise<number> {
    const safeBatch = Math.min(Math.max(batchSize, 1), 10000);

    try {
      // Find un-indexed rows and update in one statement using a CTE
      const result = await dbPool.query(`
        WITH batch AS (
          SELECT doc_id
          FROM edrsr_fulltext
          WHERE tsv IS NULL AND full_text IS NOT NULL
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE edrsr_fulltext f
        SET tsv = to_tsvector('simple', f.full_text)
        FROM batch
        WHERE f.doc_id = batch.doc_id
      `, [safeBatch]);

      const indexed = result.rowCount || 0;

      if (indexed > 0) {
        logger.info('[EdsrFtsService] indexBatch', { indexed, batchSize: safeBatch });
      }

      return indexed;
    } catch (err: any) {
      logger.error('[EdsrFtsService] indexBatch failed', { error: err.message });
      throw new Error(`FTS indexing batch failed: ${err.message}`);
    }
  }

  /**
   * Report indexing progress for the given database pool.
   */
  async getIndexProgress(dbPool: any): Promise<EdsrIndexProgress> {
    try {
      const result = await dbPool.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(tsv)::int AS indexed,
          (COUNT(*) - COUNT(tsv))::int AS remaining
        FROM edrsr_fulltext
      `);

      const row = result.rows[0];
      const total = row.total || 0;
      const indexed = row.indexed || 0;
      const remaining = row.remaining || 0;
      const percentComplete = total > 0 ? Math.round((indexed / total) * 10000) / 100 : 0;

      return { total, indexed, remaining, percentComplete };
    } catch (err: any) {
      logger.error('[EdsrFtsService] getIndexProgress failed', { error: err.message });
      throw new Error(`Failed to get FTS index progress: ${err.message}`);
    }
  }
}

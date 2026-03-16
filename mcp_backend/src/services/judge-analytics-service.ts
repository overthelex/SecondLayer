import { BaseDatabase } from '@secondlayer/shared';
import { logger } from '../utils/logger.js';

export interface JudgeAnalyticsRecord {
  id: number;
  judge_name: string;
  court_code: number | null;
  court_name: string | null;
  instance_code: number | null;
  instance_name: string | null;
  dossier_number: string | null;
  total_decisions: number;
  unique_cases: number;
  cases_appealed: number;
  appeal_rate: number;
  decisions_by_year: Record<string, number>;
  decisions_by_form: Record<string, number>;
  decisions_by_justice_kind: Record<string, number>;
  top_categories: Array<{ code: number; name: string; count: number }>;
  appeal_outcomes: {
    upheld: number;
    overturned: number;
    modified: number;
    unknown: number;
    analyzed: number;
  };
  vkksu_data: Record<string, unknown>;
  peer_rank_in_court: number | null;
  peer_total_in_court: number | null;
  court_avg_decisions: number | null;
  period_start: string;
  period_end: string;
  computed_at: string;
}

export interface JudgeAnalyticsListResult {
  judges: JudgeAnalyticsRecord[];
  total: number;
}

export interface JudgeAnalyticsFilters {
  search?: string;
  court_name?: string;
  instance_code?: number;
  justice_kind?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

const ALLOWED_SORT_COLUMNS: Record<string, string> = {
  total_decisions: 'total_decisions',
  appeal_rate: 'appeal_rate',
  cases_appealed: 'cases_appealed',
  unique_cases: 'unique_cases',
  judge_name: 'judge_name',
  court_name: 'court_name',
  peer_rank_in_court: 'peer_rank_in_court',
};

export class JudgeAnalyticsService {
  private db: BaseDatabase;

  constructor(db: BaseDatabase) {
    this.db = db;
  }

  async getAnalyticsList(filters: JudgeAnalyticsFilters): Promise<JudgeAnalyticsListResult> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters.search) {
      conditions.push(`judge_name ILIKE $${paramIdx}`);
      params.push(`%${filters.search}%`);
      paramIdx++;
    }

    if (filters.court_name) {
      conditions.push(`court_name ILIKE $${paramIdx}`);
      params.push(`%${filters.court_name}%`);
      paramIdx++;
    }

    if (filters.instance_code != null) {
      conditions.push(`instance_code = $${paramIdx}`);
      params.push(filters.instance_code);
      paramIdx++;
    }

    if (filters.justice_kind) {
      conditions.push(`decisions_by_justice_kind ? $${paramIdx}`);
      params.push(filters.justice_kind);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sortCol = ALLOWED_SORT_COLUMNS[filters.sort_by || 'total_decisions'] || 'total_decisions';
    const sortOrder = filters.sort_order === 'asc' ? 'ASC' : 'DESC';
    const limit = Math.min(filters.limit || 25, 200);
    const offset = filters.offset || 0;

    const countQuery = `SELECT COUNT(*) AS total FROM judge_analytics ${whereClause}`;
    const dataQuery = `
      SELECT * FROM judge_analytics
      ${whereClause}
      ORDER BY ${sortCol} ${sortOrder} NULLS LAST
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;

    const [countResult, dataResult] = await Promise.all([
      this.db.query<{ total: string }>(countQuery, params),
      this.db.query<JudgeAnalyticsRecord>(dataQuery, [...params, limit, offset]),
    ]);

    return {
      judges: dataResult.rows,
      total: parseInt(countResult.rows[0]?.total || '0', 10),
    };
  }

  async getAnalyticsDetail(identifier: string): Promise<JudgeAnalyticsRecord | null> {
    // Try dossier number first, then id
    let result = await this.db.query<JudgeAnalyticsRecord>(
      `SELECT * FROM judge_analytics WHERE dossier_number = $1 LIMIT 1`,
      [identifier]
    );

    if (result.rows.length === 0) {
      const numId = parseInt(identifier, 10);
      if (!isNaN(numId)) {
        result = await this.db.query<JudgeAnalyticsRecord>(
          `SELECT * FROM judge_analytics WHERE id = $1 LIMIT 1`,
          [numId]
        );
      }
    }

    if (result.rows.length === 0) {
      // Try URL-decoded judge name
      result = await this.db.query<JudgeAnalyticsRecord>(
        `SELECT * FROM judge_analytics WHERE judge_name = $1 LIMIT 1`,
        [decodeURIComponent(identifier)]
      );
    }

    return result.rows[0] || null;
  }
}

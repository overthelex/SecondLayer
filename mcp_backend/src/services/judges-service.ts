import { BaseDatabase } from '@secondlayer/shared';
import { logger } from '../utils/logger.js';
import { EdsrLocalAdapter } from '../adapters/edrsr-local-adapter.js';
import { getRedisClient } from '../utils/redis-client.js';

export interface JudgeRecord {
  id: number;
  dossier_number: string | null;
  full_name: string;
  gender: string | null;
  court_name: string | null;
  first_seen: string | null;
  last_seen: string | null;
  snapshot_count: number;
}

export interface JudgesListResult {
  judges: JudgeRecord[];
  total: number;
}

export interface CourtHistoryEntry {
  court_name: string;
  first_seen: string;
  last_seen: string;
  snapshot_count: number;
}

export interface JusticeKindStat {
  id: number;
  name: string;
  count: number;
}

export interface JudgmentFormStat {
  id: number;
  name: string;
  count: number;
}

export interface YearActivity {
  year: number;
  count: number;
}

export interface RecentDecision {
  id: number;
  case_number: string | null;
  adjudication_date: string | null;
  court_name: string | null;
  justice_kind: string | null;
  doc_type: string | null;
  snippet: string | null;
}

export interface JudgeStats {
  total_decisions: number;
  by_justice_kind: JusticeKindStat[];
  by_judgment_form: JudgmentFormStat[];
  year_activity: YearActivity[];
  recent_decisions: RecentDecision[];
}

export interface JudgeProfile {
  basic: JudgeRecord;
  court_history: CourtHistoryEntry[];
  zo_id: number | null;
  stats: JudgeStats | null;
}

// ZakonOnline justice_kind IDs and names
const JUSTICE_KINDS: { id: number; name: string }[] = [
  { id: 1, name: 'Цивільне' },
  { id: 2, name: 'Кримінальне' },
  { id: 3, name: 'Господарське' },
  { id: 4, name: 'Адміністративне' },
  { id: 5, name: 'Адмінправопорушення' },
  { id: 10, name: 'Інше' },
];

// ZakonOnline judgment_form IDs and names
const JUDGMENT_FORMS: { id: number; name: string }[] = [
  { id: 1, name: 'Вирок' },
  { id: 2, name: 'Постанова' },
  { id: 3, name: 'Рішення' },
  { id: 4, name: 'Ухвала' },
  { id: 5, name: 'Окрема ухвала' },
  { id: 6, name: 'Окрема думка' },
  { id: 7, name: 'Додаткове рішення' },
  { id: 8, name: 'Додатковий вирок' },
  { id: 9, name: 'Додаткова постанова' },
  { id: 10, name: 'Додаткова ухвала' },
  { id: 11, name: 'Наказ' },
  { id: 12, name: 'Судовий наказ' },
  { id: 13, name: 'Окрема ухвала (постанова)' },
];

const CACHE_TTL = 86400; // 24 hours

export class JudgesService {
  private db: BaseDatabase;
  private zoAdapter: EdsrLocalAdapter | null;

  constructor(db: BaseDatabase, zoAdapter?: EdsrLocalAdapter) {
    this.db = db;
    this.zoAdapter = zoAdapter || null;
  }

  async getJudges(search?: string, limit = 50, offset = 0): Promise<JudgesListResult> {
    const pool = this.db.getPool();
    const params: any[] = [];
    const conditions: string[] = [];

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      params.push(term, term);
      conditions.push(`(full_name ILIKE $${params.length - 1} OR court_name ILIKE $${params.length})`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(*) as total FROM judges_current ${where}`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total, 10);

    params.push(limit, offset);
    const dataQuery = `
      SELECT id, dossier_number, full_name, gender, court_name, first_seen, last_seen, snapshot_count
      FROM judges_current
      ${where}
      ORDER BY full_name ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
    const dataResult = await pool.query(dataQuery, params);

    return { judges: dataResult.rows, total };
  }

  async getJudgeByDossier(identifier: string): Promise<JudgeRecord | null> {
    const pool = this.db.getPool();
    const result = await pool.query(
      `SELECT id, dossier_number, full_name, gender, court_name, first_seen, last_seen, snapshot_count
       FROM judges_current WHERE dossier_number = $1 LIMIT 1`,
      [identifier]
    );
    return result.rows[0] || null;
  }

  async getJudgeProfile(identifier: string): Promise<JudgeProfile | null> {
    // Check Redis cache first
    const cacheKey = `judge:profile:${identifier}`;
    try {
      const redis = await getRedisClient();
      if (redis) {
        const cached = await redis.get(cacheKey);
        if (cached) {
          logger.debug('[Judges] Cache hit for profile', { identifier });
          return JSON.parse(cached);
        }
      }
    } catch (err) {
      logger.warn('[Judges] Redis cache read failed', { error: (err as Error).message });
    }

    const pool = this.db.getPool();

    // 1. Basic info from judges_current — try dossier_number first, then name
    let basicResult = await pool.query(
      `SELECT id, dossier_number, full_name, gender, court_name, first_seen, last_seen, snapshot_count
       FROM judges_current WHERE dossier_number = $1 LIMIT 1`,
      [identifier]
    );

    // Fallback: try by full_name (URL-decoded)
    if (basicResult.rows.length === 0) {
      const decodedName = decodeURIComponent(identifier);
      basicResult = await pool.query(
        `SELECT id, dossier_number, full_name, gender, court_name, first_seen, last_seen, snapshot_count
         FROM judges_current WHERE full_name = $1 LIMIT 1`,
        [decodedName]
      );
    }

    // Fallback: try by numeric ID in judge_analytics → get name → find in judges_current
    if (basicResult.rows.length === 0) {
      const numId = parseInt(identifier, 10);
      if (!isNaN(numId)) {
        const analyticsResult = await pool.query(
          `SELECT judge_name, court_name FROM judge_analytics WHERE id = $1 LIMIT 1`,
          [numId]
        );
        if (analyticsResult.rows.length > 0) {
          basicResult = await pool.query(
            `SELECT id, dossier_number, full_name, gender, court_name, first_seen, last_seen, snapshot_count
             FROM judges_current WHERE full_name = $1 LIMIT 1`,
            [analyticsResult.rows[0].judge_name]
          );
        }
      }
    }

    // Final fallback: build minimal profile from judge_analytics
    if (basicResult.rows.length === 0) {
      const decodedName = decodeURIComponent(identifier);
      const analyticsResult = await pool.query(
        `SELECT id, judge_name, court_name, dossier_number FROM judge_analytics
         WHERE judge_name = $1 OR dossier_number = $1 LIMIT 1`,
        [decodedName]
      );
      if (analyticsResult.rows.length === 0) {
        // Also try numeric ID
        const numId = parseInt(identifier, 10);
        if (!isNaN(numId)) {
          const byIdResult = await pool.query(
            `SELECT id, judge_name, court_name, dossier_number FROM judge_analytics WHERE id = $1 LIMIT 1`,
            [numId]
          );
          if (byIdResult.rows.length === 0) return null;
          analyticsResult.rows = byIdResult.rows;
        } else {
          return null;
        }
      }
      const ar = analyticsResult.rows[0];
      const basic: JudgeRecord = {
        id: ar.id,
        dossier_number: ar.dossier_number,
        full_name: ar.judge_name,
        gender: null,
        court_name: ar.court_name,
        first_seen: null,
        last_seen: null,
        snapshot_count: 0,
      };
      const profile: JudgeProfile = { basic, court_history: [], zo_id: null, stats: null };

      // Cache result
      try {
        const redis = await getRedisClient();
        if (redis) {
          await redis.set(cacheKey, JSON.stringify(profile), { EX: CACHE_TTL });
        }
      } catch (err) {
        logger.warn('[Judges] Redis cache write failed', { error: (err as Error).message });
      }

      return profile;
    }

    const basic: JudgeRecord = basicResult.rows[0];

    // 2. Court history from judges table (historical snapshots)
    const historyResult = await pool.query(
      `SELECT court_name, MIN(snapshot_date) as first_seen, MAX(snapshot_date) as last_seen, COUNT(*)::int as snapshot_count
       FROM judges
       WHERE dossier_number = $1 AND court_name IS NOT NULL
       GROUP BY court_name
       ORDER BY MIN(snapshot_date) ASC`,
      [identifier]
    );
    const court_history: CourtHistoryEntry[] = historyResult.rows;

    // ZO dictionary lookup removed — ZakonOnline API deprecated
    const zo_id: number | null = null;
    const stats: JudgeStats | null = null;

    const profile: JudgeProfile = { basic, court_history, zo_id, stats };

    // Cache result
    try {
      const redis = await getRedisClient();
      if (redis) {
        await redis.set(cacheKey, JSON.stringify(profile), { EX: CACHE_TTL });
      }
    } catch (err) {
      logger.warn('[Judges] Redis cache write failed', { error: (err as Error).message });
    }

    return profile;
  }

  private async fetchZoStats(judgeId: number): Promise<JudgeStats> {
    const adapter = this.zoAdapter!;
    const judgeWhere = [{ field: 'judge_id', operator: '$eq', value: judgeId }];

    // Batch 1: Total count + justice kind breakdown (7 calls in parallel)
    const [totalResult, ...justiceKindResults] = await Promise.all([
      adapter.searchCourtDecisions({ where: judgeWhere, limit: 1 }),
      ...JUSTICE_KINDS.map((jk) =>
        adapter.searchCourtDecisions({
          where: [...judgeWhere, { field: 'justice_kind', operator: '$eq', value: jk.id }],
          limit: 1,
        })
      ),
    ]);

    const total_decisions = totalResult.total || 0;

    const by_justice_kind: JusticeKindStat[] = JUSTICE_KINDS
      .map((jk, i) => ({
        id: jk.id,
        name: jk.name,
        count: justiceKindResults[i].total || 0,
      }))
      .filter((s) => s.count > 0);

    // Batch 2: Judgment form breakdown (13 calls in parallel)
    const judgmentFormResults = await Promise.all(
      JUDGMENT_FORMS.map((jf) =>
        adapter.searchCourtDecisions({
          where: [...judgeWhere, { field: 'judgment_form', operator: '$eq', value: jf.id }],
          limit: 1,
        })
      )
    );

    const by_judgment_form: JudgmentFormStat[] = JUDGMENT_FORMS
      .map((jf, i) => ({
        id: jf.id,
        name: jf.name,
        count: judgmentFormResults[i].total || 0,
      }))
      .filter((s) => s.count > 0);

    // Batch 3: Recent decisions + year activity (1 + 5 calls)
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

    const [recentResult, ...yearResults] = await Promise.all([
      adapter.searchCourtDecisions({
        where: judgeWhere,
        limit: 5,
        orderBy: { field: 'adjudication_date', direction: 'desc' },
      }),
      ...years.map((year) =>
        adapter.searchCourtDecisions({
          where: [
            ...judgeWhere,
            { field: 'adjudication_date', operator: '>=', value: `${year}-01-01` },
            { field: 'adjudication_date', operator: '<=', value: `${year}-12-31` },
          ],
          limit: 1,
        })
      ),
    ]);

    const recent_decisions: RecentDecision[] = (recentResult.data || []).slice(0, 5).map((d: any) => ({
      id: d.id,
      case_number: d.case_number || d.number || null,
      adjudication_date: d.adjudication_date || null,
      court_name: d.court_name || null,
      justice_kind: d.justice_kind_name || d.justice_kind || null,
      doc_type: d.judgment_form_name || d.judgment_form || null,
      snippet: d.title || d.cause || null,
    }));

    const year_activity: YearActivity[] = years
      .map((year, i) => ({
        year,
        count: yearResults[i].total || 0,
      }));

    return {
      total_decisions,
      by_justice_kind,
      by_judgment_form,
      year_activity,
      recent_decisions,
    };
  }
}

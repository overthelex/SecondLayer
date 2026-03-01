import { BaseDatabase } from '@secondlayer/shared';
import { logger } from '../utils/logger.js';

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

export class JudgesService {
  private db: BaseDatabase;

  constructor(db: BaseDatabase) {
    this.db = db;
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

  async getJudgeByDossier(dossierNumber: string): Promise<JudgeRecord | null> {
    const pool = this.db.getPool();
    const result = await pool.query(
      `SELECT id, dossier_number, full_name, gender, court_name, first_seen, last_seen, snapshot_count
       FROM judges_current WHERE dossier_number = $1 LIMIT 1`,
      [dossierNumber]
    );
    return result.rows[0] || null;
  }
}

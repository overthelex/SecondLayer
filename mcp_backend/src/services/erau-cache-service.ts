import { BaseDatabase } from '@secondlayer/shared';
import { logger } from '../utils/logger.js';
import { getRedisClient } from '../utils/redis-client.js';

export interface ERAULawyer {
  id: number;
  surname: string;
  firstname: string;
  middlename?: string;
  racalc?: string;
  certnum?: string;
  certat?: string;
  certcalc?: string;
}

const REDIS_PREFIX = 'erau:search:';
const REDIS_TTL = 86400; // 24 hours

export class ERAUCacheService {
  constructor(private db: BaseDatabase) {}

  async getBySurname(surname: string): Promise<ERAULawyer[] | null> {
    const key = this.redisKey(surname);

    // 1. Try Redis
    try {
      const redis = await getRedisClient();
      if (redis) {
        const cached = await redis.get(key);
        if (cached) {
          logger.info(`[ERAU Cache] Redis hit for "${surname}"`);
          return JSON.parse(cached);
        }
      }
    } catch (err: any) {
      logger.warn('[ERAU Cache] Redis read error', { error: err.message });
    }

    // 2. Try PG
    try {
      const result = await this.db.query(
        'SELECT erau_id AS id, surname, firstname, middlename, racalc, certnum, certat, certcalc FROM erau_lawyers WHERE LOWER(surname) = LOWER($1)',
        [surname.trim()]
      );
      if (result.rows.length > 0) {
        logger.info(`[ERAU Cache] PG hit for "${surname}" (${result.rows.length} rows)`);
        const lawyers: ERAULawyer[] = result.rows;
        // Repopulate Redis
        this.setRedis(key, lawyers).catch(() => {});
        return lawyers;
      }
    } catch (err: any) {
      logger.warn('[ERAU Cache] PG read error', { error: err.message });
    }

    return null;
  }

  async cacheResults(surname: string, lawyers: ERAULawyer[]): Promise<void> {
    if (!lawyers.length) return;

    // Upsert into PG
    try {
      const values: any[] = [];
      const placeholders: string[] = [];
      let idx = 1;

      for (const l of lawyers) {
        placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, $${idx + 7})`);
        values.push(l.id, l.surname, l.firstname, l.middlename || null, l.racalc || null, l.certnum || null, l.certat || null, l.certcalc || null);
        idx += 8;
      }

      await this.db.query(
        `INSERT INTO erau_lawyers (erau_id, surname, firstname, middlename, racalc, certnum, certat, certcalc)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (erau_id) DO UPDATE SET
           surname = EXCLUDED.surname,
           firstname = EXCLUDED.firstname,
           middlename = EXCLUDED.middlename,
           racalc = EXCLUDED.racalc,
           certnum = EXCLUDED.certnum,
           certat = EXCLUDED.certat,
           certcalc = EXCLUDED.certcalc,
           updated_at = NOW()`,
        values
      );
      logger.info(`[ERAU Cache] Upserted ${lawyers.length} lawyers for "${surname}"`);
    } catch (err: any) {
      logger.warn('[ERAU Cache] PG upsert error', { error: err.message });
    }

    // Set Redis
    const key = this.redisKey(surname);
    await this.setRedis(key, lawyers).catch(() => {});
  }

  private redisKey(surname: string): string {
    return `${REDIS_PREFIX}${surname.trim().toLowerCase()}`;
  }

  private async setRedis(key: string, data: ERAULawyer[]): Promise<void> {
    try {
      const redis = await getRedisClient();
      if (redis) {
        await redis.set(key, JSON.stringify(data), { EX: REDIS_TTL });
      }
    } catch (err: any) {
      logger.warn('[ERAU Cache] Redis write error', { error: err.message });
    }
  }
}

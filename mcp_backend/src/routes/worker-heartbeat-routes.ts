/**
 * Worker Heartbeat Routes
 * Receives stats from EC2 scrape workers and stores in Redis with TTL.
 */

import express, { Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { getRedisClient } from '../utils/redis-client.js';

const WORKER_KEY_PREFIX = 'worker:stats:';
const WORKER_TTL_SECONDS = 60;

export function createWorkerHeartbeatRoute(): express.Router {
  const router = express.Router();

  /**
   * POST /api/workers/heartbeat
   * Workers push stats every 10s. Stored in Redis with 60s TTL.
   */
  router.post('/heartbeat', async (req: Request, res: Response) => {
    const { worker_id, ip, received, downloaded, uploaded, errors, captchas, rate_limited, uptime_s, region, proxy_type, status } = req.body;

    if (!worker_id) {
      return res.status(400).json({ error: 'worker_id is required' });
    }

    try {
      const redis = await getRedisClient();
      if (!redis) {
        return res.status(503).json({ error: 'Redis unavailable' });
      }

      const payload = JSON.stringify({
        worker_id,
        ip: ip || null,
        received: received || 0,
        downloaded: downloaded || 0,
        uploaded: uploaded || 0,
        errors: errors || 0,
        captchas: captchas || 0,
        rate_limited: rate_limited || 0,
        uptime_s: uptime_s || 0,
        region: region || null,
        proxy_type: proxy_type || 'datacenter',
        status: status || 'idle',
        last_seen: Date.now(),
      });

      await redis.set(`${WORKER_KEY_PREFIX}${worker_id}`, payload, { EX: WORKER_TTL_SECONDS });

      res.json({ ok: true });
    } catch (err: any) {
      logger.error('Worker heartbeat failed', { error: err.message, worker_id });
      res.status(500).json({ error: 'Failed to store heartbeat' });
    }
  });

  return router;
}

/**
 * Read all worker stats from Redis. Used by bulk-scrape-status endpoint.
 */
export async function getWorkerStats(): Promise<any[]> {
  try {
    const redis = await getRedisClient();
    if (!redis) return [];

    const keys = await redis.keys(`${WORKER_KEY_PREFIX}*`);
    if (keys.length === 0) return [];

    const pipeline = redis.multi();
    for (const key of keys) {
      pipeline.get(key);
    }
    const results = await pipeline.exec();

    const now = Date.now();
    const workers = [];

    for (const raw of results) {
      if (!raw || typeof raw !== 'string') continue;
      try {
        const data = JSON.parse(raw);
        const lastSeenS = Math.round((now - data.last_seen) / 1000);
        const rateDocsPerS = data.uptime_s > 0 ? (data.uploaded / data.uptime_s) : 0;

        workers.push({
          worker_id: data.worker_id,
          worker_id_short: data.worker_id.length > 10 ? data.worker_id.slice(0, 10) : data.worker_id,
          ip: data.ip,
          uptime_s: data.uptime_s,
          received: data.received,
          downloaded: data.downloaded,
          uploaded: data.uploaded,
          errors: data.errors,
          captchas: data.captchas,
          rate_limited: data.rate_limited,
          rate_docs_per_s: parseFloat(rateDocsPerS.toFixed(2)),
          last_seen_s: lastSeenS,
          online: lastSeenS < WORKER_TTL_SECONDS,
          region: data.region || null,
          proxy_type: data.proxy_type || 'datacenter',
          status: data.status || 'idle',
        });
      } catch { /* skip malformed */ }
    }

    // Sort by worker_id for stable ordering
    workers.sort((a, b) => a.worker_id.localeCompare(b.worker_id));
    return workers;
  } catch (err: any) {
    logger.warn('Failed to read worker stats from Redis', { error: err.message });
    return [];
  }
}

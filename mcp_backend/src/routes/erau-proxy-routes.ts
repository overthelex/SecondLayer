/**
 * ERAU Proxy Routes
 *
 * Proxies requests to the Ukrainian Bar Registry (Єдиний реєстр адвокатів України)
 * at https://erau.unba.org.ua/search
 *
 * Cache-through: Redis → PG → external API. On success, results are persisted
 * to PG and cached in Redis so repeat searches avoid external calls.
 */

import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { ERAUCacheService } from '../services/erau-cache-service.js';

const ERAU_BASE_URL = 'https://erau.unba.org.ua';

export function createERAUProxyRoutes(erauCacheService?: ERAUCacheService): Router {
  const router = Router();

  router.get('/search', async (req: Request, res: Response) => {
    try {
      const surname = req.query.surname as string;
      if (!surname || surname.trim().length < 2) {
        return res.status(400).json({ error: 'surname query parameter required (min 2 characters)' });
      }

      const trimmed = surname.trim();

      // 1. Check cache (Redis → PG)
      if (erauCacheService) {
        const cached = await erauCacheService.getBySurname(trimmed);
        if (cached && cached.length > 0) {
          logger.info(`[ERAU] Serving ${cached.length} cached results for "${trimmed}"`);
          return res.json(cached);
        }
      }

      // 2. Fetch from external API
      const url = `${ERAU_BASE_URL}/search?surname=${encodeURIComponent(trimmed)}`;
      logger.info(`[ERAU] Proxying search for surname="${trimmed}"`);

      let items: any[];
      try {
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'SecondLayer/1.0',
          },
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          logger.warn(`[ERAU] Upstream returned ${response.status}`);
          // Fallback to PG on upstream error
          if (erauCacheService) {
            const fallback = await erauCacheService.getBySurname(trimmed);
            if (fallback && fallback.length > 0) {
              logger.info(`[ERAU] Serving ${fallback.length} PG fallback results for "${trimmed}"`);
              return res.json(fallback);
            }
          }
          return res.status(502).json({ error: `ERAU returned status ${response.status}` });
        }

        const data = await response.json() as any;
        items = Array.isArray(data) ? data : (data.items || []);
      } catch (fetchErr: unknown) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        logger.error('[ERAU] External API error', { error: msg });

        // Fallback to PG on network/timeout errors
        if (erauCacheService) {
          const fallback = await erauCacheService.getBySurname(trimmed);
          if (fallback && fallback.length > 0) {
            logger.info(`[ERAU] Serving ${fallback.length} PG fallback results after external failure for "${trimmed}"`);
            return res.json(fallback);
          }
        }

        if (msg.includes('timeout') || msg.includes('abort')) {
          return res.status(504).json({ error: 'ERAU request timed out' });
        }
        return res.status(502).json({ error: 'Failed to reach ERAU registry' });
      }

      // 3. Cache results (fire-and-forget)
      if (erauCacheService && items.length > 0) {
        erauCacheService.cacheResults(trimmed, items).catch((err) => {
          logger.warn('[ERAU] Background cache write failed', { error: err.message });
        });
      }

      res.json(items);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[ERAU] Proxy error', { error: msg });
      res.status(502).json({ error: 'Failed to reach ERAU registry' });
    }
  });

  return router;
}

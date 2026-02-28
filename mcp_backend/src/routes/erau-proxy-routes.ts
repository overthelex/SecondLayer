/**
 * ERAU Proxy Routes
 *
 * Proxies requests to the Ukrainian Bar Registry (Єдиний реєстр адвокатів України)
 * at https://erau.unba.org.ua/search
 */

import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger.js';

const ERAU_BASE_URL = 'https://erau.unba.org.ua';

export function createERAUProxyRoutes(): Router {
  const router = Router();

  router.get('/search', async (req: Request, res: Response) => {
    try {
      const surname = req.query.surname as string;
      if (!surname || surname.trim().length < 2) {
        return res.status(400).json({ error: 'surname query parameter required (min 2 characters)' });
      }

      const url = `${ERAU_BASE_URL}/search?surname=${encodeURIComponent(surname.trim())}`;
      logger.info(`[ERAU] Proxying search for surname="${surname.trim()}"`);

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'SecondLayer/1.0',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        logger.warn(`[ERAU] Upstream returned ${response.status}`);
        return res.status(502).json({ error: `ERAU returned status ${response.status}` });
      }

      const data = await response.json();
      res.json(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[ERAU] Proxy error', { error: msg });
      if (msg.includes('timeout') || msg.includes('abort')) {
        return res.status(504).json({ error: 'ERAU request timed out' });
      }
      res.status(502).json({ error: 'Failed to reach ERAU registry' });
    }
  });

  return router;
}

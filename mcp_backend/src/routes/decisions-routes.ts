/**
 * Decisions Routes
 *
 * API endpoints for downloading court decision full texts from reyestr.court.gov.ua.
 * - GET  /check-available  — check which doc_ids are already cached in DB
 * - POST /fetch-fulltext    — download a single decision
 * - POST /fetch-fulltext-batch — download up to 10 decisions
 */

import { Router, Response } from 'express';
import { ReyestrDownloadService } from '../services/reyestr-download-service.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { logger } from '../utils/logger.js';

const downloadRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 5,
  keyPrefix: 'decisions_download',
});

export function createDecisionsRoutes(reyestrService: ReyestrDownloadService): Router {
  const router = Router();

  // Check which doc_ids are already in the DB
  router.get('/check-available', async (req: any, res: Response) => {
    try {
      const docIdsParam = req.query.doc_ids as string;
      if (!docIdsParam) {
        return res.status(400).json({ error: 'doc_ids query parameter required' });
      }

      const docIds = docIdsParam.split(',').map(s => s.trim()).filter(Boolean);
      if (docIds.length === 0) {
        return res.status(400).json({ error: 'No valid doc_ids provided' });
      }

      if (docIds.length > 100) {
        return res.status(400).json({ error: 'Maximum 100 doc_ids per request' });
      }

      const available = await reyestrService.checkAvailable(docIds);
      res.json({ available });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[Decisions] check-available error', { error: msg });
      res.status(500).json({ error: msg });
    }
  });

  // Download a single decision full text
  router.post('/fetch-fulltext', downloadRateLimit as any, async (req: any, res: Response) => {
    try {
      const { doc_id } = req.body;
      if (!doc_id) {
        return res.status(400).json({ error: 'doc_id required' });
      }

      const docIdStr = String(doc_id);
      if (!/^\d+$/.test(docIdStr)) {
        return res.status(400).json({ error: 'doc_id must be numeric' });
      }

      logger.info(`[Decisions] Fetching fulltext for ${docIdStr}`, { userId: req.user?.id });
      const document = await reyestrService.fetchFullText(docIdStr);
      res.json({ status: 'ok', document });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[Decisions] fetch-fulltext error', { error: msg });
      res.status(500).json({ status: 'error', error: msg });
    }
  });

  // Batch download (max 10)
  router.post('/fetch-fulltext-batch', downloadRateLimit as any, async (req: any, res: Response) => {
    try {
      const { doc_ids } = req.body;
      if (!Array.isArray(doc_ids) || doc_ids.length === 0) {
        return res.status(400).json({ error: 'doc_ids array required' });
      }

      if (doc_ids.length > 10) {
        return res.status(400).json({ error: 'Maximum 10 doc_ids per batch request' });
      }

      const validIds = doc_ids.map(String).filter(id => /^\d+$/.test(id));
      if (validIds.length === 0) {
        return res.status(400).json({ error: 'No valid numeric doc_ids provided' });
      }

      logger.info(`[Decisions] Batch fetch for ${validIds.length} docs`, { userId: req.user?.id });
      const results = await reyestrService.fetchBatch(validIds);
      res.json({ results });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[Decisions] fetch-fulltext-batch error', { error: msg });
      res.status(500).json({ status: 'error', error: msg });
    }
  });

  return router;
}

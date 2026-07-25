/**
 * Admin ECHR Sync Routes — Trigger and monitor ECHR HUDOC synchronization
 */

import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger.js';
import { EchrHudocSyncService } from '../../services/echr-hudoc-sync-service.js';

const COUNTRY_CODE_RE = /^[A-Z]{2,3}$/;

export function createEchrSyncRouter(
  echrSyncService: EchrHudocSyncService,
): Router {
  const router = Router();

  /**
   * POST /api/admin/sync-echr
   * Trigger ECHR HUDOC sync for a specific country.
   * Body: { country: string, fullRefresh?: boolean }
   * The sync runs in the background; this endpoint returns immediately.
   */
  router.post('/sync-echr', async (req: Request, res: Response) => {
    try {
      const { country, fullRefresh } = req.body as {
        country?: string;
        fullRefresh?: boolean;
      };

      if (!country || typeof country !== 'string') {
        res.status(400).json({ success: false, error: 'Missing required field: country' });
        return;
      }

      const normalised = country.trim().toUpperCase();

      if (!COUNTRY_CODE_RE.test(normalised)) {
        res.status(400).json({
          success: false,
          error: 'Invalid country code. Must be 2-3 uppercase letters (e.g. "UKR", "UA").',
        });
        return;
      }

      // Fire-and-forget: run sync in background
      echrSyncService
        .syncCountry(normalised, { fullRefresh: fullRefresh === true })
        .catch((err: any) => {
          logger.error('Background ECHR sync failed', {
            country: normalised,
            error: err.message,
          });
        });

      res.json({ success: true, message: `Sync started for ${normalised}` });
    } catch (error: any) {
      logger.error('Failed to trigger ECHR sync', { error: error.message });
      res.status(500).json({ success: false, error: 'Failed to trigger ECHR sync' });
    }
  });

  /**
   * GET /api/admin/echr-sync-status
   * Returns sync status for all countries.
   */
  router.get('/echr-sync-status', async (_req: Request, res: Response) => {
    try {
      const statuses = await echrSyncService.getSyncStatus();
      res.json({ statuses });
    } catch (error: any) {
      logger.error('Failed to get ECHR sync status', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve ECHR sync status' });
    }
  });

  return router;
}

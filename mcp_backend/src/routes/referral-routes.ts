/**
 * Referral Routes
 * API endpoints for referral system
 */

import { Router, Request, Response } from 'express';
import type { ReferralService } from '../services/referral-service.js';
import { requireJWT, optionalJWT, AuthenticatedRequest } from '../middleware/dual-auth.js';
import { logger } from '../utils/logger.js';

export function createReferralRoutes(referralService: ReferralService): Router {
  const router = Router();

  /**
   * GET /api/referral/code
   * Get current user's referral code (creates one if needed)
   */
  router.get('/code', requireJWT as any, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const code = await referralService.getOrCreateCode(userId);
      return res.json({ code });
    } catch (err: any) {
      logger.error('Failed to get referral code', { error: err.message });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /api/referral/stats
   * Get referral statistics for current user
   */
  router.get('/stats', requireJWT as any, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const stats = await referralService.getStats(userId);
      return res.json(stats);
    } catch (err: any) {
      logger.error('Failed to get referral stats', { error: err.message });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /api/referral/list
   * Get list of referrals for current user
   */
  router.get('/list', requireJWT as any, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const referrals = await referralService.getReferrals(userId);
      return res.json({ referrals });
    } catch (err: any) {
      logger.error('Failed to get referral list', { error: err.message });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /api/referral/resolve/:code
   * Check if a referral code is valid (public endpoint)
   */
  router.get('/resolve/:code', optionalJWT as any, async (req: Request, res: Response) => {
    try {
      const code = req.params.code as string;
      if (!code || code.length > 12) {
        return res.status(400).json({ error: 'Invalid code' });
      }

      const userId = await referralService.getUserByCode(code);
      return res.json({ valid: !!userId });
    } catch (err: any) {
      logger.error('Failed to resolve referral code', { error: err.message });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

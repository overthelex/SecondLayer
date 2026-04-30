/**
 * Access Routes
 *
 * Exposes the beta-restriction status so the frontend can render the
 * beta-only modal proactively (on app load) instead of waiting for a chat
 * or upload request to fail with 403.
 */

import { Router, Response } from 'express';
import type { IDatabase } from '../domain/ports/index.js';
import { AuthenticatedRequest as DualAuthRequest } from '../middleware/dual-auth.js';
import { evaluateAccessGate, hasMonobankTopup } from '../services/access-gate.js';

export function createAccessRoutes(db: IDatabase): Router {
  const router = Router();

  router.get('/status', (async (req: DualAuthRequest, res: Response) => {
    const user = req.user;
    if (!user || !user.id) {
      return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHENTICATED' });
    }

    const decision = await evaluateAccessGate(db, user);
    const isBeta = user.is_beta_tester === true;
    const isAdmin = user.role === 'administrator' || user.is_admin === true;
    const topup = isBeta || isAdmin
      ? decision.reason === 'monobank_topup'
      : await hasMonobankTopup(db, user.id);

    res.json({
      allowed: decision.allowed,
      reason: decision.reason,
      is_beta_tester: isBeta,
      is_administrator: isAdmin,
      has_monobank_topup: topup,
    });
  }) as any);

  return router;
}

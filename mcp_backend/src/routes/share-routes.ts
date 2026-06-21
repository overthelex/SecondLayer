import { Router, Response } from 'express';
import { ShareService } from '../services/share-service.js';
import { AuthenticatedRequest as DualAuthRequest } from '../middleware/dual-auth.js';
import { logger } from '../utils/logger.js';

export function createShareRouter(shareService: ShareService): Router {
  const router = Router();

  // POST / - Create a shareable link from a content snapshot
  router.post('/', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const { scope, title, snapshot, conversationId } = req.body;
      if (!snapshot || !Array.isArray(snapshot.messages) || snapshot.messages.length === 0) {
        return res.status(400).json({ error: 'snapshot.messages required' });
      }

      const { token } = await shareService.createShare(userId, {
        scope: scope === 'message' ? 'message' : 'conversation',
        title,
        snapshot,
        conversationId,
      });

      res.status(201).json({ token });
    } catch (error: any) {
      logger.error('[Shares] Create failed', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  }) as any);

  // GET / - List shares created by the current user
  router.get('/', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const shares = await shareService.listShares(userId);
      res.json({ shares });
    } catch (error: any) {
      logger.error('[Shares] List failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }) as any);

  // GET /:token - View a shared snapshot (any authenticated platform user)
  router.get('/:token', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const share = await shareService.getShare(req.params.token as string);
      if (!share) return res.status(404).json({ error: 'Share not found' });

      res.json(share);
    } catch (error: any) {
      logger.error('[Shares] Get failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }) as any);

  // DELETE /:token - Revoke a share
  router.delete('/:token', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'User not authenticated' });

      const revoked = await shareService.revokeShare(userId, req.params.token as string);
      if (!revoked) return res.status(404).json({ error: 'Share not found' });

      res.json({ success: true });
    } catch (error: any) {
      logger.error('[Shares] Revoke failed', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }) as any);

  return router;
}

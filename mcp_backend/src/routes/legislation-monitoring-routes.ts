import { Router, Request, Response, RequestHandler } from 'express';
import { LegislationMonitoringService } from '../services/legislation-monitoring-service.js';
import { logger } from '../utils/logger.js';

interface AuthRequest extends Request {
  user?: { id: string };
}

export function createLegislationMonitoringRoutes(service: LegislationMonitoringService): Router {
  const router = Router();

  // POST /subscriptions - subscribe to legislation
  router.post('/subscriptions', (async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Не авторизовано' }); return; }

      const { rada_id, notify_email, notify_inapp } = req.body;
      if (!rada_id) { res.status(400).json({ error: 'rada_id обов\'язковий' }); return; }

      const sub = await service.subscribe(userId, rada_id, { notify_email, notify_inapp });
      res.json(sub);
    } catch (err: any) {
      logger.error('[LegMonitoring] Subscribe error', { error: err.message });
      res.status(400).json({ error: err.message });
    }
  }) as RequestHandler);

  // DELETE /subscriptions/:radaId - unsubscribe
  router.delete('/subscriptions/:radaId', (async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Не авторизовано' }); return; }

      const deleted = await service.unsubscribe(userId, req.params.radaId as string);
      res.json({ success: deleted });
    } catch (err: any) {
      logger.error('[LegMonitoring] Unsubscribe error', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  }) as RequestHandler);

  // GET /subscriptions - list user subscriptions
  router.get('/subscriptions', (async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Не авторизовано' }); return; }

      const subscriptions = await service.listSubscriptions(userId);
      res.json({ subscriptions });
    } catch (err: any) {
      logger.error('[LegMonitoring] List subscriptions error', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  }) as RequestHandler);

  // GET /subscriptions/check/:radaId - check if subscribed
  router.get('/subscriptions/check/:radaId', (async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Не авторизовано' }); return; }

      const subscribed = await service.isSubscribed(userId, req.params.radaId as string);
      res.json({ subscribed });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }) as RequestHandler);

  // GET /changes - change feed for subscribed legislation
  router.get('/changes', (async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Не авторизовано' }); return; }

      const { rada_id, limit, offset } = req.query;
      const result = await service.getChangeFeed(userId, {
        radaId: rada_id as string,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });
      res.json(result);
    } catch (err: any) {
      logger.error('[LegMonitoring] Change feed error', { error: err.message });
      res.status(500).json({ error: err.message });
    }
  }) as RequestHandler);

  // GET /changes/legislation/:radaId - changes for specific legislation
  router.get('/changes/legislation/:radaId', (async (req: AuthRequest, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(String(req.query.limit)) : 50;
      const changes = await service.getChangesForLegislation(req.params.radaId as string, limit);
      res.json({ changes });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }) as RequestHandler);

  // GET /changes/:changeId - single change with diff
  router.get('/changes/:changeId', (async (req: AuthRequest, res: Response) => {
    try {
      const change = await service.getChange(parseInt(req.params.changeId as string));
      if (!change) { res.status(404).json({ error: 'Зміну не знайдено' }); return; }
      res.json(change);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }) as RequestHandler);

  // GET /notifications - in-app notifications
  router.get('/notifications', (async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Не авторизовано' }); return; }

      const { unread_only, limit, offset } = req.query;
      const result = await service.getNotifications(userId, {
        unreadOnly: unread_only === 'true',
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }) as RequestHandler);

  // PATCH /notifications/:id/read - mark notification as read
  router.patch('/notifications/:id/read', (async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Не авторизовано' }); return; }

      const success = await service.markNotificationRead(userId, parseInt(req.params.id as string));
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }) as RequestHandler);

  // POST /notifications/read-all - mark all as read
  router.post('/notifications/read-all', (async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) { res.status(401).json({ error: 'Не авторизовано' }); return; }

      await service.markAllNotificationsRead(userId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }) as RequestHandler);

  return router;
}

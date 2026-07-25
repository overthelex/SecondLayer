import { Router, Request, Response } from 'express';
import { SessionReplayService } from '../services/session-replay-service.js';
import { logger } from '../utils/logger.js';

/**
 * Client-facing routes: recording sessions + storing event chunks
 * Mounted at /api/session-replay
 */
export function createSessionReplayRoutes(service: SessionReplayService): Router {
  const router = Router();

  // Create a new recording session (called once on login)
  router.post('/sessions', (async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string | undefined;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

      const { sessionId, viewport } = req.body;
      if (!sessionId) { res.status(400).json({ error: 'sessionId required' }); return; }

      const session = await service.createSession(
        userId,
        sessionId,
        req.headers['user-agent'] as string | undefined,
        viewport,
        req.ip
      );

      res.status(201).json(session);
    } catch (error: any) {
      logger.error('[SessionReplay] Create session failed', { error: error.message });
      res.status(500).json({ error: 'Failed to create session' });
    }
  }) as any);

  // Store a chunk of rrweb events
  router.post('/sessions/:sessionId/chunks', (async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string | undefined;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

      const sessionId = req.params.sessionId as string;
      const { chunkIndex, events } = req.body;

      if (!Array.isArray(events) || events.length === 0) {
        res.status(400).json({ error: 'events array required' });
        return;
      }

      const chunk = await service.storeChunk(userId, sessionId, chunkIndex, events);
      res.status(201).json({ chunkIndex: chunk.chunk_index, eventCount: chunk.event_count });
    } catch (error: any) {
      logger.error('[SessionReplay] Store chunk failed', { error: error.message });
      res.status(500).json({ error: 'Failed to store chunk' });
    }
  }) as any);

  // End a recording session
  router.post('/sessions/:sessionId/end', (async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string | undefined;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

      await service.endSession(req.params.sessionId as string);
      res.json({ ok: true });
    } catch (error: any) {
      logger.error('[SessionReplay] End session failed', { error: error.message });
      res.status(500).json({ error: 'Failed to end session' });
    }
  }) as any);

  return router;
}

/**
 * Admin routes: list sessions, replay events, view logs
 * Mounted at /api/admin/session-replay
 */
export function createAdminSessionReplayRoutes(service: SessionReplayService): Router {
  const router = Router();

  // List all sessions (paginated, filterable)
  router.get('/sessions', (async (req: Request, res: Response) => {
    try {
      const { userId, from, to, limit, offset } = req.query;

      const result = await service.listSessions({
        userId: userId as string,
        from: from as string,
        to: to as string,
        limit: limit ? parseInt(limit as string, 10) : 50,
        offset: offset ? parseInt(offset as string, 10) : 0,
      });

      res.set('X-Total-Count', String(result.total));
      res.json(result);
    } catch (error: any) {
      logger.error('[SessionReplay] List sessions failed', { error: error.message });
      res.status(500).json({ error: 'Failed to list sessions' });
    }
  }) as any);

  // Get session metadata + chunks info
  router.get('/sessions/:sessionId', (async (req: Request, res: Response) => {
    try {
      const session = await service.getSession(req.params.sessionId as string);
      if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
      res.json(session);
    } catch (error: any) {
      logger.error('[SessionReplay] Get session failed', { error: error.message });
      res.status(500).json({ error: 'Failed to get session' });
    }
  }) as any);

  // Get all rrweb events (for replay)
  router.get('/sessions/:sessionId/events', (async (req: Request, res: Response) => {
    try {
      const events = await service.getSessionEvents(req.params.sessionId as string);
      res.json({ events, count: events.length });
    } catch (error: any) {
      logger.error('[SessionReplay] Get events failed', { error: error.message });
      res.status(500).json({ error: 'Failed to get events' });
    }
  }) as any);

  // Get server logs for a session
  router.get('/sessions/:sessionId/logs', (async (req: Request, res: Response) => {
    try {
      const sid = req.params.sessionId as string;
      const [directLogs, costLogs] = await Promise.all([
        service.getSessionLogs(sid),
        service.getCorrelatedCostLogs(sid),
      ]);

      res.json({ directLogs, costLogs });
    } catch (error: any) {
      logger.error('[SessionReplay] Get logs failed', { error: error.message });
      res.status(500).json({ error: 'Failed to get logs' });
    }
  }) as any);

  return router;
}

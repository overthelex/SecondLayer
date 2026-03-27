import { Router, Response } from 'express';
import { AuthenticatedRequest as DualAuthRequest } from '../middleware/dual-auth.js';
import type { VideoCallService } from '../services/video-call-service.js';
import { logger } from '../utils/logger.js';

export function createVideoCallRoutes(videoCallService: VideoCallService): Router {
  const router = Router({ mergeParams: true });

  // POST / — initiate a call
  router.post('/', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });

      const consultationId = req.params.consultationId as string;
      if (!consultationId) return res.status(400).json({ error: 'consultationId is required' });

      const { callType, calleeId } = req.body;
      if (!callType || !calleeId) {
        return res.status(400).json({ error: 'callType and calleeId are required' });
      }

      const hasAccess = await videoCallService.verifyCallAccess(consultationId, req.user.id);
      if (!hasAccess) return res.status(403).json({ error: 'No access to this consultation' });

      // Check for existing active session
      const existing = await videoCallService.getActiveSession(consultationId);
      if (existing) {
        return res.status(409).json({ error: 'Active call already exists', session: existing });
      }

      const session = await videoCallService.createSession(
        consultationId,
        req.user.id,
        calleeId,
        callType,
      );

      res.status(201).json(session);
    } catch (error: any) {
      logger.error('[VideoCallRoutes] Failed to initiate call', { error: error.message });
      res.status(500).json({ error: 'Failed to initiate call' });
    }
  }) as any);

  // POST /:sessionId/end — end a call
  router.post('/:sessionId/end', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });

      const consultationId = req.params.consultationId as string;
      if (!consultationId) return res.status(400).json({ error: 'consultationId is required' });

      const hasAccess = await videoCallService.verifyCallAccess(consultationId, req.user.id);
      if (!hasAccess) return res.status(403).json({ error: 'No access to this consultation' });

      const sessionId = req.params.sessionId as string;
      const { reason } = req.body;

      const session = await videoCallService.endSession(sessionId, reason || 'ended_by_user');
      res.json(session);
    } catch (error: any) {
      logger.error('[VideoCallRoutes] Failed to end call', { error: error.message });
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to end call' });
    }
  }) as any);

  // GET /ice-servers — get ICE server configuration
  router.get('/ice-servers', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });

      const consultationId = req.params.consultationId as string;
      if (!consultationId) return res.status(400).json({ error: 'consultationId is required' });

      const hasAccess = await videoCallService.verifyCallAccess(consultationId, req.user.id);
      if (!hasAccess) return res.status(403).json({ error: 'No access to this consultation' });

      const iceServers = videoCallService.getIceServers();
      res.json({ iceServers });
    } catch (error: any) {
      logger.error('[VideoCallRoutes] Failed to get ICE servers', { error: error.message });
      res.status(500).json({ error: 'Failed to get ICE servers' });
    }
  }) as any);

  // GET /history — get call history for a consultation
  router.get('/history', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });

      const consultationId = req.params.consultationId as string;
      if (!consultationId) return res.status(400).json({ error: 'consultationId is required' });

      const hasAccess = await videoCallService.verifyCallAccess(consultationId, req.user.id);
      if (!hasAccess) return res.status(403).json({ error: 'No access to this consultation' });

      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const history = await videoCallService.getCallHistory(consultationId, limit);
      res.json(history);
    } catch (error: any) {
      logger.error('[VideoCallRoutes] Failed to get call history', { error: error.message });
      res.status(500).json({ error: 'Failed to get call history' });
    }
  }) as any);

  // GET /:sessionId/transcript — get transcript for a session
  router.get('/:sessionId/transcript', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });

      const consultationId = req.params.consultationId as string;
      if (!consultationId) return res.status(400).json({ error: 'consultationId is required' });

      const hasAccess = await videoCallService.verifyCallAccess(consultationId, req.user.id);
      if (!hasAccess) return res.status(403).json({ error: 'No access to this consultation' });

      const sessionId = req.params.sessionId as string;
      const transcript = await videoCallService.getTranscript(sessionId);
      res.json(transcript);
    } catch (error: any) {
      logger.error('[VideoCallRoutes] Failed to get transcript', { error: error.message });
      res.status(500).json({ error: 'Failed to get transcript' });
    }
  }) as any);

  return router;
}

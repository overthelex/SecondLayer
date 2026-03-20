import { Router, Response, NextFunction } from 'express';
import { AuthenticatedRequest as DualAuthRequest } from '../middleware/dual-auth.js';
import { ConsultationService } from '../services/consultation-service.js';
import { ConsultationPaymentService } from '../services/consultation-payment-service.js';
import { AttorneyPayoutService } from '../services/attorney-payout-service.js';
import type { IDatabase } from '../domain/ports/index.js';
import { logger } from '../utils/logger.js';

/** Optional callback for SSE connection metrics */
export type SseMetricsCallback = (type: 'user_stream' | 'message_stream', delta: 1 | -1) => void;

export function createConsultationRoutes(
  consultationService: ConsultationService,
  consultationPaymentService: ConsultationPaymentService,
  payoutService?: AttorneyPayoutService,
  db?: IDatabase,
  sseMetrics?: SseMetricsCallback
): Router {
  const router = Router();

  // Middleware: allow SSE endpoints to pass JWT token via query param
  // (EventSource API doesn't support custom headers)
  router.use(((req: DualAuthRequest, _res: Response, next: NextFunction) => {
    if (!req.headers.authorization && req.query.token) {
      req.headers.authorization = `Bearer ${req.query.token}`;
    }
    next();
  }) as any);

  // POST /api/consultations — create consultation request
  router.post('/', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const consultation = await consultationService.createConsultation(req.user.id, req.body);
      res.status(201).json(consultation);
    } catch (error: any) {
      logger.error('Failed to create consultation', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  }) as any);

  // GET /api/consultations — list my consultations
  router.get('/', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const { role, status, limit, offset } = req.query as any;
      const result = await consultationService.listConsultations(req.user.id, {
        role, status,
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      });
      res.json(result);
    } catch (error: any) {
      logger.error('Failed to list consultations', { error: error.message });
      res.status(500).json({ error: 'Failed to list consultations' });
    }
  }) as any);

  // GET /api/consultations/user-stream — SSE stream for user-level events
  router.get('/user-stream', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const userId = req.user.id;

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      res.write('event: connected\ndata: {}\n\n');
      sseMetrics?.('user_stream', 1);

      const { getConsultationMessageBus } = await import('../services/consultation-message-bus.js');
      const bus = getConsultationMessageBus();
      const unsubscribe = bus.subscribeUser(userId, (event) => {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      });

      const heartbeat = setInterval(() => {
        res.write('event: heartbeat\ndata: {}\n\n');
      }, 30000);

      req.on('close', () => {
        unsubscribe();
        clearInterval(heartbeat);
        sseMetrics?.('user_stream', -1);
      });
    } catch (error: any) {
      logger.error('Failed to setup user stream', { error: error.message });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to setup user stream' });
      }
    }
  }) as any);

  // GET /api/consultations/unread-total — global unread message count
  router.get('/unread-total', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const count = await consultationService.getGlobalUnreadCount(req.user.id);
      res.json({ count });
    } catch (error: any) {
      logger.error('Failed to get global unread count', { error: error.message });
      res.status(500).json({ error: 'Failed to get unread count' });
    }
  }) as any);

  // GET /api/consultations/pending-unseen — unseen pending requests for attorney
  router.get('/pending-unseen', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const result = await consultationService.getUnseenPending(req.user.id);
      res.json(result);
    } catch (error: any) {
      logger.error('Failed to get unseen pending consultations', { error: error.message });
      res.status(500).json({ error: 'Failed to get unseen pending consultations' });
    }
  }) as any);

  // PUT /api/consultations/mark-viewed — mark consultations as viewed
  router.put('/mark-viewed', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const { ids } = req.body;
      if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be an array' });
      await consultationService.markViewed(ids, req.user.id);
      res.json({ success: true });
    } catch (error: any) {
      logger.error('Failed to mark consultations as viewed', { error: error.message });
      res.status(500).json({ error: 'Failed to mark as viewed' });
    }
  }) as any);

  // GET /api/consultations/my-clients — attorney's client list with stats
  router.get('/my-clients', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const clients = await consultationService.getAttorneyClients(req.user.id);
      res.json({ clients });
    } catch (error: any) {
      logger.error('Failed to get attorney clients', { error: error.message });
      res.status(500).json({ error: 'Failed to get clients' });
    }
  }) as any);

  // GET /api/consultations/my-payouts — attorney's payout history
  router.get('/my-payouts', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      if (!payoutService) return res.status(500).json({ error: 'Payout service not configured' });
      const payouts = await payoutService.getAttorneyPayoutHistory(req.user.id);
      res.json({ payouts });
    } catch (error: any) {
      logger.error('Failed to get attorney payouts', { error: error.message });
      res.status(500).json({ error: 'Failed to get payouts' });
    }
  }) as any);

  // GET /api/consultations/:id — get detail
  router.get('/:id', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const consultation = await consultationService.getConsultation(req.params.id as string, req.user.id);
      if (!consultation) return res.status(404).json({ error: 'Consultation not found' });
      res.json(consultation);
    } catch (error: any) {
      logger.error('Failed to get consultation', { error: error.message });
      res.status(500).json({ error: 'Failed to get consultation' });
    }
  }) as any);

  // PUT /api/consultations/:id/accept — attorney accepts
  router.put('/:id/accept', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const { agreedFee } = req.body;
      if (agreedFee === undefined || agreedFee === null || Number(agreedFee) <= 0) {
        return res.status(400).json({ error: 'agreedFee is required and must be greater than 0' });
      }
      const consultation = await consultationService.acceptConsultation(
        req.params.id as string, req.user.id, Number(agreedFee)
      );
      res.json(consultation);
    } catch (error: any) {
      logger.error('Failed to accept consultation', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  }) as any);

  // PUT /api/consultations/:id/decline — attorney declines
  router.put('/:id/decline', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const consultation = await consultationService.declineConsultation(
        req.params.id as string, req.user.id, req.body.reason
      );
      res.json(consultation);
    } catch (error: any) {
      logger.error('Failed to decline consultation', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  }) as any);

  // PUT /api/consultations/:id/start — attorney starts
  router.put('/:id/start', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const consultation = await consultationService.startConsultation(req.params.id as string, req.user.id);
      res.json(consultation);
    } catch (error: any) {
      logger.error('Failed to start consultation', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  }) as any);

  // PUT /api/consultations/:id/complete — attorney completes
  router.put('/:id/complete', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const consultation = await consultationService.completeConsultation(
        req.params.id as string, req.user.id, req.body.summary
      );

      // Auto-release escrow payment on completion
      try {
        await consultationPaymentService.releasePayment(req.params.id as string);
      } catch (err: any) {
        logger.warn('Failed to release escrow payment on completion (non-critical)', { error: err.message });
      }

      res.json(consultation);
    } catch (error: any) {
      logger.error('Failed to complete consultation', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  }) as any);

  // PUT /api/consultations/:id/cancel — either party cancels
  router.put('/:id/cancel', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const consultation = await consultationService.cancelConsultation(
        req.params.id as string, req.user.id, req.body.reason
      );

      // Auto-refund escrow payment on cancellation
      try {
        await consultationPaymentService.refundPayment(req.params.id as string);
      } catch (err: any) {
        logger.warn('Failed to refund escrow payment on cancellation (non-critical)', { error: err.message });
      }

      res.json(consultation);
    } catch (error: any) {
      logger.error('Failed to cancel consultation', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  }) as any);

  // POST /api/consultations/:id/pay — initiate payment
  router.post('/:id/pay', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const payment = await consultationPaymentService.createPayment(req.params.id as string, req.user.id);
      const result = await consultationPaymentService.initiatePayment(payment.id);
      res.json(result);
    } catch (error: any) {
      logger.error('Failed to initiate consultation payment', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  }) as any);

  // GET /api/consultations/:id/payment — payment status
  router.get('/:id/payment', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const payment = await consultationPaymentService.getPaymentByConsultation(req.params.id as string);
      if (!payment) return res.status(404).json({ error: 'No payment found' });
      res.json(payment);
    } catch (error: any) {
      logger.error('Failed to get payment status', { error: error.message });
      res.status(500).json({ error: 'Failed to get payment' });
    }
  }) as any);

  // GET /api/consultations/:id/messages/stream — SSE stream for real-time messages
  router.get('/:id/messages/stream', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const consultationId = req.params.id as string;

      // Verify access
      const consultation = await consultationService.getConsultation(consultationId, req.user.id);
      if (!consultation) return res.status(404).json({ error: 'Consultation not found' });

      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      // Send initial heartbeat
      res.write('event: connected\ndata: {}\n\n');
      sseMetrics?.('message_stream', 1);

      // Replay missed messages if Last-Event-ID is present (SSE reconnection)
      const lastEventId = req.headers['last-event-id'] as string | undefined;
      if (lastEventId) {
        try {
          const missed = await consultationService.getMessagesSince(consultationId, lastEventId);
          for (const msg of missed) {
            res.write(`id: ${msg.id}\nevent: message\ndata: ${JSON.stringify(msg)}\n\n`);
          }
          logger.info('SSE replay: sent missed messages', { consultationId, lastEventId, count: missed.length });
        } catch (err: any) {
          logger.warn('SSE replay failed (non-critical)', { error: err.message, lastEventId });
        }
      }

      // Subscribe to message bus
      const { getConsultationMessageBus } = await import('../services/consultation-message-bus.js');
      const bus = getConsultationMessageBus();
      const unsubscribeMsg = bus.subscribe(consultationId, (message) => {
        // Include id: field for Last-Event-ID support
        const eventId = (message as any).id || '';
        res.write(`id: ${eventId}\nevent: message\ndata: ${JSON.stringify(message)}\n\n`);
      });
      const unsubscribeStatus = bus.subscribeStatus(consultationId, (payload) => {
        res.write(`event: message_status\ndata: ${JSON.stringify(payload)}\n\n`);
      });
      const unsubscribeConsultationStatus = bus.subscribeConsultationStatus(consultationId, (updatedConsultation) => {
        res.write(`event: consultation_status\ndata: ${JSON.stringify(updatedConsultation)}\n\n`);
      });
      const unsubscribeTyping = bus.subscribeTyping(consultationId, (data) => {
        // Don't echo typing back to the sender
        if (data.userId !== req.user!.id) {
          res.write(`event: typing\ndata: ${JSON.stringify(data)}\n\n`);
        }
      });

      // Mark existing messages as delivered when client connects
      try {
        await consultationService.markMessagesDelivered(consultationId, req.user!.id);
      } catch (err: any) {
        logger.warn('Failed to mark messages as delivered on SSE connect', { error: err.message });
      }

      // Heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        res.write('event: heartbeat\ndata: {}\n\n');
      }, 30000);

      // Cleanup on disconnect
      req.on('close', () => {
        unsubscribeMsg();
        unsubscribeStatus();
        unsubscribeConsultationStatus();
        unsubscribeTyping();
        clearInterval(heartbeat);
        sseMetrics?.('message_stream', -1);
      });
    } catch (error: any) {
      logger.error('Failed to setup message stream', { error: error.message });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to setup message stream' });
      }
    }
  }) as any);

  // GET /api/consultations/:id/messages/unread-count — get unread message count
  router.get('/:id/messages/unread-count', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const count = await consultationService.getUnreadCount(req.params.id as string, req.user.id);
      res.json({ count });
    } catch (error: any) {
      logger.error('Failed to get unread count', { error: error.message });
      res.status(500).json({ error: 'Failed to get unread count' });
    }
  }) as any);

  // GET /api/consultations/:id/messages — list messages
  router.get('/:id/messages', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const { limit, offset } = req.query as any;
      const result = await consultationService.getMessages(req.params.id as string, req.user.id, {
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      });
      res.json(result);
    } catch (error: any) {
      logger.error('Failed to get messages', { error: error.message });
      res.status(500).json({ error: 'Failed to get messages' });
    }
  }) as any);

  // PUT /api/consultations/:id/messages/mark-read — mark all unread messages as read
  router.put('/:id/messages/mark-read', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const ids = await consultationService.markMessagesRead(req.params.id as string, req.user.id);
      res.json({ success: true, markedCount: ids.length });
    } catch (error: any) {
      logger.error('Failed to mark messages as read', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  }) as any);

  // POST /api/consultations/:id/messages — send message
  router.post('/:id/messages', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const { content, messageType, attachmentUrl, attachmentName, attachmentType, attachmentSize } = req.body;
      const attachment = attachmentUrl ? {
        url: attachmentUrl,
        name: attachmentName || 'file',
        type: attachmentType || 'application/octet-stream',
        size: attachmentSize || 0,
      } : undefined;
      const message = await consultationService.sendMessage(
        req.params.id as string, req.user.id, content, messageType, attachment
      );
      res.status(201).json(message);
    } catch (error: any) {
      logger.error('Failed to send message', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  }) as any);

  // POST /api/consultations/:id/typing — fire-and-forget typing indicator
  router.post('/:id/typing', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const { getConsultationMessageBus } = await import('../services/consultation-message-bus.js');
      getConsultationMessageBus().publishTyping(req.params.id as string, req.user.id, req.user.name);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }) as any);

  // POST /api/consultations/:id/review — submit review
  router.post('/:id/review', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const review = await consultationService.submitReview(req.params.id as string, req.user.id, req.body);
      res.status(201).json(review);
    } catch (error: any) {
      logger.error('Failed to submit review', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  }) as any);

  // ─── Dispute Routes ──────────────────────────────────────

  // POST /api/consultations/:id/dispute — raise a dispute
  router.post('/:id/dispute', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const { reason } = req.body;
      if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
        return res.status(400).json({ error: 'reason is required' });
      }
      const result = await consultationService.raiseDispute(
        req.params.id as string, req.user.id, reason.trim()
      );
      res.status(201).json(result);
    } catch (error: any) {
      logger.error('Failed to raise dispute', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  }) as any);

  // GET /api/consultations/:id/dispute — get dispute details
  router.get('/:id/dispute', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const dispute = await consultationService.getDispute(req.params.id as string, req.user.id);
      if (!dispute) return res.status(404).json({ error: 'No dispute found' });
      res.json(dispute);
    } catch (error: any) {
      logger.error('Failed to get dispute', { error: error.message });
      res.status(500).json({ error: 'Failed to get dispute' });
    }
  }) as any);

  // ─── Payout Routes ───────────────────────────────────────

  // GET /api/consultations/my-payouts — attorney's payout history
  // Note: registered AFTER /:id routes won't conflict because Express matches in order,
  // and this is already after parametric routes. We need to add it before /:id.
  // Actually we already have it registered here; the path 'my-payouts' won't match '/:id/dispute'.

  // ─── Admin Routes (require admin check) ──────────────────

  // Admin middleware for consultation admin routes
  const requireAdmin = async (req: DualAuthRequest, res: Response, next: NextFunction): Promise<any> => {
    if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
    if (!db) return res.status(500).json({ error: 'Admin routes not configured' });
    try {
      const result = await db.query('SELECT is_admin, role FROM users WHERE id = $1', [req.user.id]);
      if (!result.rows[0]?.is_admin && result.rows[0]?.role !== 'administrator') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      next();
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to verify admin access' });
    }
  };

  // GET /api/consultations/admin/disputes — list open disputes (admin)
  router.get('/admin/disputes', requireAdmin as any, (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const disputes = await consultationService.listOpenDisputes();
      res.json({ disputes });
    } catch (error: any) {
      logger.error('Failed to list disputes', { error: error.message });
      res.status(500).json({ error: 'Failed to list disputes' });
    }
  }) as any);

  // PUT /api/consultations/admin/disputes/:disputeId/resolve — resolve dispute (admin)
  router.put('/admin/disputes/:disputeId/resolve', requireAdmin as any, (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const { resolution, notes } = req.body;
      const validResolutions = ['refund_full', 'refund_partial', 'dismissed'];
      if (!resolution || !validResolutions.includes(resolution)) {
        return res.status(400).json({ error: 'resolution must be one of: refund_full, refund_partial, dismissed' });
      }
      const dispute = await consultationService.resolveDispute(
        req.params.disputeId as string, req.user!.id, resolution, notes
      );

      // Handle refund if resolution is refund
      if (resolution === 'refund_full' || resolution === 'refund_partial') {
        try {
          await consultationPaymentService.refundPayment(dispute.consultation_id);
        } catch (err: any) {
          logger.warn('Failed to refund payment after dispute resolution', { error: err.message });
        }
      }

      res.json(dispute);
    } catch (error: any) {
      logger.error('Failed to resolve dispute', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  }) as any);

  // GET /api/consultations/admin/payouts — pending payouts (admin)
  router.get('/admin/payouts', requireAdmin as any, (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!payoutService) return res.status(500).json({ error: 'Payout service not configured' });
      const payouts = await payoutService.listPendingPayouts();
      res.json({ payouts });
    } catch (error: any) {
      logger.error('Failed to list payouts', { error: error.message });
      res.status(500).json({ error: 'Failed to list payouts' });
    }
  }) as any);

  // PUT /api/consultations/admin/payouts/:id/process — mark payout as processed (admin)
  router.put('/admin/payouts/:id/process', requireAdmin as any, (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!payoutService) return res.status(500).json({ error: 'Payout service not configured' });
      const payout = await payoutService.markPayoutProcessed(
        req.params.id as string, req.user!.id, req.body.notes
      );
      res.json(payout);
    } catch (error: any) {
      logger.error('Failed to process payout', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  }) as any);

  return router;
}

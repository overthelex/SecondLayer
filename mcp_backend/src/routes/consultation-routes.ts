import { Router, Response } from 'express';
import { AuthenticatedRequest as DualAuthRequest } from '../middleware/dual-auth.js';
import { ConsultationService } from '../services/consultation-service.js';
import { ConsultationPaymentService } from '../services/consultation-payment-service.js';
import { logger } from '../utils/logger.js';

export function createConsultationRoutes(
  consultationService: ConsultationService,
  consultationPaymentService: ConsultationPaymentService
): Router {
  const router = Router();

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
      const consultation = await consultationService.acceptConsultation(
        req.params.id as string, req.user.id, req.body.agreedFee
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

  // POST /api/consultations/:id/messages — send message
  router.post('/:id/messages', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const message = await consultationService.sendMessage(
        req.params.id as string, req.user.id, req.body.content, req.body.messageType
      );
      res.status(201).json(message);
    } catch (error: any) {
      logger.error('Failed to send message', { error: error.message });
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

  return router;
}

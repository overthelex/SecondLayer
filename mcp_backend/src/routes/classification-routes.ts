import { Router, Request, Response } from 'express';
import { AuthenticatedRequest as DualAuthRequest } from '../middleware/dual-auth.js';
import { DocumentClassificationService } from '../services/document-classification-service.js';
import { logger } from '../utils/logger.js';

export function createClassificationRoutes(
  classificationService: DocumentClassificationService
): Router {
  const router = Router();

  // POST /api/documents/classify — Start batch classification
  router.post('/', (async (req: DualAuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { concurrency = 3, documentIds } = req.body;
      const clampedConcurrency = Math.min(Math.max(1, concurrency), 10);

      const job = await classificationService.startClassification(
        userId,
        clampedConcurrency,
        documentIds
      );

      res.status(202).json(job);
    } catch (error: any) {
      logger.error('Failed to start classification', { error: error.message });
      res.status(500).json({ error: 'Failed to start classification', message: error.message });
    }
  }) as any);

  // GET /api/documents/classify/:jobId — Get job status
  router.get('/:jobId', (async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const jobId = req.params.jobId as string;
      const job = classificationService.getJobStatus(jobId);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      if (job.userId !== userId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      res.json(job);
    } catch (error: any) {
      logger.error('Failed to get classification status', { error: error.message });
      res.status(500).json({ error: 'Failed to get status', message: error.message });
    }
  }) as any);

  // POST /api/documents/classify/dismiss — Dismiss all unclassified docs
  router.post('/dismiss', (async (req: DualAuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const count = await classificationService.dismissUnclassified(userId);
      res.json({ dismissed: count });
    } catch (error: any) {
      logger.error('Failed to dismiss classification queue', { error: error.message });
      res.status(500).json({ error: 'Failed to dismiss', message: error.message });
    }
  }) as any);

  // POST /api/documents/classify/:jobId/cancel — Cancel job
  router.post('/:jobId/cancel', (async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const jobId = req.params.jobId as string;
      const job = classificationService.getJobStatus(jobId);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      if (job.userId !== userId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const cancelled = classificationService.cancelJob(jobId);
      res.json({ cancelled });
    } catch (error: any) {
      logger.error('Failed to cancel classification', { error: error.message });
      res.status(500).json({ error: 'Failed to cancel', message: error.message });
    }
  }) as any);

  return router;
}

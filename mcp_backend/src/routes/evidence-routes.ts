/**
 * Evidence routes — API endpoints for the right panel tabs.
 *
 * GET /api/conversations/:id/decisions      — Рішення, Вирок, Постанова
 * GET /api/conversations/:id/court-documents — Ухвала, Окрема думка, Окрема ухвала
 * GET /api/conversations/:id/regulations    — Legislation citations
 */

import { Router, type Response } from 'express';
import type { AuthenticatedRequest as DualAuthRequest } from '../middleware/dual-auth.js';
import { ConversationEvidenceService } from '../services/conversation-evidence-service.js';
import { logger } from '../utils/logger.js';

export function createEvidenceRoutes(evidenceService: ConversationEvidenceService): Router {
  const router = Router({ mergeParams: true });

  // GET /api/conversations/:id/decisions
  router.get('/:id/decisions', (async (req: DualAuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

      const decisions = await evidenceService.getDecisions(String(req.params.id), userId);
      res.json({ decisions, total: decisions.length });
    } catch (err: any) {
      logger.error('[EvidenceRoutes] getDecisions error', { error: err.message });
      res.status(500).json({ error: 'Помилка отримання рішень' });
    }
  }) as any);

  // GET /api/conversations/:id/court-documents
  router.get('/:id/court-documents', (async (req: DualAuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

      const documents = await evidenceService.getCourtDocuments(String(req.params.id), userId);
      res.json({ documents, total: documents.length });
    } catch (err: any) {
      logger.error('[EvidenceRoutes] getCourtDocuments error', { error: err.message });
      res.status(500).json({ error: 'Помилка отримання документів' });
    }
  }) as any);

  // GET /api/conversations/:id/regulations
  router.get('/:id/regulations', (async (req: DualAuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Не авторизовано' });

      const regulations = await evidenceService.getRegulations(String(req.params.id), userId);
      res.json({ regulations, total: regulations.length });
    } catch (err: any) {
      logger.error('[EvidenceRoutes] getRegulations error', { error: err.message });
      res.status(500).json({ error: 'Помилка отримання норм' });
    }
  }) as any);

  return router;
}

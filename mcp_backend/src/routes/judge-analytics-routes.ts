import { Router, Response } from 'express';
import { JudgeAnalyticsService } from '../services/judge-analytics-service.js';
import { logger } from '../utils/logger.js';

export function createJudgeAnalyticsRoutes(service: JudgeAnalyticsService): Router {
  const router = Router();

  // GET /api/judge-analytics — paginated list with filters
  router.get('/', async (req: any, res: Response) => {
    try {
      const filters = {
        search: req.query.search as string | undefined,
        court_name: req.query.court_name as string | undefined,
        instance_code: req.query.instance_code ? parseInt(req.query.instance_code as string) : undefined,
        justice_kind: req.query.justice_kind as string | undefined,
        sort_by: req.query.sort_by as string | undefined,
        sort_order: (req.query.sort_order as 'asc' | 'desc') || undefined,
        limit: Math.min(parseInt(req.query.limit as string) || 25, 200),
        offset: parseInt(req.query.offset as string) || 0,
      };

      const result = await service.getAnalyticsList(filters);
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[JudgeAnalytics] list error', { error: msg });
      res.status(500).json({ error: msg });
    }
  });

  // GET /api/judge-analytics/:id — detail by dossier_number, id, or judge_name
  router.get('/:id', async (req: any, res: Response) => {
    try {
      const { id } = req.params;
      const record = await service.getAnalyticsDetail(id);
      if (!record) {
        return res.status(404).json({ error: 'Аналітику для цього судді не знайдено' });
      }
      res.json(record);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[JudgeAnalytics] detail error', { error: msg, id: req.params.id });
      res.status(500).json({ error: msg });
    }
  });

  return router;
}

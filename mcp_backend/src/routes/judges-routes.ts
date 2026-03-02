import { Router, Response } from 'express';
import { JudgesService } from '../services/judges-service.js';
import { logger } from '../utils/logger.js';

export function createJudgesRoutes(judgesService: JudgesService): Router {
  const router = Router();

  router.get('/', async (req: any, res: Response) => {
    try {
      const search = req.query.search as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = parseInt(req.query.offset as string) || 0;

      const result = await judgesService.getJudges(search, limit, offset);
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[Judges] list error', { error: msg });
      res.status(500).json({ error: msg });
    }
  });

  router.get('/:dossierNumber/profile', async (req: any, res: Response) => {
    try {
      const { dossierNumber } = req.params;
      const profile = await judgesService.getJudgeProfile(dossierNumber);
      if (!profile) {
        return res.status(404).json({ error: 'Judge not found' });
      }
      res.json(profile);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[Judges] profile error', { error: msg, dossier: req.params.dossierNumber });
      res.status(500).json({ error: msg });
    }
  });

  router.get('/:dossierNumber', async (req: any, res: Response) => {
    try {
      const { dossierNumber } = req.params;
      const judge = await judgesService.getJudgeByDossier(dossierNumber);
      if (!judge) {
        return res.status(404).json({ error: 'Judge not found' });
      }
      res.json(judge);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[Judges] get by dossier error', { error: msg });
      res.status(500).json({ error: msg });
    }
  });

  return router;
}

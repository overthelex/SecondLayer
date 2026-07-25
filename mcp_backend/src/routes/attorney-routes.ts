import { Router, Response } from 'express';
import { AuthenticatedRequest as DualAuthRequest } from '../middleware/dual-auth.js';
import { AttorneyProfileService } from '../services/attorney-profile-service.js';
import { logger } from '../utils/logger.js';

export function createAttorneyRoutes(
  attorneyProfileService: AttorneyProfileService
): Router {
  const router = Router();

  // GET /api/attorneys — search attorneys (public, optional auth)
  router.get('/', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const { specialization, region, city, courtType, language,
              minRating, maxFee, minFee, freeConsultation, servesRemotely,
              sortBy, limit, offset } = req.query as any;

      const result = await attorneyProfileService.searchAttorneys({
        specialization, region, city, courtType, language,
        minRating: minRating ? parseFloat(minRating) : undefined,
        maxFee: maxFee ? parseFloat(maxFee) : undefined,
        minFee: minFee ? parseFloat(minFee) : undefined,
        freeConsultation: freeConsultation === 'true',
        servesRemotely: servesRemotely === 'true' ? true : undefined,
        sortBy,
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      });

      res.json(result);
    } catch (error: any) {
      logger.error('Failed to search attorneys', { error: error.message });
      res.status(500).json({ error: 'Failed to search attorneys' });
    }
  }) as any);

  // GET /api/attorneys/profile/me — own profile (requires auth)
  router.get('/profile/me', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const profile = await attorneyProfileService.getProfile(req.user.id);
      if (!profile) return res.status(404).json({ error: 'Attorney profile not found' });
      res.json(profile);
    } catch (error: any) {
      logger.error('Failed to get own attorney profile', { error: error.message });
      res.status(500).json({ error: 'Failed to get profile' });
    }
  }) as any);

  // POST /api/attorneys/profile — create profile (requires auth)
  router.post('/profile', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const profile = await attorneyProfileService.createProfile(req.user.id, req.body);
      res.status(201).json(profile);
    } catch (error: any) {
      logger.error('Failed to create attorney profile', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  }) as any);

  // PUT /api/attorneys/profile — update profile (requires auth)
  router.put('/profile', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const profile = await attorneyProfileService.updateProfile(req.user.id, req.body);
      res.json(profile);
    } catch (error: any) {
      logger.error('Failed to update attorney profile', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  }) as any);

  // GET /api/attorneys/:id — public profile
  router.get('/:id', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const profile = await attorneyProfileService.getPublicProfile(req.params.id as string);
      if (!profile) return res.status(404).json({ error: 'Attorney not found' });
      res.json(profile);
    } catch (error: any) {
      logger.error('Failed to get attorney profile', { error: error.message });
      res.status(500).json({ error: 'Failed to get profile' });
    }
  }) as any);

  // GET /api/attorneys/:id/reviews — attorney reviews
  router.get('/:id/reviews', (async (req: DualAuthRequest, res: Response): Promise<any> => {
    try {
      const { limit, offset } = req.query as any;
      const result = await attorneyProfileService.getReviews(req.params.id as string, {
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      });
      res.json(result);
    } catch (error: any) {
      logger.error('Failed to get attorney reviews', { error: error.message });
      res.status(500).json({ error: 'Failed to get reviews' });
    }
  }) as any);

  return router;
}

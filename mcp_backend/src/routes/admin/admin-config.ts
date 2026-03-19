/**
 * Admin Config Routes — API key management, system settings, system configuration
 */

import { Router, Request, Response } from 'express';
import type { IDatabase } from '../../domain/ports/index.js';
import { UserPreferencesService } from '../../services/user-preferences-service.js';
import { PricingService } from '../../services/pricing-service.js';
import { ConfigService } from '../../services/config-service.js';
import { logger } from '../../utils/logger.js';
import { getStringParam, type LogAdminAction } from './admin-middleware.js';

export function createAdminConfigRoutes(
  db: IDatabase,
  logAdminAction: LogAdminAction,
  preferencesService: UserPreferencesService,
  pricing: PricingService,
  configService?: ConfigService,
): Router {
  const router = Router();

  // ========================================
  // API KEY MANAGEMENT
  // ========================================

  router.get('/api-keys', async (req: Request, res: Response) => {
    try {
      res.json({
        message: 'API key management not yet implemented',
        keys: [],
      });
    } catch (error: any) {
      logger.error('Failed to list API keys', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve API keys' });
    }
  });

  // ========================================
  // SYSTEM SETTINGS
  // ========================================

  router.get('/settings', async (req: Request, res: Response) => {
    try {
      const tiers = await pricing.getAllTiersAsync();
      const presets = await preferencesService.getAllPresets();

      res.json({
        pricing_tiers: tiers,
        request_presets: presets,
      });
    } catch (error: any) {
      logger.error('Failed to get settings', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve settings' });
    }
  });

  // ========================================
  // SYSTEM CONFIGURATION
  // ========================================

  router.get('/config', async (req: Request, res: Response) => {
    try {
      if (!configService) {
        return res.status(503).json({ error: 'Config service not available' });
      }
      const result = await configService.getAll();
      res.json(result);
    } catch (error: any) {
      logger.error('Failed to get system config', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve configuration' });
    }
  });

  router.put('/config/:key', async (req: Request, res: Response) => {
    try {
      if (!configService) {
        return res.status(503).json({ error: 'Config service not available' });
      }
      const key = getStringParam(req.params.key);
      if (!key) return res.status(400).json({ error: 'Key is required' });

      const { value } = req.body;
      if (value === undefined || value === null) {
        return res.status(400).json({ error: 'Value is required' });
      }

      const adminId = (req as any).user?.id;
      await configService.set(key, String(value), adminId);

      await logAdminAction(adminId, 'config_update', null, key, { value: String(value) }, req);

      res.json({ success: true, key, value: String(value) });
    } catch (error: any) {
      logger.error('Failed to update config', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  router.delete('/config/:key', async (req: Request, res: Response) => {
    try {
      if (!configService) {
        return res.status(503).json({ error: 'Config service not available' });
      }
      const key = getStringParam(req.params.key);
      if (!key) return res.status(400).json({ error: 'Key is required' });

      const adminId = (req as any).user?.id;
      await configService.delete(key, adminId);

      await logAdminAction(adminId, 'config_reset', null, key, {}, req);

      res.json({ success: true, key });
    } catch (error: any) {
      logger.error('Failed to reset config', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}

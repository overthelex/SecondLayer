/**
 * Billing and User Preferences API Routes
 * Handles preferences, cost estimation, billing-info, and payment methods.
 *
 * NOTE: Routes for /balance, /history, /settings, /statistics, /invoices are
 * handled by billing-inline-routes.ts (registered first at /api/billing).
 * This router only adds routes that billing-inline-routes.ts does NOT define.
 */

import express, { Request, Response } from 'express';
import { BillingService } from '../services/billing-service.js';
import { UserPreferencesService } from '../services/user-preferences-service.js';
import { logger } from '../utils/logger.js';

export function createBillingRoutes(
  billingService: BillingService,
  preferencesService: UserPreferencesService,
  _pricingService: unknown
): express.Router {
  const router = express.Router();

  /**
   * GET /api/billing/pricing-info
   * Get user's current pricing tier and available tiers
   */
  router.get('/pricing-info', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const pricingInfo = await billingService.getUserPricingInfo(userId);
      const allTiers = billingService.getAllPricingTiers();

      res.json({
        current_tier: pricingInfo.current_tier,
        tier_config: pricingInfo.tier_config,
        recommended_tier: pricingInfo.recommended_tier,
        monthly_spending_usd: pricingInfo.monthly_spending_usd,
        available_tiers: allTiers,
      });
    } catch (error: any) {
      logger.error('Failed to get pricing info', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve pricing information' });
    }
  });

  /**
   * GET /api/billing/billing-info
   * Get user's billing info (company details for invoicing)
   */
  router.get('/billing-info', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const info = await billingService.getBillingInfo(userId);
      res.json(info);
    } catch (error: any) {
      logger.error('Failed to get billing info', { error: error.message });
      res.status(500).json({ error: 'Не вдалося отримати платіжну інформацію' });
    }
  });

  /**
   * PUT /api/billing/billing-info
   * Update user's billing info (company details for invoicing)
   */
  router.put('/billing-info', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      await billingService.updateBillingInfo(userId, req.body);
      res.json({ success: true, message: 'Платіжну інформацію збережено' });
    } catch (error: any) {
      logger.error('Failed to update billing info', { error: error.message });
      res.status(500).json({ error: 'Не вдалося зберегти платіжну інформацію' });
    }
  });

  /**
   * GET /api/billing/payment-methods
   * Get user's saved payment methods
   */
  router.get('/payment-methods', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const methods = await billingService.getPaymentMethods(userId);
      res.json({ paymentMethods: methods });
    } catch (error: any) {
      logger.error('Failed to get payment methods', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve payment methods' });
    }
  });

  /**
   * DELETE /api/billing/payment-methods/:id
   * Remove a saved payment method
   */
  router.delete('/payment-methods/:id', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      await billingService.removePaymentMethod(userId, req.params.id as string);
      res.json({ success: true, message: 'Payment method removed' });
    } catch (error: any) {
      logger.error('Failed to remove payment method', { error: error.message });
      res.status(error.message === 'Payment method not found' ? 404 : 500).json({ error: error.message });
    }
  });

  /**
   * PUT /api/billing/payment-methods/:id/primary
   * Set a payment method as primary
   */
  router.put('/payment-methods/:id/primary', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      await billingService.setPrimaryPaymentMethod(userId, req.params.id as string);
      res.json({ success: true, message: 'Primary payment method updated' });
    } catch (error: any) {
      logger.error('Failed to set primary payment method', { error: error.message });
      res.status(error.message === 'Payment method not found' ? 404 : 500).json({ error: error.message });
    }
  });

  /**
   * GET /api/billing/preferences
   * Get user's request preferences
   */
  router.get('/preferences', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const preferences = await preferencesService.getUserPreferences(userId);

      res.json(preferences);
    } catch (error: any) {
      logger.error('Failed to get user preferences', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve preferences' });
    }
  });

  /**
   * PUT /api/billing/preferences
   * Update user's request preferences
   */
  router.put('/preferences', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const preferences = req.body;
      const updated = await preferencesService.upsertPreferences(userId, preferences);

      res.json(updated);
    } catch (error: any) {
      logger.error('Failed to update user preferences', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * POST /api/billing/preferences/preset
   * Apply a preset configuration to user preferences
   */
  router.post('/preferences/preset', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { preset } = req.body;
      if (!preset || !['economy', 'balanced', 'quality'].includes(preset)) {
        return res.status(400).json({ error: 'Invalid preset. Must be economy, balanced, or quality' });
      }

      const updated = await preferencesService.applyPreset(userId, preset);

      res.json({ success: true, preferences: updated });
    } catch (error: any) {
      logger.error('Failed to apply preset', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * GET /api/billing/presets
   * Get all available preset configurations
   */
  router.get('/presets', async (req: Request, res: Response) => {
    try {
      const presets = await preferencesService.getAllPresets();
      res.json({ presets });
    } catch (error: any) {
      logger.error('Failed to get presets', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve presets' });
    }
  });

  /**
   * POST /api/billing/estimate-costs
   * Estimate costs for different presets based on query
   */
  router.post('/estimate-costs', async (req: Request, res: Response) => {
    try {
      const { query, queryLength } = req.body;
      const length = queryLength || query?.length || 100;

      const estimates = await preferencesService.estimateCostsForPresets(length);

      res.json({ estimates });
    } catch (error: any) {
      logger.error('Failed to estimate costs', { error: error.message });
      res.status(500).json({ error: 'Failed to estimate costs' });
    }
  });

  /**
   * GET /api/billing/full-settings
   * Get combined billing and preference settings
   */
  router.get('/full-settings', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const settings = await preferencesService.getUserFullSettings(userId);

      if (!settings) {
        return res.status(404).json({ error: 'User settings not found' });
      }

      res.json(settings);
    } catch (error: any) {
      logger.error('Failed to get full settings', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve settings' });
    }
  });

  /**
   * POST /api/billing/estimate-price
   * Calculate estimated price for a given cost with user's tier
   */
  router.post('/estimate-price', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const { costUsd } = req.body;
      if (costUsd === undefined || isNaN(Number(costUsd))) {
        return res.status(400).json({ error: 'costUsd is required and must be a number' });
      }

      const tier = await billingService.getUserPricingTier(userId);
      const priceCalc = billingService.calculateEstimatedPrice(Number(costUsd), tier);

      res.json(priceCalc);
    } catch (error: any) {
      logger.error('Failed to estimate price', { error: error.message });
      res.status(500).json({ error: 'Failed to estimate price' });
    }
  });

  return router;
}

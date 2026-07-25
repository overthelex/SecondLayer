/**
 * Admin Billing Routes — Pricing tiers, subscriptions, service pricing, tool pricing,
 * volume discounts, organizations
 */

import { Router, Request, Response } from 'express';
import type { IDatabase } from '../../domain/ports/index.js';
import { PricingService } from '../../services/pricing-service.js';
import { SubscriptionService } from '../../services/subscription-service.js';
import { logger } from '../../utils/logger.js';
import { getStringParam, type LogAdminAction } from './admin-middleware.js';

export function createAdminBillingRoutes(
  db: IDatabase,
  logAdminAction: LogAdminAction,
  pricing: PricingService,
  subscriptions: SubscriptionService,
): Router {
  const router = Router();

  // ========================================
  // BILLING TIERS
  // ========================================

  /**
   * GET /api/admin/billing/tiers
   */
  router.get('/billing/tiers', async (_req: Request, res: Response) => {
    try {
      const result = await db.query(`
        SELECT id, tier_key, display_name, markup_percentage, description,
               features, default_daily_limit_usd, default_monthly_limit_usd,
               is_default, is_active, sort_order, created_at, updated_at
        FROM billing_tiers
        ORDER BY sort_order ASC, tier_key ASC
      `);
      const tiers = result.rows.map((row: any) => ({
        ...row,
        markup_percentage: parseFloat(row.markup_percentage),
        default_daily_limit_usd: parseFloat(row.default_daily_limit_usd),
        default_monthly_limit_usd: parseFloat(row.default_monthly_limit_usd),
        features: row.features || [],
      }));
      res.json({ tiers });
    } catch (error: any) {
      logger.error('Failed to get billing tiers', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve billing tiers' });
    }
  });

  /**
   * PUT /api/admin/billing/tiers/:idOrKey
   */
  router.put('/billing/tiers/:idOrKey', async (req: Request, res: Response) => {
    try {
      const idOrKey = getStringParam(req.params.idOrKey);
      if (!idOrKey) return res.status(400).json({ error: 'Tier identifier is required' });

      const { display_name, markup_percentage, description, features, default_daily_limit_usd, default_monthly_limit_usd } = req.body;

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrKey);
      const whereClause = isUuid ? 'id = $1' : 'tier_key = $1';

      const updates: string[] = [];
      const params: any[] = [idOrKey];
      let paramCount = 1;

      if (display_name !== undefined) { paramCount++; updates.push(`display_name = $${paramCount}`); params.push(display_name); }
      if (markup_percentage !== undefined) { paramCount++; updates.push(`markup_percentage = $${paramCount}`); params.push(markup_percentage); }
      if (description !== undefined) { paramCount++; updates.push(`description = $${paramCount}`); params.push(description); }
      if (features !== undefined) { paramCount++; updates.push(`features = $${paramCount}`); params.push(JSON.stringify(features)); }
      if (default_daily_limit_usd !== undefined) { paramCount++; updates.push(`default_daily_limit_usd = $${paramCount}`); params.push(default_daily_limit_usd); }
      if (default_monthly_limit_usd !== undefined) { paramCount++; updates.push(`default_monthly_limit_usd = $${paramCount}`); params.push(default_monthly_limit_usd); }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updates.push('updated_at = NOW()');

      const result = await db.query(
        `UPDATE billing_tiers SET ${updates.join(', ')} WHERE ${whereClause} RETURNING tier_key`,
        params
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Tier not found' });
      }

      try { await pricing.updateTier(result.rows[0].tier_key, req.body); } catch { /* cache update is best-effort */ }

      await logAdminAction((req as any).user.id, 'update_billing_tier', null, idOrKey, req.body, req);
      res.json({ success: true });
    } catch (error: any) {
      logger.error('Failed to update billing tier', { error: error.message });
      res.status(500).json({ error: 'Failed to update billing tier' });
    }
  });

  /**
   * PUT /api/admin/billing/tiers/:id/default
   */
  router.put('/billing/tiers/:id/default', async (req: Request, res: Response) => {
    try {
      const id = getStringParam(req.params.id);
      if (!id) return res.status(400).json({ error: 'Tier id is required' });

      await db.query('UPDATE billing_tiers SET is_default = false, updated_at = NOW()');
      const result = await db.query(
        'UPDATE billing_tiers SET is_default = true, updated_at = NOW() WHERE id = $1 RETURNING tier_key',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Tier not found' });
      }

      await logAdminAction((req as any).user.id, 'set_default_tier', null, id, { tier_key: result.rows[0].tier_key }, req);
      res.json({ success: true });
    } catch (error: any) {
      logger.error('Failed to set default tier', { error: error.message });
      res.status(500).json({ error: 'Failed to set default tier' });
    }
  });

  /**
   * DELETE /api/admin/billing/tiers/:id
   */
  router.delete('/billing/tiers/:id', async (req: Request, res: Response) => {
    try {
      const id = getStringParam(req.params.id);
      if (!id) return res.status(400).json({ error: 'Tier id is required' });

      const result = await db.query(
        'UPDATE billing_tiers SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING tier_key',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Tier not found' });
      }

      await logAdminAction((req as any).user.id, 'deactivate_billing_tier', null, id, { tier_key: result.rows[0].tier_key }, req);
      res.json({ success: true });
    } catch (error: any) {
      logger.error('Failed to deactivate billing tier', { error: error.message });
      res.status(500).json({ error: 'Failed to deactivate billing tier' });
    }
  });

  // ========================================
  // VOLUME DISCOUNTS
  // ========================================

  router.get('/billing/volume-discounts', async (_req: Request, res: Response) => {
    try {
      const result = await db.query(
        'SELECT id, min_monthly_spend_usd, discount_percentage FROM volume_discount_thresholds ORDER BY min_monthly_spend_usd ASC'
      );
      const discounts = result.rows.map((row: any) => ({
        ...row,
        min_monthly_spend_usd: parseFloat(row.min_monthly_spend_usd),
        discount_percentage: parseFloat(row.discount_percentage),
      }));
      res.json({ discounts });
    } catch (error: any) {
      logger.error('Failed to get volume discounts', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve volume discounts' });
    }
  });

  router.put('/billing/volume-discounts', async (req: Request, res: Response) => {
    try {
      const { thresholds } = req.body;
      if (!Array.isArray(thresholds)) {
        return res.status(400).json({ error: 'thresholds must be an array' });
      }

      await db.transaction(async (client) => {
        await client.query('DELETE FROM volume_discount_thresholds');
        for (const t of thresholds) {
          await client.query(
            'INSERT INTO volume_discount_thresholds (min_monthly_spend_usd, discount_percentage) VALUES ($1, $2)',
            [t.min_monthly_spend_usd, t.discount_percentage]
          );
        }
      });

      await logAdminAction((req as any).user.id, 'update_volume_discounts', null, null, { count: thresholds.length }, req);
      res.json({ success: true });
    } catch (error: any) {
      logger.error('Failed to update volume discounts', { error: error.message });
      res.status(500).json({ error: 'Failed to update volume discounts' });
    }
  });

  // ========================================
  // ORGANIZATIONS
  // ========================================

  router.get('/billing/organizations', async (_req: Request, res: Response) => {
    try {
      const result = await db.query(`
        SELECT
          o.id, o.name, o.plan, o.max_members,
          o.billing_tier_key, o.billing_email,
          COALESCE(o.balance_usd, 0) as balance_usd,
          COALESCE(o.total_spent_usd, 0) as total_spent_usd,
          o.created_at,
          (SELECT COUNT(*) FROM organization_members om WHERE om.organization_id = o.id) as member_count,
          u.email as owner_email,
          u.name as owner_name
        FROM organizations o
        LEFT JOIN organization_members om_owner ON o.id = om_owner.organization_id AND om_owner.role = 'owner'
        LEFT JOIN users u ON om_owner.user_id = u.id
        ORDER BY o.created_at DESC
      `);
      const organizations = result.rows.map((row: any) => ({
        ...row,
        balance_usd: parseFloat(row.balance_usd),
        total_spent_usd: parseFloat(row.total_spent_usd),
        member_count: parseInt(row.member_count),
      }));
      res.json({ organizations });
    } catch (error: any) {
      logger.error('Failed to list organizations', { error: error.message });
      res.status(500).json({ error: 'Failed to list organizations' });
    }
  });

  router.get('/billing/organizations/:id', async (req: Request, res: Response) => {
    try {
      const id = getStringParam(req.params.id);
      if (!id) return res.status(400).json({ error: 'Organization id is required' });

      const orgResult = await db.query('SELECT * FROM organizations WHERE id = $1', [id]);
      if (orgResult.rows.length === 0) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      const membersResult = await db.query(`
        SELECT om.user_id, om.role, om.joined_at, u.email, u.name
        FROM organization_members om
        JOIN users u ON om.user_id = u.id
        WHERE om.organization_id = $1
        ORDER BY om.role ASC, om.joined_at ASC
      `, [id]);

      res.json({
        organization: orgResult.rows[0],
        members: membersResult.rows,
      });
    } catch (error: any) {
      logger.error('Failed to get organization details', { error: error.message });
      res.status(500).json({ error: 'Failed to get organization details' });
    }
  });

  router.put('/billing/organizations/:id', async (req: Request, res: Response) => {
    try {
      const id = getStringParam(req.params.id);
      if (!id) return res.status(400).json({ error: 'Organization id is required' });

      const { plan, max_members, billing_tier_key, billing_email } = req.body;

      const updates: string[] = [];
      const params: any[] = [id];
      let paramCount = 1;

      if (plan !== undefined) { paramCount++; updates.push(`plan = $${paramCount}`); params.push(plan); }
      if (max_members !== undefined) { paramCount++; updates.push(`max_members = $${paramCount}`); params.push(max_members); }
      if (billing_tier_key !== undefined) { paramCount++; updates.push(`billing_tier_key = $${paramCount}`); params.push(billing_tier_key || null); }
      if (billing_email !== undefined) { paramCount++; updates.push(`billing_email = $${paramCount}`); params.push(billing_email || null); }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updates.push('updated_at = NOW()');

      const result = await db.query(
        `UPDATE organizations SET ${updates.join(', ')} WHERE id = $1 RETURNING id`,
        params
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      await logAdminAction((req as any).user.id, 'update_organization', null, id, req.body, req);
      res.json({ success: true });
    } catch (error: any) {
      logger.error('Failed to update organization', { error: error.message });
      res.status(500).json({ error: 'Failed to update organization' });
    }
  });

  // ========================================
  // SUBSCRIPTIONS
  // ========================================

  router.put('/billing/subscriptions/:id/cancel', async (req: Request, res: Response) => {
    try {
      const id = getStringParam(req.params.id);
      if (!id) return res.status(400).json({ error: 'Subscription id is required' });

      const { reason } = req.body;
      const result = await subscriptions.cancel(id, reason || 'Admin canceled');

      if (!result) {
        return res.status(404).json({ error: 'Subscription not found' });
      }

      await logAdminAction((req as any).user.id, 'cancel_subscription', null, id, { reason }, req);
      res.json(result);
    } catch (error: any) {
      logger.error('Failed to cancel subscription', { error: error.message });
      res.status(500).json({ error: 'Failed to cancel subscription' });
    }
  });

  router.put('/billing/subscriptions/:id/activate', async (req: Request, res: Response) => {
    try {
      const id = getStringParam(req.params.id);
      if (!id) return res.status(400).json({ error: 'Subscription id is required' });

      const result = await subscriptions.activate(id);

      if (!result) {
        return res.status(404).json({ error: 'Subscription not found' });
      }

      await logAdminAction((req as any).user.id, 'activate_subscription', null, id, {}, req);
      res.json(result);
    } catch (error: any) {
      logger.error('Failed to activate subscription', { error: error.message });
      res.status(500).json({ error: 'Failed to activate subscription' });
    }
  });

  router.get('/billing/subscriptions', async (req: Request, res: Response) => {
    try {
      const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
      const offset = Math.max(0, Number(req.query.offset || 0));
      const status = req.query.status as string | undefined;

      const result = await subscriptions.list({ limit, offset, status });
      res.json(result);
    } catch (error: any) {
      logger.error('Failed to list subscriptions', { error: error.message });
      res.status(500).json({ error: 'Failed to list subscriptions' });
    }
  });

  router.post('/billing/subscriptions', async (req: Request, res: Response) => {
    try {
      const sub = await subscriptions.create({
        ...req.body,
        created_by: (req as any).user.id,
      });

      await logAdminAction((req as any).user.id, 'create_subscription', req.body.user_id || null, sub.id, req.body, req);
      res.status(201).json(sub);
    } catch (error: any) {
      logger.error('Failed to create subscription', { error: error.message });
      res.status(500).json({ error: 'Failed to create subscription' });
    }
  });

  router.put('/billing/subscriptions/:id', async (req: Request, res: Response) => {
    try {
      const id = getStringParam(req.params.id);
      if (!id) return res.status(400).json({ error: 'id is required' });

      const updated = await subscriptions.update(id, req.body);
      await logAdminAction((req as any).user.id, 'update_subscription', null, id, req.body, req);
      res.json(updated);
    } catch (error: any) {
      logger.error('Failed to update subscription', { error: error.message });
      res.status(500).json({ error: 'Failed to update subscription' });
    }
  });

  router.delete('/billing/subscriptions/:id', async (req: Request, res: Response) => {
    try {
      const id = getStringParam(req.params.id);
      if (!id) return res.status(400).json({ error: 'id is required' });

      await subscriptions.remove(id);
      await logAdminAction((req as any).user.id, 'delete_subscription', null, id, {}, req);
      res.json({ success: true });
    } catch (error: any) {
      logger.error('Failed to delete subscription', { error: error.message });
      res.status(500).json({ error: 'Failed to delete subscription' });
    }
  });

  router.get('/billing/subscription-stats', async (_req: Request, res: Response) => {
    try {
      const stats = await subscriptions.getStats();
      res.json(stats);
    } catch (error: any) {
      logger.error('Failed to get subscription stats', { error: error.message });
      res.status(500).json({ error: 'Failed to get subscription stats' });
    }
  });

  // ========================================
  // SERVICE PRICING
  // ========================================

  router.get('/service-pricing', async (req: Request, res: Response) => {
    try {
      const result = await db.query(`
        SELECT
          id, provider, model, display_name, unit_type,
          price_usd::float AS price_usd, currency,
          sort_order, notes, is_active,
          updated_at, updated_by
        FROM service_pricing
        ORDER BY provider, sort_order, model, unit_type
      `);
      res.json({ pricing: result.rows });
    } catch (error: any) {
      logger.error('Failed to fetch service pricing', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch service pricing' });
    }
  });

  router.put('/service-pricing/:id', async (req: Request, res: Response) => {
    const id = getStringParam(req.params.id) as string;
    const { price_usd, notes, is_active } = req.body;

    if (price_usd === undefined || price_usd === null || isNaN(Number(price_usd))) {
      return res.status(400).json({ error: 'price_usd must be a valid number' });
    }
    if (Number(price_usd) < 0) {
      return res.status(400).json({ error: 'price_usd cannot be negative' });
    }

    try {
      const adminUser = (req as any).user;
      const result = await db.query(`
        UPDATE service_pricing
        SET price_usd = $1,
            notes = $2,
            is_active = $3,
            updated_at = NOW(),
            updated_by = $4
        WHERE id = $5
        RETURNING id, provider, model, display_name, unit_type,
                  price_usd::float AS price_usd, currency,
                  sort_order, notes, is_active, updated_at, updated_by
      `, [price_usd, notes ?? null, is_active ?? true, adminUser?.email || adminUser?.id || 'admin', id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Pricing entry not found' });
      }

      await logAdminAction(adminUser?.id, 'update_service_pricing', null, id, { price_usd, notes, is_active }, req);
      res.json({ pricing: result.rows[0] });
    } catch (error: any) {
      logger.error('Failed to update service pricing', { error: error.message, id });
      res.status(500).json({ error: 'Failed to update service pricing' });
    }
  });

  // ========================================
  // TOOL PRICING
  // ========================================

  router.get('/tool-pricing', async (req: Request, res: Response) => {
    try {
      const result = await db.query(`
        SELECT
          id, tool_name, service, display_name,
          base_cost_usd::float  AS base_cost_usd,
          markup_percent::float AS markup_percent,
          is_active, notes, updated_at, updated_by
        FROM tool_pricing
        ORDER BY service, display_name
      `);
      res.json({ tools: result.rows });
    } catch (error: any) {
      logger.error('Failed to fetch tool pricing', { error: error.message });
      res.status(500).json({ error: 'Failed to fetch tool pricing' });
    }
  });

  router.put('/tool-pricing/:toolName', async (req: Request, res: Response) => {
    const toolName = getStringParam(req.params.toolName) as string;
    const { base_cost_usd, markup_percent, notes, is_active } = req.body;

    if (base_cost_usd === undefined || base_cost_usd === null || isNaN(Number(base_cost_usd))) {
      return res.status(400).json({ error: 'base_cost_usd must be a valid number' });
    }
    if (Number(base_cost_usd) < 0) {
      return res.status(400).json({ error: 'base_cost_usd cannot be negative' });
    }
    if (markup_percent !== undefined && (isNaN(Number(markup_percent)) || Number(markup_percent) < -100)) {
      return res.status(400).json({ error: 'markup_percent must be a number >= -100' });
    }

    try {
      const adminUser = (req as any).user;
      const result = await db.query(`
        UPDATE tool_pricing
        SET base_cost_usd   = $1,
            markup_percent  = COALESCE($2, markup_percent),
            notes           = $3,
            is_active       = COALESCE($4, is_active),
            updated_at      = NOW(),
            updated_by      = $5
        WHERE tool_name = $6
        RETURNING
          id, tool_name, service, display_name,
          base_cost_usd::float  AS base_cost_usd,
          markup_percent::float AS markup_percent,
          is_active, notes, updated_at, updated_by
      `, [
        base_cost_usd,
        markup_percent ?? null,
        notes ?? null,
        is_active ?? null,
        adminUser?.email || adminUser?.id || 'admin',
        toolName,
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Tool not found' });
      }

      await logAdminAction(adminUser?.id, 'update_tool_pricing', null, toolName, { base_cost_usd, markup_percent, notes, is_active }, req);
      res.json({ tool: result.rows[0] });
    } catch (error: any) {
      logger.error('Failed to update tool pricing', { error: error.message, toolName });
      res.status(500).json({ error: 'Failed to update tool pricing' });
    }
  });

  router.post('/tool-pricing/bulk-markup', async (req: Request, res: Response) => {
    const { markup_percent, service } = req.body;

    if (markup_percent === undefined || isNaN(Number(markup_percent)) || Number(markup_percent) < -100) {
      return res.status(400).json({ error: 'markup_percent must be a number >= -100' });
    }

    try {
      const adminUser = (req as any).user;
      const params: any[] = [markup_percent, adminUser?.email || adminUser?.id || 'admin'];
      let query = `
        UPDATE tool_pricing
        SET markup_percent = $1,
            updated_at     = NOW(),
            updated_by     = $2
      `;
      if (service) {
        params.push(service);
        query += ` WHERE service = $3`;
      }
      query += ` RETURNING tool_name`;

      const result = await db.query(query, params);
      await logAdminAction(adminUser?.id, 'bulk_update_tool_markup', null, service || 'all', { markup_percent, service }, req);
      res.json({ updated: result.rowCount, markup_percent });
    } catch (error: any) {
      logger.error('Failed to bulk update tool markup', { error: error.message });
      res.status(500).json({ error: 'Failed to bulk update tool markup' });
    }
  });

  return router;
}

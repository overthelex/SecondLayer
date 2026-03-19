/**
 * Admin Users Routes — User management: list users, get user details,
 * update tier, adjust balance, update limits, password reset, user tags,
 * test user creation, attorney profiles, user requests
 */

import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { IDatabase } from '../../domain/ports/index.js';
import { logger } from '../../utils/logger.js';
import { getStringParam, type LogAdminAction } from './admin-middleware.js';

export function createAdminUsersRoutes(
  db: IDatabase,
  logAdminAction: LogAdminAction,
): Router {
  const router = Router();

  // ========================================
  // USER MANAGEMENT
  // ========================================

  /**
   * GET /api/admin/users
   * List all users with filtering and pagination
   */
  router.get('/users', async (req: Request, res: Response) => {
    try {
      const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
      const offset = Math.max(0, Number(req.query.offset || 0));
      const search = req.query.search as string | undefined;
      const tier = req.query.tier as string | undefined;
      const status = req.query.status as string | undefined;

      let whereClause = '1=1';
      const params: any[] = [];
      let paramCount = 0;

      if (search) {
        paramCount++;
        whereClause += ` AND (u.email ILIKE $${paramCount} OR u.name ILIKE $${paramCount} OR u.id::text ILIKE $${paramCount})`;
        params.push(`%${search}%`);
      }

      if (tier) {
        paramCount++;
        whereClause += ` AND ub.pricing_tier = $${paramCount}`;
        params.push(tier);
      }

      const tag = req.query.tag as string | undefined;

      if (status === 'active') {
        whereClause += ` AND EXISTS (
          SELECT 1 FROM cost_tracking ct
          WHERE ct.user_id = u.id
            AND ct.created_at >= CURRENT_DATE - INTERVAL '30 days'
        )`;
      } else if (status === 'inactive') {
        whereClause += ` AND NOT EXISTS (
          SELECT 1 FROM cost_tracking ct
          WHERE ct.user_id = u.id
            AND ct.created_at >= CURRENT_DATE - INTERVAL '30 days'
        )`;
      }

      if (tag) {
        paramCount++;
        whereClause += ` AND EXISTS (SELECT 1 FROM user_tags ut2 WHERE ut2.user_id = u.id AND ut2.tag = $${paramCount})`;
        params.push(tag);
      }

      const result = await db.query(`
        SELECT
          u.id,
          u.email,
          u.name,
          u.created_at,
          ub.balance_usd,
          ub.total_spent_usd,
          ub.pricing_tier,
          ub.daily_limit_usd,
          ub.monthly_limit_usd,
          (
            SELECT COUNT(*)
            FROM cost_tracking ct
            WHERE ct.user_id = u.id
          ) as total_requests,
          (
            SELECT MAX(created_at)
            FROM cost_tracking ct
            WHERE ct.user_id = u.id
          ) as last_request_at,
          EXISTS (
            SELECT 1 FROM user_tags ut
            WHERE ut.user_id = u.id AND ut.tag = 'crypto'
          ) as has_crypto_tag,
          EXISTS (
            SELECT 1 FROM user_tags ut3
            WHERE ut3.user_id = u.id AND ut3.tag = 'test'
          ) as has_test_tag
        FROM users u
        LEFT JOIN user_billing ub ON u.id = ub.user_id
        WHERE ${whereClause}
        ORDER BY u.created_at DESC
        LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
      `, [...params, limit, offset]);

      const countResult = await db.query(`
        SELECT COUNT(*) as total
        FROM users u
        LEFT JOIN user_billing ub ON u.id = ub.user_id
        WHERE ${whereClause}
      `, params);

      res.json({
        users: result.rows.map((row: any) => ({
          id: row.id,
          email: row.email,
          name: row.name || null,
          created_at: row.created_at,
          balance_usd: parseFloat(row.balance_usd || 0),
          total_spent_usd: parseFloat(row.total_spent_usd || 0),
          pricing_tier: row.pricing_tier || 'startup',
          daily_limit_usd: parseFloat(row.daily_limit_usd || 0),
          monthly_limit_usd: parseFloat(row.monthly_limit_usd || 0),
          total_requests: parseInt(row.total_requests || 0),
          last_request_at: row.last_request_at,
          has_crypto_tag: row.has_crypto_tag || false,
          has_test_tag: row.has_test_tag || false,
        })),
        pagination: {
          limit,
          offset,
          total: parseInt(countResult.rows[0].total),
        },
      });
    } catch (error: any) {
      logger.error('Failed to list users', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve users' });
    }
  });

  /**
   * GET /api/admin/users/activity
   * Recent activity feed across all users, sorted by most recent request.
   * IMPORTANT: must be registered BEFORE /users/:userId to avoid param collision.
   */
  router.get('/users/activity', async (req: Request, res: Response) => {
    try {
      const hours = Math.min(720, Math.max(1, Number(req.query.hours || 24)));
      const userLimit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
      const recentCount = Math.min(20, Math.max(1, Number(req.query.recent || 8)));

      const result = await db.query(`
        WITH active_users AS (
          SELECT
            u.id,
            u.email,
            u.name,
            u.picture,
            ub.pricing_tier,
            ub.balance_usd::float,
            COUNT(ct.id)::int                              AS requests_in_period,
            COALESCE(SUM(ct.total_cost_usd), 0)::float     AS cost_in_period,
            MAX(ct.created_at)                             AS last_request_at
          FROM users u
          JOIN user_billing ub ON ub.user_id = u.id
          JOIN cost_tracking ct ON ct.user_id = u.id
            AND ct.created_at >= NOW() - ($1 || ' hours')::interval
          GROUP BY u.id, u.email, u.name, u.picture, ub.pricing_tier, ub.balance_usd
          ORDER BY last_request_at DESC
          LIMIT $2
        ),
        ranked_requests AS (
          SELECT
            ct.user_id,
            ct.id,
            ct.tool_name,
            COALESCE(ct.user_query, '')                      AS user_query,
            ct.total_cost_usd::float,
            ct.execution_time_ms,
            ct.status,
            ct.created_at,
            ROW_NUMBER() OVER (PARTITION BY ct.user_id ORDER BY ct.created_at DESC) AS rn
          FROM cost_tracking ct
          WHERE ct.user_id IN (SELECT id FROM active_users)
            AND ct.created_at >= NOW() - ($1 || ' hours')::interval
        ),
        agg_requests AS (
          SELECT
            user_id,
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'id',               id,
                'tool_name',        tool_name,
                'user_query',       user_query,
                'total_cost_usd',   total_cost_usd,
                'execution_time_ms',execution_time_ms,
                'status',           status,
                'created_at',       created_at
              ) ORDER BY created_at DESC
            ) AS requests
          FROM ranked_requests
          WHERE rn <= $3
          GROUP BY user_id
        )
        SELECT
          au.*,
          COALESCE(ar.requests, '[]'::json) AS recent_requests
        FROM active_users au
        LEFT JOIN agg_requests ar ON ar.user_id = au.id
        ORDER BY au.last_request_at DESC
      `, [hours, userLimit, recentCount]);

      // Summary stats
      const statsResult = await db.query(`
        SELECT
          COUNT(DISTINCT user_id)::int           AS active_users,
          COUNT(*)::int                          AS total_requests,
          COALESCE(SUM(total_cost_usd), 0)::float AS total_cost
        FROM cost_tracking
        WHERE created_at >= NOW() - ($1 || ' hours')::interval
      `, [hours]);

      res.json({
        users: result.rows,
        stats: statsResult.rows[0],
        meta: { hours, limit: userLimit },
      });
    } catch (error: any) {
      logger.error('Failed to get user activity', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve user activity' });
    }
  });

  /**
   * GET /api/admin/users/:userId
   * Get detailed user information
   */
  router.get('/users/:userId', async (req: Request, res: Response) => {
    try {
      const userId = getStringParam(req.params.userId);

      const userResult = await db.query(`
        SELECT
          u.id,
          u.email,
          u.created_at,
          ub.balance_usd,
          ub.total_spent_usd,
          ub.pricing_tier,
          ub.daily_limit_usd,
          ub.monthly_limit_usd,
          urp.*
        FROM users u
        LEFT JOIN user_billing ub ON u.id = ub.user_id
        LEFT JOIN user_request_preferences urp ON u.id = urp.user_id
        WHERE u.id = $1
      `, [userId]);

      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Get recent transactions
      const transactions = await db.query(`
        SELECT *
        FROM billing_transactions
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 10
      `, [userId]);

      // Get usage stats
      const statsResult = await db.query(`
        SELECT
          COUNT(*) as total_requests,
          COALESCE(SUM(total_cost_usd), 0) as total_spent,
          COALESCE(AVG(total_cost_usd), 0) as avg_cost,
          MAX(created_at) as last_request
        FROM cost_tracking
        WHERE user_id = $1
      `, [userId]);

      res.json({
        user: userResult.rows[0],
        transactions: transactions.rows,
        stats: statsResult.rows[0],
      });
    } catch (error: any) {
      logger.error('Failed to get user details', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve user details' });
    }
  });

  /**
   * PUT /api/admin/users/:userId/tier
   * Update user's pricing tier
   */
  router.put('/users/:userId/tier', async (req: Request, res: Response) => {
    try {
      const userId = getStringParam(req.params.userId);
      const { tier } = req.body;

      if (!['free', 'startup', 'business', 'enterprise', 'internal', 'attorney'].includes(tier)) {
        return res.status(400).json({ error: 'Invalid pricing tier' });
      }

      // Get old tier for audit log
      const oldTierResult = await db.query(
        'SELECT pricing_tier FROM user_billing WHERE user_id = $1',
        [userId]
      );
      const oldTier = oldTierResult.rows[0]?.pricing_tier;

      await db.query(
        'UPDATE user_billing SET pricing_tier = $1, updated_at = NOW() WHERE user_id = $2',
        [tier, userId]
      );

      // Log admin action
      await logAdminAction(
        (req as any).user.id,
        'update_tier',
        userId,
        null,
        { old_tier: oldTier, new_tier: tier },
        req
      );

      logger.info('Admin updated user pricing tier', { userId, tier, admin: (req as any).user?.id });

      res.json({ success: true, message: 'Pricing tier updated' });
    } catch (error: any) {
      logger.error('Failed to update user tier', { error: error.message });
      res.status(500).json({ error: 'Failed to update tier' });
    }
  });

  /**
   * POST /api/admin/users/:userId/adjust-balance
   * Adjust user's balance (add/subtract funds)
   */
  router.post('/users/:userId/adjust-balance', async (req: Request, res: Response) => {
    try {
      const userId = getStringParam(req.params.userId);
      const { amount, reason } = req.body;

      if (typeof amount !== 'number' || isNaN(amount)) {
        return res.status(400).json({ error: 'Invalid amount' });
      }

      // Get current balance first
      const currentBalance = await db.query(
        'SELECT balance_usd FROM user_billing WHERE user_id = $1',
        [userId]
      );

      if (currentBalance.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const balanceBefore = parseFloat(currentBalance.rows[0].balance_usd);

      const result = await db.query(
        `UPDATE user_billing
         SET balance_usd = balance_usd + $1, updated_at = NOW()
         WHERE user_id = $2
         RETURNING balance_usd`,
        [amount, userId]
      );

      const balanceAfter = parseFloat(result.rows[0].balance_usd);

      // Create transaction record
      await db.query(`
        INSERT INTO billing_transactions
          (user_id, type, amount_usd, balance_before_usd, balance_after_usd, description, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        userId,
        amount > 0 ? 'admin_credit' : 'admin_debit',
        Math.abs(amount),
        balanceBefore,
        balanceAfter,
        reason || 'Admin balance adjustment',
        JSON.stringify({ reason, admin_id: (req as any).user?.id }),
      ]);

      // Log admin action
      await logAdminAction(
        (req as any).user.id,
        'adjust_balance',
        userId,
        null,
        { amount, reason, new_balance: parseFloat(result.rows[0].balance_usd) },
        req
      );

      logger.info('Admin adjusted user balance', {
        userId,
        amount,
        reason,
        admin: (req as any).user?.id
      });

      res.json({
        success: true,
        new_balance_usd: parseFloat(result.rows[0].balance_usd)
      });
    } catch (error: any) {
      logger.error('Failed to adjust balance', { error: error.message });
      res.status(500).json({ error: 'Failed to adjust balance' });
    }
  });

  /**
   * PUT /api/admin/users/:userId/limits
   * Update user's daily/monthly limits
   */
  router.put('/users/:userId/limits', async (req: Request, res: Response) => {
    try {
      const userId = getStringParam(req.params.userId);
      const { dailyLimitUsd, monthlyLimitUsd } = req.body;

      const updates: string[] = [];
      const params: any[] = [];
      let paramCount = 0;

      if (dailyLimitUsd !== undefined) {
        paramCount++;
        updates.push(`daily_limit_usd = $${paramCount}`);
        params.push(Number(dailyLimitUsd));
      }

      if (monthlyLimitUsd !== undefined) {
        paramCount++;
        updates.push(`monthly_limit_usd = $${paramCount}`);
        params.push(Number(monthlyLimitUsd));
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No limits provided' });
      }

      paramCount++;
      params.push(userId);

      await db.query(
        `UPDATE user_billing
         SET ${updates.join(', ')}, updated_at = NOW()
         WHERE user_id = $${paramCount}`,
        params
      );

      // Log admin action
      await logAdminAction(
        (req as any).user.id,
        'update_limits',
        userId,
        null,
        { daily_limit_usd: dailyLimitUsd, monthly_limit_usd: monthlyLimitUsd },
        req
      );

      logger.info('Admin updated user limits', { userId, dailyLimitUsd, monthlyLimitUsd });

      res.json({ success: true, message: 'Limits updated' });
    } catch (error: any) {
      logger.error('Failed to update limits', { error: error.message });
      res.status(500).json({ error: 'Failed to update limits' });
    }
  });

  // ========================================
  // PASSWORD RESET (ADMIN-GENERATED)
  // ========================================

  /**
   * POST /api/admin/users/:userId/reset-password
   */
  router.post('/users/:userId/reset-password', async (req: Request, res: Response) => {
    try {
      const userId = getStringParam(req.params.userId);
      if (!userId) return res.status(400).json({ error: 'Invalid user ID' });

      const userResult = await db.query('SELECT id, email FROM users WHERE id = $1', [userId]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Generate a 16-char secure random password
      const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*';
      const maxValid = 256 - (256 % charset.length);
      const chars: string[] = [];
      while (chars.length < 16) {
        const buf = crypto.randomBytes(16);
        for (const b of buf) {
          if (b < maxValid && chars.length < 16) {
            chars.push(charset[b % charset.length]);
          }
        }
      }
      const password = chars.join('');

      const passwordHash = await bcrypt.hash(password, 12);

      await db.query(
        `UPDATE users
         SET password_hash = $1,
             failed_login_attempts = 0,
             locked_until = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [passwordHash, userId]
      );

      await logAdminAction(
        (req as any).user.id,
        'reset_password',
        userId,
        null,
        { email: userResult.rows[0].email },
        req
      );

      logger.info('Admin reset password for user', {
        userId,
        email: userResult.rows[0].email,
        admin: (req as any).user?.id,
      });

      res.json({ success: true, password });
    } catch (error: any) {
      logger.error('Failed to reset user password', { error: error.message });
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  // ========================================
  // USER TAGS (CRYPTO)
  // ========================================

  router.get('/users/:userId/tags', async (req: Request, res: Response) => {
    try {
      const userId = getStringParam(req.params.userId);
      const result = await db.query(
        'SELECT tag, assigned_by, assigned_at FROM user_tags WHERE user_id = $1 ORDER BY assigned_at',
        [userId]
      );
      res.json({ tags: result.rows });
    } catch (error: any) {
      logger.error('Failed to get user tags', { error: error.message });
      res.status(500).json({ error: 'Failed to get user tags' });
    }
  });

  router.put('/users/:userId/tags/crypto', async (req: Request, res: Response) => {
    try {
      const userId = getStringParam(req.params.userId);
      const adminId = (req as any).user.id;
      await db.query(
        `INSERT INTO user_tags (user_id, tag, assigned_by) VALUES ($1, 'crypto', $2) ON CONFLICT (user_id, tag) DO NOTHING`,
        [userId, adminId]
      );
      await logAdminAction(adminId, 'assign_crypto_tag', userId, null, { tag: 'crypto' }, req);
      res.json({ success: true, message: 'Crypto tag assigned' });
    } catch (error: any) {
      logger.error('Failed to assign crypto tag', { error: error.message });
      res.status(500).json({ error: 'Failed to assign crypto tag' });
    }
  });

  router.delete('/users/:userId/tags/crypto', async (req: Request, res: Response) => {
    try {
      const userId = getStringParam(req.params.userId);
      const adminId = (req as any).user.id;
      await db.query('DELETE FROM user_tags WHERE user_id = $1 AND tag = $2', [userId, 'crypto']);
      await logAdminAction(adminId, 'remove_crypto_tag', userId, null, { tag: 'crypto' }, req);
      res.json({ success: true, message: 'Crypto tag removed' });
    } catch (error: any) {
      logger.error('Failed to remove crypto tag', { error: error.message });
      res.status(500).json({ error: 'Failed to remove crypto tag' });
    }
  });

  // ========================================
  // USER TAGS (TEST)
  // ========================================

  router.put('/users/:userId/tags/test', async (req: Request, res: Response) => {
    try {
      const userId = getStringParam(req.params.userId);
      const adminId = (req as any).user.id;
      await db.query(
        `INSERT INTO user_tags (user_id, tag, assigned_by) VALUES ($1, 'test', $2) ON CONFLICT (user_id, tag) DO NOTHING`,
        [userId, adminId]
      );
      await logAdminAction(adminId, 'assign_test_tag', userId, null, { tag: 'test' }, req);
      res.json({ success: true, message: 'Test tag assigned' });
    } catch (error: any) {
      logger.error('Failed to assign test tag', { error: error.message });
      res.status(500).json({ error: 'Failed to assign test tag' });
    }
  });

  router.delete('/users/:userId/tags/test', async (req: Request, res: Response) => {
    try {
      const userId = getStringParam(req.params.userId);
      const adminId = (req as any).user.id;
      await db.query('DELETE FROM user_tags WHERE user_id = $1 AND tag = $2', [userId, 'test']);
      await logAdminAction(adminId, 'remove_test_tag', userId, null, { tag: 'test' }, req);
      res.json({ success: true, message: 'Test tag removed' });
    } catch (error: any) {
      logger.error('Failed to remove test tag', { error: error.message });
      res.status(500).json({ error: 'Failed to remove test tag' });
    }
  });

  // ========================================
  // TEST USER CREATION
  // ========================================

  /**
   * POST /api/admin/test-users
   * Create a test user with password auth, billing, credits, and test tag
   */
  router.post('/test-users', async (req: Request, res: Response) => {
    try {
      const { email, name, password, credits } = req.body;
      const adminId = (req as any).user.id;

      // Validation
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).json({ error: 'Valid email is required' });
      }
      if (!password || typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      const creditAmount = Number(credits) || 0;
      if (creditAmount < 0) {
        return res.status(400).json({ error: 'Credits must be >= 0' });
      }

      // Check if user already exists
      const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'User with this email already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      // Single transaction: user + billing + credits + tag
      const result = await db.query('BEGIN; SELECT 1');
      try {
        // 1. Create user
        const userResult = await db.query(
          `INSERT INTO users (email, name, password_hash, email_verified)
           VALUES ($1, $2, $3, true)
           RETURNING id`,
          [email, name || email.split('@')[0], passwordHash]
        );
        const userId = userResult.rows[0].id;

        // 2. Create billing record
        await db.query(
          `INSERT INTO user_billing (user_id, balance_usd, pricing_tier, is_active, billing_enabled)
           VALUES ($1, 0, 'free', true, true)`,
          [userId]
        );

        // 3. Create credits record
        await db.query(
          `INSERT INTO user_credits (user_id, balance) VALUES ($1, $2)`,
          [userId, creditAmount]
        );

        // 4. Create credit transaction if credits > 0
        if (creditAmount > 0) {
          await db.query(
            `INSERT INTO credit_transactions (user_id, transaction_type, amount, balance_before, balance_after, source, description)
             VALUES ($1, 'bonus', $2, 0, $2, 'admin', $3)`,
            [userId, creditAmount, `Test user created by admin`]
          );
        }

        // 5. Assign test tag
        await db.query(
          `INSERT INTO user_tags (user_id, tag, assigned_by) VALUES ($1, 'test', $2)`,
          [userId, adminId]
        );

        await db.query('COMMIT');

        await logAdminAction(adminId, 'create_test_user', userId, null, {
          email,
          credits: creditAmount,
        }, req);

        res.status(201).json({
          success: true,
          user: { id: userId, email, name: name || email.split('@')[0] },
          credits: creditAmount,
        });
      } catch (txError) {
        await db.query('ROLLBACK');
        throw txError;
      }
    } catch (error: any) {
      logger.error('Failed to create test user', { error: error.message });
      if (error.message?.includes('already exists')) {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to create test user' });
    }
  });

  /**
   * GET /api/admin/users/:userId/requests
   * Paginated cost_tracking records for a specific user.
   */
  router.get('/users/:userId/requests', async (req: Request, res: Response) => {
    try {
      const userId = getStringParam(req.params.userId);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit || 25)));
      const offset = Math.max(0, Number(req.query.offset || 0));
      const days = req.query.days ? Math.min(365, Math.max(1, Number(req.query.days))) : null;

      const params: any[] = [userId];
      let extraWhere = '';

      if (days) {
        params.push(days);
        extraWhere = ` AND created_at >= NOW() - ($${params.length} || ' days')::interval`;
      }

      const rows = await db.query(`
        SELECT
          id,
          request_id,
          tool_name,
          user_query,
          openai_cost_usd::float,
          anthropic_cost_usd::float,
          zakononline_cost_usd::float,
          secondlayer_cost_usd::float,
          voyage_cost_usd::float,
          total_cost_usd::float,
          base_cost_usd::float,
          markup_amount_usd::float,
          markup_percentage::float,
          client_tier,
          execution_time_ms,
          status,
          openai_total_tokens,
          zakononline_api_calls,
          created_at,
          completed_at
        FROM cost_tracking
        WHERE user_id = $1${extraWhere}
        ORDER BY created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `, [...params, limit, offset]);

      const countResult = await db.query(`
        SELECT COUNT(*)::int as total
        FROM cost_tracking
        WHERE user_id = $1${extraWhere}
      `, params);

      res.json({
        requests: rows.rows,
        pagination: {
          limit,
          offset,
          total: countResult.rows[0].total,
        },
      });
    } catch (error: any) {
      logger.error('Failed to get user requests', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve user requests' });
    }
  });

  // ─── Admin Attorney Profile Management ────────────────────────────────

  /**
   * GET /api/admin/users/:userId/attorney-profile
   */
  router.get('/users/:userId/attorney-profile', (async (req: Request, res: Response): Promise<any> => {
    try {
      const userId = getStringParam(req.params.userId);
      if (!userId) return res.status(400).json({ error: 'userId is required' });

      const result = await db.query(
        `SELECT ap.*, u.name as user_name, u.email as user_email,
                o.name as organization_name, o.org_type
         FROM attorney_profiles ap
         JOIN users u ON u.id = ap.user_id
         LEFT JOIN organizations o ON o.id = ap.organization_id
         WHERE ap.user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Attorney profile not found' });
      }

      res.json(result.rows[0]);
    } catch (error: any) {
      logger.error('Admin: failed to get attorney profile', { error: error.message });
      res.status(500).json({ error: 'Failed to get attorney profile' });
    }
  }) as any);

  /**
   * POST /api/admin/users/:userId/attorney-profile
   */
  router.post('/users/:userId/attorney-profile', (async (req: Request, res: Response): Promise<any> => {
    try {
      const userId = getStringParam(req.params.userId);
      if (!userId) return res.status(400).json({ error: 'userId is required' });
      const adminId = (req as any).user?.id;

      // Check user exists
      const userCheck = await db.query('SELECT id, email FROM users WHERE id = $1', [userId]);
      if (userCheck.rows.length === 0) return res.status(404).json({ error: 'User not found' });

      // Check no existing profile
      const existing = await db.query('SELECT id FROM attorney_profiles WHERE user_id = $1', [userId]);
      if (existing.rows.length > 0) return res.status(409).json({ error: 'Attorney profile already exists for this user' });

      const data = req.body;
      const id = crypto.randomUUID();

      const result = await db.query(
        `INSERT INTO attorney_profiles (
          id, user_id, organization_id,
          bar_license_number, bar_admission_date, years_experience, education,
          specializations, court_types,
          region, city, serves_remotely, languages,
          consultation_fee_uah, hourly_rate_uah, representation_fee_uah, free_initial_consultation,
          bio, photo_url, is_available, max_active_consultations, is_public
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
        RETURNING *`,
        [
          id, userId, data.organization_id || null,
          data.bar_license_number || null, data.bar_admission_date || null,
          data.years_experience || null, data.education || null,
          data.specializations || [], data.court_types || [],
          data.region || null, data.city || null,
          data.serves_remotely ?? true, data.languages || ['ukrainian'],
          data.consultation_fee_uah || null, data.hourly_rate_uah || null,
          data.representation_fee_uah || null, data.free_initial_consultation ?? false,
          data.bio || null, data.photo_url || null,
          data.is_available ?? true, data.max_active_consultations ?? 10,
          data.is_public ?? true,
        ]
      );

      // Set user_type to attorney and assign attorney pricing tier
      await db.query(`UPDATE users SET user_type = 'attorney' WHERE id = $1`, [userId]);
      await db.query(
        `INSERT INTO user_billing (user_id, pricing_tier)
         VALUES ($1, 'attorney')
         ON CONFLICT (user_id) DO UPDATE SET pricing_tier = 'attorney', updated_at = NOW()`,
        [userId]
      );

      await logAdminAction(adminId, 'create_attorney_profile', userId, id, { email: userCheck.rows[0].email }, req);
      logger.info('Admin created attorney profile', { adminId, userId, profileId: id });

      res.status(201).json(result.rows[0]);
    } catch (error: any) {
      logger.error('Admin: failed to create attorney profile', { error: error.message });
      res.status(500).json({ error: error.message || 'Failed to create attorney profile' });
    }
  }) as any);

  /**
   * PUT /api/admin/users/:userId/attorney-profile
   */
  router.put('/users/:userId/attorney-profile', (async (req: Request, res: Response): Promise<any> => {
    try {
      const userId = getStringParam(req.params.userId);
      if (!userId) return res.status(400).json({ error: 'userId is required' });
      const adminId = (req as any).user?.id;
      const data = req.body;

      const fields: Array<[string, any]> = [
        ['organization_id', data.organization_id],
        ['bar_license_number', data.bar_license_number],
        ['bar_admission_date', data.bar_admission_date],
        ['years_experience', data.years_experience],
        ['education', data.education],
        ['specializations', data.specializations],
        ['court_types', data.court_types],
        ['region', data.region],
        ['city', data.city],
        ['serves_remotely', data.serves_remotely],
        ['languages', data.languages],
        ['consultation_fee_uah', data.consultation_fee_uah],
        ['hourly_rate_uah', data.hourly_rate_uah],
        ['representation_fee_uah', data.representation_fee_uah],
        ['free_initial_consultation', data.free_initial_consultation],
        ['bio', data.bio],
        ['photo_url', data.photo_url],
        ['is_available', data.is_available],
        ['max_active_consultations', data.max_active_consultations],
        ['is_public', data.is_public],
      ];

      const setClauses: string[] = [];
      const params: any[] = [];
      let idx = 1;

      for (const [field, value] of fields) {
        if (value !== undefined) {
          setClauses.push(`${field} = $${idx++}`);
          params.push(value);
        }
      }

      if (setClauses.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      params.push(userId);
      const result = await db.query(
        `UPDATE attorney_profiles SET ${setClauses.join(', ')}, updated_at = NOW() WHERE user_id = $${idx} RETURNING *`,
        params
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Attorney profile not found' });
      }

      await logAdminAction(adminId, 'update_attorney_profile', userId, result.rows[0].id, { fields: Object.keys(data) }, req);

      res.json(result.rows[0]);
    } catch (error: any) {
      logger.error('Admin: failed to update attorney profile', { error: error.message });
      res.status(500).json({ error: error.message || 'Failed to update attorney profile' });
    }
  }) as any);

  /**
   * DELETE /api/admin/users/:userId/attorney-profile
   */
  router.delete('/users/:userId/attorney-profile', (async (req: Request, res: Response): Promise<any> => {
    try {
      const userId = getStringParam(req.params.userId);
      if (!userId) return res.status(400).json({ error: 'userId is required' });
      const adminId = (req as any).user?.id;

      const result = await db.query('DELETE FROM attorney_profiles WHERE user_id = $1 RETURNING id', [userId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Attorney profile not found' });
      }

      await db.query(`UPDATE users SET user_type = 'user' WHERE id = $1`, [userId]);
      await logAdminAction(adminId, 'delete_attorney_profile', userId, result.rows[0].id, {}, req);

      res.json({ success: true });
    } catch (error: any) {
      logger.error('Admin: failed to delete attorney profile', { error: error.message });
      res.status(500).json({ error: 'Failed to delete attorney profile' });
    }
  }) as any);

  return router;
}

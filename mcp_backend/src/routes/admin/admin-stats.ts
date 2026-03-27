/**
 * Admin Stats Routes — Dashboard statistics, revenue charts, tier distribution,
 * analytics/cohorts, usage analytics, cost breakdown, users-costs
 */

import { Router, Request, Response } from 'express';
import type { IDatabase } from '../../domain/ports/index.js';
import { logger } from '../../utils/logger.js';
import type { LogAdminAction } from './admin-middleware.js';

export function createAdminStatsRoutes(
  db: IDatabase,
  _logAdminAction: LogAdminAction,
): Router {
  const router = Router();

  // ========================================
  // DASHBOARD & STATISTICS
  // ========================================

  /**
   * GET /api/admin/stats/overview
   * Get dashboard overview statistics
   */
  router.get('/stats/overview', async (req: Request, res: Response) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Today's revenue — only count requests that went through chargeUser() (base_cost_usd IS NOT NULL)
      // For those requests: total_cost_usd = charged amount, base_cost_usd = actual API cost, markup_amount_usd = profit
      const todayRevenue = await db.query(`
        SELECT
          COALESCE(SUM(CASE WHEN base_cost_usd IS NOT NULL THEN total_cost_usd ELSE 0 END), 0) as revenue_usd,
          COALESCE(SUM(markup_amount_usd), 0) as profit_usd,
          COUNT(*) as requests
        FROM cost_tracking
        WHERE DATE(created_at) = $1
      `, [today]);

      // This month's revenue
      const monthRevenue = await db.query(`
        SELECT
          COALESCE(SUM(CASE WHEN base_cost_usd IS NOT NULL THEN total_cost_usd ELSE 0 END), 0) as revenue_usd,
          COALESCE(SUM(markup_amount_usd), 0) as profit_usd,
          COUNT(*) as requests
        FROM cost_tracking
        WHERE DATE(created_at) >= DATE_TRUNC('month', CURRENT_DATE)
      `);

      // Active users (made a request in last 30 days)
      const activeUsers = await db.query(`
        SELECT COUNT(DISTINCT user_id) as count
        FROM cost_tracking
        WHERE created_at >= $1
      `, [thirtyDaysAgo]);

      // Total users
      const totalUsers = await db.query('SELECT COUNT(*) as count FROM users');

      // Low balance alerts (< $5)
      const lowBalanceUsers = await db.query(`
        SELECT COUNT(*) as count
        FROM user_billing
        WHERE balance_usd < 5.00 AND balance_usd > 0
      `);

      // Failed requests today
      const failedRequests = await db.query(`
        SELECT COUNT(*) as count
        FROM cost_tracking
        WHERE DATE(created_at) = $1
          AND request_id IN (
            SELECT request_id FROM billing_transactions WHERE status = 'failed'
          )
      `, [today]);

      res.json({
        today: {
          revenue_usd: parseFloat(todayRevenue.rows[0].revenue_usd),
          profit_usd: parseFloat(todayRevenue.rows[0].profit_usd),
          requests: parseInt(todayRevenue.rows[0].requests),
        },
        month: {
          revenue_usd: parseFloat(monthRevenue.rows[0].revenue_usd),
          profit_usd: parseFloat(monthRevenue.rows[0].profit_usd),
          requests: parseInt(monthRevenue.rows[0].requests),
        },
        users: {
          total: parseInt(totalUsers.rows[0].count),
          active: parseInt(activeUsers.rows[0].count),
          low_balance: parseInt(lowBalanceUsers.rows[0].count),
        },
        alerts: {
          failed_requests_today: parseInt(failedRequests.rows[0].count),
        },
      });
    } catch (error: any) {
      logger.error('Failed to get admin overview stats', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve statistics' });
    }
  });

  /**
   * GET /api/admin/stats/revenue-chart
   * Get revenue data for charts (last 30 days)
   */
  router.get('/stats/revenue-chart', async (req: Request, res: Response) => {
    try {
      const days = Math.min(90, Math.max(7, Number(req.query.days || 30)));

      const result = await db.query(`
        SELECT
          DATE(created_at) as date,
          COALESCE(SUM(CASE WHEN base_cost_usd IS NOT NULL THEN total_cost_usd ELSE 0 END), 0) as revenue_usd,
          COALESCE(SUM(base_cost_usd), 0) as cost_usd,
          COALESCE(SUM(markup_amount_usd), 0) as profit_usd,
          COUNT(*) as requests
        FROM cost_tracking
        WHERE created_at >= CURRENT_DATE - $1::integer * INTERVAL '1 day'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `, [days]);

      res.json({
        data: result.rows.map((row: any) => ({
          date: row.date,
          revenue_usd: parseFloat(row.revenue_usd),
          cost_usd: parseFloat(row.cost_usd),
          profit_usd: parseFloat(row.profit_usd),
          requests: parseInt(row.requests),
        })),
      });
    } catch (error: any) {
      logger.error('Failed to get revenue chart data', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve chart data' });
    }
  });

  /**
   * GET /api/admin/stats/tier-distribution
   * Get user distribution across pricing tiers
   */
  router.get('/stats/tier-distribution', async (req: Request, res: Response) => {
    try {
      const result = await db.query(`
        SELECT
          pricing_tier,
          COUNT(*) as user_count,
          COALESCE(SUM(balance_usd), 0) as total_balance
        FROM user_billing
        GROUP BY pricing_tier
        ORDER BY user_count DESC
      `);

      res.json({
        tiers: result.rows.map((row: any) => ({
          tier: row.pricing_tier,
          user_count: parseInt(row.user_count),
          total_balance_usd: parseFloat(row.total_balance),
        })),
      });
    } catch (error: any) {
      logger.error('Failed to get tier distribution', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve tier distribution' });
    }
  });

  // ========================================
  // ANALYTICS & REPORTS
  // ========================================

  /**
   * GET /api/admin/analytics/cohorts
   * Analyze user cohorts by signup month
   */
  router.get('/analytics/cohorts', async (req: Request, res: Response) => {
    try {
      const result = await db.query(`
        SELECT
          DATE_TRUNC('month', u.created_at) as cohort_month,
          COUNT(*) as users,
          COUNT(DISTINCT ct.user_id) as active_users,
          COALESCE(SUM(ct.total_cost_usd), 0) as total_revenue
        FROM users u
        LEFT JOIN cost_tracking ct ON u.id = ct.user_id
        GROUP BY DATE_TRUNC('month', u.created_at)
        ORDER BY cohort_month DESC
        LIMIT 12
      `);

      res.json({
        cohorts: result.rows.map((row: any) => ({
          month: row.cohort_month,
          users: parseInt(row.users),
          active_users: parseInt(row.active_users),
          total_revenue_usd: parseFloat(row.total_revenue),
          retention_rate: (parseInt(row.active_users) / parseInt(row.users)) * 100,
        })),
      });
    } catch (error: any) {
      logger.error('Failed to get cohort analytics', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve cohort data' });
    }
  });

  /**
   * GET /api/admin/analytics/usage
   * Get usage statistics by tool/feature
   */
  router.get('/analytics/usage', async (req: Request, res: Response) => {
    try {
      const days = Math.min(90, Math.max(1, Number(req.query.days || 30)));

      const result = await db.query(`
        SELECT
          tool_name,
          COUNT(*) as request_count,
          COALESCE(SUM(total_cost_usd), 0) as total_revenue,
          COALESCE(AVG(total_cost_usd), 0) as avg_cost
        FROM cost_tracking
        WHERE created_at >= CURRENT_DATE - $1::integer * INTERVAL '1 day'
          AND tool_name IS NOT NULL
        GROUP BY tool_name
        ORDER BY request_count DESC
      `, [days]);

      res.json({
        usage: result.rows.map((row: any) => ({
          tool_name: row.tool_name,
          request_count: parseInt(row.request_count),
          total_revenue_usd: parseFloat(row.total_revenue),
          avg_cost_usd: parseFloat(row.avg_cost),
        })),
      });
    } catch (error: any) {
      logger.error('Failed to get usage analytics', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve usage data' });
    }
  });

  /**
   * GET /api/admin/stats/cost-breakdown
   * Detailed cost breakdown by provider, model, and day
   * Query params: days=30 (7-90)
   */
  router.get('/stats/cost-breakdown', async (req: Request, res: Response) => {
    try {
      const days = Math.min(90, Math.max(7, Number(req.query.days || 30)));
      const interval = `${days} days`;

      // 1. Totals
      const totalsResult = await db.query(`
        SELECT
          COALESCE(SUM(openai_cost_usd), 0) as openai_cost,
          COALESCE(SUM(anthropic_cost_usd), 0) as anthropic_cost,
          COALESCE(SUM(secondlayer_cost_usd), 0) as secondlayer_cost,
          COALESCE(SUM(openai_cost_usd), 0) + COALESCE(SUM(anthropic_cost_usd), 0) +
            COALESCE(SUM(secondlayer_cost_usd), 0) as total_cost,
          COUNT(*) as total_requests
        FROM cost_tracking
        WHERE created_at >= NOW() - $1::interval
          AND status = 'completed'
      `, [interval]);

      // VoyageAI totals from monthly_api_usage (global callback writes here without requestId)
      const voyageTotalsResult = await db.query(`
        SELECT
          COALESCE(SUM(voyage_total_tokens), 0) as voyage_tokens,
          COALESCE(SUM(voyage_total_cost_usd), 0) as voyage_cost
        FROM monthly_api_usage
        WHERE year_month >= TO_CHAR(NOW() - $1::interval, 'YYYY-MM')
      `, [interval]);

      const totals = totalsResult.rows[0];
      const voyageTotals = voyageTotalsResult.rows[0];

      // 2. By provider (with token counts from JSONB)
      const openaiTokensResult = await db.query(`
        SELECT
          COALESCE(SUM((elem->>'total_tokens')::numeric), 0) as tokens,
          COUNT(*) as calls
        FROM cost_tracking,
          jsonb_array_elements(CASE WHEN openai_calls IS NOT NULL AND openai_calls != 'null'::jsonb AND jsonb_typeof(openai_calls) = 'array' THEN openai_calls ELSE '[]'::jsonb END) AS elem
        WHERE created_at >= NOW() - $1::interval
          AND status = 'completed'
      `, [interval]);

      const anthropicTokensResult = await db.query(`
        SELECT
          COALESCE(SUM((elem->>'total_tokens')::numeric), 0) as tokens,
          COUNT(*) as calls
        FROM cost_tracking,
          jsonb_array_elements(CASE WHEN anthropic_calls IS NOT NULL AND anthropic_calls != 'null'::jsonb AND jsonb_typeof(anthropic_calls) = 'array' THEN anthropic_calls ELSE '[]'::jsonb END) AS elem
        WHERE created_at >= NOW() - $1::interval
          AND status = 'completed'
      `, [interval]);

      const byProvider = [
        {
          provider: 'OpenAI',
          cost_usd: parseFloat(totals.openai_cost),
          requests: parseInt(openaiTokensResult.rows[0]?.calls || '0'),
          tokens: parseInt(openaiTokensResult.rows[0]?.tokens || '0'),
        },
        {
          provider: 'Anthropic',
          cost_usd: parseFloat(totals.anthropic_cost),
          requests: parseInt(anthropicTokensResult.rows[0]?.calls || '0'),
          tokens: parseInt(anthropicTokensResult.rows[0]?.tokens || '0'),
        },
        {
          provider: 'VoyageAI',
          cost_usd: parseFloat(voyageTotals.voyage_cost),
          tokens: parseInt(voyageTotals.voyage_tokens || '0'),
        },
        {
          provider: 'SecondLayer API',
          cost_usd: parseFloat(totals.secondlayer_cost),
          calls: parseInt(totals.total_requests),
        },
      ];

      // 3. By model (unpack JSONB arrays)
      const byModelResult = await db.query(`
        WITH openai_models AS (
          SELECT
            'OpenAI' as provider,
            elem->>'model' as model,
            COALESCE((elem->>'cost_usd')::numeric, 0) as cost,
            COALESCE((elem->>'total_tokens')::numeric, 0) as tokens
          FROM cost_tracking,
            jsonb_array_elements(CASE WHEN openai_calls IS NOT NULL AND openai_calls != 'null'::jsonb AND jsonb_typeof(openai_calls) = 'array' THEN openai_calls ELSE '[]'::jsonb END) AS elem
          WHERE created_at >= NOW() - $1::interval
            AND status = 'completed'
        ),
        anthropic_models AS (
          SELECT
            'Anthropic' as provider,
            elem->>'model' as model,
            COALESCE((elem->>'cost_usd')::numeric, 0) as cost,
            COALESCE((elem->>'total_tokens')::numeric, 0) as tokens
          FROM cost_tracking,
            jsonb_array_elements(CASE WHEN anthropic_calls IS NOT NULL AND anthropic_calls != 'null'::jsonb AND jsonb_typeof(anthropic_calls) = 'array' THEN anthropic_calls ELSE '[]'::jsonb END) AS elem
          WHERE created_at >= NOW() - $1::interval
            AND status = 'completed'
        ),
        -- Per-request voyage (when requestId-scoped tracking is available)
        voyage_per_request AS (
          SELECT
            'VoyageAI' as provider,
            elem->>'model' as model,
            COALESCE((elem->>'cost_usd')::numeric, 0) as cost,
            COALESCE((elem->>'total_tokens')::numeric, 0) as tokens
          FROM cost_tracking,
            jsonb_array_elements(CASE WHEN voyage_calls IS NOT NULL AND voyage_calls != 'null'::jsonb AND jsonb_typeof(voyage_calls) = 'array' THEN voyage_calls ELSE '[]'::jsonb END) AS elem
          WHERE created_at >= NOW() - $1::interval
            AND status = 'completed'
        ),
        all_models AS (
          SELECT * FROM openai_models
          UNION ALL
          SELECT * FROM anthropic_models
          UNION ALL
          SELECT * FROM voyage_per_request
        )
        SELECT
          provider,
          model,
          SUM(cost) as cost_usd,
          SUM(tokens) as tokens,
          COUNT(*) as requests
        FROM all_models
        WHERE model IS NOT NULL
        GROUP BY provider, model
        ORDER BY cost_usd DESC
      `, [interval]);

      const byModel: Array<{ provider: string; model: string; cost_usd: number; tokens: number; requests: number }> = byModelResult.rows.map((row: any) => ({
        provider: row.provider,
        model: row.model,
        cost_usd: parseFloat(row.cost_usd),
        tokens: parseInt(row.tokens),
        requests: parseInt(row.requests),
      }));

      // Supplement byModel with VoyageAI data from monthly_api_usage
      // (global callback writes there without requestId scoping)
      const voyageModel = process.env.VOYAGEAI_EMBEDDING_MODEL || 'voyage-multilingual-2';
      const voyageHasPerRequest = byModel.some((m) => m.provider === 'VoyageAI');
      if (!voyageHasPerRequest) {
        const voyageMonthlyResult = await db.query(`
          SELECT
            COALESCE(SUM(voyage_total_tokens), 0) as total_tokens,
            COALESCE(SUM(voyage_total_cost_usd), 0) as total_cost
          FROM monthly_api_usage
          WHERE year_month >= TO_CHAR(NOW() - $1::interval, 'YYYY-MM')
        `, [interval]);
        const vRow = voyageMonthlyResult.rows[0];
        if (parseFloat(vRow?.total_tokens || '0') > 0) {
          byModel.push({
            provider: 'VoyageAI',
            model: voyageModel,
            cost_usd: parseFloat(vRow.total_cost),
            tokens: parseInt(vRow.total_tokens),
            requests: 0, // monthly aggregates don't track individual requests
          });
          byModel.sort((a, b) => b.cost_usd - a.cost_usd);
        }
      }

      // 4. Daily breakdown
      const dailyResult = await db.query(`
        SELECT
          DATE(created_at) as date,
          COALESCE(SUM(openai_cost_usd), 0) as openai,
          COALESCE(SUM(anthropic_cost_usd), 0) as anthropic,
          COALESCE(SUM(secondlayer_cost_usd), 0) as secondlayer,
          COALESCE(SUM(voyage_cost_usd), 0) as voyage
        FROM cost_tracking
        WHERE created_at >= NOW() - $1::interval
          AND status = 'completed'
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `, [interval]);

      const daily = dailyResult.rows.map((row: any) => ({
        date: row.date,
        openai: parseFloat(row.openai),
        anthropic: parseFloat(row.anthropic),
        secondlayer: parseFloat(row.secondlayer),
        voyage: parseFloat(row.voyage),
      }));

      const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const toDate = new Date().toISOString().split('T')[0];

      const voyageCostUsd = parseFloat(voyageTotals.voyage_cost);
      res.json({
        period: { from: fromDate, to: toDate, days },
        totals: {
          openai_cost_usd: parseFloat(totals.openai_cost),
          anthropic_cost_usd: parseFloat(totals.anthropic_cost),
          secondlayer_cost_usd: parseFloat(totals.secondlayer_cost),
          voyage_cost_usd: voyageCostUsd,
          total_cost_usd: parseFloat(totals.total_cost) + voyageCostUsd,
          total_requests: parseInt(totals.total_requests),
        },
        by_provider: byProvider,
        by_model: byModel,
        daily,
      });
    } catch (error: any) {
      logger.error('Failed to get cost breakdown', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve cost breakdown' });
    }
  });

  /**
   * GET /api/admin/stats/users-costs
   * Per-user cost summary for the period, sorted by total spend descending.
   */
  router.get('/stats/users-costs', async (req: Request, res: Response) => {
    try {
      const days = Math.min(365, Math.max(1, Number(req.query.days || 30)));
      const limit = Math.min(500, Math.max(1, Number(req.query.limit || 200)));

      const result = await db.query(`
        SELECT
          u.id,
          u.email,
          u.name,
          COALESCE(ub.pricing_tier, 'startup') as pricing_tier,
          COUNT(ct.id)::int as request_count,
          COALESCE(SUM(ct.total_cost_usd), 0)::float as total_cost_usd,
          COALESCE(SUM(ct.openai_cost_usd), 0)::float as openai_cost_usd,
          COALESCE(SUM(ct.anthropic_cost_usd), 0)::float as anthropic_cost_usd,
          COALESCE(SUM(ct.voyage_cost_usd), 0)::float as voyage_cost_usd,
          COALESCE(SUM(ct.secondlayer_cost_usd), 0)::float as secondlayer_cost_usd,
          MAX(ct.created_at) as last_request_at
        FROM users u
        LEFT JOIN user_billing ub ON u.id = ub.user_id
        INNER JOIN cost_tracking ct ON u.id = ct.user_id
          AND ct.created_at >= NOW() - ($1 || ' days')::interval
        GROUP BY u.id, u.email, u.name, ub.pricing_tier
        ORDER BY total_cost_usd DESC
        LIMIT $2
      `, [days, limit]);

      res.json({
        users: result.rows,
        period_days: days,
      });
    } catch (error: any) {
      logger.error('Failed to get user cost summary', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve user cost summary' });
    }
  });

  return router;
}

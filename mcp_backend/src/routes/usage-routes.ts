/**
 * Usage Analytics Routes — Developer Platform
 * Aggregated usage data for the authenticated user
 */

import { Router, Response } from 'express';
import { logger } from '../utils/logger.js';

interface AuthenticatedRequest {
  userId?: string;
  user?: { id?: string };
}

function getUserId(req: AuthenticatedRequest): string | undefined {
  return req.userId || req.user?.id;
}

export function createUsageRoutes(db: { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }): Router {
  const router = Router();

  /**
   * GET /api/usage/daily?days=30
   * Returns daily aggregated API usage for the authenticated user
   */
  router.get('/daily', async (req: AuthenticatedRequest & { query: Record<string, string> }, res: Response): Promise<void> => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 90);

      const result = await db.query(
        `SELECT
          DATE(created_at) as date,
          COUNT(*)::int as calls,
          COALESCE(SUM(total_cost_usd), 0)::float as cost_usd,
          COALESCE(SUM(openai_total_tokens), 0)::int as tokens
        FROM cost_tracking
        WHERE user_id = $1
          AND created_at >= NOW() - INTERVAL '1 day' * $2
          AND status = 'completed'
        GROUP BY DATE(created_at)
        ORDER BY date ASC`,
        [userId, days]
      );

      res.json({
        success: true,
        days,
        data: result.rows,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[UsageRoutes] Error getting daily usage', { error: message });
      res.status(500).json({ error: 'Failed to get daily usage' });
    }
  });

  /**
   * GET /api/usage/by-tool?days=30
   * Returns usage aggregated by tool name for the authenticated user
   */
  router.get('/by-tool', async (req: AuthenticatedRequest & { query: Record<string, string> }, res: Response): Promise<void> => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 90);

      const result = await db.query(
        `SELECT
          tool_name,
          COUNT(*)::int as calls,
          COALESCE(SUM(total_cost_usd), 0)::float as cost_usd,
          COALESCE(SUM(openai_total_tokens), 0)::int as tokens,
          COALESCE(AVG(execution_time_ms), 0)::int as avg_time_ms
        FROM cost_tracking
        WHERE user_id = $1
          AND created_at >= NOW() - INTERVAL '1 day' * $2
          AND status = 'completed'
        GROUP BY tool_name
        ORDER BY calls DESC`,
        [userId, days]
      );

      res.json({
        success: true,
        days,
        data: result.rows,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[UsageRoutes] Error getting usage by tool', { error: message });
      res.status(500).json({ error: 'Failed to get usage by tool' });
    }
  });

  /**
   * GET /api/usage/summary?days=30
   * Returns a quick summary of usage for the authenticated user
   */
  router.get('/summary', async (req: AuthenticatedRequest & { query: Record<string, string> }, res: Response): Promise<void> => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 90);

      const result = await db.query(
        `SELECT
          COUNT(*)::int as total_calls,
          COALESCE(SUM(total_cost_usd), 0)::float as total_cost_usd,
          COALESCE(SUM(openai_total_tokens), 0)::int as total_tokens,
          COUNT(DISTINCT tool_name)::int as unique_tools,
          COUNT(DISTINCT DATE(created_at))::int as active_days
        FROM cost_tracking
        WHERE user_id = $1
          AND created_at >= NOW() - INTERVAL '1 day' * $2
          AND status = 'completed'`,
        [userId, days]
      );

      const summary = result.rows[0] as Record<string, unknown> || {};
      res.json({
        success: true,
        days,
        ...summary,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[UsageRoutes] Error getting usage summary', { error: message });
      res.status(500).json({ error: 'Failed to get usage summary' });
    }
  });

  return router;
}

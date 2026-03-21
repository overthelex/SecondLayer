/**
 * Admin middleware and shared helpers used by all admin sub-routers.
 */

import { Request, Response } from 'express';
import type { IDatabase } from '../../domain/ports/index.js';
import { logger } from '../../utils/logger.js';

/**
 * Helper to ensure param is a string (Express can return string | string[])
 */
export function getStringParam(param: string | string[] | undefined): string | null {
  if (!param) return null;
  return Array.isArray(param) ? param[0] : param;
}

/**
 * Create the requireAdmin middleware bound to the given database.
 */
export function createRequireAdmin(db: IDatabase) {
  return async (req: Request, res: Response, next: any) => {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      // Check if user has admin role in database
      const result = await db.query('SELECT is_admin, role FROM users WHERE id = $1', [user.id]);

      if (!result.rows[0]?.is_admin && result.rows[0]?.role !== 'administrator') {
        logger.warn('Non-admin user attempted to access admin endpoint', {
          userId: user.id,
          email: user.email || 'unknown',
          endpoint: req.path,
          ip: req.ip,
        });
        return res.status(403).json({ error: 'Admin access required' });
      }

      next();
    } catch (error: any) {
      logger.error('Error checking admin status', { error: error.message, userId: user.id });
      res.status(500).json({ error: 'Failed to verify admin access' });
    }
  };
}

/**
 * Create the logAdminAction helper bound to the given database.
 */
export function createLogAdminAction(db: IDatabase) {
  return async (
    adminId: string,
    action: string,
    targetUserId: string | null,
    targetResourceId: string | null,
    details: any,
    req: Request
  ) => {
    try {
      await db.query(
        `INSERT INTO admin_audit_log
          (admin_id, action, target_user_id, target_resource_id, details, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          adminId,
          action,
          targetUserId,
          targetResourceId,
          JSON.stringify(details),
          req.ip,
          req.headers['user-agent'] || null,
        ]
      );
    } catch (error: any) {
      logger.error('Failed to log admin action', { error: error.message, action });
    }
  };
}

export type LogAdminAction = ReturnType<typeof createLogAdminAction>;

/**
 * Admin Transactions Routes — Transaction management: list, refund, details
 */

import { Router, Request, Response } from 'express';
import type { IDatabase } from '../../domain/ports/index.js';
import { logger } from '../../utils/logger.js';
import { getStringParam, type LogAdminAction } from './admin-middleware.js';
import type { AuditService } from '../../services/audit-service.js';

export function createAdminTransactionsRoutes(
  db: IDatabase,
  logAdminAction: LogAdminAction,
  auditService?: AuditService,
): Router {
  const router = Router();

  /**
   * GET /api/admin/transactions
   * List all transactions with filtering
   */
  router.get('/transactions', async (req: Request, res: Response) => {
    try {
      const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
      const offset = Math.max(0, Number(req.query.offset || 0));
      const type = req.query.type as string | undefined;
      const status = req.query.status as string | undefined;
      const userId = req.query.userId as string | undefined;

      let whereClause = '1=1';
      const params: any[] = [];
      let paramCount = 0;

      if (type) {
        paramCount++;
        whereClause += ` AND transaction_type = $${paramCount}`;
        params.push(type);
      }

      if (status) {
        paramCount++;
        whereClause += ` AND status = $${paramCount}`;
        params.push(status);
      }

      if (userId) {
        paramCount++;
        whereClause += ` AND user_id = $${paramCount}`;
        params.push(userId);
      }

      const result = await db.query(`
        SELECT
          bt.*,
          u.email as user_email
        FROM billing_transactions bt
        JOIN users u ON bt.user_id = u.id
        WHERE ${whereClause}
        ORDER BY bt.created_at DESC
        LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
      `, [...params, limit, offset]);

      const countResult = await db.query(`
        SELECT COUNT(*) as total
        FROM billing_transactions bt
        WHERE ${whereClause}
      `, params);

      res.json({
        transactions: result.rows,
        pagination: {
          limit,
          offset,
          total: parseInt(countResult.rows[0].total),
        },
      });
    } catch (error: any) {
      logger.error('Failed to list transactions', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve transactions' });
    }
  });

  /**
   * POST /api/admin/transactions/:transactionId/refund
   * Refund a transaction
   */
  router.post('/transactions/:transactionId/refund', async (req: Request, res: Response) => {
    try {
      const transactionId = getStringParam(req.params.transactionId);
      const { reason } = req.body;

      const txResult = await db.query(
        'SELECT * FROM billing_transactions WHERE id = $1',
        [transactionId]
      );

      if (txResult.rows.length === 0) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      const transaction = txResult.rows[0];

      // Check if already refunded (a refund row referencing this transaction exists)
      const existingRefund = await db.query(
        `SELECT id FROM billing_transactions WHERE reference_transaction_id = $1 AND type = 'refund'`,
        [transactionId]
      );
      if (existingRefund.rows.length > 0) {
        return res.status(400).json({ error: 'Transaction already refunded' });
      }

      // Atomically create refund transaction and credit balance
      const refundTx = await db.transaction(async (client) => {
        // Lock the original to prevent double-refund
        await client.query(
          `SELECT id FROM billing_transactions WHERE id = $1 FOR UPDATE`,
          [transactionId]
        );

        // Double-check no refund was created concurrently
        const doubleCheck = await client.query(
          `SELECT id FROM billing_transactions WHERE reference_transaction_id = $1 AND type = 'refund'`,
          [transactionId]
        );
        if (doubleCheck.rows.length > 0) {
          throw new Error('Transaction already refunded (concurrent)');
        }

        // Get current balance for snapshot
        const billingResult = await client.query(
          `SELECT * FROM user_billing WHERE user_id = $1 FOR UPDATE`,
          [transaction.user_id]
        );
        const balanceBefore = billingResult.rows.length > 0 ? parseFloat(billingResult.rows[0].balance_usd) : 0;
        const balanceAfter = balanceBefore + parseFloat(transaction.amount_usd);

        // Create immutable refund row referencing the original
        const refundResult = await client.query(
          `INSERT INTO billing_transactions (
            user_id, type, amount_usd, amount_uah,
            balance_before_usd, balance_after_usd,
            reference_transaction_id, description, metadata, status
          ) VALUES ($1, 'refund', $2, $3, $4, $5, $6, $7, $8, 'completed')
          RETURNING *`,
          [
            transaction.user_id,
            transaction.amount_usd,
            transaction.amount_uah || 0,
            balanceBefore,
            balanceAfter,
            transactionId,
            `Повернення: ${reason || 'admin refund'}`,
            JSON.stringify({
              refund_reason: reason,
              refunded_by: (req as any).user?.id,
              original_transaction_type: transaction.type,
            }),
          ]
        );

        // Credit balance
        await client.query(
          'UPDATE user_billing SET balance_usd = balance_usd + $1 WHERE user_id = $2',
          [transaction.amount_usd, transaction.user_id]
        );

        return refundResult.rows[0];
      });

      // Log admin action (non-critical, outside transaction)
      await logAdminAction(
        (req as any).user.id,
        'refund_transaction',
        transaction.user_id,
        transactionId,
        { amount: transaction.amount_usd, reason, transaction_type: transaction.transaction_type },
        req
      );

      logger.info('Admin refunded transaction', {
        transactionId,
        userId: transaction.user_id,
        amount: transaction.amount_usd,
        reason
      });

      // Audit: admin.refund
      if (auditService) {
        auditService.log({
          userId: (req as any).user?.id,
          action: 'admin.refund',
          resourceType: 'billing_transaction',
          resourceId: refundTx.id,
          details: { originalTransactionId: transactionId, targetUserId: transaction.user_id, amountUsd: transaction.amount_usd, reason },
        }).catch(err => logger.warn('[Audit] Failed to log admin.refund', { error: (err as Error).message }));
      }

      res.json({ success: true, message: 'Transaction refunded' });
    } catch (error: any) {
      logger.error('Failed to refund transaction', { error: error.message });
      res.status(500).json({ error: 'Failed to refund transaction' });
    }
  });

  return router;
}

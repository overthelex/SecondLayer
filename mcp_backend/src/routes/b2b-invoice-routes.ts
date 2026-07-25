/**
 * B2B Invoice Routes
 * Endpoints for legal entities to request invoices for bank transfer payment
 */

import express, { Request, Response } from 'express';
import { B2BInvoiceService } from '../services/b2b-invoice-service.js';
import { BillingService } from '../services/billing-service.js';
import { SubscriptionService } from '../services/subscription-service.js';
import type { IDatabase } from '../domain/ports/index.js';
import { logger } from '../utils/logger.js';

export function createB2BInvoiceRoutes(
  b2bInvoiceService: B2BInvoiceService,
  billingService: BillingService,
  subscriptionService: SubscriptionService,
  db: IDatabase
): express.Router {
  const router = express.Router();

  /**
   * Middleware to verify admin access
   */
  const requireAdmin = async (req: Request, res: Response, next: any) => {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Потрібна автентифікація' });
    }
    try {
      const result = await db.query('SELECT is_admin, role FROM users WHERE id = $1', [user.id]);
      if (!result.rows[0]?.is_admin && result.rows[0]?.role !== 'administrator') {
        return res.status(403).json({ error: 'Потрібні права адміністратора' });
      }
      next();
    } catch (error: any) {
      logger.error('Error checking admin status', { error: error.message });
      res.status(500).json({ error: 'Помилка перевірки прав' });
    }
  };

  /**
   * Helper to get user's organization ID
   */
  async function getUserOrgId(userId: string): Promise<string | null> {
    // Check if user owns an org
    const ownerResult = await db.query(
      'SELECT id FROM organizations WHERE owner_id = $1 LIMIT 1',
      [userId]
    );
    if (ownerResult.rows.length > 0) return ownerResult.rows[0].id;

    // Check if user is a member of an org
    const memberResult = await db.query(
      'SELECT organization_id FROM organization_members WHERE user_id = $1 AND status = $2 LIMIT 1',
      [userId, 'active']
    );
    if (memberResult.rows.length > 0) return memberResult.rows[0].organization_id;

    return null;
  }

  // ===== USER ENDPOINTS =====

  /**
   * GET /api/b2b-invoices/org-info — Get org billing details for invoice form
   */
  router.get('/org-info', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: 'Потрібна автентифікація' });

      const orgId = await getUserOrgId(userId);
      if (!orgId) return res.status(200).json({ org: null });

      const result = await db.query(
        'SELECT id, name, edrpou, legal_address, billing_email FROM organizations WHERE id = $1',
        [orgId]
      );
      res.json({ org: result.rows[0] || null });
    } catch (error: any) {
      logger.error('Failed to get org info', { error: error.message });
      res.status(500).json({ error: 'Помилка отримання даних організації' });
    }
  });

  /**
   * PATCH /api/b2b-invoices/org-info — Update org billing details (edrpou, address)
   */
  router.patch('/org-info', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: 'Потрібна автентифікація' });

      const orgId = await getUserOrgId(userId);
      if (!orgId) return res.status(400).json({ error: 'Ви не належите до жодної організації' });

      // Verify user is org owner
      const ownerCheck = await db.query('SELECT owner_id FROM organizations WHERE id = $1', [orgId]);
      if (ownerCheck.rows[0]?.owner_id !== userId) {
        return res.status(403).json({ error: 'Тільки власник організації може змінювати реквізити' });
      }

      const { edrpou, legal_address, name, billing_email } = req.body;

      const updates: string[] = [];
      const values: any[] = [];
      let idx = 2;

      if (edrpou !== undefined) { updates.push(`edrpou = $${idx++}`); values.push(edrpou); }
      if (legal_address !== undefined) { updates.push(`legal_address = $${idx++}`); values.push(legal_address); }
      if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name); }
      if (billing_email !== undefined) { updates.push(`billing_email = $${idx++}`); values.push(billing_email); }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'Немає полів для оновлення' });
      }

      await db.query(
        `UPDATE organizations SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $1`,
        [orgId, ...values]
      );

      res.json({ success: true });
    } catch (error: any) {
      logger.error('Failed to update org info', { error: error.message });
      res.status(500).json({ error: 'Помилка оновлення даних організації' });
    }
  });

  /**
   * POST /api/b2b-invoices — Request new invoice
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: 'Потрібна автентифікація' });

      const orgId = await getUserOrgId(userId);
      if (!orgId) return res.status(400).json({ error: 'Ви не належите до жодної організації' });

      const { invoice_type, tier_key, billing_cycle, amount_uah, notes } = req.body;

      if (!invoice_type || !['subscription', 'topup'].includes(invoice_type)) {
        return res.status(400).json({ error: 'Невірний тип рахунку' });
      }

      const invoice = await b2bInvoiceService.createInvoice({
        organizationId: orgId,
        requestedBy: userId,
        invoiceType: invoice_type,
        tierKey: tier_key,
        billingCycle: billing_cycle,
        amountUah: amount_uah ? parseFloat(amount_uah) : undefined,
        notes,
      });

      res.status(201).json(invoice);
    } catch (error: any) {
      logger.error('Failed to create B2B invoice', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * GET /api/b2b-invoices — List invoices for user's org
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: 'Потрібна автентифікація' });

      const orgId = await getUserOrgId(userId);
      if (!orgId) return res.status(200).json({ invoices: [], total: 0 });

      const { status, limit, offset } = req.query;
      const result = await b2bInvoiceService.listByOrganization(orgId, {
        status: status as string,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });

      res.json(result);
    } catch (error: any) {
      logger.error('Failed to list B2B invoices', { error: error.message });
      res.status(500).json({ error: 'Помилка отримання рахунків' });
    }
  });

  /**
   * GET /api/b2b-invoices/:id — Get invoice details
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: 'Потрібна автентифікація' });

      const invoice = await b2bInvoiceService.getById(req.params.id as string);
      if (!invoice) return res.status(404).json({ error: 'Рахунок не знайдено' });

      // Verify user belongs to this org
      const orgId = await getUserOrgId(userId);
      if (invoice.organization_id !== orgId) {
        return res.status(403).json({ error: 'Немає доступу до цього рахунку' });
      }

      res.json(invoice);
    } catch (error: any) {
      logger.error('Failed to get B2B invoice', { error: error.message });
      res.status(500).json({ error: 'Помилка отримання рахунку' });
    }
  });

  /**
   * GET /api/b2b-invoices/:id/pdf — Download PDF
   */
  router.get('/:id/pdf', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: 'Потрібна автентифікація' });

      const invoice = await b2bInvoiceService.getById(req.params.id as string);
      if (!invoice) return res.status(404).json({ error: 'Рахунок не знайдено' });

      // Verify user belongs to this org (or is admin accessing via admin route)
      const orgId = await getUserOrgId(userId);
      if (invoice.organization_id !== orgId) {
        // Check if admin
        const adminResult = await db.query('SELECT is_admin, role FROM users WHERE id = $1', [userId]);
        if (!adminResult.rows[0]?.is_admin && adminResult.rows[0]?.role !== 'administrator') {
          return res.status(403).json({ error: 'Немає доступу до цього рахунку' });
        }
      }

      const pdfBuffer = await b2bInvoiceService.generatePDF(req.params.id as string);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number}.pdf"`);
      res.send(pdfBuffer);
    } catch (error: any) {
      logger.error('Failed to generate B2B invoice PDF', { error: error.message });
      res.status(500).json({ error: 'Помилка генерації PDF' });
    }
  });

  /**
   * POST /api/b2b-invoices/:id/cancel — Cancel unpaid invoice
   */
  router.post('/:id/cancel', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: 'Потрібна автентифікація' });

      const invoice = await b2bInvoiceService.getById(req.params.id as string);
      if (!invoice) return res.status(404).json({ error: 'Рахунок не знайдено' });

      const orgId = await getUserOrgId(userId);
      if (invoice.organization_id !== orgId) {
        return res.status(403).json({ error: 'Немає доступу до цього рахунку' });
      }

      const { reason } = req.body;
      const updated = await b2bInvoiceService.cancelInvoice(req.params.id as string, userId, reason);

      res.json(updated);
    } catch (error: any) {
      logger.error('Failed to cancel B2B invoice', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  // ===== ADMIN ENDPOINTS =====

  /**
   * GET /api/admin/b2b-invoices — Admin lists all B2B invoices
   */
  router.get('/admin/list', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { status, limit, offset } = req.query;
      const result = await b2bInvoiceService.listAll({
        status: status as string,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });

      res.json(result);
    } catch (error: any) {
      logger.error('Failed to list all B2B invoices', { error: error.message });
      res.status(500).json({ error: 'Помилка отримання рахунків' });
    }
  });

  /**
   * POST /api/b2b-invoices/admin/:id/confirm — Admin confirms payment
   */
  router.post('/admin/:id/confirm', requireAdmin, async (req: Request, res: Response) => {
    try {
      const adminUserId = (req as any).user?.id;
      const { payment_reference } = req.body;

      if (!payment_reference) {
        return res.status(400).json({ error: 'Потрібно вказати номер платіжного доручення' });
      }

      const updated = await b2bInvoiceService.confirmPayment(
        req.params.id as string,
        adminUserId,
        payment_reference,
        billingService,
        subscriptionService
      );

      res.json(updated);
    } catch (error: any) {
      logger.error('Failed to confirm B2B payment', { error: error.message });
      res.status(400).json({ error: error.message });
    }
  });

  return router;
}

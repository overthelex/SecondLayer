import type { IDatabase } from '../domain/ports/index.js';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { ConsultationService } from './consultation-service.js';
import { AttorneyPayoutService } from './attorney-payout-service.js';
import type { BillingService } from './billing-service.js';
import type { AuditService } from './audit-service.js';

const PLATFORM_FEE_PERCENT = 30; // 30% platform fee
const AUTO_RELEASE_DAYS = 7; // Days after completion to auto-release escrow

export interface ConsultationPayment {
  id: string;
  consultation_id: string;
  payer_user_id: string;
  payee_user_id: string;
  amount_uah: number;
  platform_fee_uah: number;
  attorney_payout_uah: number;
  status: 'pending' | 'processing' | 'held' | 'released' | 'refunded';
  payment_provider: string;
  payment_provider_id?: string;
  created_at: Date;
  processing_at?: Date;
  held_at?: Date;
  released_at?: Date;
  refunded_at?: Date;
}

export class ConsultationPaymentService {
  private payoutService?: AttorneyPayoutService;
  private billingService?: BillingService;
  private auditService?: AuditService;

  constructor(
    private db: IDatabase,
    private consultationService: ConsultationService,
    private monobankService: any // MonobankService | MockMonobankService
  ) {}

  setPayoutService(payoutService: AttorneyPayoutService): void {
    this.payoutService = payoutService;
  }

  setBillingService(billingService: BillingService): void {
    this.billingService = billingService;
  }

  setAuditService(auditService: AuditService): void {
    this.auditService = auditService;
  }

  async createPayment(consultationId: string, payerUserId: string): Promise<ConsultationPayment> {
    // Get consultation details
    const consultation = await this.db.query(
      `SELECT * FROM consultations WHERE id = $1 AND client_user_id = $2 AND status = 'accepted'`,
      [consultationId, payerUserId]
    );

    if (consultation.rows.length === 0) {
      throw new Error('Consultation not found or not in accepted status');
    }

    const c = consultation.rows[0];
    const amount = c.agreed_fee_uah || 0;

    if (amount <= 0 && c.fee_type !== 'free') {
      throw new Error('Consultation fee not set');
    }

    const platformFee = Math.round(amount * PLATFORM_FEE_PERCENT) / 100;
    const attorneyPayout = amount - platformFee;

    const id = uuidv4();
    const result = await this.db.query(
      `INSERT INTO consultation_payments (
        id, consultation_id, payer_user_id, payee_user_id,
        amount_uah, platform_fee_uah, attorney_payout_uah, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')
      RETURNING *`,
      [id, consultationId, payerUserId, c.attorney_user_id, amount, platformFee, attorneyPayout]
    );

    logger.info('Consultation payment created', { paymentId: id, consultationId, amount });
    return result.rows[0];
  }

  async initiatePayment(paymentId: string): Promise<{ paymentUrl: string; paymentId: string }> {
    const result = await this.db.query(
      `SELECT * FROM consultation_payments WHERE id = $1 AND status = 'pending'`,
      [paymentId]
    );

    if (result.rows.length === 0) {
      throw new Error('Payment not found or not in pending status');
    }

    const payment = result.rows[0] as ConsultationPayment;

    // Create Monobank invoice with consultation reference
    const reference = `CONSULT:${payment.consultation_id}:${payment.id}`;
    const invoiceResult = await this.monobankService.createInvoice(
      payment.payer_user_id,
      payment.amount_uah,
      `Legal consultation payment (ref: ${reference})`
    );

    // Update payment with provider ID
    await this.db.query(
      `UPDATE consultation_payments SET
        status = 'processing', processing_at = NOW(),
        payment_provider_id = $2
       WHERE id = $1`,
      [paymentId, invoiceResult.invoiceId]
    );

    logger.info('Consultation payment initiated via Monobank', {
      paymentId,
      invoiceId: invoiceResult.invoiceId,
    });

    return {
      paymentUrl: invoiceResult.pageUrl,
      paymentId,
    };
  }

  async handleWebhook(invoiceId: string, status: string): Promise<void> {
    // Find payment by provider ID
    const result = await this.db.query(
      `SELECT * FROM consultation_payments WHERE payment_provider_id = $1`,
      [invoiceId]
    );

    if (result.rows.length === 0) {
      logger.debug('Webhook for non-consultation payment, skipping', { invoiceId });
      return;
    }

    const payment = result.rows[0] as ConsultationPayment;

    if (status === 'success' || status === 'hold') {
      await this.db.query(
        `UPDATE consultation_payments SET status = 'held', held_at = NOW() WHERE id = $1`,
        [payment.id]
      );

      // Mark consultation as paid
      await this.consultationService.markPaid(payment.consultation_id, payment.id);

      logger.info('Consultation payment held (escrow)', {
        paymentId: payment.id,
        consultationId: payment.consultation_id,
      });

      // Audit: escrow.held
      if (this.auditService) {
        this.auditService.log({
          userId: payment.payer_user_id,
          action: 'escrow.held',
          resourceType: 'consultation_payment',
          resourceId: payment.id,
          details: { consultationId: payment.consultation_id, amountUah: payment.amount_uah },
        }).catch(err => logger.warn('[Audit] Failed to log escrow.held', { error: (err as Error).message }));
      }
    } else if (status === 'failure' || status === 'reversed') {
      await this.db.query(
        `UPDATE consultation_payments SET status = 'refunded', refunded_at = NOW() WHERE id = $1`,
        [payment.id]
      );

      logger.info('Consultation payment failed/reversed', {
        paymentId: payment.id,
        status,
      });
    }
  }

  async releasePayment(consultationId: string): Promise<void> {
    const payment = await this.db.transaction(async (client) => {
      // Lock the payment row to prevent concurrent release
      const lockResult = await client.query(
        `SELECT * FROM consultation_payments
         WHERE consultation_id = $1 AND status = 'held'
         FOR UPDATE`,
        [consultationId]
      );

      if (lockResult.rows.length === 0) {
        return null;
      }

      const row = lockResult.rows[0];

      // Update status within the same transaction
      await client.query(
        `UPDATE consultation_payments SET status = 'released', released_at = NOW()
         WHERE id = $1`,
        [row.id]
      );

      return row;
    });

    if (!payment) {
      return;
    }

    logger.info('Consultation payment released', {
      paymentId: payment.id,
      consultationId,
      amount: payment.attorney_payout_uah,
    });

    // Audit: escrow.released
    if (this.auditService) {
      this.auditService.log({
        userId: payment.payee_user_id,
        action: 'escrow.released',
        resourceType: 'consultation_payment',
        resourceId: payment.id,
        details: { consultationId, amountUah: payment.attorney_payout_uah, payerUserId: payment.payer_user_id },
      }).catch(err => logger.warn('[Audit] Failed to log escrow.released', { error: (err as Error).message }));
    }

    // Credit attorney's platform balance with their share.
    // If this fails, the error propagates — the payment status is already
    // committed as 'released', so a reconciliation job should pick it up.
    // We do NOT silently swallow this error.
    if (this.billingService && payment.payee_user_id && payment.attorney_payout_uah > 0) {
      const amountUah = parseFloat(payment.attorney_payout_uah);
      const amountUsd = await this.billingService.convertFromUah(amountUah);
      await this.billingService.getOrCreateUserBilling(payment.payee_user_id);
      await this.billingService.topUpBalance({
        userId: payment.payee_user_id,
        amountUsd,
        amountUah,
        description: `Виплата за консультацію (${amountUah} грн)`,
        paymentProvider: 'consultation_escrow',
        paymentId: payment.id,
      });
      logger.info('Attorney balance credited from escrow', {
        attorneyUserId: payment.payee_user_id,
        amountUah,
        amountUsd,
        consultationId,
      });
    }

    // Auto-create payout record for admin to process (non-critical)
    if (this.payoutService) {
      try {
        await this.payoutService.createPayout(consultationId);
      } catch (err: any) {
        logger.warn('Failed to create attorney payout record', { consultationId, error: err.message });
      }
    }
  }

  /**
   * Auto-release escrow payments for completed consultations older than 7 days.
   * Intended to be called by a daily cron job.
   */
  async autoReleaseStaleCompletedPayments(): Promise<number> {
    const result = await this.db.query(
      `SELECT cp.consultation_id
       FROM consultation_payments cp
       JOIN consultations c ON c.id = cp.consultation_id
       WHERE cp.status = 'held'
         AND c.status = 'completed'
         AND c.completed_at + INTERVAL '${AUTO_RELEASE_DAYS} days' < NOW()`
    );

    let released = 0;
    for (const row of result.rows) {
      try {
        await this.releasePayment(row.consultation_id);
        released++;
        logger.info('Auto-released stale escrow payment', { consultationId: row.consultation_id });
      } catch (err: any) {
        logger.error('Failed to auto-release escrow payment', {
          consultationId: row.consultation_id,
          error: err.message,
        });
      }
    }

    if (released > 0) {
      logger.info(`Auto-release cron: released ${released} stale escrow payments`);
    }
    return released;
  }

  async refundPayment(consultationId: string): Promise<void> {
    const payment = await this.db.transaction(async (client) => {
      // Lock the payment row to prevent concurrent refund/release
      const lockResult = await client.query(
        `SELECT * FROM consultation_payments
         WHERE consultation_id = $1 AND status IN ('held', 'processing')
         FOR UPDATE`,
        [consultationId]
      );

      if (lockResult.rows.length === 0) {
        return null;
      }

      const row = lockResult.rows[0];

      await client.query(
        `UPDATE consultation_payments SET status = 'refunded', refunded_at = NOW()
         WHERE id = $1`,
        [row.id]
      );

      return row;
    });

    if (payment) {
      logger.info('Consultation payment refunded', {
        paymentId: payment.id,
        consultationId,
      });

      // Audit: escrow.refunded
      if (this.auditService) {
        this.auditService.log({
          userId: payment.payer_user_id,
          action: 'escrow.refunded',
          resourceType: 'consultation_payment',
          resourceId: payment.id,
          details: { consultationId, amountUah: payment.amount_uah },
        }).catch(err => logger.warn('[Audit] Failed to log escrow.refunded', { error: (err as Error).message }));
      }
    }
  }

  async getPaymentByConsultation(consultationId: string): Promise<ConsultationPayment | null> {
    const result = await this.db.query(
      `SELECT * FROM consultation_payments WHERE consultation_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [consultationId]
    );
    return result.rows[0] || null;
  }

  /**
   * Flag consultations stuck in 'in_progress' for more than 30 days as 'disputed'.
   * Also logs failed attorney payouts. Intended for daily cron.
   */
  async flagStuckConsultationsAndPayouts(): Promise<{ disputed: number; failedPayouts: number }> {
    // Mark stuck in_progress consultations as disputed
    const stuckResult = await this.db.query(
      `UPDATE consultations
       SET status = 'disputed',
           dispute_reason = 'Автоматично: консультація в статусі in_progress понад 30 днів',
           dispute_raised_by = 'system',
           dispute_raised_at = NOW()
       WHERE status = 'in_progress'
         AND started_at < NOW() - INTERVAL '30 days'
       RETURNING id`
    );

    for (const row of stuckResult.rows) {
      logger.warn('[StuckEscrow] Consultation auto-disputed after 30 days', { consultationId: row.id });
      if (this.auditService) {
        this.auditService.log({
          action: 'escrow.auto_disputed',
          resourceType: 'consultation',
          resourceId: row.id,
          details: { reason: 'in_progress > 30 days' },
        }).catch(() => {});
      }
    }

    // Alert on failed payouts
    const failedPayouts = await this.db.query(
      `SELECT ap.id, ap.attorney_user_id, ap.amount_uah, ap.consultation_payment_id
       FROM attorney_payouts ap
       WHERE ap.status = 'failed'
         AND ap.updated_at > NOW() - INTERVAL '24 hours'`
    );

    for (const payout of failedPayouts.rows) {
      logger.error('[FailedPayout] Attorney payout failed and needs attention', {
        payoutId: payout.id,
        attorneyUserId: payout.attorney_user_id,
        amountUah: payout.amount_uah,
      });
    }

    if (stuckResult.rows.length > 0 || failedPayouts.rows.length > 0) {
      logger.info('[StuckEscrow] Cron completed', {
        disputed: stuckResult.rows.length,
        failedPayouts: failedPayouts.rows.length,
      });
    }

    return { disputed: stuckResult.rows.length, failedPayouts: failedPayouts.rows.length };
  }

  /**
   * Reconciliation assertion: SUM(released payments) should equal SUM(created payouts).
   * Returns the mismatch amount if any.
   */
  async getPayoutReconciliation(): Promise<{
    ok: boolean;
    releasedTotal: number;
    payoutsTotal: number;
    mismatch: number;
  }> {
    const result = await this.db.query(
      `SELECT
         COALESCE((SELECT SUM(attorney_payout_uah) FROM consultation_payments WHERE status = 'released'), 0) AS released_total,
         COALESCE((SELECT SUM(amount_uah) FROM attorney_payouts), 0) AS payouts_total`
    );

    const row = result.rows[0];
    const releasedTotal = parseFloat(row.released_total);
    const payoutsTotal = parseFloat(row.payouts_total);
    const mismatch = Math.abs(releasedTotal - payoutsTotal);

    return {
      ok: mismatch < 0.01,
      releasedTotal,
      payoutsTotal,
      mismatch,
    };
  }
}

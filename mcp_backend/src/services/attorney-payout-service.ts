import type { IDatabase } from '../domain/ports/index.js';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import type { AuditService } from './audit-service.js';

export interface AttorneyPayout {
  id: string;
  attorney_user_id: string;
  consultation_payment_id: string;
  amount_uah: number;
  bank_iban?: string;
  bank_account_holder?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  admin_notes?: string;
  processed_by?: string;
  processed_at?: Date;
  created_at: Date;
  updated_at: Date;
  // Joined fields
  attorney_name?: string;
  attorney_email?: string;
  consultation_id?: string;
  request_title?: string;
}

export class AttorneyPayoutService {
  private auditService?: AuditService;

  constructor(private db: IDatabase) {}

  setAuditService(auditService: AuditService): void {
    this.auditService = auditService;
  }

  /**
   * Create a payout record after escrow release.
   * Pulls attorney bank details from their profile at time of creation.
   */
  async createPayout(consultationId: string): Promise<AttorneyPayout | null> {
    // Get payment and attorney bank details
    const result = await this.db.query(
      `SELECT cp.id as payment_id, cp.attorney_payout_uah, cp.payee_user_id,
              ap.bank_iban, ap.bank_account_holder
       FROM consultation_payments cp
       LEFT JOIN attorney_profiles ap ON ap.user_id = cp.payee_user_id
       WHERE cp.consultation_id = $1 AND cp.status = 'released'`,
      [consultationId]
    );

    if (result.rows.length === 0) {
      logger.warn('Cannot create payout: no released payment found', { consultationId });
      return null;
    }

    const payment = result.rows[0];
    const id = uuidv4();

    const insertResult = await this.db.query(
      `INSERT INTO attorney_payouts (
        id, attorney_user_id, consultation_payment_id, amount_uah,
        bank_iban, bank_account_holder
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        id,
        payment.payee_user_id,
        payment.payment_id,
        payment.attorney_payout_uah,
        payment.bank_iban || null,
        payment.bank_account_holder || null,
      ]
    );

    logger.info('Attorney payout record created', {
      payoutId: id,
      consultationId,
      attorneyUserId: payment.payee_user_id,
      amount: payment.attorney_payout_uah,
    });

    return insertResult.rows[0];
  }

  /**
   * List pending payouts for admin dashboard
   */
  async listPendingPayouts(): Promise<AttorneyPayout[]> {
    const result = await this.db.query(
      `SELECT ap.*,
              u.name as attorney_name, u.email as attorney_email,
              c.id as consultation_id, c.request_title
       FROM attorney_payouts ap
       JOIN users u ON u.id = ap.attorney_user_id
       JOIN consultation_payments cp ON cp.id = ap.consultation_payment_id
       JOIN consultations c ON c.id = cp.consultation_id
       WHERE ap.status IN ('pending', 'processing')
       ORDER BY ap.created_at ASC`
    );
    return result.rows;
  }

  /**
   * Admin marks payout as manually processed (bank transfer done)
   */
  async markPayoutProcessed(
    payoutId: string,
    adminUserId: string,
    notes?: string
  ): Promise<AttorneyPayout> {
    const result = await this.db.query(
      `UPDATE attorney_payouts
       SET status = 'completed', processed_by = $2, processed_at = NOW(),
           admin_notes = $3, updated_at = NOW()
       WHERE id = $1 AND status IN ('pending', 'processing')
       RETURNING *`,
      [payoutId, adminUserId, notes || null]
    );

    if (result.rows.length === 0) {
      throw new Error('Payout not found or already processed');
    }

    const payout = result.rows[0];

    logger.info('Attorney payout marked as processed', {
      payoutId,
      adminUserId,
      amount: payout.amount_uah,
    });

    // Audit: payout.completed
    if (this.auditService) {
      this.auditService.log({
        userId: adminUserId,
        action: 'payout.completed',
        resourceType: 'attorney_payout',
        resourceId: payoutId,
        details: { attorneyUserId: payout.attorney_user_id, amountUah: payout.amount_uah },
      }).catch(err => logger.warn('[Audit] Failed to log payout.completed', { error: (err as Error).message }));
    }

    return payout;
  }

  /**
   * Attorney views their payout history
   */
  async getAttorneyPayoutHistory(attorneyUserId: string): Promise<AttorneyPayout[]> {
    const result = await this.db.query(
      `SELECT ap.*,
              c.id as consultation_id, c.request_title
       FROM attorney_payouts ap
       JOIN consultation_payments cp ON cp.id = ap.consultation_payment_id
       JOIN consultations c ON c.id = cp.consultation_id
       WHERE ap.attorney_user_id = $1
       ORDER BY ap.created_at DESC`,
      [attorneyUserId]
    );
    return result.rows;
  }
}

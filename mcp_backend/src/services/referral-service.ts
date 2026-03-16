/**
 * Referral Service
 * Manages referral codes, links, and rewards (lifetime 20% of every top-up)
 * Participation restricted to verified FOP/TOV/Attorneys
 */

import type { IDatabase } from '../domain/ports/index.js';
import type { BillingService } from './billing-service.js';
import { logger } from '../utils/logger.js';
import { randomBytes } from 'crypto';

const REFERRAL_REWARD_PERCENT = 20;
const REFERRAL_CODE_LENGTH = 8;

function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(REFERRAL_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

export interface ReferralStats {
  totalReferrals: number;
  totalEarnedUsd: number;
  totalEarnedUah: number;
  referralCode: string;
}

export interface ReferralEntry {
  referredId: string;
  referredName: string | null;
  referredEmail: string;
  registeredAt: string;
  hasToppedUp: boolean;
  rewardAmountUsd: number;
  rewardAmountUah: number;
  totalPaidUsd: number;
}

export type ReferrerType = 'fop' | 'tov' | 'attorney';

export interface ReferrerVerification {
  referrerType: ReferrerType;
  businessCode: string;
}

export interface ReferrerStatus {
  isVerified: boolean;
  referrerType: ReferrerType | null;
  businessCode: string | null;
  verifiedAt: string | null;
}

export class ReferralService {
  constructor(
    private db: IDatabase,
    private billingService: BillingService
  ) {}

  /**
   * Get existing referral code or create a new one.
   * Requires verified FOP/TOV/Attorney status.
   */
  async getOrCreateCode(userId: string): Promise<string> {
    const existing = await this.db.query(
      'SELECT code, verified_at FROM referral_codes WHERE user_id = $1 AND is_active = true',
      [userId]
    );
    if (existing.rows.length > 0) {
      if (!existing.rows[0].verified_at) {
        throw new Error('REFERRAL_NOT_VERIFIED');
      }
      return existing.rows[0].code;
    }

    // Generate unique code with retry
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateReferralCode();
      try {
        await this.db.query(
          'INSERT INTO referral_codes (user_id, code) VALUES ($1, $2)',
          [userId, code]
        );
        logger.info('Referral code created', { userId, code });
        return code;
      } catch (err: any) {
        if (err.code === '23505') continue; // unique violation, retry
        throw err;
      }
    }
    throw new Error('Failed to generate unique referral code');
  }

  /**
   * Submit verification request for referral program participation
   */
  async submitVerification(userId: string, verification: ReferrerVerification): Promise<void> {
    const { referrerType, businessCode } = verification;

    // Upsert referral code with verification data
    const existing = await this.db.query(
      'SELECT id FROM referral_codes WHERE user_id = $1',
      [userId]
    );

    if (existing.rows.length > 0) {
      await this.db.query(
        `UPDATE referral_codes
         SET referrer_type = $1, business_code = $2, verified_at = NOW()
         WHERE user_id = $3`,
        [referrerType, businessCode, userId]
      );
    } else {
      const code = generateReferralCode();
      await this.db.query(
        `INSERT INTO referral_codes (user_id, code, referrer_type, business_code, verified_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [userId, code, referrerType, businessCode]
      );
    }

    logger.info('Referral verification submitted', { userId, referrerType, businessCode });
  }

  /**
   * Get verification status for a user
   */
  async getVerificationStatus(userId: string): Promise<ReferrerStatus> {
    const result = await this.db.query(
      'SELECT referrer_type, business_code, verified_at FROM referral_codes WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0 || !result.rows[0].verified_at) {
      return { isVerified: false, referrerType: null, businessCode: null, verifiedAt: null };
    }

    const row = result.rows[0];
    return {
      isVerified: true,
      referrerType: row.referrer_type,
      businessCode: row.business_code,
      verifiedAt: row.verified_at,
    };
  }

  /**
   * Resolve a referral code to a user ID
   */
  async getUserByCode(code: string): Promise<string | null> {
    const result = await this.db.query(
      'SELECT user_id FROM referral_codes WHERE code = $1 AND is_active = true',
      [code]
    );
    return result.rows.length > 0 ? result.rows[0].user_id : null;
  }

  /**
   * Create a referral link between referrer and referred user
   */
  async linkReferral(referrerId: string, referredId: string): Promise<boolean> {
    if (referrerId === referredId) return false;

    try {
      await this.db.query(
        'INSERT INTO referral_links (referrer_id, referred_id) VALUES ($1, $2) ON CONFLICT (referred_id) DO NOTHING',
        [referrerId, referredId]
      );
      logger.info('Referral link created', { referrerId, referredId });
      return true;
    } catch (err: any) {
      logger.error('Failed to create referral link', { referrerId, referredId, error: err.message });
      return false;
    }
  }

  /**
   * Process referral reward on every top-up by referred user (lifetime model).
   * Deduplicates by transaction ID to prevent double-processing.
   */
  async processReward(
    referredUserId: string,
    transactionAmountUsd: number,
    transactionAmountUah: number,
    transactionId: string
  ): Promise<void> {
    // Find referrer
    const linkResult = await this.db.query(
      'SELECT referrer_id FROM referral_links WHERE referred_id = $1',
      [referredUserId]
    );
    if (linkResult.rows.length === 0) return; // no referrer

    const referrerId = linkResult.rows[0].referrer_id;

    // Check if reward already given for this specific transaction
    const existingReward = await this.db.query(
      'SELECT id FROM referral_rewards WHERE source_transaction_id = $1',
      [transactionId]
    );
    if (existingReward.rows.length > 0) return; // already processed this transaction

    const rewardUsd = Number((transactionAmountUsd * REFERRAL_REWARD_PERCENT / 100).toFixed(2));
    const rewardUah = Number((transactionAmountUah * REFERRAL_REWARD_PERCENT / 100).toFixed(2));

    if (rewardUsd <= 0) return;

    try {
      // Credit referrer's balance
      await this.billingService.topUpBalance({
        userId: referrerId,
        amountUsd: rewardUsd,
        amountUah: rewardUah,
        description: `Реферальна винагорода (${REFERRAL_REWARD_PERCENT}%)`,
        paymentProvider: 'referral',
        metadata: { referredUserId, sourceTransactionId: transactionId },
      });

      // Record reward
      await this.db.query(
        `INSERT INTO referral_rewards (beneficiary_id, source_user_id, source_transaction_id, percentage, amount_usd, amount_uah)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [referrerId, referredUserId, transactionId, REFERRAL_REWARD_PERCENT, rewardUsd, rewardUah]
      );

      logger.info('Referral reward credited', {
        referrerId,
        referredUserId,
        rewardUsd,
        rewardUah,
        transactionId,
      });
    } catch (err: any) {
      logger.error('Failed to process referral reward', {
        referrerId,
        referredUserId,
        error: err.message,
      });
    }
  }

  /**
   * Get referral statistics for a user
   */
  async getStats(userId: string): Promise<ReferralStats> {
    const code = await this.getOrCreateCode(userId);

    const countResult = await this.db.query(
      'SELECT COUNT(*) as total FROM referral_links WHERE referrer_id = $1',
      [userId]
    );

    const earningsResult = await this.db.query(
      'SELECT COALESCE(SUM(amount_usd), 0) as total_usd, COALESCE(SUM(amount_uah), 0) as total_uah FROM referral_rewards WHERE beneficiary_id = $1',
      [userId]
    );

    return {
      totalReferrals: parseInt(countResult.rows[0].total, 10),
      totalEarnedUsd: parseFloat(earningsResult.rows[0].total_usd),
      totalEarnedUah: parseFloat(earningsResult.rows[0].total_uah),
      referralCode: code,
    };
  }

  /**
   * Get list of referrals for a user (with aggregated lifetime rewards)
   */
  async getReferrals(userId: string): Promise<ReferralEntry[]> {
    const result = await this.db.query(
      `SELECT
        rl.referred_id,
        u.name AS referred_name,
        u.email AS referred_email,
        rl.registered_at,
        COALESCE(rr_agg.total_reward_usd, 0) AS reward_amount_usd,
        COALESCE(rr_agg.total_reward_uah, 0) AS reward_amount_uah,
        COALESCE(rr_agg.total_paid_usd, 0) AS total_paid_usd,
        COALESCE(rr_agg.reward_count, 0) > 0 AS has_topped_up
      FROM referral_links rl
      JOIN users u ON u.id = rl.referred_id
      LEFT JOIN (
        SELECT
          source_user_id,
          SUM(amount_usd) AS total_reward_usd,
          SUM(amount_uah) AS total_reward_uah,
          SUM(amount_usd / (percentage / 100)) AS total_paid_usd,
          COUNT(*) AS reward_count
        FROM referral_rewards
        WHERE beneficiary_id = $1
        GROUP BY source_user_id
      ) rr_agg ON rr_agg.source_user_id = rl.referred_id
      WHERE rl.referrer_id = $1
      ORDER BY rl.registered_at DESC`,
      [userId]
    );

    return result.rows.map((row: any) => ({
      referredId: row.referred_id,
      referredName: row.referred_name,
      referredEmail: row.referred_email,
      registeredAt: row.registered_at,
      hasToppedUp: row.has_topped_up,
      rewardAmountUsd: parseFloat(row.reward_amount_usd),
      rewardAmountUah: parseFloat(row.reward_amount_uah),
      totalPaidUsd: parseFloat(row.total_paid_usd),
    }));
  }
}

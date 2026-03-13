/**
 * Referral Service
 * Manages referral codes, links, and rewards (MVP: 1 level, 20% of first top-up)
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
}

export class ReferralService {
  constructor(
    private db: IDatabase,
    private billingService: BillingService
  ) {}

  /**
   * Get existing referral code or create a new one
   */
  async getOrCreateCode(userId: string): Promise<string> {
    const existing = await this.db.query(
      'SELECT code FROM referral_codes WHERE user_id = $1 AND is_active = true',
      [userId]
    );
    if (existing.rows.length > 0) {
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
   * Process referral reward on first top-up by referred user.
   * Checks if reward was already given for this source user.
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

    // Check if reward already given for this referred user
    const existingReward = await this.db.query(
      'SELECT id FROM referral_rewards WHERE beneficiary_id = $1 AND source_user_id = $2',
      [referrerId, referredUserId]
    );
    if (existingReward.rows.length > 0) return; // already rewarded

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
   * Get list of referrals for a user
   */
  async getReferrals(userId: string): Promise<ReferralEntry[]> {
    const result = await this.db.query(
      `SELECT
        rl.referred_id,
        u.name AS referred_name,
        u.email AS referred_email,
        rl.registered_at,
        COALESCE(rr.amount_usd, 0) AS reward_amount_usd,
        COALESCE(rr.amount_uah, 0) AS reward_amount_uah,
        CASE WHEN rr.id IS NOT NULL THEN true ELSE false END AS has_topped_up
      FROM referral_links rl
      JOIN users u ON u.id = rl.referred_id
      LEFT JOIN referral_rewards rr ON rr.beneficiary_id = $1 AND rr.source_user_id = rl.referred_id
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
    }));
  }
}

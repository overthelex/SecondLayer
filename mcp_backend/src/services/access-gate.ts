/**
 * Access Gate
 *
 * Controls access to paid features (chat, document upload).
 * A user is allowed if ANY of these conditions is true:
 *   - administrators: always allowed
 *   - users.is_beta_tester = TRUE: always allowed
 *   - has positive balance (from welcome bonus or top-up)
 *   - has at least one successful top-up in billing_transactions
 */

import type { IDatabase } from '../domain/ports/index.js';
import type { User } from './user-service.js';
import { logger } from '../utils/logger.js';

export type AccessGateReason =
  | 'beta_tester'
  | 'administrator'
  | 'has_balance'
  | 'monobank_topup'
  | 'no_balance'
  | 'no_monobank_topup'
  | 'unauthenticated';

export interface AccessGateDecision {
  allowed: boolean;
  reason: AccessGateReason;
}

const RESULT_BETA: AccessGateDecision = { allowed: true, reason: 'beta_tester' };
const RESULT_ADMIN: AccessGateDecision = { allowed: true, reason: 'administrator' };
const RESULT_BALANCE: AccessGateDecision = { allowed: true, reason: 'has_balance' };
const RESULT_TOPUP: AccessGateDecision = { allowed: true, reason: 'monobank_topup' };
const RESULT_DENIED: AccessGateDecision = { allowed: false, reason: 'no_balance' };
const RESULT_UNAUTH: AccessGateDecision = { allowed: false, reason: 'unauthenticated' };

/**
 * Returns true iff the user has a positive balance in user_billing.
 */
export async function hasPositiveBalance(db: IDatabase, userId: string): Promise<boolean> {
  const result = await db.query(
    `SELECT 1
       FROM user_billing
      WHERE user_id = $1
        AND (balance_usd > 0 OR balance_uah > 0)
      LIMIT 1`,
    [userId]
  );
  return result.rows.length > 0;
}

/**
 * Returns true iff the user has at least one successful Monobank top-up
 * recorded in billing_transactions.
 */
export async function hasMonobankTopup(db: IDatabase, userId: string): Promise<boolean> {
  const result = await db.query(
    `SELECT 1
       FROM billing_transactions
      WHERE user_id = $1
        AND type = 'topup'
        AND payment_provider = 'monobank'
        AND amount_usd > 0
      LIMIT 1`,
    [userId]
  );
  return result.rows.length > 0;
}

/**
 * Decide whether `user` is allowed to call paid features (chat, upload).
 */
export async function evaluateAccessGate(
  db: IDatabase,
  user: User | null | undefined
): Promise<AccessGateDecision> {
  if (!user || !user.id) return RESULT_UNAUTH;

  if (user.is_beta_tester === true) return RESULT_BETA;
  if (user.role === 'administrator' || user.is_admin === true) return RESULT_ADMIN;

  try {
    if (await hasPositiveBalance(db, user.id)) return RESULT_BALANCE;
    const ok = await hasMonobankTopup(db, user.id);
    return ok ? RESULT_TOPUP : RESULT_DENIED;
  } catch (error: any) {
    logger.error('[AccessGate] Failed to check access', {
      error: error?.message,
      userId: user.id,
    });
    return RESULT_DENIED;
  }
}

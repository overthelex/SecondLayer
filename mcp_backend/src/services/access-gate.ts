/**
 * Access Gate
 *
 * The hosted version of the application is currently restricted to internal
 * beta testers and to users who have demonstrated payment intent by topping
 * up their balance through Monobank. External users without a Monobank
 * top-up are blocked from chat and document upload.
 *
 * The gate is intentionally narrow:
 *   - administrators: always allowed
 *   - users.is_beta_tester = TRUE: always allowed
 *   - any other user: must have at least one successful Monobank top-up
 *     recorded in billing_transactions (type = 'topup',
 *     payment_provider = 'monobank', amount_usd > 0)
 *
 * The "balance increased via Monobank" check is intentionally based on the
 * existence of a successful top-up rather than on the current balance — the
 * balance can be drained by usage, but the user has still proven access.
 */

import type { IDatabase } from '../domain/ports/index.js';
import type { User } from './user-service.js';
import { logger } from '../utils/logger.js';

export type AccessGateReason =
  | 'beta_tester'
  | 'administrator'
  | 'monobank_topup'
  | 'no_monobank_topup'
  | 'unauthenticated';

export interface AccessGateDecision {
  allowed: boolean;
  reason: AccessGateReason;
}

const RESULT_BETA: AccessGateDecision = { allowed: true, reason: 'beta_tester' };
const RESULT_ADMIN: AccessGateDecision = { allowed: true, reason: 'administrator' };
const RESULT_TOPUP: AccessGateDecision = { allowed: true, reason: 'monobank_topup' };
const RESULT_DENIED: AccessGateDecision = { allowed: false, reason: 'no_monobank_topup' };
const RESULT_UNAUTH: AccessGateDecision = { allowed: false, reason: 'unauthenticated' };

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
    const ok = await hasMonobankTopup(db, user.id);
    return ok ? RESULT_TOPUP : RESULT_DENIED;
  } catch (error: any) {
    // Fail closed: if the lookup fails we deny access rather than letting
    // unrestricted external traffic through. The error is logged so we can
    // diagnose connectivity problems.
    logger.error('[AccessGate] Failed to check Monobank top-up', {
      error: error?.message,
      userId: user.id,
    });
    return RESULT_DENIED;
  }
}

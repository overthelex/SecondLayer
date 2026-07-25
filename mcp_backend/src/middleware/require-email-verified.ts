/**
 * Middleware: Require Email Verified
 *
 * Blocks JWT-authenticated users who have not verified their email
 * from accessing protected endpoints (e.g. file upload).
 *
 * API key (B2B) clients are always allowed through — they don't need
 * email verification.
 */

import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './dual-auth.js';
import { logger } from '../utils/logger.js';

/**
 * Require email verification for the current user.
 * Must be placed AFTER requireJWT or dualAuth middleware.
 *
 * Skips the check when:
 * - authType is 'apikey' (B2B clients)
 * - no user is attached (should not happen after requireJWT, but safe fallback)
 */
export function requireEmailVerified(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  // API key clients bypass email verification
  if (req.authType === 'apikey') {
    return next();
  }

  // No user attached — let downstream auth handle it
  if (!req.user) {
    return next();
  }

  if (req.user.email_verified !== true) {
    logger.warn('Email verification required — access denied', {
      userId: req.user.id,
      email: req.user.email,
      path: req.path,
    });

    res.status(403).json({
      error: 'Для завантаження документів необхідно підтвердити email. Перевірте свою поштову скриньку.',
      code: 'EMAIL_NOT_VERIFIED',
    });
    return;
  }

  next();
}

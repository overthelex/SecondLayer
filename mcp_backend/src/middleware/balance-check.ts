/**
 * Balance Check Middleware
 * Pre-flight balance validation before tool execution
 */

import { Request, Response, NextFunction } from 'express';
import { BillingService } from '../services/billing-service.js';
import { CostTracker } from '../services/cost-tracker.js';
import { logger } from '../utils/logger.js';
import { AuthenticatedRequest as DualAuthRequest } from './dual-auth.js';

/**
 * Create balance check middleware
 */
export function createBalanceCheckMiddleware(
  billingService: BillingService,
  costTracker: CostTracker
) {
  return async (req: DualAuthRequest, res: Response, next: NextFunction) => {
    try {
      // Skip balance check for legacy/internal API keys (no user_id)
      // Phase 2 API keys have user_id and must be subject to balance checks
      if (req.authType === 'apikey' && !req.user?.id) {
        logger.debug('Skipping balance check for legacy API key (no user_id)');
        return next();
      }

      const toolName = req.params.toolName || req.body.toolName || 'unknown';

      // Reject if no user - all requests must be attributed to an account
      if (!req.user || !req.user.id) {
        logger.warn('Balance check: no user in request, rejecting');
        return res.status(401).json({
          error: 'Authentication required',
          message: 'All requests must be authenticated and attributed to a user account',
          code: 'NO_USER_CONTEXT',
        });
      }

      const userId = req.user.id;

      // Get or create billing account
      const billing = await billingService.getOrCreateUserBilling(userId);

      // Skip if billing is disabled for this user
      if (!billing.billing_enabled) {
        logger.debug('Billing disabled for user', { userId });
        return next();
      }

      // Estimate cost for this request
      const queryLength = JSON.stringify(req.body).length;
      const reasoningBudget = (req.body.reasoning_budget || 'standard') as 'quick' | 'standard' | 'deep';

      const estimatedCost = await costTracker.estimateCost({
        toolName,
        queryLength,
        reasoningBudget,
      });

      logger.debug('Pre-flight balance check', {
        userId,
        toolName,
        estimatedCost: estimatedCost.total_estimated_cost_usd,
        currentBalance: billing.balance_usd,
      });

      // Check if user has sufficient balance
      const balanceCheck = await billingService.checkBalance(
        userId,
        estimatedCost.total_estimated_cost_usd
      );

      if (!balanceCheck.hasBalance) {
        logger.warn('Insufficient balance', {
          userId,
          required: estimatedCost.total_estimated_cost_usd,
          available: balanceCheck.currentBalance,
        });

        return res.status(402).json({
          error: 'Insufficient balance',
          message: `Required: $${estimatedCost.total_estimated_cost_usd.toFixed(2)}, Available: $${balanceCheck.currentBalance.toFixed(2)}`,
          code: 'INSUFFICIENT_BALANCE',
          balance: {
            current_usd: balanceCheck.currentBalance,
            required_usd: estimatedCost.total_estimated_cost_usd,
            shortfall_usd: estimatedCost.total_estimated_cost_usd - balanceCheck.currentBalance,
          },
          topup_url: `${process.env.FRONTEND_URL || 'https://billing.legal.org.ua'}/topup`,
        });
      }

      // Check daily and monthly limits
      const limitsCheck = await billingService.checkLimits(userId, estimatedCost.total_estimated_cost_usd);

      if (!limitsCheck.withinLimits) {
        const isDaily = limitsCheck.reason?.includes('Daily');
        logger.warn(isDaily ? 'Daily limit exceeded' : 'Monthly limit exceeded', {
          userId,
          dailySpent: limitsCheck.dailySpent,
          dailyLimit: limitsCheck.dailyLimit,
          monthlySpent: limitsCheck.monthlySpent,
          monthlyLimit: limitsCheck.monthlyLimit,
        });

        return res.status(429).json({
          error: isDaily ? 'Daily limit exceeded' : 'Monthly limit exceeded',
          message: limitsCheck.reason,
          code: isDaily ? 'DAILY_LIMIT_EXCEEDED' : 'MONTHLY_LIMIT_EXCEEDED',
          limits: {
            daily_limit_usd: limitsCheck.dailyLimit,
            daily_spent_usd: limitsCheck.dailySpent,
            monthly_limit_usd: limitsCheck.monthlyLimit,
            monthly_spent_usd: limitsCheck.monthlySpent,
          },
        });
      }

      // All checks passed - proceed to tool execution
      logger.debug('Pre-flight checks passed', { userId, toolName });
      next();
    } catch (error: any) {
      logger.error('Balance check middleware error', {
        error: error.message,
        userId: req.user?.id,
      });

      // Legacy API keys (no user_id) fail open — they are internal service keys
      if (req.authType === 'apikey' && !req.user?.id) {
        return next();
      }

      // Authenticated users fail closed — don't allow access when billing system is unavailable
      return res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'Billing system is temporarily unavailable. Please try again later.',
        code: 'BILLING_UNAVAILABLE',
      });
    }
  };
}

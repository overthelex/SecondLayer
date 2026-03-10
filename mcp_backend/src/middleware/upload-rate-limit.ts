import { Response, NextFunction } from 'express';
import type { ICachePort } from '../domain/ports/index.js';
import { logger } from '../utils/logger.js';
import { AuthenticatedRequest as DualAuthRequest } from './dual-auth.js';

let uploadRateCache: ICachePort | null = null;

/** Set the cache port for upload rate limiting. Call from composition root. */
export function setUploadRateLimitCache(cache: ICachePort): void {
  uploadRateCache = cache;
}

interface UserRateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

function createUserRateLimiter(options: UserRateLimitOptions) {
  const { windowMs, maxRequests, keyPrefix } = options;

  return async (req: DualAuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return next(); // Let auth middleware handle unauthenticated requests
      }

      if (!uploadRateCache) {
        return next(); // Cache unavailable, skip rate limiting
      }

      const key = `${keyPrefix}:${userId}`;
      const current = await uploadRateCache.get(key);
      const currentCount = current ? parseInt(current, 10) : 0;

      if (currentCount >= maxRequests) {
        const retryAfter = Math.ceil(windowMs / 1000);
        logger.warn('[UploadRateLimit] User rate limit exceeded', {
          userId,
          prefix: keyPrefix,
          current: currentCount,
          max: maxRequests,
        });

        res.setHeader('Retry-After', retryAfter.toString());
        return res.status(429).json({
          error: 'Too Many Requests',
          message: `Upload rate limit exceeded. Maximum ${maxRequests} requests per ${retryAfter} seconds`,
          code: 'UPLOAD_RATE_LIMIT_EXCEEDED',
          retryAfter,
        });
      }

      await uploadRateCache.increment(key, Math.ceil(windowMs / 1000));

      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', (maxRequests - currentCount - 1).toString());

      next();
    } catch (error) {
      logger.error('[UploadRateLimit] Cache error, allowing request', {
        error: (error as Error).message,
      });
      next();
    }
  };
}

// 500 init requests per minute per user (generous — session quota is the real abuse protection)
export const uploadInitRateLimit = createUserRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 500,
  keyPrefix: 'ratelimit:upload-init',
});

// 1000 batch-init requests per minute per user (each batch handles up to 2000 files;
// retries on failure consume this budget quickly). Session quota provides the real abuse protection.
export const uploadBatchInitRateLimit = createUserRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 1000,
  keyPrefix: 'ratelimit:upload-init-batch',
});

// 1500 chunk uploads per minute per user (100 users × 5 files × 10 chunks = 5000 chunks/min total)
export const uploadChunkRateLimit = createUserRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 1500,
  keyPrefix: 'ratelimit:upload-chunk',
});

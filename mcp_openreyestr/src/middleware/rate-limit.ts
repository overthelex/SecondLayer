import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
}

/**
 * In-memory rate limiter for OpenReyestr service.
 * Uses a simple Map with periodic cleanup since this service has no Redis.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of buckets) {
    if (val.resetAt <= now) {
      buckets.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, maxRequests, keyPrefix = 'ratelimit' } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const identifier = req.ip || req.socket.remoteAddress || 'unknown';
      const key = `${keyPrefix}:${identifier}`;
      const now = Date.now();

      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        bucket = { count: 0, resetAt: now + windowMs };
        buckets.set(key, bucket);
      }

      bucket.count++;

      if (bucket.count > maxRequests) {
        logger.warn('[RateLimit] Limit exceeded', {
          identifier,
          current: bucket.count,
          max: maxRequests,
          path: req.path,
        });

        res.status(429).json({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Maximum ${maxRequests} requests per ${windowMs / 1000} seconds`,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
        });
        return;
      }

      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', (maxRequests - bucket.count).toString());
      res.setHeader('X-RateLimit-Reset', bucket.resetAt.toString());

      next();
    } catch (error) {
      logger.error('[RateLimit] Error, allowing request', {
        error: (error as Error).message,
        path: req.path,
      });
      next();
    }
  };
}

// Global API rate limiter — baseline protection for all /api/ routes (120 req/min per IP)
export const globalApiRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 300,
  keyPrefix: 'ratelimit:or-global-api',
});

export const healthCheckRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 300,
  keyPrefix: 'ratelimit:or-health',
});

import { Request, Response, NextFunction } from 'express';
import type { ICachePort } from '../domain/ports/index.js';
import { logger } from '../utils/logger.js';

let rateCache: ICachePort | null = null;

/** Set the cache port for rate limiting. Call from composition root. */
export function setRateLimitCache(cache: ICachePort): void {
  rateCache = cache;
}

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
  skipSuccessfulRequests?: boolean;
  /** Use authenticated user ID instead of IP for rate limiting (requires JWT auth before this middleware) */
  keyByUserId?: boolean;
}

export function createRateLimiter(options: RateLimitOptions) {
  const {
    windowMs,
    maxRequests,
    keyPrefix = 'ratelimit',
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!rateCache) {
        return next(); // Cache unavailable, skip rate limiting
      }
      const identifier = options.keyByUserId && (req as any).user?.id
        ? `user:${(req as any).user.id}`
        : req.ip || req.socket.remoteAddress || 'unknown';

      // Skip rate limiting for internal/localhost traffic (Prometheus, health monitors)
      if (identifier === '127.0.0.1' || identifier === '::1' || identifier === '::ffff:127.0.0.1') {
        return next();
      }

      const key = keyPrefix + ':' + identifier;

      const current = await rateCache.get(key);
      const currentCount = current ? parseInt(current, 10) : 0;

      if (currentCount >= maxRequests) {
        logger.warn('[RateLimit] Limit exceeded', {
          identifier,
          current: currentCount,
          max: maxRequests,
          path: req.path,
        });

        return res.status(429).json({
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Maximum ' + maxRequests + ' requests per ' + (windowMs / 1000) + ' seconds',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil(windowMs / 1000),
        });
      }

      await rateCache.increment(key, Math.ceil(windowMs / 1000));

      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', (maxRequests - currentCount - 1).toString());
      res.setHeader('X-RateLimit-Reset', (Date.now() + windowMs).toString());

      next();
    } catch (error) {
      logger.error('[RateLimit] Cache error, allowing request', {
        error: (error as Error).message,
        path: req.path,
      });
      next();
    }
  };
}

export const mcpDiscoveryRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  keyPrefix: 'ratelimit:mcp-discovery',
});

export const healthCheckRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 300,
  keyPrefix: 'ratelimit:health',
});

export const webhookRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10,
  keyPrefix: 'ratelimit:webhook',
});

// Chat endpoint rate limiter — per authenticated user, not per IP
// (Cloudflare proxies all traffic through shared IPs)
export const chatRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
  keyPrefix: 'ratelimit:chat',
  keyByUserId: true,
});

// Auth endpoint rate limiter (max 10 requests per 15 minutes)
export const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  keyPrefix: 'ratelimit:auth',
});

// Strict rate limiter for password reset (max 3 requests per hour)
export const passwordResetRateLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 3,
  keyPrefix: 'ratelimit:password-reset',
});

// Global API rate limiter — covers all /api/ routes as a baseline.
// Raised to 1500/min to handle 20+ concurrent users behind Cloudflare (shared IP).
// Polling alone generates ~480 req/min for 20 users.
export const globalApiRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 1500,
  keyPrefix: 'ratelimit:global-api',
});

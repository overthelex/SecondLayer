/**
 * UploadRetry - Retry strategy and backoff logic for uploads
 *
 * Handles exponential backoff retries and 429 (rate limit) handling
 * with Retry-After header support and session quota recovery.
 */

import { uploadService } from '../api/UploadService';
import type { UploadEvent } from './types';

const MAX_RETRIES = 3;
const MAX_429_RETRIES = 30; // Cap 429 retries to prevent infinite loops
const RETRY_DELAYS = [1000, 2000, 4000]; // ms

export interface RetryContext {
  /** Emit an event to listeners */
  emit: (event: UploadEvent) => void;
}

export class UploadRetry {
  /**
   * Execute an async operation with retry logic, including 429 handling and
   * stale session auto-clear on SESSION_QUOTA_EXCEEDED.
   *
   * Returns the result of the operation on success, or throws the last error.
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    ctx: RetryContext,
    options?: {
      /** Label for error messages (e.g. "batch init", "chunk upload") */
      label?: string;
    }
  ): Promise<T> {
    const label = options?.label || 'operation';
    let lastError: Error | null = null;
    let throttleRetries = 0;
    let staleClearAttempted = false;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (err: any) {
        // Don't retry if cancelled/aborted
        if (err.name === 'AbortError') {
          throw err;
        }

        // 429 — wait for Retry-After, don't count as attempt (but cap retries)
        if (err.status === 429 || err.message?.includes('429')) {
          // Auto-clear stale sessions on SESSION_QUOTA_EXCEEDED (once per operation)
          if (err.details?.code === 'SESSION_QUOTA_EXCEEDED' && !staleClearAttempted) {
            staleClearAttempted = true;
            try {
              const clearResult = await uploadService.clearStaleSessions();
              if (clearResult.cancelled > 0) {
                ctx.emit({
                  type: 'error',
                  error: `Cleared ${clearResult.cancelled} stale session(s), retrying...`,
                });
                attempt--; // Retry immediately
                continue;
              }
            } catch {
              // Best effort — fall through to normal 429 handling
            }
          }

          throttleRetries++;
          if (throttleRetries > MAX_429_RETRIES) {
            lastError = new Error(`Server busy too long, ${label} failed`);
            break;
          }
          const retryAfter = parseInt(err.details?.retryAfter || err.retryAfter || '5', 10);
          ctx.emit({
            type: 'error',
            error: `Server busy, ${label} paused for ${retryAfter}s (${throttleRetries}/${MAX_429_RETRIES})`,
          });
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
          attempt--; // Don't count 429 as an attempt
          continue;
        }

        lastError = err;
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_DELAYS[attempt] || 4000;
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw lastError || new Error(`${label} failed after retries`);
  }

  /**
   * Execute with retry for batch init — uses batch-specific 429 message format
   * and returns null instead of throwing on final failure (caller falls back to individual init).
   */
  async executeWithRetryForBatch<T>(
    operation: () => Promise<T>,
    ctx: RetryContext,
    options?: { label?: string }
  ): Promise<T | null> {
    const label = options?.label || 'batch init';
    let lastError: Error | null = null;
    let throttleRetries = 0;
    let staleClearAttempted = false;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await operation();
      } catch (err: any) {
        // 429 — wait for Retry-After, don't count as attempt (but cap retries)
        if (err.status === 429) {
          // Auto-clear stale sessions on SESSION_QUOTA_EXCEEDED (once per batch)
          if (err.details?.code === 'SESSION_QUOTA_EXCEEDED' && !staleClearAttempted) {
            staleClearAttempted = true;
            try {
              const clearResult = await uploadService.clearStaleSessions();
              if (clearResult.cancelled > 0) {
                ctx.emit({
                  type: 'error',
                  error: `Cleared ${clearResult.cancelled} stale session(s), retrying...`,
                });
                attempt--; // Retry immediately
                continue;
              }
            } catch {
              // Best effort — fall through to normal 429 handling
            }
          }

          throttleRetries++;
          if (throttleRetries > MAX_429_RETRIES) {
            ctx.emit({ type: 'error', error: `Server busy too long, ${label} failed` });
            return null;
          }
          const retryAfter = parseInt(err.details?.retryAfter || '60', 10);
          ctx.emit({
            type: 'error',
            error: `Server busy, ${label} paused for ${retryAfter}s (${throttleRetries}/${MAX_429_RETRIES})`,
          });
          await new Promise((r) => setTimeout(r, retryAfter * 1000));
          attempt--; // Don't count 429 as an attempt
          continue;
        }

        // Other errors — backoff then continue
        lastError = err;
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_DELAYS[attempt] || 4000;
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        // All retries exhausted
        ctx.emit({
          type: 'error',
          error: `${label} failed, falling back to individual init`,
        });
        return null;
      }
    }

    // Should not reach here, but just in case
    if (lastError) {
      ctx.emit({
        type: 'error',
        error: `${label} failed, falling back to individual init`,
      });
    }
    return null;
  }
}

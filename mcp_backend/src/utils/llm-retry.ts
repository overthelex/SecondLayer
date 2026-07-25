import { logger } from './logger.js';

export interface LLMRetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  operationName?: string;
}

const DEFAULT_OPTIONS: Required<LLMRetryOptions> = {
  maxRetries: 2,
  baseDelayMs: 1000,
  timeoutMs: 10_000,
  operationName: 'llm-call',
};

function isRetryableError(error: any): boolean {
  const msg = error?.message?.toLowerCase() || '';
  const status = error?.status || error?.statusCode || 0;

  if (status === 429) return true;
  if (status >= 500 && status < 600) return true;
  if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('socket hang up')) return true;
  if (msg.includes('rate limit') || msg.includes('throttl')) return true;

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withLLMRetry<T>(
  fn: (signal?: AbortSignal) => Promise<T>,
  options?: LLMRetryOptions,
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

      try {
        const result = await fn(controller.signal);
        clearTimeout(timer);
        return result;
      } finally {
        clearTimeout(timer);
      }
    } catch (error: any) {
      lastError = error;

      if (error?.name === 'AbortError') {
        logger.warn(`[${opts.operationName}] Timeout after ${opts.timeoutMs}ms (attempt ${attempt + 1}/${opts.maxRetries + 1})`);
      }

      const canRetry = attempt < opts.maxRetries && (isRetryableError(error) || error?.name === 'AbortError');

      if (!canRetry) {
        break;
      }

      const delay = opts.baseDelayMs * Math.pow(2, attempt);
      logger.warn(`[${opts.operationName}] Retrying in ${delay}ms (attempt ${attempt + 1}/${opts.maxRetries + 1})`, {
        error: error.message,
      });
      await sleep(delay);
    }
  }

  throw lastError;
}

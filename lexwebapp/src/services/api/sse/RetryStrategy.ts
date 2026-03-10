/**
 * Retry Strategy
 * Exponential backoff retry utility for async operations
 */

export interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
}

/**
 * Calculate exponential backoff delay for a given retry attempt
 * @param attempt - Zero-based retry attempt index
 * @param baseDelay - Base delay in milliseconds
 * @returns Delay in milliseconds
 */
export function calculateRetryDelay(attempt: number, baseDelay: number): number {
  return baseDelay * Math.pow(2, attempt);
}

/**
 * Execute an async function with exponential backoff retry
 * @param fn - Async function to execute
 * @param options - Retry configuration
 * @returns Result of the function
 * @throws Last error if all retries are exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxRetries, baseDelay } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= maxRetries) {
        throw error;
      }

      const delay = calculateRetryDelay(attempt, baseDelay);
      console.log(`Retrying (${attempt + 1}/${maxRetries})...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Unreachable, but TypeScript needs it
  throw new Error('Retry logic error');
}

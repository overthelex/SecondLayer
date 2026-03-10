import axios from 'axios';

/**
 * Extract a human-readable error message from an unknown catch value.
 */
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message
      || error.response?.data?.error
      || error.message
      || 'Невідома помилка';
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Невідома помилка';
}

/**
 * Check if the caught error is an AbortError (fetch/XHR cancellation).
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * Type guard: checks if an unknown value has an HTTP-like `status` number property.
 */
export function hasStatus(err: unknown): err is { status: number; message?: string; details?: Record<string, unknown>; retryAfter?: string } {
  return typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status: unknown }).status === 'number';
}

/**
 * Type guard: checks if an unknown value has a `.code` property (e.g. MetaMask errors).
 */
export function hasCode(err: unknown): err is { code: number; message?: string } {
  return typeof err === 'object' && err !== null && 'code' in err && typeof (err as { code: unknown }).code === 'number';
}

/**
 * Type guard: checks if an unknown value has a `.name` property (e.g. DOMException).
 */
export function hasName(err: unknown): err is { name: string; message?: string } {
  return typeof err === 'object' && err !== null && 'name' in err && typeof (err as { name: unknown }).name === 'string';
}

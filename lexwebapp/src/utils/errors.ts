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

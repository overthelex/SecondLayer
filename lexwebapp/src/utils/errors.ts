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
  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>;
    // Extract from response.data (axios-like error shape without isAxiosError)
    if (obj.response && typeof obj.response === 'object') {
      const resp = obj.response as Record<string, unknown>;
      if (resp.data && typeof resp.data === 'object') {
        const data = resp.data as Record<string, unknown>;
        if (typeof data.message === 'string') return data.message;
        if (typeof data.error === 'string') return data.error;
      }
    }
    if (typeof obj.message === 'string') return obj.message;
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
 * True when the error is a network-level fetch failure (connection dropped, server
 * unreachable) rather than an application error. Browsers throw a TypeError here, with a
 * message that varies by engine: "Failed to fetch" (Chrome), "NetworkError when attempting
 * to fetch resource." (Firefox), "Load failed" (Safari). Used to retry transparently across
 * a backend restart (e.g. blue-green deploy upstream switch) instead of surfacing an error.
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) {
    const m = error.message.toLowerCase();
    return m.includes('fetch') || m.includes('network') || m.includes('load failed') || m.includes('connection');
  }
  return false;
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

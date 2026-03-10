/**
 * BackpressureManager - Handles server throttling detection and adaptive concurrency
 *
 * Monitors server backpressure headers (X-Upload-Queue-Depth, X-Upload-Throttle)
 * and adjusts upload concurrency and inter-chunk delays accordingly.
 */

import type { UploadEvent } from './types';

const DEFAULT_CONCURRENT_FILES = 3;

export class BackpressureManager {
  private _isThrottled = false;
  private _serverQueueDepth = 0;
  private _interChunkDelay = 0; // ms, added when throttled
  private _maxConcurrentFiles = DEFAULT_CONCURRENT_FILES;
  private _userRequestedConcurrency = DEFAULT_CONCURRENT_FILES;

  get isThrottled(): boolean {
    return this._isThrottled;
  }

  get serverQueueDepth(): number {
    return this._serverQueueDepth;
  }

  get interChunkDelay(): number {
    return this._interChunkDelay;
  }

  get maxConcurrentFiles(): number {
    return this._maxConcurrentFiles;
  }

  setConcurrency(n: number): void {
    this._userRequestedConcurrency = Math.max(1, Math.min(100, n));
    this._maxConcurrentFiles = this._userRequestedConcurrency;
  }

  getConcurrency(): number {
    return this._maxConcurrentFiles;
  }

  /**
   * Process backpressure headers from server response.
   * Returns an event to emit if throttle state changed, or null otherwise.
   */
  handleBackpressureHeaders(headers: Record<string, string> | null): UploadEvent | null {
    if (!headers) return null;

    const queueDepth = parseInt(headers['x-upload-queue-depth'] || '0', 10);
    const throttle = headers['x-upload-throttle'] === '1';

    this._serverQueueDepth = queueDepth;

    if (throttle && !this._isThrottled) {
      // Server is under load — reduce concurrency
      this._isThrottled = true;
      this._maxConcurrentFiles = Math.max(1, Math.floor(this._userRequestedConcurrency / 2));
      this._interChunkDelay = 500;
      return {
        type: 'throttle-changed',
        isThrottled: true,
        serverQueueDepth: queueDepth,
      };
    } else if (!throttle && this._isThrottled && queueDepth < 100) {
      // Server recovered — gradually restore concurrency
      this._isThrottled = false;
      this._interChunkDelay = 0;
      this._maxConcurrentFiles = this._userRequestedConcurrency;
      return {
        type: 'throttle-changed',
        isThrottled: false,
        serverQueueDepth: queueDepth,
      };
    }

    return null;
  }
}

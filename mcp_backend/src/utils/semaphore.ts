/**
 * Counting semaphore for limiting concurrency.
 *
 * `acquire()` returns a release callback so callers can use it in a
 * try/finally block without having to remember a separate `release()` call:
 *
 * ```ts
 * const release = await semaphore.acquire();
 * try {
 *   await doWork();
 * } finally {
 *   release();
 * }
 * ```
 */
export class Semaphore {
  private current = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<() => void> {
    if (this.current < this.max) {
      this.current++;
      return () => this.release();
    }
    return new Promise<() => void>((resolve) => {
      this.queue.push(() => {
        this.current++;
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    this.current = Math.max(0, this.current - 1);
    const next = this.queue.shift();
    if (next) next();
  }

  get pending(): number {
    return this.queue.length;
  }

  get inFlight(): number {
    return this.current;
  }
}

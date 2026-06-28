// Set a short op timeout BEFORE the adapter module is evaluated (the constant is read at load).
process.env.REDIS_OP_TIMEOUT_MS = '80';

import { CacheAdapter } from '../cache-adapter';

/**
 * Regression: a stale Redis connection used to hang every request because node-redis has no
 * per-command timeout and this client backs the rate limiter (in front of all /api/ routes).
 * CacheAdapter now bounds each op so a hung client fails fast and callers can fall back.
 */
function makeClient(overrides: Partial<Record<string, any>> = {}) {
  return {
    get: jest.fn().mockResolvedValue('5'),
    set: jest.fn().mockResolvedValue('OK'),
    setEx: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    ping: jest.fn().mockResolvedValue('PONG'),
    multi: jest.fn(() => ({
      incr: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([6, 1]),
    })),
    ...overrides,
  } as any;
}

describe('CacheAdapter — fast-fail on a hung Redis client', () => {
  it('passes through values when Redis responds', async () => {
    const adapter = new CacheAdapter(makeClient());
    await expect(adapter.get('k')).resolves.toBe('5');
    await expect(adapter.increment('k', 60)).resolves.toBe(6);
    await expect(adapter.ping()).resolves.toBe(true);
  });

  it('rejects get() instead of hanging when the client never resolves', async () => {
    const adapter = new CacheAdapter(makeClient({ get: jest.fn(() => new Promise(() => {})) }));
    await expect(adapter.get('k')).rejects.toThrow(/timed out/i);
  });

  it('rejects increment() instead of hanging when multi.exec never resolves', async () => {
    const hangingMulti = {
      incr: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn(() => new Promise(() => {})),
    };
    const adapter = new CacheAdapter(makeClient({ multi: jest.fn(() => hangingMulti) }));
    await expect(adapter.increment('k', 60)).rejects.toThrow(/timed out/i);
  });

  it('ping() returns false (not a hang) when the client never resolves', async () => {
    const adapter = new CacheAdapter(makeClient({ ping: jest.fn(() => new Promise(() => {})) }));
    await expect(adapter.ping()).resolves.toBe(false);
  });
});

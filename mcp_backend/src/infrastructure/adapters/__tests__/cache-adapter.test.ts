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

/**
 * Regression (LEXAI-1795, root cause found 2026-08-01): a deploy step re-attached the running
 * container to the docker network, which changed its IP, and every socket the process already
 * held became a black hole — writes are never delivered, and no RST or FIN comes back. node-redis
 * therefore never emits an error and never reconnects, so every op fell to the timeout above for
 * ~15 minutes, until the kernel's TCP keepalive finally killed the socket. The deploy no longer
 * does that, but any future silent socket death must not need a human or a kernel timer: after a
 * few consecutive timeouts the adapter drops the socket itself.
 */
describe('CacheAdapter — self-heal after repeated timeouts', () => {
  const hang = () => new Promise(() => {});

  function makeHungClient() {
    return makeClient({
      get: jest.fn(hang),
      isOpen: true,
      destroy: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
    });
  }

  it('does not touch the socket while timeouts are below the threshold', async () => {
    const client = makeHungClient();
    const adapter = new CacheAdapter(client);
    await expect(adapter.get('k')).rejects.toThrow(/timed out/i);
    await expect(adapter.get('k')).rejects.toThrow(/timed out/i);
    expect(client.destroy).not.toHaveBeenCalled();
  });

  it('drops and re-opens the connection after three consecutive timeouts', async () => {
    const client = makeHungClient();
    const adapter = new CacheAdapter(client);
    for (let i = 0; i < 3; i++) {
      await expect(adapter.get('k')).rejects.toThrow(/timed out/i);
    }
    await new Promise(r => setImmediate(r));   // reconnect runs off the failing call
    expect(client.destroy).toHaveBeenCalledTimes(1);
    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it('forgets the streak once an op succeeds', async () => {
    const get = jest.fn()
      .mockImplementationOnce(hang)
      .mockImplementationOnce(hang)
      .mockResolvedValueOnce('5')
      .mockImplementationOnce(hang)
      .mockImplementationOnce(hang);
    const client = makeHungClient();
    client.get = get;
    const adapter = new CacheAdapter(client);

    await expect(adapter.get('k')).rejects.toThrow(/timed out/i);
    await expect(adapter.get('k')).rejects.toThrow(/timed out/i);
    await expect(adapter.get('k')).resolves.toBe('5');
    await expect(adapter.get('k')).rejects.toThrow(/timed out/i);
    await expect(adapter.get('k')).rejects.toThrow(/timed out/i);

    await new Promise(r => setImmediate(r));
    expect(client.destroy).not.toHaveBeenCalled();
  });
});

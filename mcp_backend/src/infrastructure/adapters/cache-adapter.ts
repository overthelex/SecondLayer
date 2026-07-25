/**
 * Adapter that wraps the node-redis client behind ICachePort.
 */

import { createClient } from 'redis';
import { logger } from '../../utils/logger.js';
import type { ICachePort } from '../../domain/ports/index.js';

type RedisClient = ReturnType<typeof createClient>;

// node-redis has no per-command timeout: a stale TCP connection makes commands hang until the
// OS read timeout fires (tens of seconds). Because this single client backs the rate limiter
// (in front of every /api/ route) plus many services, one dead socket stalls EVERY in-flight
// request. Bound each op so a hung Redis fails fast and callers degrade (rate limiter → memory)
// instead of holding the request open. The underlying command stays queued and runs on
// reconnect, which is harmless for our cache/counter usage.
//
// Redis itself replies in ~0.1ms, so this budget is NOT about Redis latency — it absorbs
// command-queue + event-loop lag on the single shared connection during heavy work (e.g. the
// chat agentic loop parsing large tool results). At 1000ms that lag produced spurious
// "Redis GET timed out" warnings on the hot path (LEXAI-1795); 2500ms clears them while still
// failing fast on a genuinely dead socket (which keepAlive/pingInterval also detect ~30s).
const REDIS_OP_TIMEOUT_MS = Number(process.env.REDIS_OP_TIMEOUT_MS || 2500);

export class CacheAdapter implements ICachePort {
  private client: RedisClient;

  constructor(client: RedisClient) {
    this.client = client;
  }

  private async withTimeout<T>(op: Promise<T>, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        op,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Redis ${label} timed out after ${REDIS_OP_TIMEOUT_MS}ms`)),
            REDIS_OP_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.withTimeout(this.client.get(key), 'GET');
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds !== undefined) {
      await this.withTimeout(this.client.setEx(key, ttlSeconds, value), 'SETEX');
    } else {
      await this.withTimeout(this.client.set(key, value), 'SET');
    }
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return this.withTimeout(this.client.del(keys), 'DEL');
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const results = await this.withTimeout(
      this.client.multi().incr(key).expire(key, ttlSeconds).exec(),
      'INCR',
    );
    return (results?.[0] as unknown as number) ?? 0;
  }

  async ping(): Promise<boolean> {
    try {
      const reply = await this.withTimeout(this.client.ping(), 'PING');
      return reply === 'PONG';
    } catch {
      return false;
    }
  }

  isConnected(): boolean {
    return this.client.isOpen;
  }

  async connect(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  async disconnect(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }
}

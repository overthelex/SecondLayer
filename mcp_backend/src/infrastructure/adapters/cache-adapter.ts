/**
 * Adapter that wraps the node-redis client behind ICachePort.
 */

import { createClient } from 'redis';
import { logger } from '../../utils/logger.js';
import type { ICachePort } from '../../domain/ports/index.js';

type RedisClient = ReturnType<typeof createClient>;

export class CacheAdapter implements ICachePort {
  private client: RedisClient;

  constructor(client: RedisClient) {
    this.client = client;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds !== undefined) {
      await this.client.setEx(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return this.client.del(keys);
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const results = await this.client
      .multi()
      .incr(key)
      .expire(key, ttlSeconds)
      .exec();
    return (results?.[0] as unknown as number) ?? 0;
  }

  async ping(): Promise<boolean> {
    try {
      const reply = await this.client.ping();
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

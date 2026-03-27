/**
 * ChatSearchCacheService — Redis-backed cache for chat tool call results.
 *
 * Caches results keyed by toolName + SHA256(params), namespaced under chat:search:.
 * Supports per-conversation invalidation via a secondary index stored in Redis sets.
 *
 * TTL is controlled by CHAT_SEARCH_CACHE_TTL env var (default 300 seconds).
 *
 * Graceful degradation: all methods are no-ops when cache is unavailable.
 */

import { createHash } from 'crypto';
import { logger } from '../utils/logger.js';
import type { ICachePort } from '../domain/ports/index.js';

const KEY_PREFIX = 'chat:search:';
const CONV_INDEX_PREFIX = 'chat:conv:';
const DEFAULT_TTL = 300; // 5 minutes

function getTtl(): number {
  const raw = process.env.CHAT_SEARCH_CACHE_TTL;
  if (raw) {
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_TTL;
}

function hashParams(toolName: string, params: Record<string, unknown>): string {
  // Sort keys so field order doesn't affect the hash
  const stable = JSON.stringify(params, Object.keys(params).sort());
  return createHash('sha256').update(`${toolName}:${stable}`).digest('hex').slice(0, 24);
}

export class ChatSearchCacheService {
  private cache: ICachePort | null = null;

  // Constructor accepts optional positional args (zoAdapter, documentService) for
  // compatibility with the factory wiring — they are not used by this service.
  constructor(..._args: any[]) {}

  setCachePort(cache: ICachePort | null): void {
    this.cache = cache;
  }

  async getCachedResult(toolName: string, params: Record<string, unknown>): Promise<unknown | null> {
    if (!this.cache) return null;
    try {
      const key = `${KEY_PREFIX}${hashParams(toolName, params)}`;
      const raw = await this.cache.get(key);
      if (!raw) {
        logger.debug('[ChatSearchCache] miss', { toolName });
        return null;
      }
      logger.debug('[ChatSearchCache] hit', { toolName });
      return JSON.parse(raw);
    } catch (err: any) {
      logger.debug('[ChatSearchCache] getCachedResult error', { toolName, error: err.message });
      return null;
    }
  }

  async cacheResult(
    toolName: string,
    params: Record<string, unknown>,
    result: unknown,
    conversationId?: string,
  ): Promise<void> {
    if (!this.cache) return;
    try {
      const hash = hashParams(toolName, params);
      const key = `${KEY_PREFIX}${hash}`;
      const ttl = getTtl();
      await this.cache.set(key, JSON.stringify(result), ttl);

      // Track the key under the conversation's index so invalidate() can find it
      if (conversationId) {
        const indexKey = `${CONV_INDEX_PREFIX}${conversationId}`;
        // Store as a JSON array — append the new hash to the existing list
        const existing = await this.cache.get(indexKey);
        const hashes: string[] = existing ? JSON.parse(existing) : [];
        if (!hashes.includes(hash)) {
          hashes.push(hash);
          await this.cache.set(indexKey, JSON.stringify(hashes), ttl);
        }
      }
    } catch (err: any) {
      logger.debug('[ChatSearchCache] cacheResult error', { toolName, error: err.message });
    }
  }

  async invalidate(conversationId: string): Promise<void> {
    if (!this.cache) return;
    try {
      const indexKey = `${CONV_INDEX_PREFIX}${conversationId}`;
      const raw = await this.cache.get(indexKey);
      if (!raw) return;

      const hashes: string[] = JSON.parse(raw);
      const keysToDelete = hashes.map((h) => `${KEY_PREFIX}${h}`);

      if (keysToDelete.length > 0) {
        await this.cache.del(...keysToDelete);
        logger.debug('[ChatSearchCache] invalidated conversation', {
          conversationId,
          count: keysToDelete.length,
        });
      }
      await this.cache.del(indexKey);
    } catch (err: any) {
      logger.debug('[ChatSearchCache] invalidate error', { conversationId, error: err.message });
    }
  }
}

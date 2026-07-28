import { createClient } from 'redis';
import { logger } from './logger';

let redisClient: ReturnType<typeof createClient> | null = null;

/**
 * Optional hook to surface the client's live connection state (1=ready, 0=down).
 * Wired to a Prometheus gauge from the composition root so we can alert on a
 * disconnected / reconnecting backend Redis client. No-op until set.
 */
type RedisStateHook = (up: boolean) => void;
let stateHook: RedisStateHook | null = null;
export function setRedisStateHook(hook: RedisStateHook): void {
  stateHook = hook;
}

/**
 * Получает singleton экземпляр Redis клиента.
 * Автоматически подключается при первом вызове.
 */
export async function getRedisClient(): Promise<ReturnType<typeof createClient> | null> {
  if (redisClient) {
    return redisClient;
  }

  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    // Half-open-socket protection. keepAlive/pingInterval alone are NOT enough: a silently
    // dropped connection (e.g. mid blue-green cutover) can leave node-redis "connected" with a
    // dead socket. Without a read-inactivity timeout node-redis never tears it down, so it never
    // reconnects and EVERY command hangs until the CacheAdapter 2500ms timeout — indefinitely
    // (prod incident 2026-07: all cache/rate-limit ops timed out for 6+ min until a manual
    // restart). socketTimeout closes the socket when no bytes arrive within the window; because
    // pingInterval keeps PONG traffic flowing on a healthy link (~every 20s), it only fires on a
    // genuinely dead socket → reconnectStrategy re-establishes a working connection automatically.
    // socketTimeout MUST be comfortably larger than pingInterval so a couple of missed PONGs on a
    // healthy but momentarily busy link don't cause a spurious teardown.
    redisClient = createClient({
      url: redisUrl,
      socket: {
        keepAlive: true,
        keepAliveInitialDelay: 30_000,
        connectTimeout: 10_000,
        socketTimeout: 60_000,
        reconnectStrategy: (retries) => Math.min(retries * 100, 3_000),
      },
      pingInterval: 20_000,
    });

    redisClient.on('error', (err) => {
      logger.error('[Redis] Client error:', err);
    });

    redisClient.on('connect', () => {
      logger.info('[Redis] Connected successfully');
    });

    redisClient.on('ready', () => {
      stateHook?.(true);
    });

    // node-redis emits 'reconnecting' when the socket dropped (incl. socketTimeout teardown) and
    // 'end' when the client gives up. Both mean the client can't serve commands right now.
    redisClient.on('reconnecting', () => {
      logger.warn('[Redis] Reconnecting');
      stateHook?.(false);
    });

    redisClient.on('end', () => {
      logger.warn('[Redis] Connection ended');
      stateHook?.(false);
    });

    await redisClient.connect();
    stateHook?.(true);
    logger.info('[Redis] Client initialized');

    return redisClient;
  } catch (error: any) {
    logger.warn('[Redis] Connection failed, continuing without cache:', error.message);
    redisClient = null;
    return null;
  }
}

/**
 * Закрывает соединение с Redis
 */
export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info('[Redis] Client disconnected');
    } catch (error: any) {
      logger.error('[Redis] Error during disconnect:', error.message);
    } finally {
      redisClient = null;
    }
  }
}

/**
 * Проверяет, подключен ли Redis клиент
 */
export function isRedisConnected(): boolean {
  return redisClient !== null && redisClient.isOpen;
}

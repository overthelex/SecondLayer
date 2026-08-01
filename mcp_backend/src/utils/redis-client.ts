import { createClient } from 'redis';
import { logger } from './logger';

let redisClient: ReturnType<typeof createClient> | null = null;

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
    // keepAlive surfaces a dead TCP connection at the socket layer; pingInterval probes idle
    // connections from the app so a silently-dropped socket is detected and reconnected before
    // it stalls a request (see CacheAdapter — these timeouts are the second line of defense).
    redisClient = createClient({
      url: redisUrl,
      socket: {
        keepAlive: true,
        keepAliveInitialDelay: 30_000,
        connectTimeout: 10_000,
        reconnectStrategy: (retries) => Math.min(retries * 100, 3_000),
      },
      pingInterval: 30_000,
    });

    redisClient.on('error', (err) => {
      logger.error('[Redis] Client error:', err);
    });

    redisClient.on('connect', () => {
      logger.info('[Redis] Connected successfully');
    });

    // node-redis emits 'end', not 'disconnect' — the old listener could never fire, so a socket
    // that closed did it silently. 'reconnecting' is logged too: when the client is stuck writing
    // into a dead socket (see CacheAdapter.forceReconnect) the absence of these lines is itself
    // the diagnosis.
    redisClient.on('end', () => {
      logger.warn('[Redis] Connection closed');
    });

    redisClient.on('reconnecting', () => {
      logger.warn('[Redis] Reconnecting');
    });

    await redisClient.connect();
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

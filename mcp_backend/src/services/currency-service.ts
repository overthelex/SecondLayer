/**
 * CurrencyService
 * Fetches USD->UAH exchange rate from Monobank public API.
 * Caches rate in Redis with 1-hour TTL.
 * Falls back to last-known rate or default (~41.5 UAH) if API unavailable.
 */

import { logger } from '../utils/logger.js';
import { getRedisClient } from '../utils/redis-client.js';

const REDIS_KEY = 'exchange_rate:USD_UAH';
const REDIS_TTL_SECONDS = 3600; // 1 hour
const DEFAULT_RATE = 41.5;
const MONOBANK_API_URL = 'https://api.monobank.ua/bank/currency';

// Monobank currency codes
const USD_CODE = 840;
const UAH_CODE = 980;

export interface ExchangeRateInfo {
  rate: number;
  source: 'monobank' | 'cache' | 'default';
  updatedAt: string;
}

export class CurrencyService {
  private lastKnownRate: number = DEFAULT_RATE;
  private lastFetchedAt: string = new Date().toISOString();

  /**
   * Get current USD->UAH rate.
   * Priority: Redis cache -> Monobank API -> last-known -> default.
   */
  async getUsdToUahRate(): Promise<ExchangeRateInfo> {
    // 1. Try Redis cache
    try {
      const redis = await getRedisClient();
      if (redis) {
        const cached = await redis.get(REDIS_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          this.lastKnownRate = parsed.rate;
          this.lastFetchedAt = parsed.updatedAt;
          return {
            rate: parsed.rate,
            source: 'cache',
            updatedAt: parsed.updatedAt,
          };
        }
      }
    } catch (err) {
      logger.warn('[CurrencyService] Redis read failed', { error: (err as Error).message });
    }

    // 2. Fetch from Monobank API
    try {
      const rate = await this.fetchFromMonobank();
      const now = new Date().toISOString();

      this.lastKnownRate = rate;
      this.lastFetchedAt = now;

      // Cache in Redis
      try {
        const redis = await getRedisClient();
        if (redis) {
          await redis.set(
            REDIS_KEY,
            JSON.stringify({ rate, updatedAt: now }),
            { EX: REDIS_TTL_SECONDS }
          );
        }
      } catch (err) {
        logger.warn('[CurrencyService] Redis write failed', { error: (err as Error).message });
      }

      return {
        rate,
        source: 'monobank',
        updatedAt: now,
      };
    } catch (err) {
      logger.warn('[CurrencyService] Monobank API failed, using fallback', {
        error: (err as Error).message,
        fallbackRate: this.lastKnownRate,
      });
    }

    // 3. Fall back to last-known or default
    return {
      rate: this.lastKnownRate,
      source: 'default',
      updatedAt: this.lastFetchedAt,
    };
  }

  /**
   * Convert USD amount to UAH.
   */
  async convertUsdToUah(amountUsd: number): Promise<{ amountUah: number; rate: number }> {
    const { rate } = await this.getUsdToUahRate();
    return {
      amountUah: Math.round(amountUsd * rate * 100) / 100,
      rate,
    };
  }

  /**
   * Fetch USD->UAH rate from Monobank public API.
   * Looks for currencyCodeA: 840 (USD), currencyCodeB: 980 (UAH).
   * Uses rateSell if available, otherwise rateCross.
   */
  private async fetchFromMonobank(): Promise<number> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(MONOBANK_API_URL, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Monobank API returned ${response.status}`);
      }

      const data = await response.json() as Array<{
        currencyCodeA: number;
        currencyCodeB: number;
        rateSell?: number;
        rateBuy?: number;
        rateCross?: number;
        date: number;
      }>;

      const usdUah = data.find(
        (item) => item.currencyCodeA === USD_CODE && item.currencyCodeB === UAH_CODE
      );

      if (!usdUah) {
        throw new Error('USD/UAH pair not found in Monobank response');
      }

      const rate = usdUah.rateSell || usdUah.rateCross;
      if (!rate || rate <= 0) {
        throw new Error('Invalid rate value from Monobank');
      }

      logger.info('[CurrencyService] Fetched USD/UAH rate from Monobank', { rate });
      return rate;
    } finally {
      clearTimeout(timeout);
    }
  }
}

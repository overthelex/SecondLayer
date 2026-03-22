/**
 * Admin Limits Routes — real-time view of all system limits and current usage.
 */

import express from 'express';
import type { IDatabase } from '../../domain/ports/index.js';
import { logger } from '../../utils/logger.js';

export function createAdminLimitsRoutes(db: IDatabase): express.Router {
  const router = express.Router();

  router.get('/limits', async (_req, res) => {
    try {
      // Fetch current usage data in parallel
      const [
        activeUploads,
        todayTokens,
        pendingPayments,
        activeUsers24h,
      ] = await Promise.all([
        db.query(`SELECT COUNT(*) as count FROM upload_sessions WHERE status = 'active'`).catch(() => ({ rows: [{ count: 0 }] })),
        db.query(`
          SELECT
            COALESCE(SUM(prompt_tokens + completion_tokens), 0) as total_tokens,
            COALESCE(SUM(CASE WHEN provider = 'bedrock' THEN prompt_tokens + completion_tokens ELSE 0 END), 0) as bedrock_tokens,
            COALESCE(SUM(CASE WHEN provider = 'openai' THEN prompt_tokens + completion_tokens ELSE 0 END), 0) as openai_tokens,
            COUNT(*) as total_requests
          FROM cost_tracking
          WHERE created_at >= NOW() - INTERVAL '24 hours'
        `).catch(() => ({ rows: [{ total_tokens: 0, bedrock_tokens: 0, openai_tokens: 0, total_requests: 0 }] })),
        db.query(`SELECT COUNT(*) as count, COALESCE(SUM(amount_uah), 0) as total_uah FROM consultation_payments WHERE status = 'held'`).catch(() => ({ rows: [{ count: 0, total_uah: 0 }] })),
        db.query(`SELECT COUNT(DISTINCT user_id) as count FROM cost_tracking WHERE created_at >= NOW() - INTERVAL '24 hours'`).catch(() => ({ rows: [{ count: 0 }] })),
      ]);

      const usage = {
        activeUploadSessions: parseInt(activeUploads.rows[0]?.count || '0'),
        todayTotalTokens: parseInt(todayTokens.rows[0]?.total_tokens || '0'),
        todayBedrockTokens: parseInt(todayTokens.rows[0]?.bedrock_tokens || '0'),
        todayOpenaiTokens: parseInt(todayTokens.rows[0]?.openai_tokens || '0'),
        todayTotalRequests: parseInt(todayTokens.rows[0]?.total_requests || '0'),
        escrowPayments: parseInt(pendingPayments.rows[0]?.count || '0'),
        escrowTotalUah: parseFloat(pendingPayments.rows[0]?.total_uah || '0'),
        activeUsers24h: parseInt(activeUsers24h.rows[0]?.count || '0'),
      };

      const limits = {
        rateLimits: [
          {
            id: 'chat',
            name: 'Чат (на користувача)',
            max: 60,
            window: '1 хвилина',
            windowMs: 60000,
            keyBy: 'userId',
            description: 'Максимум запитів до чату на одного авторизованого користувача. Прив\'язано до userId (не IP) через Cloudflare.',
            severity: 'high',
          },
          {
            id: 'global-api',
            name: 'Глобальний API',
            max: 1500,
            window: '1 хвилина',
            windowMs: 60000,
            keyBy: 'IP',
            description: 'Загальний ліміт на всі /api/ маршрути з одного IP. Підвищено до 1500 для 20+ користувачів за Cloudflare (спільний IP).',
            severity: 'medium',
          },
          {
            id: 'consultation',
            name: 'Консультації (на користувача)',
            max: 300,
            window: '1 хвилина',
            windowMs: 60000,
            keyBy: 'userId',
            description: 'Ліміт запитів до API консультацій. Високий через polling + SSE reconnects у кількох вкладках.',
            severity: 'low',
          },
          {
            id: 'auth',
            name: 'Автентифікація',
            max: 10,
            window: '15 хвилин',
            windowMs: 900000,
            keyBy: 'IP',
            description: 'Захист від brute-force атак на логін. 10 спроб на 15 хвилин з одного IP.',
            severity: 'high',
          },
          {
            id: 'password-reset',
            name: 'Скидання паролю',
            max: 3,
            window: '1 година',
            windowMs: 3600000,
            keyBy: 'IP',
            description: 'Суворий ліміт для захисту від зловживань скиданням паролю.',
            severity: 'high',
          },
          {
            id: 'webhook',
            name: 'Вебхуки (Monobank)',
            max: 10,
            window: '1 хвилина',
            windowMs: 60000,
            keyBy: 'IP',
            description: 'Ліміт вхідних вебхуків від платіжних систем.',
            severity: 'medium',
          },
          {
            id: 'upload-init',
            name: 'Ініціалізація завантаження',
            max: 500,
            window: '1 хвилина',
            windowMs: 60000,
            keyBy: 'userId',
            description: 'Максимум створень нових сесій завантаження на користувача.',
            severity: 'low',
          },
          {
            id: 'upload-chunk',
            name: 'Завантаження чанків',
            max: 1500,
            window: '1 хвилина',
            windowMs: 60000,
            keyBy: 'userId',
            description: 'Максимум завантажень чанків файлів на користувача.',
            severity: 'low',
          },
          {
            id: 'express-global',
            name: 'Express глобальний',
            max: 900,
            window: '1 хвилина',
            windowMs: 60000,
            keyBy: 'IP',
            description: 'Базовий express-rate-limit для всіх маршрутів (крім /upload).',
            severity: 'medium',
          },
        ],
        llmLimits: [
          {
            id: 'bedrock-daily-tokens',
            name: 'AWS Bedrock (денний ліміт токенів)',
            max: null,
            current: usage.todayBedrockTokens,
            unit: 'токени',
            description: 'Денний ліміт токенів встановлюється AWS для кожної моделі/регіону. Помилка "Too many tokens per day" означає вичерпання квоти. Ліміт налаштовується в AWS Console → Bedrock → Service Quotas.',
            severity: 'critical',
            status: usage.todayBedrockTokens > 500000 ? 'warning' : 'ok',
          },
          {
            id: 'openai-rpm',
            name: 'OpenAI (RPM)',
            max: null,
            current: null,
            unit: 'запити/хв',
            description: 'Rate limit OpenAI API. Залежить від тарифного плану акаунту. Клієнт автоматично робить 3 retry з exponential backoff при 429.',
            severity: 'high',
          },
          {
            id: 'anthropic-rpm',
            name: 'Anthropic API (RPM)',
            max: null,
            current: null,
            unit: 'запити/хв',
            description: 'Rate limit Anthropic API. Клієнт автоматично робить 3 retry з backoff. Має ротацію ключів (primary + secondary).',
            severity: 'high',
          },
        ],
        chatLimits: [
          {
            id: 'chat-quick',
            name: 'Чат: Quick бюджет',
            maxTokens: 4096,
            maxToolCalls: 5,
            maxContextChars: 48000,
            maxResultChars: 6000,
            description: 'Швидкі відповіді. Мінімальне використання інструментів, короткий контекст.',
          },
          {
            id: 'chat-standard',
            name: 'Чат: Standard бюджет',
            maxTokens: 8192,
            maxToolCalls: 7,
            maxContextChars: 64000,
            maxResultChars: 8000,
            description: 'Стандартний режим. Збалансоване використання інструментів та контексту.',
          },
          {
            id: 'chat-deep',
            name: 'Чат: Deep бюджет',
            maxTokens: 16384,
            maxToolCalls: 20,
            maxContextChars: 100000,
            maxResultChars: 40000,
            description: 'Глибокий аналіз. Максимальне використання інструментів, великий контекст. Найдорожчий режим.',
          },
        ],
        uploadLimits: [
          {
            id: 'max-file-size',
            name: 'Максимальний розмір файлу',
            max: 2147483648,
            maxFormatted: '2 GB',
            current: null,
            description: 'Максимальний розмір одного файлу для завантаження.',
          },
          {
            id: 'chunk-size',
            name: 'Розмір чанку',
            max: 5242880,
            maxFormatted: '5 MB',
            description: 'Файли розбиваються на чанки по 5 MB для надійного завантаження.',
          },
          {
            id: 'max-user-sessions',
            name: 'Сесії завантаження (на користувача)',
            max: 50,
            current: usage.activeUploadSessions,
            description: 'Максимум одночасних сесій завантаження для одного користувача. Конфігурується через MAX_USER_SESSIONS.',
          },
          {
            id: 'upload-queue',
            name: 'Черга обробки (BullMQ)',
            max: 40,
            window: '5 секунд',
            description: 'Ліміт BullMQ: 40 jobs на 5 секунд. Адаптивна конкурентність від 5 до 100 воркерів.',
          },
          {
            id: 'session-ttl',
            name: 'TTL сесії завантаження',
            max: 24,
            unit: 'годин',
            description: 'Сесія завантаження автоматично закривається через 24 години.',
          },
        ],
        archiveLimits: [
          {
            id: 'max-archive-files',
            name: 'Файлів в архіві',
            max: 200,
            description: 'Максимум файлів в одному ZIP/архіві. Захист від zip-bomb.',
          },
          {
            id: 'max-decompressed-size',
            name: 'Розмір розпакованого архіву',
            max: 524288000,
            maxFormatted: '500 MB',
            description: 'Загальний максимальний розмір всіх файлів після розпаковки.',
          },
          {
            id: 'max-compression-ratio',
            name: 'Максимальне стиснення',
            max: 100,
            unit: ':1',
            description: 'Захист від zip-bomb: якщо ratio > 100:1, архів відхиляється.',
          },
        ],
        billingLimits: [
          {
            id: 'billing-daily',
            name: 'Денний ліміт витрат (на користувача)',
            description: 'Адміністратор може встановити daily_limit_usd для кожного користувача. За замовчуванням залежить від тарифного плану.',
            severity: 'high',
          },
          {
            id: 'billing-monthly',
            name: 'Місячний ліміт витрат (на користувача)',
            description: 'Адміністратор може встановити monthly_limit_usd. Attorney tier: $50/день, $500/місяць. Enterprise: без лімітів.',
            severity: 'high',
          },
        ],
        scrapingLimits: [
          {
            id: 'scrape-concurrent',
            name: 'Одночасні скрейпінги',
            max: 10,
            description: 'Максимум паралельних задач скрейпінгу. Конфігурується через SCRAPE_MAX_CONCURRENT.',
          },
          {
            id: 'scrape-queue',
            name: 'Черга скрейпінгу',
            max: 200,
            description: 'Максимальна глибина черги задач скрейпінгу.',
          },
          {
            id: 'scrape-interval',
            name: 'Інтервал між запитами',
            min: 500,
            max: 2000,
            unit: 'мс',
            description: 'Випадкова затримка між запитами скрейпера для уникнення блокувань.',
          },
        ],
        escrow: {
          paymentsInEscrow: usage.escrowPayments,
          totalEscrowUah: usage.escrowTotalUah,
          autoReleaseDays: 7,
          description: 'Платежі утримуються в escrow до завершення консультації. Автоматичний реліз через 7 днів після completed.',
        },
        currentUsage: usage,
      };

      res.json(limits);
    } catch (err) {
      logger.error('[AdminLimits] Error fetching limits', { error: (err as Error).message });
      res.status(500).json({ error: 'Failed to fetch limits data' });
    }
  });

  return router;
}

/**
 * News Routes
 *
 * GET /api/news/article?url=...&title=... — Fetch article content + AI analysis
 */

import { Router, Response } from 'express';
import { NewsArticleService } from '../services/news-article-service.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { logger } from '../utils/logger.js';

const newsRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 10,
  keyPrefix: 'news_article',
});

export function createNewsRoutes(newsArticleService: NewsArticleService): Router {
  const router = Router();

  router.get('/article', newsRateLimit as any, async (req: any, res: Response) => {
    try {
      const url = req.query.url as string;
      const title = req.query.title as string;

      if (!url) {
        return res.status(400).json({ error: 'url query parameter required' });
      }
      if (!title) {
        return res.status(400).json({ error: 'title query parameter required' });
      }

      // Validate URL is from kmu.gov.ua
      try {
        const parsed = new URL(url);
        if (!parsed.hostname.endsWith('kmu.gov.ua')) {
          return res.status(400).json({ error: 'Only kmu.gov.ua URLs are supported' });
        }
      } catch {
        return res.status(400).json({ error: 'Invalid URL' });
      }

      const result = await newsArticleService.getArticle(url, title);
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[News] article fetch error', { error: msg });
      res.status(500).json({ error: 'Не вдалося завантажити статтю' });
    }
  });

  return router;
}

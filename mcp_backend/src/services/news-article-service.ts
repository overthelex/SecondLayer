/**
 * News Article Service
 *
 * Fetches KMU government news articles via headless browser,
 * extracts clean text with cheerio, generates AI analysis via Bedrock,
 * and caches everything in PostgreSQL.
 */

import * as cheerio from 'cheerio';
import { Database } from '../database/database.js';
import { getLLMManager } from '../utils/llm-client-manager.js';
import { logger } from '../utils/logger.js';

export interface NewsArticleResult {
  title: string;
  content: string;
  analysis: string;
  scraped_at: string | null;
  analyzed_at: string | null;
}

export class NewsArticleService {
  constructor(private db: Database) {}

  /**
   * Get article with analysis — from DB cache or scrape + analyze on the fly.
   * For cache misses, returns content immediately and generates analysis in the background
   * to avoid Cloudflare/ALB timeouts (~100s) during Playwright scrape + LLM analysis.
   */
  async getArticle(url: string, title: string): Promise<NewsArticleResult> {
    // 1. Check DB cache
    const cached = await this.db.query(
      'SELECT title, content, analysis, scraped_at, analyzed_at FROM news_articles WHERE url = $1',
      [url]
    );

    if (cached.rows.length > 0) {
      const row = cached.rows[0];
      // If we have content and analysis, return immediately
      if (row.content && row.analysis) {
        logger.info('[NewsArticle] Cache hit', { url });
        return {
          title: row.title,
          content: row.content,
          analysis: row.analysis,
          scraped_at: row.scraped_at,
          analyzed_at: row.analyzed_at,
        };
      }
      // If we have content but no analysis, kick off analysis in background and return content now
      if (row.content && !row.analysis) {
        logger.info('[NewsArticle] Cache hit (content only), generating analysis in background', { url });
        this.generateAndSaveAnalysis(url, row.title, row.content).catch(err =>
          logger.error('[NewsArticle] Background analysis failed', { url, error: err instanceof Error ? err.message : String(err) })
        );
        return {
          title: row.title,
          content: row.content,
          analysis: '',
          scraped_at: row.scraped_at,
          analyzed_at: null,
        };
      }
    }

    // 2. Scrape
    logger.info('[NewsArticle] Cache miss, scraping', { url });
    const content = await this.scrapeArticle(url);

    // 3. Save content immediately (without analysis)
    await this.db.query(
      `INSERT INTO news_articles (url, title, content, scraped_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (url) DO UPDATE SET
         title = EXCLUDED.title,
         content = EXCLUDED.content,
         scraped_at = NOW()`,
      [url, title, content]
    );

    // 4. Generate analysis in background — don't block the response
    this.generateAndSaveAnalysis(url, title, content).catch(err =>
      logger.error('[NewsArticle] Background analysis failed', { url, error: err instanceof Error ? err.message : String(err) })
    );

    return {
      title,
      content,
      analysis: '',
      scraped_at: new Date().toISOString(),
      analyzed_at: null,
    };
  }

  private async generateAndSaveAnalysis(url: string, title: string, content: string): Promise<void> {
    const analysis = await this.generateAnalysis(title, content);
    await this.db.query(
      'UPDATE news_articles SET analysis = $1, analyzed_at = NOW() WHERE url = $2',
      [analysis, url]
    );
    logger.info('[NewsArticle] Background analysis complete', { url });
  }

  /**
   * Scrape article body from KMU URL via headless browser + cheerio extraction.
   */
  private async scrapeArticle(url: string): Promise<string> {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        ignoreHTTPSErrors: true,
      });
      const page = await context.newPage();

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const html = await page.content();
      await context.close();

      return this.extractArticleText(html);
    } finally {
      await browser.close();
    }
  }

  /**
   * Extract clean article text from KMU page HTML.
   * Strips navigation, images, ads, scripts, styles.
   */
  private extractArticleText(html: string): string {
    const $ = cheerio.load(html);

    // Remove unwanted elements
    $('script, style, nav, header, footer, iframe, img, video, audio, svg, figure, .breadcrumb, .social-share, .sidebar, .related-news, .tags, .share-buttons, .advertisement, noscript').remove();

    // KMU articles are typically in .article-content or .content-detail or main article area
    let articleEl = $('.article-content, .content-detail, .article-body, article .text, .news-detail__text, .statical-page__body').first();

    // Fallback: try article tag or main content area
    if (!articleEl.length) {
      articleEl = $('article, main, .main-content, .page-content').first();
    }

    // Last fallback: body
    if (!articleEl.length) {
      articleEl = $('body');
    }

    // Get text, preserving paragraph structure
    const blocks: string[] = [];
    articleEl.find('p, h1, h2, h3, h4, h5, h6, li, blockquote, td').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 0) {
        const tag = (el as any).tagName?.toLowerCase() || '';
        if (tag.startsWith('h')) {
          blocks.push(`\n## ${text}\n`);
        } else if (tag === 'li') {
          blocks.push(`- ${text}`);
        } else if (tag === 'blockquote') {
          blocks.push(`> ${text}`);
        } else {
          blocks.push(text);
        }
      }
    });

    // If paragraph extraction yielded very little, fall back to full text
    if (blocks.join('\n').length < 100) {
      return articleEl.text().replace(/\s+/g, ' ').trim();
    }

    return blocks.join('\n\n');
  }

  /**
   * Generate AI analytical commentary for a news article.
   */
  private async generateAnalysis(title: string, content: string): Promise<string> {
    const llm = getLLMManager();

    // Truncate content to avoid token overflow (keep first ~6000 chars)
    const truncatedContent = content.length > 6000 ? content.substring(0, 6000) + '\n\n[текст скорочено]' : content;

    const response = await llm.chatCompletion(
      {
        messages: [
          {
            role: 'system',
            content: `Ти — досвідчений український аналітик з фокусом на економіку, антикорупційну політику та геополітику. Тобі надано новину з офіційного сайту Кабінету Міністрів України.

Напиши аналітичний коментар українською мовою (3-5 абзаців), який:
1. Пояснює суть рішення/новини простою мовою
2. Аналізує реальний вплив на економіку та бізнес-середовище України
3. Оцінює потенційні корупційні ризики або антикорупційний ефект (якщо релевантно)
4. Розглядає геополітичний контекст (ЄС-інтеграція, війна, міжнародні відносини)
5. Дає коротку оцінку: кому це вигідно, а кому може зашкодити

Пиши чітко, фактологічно, без пропаганди. Якщо інформації недостатньо для глибокого аналізу — зазнач це.`,
          },
          {
            role: 'user',
            content: `Заголовок: ${title}\n\nТекст новини:\n${truncatedContent}`,
          },
        ],
        max_tokens: 2000,
        temperature: 0.7,
      },
      'standard',
      'bedrock'
    );

    return response.content;
  }
}

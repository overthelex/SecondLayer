/**
 * ReyestrDownloadService
 *
 * Downloads court decisions from reyestr.court.gov.ua using Playwright,
 * extracts text + metadata, saves to PG documents table, runs section
 * extraction and embedding pipeline.
 *
 * Manages a single lazy-initialized Playwright browser with semaphore
 * (max 3 concurrent tabs). Auto-shuts down after 5 min idle.
 */

import { chromium, type Browser, type BrowserContext } from 'playwright';
import { load } from 'cheerio';
import { Database } from '../database/database.js';
import { DocumentService, type Document } from './document-service.js';
import { SemanticSectionizer } from './semantic-sectionizer.js';
import { EmbeddingService } from './embedding-service.js';
import { SectionType } from '../types/index.js';
import { CourtDecisionHTMLParser } from '../utils/html-parser.js';
import { getRandomUserAgent } from '../utils/scrape-anti-detection.js';
import { logger } from '../utils/logger.js';

const BASE_URL = 'https://reyestr.court.gov.ua/';
const MAX_CONCURRENT_TABS = 3;
const IDLE_SHUTDOWN_MS = 5 * 60 * 1000; // 5 min

export interface DownloadedDecision {
  id: string;
  docId: string;
  title: string;
  caseNumber: string | null;
  court: string | null;
  date: string | null;
  disputeCategory: string | null;
  fullText: string;
  sections: Array<{ type: string; text: string }>;
}

export class ReyestrDownloadService {
  private db: Database;
  private documentService: DocumentService;
  private sectionizer: SemanticSectionizer;
  private embeddingService: EmbeddingService;

  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private activeTabs = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    db: Database,
    documentService: DocumentService,
    sectionizer: SemanticSectionizer,
    embeddingService: EmbeddingService,
  ) {
    this.db = db;
    this.documentService = documentService;
    this.sectionizer = sectionizer;
    this.embeddingService = embeddingService;
  }

  /**
   * Check which doc_ids are already in the documents table.
   */
  async checkAvailable(docIds: string[]): Promise<Record<string, boolean>> {
    const result: Record<string, boolean> = {};
    if (docIds.length === 0) return result;

    const zakonIds = docIds.map(id => `court_${id}`);
    const placeholders = zakonIds.map((_, i) => `$${i + 1}`).join(',');
    const rows = await this.db.query(
      `SELECT zakononline_id FROM documents WHERE zakononline_id IN (${placeholders})`,
      zakonIds
    );

    const found = new Set(rows.rows.map((r: any) => r.zakononline_id));
    for (const docId of docIds) {
      result[docId] = found.has(`court_${docId}`);
    }
    return result;
  }

  /**
   * Fetch a single decision. Returns cached if already in DB, otherwise downloads.
   */
  async fetchFullText(docId: string): Promise<DownloadedDecision> {
    // Check PG cache first
    const cached = await this.getCachedDecision(docId);
    if (cached) return cached;

    // Download from reyestr
    await this.acquireTab();
    try {
      const html = await this.downloadHTML(docId);
      if (!html) {
        throw new Error(`Failed to download decision ${docId} from reyestr`);
      }
      return await this.processAndSave(docId, html);
    } finally {
      this.releaseTab();
    }
  }

  /**
   * Fetch multiple decisions (max 10).
   */
  async fetchBatch(docIds: string[]): Promise<Record<string, { status: string; document?: DownloadedDecision; error?: string }>> {
    const results: Record<string, { status: string; document?: DownloadedDecision; error?: string }> = {};

    // Process sequentially to avoid overwhelming the registry
    for (const docId of docIds.slice(0, 10)) {
      try {
        const doc = await this.fetchFullText(docId);
        results[docId] = { status: 'ok', document: doc };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[ReyestrDownload] Failed for ${docId}: ${msg}`);
        results[docId] = { status: 'error', error: msg };
      }
    }
    return results;
  }

  async shutdown(): Promise<void> {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.context = null;
      logger.info('[ReyestrDownload] Browser shut down');
    }
  }

  // ─── Private ────────────────────────────────────────────────────

  private async getCachedDecision(docId: string): Promise<DownloadedDecision | null> {
    const rows = await this.db.query(
      `SELECT d.id, d.title, d.case_number, d.court, d.date, d.dispute_category, d.full_text
       FROM documents d WHERE d.zakononline_id = $1`,
      [`court_${docId}`]
    );
    if (rows.rows.length === 0) return null;

    const row = rows.rows[0];

    // Also fetch sections
    const sectRows = await this.db.query(
      `SELECT section_type, text FROM document_sections WHERE document_id = $1 ORDER BY created_at`,
      [row.id]
    );

    return {
      id: row.id,
      docId,
      title: row.title || `Рішення ${docId}`,
      caseNumber: row.case_number,
      court: row.court,
      date: row.date ? new Date(row.date).toISOString().split('T')[0] : null,
      disputeCategory: row.dispute_category,
      fullText: row.full_text || '',
      sections: sectRows.rows.map((s: any) => ({ type: s.section_type, text: s.text })),
    };
  }

  private async ensureBrowser(): Promise<BrowserContext> {
    if (this.context) return this.context;

    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    const proxy = process.env.SCRAPE_PROXY || process.env.HTTP_PROXY;

    this.browser = await chromium.launch({
      headless: true,
      ...(executablePath && { executablePath }),
      ...(proxy && { proxy: { server: proxy } }),
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: 'uk-UA',
      userAgent: getRandomUserAgent(),
    });

    logger.info('[ReyestrDownload] Browser launched');
    return this.context;
  }

  private async acquireTab(): Promise<void> {
    // Simple semaphore: wait until a slot is available
    while (this.activeTabs >= MAX_CONCURRENT_TABS) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    this.activeTabs++;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private releaseTab(): void {
    this.activeTabs--;
    if (this.activeTabs === 0) {
      this.idleTimer = setTimeout(() => this.shutdown(), IDLE_SHUTDOWN_MS);
    }
  }

  private async downloadHTML(docId: string): Promise<string | null> {
    const ctx = await this.ensureBrowser();
    const tab = await ctx.newPage();

    try {
      const url = `${BASE_URL}Review/${docId}`;
      await tab.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 1500));

      const rawHtml = await tab.content();
      if (
        /Сервер перевантажений запитами/i.test(rawHtml) ||
        !rawHtml.includes('txtdepository')
      ) {
        logger.warn(`[ReyestrDownload] Server overload/blocked for ${docId}`);
        return null;
      }

      // Click "Версія для друку" to render full decision
      const btnPrint = tab.locator('#btnPrint');
      if (await btnPrint.count() > 0) {
        await btnPrint.click();
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      let html = await tab.content();
      // Fix encoding: reyestr puts <meta charset> inside <body>, move it to <head>
      html = html.replace(/<head><\/head>/, '<head><meta charset="utf-8"></head>');
      return html;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`[ReyestrDownload] Download error for ${docId}: ${msg}`);
      return null;
    } finally {
      await tab.close();
    }
  }

  private extractMetadataFromHTML(html: string, docId: string): {
    title: string;
    caseNumber: string | null;
    court: string | null;
    date: string | null;
    disputeCategory: string | null;
    fullText: string;
  } {
    const $ = load(html);

    const innerHtml = $('#txtdepository').text() || '';
    let fullText = '';

    if (innerHtml.length > 0) {
      const inner$ = load(innerHtml);
      fullText = inner$('body').text().replace(/\s+/g, ' ').trim();
    }

    if (!fullText || fullText.length < 100) {
      if (!html.includes('txtdepository')) {
        fullText = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/\s+/g, ' ')
          .trim();
      } else {
        try {
          const parser = new CourtDecisionHTMLParser(html);
          fullText = parser.toText('plain');
        } catch {
          fullText = $('body').text().replace(/\s+/g, ' ').trim();
        }
      }
    }

    const casecatText = $('#divcasecat').text() || '';
    const infoText = $('#info').text() || '';
    const metaText = casecatText + ' ' + infoText;

    let caseNumber: string | null = null;
    const caseMatch = metaText.match(/(?:справи?|Справа)\s*№\s*([\d\w\-\/]+)/i)
      || fullText.match(/Справа\s*№\s*([\d\w\-\/]+)/i);
    if (caseMatch) caseNumber = caseMatch[1];

    let court: string | null = null;
    const courtMatch = fullText.match(
      /([А-ЯІЇЄҐа-яіїєґ''\s]+(?:районний|апеляційний|касаційний|господарський|окружний|міський)\s+суд[а-яіїєґ''\s]*)/i
    );
    if (courtMatch) court = courtMatch[1].trim().replace(/\s+/g, ' ').substring(0, 200);

    let date: string | null = null;
    const dateForceMatch = metaText.match(/набрання законної сили:\s*(\d{2}\.\d{2}\.\d{4})/);
    const dateFallback = fullText.match(/(\d{2}\.\d{2}\.\d{4})/);
    const dateStr = dateForceMatch ? dateForceMatch[1] : dateFallback ? dateFallback[1] : null;
    if (dateStr) {
      const [dd, mm, yyyy] = dateStr.split('.');
      date = `${yyyy}-${mm}-${dd}`;
    }

    let disputeCategory: string | null = null;
    const categoryMatch = casecatText.match(/:\s*(.+)/);
    if (categoryMatch) disputeCategory = categoryMatch[1].trim().substring(0, 255);

    const title = caseNumber
      ? `Рішення у справі ${caseNumber}`
      : `Рішення ${docId}`;

    return { title, caseNumber, court, date, disputeCategory, fullText };
  }

  private async processAndSave(docId: string, html: string): Promise<DownloadedDecision> {
    const meta = this.extractMetadataFromHTML(html, docId);

    if (!meta.fullText || meta.fullText.length < 100) {
      throw new Error(`Text too short for decision ${docId} (${meta.fullText?.length ?? 0} chars)`);
    }

    // Save to documents table
    const doc: Document = {
      zakononline_id: `court_${docId}`,
      type: 'court_decision',
      title: meta.title,
      date: meta.date || undefined,
      case_number: meta.caseNumber || undefined,
      court: meta.court || undefined,
      dispute_category: meta.disputeCategory || undefined,
      full_text: meta.fullText,
      full_text_html: html,
      metadata: {
        source: 'reyestr.court.gov.ua',
        registry_id: docId,
        scraped_at: new Date().toISOString(),
      },
    };

    const documentUuid = await this.documentService.saveDocument(doc);
    logger.info(`[ReyestrDownload] Saved ${docId} to DB (uuid=${documentUuid.substring(0, 8)})`);

    // Extract sections
    const sections = await this.sectionizer.extractSections(meta.fullText, false);
    if (sections.length > 0) {
      await this.documentService.saveSections(documentUuid, sections);
    }

    // Generate embeddings for key sections
    if (sections.length > 0) {
      const indexable = sections.filter(
        (s) => s.type === SectionType.DECISION || s.type === SectionType.COURT_REASONING
      );

      if (indexable.length > 0) {
        try {
          await this.embeddingService.initialize();

          for (const section of indexable) {
            const chunks = this.embeddingService.splitIntoChunks(section.text);
            if (chunks.length === 0) continue;

            const embeddings = await this.embeddingService.generateEmbeddingsBatch(chunks);
            const nowIso = new Date().toISOString();

            await Promise.all(chunks.map((chunk, i) =>
              this.embeddingService.storeChunk({
                id: '',
                source: 'zakononline',
                doc_id: documentUuid,
                section_type: section.type,
                text: chunk,
                embedding: embeddings[i],
                metadata: {
                  date: meta.date || '',
                  court: meta.court || undefined,
                  case_number: meta.caseNumber || undefined,
                  dispute_category: meta.disputeCategory || undefined,
                },
                created_at: nowIso,
              })
            ));
          }
          logger.info(`[ReyestrDownload] Embeddings stored for ${docId}`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.warn(`[ReyestrDownload] Embedding failed for ${docId}: ${msg}`);
        }
      }
    }

    return {
      id: documentUuid,
      docId,
      title: meta.title,
      caseNumber: meta.caseNumber,
      court: meta.court,
      date: meta.date,
      disputeCategory: meta.disputeCategory,
      fullText: meta.fullText,
      sections: sections.map(s => ({ type: s.type, text: s.text })),
    };
  }
}

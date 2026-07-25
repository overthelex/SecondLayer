/**
 * Bulk Scrape Processor: S3 → PG + Sections
 *
 * Lists HTML files from S3 raw/ prefix, parses metadata, UPSERTs to PG,
 * and extracts document sections. Runs on prod EC2 after workers finish.
 *
 * Env vars:
 *   S3_BUCKET            - S3 bucket name (required)
 *   AWS_REGION           - AWS region (default: eu-central-1)
 *   CONCURRENCY          - Parallel processing (default: 10)
 *   MAX_DOCS             - Max docs to process, 0 = unlimited (default: 0)
 *   SKIP_SECTIONS        - Skip section extraction (default: false)
 *   SKIP_EXISTING        - Skip docs that already have full_text (default: true)
 *   DRY_RUN              - Parse but don't write to DB (default: false)
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { Database } from '../database/database.js';
import { DocumentService, type Document } from '../services/document-service.js';
import { SemanticSectionizer } from '../services/semantic-sectionizer.js';
import { logger } from '../utils/logger.js';
import { load } from 'cheerio';
import { CourtDecisionHTMLParser } from '../utils/html-parser.js';

const S3_BUCKET = process.env.S3_BUCKET;
const REGION = process.env.AWS_REGION || 'eu-central-1';
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '10', 10);
const MAX_DOCS = parseInt(process.env.MAX_DOCS || '0', 10) || Infinity;
const SKIP_SECTIONS = process.env.SKIP_SECTIONS === 'true';
const SKIP_EXISTING = process.env.SKIP_EXISTING !== 'false';
const DRY_RUN = process.env.DRY_RUN === 'true';

const stats = {
  listed: 0,
  processed: 0,
  success: 0,
  skipped: 0,
  errors: 0,
  sectioned: 0,
  startTime: Date.now(),
};

// --- HTML metadata extraction (same as scrape-court-registry.ts) ---
function extractMetadataFromHTML(html: string, docId: string): {
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
      const print$ = load(html);
      print$('script, style').remove();
      fullText = (print$('body').text() || print$.root().text()).replace(/\s+/g, ' ').trim();
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

  const title = caseNumber ? `Рішення у справі ${caseNumber}` : `Рішення ${docId}`;

  return { title, caseNumber, court, date, disputeCategory, fullText };
}

// --- Process a single S3 object ---
async function processObject(
  s3: S3Client,
  key: string,
  db: Database,
  documentService: DocumentService,
  sectionizer: SemanticSectionizer,
): Promise<boolean> {
  // Extract registry ID from key: "raw/12345678.html" → "12345678"
  const match = key.match(/raw\/(\d+)\.html$/);
  if (!match) {
    stats.skipped++;
    return false;
  }
  const registryId = match[1];
  const zakononlineId = `court_${registryId}`;

  // Check if already processed
  if (SKIP_EXISTING) {
    const existing = await db.query(
      `SELECT id FROM documents WHERE zakononline_id = $1 AND full_text IS NOT NULL AND length(full_text) > 100`,
      [zakononlineId]
    );
    if (existing.rows.length > 0) {
      stats.skipped++;
      return false;
    }
  }

  // Download from S3
  let html: string;
  try {
    const resp = await s3.send(new GetObjectCommand({
      Bucket: S3_BUCKET!,
      Key: key,
    }));
    html = await resp.Body!.transformToString('utf-8');
  } catch (err: any) {
    logger.error(`S3 get error for ${key}: ${err.message}`);
    stats.errors++;
    return false;
  }

  // Parse metadata
  const meta = extractMetadataFromHTML(html, registryId);
  if (!meta.fullText || meta.fullText.length < 100) {
    stats.skipped++;
    return false;
  }

  if (DRY_RUN) {
    stats.success++;
    return true;
  }

  // UPSERT to documents table
  try {
    const doc: Document = {
      zakononline_id: zakononlineId,
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
        registry_id: registryId,
        bulk_processed_at: new Date().toISOString(),
      },
    };

    const documentUuid = await documentService.saveDocument(doc);

    // Extract sections
    if (!SKIP_SECTIONS) {
      try {
        const sections = await sectionizer.extractSections(meta.fullText, false);
        if (sections.length > 0) {
          await documentService.saveSections(documentUuid, sections);
          stats.sectioned++;
        }
      } catch (err: any) {
        logger.warn(`Sections failed for ${registryId}: ${err.message}`);
      }
    }

    stats.success++;
    return true;
  } catch (err: any) {
    logger.error(`DB error for ${registryId}: ${err.message}`);
    stats.errors++;
    return false;
  }
}

async function main(): Promise<void> {
  if (!S3_BUCKET) {
    logger.error('S3_BUCKET is required');
    process.exit(1);
  }

  logger.info('=== Bulk Scrape Processor: S3 → PG ===');
  logger.info(`  Bucket:        ${S3_BUCKET}`);
  logger.info(`  Region:        ${REGION}`);
  logger.info(`  Concurrency:   ${CONCURRENCY}`);
  logger.info(`  Max docs:      ${MAX_DOCS === Infinity ? 'unlimited' : MAX_DOCS}`);
  logger.info(`  Skip sections: ${SKIP_SECTIONS}`);
  logger.info(`  Skip existing: ${SKIP_EXISTING}`);
  logger.info(`  Dry run:       ${DRY_RUN}`);

  const s3 = new S3Client({ region: REGION });
  const db = new Database();
  const documentService = new DocumentService(db);
  const sectionizer = new SemanticSectionizer();

  // Record job
  const jobId = `process-${Date.now()}`;
  await db.query(
    `INSERT INTO bulk_scrape_jobs (job_id, phase, status, started_at)
     VALUES ($1, 'process', 'running', NOW())`,
    [jobId]
  );

  try {
    // List all objects in raw/ prefix
    let continuationToken: string | undefined;
    const active: Promise<void>[] = [];

    do {
      if (stats.processed >= MAX_DOCS) break;

      const listResp = await s3.send(new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: 'raw/',
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      }));

      const objects = listResp.Contents || [];
      stats.listed += objects.length;
      continuationToken = listResp.NextContinuationToken;

      for (const obj of objects) {
        if (!obj.Key || stats.processed >= MAX_DOCS) break;

        const task = processObject(s3, obj.Key, db, documentService, sectionizer)
          .then(() => {
            stats.processed++;
            const idx = active.indexOf(task);
            if (idx !== -1) active.splice(idx, 1);
          })
          .catch((err: any) => {
            logger.error(`Unexpected error: ${err.message}`);
            stats.errors++;
            stats.processed++;
            const idx = active.indexOf(task);
            if (idx !== -1) active.splice(idx, 1);
          });

        active.push(task);

        if (active.length >= CONCURRENCY) {
          await Promise.race(active);
        }
      }

      // Progress logging
      const elapsed = (Date.now() - stats.startTime) / 1000;
      const rate = stats.processed / Math.max(elapsed, 1);
      logger.info(`  Listed: ${stats.listed}, Processed: ${stats.processed}, Success: ${stats.success}, Errors: ${stats.errors}, Rate: ${rate.toFixed(1)}/s`);

    } while (continuationToken);

    // Wait for remaining tasks
    await Promise.all(active);

    // Update job record
    await db.query(
      `UPDATE bulk_scrape_jobs
       SET status = 'completed',
           total_docs = $1,
           processed_docs = $2,
           failed_docs = $3,
           skipped_docs = $4,
           completed_at = NOW(),
           metadata = $5
       WHERE job_id = $6`,
      [
        stats.listed,
        stats.success,
        stats.errors,
        stats.skipped,
        JSON.stringify({ sectioned: stats.sectioned, dry_run: DRY_RUN }),
        jobId,
      ]
    );

    const elapsed = (Date.now() - stats.startTime) / 1000;
    logger.info('');
    logger.info('=== Processing Complete ===');
    logger.info(`  S3 objects listed: ${stats.listed}`);
    logger.info(`  Processed:         ${stats.processed}`);
    logger.info(`  Success:           ${stats.success}`);
    logger.info(`  Skipped:           ${stats.skipped}`);
    logger.info(`  Errors:            ${stats.errors}`);
    logger.info(`  Sections created:  ${stats.sectioned}`);
    logger.info(`  Duration:          ${elapsed.toFixed(1)}s`);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  logger.error('Fatal error:', err);
  process.exit(1);
});

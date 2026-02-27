/**
 * Discover Court Decisions via ZakonOnline API
 *
 * Searches the ZO API for all court decisions from a specific court,
 * inserting document metadata into the `documents` table for later
 * full-text download by the bulk scrape pipeline.
 *
 * Environment variables:
 *   COURT_NAME      - Substring to match in courts dictionary (default: "Оболонський")
 *   COURT_CODE      - Direct court code (skips dictionary lookup)
 *   INSTANCE_CODE   - Court instance filter (default: 3 = first instance)
 *   JUSTICE_KINDS   - Comma-separated list (default: "1,2,3,4" = all)
 *   DATE_FROM       - Start date YYYY-MM-DD (default: "2011-01-01")
 *   DATE_TO         - End date YYYY-MM-DD (default: today)
 *   YEAR_WINDOW     - Months per search window (default: 12)
 *   PAGE_LIMIT      - Results per page (default: 40, ZO max)
 *   MAX_PAGES       - Max pages per window (default: 1000)
 *   DRY_RUN         - Count only, don't insert (default: false)
 *   SAVE_BATCH      - Documents per save batch (default: 200)
 *
 * Usage:
 *   npm run discover:court
 *   DRY_RUN=true COURT_NAME=Оболонський npm run discover:court
 *   COURT_CODE=2105 DATE_FROM=2024-01-01 DATE_TO=2024-12-31 JUSTICE_KINDS=1 npm run discover:court
 */

import { Database } from '../database/database.js';
import { DocumentService } from '../services/document-service.js';
import { ZOAdapter } from '../adapters/zo-adapter.js';
import { logger } from '../utils/logger.js';

// --- Config ---

const COURT_NAME = process.env.COURT_NAME || 'Оболонський';
const COURT_CODE = process.env.COURT_CODE || '';
const INSTANCE_CODE = parseInt(process.env.INSTANCE_CODE || '3', 10);
const JUSTICE_KINDS = (process.env.JUSTICE_KINDS || '1,2,3,4')
  .split(',')
  .map(s => parseInt(s.trim(), 10))
  .filter(n => !isNaN(n));
const DATE_FROM = process.env.DATE_FROM || '2011-01-01';
const DATE_TO = process.env.DATE_TO || new Date().toISOString().split('T')[0];
const YEAR_WINDOW = parseInt(process.env.YEAR_WINDOW || '12', 10);
const PAGE_LIMIT = parseInt(process.env.PAGE_LIMIT || '40', 10);
const MAX_PAGES = parseInt(process.env.MAX_PAGES || '1000', 10);
const DRY_RUN = process.env.DRY_RUN === 'true';
const SAVE_BATCH = parseInt(process.env.SAVE_BATCH || '200', 10);

const JUSTICE_KIND_NAMES: Record<number, string> = {
  1: 'Цивільне',
  2: 'Кримінальне',
  3: 'Господарське',
  4: 'Адміністративне',
};

// --- Helpers ---

interface DateWindow {
  start: string;
  end: string;
}

function generateMonthWindows(dateFrom: string, dateTo: string, months: number): DateWindow[] {
  const windows: DateWindow[] = [];
  const start = new Date(dateFrom);
  const end = new Date(dateTo);

  let current = new Date(start);
  while (current <= end) {
    const windowEnd = new Date(current);
    windowEnd.setMonth(windowEnd.getMonth() + months);
    windowEnd.setDate(windowEnd.getDate() - 1);

    if (windowEnd > end) {
      windowEnd.setTime(end.getTime());
    }

    windows.push({
      start: current.toISOString().split('T')[0],
      end: windowEnd.toISOString().split('T')[0],
    });

    current = new Date(current);
    current.setMonth(current.getMonth() + months);
  }

  return windows;
}

async function resolveCourtCode(zoAdapter: ZOAdapter): Promise<{ code: string; name: string }> {
  if (COURT_CODE) {
    return { code: COURT_CODE, name: `(code: ${COURT_CODE})` };
  }

  console.log(`Looking up court code for "${COURT_NAME}" ...`);

  // Paginate through courts dictionary to find matching court
  let page = 1;
  const limit = 100;

  while (true) {
    const response = await zoAdapter.getCourtsDictionary({ limit, page });
    const courts = Array.isArray(response) ? response : response?.data || [];

    if (courts.length === 0) break;

    for (const court of courts) {
      const courtName = court.name || court.title || '';
      if (courtName.toLowerCase().includes(COURT_NAME.toLowerCase())) {
        const code = String(court.id || court.code || court.court_code);
        console.log(`  Found: "${courtName}" → code ${code}`);
        return { code, name: courtName };
      }
    }

    // If fewer results than limit, we've reached the end
    if (courts.length < limit) break;
    page++;
  }

  throw new Error(`Court not found matching "${COURT_NAME}" in ZO dictionary`);
}

// --- Main ---

async function main(): Promise<void> {
  const db = new Database();
  const documentService = new DocumentService(db);
  const zoAdapter = new ZOAdapter(documentService);

  const windows = generateMonthWindows(DATE_FROM, DATE_TO, YEAR_WINDOW);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Court Decision Discovery via ZakonOnline API');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Court filter:   ${COURT_CODE || COURT_NAME}`);
  console.log(`  Instance code:  ${INSTANCE_CODE}`);
  console.log(`  Justice kinds:  ${JUSTICE_KINDS.map(k => `${k} (${JUSTICE_KIND_NAMES[k] || '?'})`).join(', ')}`);
  console.log(`  Date range:     ${DATE_FROM} to ${DATE_TO}`);
  console.log(`  Windows:        ${windows.length} (${YEAR_WINDOW} months each)`);
  console.log(`  Page limit:     ${PAGE_LIMIT}`);
  console.log(`  Max pages/win:  ${MAX_PAGES}`);
  console.log(`  Save batch:     ${SAVE_BATCH}`);
  console.log(`  Dry run:        ${DRY_RUN}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    await db.connect();

    // Resolve court code
    const court = await resolveCourtCode(zoAdapter);
    console.log(`\nUsing court: ${court.name} (code: ${court.code})\n`);

    // Track job
    const jobId = `discover-${court.code}-${Date.now()}`;
    await db.query(
      `INSERT INTO bulk_scrape_jobs (job_id, phase, status, started_at, metadata)
       VALUES ($1, 'discovery', 'running', NOW(), $2)`,
      [jobId, JSON.stringify({
        court_code: court.code,
        court_name: court.name,
        instance_code: INSTANCE_CODE,
        justice_kinds: JUSTICE_KINDS,
        date_from: DATE_FROM,
        date_to: DATE_TO,
        dry_run: DRY_RUN,
      })]
    );

    const seenIds = new Set<string>();
    const stats: Record<string, { total: number; byYear: Record<string, number> }> = {};
    let totalErrors = 0;
    let pendingDocs: any[] = [];

    const flushPending = async (force = false): Promise<void> => {
      if (DRY_RUN || pendingDocs.length === 0) return;
      if (!force && pendingDocs.length < SAVE_BATCH) return;

      const toSave = pendingDocs.splice(0, SAVE_BATCH);
      try {
        await zoAdapter.saveDocumentsMetadataToDatabase(toSave, toSave.length);
        console.log(`      Saved batch of ${toSave.length} docs (total: ${seenIds.size})`);
      } catch (error: any) {
        logger.error('Batch save failed:', error?.message);
        console.error(`      SAVE FAILED: ${error?.message}`);
        totalErrors++;
      }
    };

    // Main discovery loop
    for (const justiceKind of JUSTICE_KINDS) {
      const kindName = JUSTICE_KIND_NAMES[justiceKind] || `Kind ${justiceKind}`;
      stats[kindName] = { total: 0, byYear: {} };

      console.log(`\n  Justice kind: ${justiceKind} (${kindName})`);

      for (const window of windows) {
        const yearKey = window.start.slice(0, 4);
        let windowTotal = 0;
        let page = 1;

        while (page <= MAX_PAGES) {
          try {
            const response = await zoAdapter.searchCourtDecisions({
              where: [
                { field: 'court_code', operator: '=', value: parseInt(court.code, 10) },
                { field: 'instance_code', operator: '=', value: INSTANCE_CODE },
                { field: 'adjudication_date', operator: '>=', value: window.start },
                { field: 'adjudication_date', operator: '<=', value: window.end },
                { field: 'justice_kind', operator: '=', value: justiceKind },
              ],
              page,
              limit: PAGE_LIMIT,
              orderBy: { field: 'adjudication_date', direction: 'asc' },
            });

            const items = Array.isArray(response) ? response : response?.data || [];

            if (items.length === 0) break;

            let newInPage = 0;
            for (const doc of items) {
              const docId = String(doc.doc_id || doc.id || doc.zakononline_id);
              if (!docId || docId === 'undefined') continue;

              if (!seenIds.has(docId)) {
                seenIds.add(docId);
                newInPage++;
                windowTotal++;
                pendingDocs.push(doc);
              }
            }

            // Flush saves incrementally
            await flushPending();

            // If we got fewer results than page limit, no more pages
            if (items.length < PAGE_LIMIT) break;

            page++;

            // Small delay between pages to be respectful
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (error: any) {
            totalErrors++;
            logger.error(`Error [kind=${justiceKind}] ${window.start}..${window.end} p${page}:`, error?.message);
            console.error(`      ERROR: ${error?.message}`);
            // Wait longer on error
            await new Promise(resolve => setTimeout(resolve, 2000));
            break; // Move to next window on error
          }
        }

        stats[kindName].total += windowTotal;
        stats[kindName].byYear[yearKey] = (stats[kindName].byYear[yearKey] || 0) + windowTotal;

        if (windowTotal > 0) {
          console.log(`    ${window.start}..${window.end}: ${windowTotal} new (${page - 1} pages, total: ${seenIds.size})`);
        }
      }

      // Flush remaining for this justice kind
      while (pendingDocs.length > 0) {
        await flushPending(true);
      }

      console.log(`  → ${kindName}: ${stats[kindName].total} documents`);
    }

    // Final flush
    while (pendingDocs.length > 0) {
      await flushPending(true);
    }

    // Update job record
    await db.query(
      `UPDATE bulk_scrape_jobs
       SET status = 'completed',
           total_docs = $1,
           failed_docs = $2,
           completed_at = NOW(),
           metadata = metadata || $3::jsonb
       WHERE job_id = $4`,
      [
        seenIds.size,
        totalErrors,
        JSON.stringify({ stats }),
        jobId,
      ]
    );

    // Print summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  Discovery Summary');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Court:          ${court.name} (code: ${court.code})`);
    console.log(`  Total found:    ${seenIds.size}`);
    console.log(`  Errors:         ${totalErrors}`);
    console.log(`  Dry run:        ${DRY_RUN}`);
    console.log(`  Job ID:         ${jobId}`);
    console.log('───────────────────────────────────────────────────────────────');

    for (const [kindName, kindStats] of Object.entries(stats)) {
      console.log(`\n  ${kindName}: ${kindStats.total} total`);
      const years = Object.entries(kindStats.byYear).sort(([a], [b]) => a.localeCompare(b));
      for (const [year, count] of years) {
        if (count > 0) {
          console.log(`    ${year}: ${count}`);
        }
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════════');

    if (!DRY_RUN) {
      // Verify what's in the DB
      const countResult = await db.query(
        `SELECT COUNT(*) as total FROM documents WHERE full_text IS NULL AND type = 'court_decision'`
      );
      console.log(`\n  Documents ready for bulk scrape (no full_text): ${countResult.rows[0].total}`);
      console.log('  Next step: npm run bulk-scrape:enqueue');
    }

  } finally {
    await db.close();
  }
}

main().catch((err) => {
  logger.error('Discovery failed:', err);
  console.error('Discovery failed:', err);
  process.exit(1);
});

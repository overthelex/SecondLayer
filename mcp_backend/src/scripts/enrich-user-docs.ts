/**
 * Enrich user documents:
 *  1. Merge pages of the same document (same title, same user, same upload day)
 *  2. Extract dates from text (regex)
 *  3. Extract case numbers from text
 *
 * Usage:
 *   ENRICH_USER_ID=<uuid> node dist/scripts/enrich-user-docs.js
 *   ENRICH_USER_ID=<uuid> ENRICH_DRY_RUN=true node dist/scripts/enrich-user-docs.js
 */

import * as pg from 'pg';

const USER_ID = process.env.ENRICH_USER_ID;
if (!USER_ID) { console.error('ENRICH_USER_ID required'); process.exit(1); }
const DRY_RUN = process.env.ENRICH_DRY_RUN === 'true';

// ── Date extraction ─────────────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  'січня': '01', 'лютого': '02', 'березня': '03', 'квітня': '04',
  'травня': '05', 'червня': '06', 'липня': '07', 'серпня': '08',
  'вересня': '09', 'жовтня': '10', 'листопада': '11', 'грудня': '12',
};

function extractDates(text: string): string[] {
  const dates: string[] = [];

  // dd.mm.yyyy
  const dotPattern = /(\d{2})\.(\d{2})\.(\d{4})/g;
  let m;
  while ((m = dotPattern.exec(text)) !== null) {
    const [, dd, mm, yyyy] = m;
    const year = parseInt(yyyy);
    if (year >= 1990 && year <= 2026 && parseInt(mm) >= 1 && parseInt(mm) <= 12 && parseInt(dd) >= 1 && parseInt(dd) <= 31) {
      dates.push(`${yyyy}-${mm}-${dd}`);
    }
  }

  // "dd місяця yyyy року" or "dd місяця yyyy"
  const ukPattern = /(\d{1,2})\s+(січня|лютого|березня|квітня|травня|червня|липня|серпня|вересня|жовтня|листопада|грудня)\s+(\d{4})/gi;
  while ((m = ukPattern.exec(text)) !== null) {
    const dd = m[1].padStart(2, '0');
    const mm = MONTH_MAP[m[2].toLowerCase()];
    const yyyy = m[3];
    const year = parseInt(yyyy);
    if (mm && year >= 1990 && year <= 2026) {
      dates.push(`${yyyy}-${mm}-${dd}`);
    }
  }

  return [...new Set(dates)].sort();
}

function pickBestDate(dates: string[], text: string): string | null {
  // Filter out dates before 2003 — usually references to old laws, not document dates
  const plausible = dates.filter(d => d >= '2003-01-01' && d <= '2026-12-31');
  if (plausible.length === 0) return null;
  if (plausible.length === 1) return plausible[0];

  // Prefer date that appears near document header (first 500 chars)
  const headerText = text.slice(0, 500);
  const headerDates = extractDates(headerText).filter(d => d >= '2003-01-01' && d <= '2026-12-31');
  if (headerDates.length > 0) return headerDates[0];

  // Otherwise take earliest plausible
  return plausible[0];
}

// ── Case number extraction ──────────────────────────────────────────

function extractCaseNumbers(text: string): string[] {
  const cases: string[] = [];

  // Pattern: №\s*XXX/XXXX/XX-X  or справа XXX/XXXX/XX
  const casePattern = /(?:№\s*|справа\s+|провадження\s+(?:№\s*)?)\s*(\d{1,4}\/\d{1,5}\/\d{2,4}(?:-[а-яa-z]{1,3})?)/gi;
  let m;
  while ((m = casePattern.exec(text)) !== null) {
    cases.push(m[1]);
  }

  // Standalone case number pattern (common format)
  const standalone = /\b(\d{3,4}\/\d{3,5}\/\d{2}-[а-яa-z]{1,2})\b/gi;
  while ((m = standalone.exec(text)) !== null) {
    cases.push(m[1]);
  }

  return [...new Set(cases)];
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  // Load all active docs
  const { rows: docs } = await pool.query(
    `SELECT id, title, full_text, date, metadata, created_at, storage_type, type
     FROM documents
     WHERE user_id = $1 AND deleted_at IS NULL AND full_text IS NOT NULL AND length(full_text) > 0
     ORDER BY title, created_at`,
    [USER_ID]
  );

  console.log(`Loaded ${docs.length} documents`);

  // ── Step 1: Merge pages ───────────────────────────────────────────
  // Group by (title, upload_date) — pages uploaded together
  const groups = new Map<string, typeof docs>();
  for (const doc of docs) {
    const uploadDate = new Date(doc.created_at).toISOString().slice(0, 10);
    const key = `${doc.title}|||${uploadDate}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(doc);
  }

  const mergeGroups = [...groups.entries()].filter(([, g]) => g.length > 1);
  console.log(`\nFound ${mergeGroups.length} groups to merge (${mergeGroups.reduce((s, [, g]) => s + g.length, 0)} docs → ${mergeGroups.length} merged)`);

  let mergedCount = 0;
  let deletedPages = 0;
  const mergedDocIds: string[] = [];
  const deletedDocIds: string[] = [];

  for (const [key, group] of mergeGroups) {
    // Sort by text length desc — keep the one with most text as primary,
    // or by created_at if similar
    group.sort((a, b) => a.created_at - b.created_at);
    const primary = group[0];
    const pages = group.slice(1);

    // Merge text: concatenate with page separator
    const mergedText = group.map((d, i) => d.full_text).join('\n\n--- сторінка ---\n\n');
    const title = primary.title;

    console.log(`  Merge: "${title.slice(0, 60)}" — ${group.length} pages → 1 (${primary.id.slice(0, 8)})`);

    if (!DRY_RUN) {
      // Update primary doc with merged text
      await pool.query(
        `UPDATE documents SET full_text = $1, updated_at = NOW() WHERE id = $2`,
        [mergedText, primary.id]
      );

      // Soft-delete page docs
      for (const page of pages) {
        await pool.query(
          `UPDATE documents SET deleted_at = NOW() WHERE id = $1`,
          [page.id]
        );
        deletedDocIds.push(page.id);
      }
    }

    mergedDocIds.push(primary.id);
    primary.full_text = mergedText;
    mergedCount++;
    deletedPages += pages.length;
  }

  console.log(`Merged: ${mergedCount} groups, soft-deleted ${deletedPages} page docs`);

  // ── Step 2: Extract dates & case numbers ──────────────────────────
  // Work on remaining active docs (excluding soft-deleted pages)
  const activeDocs = docs.filter(d => !deletedDocIds.includes(d.id));
  console.log(`\nEnriching ${activeDocs.length} active documents...`);

  let datesExtracted = 0;
  let casesExtracted = 0;
  let alreadyHadDate = 0;

  for (const doc of activeDocs) {
    const text = doc.full_text;
    const metadata = doc.metadata || {};
    let changed = false;

    // Extract date if missing or if existing date is suspect (before 2003)
    const existingDate = doc.date ? new Date(doc.date).toISOString().slice(0, 10) : null;
    const needsDateFix = !existingDate || existingDate < '2003-01-01';
    if (needsDateFix) {
      const dates = extractDates(text);
      const bestDate = pickBestDate(dates, text);
      if (bestDate) {
        if (!DRY_RUN) {
          await pool.query(`UPDATE documents SET date = $1 WHERE id = $2`, [bestDate, doc.id]);
        }
        datesExtracted++;
        changed = true;
      }
    } else if (existingDate && existingDate >= '2003-01-01') {
      alreadyHadDate++;
    }

    // Extract case numbers
    const caseNumbers = extractCaseNumbers(text);
    if (caseNumbers.length > 0 && !metadata.caseNumbers) {
      const newMeta = { ...metadata, caseNumbers };
      if (!DRY_RUN) {
        await pool.query(`UPDATE documents SET metadata = $1 WHERE id = $2`, [JSON.stringify(newMeta), doc.id]);
      }
      casesExtracted++;
      changed = true;
    }
  }

  console.log(`\n── Results ──`);
  console.log(`Documents after merge: ${activeDocs.length}`);
  console.log(`Pages merged (soft-deleted): ${deletedPages}`);
  console.log(`Dates: already had ${alreadyHadDate}, extracted ${datesExtracted}, still missing ${activeDocs.length - alreadyHadDate - datesExtracted}`);
  console.log(`Case numbers extracted: ${casesExtracted}`);
  if (DRY_RUN) console.log(`\n(DRY RUN — no changes written)`);

  // Print sample of extracted dates
  if (!DRY_RUN && datesExtracted > 0) {
    const { rows: sample } = await pool.query(
      `SELECT title, date FROM documents WHERE user_id = $1 AND deleted_at IS NULL AND date IS NOT NULL ORDER BY date LIMIT 10`,
      [USER_ID]
    );
    console.log(`\nSample dates:`);
    for (const r of sample) {
      console.log(`  ${r.date} — ${r.title.slice(0, 70)}`);
    }
  }

  // Print docs that need re-indexing
  const needReindex = [...new Set([...mergedDocIds])];
  console.log(`\nDocs needing Qdrant re-index (merged): ${needReindex.length}`);

  await pool.end();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });

/**
 * Organize documents into TimeLine folder structure based on timeline phases.
 *
 * Usage:
 *   node dist/scripts/organize-timeline-folders.js
 *
 * Optional env:
 *   DRY_RUN=true   — show plan only, no writes
 *   USER_EMAIL=shepherdvovkes@gmail.com  (default)
 */

import * as pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const DRY_RUN = process.env.DRY_RUN === 'true';
const USER_EMAIL = process.env.USER_EMAIL || 'shepherdvovkes@gmail.com';

// ── Timeline phases ─────────────────────────────────────────────────
interface Phase {
  folder: string;
  startDate: string;   // inclusive YYYY-MM-DD
  endDate: string;     // inclusive YYYY-MM-DD
}

const PHASES: Phase[] = [
  {
    folder: 'TimeLine/00_Передісторія',
    startDate: '1900-01-01',
    endDate: '2001-12-31',
  },
  {
    folder: 'TimeLine/01_Кредит_іпотека',
    startDate: '2002-01-01',
    endDate: '2007-12-31',
  },
  {
    folder: 'TimeLine/02_Шахрайство',
    startDate: '2007-02-01',
    endDate: '2008-12-31',
  },
  {
    folder: 'TimeLine/03_Перші_суди',
    startDate: '2008-01-01',
    endDate: '2008-12-31',
  },
  {
    folder: 'TimeLine/04_Борг_2009-2014',
    startDate: '2009-01-01',
    endDate: '2014-12-31',
  },
  {
    folder: 'TimeLine/05_Справа_369',
    startDate: '2015-01-01',
    endDate: '2015-12-31',
  },
  {
    folder: 'TimeLine/06_Вищі_суди',
    startDate: '2016-01-01',
    endDate: '2020-12-31',
  },
  {
    folder: 'TimeLine/07_Відновлення',
    startDate: '2021-01-01',
    endDate: '2022-12-31',
  },
  {
    folder: 'TimeLine/08_Виконавче_2023',
    startDate: '2023-01-01',
    endDate: '2023-12-31',
  },
  {
    folder: 'TimeLine/09_Поточне',
    startDate: '2024-01-01',
    endDate: '2099-12-31',
  },
];

const NO_DATE_FOLDER = 'TimeLine/10_Без_дат';

// Old folder names for migration (to rename existing docs)
const OLD_TO_NEW: Record<string, string> = {
  'TimeLine/00_Передісторія_1991-2001': 'TimeLine/00_Передісторія',
  'TimeLine/01_Кредитування_та_іпотека_2002-2007': 'TimeLine/01_Кредит_іпотека',
  'TimeLine/02_Інвестиційне_шахрайство_2007-2008': 'TimeLine/02_Шахрайство',
  'TimeLine/03_Перші_суди_2008': 'TimeLine/03_Перші_суди',
  'TimeLine/04_Накопичення_боргу_2009-2014': 'TimeLine/04_Борг_2009-2014',
  'TimeLine/05_Основне_провадження_369-1855-15_2015': 'TimeLine/05_Справа_369',
  'TimeLine/06_Вищі_інстанції_2016-2020': 'TimeLine/06_Вищі_суди',
  'TimeLine/07_Відновлення_провадження_2021-2022': 'TimeLine/07_Відновлення',
  'TimeLine/08_Нове_виконавче_провадження_2023': 'TimeLine/08_Виконавче_2023',
  'TimeLine/09_Поточний_стан_2024-2026': 'TimeLine/09_Поточне',
};

// ── Keyword-based phase detection for undated documents ─────────────
interface KeywordRule {
  folder: string;
  keywords: RegExp[];
}

const KEYWORD_RULES: KeywordRule[] = [
  {
    folder: 'TimeLine/02_Шахрайство',
    keywords: [/energetix/i, /перевознюк/i, /шахрайств/i, /технопарк/i, /інвестиц/i],
  },
  {
    folder: 'TimeLine/01_Кредит_іпотека',
    keywords: [/іпотек/i, /кредитн.*договір/i, /1113828/],
  },
  {
    folder: 'TimeLine/05_Справа_369',
    keywords: [/369\/1855/i, /369\/1855\/15/i, /71687721/],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────

function extractDate(doc: any): string | null {
  // Try `date` column first
  if (doc.date) {
    const d = new Date(doc.date);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  // Try metadata.documentDate
  const meta = doc.metadata || {};
  if (meta.documentDate) {
    const d = new Date(meta.documentDate);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

/**
 * Classify document by date + title (to handle overlapping phases).
 * Overlaps:
 *   2007: phase 1 (credit) vs phase 2 (fraud) — use keywords
 *   2008: phase 2 (fraud) vs phase 3 (courts) — use keywords
 */
function classifyByDateAndTitle(dateStr: string, title: string): string {
  const year = parseInt(dateStr.slice(0, 4), 10);

  // Check fraud keywords for overlapping 2007-2008 period
  const isFraudRelated = /energetix|перевознюк|шахрайств|технопарк|інвестиц|kyc|aml/i.test(title);

  if (year >= 2007 && year <= 2008 && isFraudRelated) {
    return 'TimeLine/02_Шахрайство';
  }

  // Standard date-based classification (first match wins, so order matters)
  const DATE_PHASES: Array<{ folder: string; start: string; end: string }> = [
    { folder: 'TimeLine/00_Передісторія', start: '1900-01-01', end: '2001-12-31' },
    { folder: 'TimeLine/01_Кредит_іпотека', start: '2002-01-01', end: '2007-12-31' },
    { folder: 'TimeLine/03_Перші_суди', start: '2008-01-01', end: '2008-12-31' },
    { folder: 'TimeLine/04_Борг_2009-2014', start: '2009-01-01', end: '2014-12-31' },
    { folder: 'TimeLine/05_Справа_369', start: '2015-01-01', end: '2015-12-31' },
    { folder: 'TimeLine/06_Вищі_суди', start: '2016-01-01', end: '2020-12-31' },
    { folder: 'TimeLine/07_Відновлення', start: '2021-01-01', end: '2022-12-31' },
    { folder: 'TimeLine/08_Виконавче_2023', start: '2023-01-01', end: '2023-12-31' },
    { folder: 'TimeLine/09_Поточне', start: '2024-01-01', end: '2099-12-31' },
  ];

  for (const phase of DATE_PHASES) {
    if (dateStr >= phase.start && dateStr <= phase.end) {
      return phase.folder;
    }
  }

  return NO_DATE_FOLDER;
}

function classifyByKeywords(title: string): string | null {
  for (const rule of KEYWORD_RULES) {
    for (const kw of rule.keywords) {
      if (kw.test(title)) return rule.folder;
    }
  }
  return null;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  // 1. Find user
  const { rows: users } = await pool.query(
    `SELECT id, email, name FROM users WHERE email = $1`,
    [USER_EMAIL]
  );
  if (users.length === 0) {
    console.error(`User not found: ${USER_EMAIL}`);
    await pool.end();
    process.exit(1);
  }
  const userId = users[0].id;
  console.log(`User: ${users[0].name} (${users[0].email}), ID: ${userId}`);

  // 2. Get all active documents
  const { rows: docs } = await pool.query(
    `SELECT id, title, type, date, metadata, created_at
     FROM documents
     WHERE user_id = $1 AND deleted_at IS NULL
     ORDER BY date NULLS LAST, created_at`,
    [userId]
  );
  console.log(`Total documents: ${docs.length}`);

  // 3. Classify each document
  const moves: Array<{ id: string; title: string; folder: string; reason: string }> = [];
  let noDateCount = 0;
  let dateMatchCount = 0;
  let keywordMatchCount = 0;

  for (const doc of docs) {
    const dateStr = extractDate(doc);
    let folder: string | null = null;
    let reason = '';

    if (dateStr) {
      folder = classifyByDateAndTitle(dateStr, doc.title || '');
      reason = `date=${dateStr}`;
      dateMatchCount++;
    }

    if (!folder || folder === NO_DATE_FOLDER) {
      // Try keyword matching on title for undated docs
      const kwFolder = classifyByKeywords(doc.title || '');
      if (kwFolder) {
        folder = kwFolder;
        reason = `keyword match on title`;
        keywordMatchCount++;
      } else if (!dateStr) {
        folder = NO_DATE_FOLDER;
        reason = 'no date';
        noDateCount++;
      }
    }

    moves.push({ id: doc.id, title: (doc.title || '').slice(0, 80), folder: folder!, reason });
  }

  // 4. Print summary
  const folderCounts = new Map<string, number>();
  for (const m of moves) {
    folderCounts.set(m.folder, (folderCounts.get(m.folder) || 0) + 1);
  }

  console.log('\n── Folder distribution ──');
  for (const [folder, count] of Array.from(folderCounts.entries()).sort()) {
    console.log(`  ${folder}: ${count} docs`);
  }
  console.log(`\nTotal: ${moves.length} (date: ${dateMatchCount}, keyword: ${keywordMatchCount}, undated: ${noDateCount})`);

  if (DRY_RUN) {
    console.log('\n── Document assignments (DRY_RUN) ──');
    for (const m of moves) {
      console.log(`  [${m.folder.split('/').pop()}] ${m.title} — ${m.reason}`);
    }
    console.log('\nDRY_RUN — no changes written.');
    await pool.end();
    return;
  }

  // 5. Update folderPath in metadata
  console.log('\nUpdating folderPath...');
  let updated = 0;
  let errors = 0;

  for (const m of moves) {
    try {
      await pool.query(
        `UPDATE documents
         SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{folderPath}', $2::jsonb),
             updated_at = NOW()
         WHERE id = $1`,
        [m.id, JSON.stringify(m.folder)]
      );
      updated++;
      if (updated % 50 === 0) console.log(`  ...updated ${updated}/${moves.length}`);
    } catch (err: any) {
      errors++;
      console.error(`  ERROR doc ${m.id}: ${err.message}`);
    }
  }

  console.log(`\nDone! Updated: ${updated}, Errors: ${errors}`);
  await pool.end();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Import Supreme Court practice reviews (PDF) into PostgreSQL.
 *
 * Reads PDFs from datasets/supreme-court/ directory, extracts text via pdf-parse,
 * splits into sections, and stores in supreme_court_reviews table.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/import-supreme-court-reviews.js
 *   node scripts/import-supreme-court-reviews.js --force   # re-import all
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

const { Pool } = pg;

// ─── Configuration ───────────────────────────────────────────────
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const DATA_DIR = path.resolve(__dirname, '../datasets/supreme-court');

const CHAMBER_MAP = {
  KKS: { name: 'Касаційний кримінальний суд', short: 'ККС', priority: 1 },
  KAS: { name: 'Касаційний адміністративний суд', short: 'КАС', priority: 2 },
  KCS: { name: 'Касаційний цивільний суд', short: 'КЦС', priority: 3 },
  KGS: { name: 'Касаційний господарський суд', short: 'КГС', priority: 4 },
  VP:  { name: 'Велика Палата Верховного Суду', short: 'ВП', priority: 5 },
};

const MILITARY_FILES = {
  'Oglyad_KAS_VS_viiskova_slygba.pdf': {
    chamber: 'KAS',
    title: 'Огляд судової практики ВС у справах щодо проходження військової служби',
    category: 'military',
    period: '2019-2025',
  },
  'Oglyad_KAS_viiskov_sim_zahist.pdf': {
    chamber: 'KAS',
    title: 'Огляд судової практики ВС щодо захисту прав сімей військовослужбовців',
    category: 'military_families',
    period: '2019-2024',
  },
  'Daigest_sud_prakt_VS_spravi_vijna.pdf': {
    chamber: 'KKS',
    title: 'Дайджест судової практики ВС у справах пов\'язаних з військовим конфліктом',
    category: 'war_cases',
    period: '2022-2024',
  },
};

const forceReload = process.argv.includes('--force');

// ─── Database ────────────────────────────────────────────────────
function getPool() {
  const url = process.env.DATABASE_URL;
  if (url) return new Pool({ connectionString: url });
  return new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'secondlayer_prod',
    user: process.env.POSTGRES_USER || 'secondlayer',
    password: process.env.POSTGRES_PASSWORD,
  });
}

async function ensureTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS supreme_court_reviews (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      chamber TEXT NOT NULL,
      chamber_short TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT DEFAULT 'monthly_review',
      period TEXT,
      year INTEGER,
      month INTEGER,
      full_text TEXT NOT NULL,
      sections JSONB DEFAULT '[]',
      word_count INTEGER DEFAULT 0,
      page_count INTEGER DEFAULT 0,
      imported_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_scr_chamber ON supreme_court_reviews(chamber_short);
    CREATE INDEX IF NOT EXISTS idx_scr_category ON supreme_court_reviews(category);
    CREATE INDEX IF NOT EXISTS idx_scr_year_month ON supreme_court_reviews(year, month);
    CREATE INDEX IF NOT EXISTS idx_scr_fulltext ON supreme_court_reviews USING gin(to_tsvector('simple', full_text));
  `);
}

// ─── PDF Processing ──────────────────────────────────────────────
function splitIntoSections(text) {
  const sections = [];
  // Split by common section headers in Supreme Court reviews
  const sectionPatterns = [
    /^((?:І{1,3}V?|V?I{0,3})\.\s+.+)$/gm,     // Roman numeral sections
    /^(\d+\.\s+.{10,})$/gm,                      // Numbered sections
    /^((?:Розділ|РОЗДІЛ)\s+.+)$/gm,               // "Розділ" sections
    /^(Про\s+.{10,})$/gm,                         // "Про ..." headers
    /^(Щодо\s+.{10,})$/gm,                        // "Щодо ..." headers
  ];

  // Simple approach: split by double newlines into paragraphs, then group
  const paragraphs = text.split(/\n{2,}/).filter(p => p.trim().length > 50);

  if (paragraphs.length <= 3) {
    // Very short — treat as single section
    sections.push({ title: 'Повний текст', text: text.trim() });
    return sections;
  }

  // Group into ~2000 char chunks with overlap
  let currentSection = { title: '', text: '' };
  let sectionNum = 1;

  for (const para of paragraphs) {
    const trimmed = para.trim();

    // Check if this looks like a section header
    const isHeader = /^(І{1,3}V?|V?I{0,3})\.\s+/m.test(trimmed) ||
                     /^(Розділ|РОЗДІЛ|Про |Щодо )/m.test(trimmed) ||
                     (trimmed.length < 200 && trimmed === trimmed.toUpperCase() && trimmed.length > 10);

    if (isHeader && currentSection.text.length > 100) {
      // Save current section
      currentSection.title = currentSection.title || `Секція ${sectionNum}`;
      sections.push({ ...currentSection });
      sectionNum++;
      currentSection = { title: trimmed.slice(0, 200), text: trimmed };
    } else {
      if (!currentSection.title && trimmed.length < 200) {
        currentSection.title = trimmed;
      }
      currentSection.text += '\n\n' + trimmed;
    }

    // Split if section gets too large (>5000 chars)
    if (currentSection.text.length > 5000) {
      currentSection.title = currentSection.title || `Секція ${sectionNum}`;
      sections.push({ ...currentSection });
      sectionNum++;
      currentSection = { title: '', text: '' };
    }
  }

  if (currentSection.text.trim().length > 50) {
    currentSection.title = currentSection.title || `Секція ${sectionNum}`;
    sections.push(currentSection);
  }

  return sections;
}

async function processPdf(filePath) {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return {
    text: data.text,
    pages: data.numpages,
    wordCount: data.text.split(/\s+/).length,
  };
}

function parseFilename(filename) {
  // Pattern: Oglyad_KKS_MM_YYYY.pdf
  const match = filename.match(/Oglyad_(\w+)_(\d{2})_(\d{4})\.pdf/);
  if (match) {
    const [, chamber, month, year] = match;
    const chamberInfo = CHAMBER_MAP[chamber];
    if (!chamberInfo) return null;
    return {
      chamber: chamberInfo.name,
      chamber_short: chamberInfo.short,
      title: `Огляд судової практики ${chamberInfo.short} ВС за ${month}/${year}`,
      category: 'monthly_review',
      year: parseInt(year),
      month: parseInt(month),
      period: `${year}-${month}`,
    };
  }
  return null;
}

// ─── Main ────────────────────────────────────────────────────────
async function main() {
  const pool = getPool();

  try {
    await ensureTable(pool);
    console.log('Supreme Court Reviews Importer');
    console.log(`  Data dir: ${DATA_DIR}`);
    console.log(`  Force: ${forceReload}`);
    console.log('');

    const allFiles = [];

    // 1. Military-specific PDFs (root level)
    for (const [filename, meta] of Object.entries(MILITARY_FILES)) {
      const filePath = path.join(DATA_DIR, filename);
      if (fs.existsSync(filePath)) {
        const chamberInfo = CHAMBER_MAP[meta.chamber];
        allFiles.push({
          filePath,
          filename,
          chamber: chamberInfo.name,
          chamber_short: chamberInfo.short,
          title: meta.title,
          category: meta.category,
          period: meta.period,
          year: null,
          month: null,
        });
      }
    }

    // 2. Monthly reviews by chamber
    for (const [dirName, chamberInfo] of Object.entries(CHAMBER_MAP)) {
      const dirPath = path.join(DATA_DIR, dirName);
      if (!fs.existsSync(dirPath)) continue;

      const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.pdf'));
      for (const filename of files) {
        const parsed = parseFilename(filename);
        if (!parsed) continue;

        allFiles.push({
          filePath: path.join(dirPath, filename),
          filename: `${dirName}/${filename}`,
          ...parsed,
        });
      }
    }

    console.log(`Found ${allFiles.length} PDF files to process\n`);

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const file of allFiles) {
      // Check if already imported
      if (!forceReload) {
        const existing = await pool.query(
          'SELECT id FROM supreme_court_reviews WHERE filename = $1',
          [file.filename]
        );
        if (existing.rows.length > 0) {
          skipped++;
          continue;
        }
      }

      process.stdout.write(`  ${file.filename} ... `);

      try {
        const { text, pages, wordCount } = await processPdf(file.filePath);

        if (text.trim().length < 100) {
          console.log('SKIP (empty)');
          skipped++;
          continue;
        }

        const sections = splitIntoSections(text);

        if (forceReload) {
          await pool.query('DELETE FROM supreme_court_reviews WHERE filename = $1', [file.filename]);
        }

        await pool.query(
          `INSERT INTO supreme_court_reviews
           (filename, chamber, chamber_short, title, category, period, year, month, full_text, sections, word_count, page_count)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (filename) DO UPDATE SET
             full_text = EXCLUDED.full_text,
             sections = EXCLUDED.sections,
             word_count = EXCLUDED.word_count,
             page_count = EXCLUDED.page_count,
             imported_at = NOW()`,
          [
            file.filename,
            file.chamber,
            file.chamber_short,
            file.title,
            file.category,
            file.period,
            file.year,
            file.month,
            text,
            JSON.stringify(sections),
            wordCount,
            pages,
          ]
        );

        console.log(`OK (${pages} pages, ${wordCount} words, ${sections.length} sections)`);
        imported++;
      } catch (err) {
        console.log(`ERROR: ${err.message}`);
        errors++;
      }
    }

    console.log('\n============================================================');
    console.log(`  Imported: ${imported}`);
    console.log(`  Skipped:  ${skipped}`);
    console.log(`  Errors:   ${errors}`);
    console.log(`  Total:    ${allFiles.length}`);
    console.log('============================================================');

    // Show summary from DB
    const stats = await pool.query(`
      SELECT chamber_short, category, count(*) as cnt,
             sum(word_count) as total_words, sum(page_count) as total_pages
      FROM supreme_court_reviews
      GROUP BY chamber_short, category
      ORDER BY chamber_short, category
    `);

    if (stats.rows.length > 0) {
      console.log('\nDB Summary:');
      for (const row of stats.rows) {
        console.log(`  ${row.chamber_short} [${row.category}]: ${row.cnt} docs, ${row.total_words} words, ${row.total_pages} pages`);
      }
    }

  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

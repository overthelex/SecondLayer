/**
 * Import the Ukrainian State Register of Sanctions (Держреєстр санкцій РНБО)
 * into opendata_drs_sanctions.
 *
 * Reads the JSON snapshot downloaded to /data/opendata/drs/drs_subjects_full.json
 * (the public frontend proxy drs.nsdc.gov.ua/registry-api/subjects — no API key).
 * The prod IP is Cloudflare-blocked on this host, so the file is produced out-of-band
 * (browser/local) and this importer only loads it.
 *
 * Usage:
 *   npx tsx src/scripts/import-drs-sanctions.ts [path]
 *   default path: /data/opendata/drs/drs_subjects_full.json
 */

import { Pool } from 'pg';
import * as fs from 'fs';

const DEFAULT_PATH = '/data/opendata/drs/drs_subjects_full.json';
const BATCH_SIZE = 500;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'secondlayer',
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB || 'secondlayer_prod',
  max: 5,
});

/** Normalise a possibly-partial date string to a valid DATE or null. */
function toDate(v: any): string | null {
  if (!v || typeof v !== 'string') return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  if (mo === '00' || d === '00') return null; // partial dates are not storable
  return `${y}-${mo}-${d}`;
}

async function insertBatch(items: any[], fetchedAt: string | null): Promise<number> {
  if (items.length === 0) return 0;
  const values: any[] = [];
  const placeholders: string[] = [];
  let i = 1;
  for (const s of items) {
    const fields = [
      s.subjectId,
      s.subjectType || null,
      s.subjectStatus || null,
      s.subjectName || null,
      s.subjectAliases ? JSON.stringify(s.subjectAliases) : null,
      toDate(s.subjectBirthDate),
      s.subjectIdentifiers ? JSON.stringify(s.subjectIdentifiers) : null,
      s.subjectCitizenships ? JSON.stringify(s.subjectCitizenships) : null,
      s.subjectAttributes ? JSON.stringify(s.subjectAttributes) : null,
      JSON.stringify(s),
      fetchedAt,
    ];
    placeholders.push(`(${fields.map(() => `$${i++}`).join(',')})`);
    values.push(...fields);
  }
  const sql = `
    INSERT INTO opendata_drs_sanctions
      (subject_id, subject_type, subject_status, name, aliases, birth_date,
       identifiers, citizenships, attributes, raw_data, fetched_at)
    VALUES ${placeholders.join(',')}
    ON CONFLICT (subject_id) DO UPDATE SET
      subject_type = EXCLUDED.subject_type,
      subject_status = EXCLUDED.subject_status,
      name = EXCLUDED.name,
      aliases = EXCLUDED.aliases,
      birth_date = EXCLUDED.birth_date,
      identifiers = EXCLUDED.identifiers,
      citizenships = EXCLUDED.citizenships,
      attributes = EXCLUDED.attributes,
      raw_data = EXCLUDED.raw_data,
      fetched_at = EXCLUDED.fetched_at,
      imported_at = NOW()
  `;
  const res = await pool.query(sql, values);
  return res.rowCount || 0;
}

async function main(): Promise<void> {
  const path = process.argv[2] || DEFAULT_PATH;
  console.log(`📥 ДРС РНБО import from ${path}`);
  if (!fs.existsSync(path)) {
    console.error(`❌ File not found: ${path}`);
    process.exit(1);
  }
  const doc = JSON.parse(fs.readFileSync(path, 'utf8'));
  const items: any[] = doc.items || [];
  const fetchedAt = doc.fetchedAt || null;
  console.log(`   total subjects: ${items.length}, snapshot: ${fetchedAt}`);

  await pool.query('SELECT 1');
  let imported = 0;
  for (let b = 0; b < items.length; b += BATCH_SIZE) {
    imported += await insertBatch(items.slice(b, b + BATCH_SIZE), fetchedAt);
    if (b % (BATCH_SIZE * 10) === 0) console.log(`   ${b}/${items.length}`);
  }
  console.log(`✅ ДРС import: ${imported} rows upserted`);
  await pool.end();
}

main().catch(err => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});

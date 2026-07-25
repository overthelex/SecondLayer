/**
 * Import street renamings from OpenStreetMap Overpass API
 * Downloads all Ukrainian streets with old_name tag and imports into street_renamings table
 */
import { Pool } from 'pg';
import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

const OVERPASS_API = 'https://overpass-api.de/api/interpreter';
const DB_BATCH_SIZE = 500;

const OVERPASS_QUERY = `[out:csv(::id,name,"name:uk","old_name","old_name:uk",::type;true;"|")][timeout:300];
area["ISO3166-1"="UA"]->.ua;
way["highway"]["old_name"](area.ua);
out tags;`;

interface StreetRecord {
  osm_id: number;
  current_name: string;
  current_name_uk: string | null;
  old_names: string[];
  rename_count: number;
}

async function fetchOverpassData(): Promise<string> {
  return new Promise((resolve, reject) => {
    const postData = `data=${encodeURIComponent(OVERPASS_QUERY)}`;
    const url = new URL(OVERPASS_API);

    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 300000,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(postData);
    req.end();
  });
}

function parseCSV(csv: string): StreetRecord[] {
  const lines = csv.trim().split('\n');
  const records: StreetRecord[] = [];

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split('|');
    if (parts.length < 6) continue;

    const osmId = parseInt(parts[0], 10);
    const name = parts[1]?.trim() || '';
    const nameUk = parts[2]?.trim() || '';
    const oldName = parts[3]?.trim() || '';
    const oldNameUk = parts[4]?.trim() || '';

    if (!osmId || (!oldName && !oldNameUk)) continue;

    const oldNamesStr = oldNameUk || oldName;
    const oldNames = oldNamesStr.split(';').map(n => n.trim()).filter(Boolean);

    records.push({
      osm_id: osmId,
      current_name: nameUk || name,
      current_name_uk: nameUk || null,
      old_names: oldNames,
      rename_count: oldNames.length,
    });
  }

  return records;
}

async function importBatch(pool: Pool, records: StreetRecord[]): Promise<number> {
  if (records.length === 0) return 0;

  const values: any[] = [];
  const placeholders: string[] = [];
  let idx = 1;

  for (const r of records) {
    placeholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4})`);
    values.push(r.osm_id, r.current_name, r.current_name_uk, r.old_names, r.rename_count);
    idx += 5;
  }

  const result = await pool.query(
    `INSERT INTO street_renamings (osm_id, current_name, current_name_uk, old_names, rename_count)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (osm_id) DO UPDATE SET
       current_name = EXCLUDED.current_name,
       current_name_uk = EXCLUDED.current_name_uk,
       old_names = EXCLUDED.old_names,
       rename_count = EXCLUDED.rename_count,
       updated_at = CURRENT_TIMESTAMP`,
    values
  );

  return result.rowCount || 0;
}

async function main() {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5435'),
    user: process.env.POSTGRES_USER || 'openreyestr',
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB || 'openreyestr',
  });

  try {
    console.log('Fetching street renamings from OpenStreetMap Overpass API...');
    const csv = await fetchOverpassData();
    const records = parseCSV(csv);
    console.log(`Parsed ${records.length} street records with old names`);

    const multipleRenames = records.filter(r => r.rename_count >= 2);
    console.log(`Streets renamed 2+ times: ${multipleRenames.length}`);

    let imported = 0;
    for (let i = 0; i < records.length; i += DB_BATCH_SIZE) {
      const batch = records.slice(i, i + DB_BATCH_SIZE);
      const count = await importBatch(pool, batch);
      imported += count;
      if ((i + DB_BATCH_SIZE) % 5000 === 0 || i + DB_BATCH_SIZE >= records.length) {
        console.log(`  Imported ${imported}/${records.length}`);
      }
    }

    console.log(`\nImport completed: ${imported} street renamings`);

    // Print stats
    const stats = await pool.query(`
      SELECT rename_count, COUNT(*) as cnt
      FROM street_renamings
      GROUP BY rename_count
      ORDER BY rename_count DESC
    `);
    console.log('\nStatistics:');
    for (const row of stats.rows) {
      console.log(`  ${row.rename_count} rename(s): ${row.cnt} streets`);
    }
  } catch (error) {
    console.error('Import failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch(console.error);

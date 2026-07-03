/**
 * Refresh eu_sanctions from the EU Consolidated Financial Sanctions File (FSF XML).
 *
 * Reads /data/opendata/intl_sanctions/eu/xmlFullSanctionsList_1_1.xml, parses
 * <sanctionEntity> elements and upserts by entity_id (euReferenceNumber, or logicalId).
 *
 * Usage:
 *   npx tsx src/scripts/import-eu-sanctions.ts [path]
 *   default: /data/opendata/intl_sanctions/eu/xmlFullSanctionsList_1_1.xml
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import { XMLParser } from 'fast-xml-parser';

const DEFAULT_PATH = '/data/opendata/intl_sanctions/eu/xmlFullSanctionsList_1_1.xml';
const BATCH_SIZE = 300;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'secondlayer',
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB || 'secondlayer_prod',
  max: 5,
});

const asArray = (v: any): any[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const at = (o: any, name: string): string | null => {
  const v = o?.[`@_${name}`];
  return v == null || v === '' ? null : String(v);
};
const firstNonNull = (arr: (string | null)[]): string | null => arr.find(x => x) ?? null;

function mapEntity(e: any): any[] | null {
  const entityId = at(e, 'euReferenceNumber') || at(e, 'logicalId');
  if (!entityId) return null;

  const subjectType = asArray(e.subjectType)[0];
  const entityType = at(subjectType, 'code'); // person | enterprise

  const nameAliases = asArray(e.nameAlias);
  const wholeNames = nameAliases.map(n => at(n, 'wholeName')).filter(Boolean) as string[];
  const strong = nameAliases.find(n => at(n, 'strong') === 'true');
  const name = at(strong || nameAliases[0], 'wholeName');

  const births = asArray(e.birthdate);
  const birthDate = firstNonNull(births.map(b => at(b, 'birthdate') || at(b, 'year')));
  const birthPlace = firstNonNull(births.map(b => [at(b, 'city'), at(b, 'countryDescription')].filter(Boolean).join(', ') || null));

  const citizenship = asArray(e.citizenship).map(c => at(c, 'countryDescription')).filter(Boolean) as string[];
  const addresses = asArray(e.address).map(a =>
    [at(a, 'street'), at(a, 'city'), at(a, 'countryDescription')].filter(Boolean).join(', ') || null
  ).filter(Boolean) as string[];
  const identifications = asArray(e.identification).map(id => ({
    type: at(id, 'identificationTypeDescription') || at(id, 'identificationTypeCode'),
    number: at(id, 'number') || at(id, 'latinNumber'),
    country: at(id, 'countryDescription'),
  }));

  const regs = asArray(e.regulation);
  const reg = regs[0] || {};
  const regulationBasis = at(reg, 'numberTitle');
  const programme = firstNonNull(regs.map(r => at(r, 'programme')));
  const listingDate = firstNonNull(regs.map(r => at(r, 'publicationDate') || at(r, 'entryIntoForceDate')));
  const remark = asArray(e.remark).map(r => (typeof r === 'string' ? r : r?.['#text'])).filter(Boolean).join('; ') || null;

  return [
    entityId,
    entityType,
    name,
    wholeNames,
    birthDate,
    birthPlace,
    citizenship,
    addresses,
    JSON.stringify(identifications),
    regulationBasis,
    listingDate,
    programme,
    remark,
    JSON.stringify(e),
  ];
}

async function insertBatch(rows: any[][]): Promise<number> {
  if (rows.length === 0) return 0;
  const values: any[] = [];
  const ph: string[] = [];
  let i = 1;
  for (const r of rows) {
    ph.push(`(${r.map(() => `$${i++}`).join(',')})`);
    values.push(...r);
  }
  const sql = `
    INSERT INTO eu_sanctions
      (entity_id, entity_type, name, name_aliases, birth_date, birth_place, citizenship,
       addresses, identifications, regulation_basis, listing_date, programme, remark, metadata_json)
    VALUES ${ph.join(',')}
    ON CONFLICT (entity_id) DO UPDATE SET
      entity_type = EXCLUDED.entity_type, name = EXCLUDED.name, name_aliases = EXCLUDED.name_aliases,
      birth_date = EXCLUDED.birth_date, birth_place = EXCLUDED.birth_place, citizenship = EXCLUDED.citizenship,
      addresses = EXCLUDED.addresses, identifications = EXCLUDED.identifications,
      regulation_basis = EXCLUDED.regulation_basis, listing_date = EXCLUDED.listing_date,
      programme = EXCLUDED.programme, remark = EXCLUDED.remark, metadata_json = EXCLUDED.metadata_json,
      updated_at = NOW()
  `;
  const res = await pool.query(sql, values);
  return res.rowCount || 0;
}

async function main(): Promise<void> {
  const path = process.argv[2] || DEFAULT_PATH;
  console.log(`📥 EU FSF refresh from ${path}`);
  if (!fs.existsSync(path)) { console.error(`❌ Not found: ${path}`); process.exit(1); }
  await pool.query('SELECT 1');

  const xml = fs.readFileSync(path, 'utf8');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, parseTagValue: false });
  const doc = parser.parse(xml);
  const entities = asArray(doc.export?.sanctionEntity);
  console.log(`   entities: ${entities.length}`);

  let imported = 0, skipped = 0;
  let batch: any[][] = [];
  for (const e of entities) {
    const row = mapEntity(e);
    if (!row) { skipped++; continue; }
    batch.push(row);
    if (batch.length >= BATCH_SIZE) { imported += await insertBatch(batch); batch = []; }
  }
  if (batch.length) imported += await insertBatch(batch);
  console.log(`✅ EU: ${imported} rows upserted${skipped ? `, ${skipped} skipped (no id)` : ''}`);
  await pool.end();
}

main().catch(err => { console.error('❌ Fatal:', err); process.exit(1); });

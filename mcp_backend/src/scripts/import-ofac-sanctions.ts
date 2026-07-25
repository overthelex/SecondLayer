/**
 * Refresh us_ofac_sanctions from the OFAC SDN list (SDN.XML).
 *
 * Reads /data/opendata/intl_sanctions/ofac/SDN.XML (downloaded out-of-band; the prod
 * IP is fine for OFAC but we load the local snapshot for reproducibility). Parses
 * <sdnEntry> elements and upserts by uid.
 *
 * Usage:
 *   npx tsx src/scripts/import-ofac-sanctions.ts [path]
 *   default: /data/opendata/intl_sanctions/ofac/SDN.XML
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import { XMLParser } from 'fast-xml-parser';

const DEFAULT_PATH = '/data/opendata/intl_sanctions/ofac/SDN.XML';
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

const asArray = (v: any): any[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const txt = (v: any): string | null => (v == null || v === '' ? null : String(v));

function sdnName(e: any): string | null {
  const parts = [e.firstName, e.lastName].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

function mapEntry(e: any): any[] {
  const programs = asArray(e.programList?.program).map(txt).filter(Boolean);
  const aliases = asArray(e.akaList?.aka).map((a: any) => ({
    type: txt(a.type), category: txt(a.category),
    name: [a.firstName, a.lastName].filter(Boolean).join(' ') || null,
  }));
  const addresses = asArray(e.addressList?.address).map((a: any) => ({
    address1: txt(a.address1), city: txt(a.city), country: txt(a.country),
    stateOrProvince: txt(a.stateOrProvince), postalCode: txt(a.postalCode),
  }));
  const ids = asArray(e.idList?.id).map((i: any) => ({
    type: txt(i.idType), number: txt(i.idNumber), country: txt(i.idCountry),
  }));
  const v = e.vesselInfo || {};
  return [
    txt(e.uid),
    'sdn',
    sdnName(e),
    txt(e.sdnType),
    programs.join('; ') || null,
    txt(e.title),
    txt(e.remarks),
    txt(v.callSign),
    txt(v.vesselType),
    txt(v.tonnage),
    txt(v.grossRegisteredTonnage),
    txt(v.vesselFlag),
    txt(v.vesselOwner),
    JSON.stringify(addresses),
    JSON.stringify(aliases),
    JSON.stringify(ids),
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
    INSERT INTO us_ofac_sanctions
      (uid, entry_type, sdn_name, sdn_type, program, title, remarks, call_sign,
       vessel_type, tonnage, grt, vessel_flag, vessel_owner, addresses, aliases, ids)
    VALUES ${ph.join(',')}
    ON CONFLICT (uid) DO UPDATE SET
      sdn_name = EXCLUDED.sdn_name, sdn_type = EXCLUDED.sdn_type, program = EXCLUDED.program,
      title = EXCLUDED.title, remarks = EXCLUDED.remarks, call_sign = EXCLUDED.call_sign,
      vessel_type = EXCLUDED.vessel_type, tonnage = EXCLUDED.tonnage, grt = EXCLUDED.grt,
      vessel_flag = EXCLUDED.vessel_flag, vessel_owner = EXCLUDED.vessel_owner,
      addresses = EXCLUDED.addresses, aliases = EXCLUDED.aliases, ids = EXCLUDED.ids,
      imported_at = NOW()
  `;
  const res = await pool.query(sql, values);
  return res.rowCount || 0;
}

async function main(): Promise<void> {
  const path = process.argv[2] || DEFAULT_PATH;
  console.log(`📥 OFAC SDN refresh from ${path}`);
  if (!fs.existsSync(path)) { console.error(`❌ Not found: ${path}`); process.exit(1); }
  await pool.query('SELECT 1');

  const xml = fs.readFileSync(path, 'utf8');
  const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });
  const doc = parser.parse(xml);
  const entries = asArray(doc.sdnList?.sdnEntry);
  console.log(`   entries: ${entries.length}`);

  let imported = 0;
  let batch: any[][] = [];
  for (const e of entries) {
    batch.push(mapEntry(e));
    if (batch.length >= BATCH_SIZE) { imported += await insertBatch(batch); batch = []; }
  }
  if (batch.length) imported += await insertBatch(batch);
  console.log(`✅ OFAC: ${imported} rows upserted`);
  await pool.end();
}

main().catch(err => { console.error('❌ Fatal:', err); process.exit(1); });

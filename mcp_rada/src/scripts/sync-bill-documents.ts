/**
 * Sync bill documents (супровідні документи законопроектів) into rada.bill_documents.
 *
 * Pulls the FULL Rada bill-info dataset (with documents + passings) — which our normal
 * bill sync does NOT fetch — and stores every workflow/source document per bill:
 * ГНЕУ conclusions (kind_id=100 «Науково-експертний висновок»), committee conclusions,
 * budget / EU-integration / anti-corruption / linguistic expert reviews, ГЮУ remarks, etc.
 *
 * The verdict summary (short_review / formal_review) and the PDF links live directly in the
 * JSON, so this pass needs NO per-document requests. Extracting PDF full text is a later phase.
 *
 * Usage:
 *   npm run sync:bill-documents            # convocation 9 (default)
 *   CONVOCATIONS=9,8 npm run sync:bill-documents
 *   node --max-old-space-size=4096 dist/scripts/sync-bill-documents.js 9
 *
 * Env:
 *   DATABASE_URL or POSTGRES_HOST/PORT/USER/PASSWORD/DB
 *   CONVOCATIONS   comma-separated skl numbers (overrides argv), default "9"
 */

import { Pool } from 'pg';

const API_BASE = 'https://data.rada.gov.ua/ogd/zpr';
const BATCH_SIZE = 200;
const FETCH_TIMEOUT_MS = 180_000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'rada_mcp',
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB || 'secondlayer_prod',
  options: '-c search_path=rada',
  max: 5,
});

// ── Helpers ─────────────────────────────────────────────────────────────────
function nz(v: any): any {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  return v;
}

async function fetchBillInfo(conv: number): Promise<any[]> {
  const url = `${API_BASE}/skl${conv}/billinfo-skl${conv}.json`;
  console.log(`\n📥 Fetching ${url} …`);
  const resp = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'SecondLayer-Legal-Platform/1.0' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
  let text = await resp.text();
  console.log(`   Downloaded ${(text.length / 1_048_576).toFixed(1)} MB, parsing…`);
  // The Rada feed embeds raw control characters inside string values, which strict
  // JSON.parse rejects. Escaped sequences (\\n) are two chars and untouched; only raw
  // bytes 0x00–0x1F get flattened to spaces.
  text = text.replace(/[\x00-\x1F]/g, ' ');
  const data = JSON.parse(text);
  const bills = Array.isArray(data)
    ? data
    : (Object.values(data).find((v) => Array.isArray(v)) as any[]) || [];
  console.log(`   ${bills.length.toLocaleString()} bills in feed`);
  return bills;
}

// Map one workflow/source document to a bill_documents row (array in column order).
function toRow(doc: any, bill: any, conv: number, group: 'workflow' | 'source'): any[] {
  const files = Array.isArray(doc.docFiles) ? doc.docFiles : [];
  const f0 = files[0] || {};
  return [
    doc.id, // doc_id (PK)
    bill.id, // rada_bill_id
    nz(bill.registrationNumber), // bill_number
    conv, // convocation
    group, // doc_group
    nz(doc.kindId), // kind_id
    nz(doc.kind), // kind
    nz(doc.registrationNum), // registration_num
    nz(doc.registrationDate), // registration_date
    nz(doc.outcomingNum), // outcoming_num
    nz(doc.outcomingDate), // outcoming_date
    nz(doc.publishDate), // publish_date
    nz(doc.meetingDate), // meeting_date
    nz(doc.short_review), // short_review
    nz(doc.formal_review), // formal_review
    nz(doc.mainSpeaker), // main_speaker
    nz(f0.url), // file_url
    nz(f0.archiveWithSignsUrl), // file_zip_url
    files.length ? JSON.stringify(files) : null, // doc_files
    JSON.stringify(doc), // raw
  ];
}

const COLS = [
  'doc_id', 'rada_bill_id', 'bill_number', 'convocation', 'doc_group', 'kind_id', 'kind',
  'registration_num', 'registration_date', 'outcoming_num', 'outcoming_date', 'publish_date',
  'meeting_date', 'short_review', 'formal_review', 'main_speaker', 'file_url', 'file_zip_url',
  'doc_files', 'raw',
];

async function upsertBatch(rows: any[][]): Promise<number> {
  if (rows.length === 0) return 0;
  const values: any[] = [];
  const tuples: string[] = [];
  let i = 1;
  for (const r of rows) {
    tuples.push(`(${r.map(() => `$${i++}`).join(',')})`);
    values.push(...r);
  }
  const updates = COLS.filter((c) => c !== 'doc_id')
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(', ');
  const sql = `
    INSERT INTO rada.bill_documents (${COLS.join(', ')})
    VALUES ${tuples.join(',')}
    ON CONFLICT (doc_id) DO UPDATE SET ${updates}, updated_at = now()
  `;
  const res = await pool.query(sql, values);
  return res.rowCount || 0;
}

async function syncConvocation(conv: number): Promise<{ docs: number; gneu: number }> {
  const bills = await fetchBillInfo(conv);

  let batch: any[][] = [];
  let total = 0;
  let gneu = 0;
  let processedBills = 0;

  for (const bill of bills) {
    const docs = bill.documents || {};
    for (const group of ['workflow', 'source'] as const) {
      const arr = Array.isArray(docs[group]) ? docs[group] : [];
      for (const doc of arr) {
        if (doc?.id == null) continue; // PK required
        if (doc.kindId === 100) gneu++;
        batch.push(toRow(doc, bill, conv, group));
        if (batch.length >= BATCH_SIZE) {
          total += await upsertBatch(batch);
          batch = [];
        }
      }
    }
    if (++processedBills % 2000 === 0) {
      console.log(`   …${processedBills.toLocaleString()}/${bills.length.toLocaleString()} bills, ${total.toLocaleString()} docs upserted`);
    }
  }
  if (batch.length) total += await upsertBatch(batch);

  console.log(`✅ skl${conv}: ${total.toLocaleString()} documents upserted (${gneu.toLocaleString()} ГНЕУ conclusions)`);
  return { docs: total, gneu };
}

async function main(): Promise<void> {
  const convs = (process.env.CONVOCATIONS || process.argv[2] || '9')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n));

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🏛️  Rada Bill Documents Sync (ГНЕУ + супровідні документи)');
  console.log(`   Convocations: ${convs.join(', ')}`);
  console.log('═══════════════════════════════════════════════════════════════');

  try {
    await pool.query('SELECT 1');
    console.log('✅ Database connected');

    let docs = 0;
    let gneu = 0;
    for (const c of convs) {
      const r = await syncConvocation(c);
      docs += r.docs;
      gneu += r.gneu;
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`🎉 Done: ${docs.toLocaleString()} documents (${gneu.toLocaleString()} ГНЕУ) across ${convs.length} convocation(s)`);
    console.log('═══════════════════════════════════════════════════════════════');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});

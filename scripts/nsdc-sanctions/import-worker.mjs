#!/usr/bin/env node
/**
 * Multi-threaded NSDC Sanctions importer
 * Reads JSONL, filters by date, inserts via N concurrent PG connections
 */

import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import pg from 'pg';
import { parseArgs } from 'util';

const { values: args } = parseArgs({
  options: {
    file:     { type: 'string' },
    workers:  { type: 'string', default: '50' },
    cutoff:   { type: 'string' },
    host:     { type: 'string', default: 'localhost' },
    port:     { type: 'string', default: '5432' },
    database: { type: 'string', default: 'secondlayer_local' },
    user:     { type: 'string', default: 'secondlayer' },
    password: { type: 'string', default: 'local_dev_password' },
  },
});

const WORKERS = parseInt(args.workers, 10);
const CUTOFF = args.cutoff ? new Date(args.cutoff) : null;
const BATCH_SIZE = 100;

// ── PG Pool ──
const pool = new pg.Pool({
  host: args.host,
  port: parseInt(args.port, 10),
  database: args.database,
  user: args.user,
  password: args.password,
  max: WORKERS + 2,
  idleTimeoutMillis: 30000,
});

// ── Parse one JSONL record into insert values ──
function parseRecord(obj) {
  const props = obj.properties || {};

  // Derive sanctions status from nested sanctions
  let sanctionsStatus = null;
  const sanctionsArr = [];
  for (const s of (props.sanctions || [])) {
    const sp = s.properties || {};
    const startDate = (sp.startDate || [])[0] || null;
    const endDate = (sp.endDate || [])[0] || null;
    const status = (sp.status || [])[0] || null;
    const authority = (sp.authority || [])[0] || null;
    const program = (sp.program || [])[0] || s.caption || null;
    const provisions = sp.provisions || [];

    sanctionsArr.push({
      decree: program,
      status: status,
      start: startDate,
      end: endDate,
      authority,
      provisions,
    });

    // Determine overall status
    if (status === 'active' || (!status && (!endDate || new Date(endDate) > new Date()))) {
      sanctionsStatus = 'active';
    }
  }
  if (!sanctionsStatus && sanctionsArr.length > 0) {
    sanctionsStatus = 'expired';
  }

  // Build identifiers array
  const identifiers = [];
  for (const [key, values] of Object.entries(props)) {
    if (key.endsWith('Code') || key === 'passportNumber' || key === 'registrationNumber' || key === 'idNumber') {
      for (const v of values) {
        identifiers.push({ type: key, value: v });
      }
    }
  }

  return {
    id: obj.id,
    caption: obj.caption || '',
    schema: obj.schema || '',
    names: props.name || [],
    aliases: props.alias || [],
    birth_dates: props.birthDate || [],
    death_date: (props.deathDate || [])[0] || null,
    citizenships: props.citizenship || [],
    countries: props.country || props.jurisdiction || [],
    addresses: props.address || [],
    identifiers,
    sanctions: sanctionsArr,
    sanctions_status: sanctionsStatus,
    program_ids: props.programId || [],
    phones: props.phone || [],
    emails: props.email || [],
    properties: props,
    first_seen: obj.first_seen || null,
    last_seen: obj.last_seen || null,
    last_change: obj.last_change || null,
  };
}

// ── Batch insert ──
const UPSERT_SQL = `
INSERT INTO nsdc_sanctions_subjects (
  id, caption, schema, names, aliases, birth_dates, death_date,
  citizenships, countries, addresses, identifiers, sanctions,
  sanctions_status, program_ids, phones, emails, properties,
  first_seen, last_seen, last_change
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
ON CONFLICT (id) DO UPDATE SET
  caption = EXCLUDED.caption,
  schema = EXCLUDED.schema,
  names = EXCLUDED.names,
  aliases = EXCLUDED.aliases,
  birth_dates = EXCLUDED.birth_dates,
  death_date = EXCLUDED.death_date,
  citizenships = EXCLUDED.citizenships,
  countries = EXCLUDED.countries,
  addresses = EXCLUDED.addresses,
  identifiers = EXCLUDED.identifiers,
  sanctions = EXCLUDED.sanctions,
  sanctions_status = EXCLUDED.sanctions_status,
  program_ids = EXCLUDED.program_ids,
  phones = EXCLUDED.phones,
  emails = EXCLUDED.emails,
  properties = EXCLUDED.properties,
  first_seen = EXCLUDED.first_seen,
  last_seen = EXCLUDED.last_seen,
  last_change = EXCLUDED.last_change,
  imported_at = NOW()
`;

async function insertBatch(records) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of records) {
      await client.query(UPSERT_SQL, [
        r.id, r.caption, r.schema,
        r.names, r.aliases, r.birth_dates, r.death_date,
        r.citizenships, r.countries, r.addresses,
        JSON.stringify(r.identifiers), JSON.stringify(r.sanctions),
        r.sanctions_status, r.program_ids, r.phones, r.emails,
        JSON.stringify(r.properties),
        r.first_seen, r.last_seen, r.last_change,
      ]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Main ──
async function main() {
  console.log(`Starting import: file=${args.file}, workers=${WORKERS}, cutoff=${CUTOFF?.toISOString() || 'none'}`);

  // Truncate for clean import
  const client = await pool.connect();
  await client.query('DELETE FROM nsdc_sanctions_subjects');
  client.release();
  console.log('Table cleared.');

  const rl = createInterface({
    input: createReadStream(args.file),
    crlfDelay: Infinity,
  });

  let totalRead = 0;
  let filtered = 0;
  let inserted = 0;
  let errors = 0;
  let batch = [];
  const pending = new Set();
  const startTime = Date.now();

  function logProgress() {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = (inserted / (elapsed || 1)).toFixed(0);
    process.stdout.write(`\r  Read: ${totalRead} | Filtered: ${filtered} | Inserted: ${inserted} | Errors: ${errors} | Pending: ${pending.size} | ${rate} rec/s | ${elapsed}s`);
  }

  async function flushBatch(records) {
    const promise = insertBatch(records)
      .then(() => { inserted += records.length; })
      .catch((err) => {
        errors += records.length;
        console.error(`\nBatch error: ${err.message}`);
      })
      .finally(() => { pending.delete(promise); });
    pending.add(promise);

    // Backpressure: wait if too many pending
    while (pending.size >= WORKERS) {
      await Promise.race(pending);
    }
  }

  for await (const line of rl) {
    if (!line.trim()) continue;
    totalRead++;

    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      errors++;
      continue;
    }

    // Filter by date: first_seen must be within last 5 years
    if (CUTOFF) {
      const firstSeen = obj.first_seen ? new Date(obj.first_seen) : null;
      const lastChange = obj.last_change ? new Date(obj.last_change) : null;
      // Include if first seen or last changed within window
      if (firstSeen && firstSeen < CUTOFF && (!lastChange || lastChange < CUTOFF)) {
        filtered++;
        continue;
      }
    }

    const record = parseRecord(obj);
    batch.push(record);

    if (batch.length >= BATCH_SIZE) {
      await flushBatch(batch);
      batch = [];
      if (inserted % 1000 < BATCH_SIZE) logProgress();
    }
  }

  // Flush remainder
  if (batch.length > 0) {
    await flushBatch(batch);
  }

  // Wait for all pending
  await Promise.all(pending);
  logProgress();

  console.log('\n');
  console.log(`Import complete: ${inserted} inserted, ${filtered} filtered (before cutoff), ${errors} errors`);
  console.log(`Total time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  await pool.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

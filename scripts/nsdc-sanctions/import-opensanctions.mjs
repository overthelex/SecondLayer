#!/usr/bin/env node
/**
 * OpenSanctions CSV importer — 50 concurrent PG connections
 * Proper streaming CSV parser handling multiline quoted fields.
 *
 * Usage:
 *   node import-opensanctions.mjs --file data/default.csv \
 *     --workers 50 --host localhost --port 5434 \
 *     --database secondlayer_stage --user secondlayer --password XXX
 */

import { createReadStream } from 'fs';
import pg from 'pg';
import { parseArgs } from 'util';

const { values: args } = parseArgs({
  options: {
    file:     { type: 'string' },
    workers:  { type: 'string', default: '50' },
    host:     { type: 'string', default: 'localhost' },
    port:     { type: 'string', default: '5432' },
    database: { type: 'string', default: 'secondlayer_stage' },
    user:     { type: 'string', default: 'secondlayer' },
    password: { type: 'string', default: '' },
    truncate: { type: 'boolean', default: false },
  },
});

const WORKERS = parseInt(args.workers, 10);
const BATCH_SIZE = 200;

const pool = new pg.Pool({
  host: args.host,
  port: parseInt(args.port, 10),
  database: args.database,
  user: args.user,
  password: args.password,
  max: WORKERS + 2,
  idleTimeoutMillis: 30000,
});

// ── Streaming CSV parser that handles multiline quoted fields ──
async function* parseCSV(filePath) {
  const stream = createReadStream(filePath, { encoding: 'utf-8', highWaterMark: 256 * 1024 });

  let buffer = '';
  let headerFields = null;

  for await (const chunk of stream) {
    buffer += chunk;

    while (true) {
      // Find the end of a complete CSV record
      const recordEnd = findRecordEnd(buffer);
      if (recordEnd === -1) break;

      const rawLine = buffer.slice(0, recordEnd);
      // Skip past the newline(s)
      let skip = recordEnd;
      while (skip < buffer.length && (buffer[skip] === '\n' || buffer[skip] === '\r')) skip++;
      buffer = buffer.slice(skip);

      if (!rawLine.trim()) continue;

      const fields = parseCSVFields(rawLine);

      if (!headerFields) {
        headerFields = fields;
        continue;
      }

      // Map to object
      const row = {};
      for (let i = 0; i < headerFields.length; i++) {
        row[headerFields[i]] = fields[i] || '';
      }
      yield row;
    }
  }

  // Process remaining buffer
  if (buffer.trim()) {
    const fields = parseCSVFields(buffer);
    if (headerFields && fields.length === headerFields.length) {
      const row = {};
      for (let i = 0; i < headerFields.length; i++) {
        row[headerFields[i]] = fields[i] || '';
      }
      yield row;
    }
  }
}

// Find the end of a complete CSV record (respecting quoted fields)
function findRecordEnd(buf) {
  let inQuotes = false;
  for (let i = 0; i < buf.length; i++) {
    const ch = buf[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < buf.length && buf[i + 1] === '"') {
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === '\n' || ch === '\r') {
        return i;
      }
    }
  }
  // If we're inside quotes, we need more data
  if (inQuotes) return -1;
  return -1; // Need at least one newline to delimit
}

// Parse CSV fields from a single complete record
function parseCSVFields(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        current += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
        i++;
      } else if (ch === '\r' || ch === '\n') {
        // Newline inside unquoted field = skip
        i++;
      } else {
        current += ch;
        i++;
      }
    }
  }
  fields.push(current);
  return fields;
}

// ── UPSERT SQL ──
const UPSERT_SQL = `
INSERT INTO opensanctions_entities (
  id, schema, name, aliases, birth_date, countries, addresses,
  identifiers, sanctions, phones, emails, program_ids, datasets,
  first_seen, last_seen, last_change
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
ON CONFLICT (id) DO UPDATE SET
  schema = EXCLUDED.schema,
  name = EXCLUDED.name,
  aliases = EXCLUDED.aliases,
  birth_date = EXCLUDED.birth_date,
  countries = EXCLUDED.countries,
  addresses = EXCLUDED.addresses,
  identifiers = EXCLUDED.identifiers,
  sanctions = EXCLUDED.sanctions,
  phones = EXCLUDED.phones,
  emails = EXCLUDED.emails,
  program_ids = EXCLUDED.program_ids,
  datasets = EXCLUDED.datasets,
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
        r.id, r.schema, r.name, r.aliases, r.birth_date,
        r.countries, r.addresses, r.identifiers, r.sanctions,
        r.phones, r.emails, r.program_ids, r.datasets,
        r.first_seen || null, r.last_seen || null, r.last_change || null,
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
  console.log(`OpenSanctions import: file=${args.file}, workers=${WORKERS}`);
  console.log(`DB: ${args.user}@${args.host}:${args.port}/${args.database}`);

  if (args.truncate) {
    const client = await pool.connect();
    await client.query('TRUNCATE opensanctions_entities');
    client.release();
    console.log('Table truncated.');
  }

  let totalRead = 0;
  let inserted = 0;
  let errors = 0;
  let errorSamples = [];
  let batch = [];
  const pending = new Set();
  const startTime = Date.now();

  function logProgress() {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = (inserted / ((Date.now() - startTime) / 1000 || 1)).toFixed(0);
    process.stdout.write(`\r  Read: ${totalRead.toLocaleString()} | Inserted: ${inserted.toLocaleString()} | Errors: ${errors} | Pending: ${pending.size} | ${rate} rec/s | ${elapsed}s`);
  }

  async function flushBatch(records) {
    const p = insertBatch(records)
      .then(() => { inserted += records.length; })
      .catch((err) => {
        errors += records.length;
        if (errorSamples.length < 3) {
          errorSamples.push({ msg: err.message, sample: records[0]?.id });
        }
      })
      .finally(() => { pending.delete(p); });
    pending.add(p);

    while (pending.size >= WORKERS) {
      await Promise.race(pending);
    }
  }

  for await (const row of parseCSV(args.file)) {
    totalRead++;

    const record = {
      id: row.id,
      schema: row.schema,
      name: row.name,
      aliases: row.aliases || null,
      birth_date: row.birth_date || null,
      countries: row.countries || null,
      addresses: row.addresses || null,
      identifiers: row.identifiers || null,
      sanctions: row.sanctions || null,
      phones: row.phones || null,
      emails: row.emails || null,
      program_ids: row.program_ids || null,
      datasets: row.dataset || null,
      first_seen: row.first_seen || null,
      last_seen: row.last_seen || null,
      last_change: row.last_change || null,
    };

    if (!record.id || !record.name) {
      errors++;
      if (errorSamples.length < 3) {
        errorSamples.push({ msg: 'missing id or name', sample: JSON.stringify(row).slice(0, 200) });
      }
      continue;
    }

    batch.push(record);

    if (batch.length >= BATCH_SIZE) {
      await flushBatch(batch);
      batch = [];
      if (totalRead % 5000 < BATCH_SIZE) logProgress();
    }
  }

  if (batch.length > 0) {
    await flushBatch(batch);
  }

  await Promise.all(pending);
  logProgress();

  console.log('\n');
  console.log(`Import complete: ${inserted.toLocaleString()} inserted, ${errors} errors`);
  console.log(`Total time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  if (errorSamples.length > 0) {
    console.log('\nError samples:');
    for (const e of errorSamples) {
      console.log(`  - ${e.msg} (sample: ${e.sample})`);
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

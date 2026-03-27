/**
 * Vectorize ECHR cases, ARMA arrested assets, and NSDC sanctions
 * using VoyageAI voyage-3.5 (1024 dim) → Qdrant.
 *
 * Creates separate Qdrant collections per dataset.
 * Supports resume via checkpoint files.
 *
 * Usage:
 *   VOYAGEAI_API_KEY=... QDRANT_URL=... npx tsx src/scripts/vectorize-datasets.ts [echr|arma|nsdc|all]
 *   CONCURRENCY=10 BATCH_SIZE=50 npx tsx src/scripts/vectorize-datasets.ts all
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { VoyageAIClient } from '../utils/voyage-client.js';
import { Pool } from 'pg';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// ── Config ──────────────────────────────────────────────────────────────────
const EMBEDDING_DIM = 1024;
const VOYAGE_MODEL = 'voyage-3.5';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '50');
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '5');
const CHECKPOINT_DIR = '/tmp/vectorize-checkpoints';
const MAX_CHUNK_CHARS = 2048; // ~512 tokens at 4 chars/token
const CHUNK_OVERLAP_WORDS = 50;

// ── Clients ─────────────────────────────────────────────────────────────────
const voyageClient = new VoyageAIClient(process.env.VOYAGEAI_API_KEY!);
const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333', ...(process.env.QDRANT_API_KEY && { apiKey: process.env.QDRANT_API_KEY }) });
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'secondlayer',
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB || 'secondlayer_prod',
  max: CONCURRENCY + 2,
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function splitIntoChunks(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];

  const chunks: string[] = [];
  const words = text.split(/\s+/);
  let current: string[] = [];
  let currentLen = 0;

  for (const word of words) {
    const wl = word.length + 1;
    if (currentLen + wl > MAX_CHUNK_CHARS && current.length > 0) {
      chunks.push(current.join(' '));
      const overlap = current.slice(-CHUNK_OVERLAP_WORDS);
      current = overlap;
      currentLen = overlap.join(' ').length;
    }
    current.push(word);
    currentLen += wl;
  }
  if (current.length > 0) chunks.push(current.join(' '));
  return chunks;
}

async function ensureCollection(name: string): Promise<void> {
  const collections = await qdrant.getCollections();
  const exists = collections.collections.some((c) => c.name === name);
  if (!exists) {
    await qdrant.createCollection(name, {
      vectors: { size: EMBEDDING_DIM, distance: 'Cosine' },
      on_disk_payload: true,
    });
    console.log(`Created Qdrant collection: ${name}`);
  } else {
    console.log(`Qdrant collection exists: ${name}`);
  }
}

function loadCheckpoint(name: string): Set<string> {
  const path = `${CHECKPOINT_DIR}/${name}.json`;
  if (fs.existsSync(path)) {
    const data = JSON.parse(fs.readFileSync(path, 'utf-8'));
    console.log(`Loaded checkpoint: ${data.length} processed IDs for ${name}`);
    return new Set(data);
  }
  return new Set();
}

function saveCheckpoint(name: string, processedIds: Set<string>): void {
  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  fs.writeFileSync(
    `${CHECKPOINT_DIR}/${name}.json`,
    JSON.stringify(Array.from(processedIds))
  );
}

async function embedAndStore(
  collectionName: string,
  items: Array<{ id: string; chunks: string[]; payload: Record<string, any> }>
): Promise<number> {
  // Flatten all chunks with their parent info
  const allChunks: Array<{ text: string; parentId: string; chunkIdx: number; payload: Record<string, any> }> = [];
  for (const item of items) {
    for (let i = 0; i < item.chunks.length; i++) {
      allChunks.push({ text: item.chunks[i], parentId: item.id, chunkIdx: i, payload: item.payload });
    }
  }

  if (allChunks.length === 0) return 0;

  // Embed in batches
  const texts = allChunks.map((c) => c.text);
  const result = await voyageClient.generateEmbeddingsBatchWithUsage(texts, VOYAGE_MODEL);

  // Upsert to Qdrant
  const points = allChunks.map((chunk, idx) => ({
    id: uuidv4(),
    vector: result.embeddings[idx],
    payload: {
      ...chunk.payload,
      text: chunk.text,
      chunk_index: chunk.chunkIdx,
      total_chunks: items.find((i) => i.id === chunk.parentId)!.chunks.length,
    },
  }));

  // Upsert in sub-batches of 100 points with retry
  for (let i = 0; i < points.length; i += 100) {
    let retries = 3;
    while (retries > 0) {
      try {
        await qdrant.upsert(collectionName, {
          wait: true,
          points: points.slice(i, i + 100),
        });
        break;
      } catch (err: any) {
        retries--;
        if (retries === 0) throw err;
        console.warn(`Qdrant upsert retry (${3 - retries}/3): ${err.message}`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  return result.totalTokens;
}

// ── Dataset processors ──────────────────────────────────────────────────────

async function vectorizeEchr(): Promise<void> {
  const COLLECTION = 'echr_cases';
  await ensureCollection(COLLECTION);
  const processed = loadCheckpoint(COLLECTION);

  const countResult = await pool.query(
    `SELECT count(*) FROM echr_cases WHERE full_text IS NOT NULL AND full_text != ''`
  );
  const total = parseInt(countResult.rows[0].count);
  console.log(`\nECHR cases: ${total} with full_text, ${processed.size} already processed`);

  const PAGE = 100;
  let offset = 0;
  let done = processed.size;
  let totalTokens = 0;

  while (offset < total) {
    const { rows } = await pool.query(
      `SELECT id::text, item_id, app_no, doc_name, respondent, language_iso,
              kp_date, conclusion, importance, doc_type, full_text
       FROM echr_cases
       WHERE full_text IS NOT NULL AND full_text != ''
       ORDER BY id
       LIMIT $1 OFFSET $2`,
      [PAGE, offset]
    );

    if (rows.length === 0) break;
    offset += rows.length;

    // Filter already processed
    const toProcess = rows.filter((r) => !processed.has(r.id));
    if (toProcess.length === 0) continue;

    // Process in batches of BATCH_SIZE items
    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
      const batch = toProcess.slice(i, i + BATCH_SIZE);
      const items = batch.map((row) => ({
        id: row.id,
        chunks: splitIntoChunks(row.full_text),
        payload: {
          source: 'echr',
          doc_id: row.item_id,
          app_no: row.app_no,
          doc_name: row.doc_name,
          respondent: row.respondent,
          language: row.language_iso,
          date: row.kp_date?.toISOString().split('T')[0] || null,
          conclusion: row.conclusion,
          importance: row.importance,
          doc_type: row.doc_type,
        },
      }));

      const tokens = await embedAndStore(COLLECTION, items);
      totalTokens += tokens;

      for (const item of batch) processed.add(item.id);
      done += batch.length;

      if (done % 500 === 0 || done === total) {
        saveCheckpoint(COLLECTION, processed);
        console.log(`  ECHR: ${done}/${total} (${((done / total) * 100).toFixed(1)}%) | tokens: ${totalTokens.toLocaleString()}`);
      }
    }
  }

  saveCheckpoint(COLLECTION, processed);
  console.log(`ECHR complete: ${done} docs, ${totalTokens.toLocaleString()} tokens`);
}

async function vectorizeArma(): Promise<void> {
  const COLLECTION = 'arma_assets';
  await ensureCollection(COLLECTION);
  const processed = loadCheckpoint(COLLECTION);

  const countResult = await pool.query(
    `SELECT count(*) FROM arma_arrested_assets WHERE description IS NOT NULL AND description != ''`
  );
  const total = parseInt(countResult.rows[0].count);
  console.log(`\nARMA assets: ${total} with description, ${processed.size} already processed`);

  const PAGE = 500;
  let offset = 0;
  let done = processed.size;
  let totalTokens = 0;

  while (offset < total) {
    const { rows } = await pool.query(
      `SELECT id::text, description, dectypename, docnum, decisiondate, numerdr
       FROM arma_arrested_assets
       WHERE description IS NOT NULL AND description != ''
       ORDER BY id
       LIMIT $1 OFFSET $2`,
      [PAGE, offset]
    );

    if (rows.length === 0) break;
    offset += rows.length;

    const toProcess = rows.filter((r) => !processed.has(r.id));
    if (toProcess.length === 0) continue;

    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
      const batch = toProcess.slice(i, i + BATCH_SIZE);
      const items = batch.map((row) => ({
        id: row.id,
        chunks: [row.description], // Short descriptions, no chunking needed
        payload: {
          source: 'arma',
          doc_id: row.id,
          description: row.description,
          decision_type: row.dectypename,
          doc_num: row.docnum,
          decision_date: row.decisiondate?.toISOString().split('T')[0] || null,
          register_num: row.numerdr,
        },
      }));

      const tokens = await embedAndStore(COLLECTION, items);
      totalTokens += tokens;

      for (const item of batch) processed.add(item.id);
      done += batch.length;

      if (done % 5000 === 0 || done === total) {
        saveCheckpoint(COLLECTION, processed);
        console.log(`  ARMA: ${done}/${total} (${((done / total) * 100).toFixed(1)}%) | tokens: ${totalTokens.toLocaleString()}`);
      }
    }
  }

  saveCheckpoint(COLLECTION, processed);
  console.log(`ARMA complete: ${done} docs, ${totalTokens.toLocaleString()} tokens`);
}

async function vectorizeNsdc(): Promise<void> {
  const COLLECTION = 'nsdc_sanctions';
  await ensureCollection(COLLECTION);
  const processed = loadCheckpoint(COLLECTION);

  const countResult = await pool.query(
    `SELECT count(*) FROM nsdc_sanctions_subjects WHERE caption IS NOT NULL AND caption != ''`
  );
  const total = parseInt(countResult.rows[0].count);
  console.log(`\nNSDC sanctions: ${total} with caption, ${processed.size} already processed`);

  const PAGE = 500;
  let offset = 0;
  let done = processed.size;
  let totalTokens = 0;

  while (offset < total) {
    const { rows } = await pool.query(
      `SELECT id, caption, schema, names, aliases, citizenships, countries,
              addresses, sanctions_status, program_ids
       FROM nsdc_sanctions_subjects
       WHERE caption IS NOT NULL AND caption != ''
       ORDER BY id
       LIMIT $1 OFFSET $2`,
      [PAGE, offset]
    );

    if (rows.length === 0) break;
    offset += rows.length;

    const toProcess = rows.filter((r) => !processed.has(r.id));
    if (toProcess.length === 0) continue;

    for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
      const batch = toProcess.slice(i, i + BATCH_SIZE);
      const items = batch.map((row) => {
        // Combine all text fields for rich embedding
        const textParts = [
          row.caption,
          ...(row.names || []),
          ...(row.aliases || []),
          ...(row.addresses || []),
        ].filter(Boolean);
        const text = textParts.join(' | ');

        return {
          id: row.id,
          chunks: [text],
          payload: {
            source: 'nsdc',
            doc_id: row.id,
            caption: row.caption,
            schema: row.schema,
            names: row.names || [],
            aliases: row.aliases || [],
            citizenships: row.citizenships || [],
            countries: row.countries || [],
            sanctions_status: row.sanctions_status,
            program_ids: row.program_ids || [],
          },
        };
      });

      const tokens = await embedAndStore(COLLECTION, items);
      totalTokens += tokens;

      for (const item of batch) processed.add(item.id);
      done += batch.length;

      if (done % 2000 === 0 || done === total) {
        saveCheckpoint(COLLECTION, processed);
        console.log(`  NSDC: ${done}/${total} (${((done / total) * 100).toFixed(1)}%) | tokens: ${totalTokens.toLocaleString()}`);
      }
    }
  }

  saveCheckpoint(COLLECTION, processed);
  console.log(`NSDC complete: ${done} docs, ${totalTokens.toLocaleString()} tokens`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const target = process.argv[2] || 'all';

  console.log('=== Vectorize Datasets ===');
  console.log(`Model: ${VOYAGE_MODEL} (${EMBEDDING_DIM}d)`);
  console.log(`Batch: ${BATCH_SIZE}, Concurrency: ${CONCURRENCY}`);
  console.log(`Target: ${target}`);
  console.log(`Qdrant: ${process.env.QDRANT_URL || 'http://localhost:6333'}`);

  // Verify connectivity
  const collections = await qdrant.getCollections();
  console.log(`Qdrant connected (${collections.collections.length} collections)`);

  const pgResult = await pool.query('SELECT 1');
  console.log('PostgreSQL connected');

  const startTime = Date.now();

  if (target === 'echr' || target === 'all') await vectorizeEchr();
  if (target === 'arma' || target === 'all') await vectorizeArma();
  if (target === 'nsdc' || target === 'all') await vectorizeNsdc();

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n=== Done in ${elapsed} minutes ===`);

  // Print final collection stats
  for (const name of ['echr_cases', 'arma_assets', 'nsdc_sanctions']) {
    try {
      const info = await qdrant.getCollection(name);
      console.log(`  ${name}: ${info.points_count} vectors`);
    } catch {
      // Collection may not exist if not processed
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

/**
 * Reindex Embeddings — migrate from voyage-multilingual-2 to voyage-3.5
 *
 * Scrolls all points in the Qdrant 'legal_sections' collection, regenerates
 * embeddings using the configured VoyageAI model, and upserts them back.
 *
 * Parallelism: REINDEX_CONCURRENCY workers process embed sub-batches concurrently.
 * Pipeline: next Qdrant page is pre-fetched while current page is being processed.
 *
 * Checkpoint/resume: saves progress to /tmp/reindex-checkpoint.json
 *
 * Environment variables (read from .env):
 *   VOYAGEAI_API_KEY          - Required
 *   VOYAGEAI_EMBEDDING_MODEL  - Model to use (default: voyage-3.5)
 *   QDRANT_URL                - Qdrant URL (default: http://localhost:6333)
 *   REINDEX_CONCURRENCY       - Parallel VoyageAI workers (default: 10)
 *   REINDEX_EMBED_BATCH       - Texts per VoyageAI call (default: 50)
 *
 * Usage:
 *   npm run reindex:embeddings
 *   REINDEX_CONCURRENCY=5 npm run reindex:embeddings
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const VOYAGEAI_API_KEY = process.env.VOYAGEAI_API_KEY!;
const VOYAGE_MODEL = process.env.VOYAGEAI_EMBEDDING_MODEL || 'voyage-3.5';
const QDRANT_URL = (process.env.QDRANT_URL || 'http://localhost:6333').replace(
  'qdrant-local',
  'localhost'
);
const COLLECTION = 'legal_sections';
const CONCURRENCY = parseInt(process.env.REINDEX_CONCURRENCY || '10', 10);
const EMBED_BATCH = parseInt(process.env.REINDEX_EMBED_BATCH || '50', 10);
// Fetch CONCURRENCY * EMBED_BATCH points per page so one page = exactly CONCURRENCY sub-batches
const SCROLL_BATCH = CONCURRENCY * EMBED_BATCH;
const CHECKPOINT_FILE = '/tmp/reindex-checkpoint.json';
const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const MAX_RETRIES = 4;

// ─── Types ────────────────────────────────────────────────────────────────────

interface QdrantPoint {
  id: string;
  payload: Record<string, any>;
}

interface QdrantScrollResult {
  result: { points: QdrantPoint[]; next_page_offset: string | null };
  status: string;
}

interface VoyageResponse {
  data: Array<{ embedding: number[]; index: number }>;
  usage: { total_tokens: number };
  model: string;
}

interface Checkpoint {
  offset: string | null;
  processed: number;
  totalTokens: number;
  startedAt: string;
}

// ─── Checkpoint ───────────────────────────────────────────────────────────────

function loadCheckpoint(): Checkpoint | null {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf-8')) as Checkpoint;
    }
  } catch { /* ignore */ }
  return null;
}

function saveCheckpoint(cp: Checkpoint): void {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp, null, 2));
}

function clearCheckpoint(): void {
  if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);
}

// ─── VoyageAI ────────────────────────────────────────────────────────────────

async function embedBatch(texts: string[]): Promise<{ embeddings: number[][]; tokens: number }> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(VOYAGE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${VOYAGEAI_API_KEY}`,
        },
        body: JSON.stringify({ input: texts, model: VOYAGE_MODEL }),
      });

      if (!resp.ok) {
        const body = await resp.text();
        const err: any = new Error(`VoyageAI ${resp.status}: ${body}`);
        err.status = resp.status;
        throw err;
      }

      const data = (await resp.json()) as VoyageResponse;
      const embeddings = data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
      return { embeddings, tokens: data.usage?.total_tokens ?? 0 };
    } catch (err: any) {
      lastError = err;
      if (err.status === 429) {
        const delay = Math.pow(2, attempt) * 2000;
        process.stdout.write(`\n  Rate limited, backing off ${delay / 1000}s…`);
        await sleep(delay);
        continue;
      }
      if (attempt < MAX_RETRIES - 1) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new Error('VoyageAI: max retries exceeded');
}

// ─── Qdrant ───────────────────────────────────────────────────────────────────

async function scrollPoints(offset: string | null): Promise<QdrantScrollResult['result']> {
  const body: any = { limit: SCROLL_BATCH, with_payload: true, with_vector: false };
  if (offset) body.offset = offset;

  const resp = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) throw new Error(`Qdrant scroll ${resp.status}: ${await resp.text()}`);
  return ((await resp.json()) as QdrantScrollResult).result;
}

async function upsertPoints(
  points: Array<{ id: string; vector: number[]; payload: Record<string, any> }>
): Promise<void> {
  const resp = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points?wait=true`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
  });

  if (!resp.ok) throw new Error(`Qdrant upsert ${resp.status}: ${await resp.text()}`);
}

// ─── Concurrency helpers ──────────────────────────────────────────────────────

/** Run tasks with a fixed-size worker pool */
async function runPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const iter = items[Symbol.iterator]();
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (let item = iter.next(); !item.done; item = iter.next()) {
      await fn(item.value);
    }
  });
  await Promise.all(workers);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!VOYAGEAI_API_KEY) {
    console.error('ERROR: VOYAGEAI_API_KEY is not set');
    process.exit(1);
  }

  const infoData = (await (await fetch(`${QDRANT_URL}/collections/${COLLECTION}`)).json()) as any;
  const totalPoints: number = infoData.result?.points_count ?? 0;

  console.log(`\n══════════════════════════════════════════`);
  console.log(`  Reindex Embeddings → ${VOYAGE_MODEL}`);
  console.log(`══════════════════════════════════════════`);
  console.log(`  Qdrant:      ${QDRANT_URL}`);
  console.log(`  Collection:  ${COLLECTION}`);
  console.log(`  Total:       ${totalPoints.toLocaleString()} points`);
  console.log(`  Workers:     ${CONCURRENCY} parallel`);
  console.log(`  Page size:   ${SCROLL_BATCH} pts (${CONCURRENCY} × ${EMBED_BATCH})`);
  console.log(`══════════════════════════════════════════\n`);

  let cp = loadCheckpoint();
  if (cp) {
    console.log(`Resuming from checkpoint: ${cp.processed.toLocaleString()} processed, offset=${cp.offset}\n`);
  } else {
    cp = { offset: null, processed: 0, totalTokens: 0, startedAt: new Date().toISOString() };
  }

  // Shared atomic-style counters (single-threaded JS, no races)
  let processed = cp.processed;
  let totalTokens = cp.totalTokens;
  const startTime = Date.now();

  const printProgress = () => {
    const elapsed = Date.now() - startTime;
    const rate = processed / Math.max(elapsed / 1000, 1);
    const remaining = totalPoints - processed;
    const etaMs = rate > 0 ? (remaining / rate) * 1000 : 0;
    const pct = ((processed / totalPoints) * 100).toFixed(1);
    process.stdout.write(
      `\r  [${pct}%] ${processed.toLocaleString()}/${totalPoints.toLocaleString()} pts` +
        ` | ${rate.toFixed(1)} pts/s | ETA: ${formatDuration(etaMs)}` +
        ` | ~${totalTokens.toLocaleString()} tokens   `
    );
  };

  // Fetch first page
  let pageData = await scrollPoints(cp.offset);

  while (pageData.points.length > 0) {
    const { points, next_page_offset } = pageData;

    // Start pre-fetching next page immediately (pipeline)
    const nextPagePromise = next_page_offset ? scrollPoints(next_page_offset) : Promise.resolve(null);

    // Split current page into EMBED_BATCH sub-batches
    const subBatches = chunk(points, EMBED_BATCH);

    // Process all sub-batches with CONCURRENCY workers
    await runPool(subBatches, CONCURRENCY, async (subBatch) => {
      const texts = subBatch.map((p) => String(p.payload?.text || ''));

      const { embeddings, tokens } = await embedBatch(texts);

      const upsertData = subBatch.map((point, idx) => ({
        id: point.id,
        vector: embeddings[idx],
        payload: point.payload,
      }));

      await upsertPoints(upsertData);

      // Update counters (safe: JS is single-threaded, Promise.all just interleaves awaits)
      processed += subBatch.length;
      totalTokens += tokens;
      printProgress();
    });

    // Save checkpoint with next page offset
    cp.processed = processed;
    cp.totalTokens = totalTokens;
    cp.offset = next_page_offset;
    saveCheckpoint(cp);

    if (!next_page_offset) break;

    // Await pre-fetched next page
    const next = await nextPagePromise;
    if (!next || next.points.length === 0) break;
    pageData = next;
  }

  const elapsed = Date.now() - startTime;
  const costUsd = (totalTokens / 1_000_000) * 0.06;

  console.log(`\n\n══════════════════════════════════════════`);
  console.log(`  Done!`);
  console.log(`  Processed: ${processed.toLocaleString()} points`);
  console.log(`  Tokens:    ${totalTokens.toLocaleString()}`);
  console.log(`  Cost est:  $${costUsd.toFixed(4)} (voyage-3.5 @ $0.06/1M)`);
  console.log(`  Duration:  ${formatDuration(elapsed)}`);
  console.log(`══════════════════════════════════════════\n`);

  clearCheckpoint();
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});

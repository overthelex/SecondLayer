/**
 * Reindex Qdrant vectors for a specific user's documents.
 *
 * Usage:
 *   REINDEX_USER_ID=<uuid> node dist/scripts/reindex-user-docs.js
 *
 * Optional env:
 *   REINDEX_CONCURRENCY=3   — parallel docs (default 3)
 *   REINDEX_DRY_RUN=true    — count only, no writes
 */

import * as pg from 'pg';
import { QdrantClient } from '@qdrant/js-client-rest';
import { v4 as uuidv4 } from 'uuid';

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = process.env.VOYAGEAI_EMBEDDING_MODEL || 'voyage-3.5';
const VOYAGE_BATCH_SIZE = 50;
const MAX_CHUNK_TOKENS = 512;
const CHUNK_OVERLAP = 50;

// ── Config ──────────────────────────────────────────────────────────
const USER_ID = process.env.REINDEX_USER_ID;
if (!USER_ID) {
  console.error('REINDEX_USER_ID is required');
  process.exit(1);
}

const CONCURRENCY = parseInt(process.env.REINDEX_CONCURRENCY || '3', 10);
const DRY_RUN = process.env.REINDEX_DRY_RUN === 'true';
const VOYAGEAI_API_KEY = process.env.VOYAGEAI_API_KEY;
if (!VOYAGEAI_API_KEY && !DRY_RUN) {
  console.error('VOYAGEAI_API_KEY is required (unless DRY_RUN=true)');
  process.exit(1);
}

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const DATABASE_URL = process.env.DATABASE_URL;

// ── Helpers ─────────────────────────────────────────────────────────

async function voyageEmbed(texts: string[]): Promise<number[][]> {
  const allEmbeddings: number[][] = [];
  for (let i = 0; i < texts.length; i += VOYAGE_BATCH_SIZE) {
    const batch = texts.slice(i, i + VOYAGE_BATCH_SIZE);
    const res = await fetch(VOYAGE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${VOYAGEAI_API_KEY}`,
      },
      body: JSON.stringify({ input: batch, model: VOYAGE_MODEL }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`VoyageAI ${res.status}: ${body}`);
    }
    const data: any = await res.json();
    const sorted = data.data.sort((a: any, b: any) => a.index - b.index);
    allEmbeddings.push(...sorted.map((d: any) => d.embedding));
  }
  return allEmbeddings;
}

function splitIntoChunks(text: string): string[] {
  const chunks: string[] = [];
  const words = text.split(/\s+/);
  let currentChunk: string[] = [];
  let currentLength = 0;

  for (const word of words) {
    const wordLength = word.length + 1;
    if (currentLength + wordLength > MAX_CHUNK_TOKENS * 4) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join(' '));
        const overlapWords = currentChunk.slice(-CHUNK_OVERLAP);
        currentChunk = overlapWords;
        currentLength = overlapWords.join(' ').length;
      }
    }
    currentChunk.push(word);
    currentLength += wordLength;
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '));
  }
  return chunks;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const qdrant = new QdrantClient({ url: QDRANT_URL, ...(process.env.QDRANT_API_KEY && { apiKey: process.env.QDRANT_API_KEY }) });

  // 1. Get all active docs with text for this user
  const { rows: docs } = await pool.query(
    `SELECT d.id, d.title, d.type, d.full_text, d.metadata, d.matter_id,
            length(d.full_text) as text_len
     FROM documents d
     WHERE d.user_id = $1 AND d.deleted_at IS NULL
       AND d.full_text IS NOT NULL AND length(d.full_text) > 0
     ORDER BY d.created_at`,
    [USER_ID]
  );

  console.log(`Found ${docs.length} documents with text for user ${USER_ID}`);
  if (DRY_RUN) {
    console.log('DRY_RUN — exiting');
    await pool.end();
    return;
  }

  // 2. Get sections for all docs
  const { rows: allSections } = await pool.query(
    `SELECT ds.document_id, ds.section_type, ds.text
     FROM document_sections ds
     JOIN documents d ON ds.document_id = d.id
     WHERE d.user_id = $1 AND d.deleted_at IS NULL
     ORDER BY ds.document_id, ds.start_index`,
    [USER_ID]
  );

  const sectionsByDoc = new Map<string, Array<{ section_type: string; text: string }>>();
  for (const s of allSections) {
    if (!sectionsByDoc.has(s.document_id)) sectionsByDoc.set(s.document_id, []);
    sectionsByDoc.get(s.document_id)!.push({ section_type: s.section_type, text: s.text });
  }

  console.log(`Loaded ${allSections.length} sections across ${sectionsByDoc.size} documents`);

  let processed = 0;
  let errors = 0;
  let totalPoints = 0;

  // 3. Process docs with concurrency limit
  const queue = [...docs];

  async function processDoc(doc: any) {
    const docId = doc.id;
    const fullText: string = doc.full_text;
    const sections = sectionsByDoc.get(docId) || [];
    const metadata: any = doc.metadata || {};

    try {
      // Delete existing Qdrant points for this doc
      await qdrant.delete('legal_sections', {
        filter: { must: [{ key: 'doc_id', match: { value: docId } }] },
      });

      // Build texts to embed
      const textsToEmbed: string[] = [fullText.slice(0, 8000)];
      for (const s of sections) {
        textsToEmbed.push(s.text.slice(0, 8000));
      }

      // Chunk documents >= 1000 chars for better granular search
      let chunks: string[] = [];
      if (fullText.length >= 1000) {
        chunks = splitIntoChunks(fullText);
        // Skip chunking if only 1 chunk produced (no benefit)
        if (chunks.length <= 1) chunks = [];
        for (const c of chunks) {
          textsToEmbed.push(c.slice(0, 8000));
        }
      }

      // Embed all at once
      const embeddings = await voyageEmbed(textsToEmbed);

      // Build Qdrant points
      const points: any[] = [];

      const basePayload: any = {
        doc_id: docId,
        date: metadata.date || new Date().toISOString(),
        court: null,
        case_number: null,
        chamber: null,
        dispute_category: null,
        outcome: null,
        deviation_flag: null,
        precedent_status: null,
        law_articles: [],
      };

      if (doc.matter_id) {
        basePayload.matter_id = doc.matter_id;
      }

      // Full text point (id = docId)
      points.push({
        id: docId,
        vector: embeddings[0],
        payload: { ...basePayload, section_type: 'FACTS', text: fullText.slice(0, 1000) },
      });

      // Section points
      for (let i = 0; i < sections.length; i++) {
        points.push({
          id: uuidv4(),
          vector: embeddings[1 + i],
          payload: {
            ...basePayload,
            section_type: sections[i].section_type,
            text: sections[i].text.slice(0, 1000),
          },
        });
      }

      // Chunk points
      for (let i = 0; i < chunks.length; i++) {
        points.push({
          id: uuidv4(),
          vector: embeddings[1 + sections.length + i],
          payload: { ...basePayload, section_type: 'CHUNK', text: chunks[i].slice(0, 1000) },
        });
      }

      // Upsert in batches of 100
      for (let i = 0; i < points.length; i += 100) {
        await qdrant.upsert('legal_sections', {
          wait: true,
          points: points.slice(i, i + 100),
        });
      }

      totalPoints += points.length;
      processed++;
      console.log(
        `[${processed}/${docs.length}] ${doc.title?.slice(0, 60)} — ${points.length} points (${sections.length} sections, ${chunks.length} chunks)`
      );
    } catch (err: any) {
      errors++;
      processed++;
      console.error(`[${processed}/${docs.length}] ERROR ${doc.title?.slice(0, 60)}: ${err.message}`);
    }
  }

  // Run with concurrency
  async function runQueue() {
    while (queue.length > 0) {
      const doc = queue.shift()!;
      await processDoc(doc);
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => runQueue());
  await Promise.all(workers);

  console.log(`\nDone! Processed: ${processed}, Errors: ${errors}, Total Qdrant points: ${totalPoints}`);
  await pool.end();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

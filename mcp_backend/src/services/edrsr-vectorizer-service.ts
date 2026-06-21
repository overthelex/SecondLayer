/**
 * EdsrVectorizerService — On-demand vectorization of EDRSR court decisions.
 *
 * When a search returns EDRSR doc_ids, this service checks if they have vectors
 * in Qdrant. If not, it fetches fulltext from PG, chunks, embeds with BGE-M3
 * in parallel batches, and stores in a dedicated `edrsr_decisions` Qdrant collection.
 *
 * Uses BGE-M3 (1024-dim) via self-hosted HuggingFace TEI endpoint.
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { BgeM3Client, EmbeddingBatchResult } from '../utils/bge-m3-client.js';
import { logger } from '../utils/logger.js';
import { Semaphore } from '../utils/semaphore.js';
import { v4 as uuidv4 } from 'uuid';

// ── Constants ────────────────────────────────────────────────────────────────

const EMBEDDING_DIM = 1024;
const EMBEDDING_MODEL = 'bge-m3';
// Default to the live unified collection. The old `edrsr_decisions` collection
// was deleted at the edrsr_serving cutover (2026-06-21); defaulting to it would
// make semantic search silently return nothing if the env var is ever missing.
const COLLECTION_NAME = process.env.QDRANT_EDRSR_COLLECTION || 'edrsr_serving';
const EMBED_BATCH_SIZE = 64; // TEI supports larger batches than VoyageAI
const QDRANT_UPSERT_BATCH = 100; // Qdrant upsert sub-batch
const DEFAULT_CONCURRENCY = 5;
const MAX_CHUNK_CHARS = 2048;
const CHUNK_OVERLAP_WORDS = 50;

// ── Types ────────────────────────────────────────────────────────────────────

export interface EdrsrDocument {
  doc_id: number;
  full_text: string;
  metadata: EdrsrDocMetadata;
}

export interface EdrsrDocMetadata {
  court_code?: number;
  judge?: string;
  cause_num?: string;
  justice_kind?: number;
  adjudication_date?: string;
  judgment_code?: number;
  category_code?: number;
}

export interface EdrsrSearchResult {
  id: string;
  score: number;
  text: string;
  doc_id: number;
  chunk_index: number;
  metadata: EdrsrDocMetadata;
}

export interface EdrsrSearchFilters {
  court_code?: number;
  justice_kind?: number;
  date_from?: string;
  date_to?: string;
  judge?: string;
}

export interface EdrsrVectorizationStats {
  total_points: number;
  collection_exists: boolean;
}

export type EmbeddingUsageCallback = (tokens: number, model: string, task: string) => void;

// ── Chunking ─────────────────────────────────────────────────────────────────

function chunkText(text: string, maxChars = MAX_CHUNK_CHARS, overlapWords = CHUNK_OVERLAP_WORDS): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);

    // Try to break at sentence boundary
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('.', end);
      if (lastPeriod > start + maxChars * 0.5) end = lastPeriod + 1;
    }

    chunks.push(text.slice(start, end));

    if (end >= text.length) break;

    // Overlap: go back by overlapWords words
    const words = text.slice(start, end).split(/\s+/);
    const overlapText = words.slice(-overlapWords).join(' ');
    const newStart = end - overlapText.length;

    // Safety: always advance by at least half the chunk size to prevent infinite loops
    // (can happen when text has ≤50 very long words, making overlap ≥ chunk size)
    start = Math.max(newStart, start + Math.floor(maxChars / 2));

    if (start >= text.length - 100) break; // Don't create tiny last chunk
  }

  return chunks;
}

// ── Service ──────────────────────────────────────────────────────────────────

export class EdsrVectorizerService {
  private embeddingClient: BgeM3Client;
  private qdrant: QdrantClient;
  private initialized = false;
  private usageCallback?: EmbeddingUsageCallback;
  private concurrency: number;

  constructor(concurrency: number = DEFAULT_CONCURRENCY) {
    const bgeUrl = process.env.BGE_M3_URL;
    if (!bgeUrl) {
      throw new Error('BGE_M3_URL is required for EdsrVectorizerService');
    }
    this.embeddingClient = new BgeM3Client(bgeUrl);

    const qdrantUrl = process.env.QDRANT_EDRSR_URL || process.env.QDRANT_URL || 'http://localhost:6333';
    const qdrantApiKey = process.env.QDRANT_EDRSR_API_KEY || process.env.QDRANT_API_KEY;
    // Cap request duration so a rare disk-bound stall on the large on-disk
    // `edrsr_serving` collection fails fast and the caller can degrade to FTS,
    // instead of hanging until the upstream 60s timeout and surfacing a 500.
    const qdrantTimeoutMs = Number(process.env.QDRANT_EDRSR_TIMEOUT_MS || 12000);
    this.qdrant = new QdrantClient({
      url: qdrantUrl,
      timeout: qdrantTimeoutMs,
      ...(qdrantApiKey && { apiKey: qdrantApiKey }),
    });

    this.concurrency = concurrency;
    logger.info('[EdsrVectorizer] initialized', { collection: COLLECTION_NAME, qdrantUrl });
  }

  setUsageCallback(cb: EmbeddingUsageCallback | undefined): void {
    this.usageCallback = cb;
  }

  // ── Initialization ───────────────────────────────────────────────────────

  /**
   * Lazy initialization: create the EDRSR collection on first use.
   */
  private async ensureCollection(): Promise<void> {
    if (this.initialized) return;

    try {
      const collections = await this.qdrant.getCollections();
      const exists = collections.collections.some((c) => c.name === COLLECTION_NAME);

      if (exists) {
        // Verify dimension matches
        const info = await this.qdrant.getCollection(COLLECTION_NAME);
        const currentSize = (info.config?.params?.vectors as any)?.size;
        if (currentSize && currentSize !== EMBEDDING_DIM) {
          logger.warn(`[EdsrVectorizer] Collection ${COLLECTION_NAME} has dimension ${currentSize}, expected ${EMBEDDING_DIM}. Recreating.`);
          await this.qdrant.deleteCollection(COLLECTION_NAME);
          await this._createCollection();
        } else {
          logger.info(`[EdsrVectorizer] Collection ${COLLECTION_NAME} exists (${info.points_count} points)`);
        }
      } else {
        await this._createCollection();
      }

      // Create payload indexes for filterable fields
      await this._ensurePayloadIndexes();

      this.initialized = true;
    } catch (error) {
      logger.error('[EdsrVectorizer] Failed to initialize collection:', error);
      throw error;
    }
  }

  private async _createCollection(): Promise<void> {
    await this.qdrant.createCollection(COLLECTION_NAME, {
      vectors: { size: EMBEDDING_DIM, distance: 'Cosine' },
      on_disk_payload: true,
    });
    logger.info(`[EdsrVectorizer] Created Qdrant collection: ${COLLECTION_NAME}`);
  }

  private async _ensurePayloadIndexes(): Promise<void> {
    const indexes: Array<{ field: string; schema: any }> = [
      { field: 'edrsr_doc_id', schema: { type: 'integer', lookup: true, is_principal: true } },
      { field: 'court_code', schema: { type: 'integer', lookup: true } },
      { field: 'justice_kind', schema: { type: 'integer', lookup: true } },
      { field: 'adjudication_date', schema: { type: 'keyword', lookup: true } },
      { field: 'judge', schema: { type: 'keyword', lookup: true } },
    ];

    for (const idx of indexes) {
      try {
        await this.qdrant.createPayloadIndex(COLLECTION_NAME, {
          field_name: idx.field,
          field_schema: idx.schema.type as any,
          wait: false,
        });
      } catch {
        // Index may already exist — non-critical
      }
    }
  }

  // ── Core: ensureVectorized ─────────────────────────────────────────────

  /**
   * Check which doc_ids already have vectors in Qdrant, vectorize missing ones.
   * Returns a map of doc_id → array of Qdrant point IDs.
   */
  async ensureVectorized(docIds: number[], dbPool: any): Promise<Map<number, string[]>> {
    if (docIds.length === 0) return new Map();

    await this.ensureCollection();

    const result = new Map<number, string[]>();

    // 1. Check Qdrant for existing vectors
    const existingMap = await this._findExistingVectors(docIds);

    // Separate found vs missing
    const missingDocIds: number[] = [];
    for (const docId of docIds) {
      if (existingMap.has(docId)) {
        result.set(docId, existingMap.get(docId)!);
      } else {
        missingDocIds.push(docId);
      }
    }

    if (missingDocIds.length === 0) {
      logger.info(`[EdsrVectorizer] All ${docIds.length} doc_ids already vectorized`);
      return result;
    }

    logger.info(`[EdsrVectorizer] ${existingMap.size}/${docIds.length} already vectorized, ${missingDocIds.length} to process`);

    // 2. Fetch fulltext from PG for missing doc_ids
    const docs = await this._fetchDocuments(missingDocIds, dbPool);

    if (docs.length === 0) {
      logger.warn(`[EdsrVectorizer] No fulltext found for ${missingDocIds.length} doc_ids`);
      return result;
    }

    // 3. Vectorize in parallel batches
    const semaphore = new Semaphore(this.concurrency);
    const batchSize = this.concurrency;
    const vectorizePromises: Promise<void>[] = [];

    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = docs.slice(i, i + batchSize);
      const promise = (async () => {
        const release = await semaphore.acquire();
        try {
          const pointIds = await this._vectorizeBatch(batch);
          // Collect results
          pointIds.forEach((ids, docId) => {
            result.set(docId, ids);
          });
        } finally {
          release();
        }
      })();
      vectorizePromises.push(promise);
    }

    await Promise.all(vectorizePromises);

    logger.info(`[EdsrVectorizer] Vectorized ${docs.length} documents (${result.size} total with cache)`);
    return result;
  }

  // ── Core: vectorizeDocuments ───────────────────────────────────────────

  /**
   * Chunk, embed, and store documents in Qdrant.
   * For bulk ingestion — caller provides full_text and metadata.
   */
  async vectorizeDocuments(docs: EdrsrDocument[]): Promise<void> {
    if (docs.length === 0) return;

    await this.ensureCollection();

    const semaphore = new Semaphore(this.concurrency);
    const batchSize = this.concurrency;
    const promises: Promise<void>[] = [];

    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = docs.slice(i, i + batchSize);
      const promise = (async () => {
        const release = await semaphore.acquire();
        try {
          await this._vectorizeBatch(batch);
        } finally {
          release();
        }
      })();
      promises.push(promise);
    }

    await Promise.all(promises);

    logger.info(`[EdsrVectorizer] vectorizeDocuments complete: ${docs.length} documents`);
  }

  // ── Core: semanticSearch ───────────────────────────────────────────────

  /**
   * Embed query and search edrsr_decisions collection with metadata filters.
   */
  async semanticSearch(
    query: string,
    filters?: EdrsrSearchFilters,
    limit: number = 10
  ): Promise<EdrsrSearchResult[]> {
    await this.ensureCollection();

    // Embed query
    const result = await this.embeddingClient.generateEmbeddingsBatchWithUsage([query]);
    this.usageCallback?.(result.totalTokens, EMBEDDING_MODEL, 'edrsr_semantic_search');
    const queryVector = result.embeddings[0];

    // Build Qdrant filter
    const must: any[] = [];

    if (filters?.court_code) {
      must.push({ key: 'court_code', match: { value: filters.court_code } });
    }

    if (filters?.justice_kind) {
      must.push({ key: 'justice_kind', match: { value: filters.justice_kind } });
    }

    if (filters?.judge) {
      must.push({ key: 'judge', match: { text: filters.judge } });
    }

    if (filters?.date_from || filters?.date_to) {
      const range: any = {};
      if (filters?.date_from) range.gte = filters.date_from;
      if (filters?.date_to) range.lte = filters.date_to;
      must.push({ key: 'adjudication_date', range });
    }

    const qdrantFilter = must.length > 0 ? { must } : undefined;

    try {
      const searchResult = await this.qdrant.search(COLLECTION_NAME, {
        vector: queryVector,
        limit,
        filter: qdrantFilter,
        with_payload: true,
        // `edrsr_serving` keeps full vectors on disk with binary quantization in
        // RAM. Rescore re-reads full f32 vectors from the gp3 volume and stalls
        // past the request timeout under concurrency, so it defaults OFF —
        // scoring runs from the in-RAM quantized vectors with a wider hnsw_ef to
        // recover recall. Set QDRANT_EDRSR_RESCORE=true to restore full-vector
        // rescore with oversampling (higher recall, disk-bound under load).
        params: {
          hnsw_ef: Number(process.env.QDRANT_EDRSR_HNSW_EF || 128),
          quantization:
            process.env.QDRANT_EDRSR_RESCORE === 'true'
              ? { rescore: true, oversampling: Number(process.env.QDRANT_EDRSR_OVERSAMPLING || 2.0) }
              : { rescore: false },
        },
      });

      return searchResult.map((r) => ({
        id: r.id as string,
        score: r.score,
        text: (r.payload?.text as string) || '',
        doc_id: (r.payload?.edrsr_doc_id as number) || 0,
        chunk_index: (r.payload?.chunk_index as number) || 0,
        metadata: {
          court_code: r.payload?.court_code as number | undefined,
          judge: r.payload?.judge as string | undefined,
          cause_num: r.payload?.cause_num as string | undefined,
          justice_kind: r.payload?.justice_kind as number | undefined,
          adjudication_date: r.payload?.adjudication_date as string | undefined,
          judgment_code: r.payload?.judgment_code as number | undefined,
          category_code: r.payload?.category_code as number | undefined,
        },
      }));
    } catch (error) {
      logger.error('[EdsrVectorizer] semanticSearch failed:', error);
      throw error;
    }
  }

  // ── Core: getVectorizationStats ────────────────────────────────────────

  /**
   * Return stats from the edrsr_decisions Qdrant collection.
   */
  async getVectorizationStats(): Promise<EdrsrVectorizationStats> {
    try {
      const collections = await this.qdrant.getCollections();
      const exists = collections.collections.some((c) => c.name === COLLECTION_NAME);

      if (!exists) {
        return { total_points: 0, collection_exists: false };
      }

      const info = await this.qdrant.getCollection(COLLECTION_NAME);
      return {
        total_points: info.points_count || 0,
        collection_exists: true,
      };
    } catch (error) {
      logger.error('[EdsrVectorizer] getVectorizationStats failed:', error);
      return { total_points: 0, collection_exists: false };
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────

  /**
   * Scroll Qdrant for existing vectors matching the given doc_ids.
   * Returns map of doc_id → array of point IDs.
   */
  private async _findExistingVectors(docIds: number[]): Promise<Map<number, string[]>> {
    const existingMap = new Map<number, string[]>();

    // Query in batches to avoid huge filter clauses
    const SCROLL_BATCH = 100;
    for (let i = 0; i < docIds.length; i += SCROLL_BATCH) {
      const batchIds = docIds.slice(i, i + SCROLL_BATCH);

      try {
        const scrollResult = await this.qdrant.scroll(COLLECTION_NAME, {
          filter: {
            should: batchIds.map((id) => ({
              key: 'edrsr_doc_id',
              match: { value: id },
            })),
          },
          limit: batchIds.length * 20, // Up to 20 chunks per doc
          with_payload: { include: ['edrsr_doc_id'] },
          with_vector: false,
        });

        for (const point of scrollResult.points) {
          const docId = point.payload?.edrsr_doc_id as number;
          if (docId !== undefined) {
            if (!existingMap.has(docId)) {
              existingMap.set(docId, []);
            }
            existingMap.get(docId)!.push(point.id as string);
          }
        }
      } catch (error) {
        logger.warn('[EdsrVectorizer] Scroll check failed for batch, treating as missing', { error });
      }
    }

    return existingMap;
  }

  /**
   * Fetch fulltext and metadata from PG for given doc_ids.
   */
  private async _fetchDocuments(docIds: number[], dbPool: any): Promise<EdrsrDocument[]> {
    const docs: EdrsrDocument[] = [];

    // Query in batches of 500 to avoid parameter limit issues
    const PG_BATCH = 500;
    for (let i = 0; i < docIds.length; i += PG_BATCH) {
      const batchIds = docIds.slice(i, i + PG_BATCH);

      try {
        const result = await dbPool.query(
          `SELECT
            d.doc_id, d.cause_num, d.judge, d.court_code, d.justice_kind,
            d.judgment_code, d.category_code, d.adjudication_date,
            f.full_text
          FROM edrsr_documents d
          INNER JOIN edrsr_fulltext f ON f.doc_id = d.doc_id
          WHERE d.doc_id = ANY($1)
            AND f.full_text IS NOT NULL
            AND f.full_text != ''`,
          [batchIds]
        );

        for (const row of result.rows) {
          docs.push({
            doc_id: row.doc_id,
            full_text: row.full_text,
            metadata: {
              court_code: row.court_code,
              judge: row.judge,
              cause_num: row.cause_num,
              justice_kind: row.justice_kind,
              adjudication_date: row.adjudication_date
                ? (typeof row.adjudication_date === 'string'
                    ? row.adjudication_date
                    : row.adjudication_date.toISOString().split('T')[0])
                : undefined,
              judgment_code: row.judgment_code,
              category_code: row.category_code,
            },
          });
        }
      } catch (error) {
        logger.error('[EdsrVectorizer] Failed to fetch documents from PG', { error, batchSize: batchIds.length });
      }
    }

    return docs;
  }

  /**
   * Vectorize a batch of documents: chunk → embed → upsert to Qdrant.
   * Returns map of doc_id → array of Qdrant point IDs.
   */
  private async _vectorizeBatch(docs: EdrsrDocument[]): Promise<Map<number, string[]>> {
    const result = new Map<number, string[]>();

    // 1. Chunk all documents
    const allChunks: Array<{
      text: string;
      docId: number;
      chunkIndex: number;
      totalChunks: number;
      metadata: EdrsrDocMetadata;
    }> = [];

    for (const doc of docs) {
      const chunks = chunkText(doc.full_text);
      const pointIds: string[] = [];

      for (let i = 0; i < chunks.length; i++) {
        allChunks.push({
          text: chunks[i],
          docId: doc.doc_id,
          chunkIndex: i,
          totalChunks: chunks.length,
          metadata: doc.metadata,
        });
      }

      // Pre-initialize result entry (point IDs will be filled after embedding)
      result.set(doc.doc_id, pointIds);
    }

    if (allChunks.length === 0) return result;

    // 2. Embed in batches of EMBED_BATCH_SIZE
    const texts = allChunks.map((c) => c.text);
    let allEmbeddings: number[][] = [];
    let totalTokens = 0;

    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
      const batchResult: EmbeddingBatchResult = await this.embeddingClient.generateEmbeddingsBatchWithUsage(batch);
      allEmbeddings.push(...batchResult.embeddings);
      totalTokens += batchResult.totalTokens;
    }

    this.usageCallback?.(totalTokens, EMBEDDING_MODEL, 'edrsr_vectorize');

    // 3. Build Qdrant points
    const points = allChunks.map((chunk, idx) => {
      const pointId = uuidv4();

      // Add point ID to the doc's result array
      result.get(chunk.docId)!.push(pointId);

      return {
        id: pointId,
        vector: allEmbeddings[idx],
        payload: {
          edrsr_doc_id: chunk.docId,
          court_code: chunk.metadata.court_code ?? null,
          judge: chunk.metadata.judge ?? null,
          cause_num: chunk.metadata.cause_num ?? null,
          justice_kind: chunk.metadata.justice_kind ?? null,
          adjudication_date: chunk.metadata.adjudication_date ?? null,
          judgment_code: chunk.metadata.judgment_code ?? null,
          category_code: chunk.metadata.category_code ?? null,
          chunk_index: chunk.chunkIndex,
          total_chunks: chunk.totalChunks,
          text: chunk.text,
          embedding_model: EMBEDDING_MODEL,
        },
      };
    });

    // 4. Upsert to Qdrant in sub-batches with retry
    for (let i = 0; i < points.length; i += QDRANT_UPSERT_BATCH) {
      const batch = points.slice(i, i + QDRANT_UPSERT_BATCH);
      let retries = 3;

      while (retries > 0) {
        try {
          await this.qdrant.upsert(COLLECTION_NAME, {
            wait: true,
            points: batch,
          });
          break;
        } catch (err: any) {
          retries--;
          if (retries === 0) {
            logger.error('[EdsrVectorizer] Qdrant upsert failed after 3 retries', { error: err.message });
            throw err;
          }
          logger.warn(`[EdsrVectorizer] Qdrant upsert retry (${3 - retries}/3): ${err.message}`);
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }

    logger.info(`[EdsrVectorizer] Batch complete: ${docs.length} docs, ${allChunks.length} chunks, ${totalTokens} tokens`);

    return result;
  }
}

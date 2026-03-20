/**
 * EdsrPreVectorizerWorker — Background pre-vectorization of EDRSR court decisions.
 *
 * Runs as a setInterval within the existing backend process (no separate worker needed).
 * Picks up un-vectorized documents in batches, embeds them via VoyageAI, and stores
 * vectors in Qdrant's `edrsr_decisions` collection.
 *
 * On-demand vectorization in EdsrVectorizerService remains as a fallback for
 * documents not yet processed by the background worker.
 *
 * Progress is tracked via Redis keys:
 *   edrsr:vecprog:last_doc_id   — last processed doc_id (for resumption)
 *   edrsr:vecprog:total          — total documents vectorized by this worker
 *   edrsr:vecprog:last_run       — ISO timestamp of last successful batch
 *
 * Safety:
 *   - Uses FOR UPDATE SKIP LOCKED for restart safety
 *   - Circuit breaker on consecutive API errors (pauses for 30 min)
 *   - Rate limiting: configurable batch size and interval
 */

import { logger } from '../utils/logger.js';
import type { EdsrVectorizerService, EdrsrDocument } from '../services/edrsr-vectorizer-service.js';
import type { ICachePort } from '../domain/ports/index.js';

// Configuration
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const CIRCUIT_BREAKER_THRESHOLD = 3; // consecutive failures before pause
const CIRCUIT_BREAKER_PAUSE_MS = 30 * 60 * 1000; // 30 minutes
const PG_FETCH_BATCH = 500;

// Redis keys for progress tracking
const KEY_LAST_DOC_ID = 'edrsr:vecprog:last_doc_id';
const KEY_TOTAL = 'edrsr:vecprog:total';
const KEY_LAST_RUN = 'edrsr:vecprog:last_run';
const KEY_STATUS = 'edrsr:vecprog:status';

export interface PreVectorizerStatus {
  status: 'running' | 'paused' | 'stopped' | 'idle';
  lastDocId: number;
  totalVectorized: number;
  lastRun: string | null;
  consecutiveErrors: number;
}

export class EdsrPreVectorizerWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private consecutiveErrors = 0;
  private circuitBreakerUntil: number = 0;
  private batchSize: number;
  private intervalMs: number;

  constructor(
    private vectorizer: EdsrVectorizerService,
    private dbPool: any,
    private cache?: ICachePort | null,
  ) {
    this.batchSize = parseInt(process.env.EDRSR_VECTORIZE_BATCH_SIZE || '', 10) || DEFAULT_BATCH_SIZE;
    this.intervalMs = parseInt(process.env.EDRSR_VECTORIZE_INTERVAL_MS || '', 10) || DEFAULT_INTERVAL_MS;
  }

  /**
   * Start the background vectorization worker.
   */
  start(): void {
    if (this.timer) return;

    logger.info('[EdsrPreVectorizer] Starting background worker', {
      batchSize: this.batchSize,
      intervalMs: this.intervalMs,
    });

    // Run first batch after a short delay (let other services initialize)
    setTimeout(() => this.runBatch(), 10_000);

    this.timer = setInterval(() => this.runBatch(), this.intervalMs);
    this.updateStatus('running');
  }

  /**
   * Stop the background worker.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.updateStatus('stopped');
    logger.info('[EdsrPreVectorizer] Worker stopped');
  }

  /**
   * Get current worker status (for health endpoint).
   */
  async getStatus(): Promise<PreVectorizerStatus> {
    const lastDocId = await this.getRedisInt(KEY_LAST_DOC_ID);
    const totalVectorized = await this.getRedisInt(KEY_TOTAL);
    const lastRun = await this.getRedisString(KEY_LAST_RUN);

    let status: PreVectorizerStatus['status'] = 'idle';
    if (this.running) status = 'running';
    else if (Date.now() < this.circuitBreakerUntil) status = 'paused';
    else if (!this.timer) status = 'stopped';

    return {
      status,
      lastDocId,
      totalVectorized,
      lastRun,
      consecutiveErrors: this.consecutiveErrors,
    };
  }

  // ── Core batch logic ────────────────────────────────────────────────────

  private async runBatch(): Promise<void> {
    if (this.running) return; // Skip if previous batch is still in progress

    // Circuit breaker check
    if (Date.now() < this.circuitBreakerUntil) {
      logger.debug('[EdsrPreVectorizer] Circuit breaker active, skipping batch');
      return;
    }

    this.running = true;
    try {
      // 1. Find un-vectorized documents using FOR UPDATE SKIP LOCKED
      const lastDocId = await this.getRedisInt(KEY_LAST_DOC_ID);

      const result = await this.dbPool.query(`
        SELECT d.doc_id, d.cause_num, d.judge, d.court_code, d.justice_kind,
               d.judgment_code, d.category_code, d.adjudication_date,
               f.full_text
        FROM edrsr_documents d
        INNER JOIN edrsr_fulltext f ON f.doc_id = d.doc_id
        WHERE d.doc_id > $1
          AND f.full_text IS NOT NULL
          AND f.full_text != ''
        ORDER BY d.doc_id ASC
        LIMIT $2
        FOR UPDATE OF d SKIP LOCKED
      `, [lastDocId, this.batchSize]);

      if (result.rows.length === 0) {
        logger.debug('[EdsrPreVectorizer] No un-vectorized documents found');
        this.running = false;
        return;
      }

      // 2. Build document objects
      const docs: EdrsrDocument[] = result.rows.map((row: any) => ({
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
      }));

      // 3. Check which are already vectorized (Qdrant)
      const docIds = docs.map(d => d.doc_id);
      const existingMap = await this.vectorizer.ensureVectorized(docIds, this.dbPool);

      // Count newly vectorized (those not in existingMap before our call)
      const newlyVectorized = docIds.filter(id => existingMap.has(id)).length;

      // 4. Track progress
      const maxDocId = Math.max(...docIds);
      const totalSoFar = await this.getRedisInt(KEY_TOTAL);

      await this.setRedis(KEY_LAST_DOC_ID, String(maxDocId));
      await this.setRedis(KEY_TOTAL, String(totalSoFar + newlyVectorized));
      await this.setRedis(KEY_LAST_RUN, new Date().toISOString());

      this.consecutiveErrors = 0;

      logger.info('[EdsrPreVectorizer] Batch complete', {
        batchSize: docs.length,
        newlyVectorized,
        maxDocId,
        totalVectorized: totalSoFar + newlyVectorized,
      });
    } catch (err: any) {
      this.consecutiveErrors++;
      logger.error('[EdsrPreVectorizer] Batch failed', {
        error: err.message,
        consecutiveErrors: this.consecutiveErrors,
      });

      // Trip circuit breaker on consecutive failures
      if (this.consecutiveErrors >= CIRCUIT_BREAKER_THRESHOLD) {
        this.circuitBreakerUntil = Date.now() + CIRCUIT_BREAKER_PAUSE_MS;
        this.updateStatus('paused');
        logger.warn('[EdsrPreVectorizer] Circuit breaker tripped — pausing for 30 minutes', {
          consecutiveErrors: this.consecutiveErrors,
        });
      }
    } finally {
      this.running = false;
    }
  }

  // ── Redis helpers ────────────────────────────────────────────────────────

  private async getRedisInt(key: string): Promise<number> {
    if (!this.cache) return 0;
    try {
      const val = await this.cache.get(key);
      return val ? parseInt(val, 10) || 0 : 0;
    } catch {
      return 0;
    }
  }

  private async getRedisString(key: string): Promise<string | null> {
    if (!this.cache) return null;
    try {
      return await this.cache.get(key);
    } catch {
      return null;
    }
  }

  private async setRedis(key: string, value: string): Promise<void> {
    if (!this.cache) return;
    try {
      // No TTL — progress keys persist until explicitly reset
      await this.cache.set(key, value);
    } catch {
      // Non-critical
    }
  }

  private updateStatus(status: string): void {
    if (!this.cache) return;
    this.cache.set(KEY_STATUS, status).catch(() => {});
  }
}

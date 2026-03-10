/**
 * Upload Manager - Orchestrates chunked file uploads with queue management
 *
 * Features:
 * - 3 parallel files, sequential chunks per file
 * - Exponential backoff retry (3 attempts per chunk)
 * - Pause/Resume/Cancel per-file and global
 * - Byte-level progress tracking
 * - Adaptive concurrency based on server backpressure
 * - 429 handling with Retry-After
 * - Batch init for 100+ files
 *
 * Composed from:
 * - UploadQueue — item storage, ordering, concurrency slots
 * - UploadRetry — retry strategy, backoff logic
 * - BackpressureManager — server throttling detection, adaptive concurrency
 */

import { uploadService, InitUploadResponse } from '../api/UploadService';
import { getErrorMessage } from '../../utils/errors';
import type { UploadItem, UploadEvent, UploadListener } from './types';
import { UploadQueue } from './UploadQueue';
import { UploadRetry } from './UploadRetry';
import { BackpressureManager } from './BackpressureManager';

// Re-export types so consumers keep the same import path
export type { UploadItemStatus, UploadItem, UploadEventType, UploadEvent } from './types';

const POLL_INTERVAL = 2000; // ms
const BATCH_INIT_THRESHOLD = 10; // Use batch init for 10+ files
const BATCH_CHUNK_SIZE = 500; // Server limit per batch-init request

export class UploadManager {
  private queue = new UploadQueue();
  private retry = new UploadRetry();
  private backpressure = new BackpressureManager();
  private listeners: Set<UploadListener> = new Set();
  private abortControllers: Map<string, AbortController> = new Map();

  subscribe(listener: UploadListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setConcurrency(n: number) {
    this.backpressure.setConcurrency(n);
  }

  getConcurrency(): number {
    return this.backpressure.getConcurrency();
  }

  get isThrottled(): boolean {
    return this.backpressure.isThrottled;
  }

  get serverQueueDepth(): number {
    return this.backpressure.serverQueueDepth;
  }

  private emit(event: UploadEvent) {
    this.listeners.forEach((l) => l(event));
  }

  private emitItemUpdate(item: UploadItem) {
    this.emit({ type: 'item-updated', item: { ...item } });
    this.emitGlobalProgress();
  }

  private emitGlobalProgress() {
    const items = this.queue.getAll();
    if (items.length === 0) return;
    const totalBytes = items.reduce((sum, i) => sum + i.fileSize, 0);
    const uploadedBytes = items.reduce((sum, i) => sum + i.uploadedBytes, 0);
    this.emit({
      type: 'global-progress',
      globalProgress: totalBytes > 0 ? uploadedBytes / totalBytes : 0,
    });
  }

  /**
   * Process backpressure headers from server response
   */
  private handleBackpressureHeaders(headers: Record<string, string> | null): void {
    const event = this.backpressure.handleBackpressureHeaders(headers);
    if (event) {
      this.emit(event);
    }
  }

  /**
   * Add files to the upload queue
   */
  addFiles(
    files: Array<{
      file: File;
      mimeType: string;
      relativePath: string;
      docType: string;
    }>
  ): UploadItem[] {
    return this.queue.addFiles(files);
  }

  /**
   * Start uploading all queued files
   */
  async start() {
    this.queue.isPaused = false;
    // Batch-init sessions for large file sets (reduces 100 requests to 1)
    const queued = this.queue.getQueued();
    if (queued.length >= BATCH_INIT_THRESHOLD) {
      // Proactively clear stale sessions to free quota before batch init
      try {
        await uploadService.clearStaleSessions();
      } catch {
        // Best effort — proceed even if cleanup fails
      }
      await this.batchInitSessions(queued);
    }
    this.processQueue();
  }

  /**
   * Pause all uploads
   */
  pause() {
    this.queue.isPaused = true;
    // Pause active uploads
    for (const [id, item] of this.queue.entries()) {
      if (item.status === 'uploading' || item.status === 'initializing') {
        item.status = 'paused';
        this.emitItemUpdate(item);
        const controller = this.abortControllers.get(id);
        if (controller) controller.abort();
      }
    }
  }

  /**
   * Resume paused uploads
   */
  resume() {
    this.queue.isPaused = false;
    // Reset paused items to queued
    for (const item of this.queue.getByStatus('paused')) {
      item.status = 'queued';
      this.emitItemUpdate(item);
    }
    this.processQueue();
  }

  /**
   * Cancel a specific file
   */
  async cancelFile(itemId: string) {
    const item = this.queue.get(itemId);
    if (!item) return;

    // Set cancelled status FIRST to stop the chunk upload loop immediately
    item.status = 'cancelled';
    this.emitItemUpdate(item);

    const controller = this.abortControllers.get(itemId);
    if (controller) controller.abort();
    this.abortControllers.delete(itemId);

    if (item.uploadId) {
      try {
        await uploadService.cancelUpload(item.uploadId);
      } catch {
        // Best effort
      }
    }
  }

  /**
   * Cancel all uploads
   */
  async cancelAll() {
    this.queue.isPaused = true;
    const promises: Promise<void>[] = [];

    for (const [id, item] of this.queue.entries()) {
      if (['queued', 'initializing', 'uploading', 'paused'].includes(item.status)) {
        promises.push(this.cancelFile(id));
      }
    }

    await Promise.allSettled(promises);
  }

  /**
   * Retry a failed file
   */
  retryFile(itemId: string) {
    const item = this.queue.get(itemId);
    if (!item || item.status !== 'failed') return;

    item.status = 'queued';
    item.retries = 0;
    item.error = undefined;
    item.uploadedBytes = 0;
    item.progress = 0;
    this.emitItemUpdate(item);
    this.processQueue();
  }

  /**
   * Retry all failed files
   */
  retryAllFailed() {
    for (const item of this.queue.getByStatus('failed')) {
      item.status = 'queued';
      item.retries = 0;
      item.error = undefined;
      item.uploadedBytes = 0;
      item.progress = 0;
      this.emitItemUpdate(item);
    }
    this.processQueue();
  }

  /**
   * Remove a file from the queue (only if not actively uploading)
   */
  removeFile(itemId: string) {
    if (this.queue.removeFile(itemId)) {
      this.emitGlobalProgress();
    }
  }

  /**
   * Clear all completed/cancelled/failed items
   */
  clearFinished() {
    this.queue.clearFinished();
    this.emitGlobalProgress();
  }

  /**
   * Get all items as array
   */
  getItems(): UploadItem[] {
    return this.queue.getAll();
  }

  /**
   * Get stats
   */
  getStats() {
    return this.queue.getStats();
  }

  /**
   * Update doc type for a queued item
   */
  updateDocType(itemId: string, docType: string) {
    this.queue.updateDocType(itemId, docType);
  }

  /**
   * Update doc type for all queued items
   */
  updateAllDocTypes(docType: string) {
    this.queue.updateAllDocTypes(docType);
  }

  // --- Internal ---

  private processQueue() {
    if (this.queue.isPaused) return;

    const queued = this.queue.getQueued();

    while (this.queue.activeUploads < this.backpressure.maxConcurrentFiles && queued.length > 0) {
      const item = queued.shift()!;
      this.queue.incrementActive();
      this.uploadFile(item).finally(() => {
        this.queue.decrementActive();
        this.processQueue();

        // Check if all done
        const stats = this.queue.getStats();
        if (stats.queued === 0 && stats.uploading === 0 && stats.paused === 0) {
          this.emit({ type: 'all-completed' });
        }
      });
    }
  }

  /**
   * Batch initialize sessions for queued items that don't have uploadIds yet.
   * Splits into chunks of BATCH_CHUNK_SIZE to stay within server limit.
   */
  private async batchInitSessions(items: UploadItem[]): Promise<void> {
    const needInit = items.filter((i) => !i.uploadId);
    if (needInit.length < BATCH_INIT_THRESHOLD) return; // Not worth batching

    // Split into chunks of BATCH_CHUNK_SIZE to stay within server limit
    for (let offset = 0; offset < needInit.length; offset += BATCH_CHUNK_SIZE) {
      const chunk = needInit.slice(offset, offset + BATCH_CHUNK_SIZE);
      await this.batchInitChunk(chunk);
    }
  }

  /** Send a single batch-init request for up to BATCH_CHUNK_SIZE items */
  private async batchInitChunk(needInit: UploadItem[]): Promise<void> {
    const files = needInit.map((i) => ({
      fileName: i.fileName,
      fileSize: i.fileSize,
      mimeType: i.mimeType,
      docType: i.docType,
      relativePath: i.relativePath,
    }));

    const retryCtx = { emit: (event: UploadEvent) => this.emit(event) };

    const response = await this.retry.executeWithRetryForBatch(
      () => uploadService.initBatch(files),
      retryCtx,
      { label: 'batch init' }
    );

    if (response?.sessions) {
      for (let idx = 0; idx < response.sessions.length; idx++) {
        const session = response.sessions[idx];
        const item = needInit[idx];
        if (item && session && !('error' in session)) {
          item.uploadId = session.uploadId;
        }
      }
    }
  }

  private async uploadFile(item: UploadItem): Promise<void> {
    // Create abort controller for this file upload
    const controller = new AbortController();
    this.abortControllers.set(item.id, controller);

    try {
      // Step 1: Init session
      item.status = 'initializing';
      this.emitItemUpdate(item);

      let initResponse: InitUploadResponse = undefined!;

      if (item.uploadId) {
        // Resuming - check existing session
        const status = await uploadService.getStatus(item.uploadId);
        initResponse = {
          uploadId: item.uploadId,
          chunkSize: item.fileSize / (status.totalChunks || 1), // approximate
          totalChunks: status.totalChunks,
          uploadedChunks: status.uploadedChunks,
          expiresAt: '',
        };
      } else {
        const retryCtx = { emit: (event: UploadEvent) => this.emit(event) };
        initResponse = await this.retry.executeWithRetry(
          () =>
            uploadService.initUpload({
              fileName: item.fileName,
              fileSize: item.fileSize,
              mimeType: item.mimeType,
              docType: item.docType,
              relativePath: item.relativePath,
            }),
          retryCtx,
          { label: 'upload init' }
        );
        item.uploadId = initResponse.uploadId;
      }

      // Step 2: Upload chunks
      item.status = 'uploading';
      this.emitItemUpdate(item);

      const chunkSize = initResponse.chunkSize;
      const totalChunks = initResponse.totalChunks;
      const uploadedSet = new Set(initResponse.uploadedChunks);

      // Calculate already uploaded bytes from resumed chunks
      item.uploadedBytes = uploadedSet.size * chunkSize;

      for (let i = 0; i < totalChunks; i++) {
        if (this.queue.isPaused || (item.status as string) === 'paused' || (item.status as string) === 'cancelled') {
          return;
        }

        // Skip already uploaded chunks (resume support)
        if (uploadedSet.has(i)) continue;

        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, item.fileSize);
        const chunk = item.file.slice(start, end);

        // Inter-chunk delay when server is throttled
        if (this.backpressure.interChunkDelay > 0) {
          await new Promise((r) => setTimeout(r, this.backpressure.interChunkDelay));
        }

        // Upload chunk with retries
        const retryCtx = { emit: (event: UploadEvent) => this.emit(event) };
        await this.retry.executeWithRetry(
          async () => {
            const response = await uploadService.uploadChunk(
              item.uploadId!,
              i,
              chunk,
              (loaded, _total) => {
                // Per-chunk progress
                const bytesBeforeThisChunk = i * chunkSize;
                const alreadyResumed = uploadedSet.size * chunkSize;
                item.uploadedBytes =
                  alreadyResumed +
                  (bytesBeforeThisChunk - alreadyResumed) +
                  loaded;
                item.progress = item.uploadedBytes / item.fileSize;
                this.emitItemUpdate(item);
              },
              controller.signal
            );

            // Process backpressure headers from chunk response
            if (response && typeof response === 'object' && '_headers' in response) {
              this.handleBackpressureHeaders((response as any)._headers);
            }
          },
          retryCtx,
          { label: 'chunk upload' }
        );

        // Don't retry if cancelled/aborted — check after retry returns
        if (controller.signal.aborted) {
          return;
        }

        // Update progress after successful chunk
        item.uploadedBytes = end;
        item.progress = item.uploadedBytes / item.fileSize;
        this.emitItemUpdate(item);
      }

      // Step 3: Complete
      item.status = 'assembling';
      this.emitItemUpdate(item);

      await uploadService.completeUpload(item.uploadId!);

      // Step 4: Poll for completion
      item.status = 'processing';
      this.emitItemUpdate(item);

      const result = await this.pollForCompletion(item.uploadId!);
      item.documentId = result.documentId;
      item.storageType = result.storageType;
      item.status = 'completed';
      item.progress = 1;
      item.uploadedBytes = item.fileSize;
      this.emitItemUpdate(item);
    } catch (error: unknown) {
      if (item.status === 'cancelled' || item.status === 'paused') return;

      item.status = 'failed';
      item.error = getErrorMessage(error);
      item.retries++;
      this.emitItemUpdate(item);
      this.emit({ type: 'error', error: `${item.fileName}: ${item.error}` });
    } finally {
      this.abortControllers.delete(item.id);
    }
  }

  private async pollForCompletion(
    uploadId: string,
    maxAttempts = 120 // 4 min max
  ) {
    for (let i = 0; i < maxAttempts; i++) {
      const status = await uploadService.getStatus(uploadId);

      if (status.status === 'completed') {
        return status;
      }
      if (status.status === 'failed') {
        throw new Error(status.errorMessage || 'Processing failed');
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    }

    throw new Error('Processing timeout');
  }
}

// Singleton instance
export const uploadManager = new UploadManager();

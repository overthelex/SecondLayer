/**
 * UploadQueue - Manages the queue of upload items, ordering, and concurrency slots
 *
 * Responsible for:
 * - Storing and tracking UploadItem instances
 * - Managing active upload slot count
 * - Providing queue iteration and stats
 * - Pause/resume state
 */

import type { UploadItem, UploadItemStatus } from './types';

export class UploadQueue {
  private items: Map<string, UploadItem> = new Map();
  private _activeUploads = 0;
  private _isPaused = false;

  get activeUploads(): number {
    return this._activeUploads;
  }

  get isPaused(): boolean {
    return this._isPaused;
  }

  set isPaused(value: boolean) {
    this._isPaused = value;
  }

  incrementActive(): void {
    this._activeUploads++;
  }

  decrementActive(): void {
    this._activeUploads--;
  }

  /**
   * Add files to the queue and return the created items
   */
  addFiles(
    files: Array<{
      file: File;
      mimeType: string;
      relativePath: string;
      docType: string;
    }>
  ): UploadItem[] {
    const newItems: UploadItem[] = [];

    for (const f of files) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const item: UploadItem = {
        id,
        file: f.file,
        fileName: f.file.name,
        fileSize: f.file.size,
        mimeType: f.mimeType,
        relativePath: f.relativePath,
        docType: f.docType,
        status: 'queued',
        progress: 0,
        uploadedBytes: 0,
        retries: 0,
      };
      this.items.set(id, item);
      newItems.push(item);
    }

    return newItems;
  }

  /**
   * Get a single item by ID
   */
  get(id: string): UploadItem | undefined {
    return this.items.get(id);
  }

  /**
   * Delete an item by ID
   */
  delete(id: string): boolean {
    return this.items.delete(id);
  }

  /**
   * Get all items as array
   */
  getAll(): UploadItem[] {
    return Array.from(this.items.values());
  }

  /**
   * Get all items with their IDs (for iteration)
   */
  entries(): IterableIterator<[string, UploadItem]> {
    return this.items.entries();
  }

  /**
   * Get items filtered by status
   */
  getByStatus(...statuses: UploadItemStatus[]): UploadItem[] {
    return Array.from(this.items.values()).filter((i) =>
      statuses.includes(i.status)
    );
  }

  /**
   * Get queued items that are ready to be processed
   */
  getQueued(): UploadItem[] {
    return this.getByStatus('queued');
  }

  /**
   * Remove a file from the queue (only if not actively uploading)
   */
  removeFile(itemId: string): boolean {
    const item = this.items.get(itemId);
    if (!item) return false;

    if (['queued', 'completed', 'failed', 'cancelled'].includes(item.status)) {
      this.items.delete(itemId);
      return true;
    }
    return false;
  }

  /**
   * Clear all completed/cancelled/failed items
   */
  clearFinished(): void {
    for (const [id, item] of this.items) {
      if (['completed', 'cancelled', 'failed'].includes(item.status)) {
        this.items.delete(id);
      }
    }
  }

  /**
   * Update doc type for a queued item
   */
  updateDocType(itemId: string, docType: string): void {
    const item = this.items.get(itemId);
    if (item && item.status === 'queued') {
      item.docType = docType;
    }
  }

  /**
   * Update doc type for all queued items
   */
  updateAllDocTypes(docType: string): void {
    for (const item of this.items.values()) {
      if (item.status === 'queued') {
        item.docType = docType;
      }
    }
  }

  /**
   * Get stats about the current queue
   */
  getStats() {
    const items = Array.from(this.items.values());
    return {
      total: items.length,
      queued: items.filter((i) => i.status === 'queued').length,
      uploading: items.filter((i) =>
        ['initializing', 'uploading', 'assembling', 'processing'].includes(i.status)
      ).length,
      completed: items.filter((i) => i.status === 'completed').length,
      failed: items.filter((i) => i.status === 'failed').length,
      cancelled: items.filter((i) => i.status === 'cancelled').length,
      paused: items.filter((i) => i.status === 'paused').length,
      totalBytes: items.reduce((s, i) => s + i.fileSize, 0),
      uploadedBytes: items.reduce((s, i) => s + i.uploadedBytes, 0),
    };
  }
}

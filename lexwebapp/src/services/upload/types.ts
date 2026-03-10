/**
 * Shared types for the upload module
 */

export type UploadItemStatus =
  | 'queued'
  | 'initializing'
  | 'uploading'
  | 'assembling'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused';

export interface UploadItem {
  id: string; // Client-side ID
  file: File;
  fileName: string;
  fileSize: number;
  mimeType: string;
  relativePath: string;
  docType: string;
  status: UploadItemStatus;
  uploadId?: string; // Server-side session ID
  documentId?: string;
  storageType?: string;
  progress: number; // 0-1
  uploadedBytes: number;
  error?: string;
  retries: number;
}

export type UploadEventType =
  | 'item-updated'
  | 'global-progress'
  | 'all-completed'
  | 'error'
  | 'throttle-changed';

export interface UploadEvent {
  type: UploadEventType;
  item?: UploadItem;
  globalProgress?: number;
  error?: string;
  isThrottled?: boolean;
  serverQueueDepth?: number;
}

export type UploadListener = (event: UploadEvent) => void;

export interface VaultDocument {
  id: string;
  title: string;
  type: 'contract' | 'legislation' | 'court_decision' | 'internal' | 'other';
  storage_type?: 'vault' | 'minio';
  mime_type?: string;
  is_encrypted?: boolean;
  text_preview?: string;
  metadata: {
    uploadedAt: string;
    uploadedBy?: string;
    tags?: string[];
    category?: string;
    riskLevel?: 'low' | 'medium' | 'high';
    fileSize?: number;
    mimeType?: string;
    folderPath?: string;
    documentDate?: string;
    parties?: string[];
    documentSubtype?: string;
    jurisdiction?: string;
    classificationStatus?: 'classified' | 'needs_review' | 'pending';
    classificationConfidence?: number;
    classifiedAt?: string;
    originalFilename?: string;
    minioKey?: string;
  };
}

export interface DocumentStats {
  total: number;
  classified: number;
  needsReview: number;
  unclassified: number;
  byType: Record<string, number>;
  totalClassificationCostUsd: number;
  totalUploadSessions: number;
  totalStorageBytes: number;
}

export interface ClassificationJob {
  jobId: string;
  userId: string;
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  status: 'running' | 'completed' | 'cancelled';
  totalCostUsd: number;
  startedAt: string;
  completedAt?: string;
}

export type DocType = 'contract' | 'legislation' | 'court_decision' | 'internal' | 'other';
export type ViewMode = 'grid' | 'list';
export type SortField = 'uploadedAt' | 'title' | 'type';
export type SortOrder = 'asc' | 'desc';

/**
 * Get file extension from original filename or mime type.
 */
export function getFileExtension(doc: VaultDocument): string {
  // Try original filename first
  const filename = doc.metadata?.originalFilename;
  if (filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext && ext !== filename.toLowerCase()) return `.${ext}`;
  }
  // Fallback to mime type mapping
  const mime = doc.metadata?.mimeType || doc.mime_type;
  if (!mime) return '';
  const mimeMap: Record<string, string> = {
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'text/html': '.html',
    'text/plain': '.txt',
    'application/rtf': '.rtf',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/bmp': '.bmp',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'text/csv': '.csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'application/vnd.ms-excel': '.xls',
    'message/rfc822': '.eml',
  };
  return mimeMap[mime] || '';
}

/**
 * Check if document is a previewable binary file (image, PDF, video).
 */
export function isPreviewableBinary(mimeType?: string): boolean {
  if (!mimeType) return false;
  return mimeType.startsWith('image/')
    || mimeType === 'application/pdf'
    || mimeType.startsWith('video/')
    || mimeType === 'application/msword'
    || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

const EDITABLE_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/html',
  'text/csv',
  'application/rtf',
]);

export function isEditable(mimeType?: string): boolean {
  if (!mimeType) return false;
  return EDITABLE_MIME_TYPES.has(mimeType) || mimeType.startsWith('text/');
}

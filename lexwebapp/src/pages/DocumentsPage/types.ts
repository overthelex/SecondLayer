export interface VaultDocument {
  id: string;
  title: string;
  type: 'contract' | 'legislation' | 'court_decision' | 'internal' | 'other';
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

export interface DocumentViewerItem {
  type: 'decision' | 'citation' | 'document';
  title: string;
  subtitle?: string;
  badge?: string;
  badgeVariant?: 'active' | 'overturned' | 'modified' | 'default';
  content: string;
  relevance?: number;
  externalUrl?: string;
  previewUrl?: string;
  mimeType?: string;
  /** OCR-extracted text for image documents */
  ocrText?: string;
  /** Document ID for saving edits */
  documentId?: string;
}

export interface DocumentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: DocumentViewerItem | null;
  isLoading?: boolean;
  errorMessage?: string | null;
  onSaveOcrText?: (documentId: string, text: string) => Promise<void>;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  currentIndex?: number;
  totalCount?: number;
  onDelete?: () => void;
}

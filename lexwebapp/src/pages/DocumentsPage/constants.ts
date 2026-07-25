import { FileText, Image, Film, FileSpreadsheet } from 'lucide-react';
import type { DocType } from './types';

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  contract: 'Договір',
  legislation: 'Законодавство',
  court_decision: 'Судове рішення',
  internal: 'Внутрішній',
  other: 'Інше',
};

export const DOC_TYPE_LABELS_PLURAL: Record<string, string> = {
  contract: 'Договори',
  legislation: 'Законодавство',
  court_decision: 'Судові рішення',
  internal: 'Внутрішні',
  other: 'Інше',
};

export const DOC_TYPE_COLORS: Record<string, string> = {
  contract: 'bg-blue-50 text-blue-700 border-blue-200',
  legislation: 'bg-purple-50 text-purple-700 border-purple-200',
  court_decision: 'bg-amber-50 text-amber-700 border-amber-200',
  internal: 'bg-green-50 text-green-700 border-green-200',
  other: 'bg-gray-50 text-gray-700 border-gray-200',
};

export const DOC_TYPE_COLORS_SOLID: Record<string, string> = {
  contract: 'bg-blue-100 text-blue-700',
  legislation: 'bg-purple-100 text-purple-700',
  court_decision: 'bg-amber-100 text-amber-700',
  internal: 'bg-green-100 text-green-700',
  other: 'bg-gray-100 text-gray-600',
};

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function getFileIcon(mimeType?: string) {
  if (!mimeType) return FileText;
  if (mimeType.startsWith('image/')) return Image;
  if (mimeType.startsWith('video/')) return Film;
  if (
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel') ||
    mimeType === 'text/csv'
  )
    return FileSpreadsheet;
  return FileText;
}

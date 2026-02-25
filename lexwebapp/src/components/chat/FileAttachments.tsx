/**
 * FileAttachments — file badge display with upload status indicators.
 */

import { FileText, Loader2, X } from 'lucide-react';

export interface SelectedFile {
  file: File;
  uploading: boolean;
  documentId?: string;
  error?: string;
}

interface FileAttachmentsProps {
  files: SelectedFile[];
  onRemove: (index: number) => void;
}

export function FileAttachments({ files, onRemove }: FileAttachmentsProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {files.map((sf, idx) => (
        <div
          key={idx}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] border ${
            sf.error
              ? 'bg-red-50 border-red-200 text-red-600'
              : sf.uploading
              ? 'bg-claude-bg border-claude-border text-claude-subtext'
              : sf.documentId
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-claude-bg border-claude-border text-claude-text'
          }`}
        >
          {sf.uploading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <FileText size={12} />
          )}
          <span className="max-w-[120px] truncate">{sf.file.name}</span>
          {!sf.uploading && (
            <button
              onClick={() => onRemove(idx)}
              className="p-0.5 hover:bg-claude-subtext/10 rounded transition-colors"
            >
              <X size={10} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

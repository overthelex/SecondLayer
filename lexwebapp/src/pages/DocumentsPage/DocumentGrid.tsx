import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  Image,
  Film,
  FileSpreadsheet,
  MoreVertical,
  Eye,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { VaultDocument } from './types';
import { isEditable, getFileExtension } from './types';

const DOC_TYPE_LABELS: Record<string, string> = {
  contract: 'Договір',
  legislation: 'Законодавство',
  court_decision: 'Судове рішення',
  internal: 'Внутрішній',
  other: 'Інше',
};

const DOC_TYPE_COLORS: Record<string, string> = {
  contract: 'bg-blue-50 text-blue-700 border-blue-200',
  legislation: 'bg-purple-50 text-purple-700 border-purple-200',
  court_decision: 'bg-amber-50 text-amber-700 border-amber-200',
  internal: 'bg-green-50 text-green-700 border-green-200',
  other: 'bg-gray-50 text-gray-700 border-gray-200',
};

function formatDate(iso: string): string {
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getFileIcon(mimeType?: string) {
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

function CardContextMenu({
  doc,
  onView,
  onEdit,
  onDelete,
}: {
  doc: VaultDocument;
  onView: (doc: VaultDocument) => void;
  onEdit: (doc: VaultDocument) => void;
  onDelete: (doc: VaultDocument) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        className="p-1 text-claude-subtext/30 hover:text-claude-text transition-colors opacity-0 group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-white border border-claude-border rounded-xl shadow-lg py-1">
          <button
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-claude-text hover:bg-claude-bg transition-colors font-sans"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onView(doc);
            }}
          >
            <Eye size={14} className="text-claude-subtext/60" />
            Переглянути
          </button>
          {isEditable(doc.metadata?.mimeType) && (
            <button
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-claude-text hover:bg-claude-bg transition-colors font-sans"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onEdit(doc);
              }}
            >
              <Pencil size={14} className="text-claude-subtext/60" />
              Редагувати
            </button>
          )}
          <button
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors font-sans"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onDelete(doc);
            }}
          >
            <Trash2 size={14} />
            Видалити
          </button>
        </div>
      )}
    </div>
  );
}

interface DocumentGridProps {
  documents: VaultDocument[];
  onDocumentClick: (doc: VaultDocument) => void;
  onView: (doc: VaultDocument) => void;
  onEdit: (doc: VaultDocument) => void;
  onDelete: (doc: VaultDocument) => void;
}

export function DocumentGrid({ documents, onDocumentClick, onView, onEdit, onDelete }: DocumentGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {documents.map((doc, index) => {
        const Icon = getFileIcon(doc.metadata?.mimeType);
        return (
          <motion.div
            key={doc.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            className="bg-white rounded-2xl border border-claude-border p-4 hover:shadow-md transition-all group cursor-pointer"
            onClick={() => onDocumentClick(doc)}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="p-2 bg-claude-subtext/5 rounded-lg">
                <Icon size={20} className="text-claude-subtext/50" />
              </div>
              <div className="flex items-center gap-1">
                <span
                  className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-md border ${
                    DOC_TYPE_COLORS[doc.type] || DOC_TYPE_COLORS.other
                  } font-sans`}
                >
                  {DOC_TYPE_LABELS[doc.type] || doc.type}
                </span>
                <CardContextMenu
                  doc={doc}
                  onView={onView}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              </div>
            </div>
            <div className="flex items-center gap-1.5 mb-1">
              <h4 className="text-sm font-semibold text-claude-text truncate font-sans">
                {doc.title}
              </h4>
              {(() => {
                const ext = getFileExtension(doc);
                return ext ? (
                  <span className="text-[10px] px-1.5 py-0.5 bg-claude-subtext/8 text-claude-subtext/60 rounded font-mono flex-shrink-0 uppercase">
                    {ext.replace('.', '')}
                  </span>
                ) : null;
              })()}
            </div>
            <div className="flex items-center gap-2">
              <p className="text-xs text-claude-subtext/50 font-sans">
                {doc.metadata?.documentDate
                  ? formatDate(doc.metadata.documentDate)
                  : doc.metadata?.uploadedAt
                  ? formatDate(doc.metadata.uploadedAt)
                  : ''}
              </p>
              {doc.metadata?.fileSize && (
                <span className="text-xs text-claude-subtext/40 font-sans">
                  · {formatFileSize(doc.metadata.fileSize)}
                </span>
              )}
            </div>
            {doc.metadata?.tags && doc.metadata.tags.length > 0 && (
              <div className="flex gap-1 mt-2 flex-wrap">
                {doc.metadata.tags.slice(0, 3).map((tag: string) => (
                  <span
                    key={tag}
                    className="text-[10px] px-1.5 py-0.5 bg-claude-subtext/5 text-claude-subtext/70 rounded font-sans"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

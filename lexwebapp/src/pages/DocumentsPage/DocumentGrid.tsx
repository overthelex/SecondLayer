import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  MoreVertical,
  Eye,
  Pencil,
  Trash2,
  FolderInput,
  AlertTriangle,
} from 'lucide-react';
import type { VaultDocument, SortField, SortOrder } from './types';
import { isEditable, getFileExtension } from './types';
import { DOC_TYPE_LABELS, DOC_TYPE_COLORS, formatDate, formatFileSize, getFileIcon } from './constants';

function CardContextMenu({
  doc,
  onView,
  onEdit,
  onDelete,
  onMove,
}: {
  doc: VaultDocument;
  onView: (doc: VaultDocument) => void;
  onEdit: (doc: VaultDocument) => void;
  onDelete: (doc: VaultDocument) => void;
  onMove: (doc: VaultDocument) => void;
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
        className="p-1 text-claude-subtext/30 hover:text-claude-text transition-colors sm:opacity-0 sm:group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Дії з документом"
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-44 bg-white border border-claude-border rounded-xl shadow-lg py-1" role="menu">
          <button
            role="menuitem"
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
              role="menuitem"
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
            role="menuitem"
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-claude-text hover:bg-claude-bg transition-colors font-sans"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onMove(doc);
            }}
          >
            <FolderInput size={14} className="text-claude-subtext/60" />
            Перемістити
          </button>
          <button
            role="menuitem"
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

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'uploadedAt', label: 'За датою' },
  { value: 'title', label: 'За назвою' },
  { value: 'type', label: 'За типом' },
];

interface DocumentGridProps {
  documents: VaultDocument[];
  onDocumentClick: (doc: VaultDocument) => void;
  onView: (doc: VaultDocument) => void;
  onEdit: (doc: VaultDocument) => void;
  onDelete: (doc: VaultDocument) => void;
  onMove: (doc: VaultDocument) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  sortBy?: SortField;
  sortOrder?: SortOrder;
  onSort?: (field: SortField) => void;
}

export function DocumentGrid({
  documents,
  onDocumentClick,
  onView,
  onEdit,
  onDelete,
  onMove,
  selectedIds,
  onToggleSelect,
  sortBy,
  sortOrder,
  onSort,
}: DocumentGridProps) {
  const hasSelection = selectedIds != null && onToggleSelect != null;

  return (
    <div>
      {/* Sort controls for grid view */}
      {onSort && sortBy && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-claude-subtext/50 font-sans">Сортування:</span>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onSort(opt.value)}
              className={`px-2.5 py-1 rounded-lg text-xs font-sans font-medium transition-colors ${
                sortBy === opt.value
                  ? 'bg-claude-text text-white'
                  : 'bg-white border border-claude-border text-claude-subtext hover:bg-claude-bg'
              }`}
            >
              {opt.label}
              {sortBy === opt.value && (
                <span className="ml-1 text-[10px]">{sortOrder === 'asc' ? '↑' : '↓'}</span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {documents.map((doc, index) => {
          const Icon = getFileIcon(doc.metadata?.mimeType);
          const isSelected = hasSelection && selectedIds!.has(doc.id);
          return (
            <motion.div
              key={doc.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              className={`bg-white rounded-2xl border p-4 hover:shadow-md transition-all group cursor-pointer ${
                isSelected ? 'border-claude-accent bg-claude-accent/5' : 'border-claude-border'
              }`}
              onClick={() => onDocumentClick(doc)}
            >
              {/* Content preview area */}
              <div className="relative mb-3 h-24 rounded-lg bg-claude-subtext/[0.03] border border-claude-border/40 overflow-hidden">
                {doc.text_preview ? (
                  <p className="p-2.5 text-[11px] leading-[1.4] text-claude-subtext/60 font-sans line-clamp-5 whitespace-pre-line">
                    {doc.text_preview}
                  </p>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <Icon size={24} className="text-claude-subtext/20" />
                  </div>
                )}
                {/* Fade out bottom */}
                <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white to-transparent" />
                {/* Type badge overlay */}
                <div className="absolute top-2 right-2 flex items-center gap-1">
                  {doc.metadata?.classificationStatus === 'needs_review' && (
                    <span title="Потребує уваги — не вдалося класифікувати">
                      <AlertTriangle size={12} className="text-amber-500" />
                    </span>
                  )}
                  <span
                    className={`inline-flex px-1.5 py-0.5 text-[9px] font-semibold rounded-md border ${
                      DOC_TYPE_COLORS[doc.type] || DOC_TYPE_COLORS.other
                    } font-sans backdrop-blur-sm`}
                  >
                    {DOC_TYPE_LABELS[doc.type] || doc.type}
                  </span>
                </div>
                {/* Context menu overlay */}
                <div className="absolute top-1.5 left-1.5">
                  <CardContextMenu
                    doc={doc}
                    onView={onView}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onMove={onMove}
                  />
                </div>
                {/* Selection checkbox */}
                {hasSelection && (
                  <div className="absolute bottom-2 left-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        onToggleSelect!(doc.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-claude-border text-claude-accent focus:ring-claude-accent/30 cursor-pointer"
                    />
                  </div>
                )}
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
    </div>
  );
}

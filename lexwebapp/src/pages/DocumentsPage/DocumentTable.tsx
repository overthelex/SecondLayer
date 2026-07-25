import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  MoreVertical,
  ChevronUp,
  ChevronDown,
  Eye,
  Pencil,
  Trash2,
  FolderInput,
  Lock,
  AlertTriangle,
} from 'lucide-react';
import type { VaultDocument, SortField, SortOrder } from './types';
import { isEditable, getFileExtension } from './types';
import { DOC_TYPE_LABELS, DOC_TYPE_COLORS, formatDate, formatFileSize, getFileIcon } from './constants';

function SortIcon({ field, sortBy, sortOrder }: { field: SortField; sortBy: SortField; sortOrder: SortOrder }) {
  if (field !== sortBy) {
    return <ChevronDown size={12} className="text-claude-subtext/20" />;
  }
  return sortOrder === 'asc'
    ? <ChevronUp size={12} className="text-claude-text" />
    : <ChevronDown size={12} className="text-claude-text" />;
}

function SortableHeader({
  label,
  field,
  sortBy,
  sortOrder,
  onSort,
  className = '',
}: {
  label: string;
  field: SortField;
  sortBy: SortField;
  sortOrder: SortOrder;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const isActive = field === sortBy;
  return (
    <th
      className={`text-left px-5 py-3 text-[11px] font-semibold uppercase tracking-wider font-sans cursor-pointer select-none transition-colors ${
        isActive ? 'text-claude-text' : 'text-claude-subtext/60 hover:text-claude-text'
      } ${className}`}
      onClick={() => onSort(field)}
      aria-sort={isActive ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <div className="flex items-center gap-1">
        {label}
        <SortIcon field={field} sortBy={sortBy} sortOrder={sortOrder} />
      </div>
    </th>
  );
}

function RowContextMenu({
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
        <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-white border border-claude-border rounded-xl shadow-lg py-1" role="menu">
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

interface DocumentTableProps {
  documents: VaultDocument[];
  sortBy: SortField;
  sortOrder: SortOrder;
  onSort: (field: SortField) => void;
  onDocumentClick: (doc: VaultDocument) => void;
  onView: (doc: VaultDocument) => void;
  onEdit: (doc: VaultDocument) => void;
  onDelete: (doc: VaultDocument) => void;
  onMove: (doc: VaultDocument) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: () => void;
}

export function DocumentTable({
  documents,
  sortBy,
  sortOrder,
  onSort,
  onDocumentClick,
  onView,
  onEdit,
  onDelete,
  onMove,
  selectedIds,
  onToggleSelect,
  onToggleAll,
}: DocumentTableProps) {
  const hasSelection = selectedIds != null && onToggleSelect != null;
  const allSelected = hasSelection && documents.length > 0 && documents.every((d) => selectedIds!.has(d.id));
  const someSelected = hasSelection && documents.some((d) => selectedIds!.has(d.id)) && !allSelected;

  return (
    <div className="bg-white rounded-2xl border border-claude-border shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-claude-border/50">
              {hasSelection && (
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected; }}
                    onChange={onToggleAll}
                    className="rounded border-claude-border text-claude-accent focus:ring-claude-accent/30 cursor-pointer"
                    aria-label="Вибрати всі"
                  />
                </th>
              )}
              <SortableHeader label="Назва" field="title" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="Тип" field="type" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
              <SortableHeader label="Дата" field="uploadedAt" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} />
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-claude-subtext/60 uppercase tracking-wider font-sans">
                Розмір
              </th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-claude-subtext/60 uppercase tracking-wider font-sans hidden md:table-cell">
                Теги
              </th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-claude-border/30">
            {documents.map((doc, index) => {
              const Icon = getFileIcon(doc.metadata?.mimeType);
              const ext = getFileExtension(doc);
              const isSelected = hasSelection && selectedIds!.has(doc.id);
              return (
                <motion.tr
                  key={doc.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  className={`hover:bg-claude-bg/50 transition-colors group cursor-pointer ${
                    isSelected ? 'bg-claude-accent/5' : ''
                  }`}
                  onClick={() => onDocumentClick(doc)}
                >
                  {hasSelection && (
                    <td className="px-3 py-3">
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
                    </td>
                  )}
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Icon
                        size={16}
                        className="text-claude-subtext/40 flex-shrink-0"
                      />
                      <span className="text-sm font-medium text-claude-text truncate max-w-[300px] font-sans">
                        {doc.title}
                      </span>
                      {ext && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-claude-subtext/8 text-claude-subtext/60 rounded font-mono flex-shrink-0 uppercase">
                          {ext.replace('.', '')}
                        </span>
                      )}
                      {doc.metadata?.classificationStatus === 'needs_review' && (
                        <span className="flex-shrink-0" title="Потребує уваги — не вдалося класифікувати">
                          <AlertTriangle size={12} className="text-amber-500" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 text-[10px] font-semibold rounded-md border ${
                        DOC_TYPE_COLORS[doc.type] || DOC_TYPE_COLORS.other
                      } font-sans`}
                    >
                      {DOC_TYPE_LABELS[doc.type] || doc.type}
                    </span>
                    {doc.is_encrypted && (
                      <span className="inline-flex items-center ml-1 px-1.5 py-0.5 text-[9px] font-semibold rounded-md border border-green-300 bg-green-50 text-green-700 font-sans" title="Зашифровано (E2EE)">
                        <Lock size={9} className="mr-0.5" />
                        E2EE
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs text-claude-subtext/60 font-sans whitespace-nowrap">
                    {doc.metadata?.documentDate
                      ? formatDate(doc.metadata.documentDate)
                      : doc.metadata?.uploadedAt
                      ? formatDate(doc.metadata.uploadedAt)
                      : '—'}
                  </td>
                  <td className="px-5 py-3 text-xs text-claude-subtext/60 font-sans whitespace-nowrap">
                    {doc.metadata?.fileSize
                      ? formatFileSize(doc.metadata.fileSize)
                      : '—'}
                  </td>
                  <td className="px-5 py-3 hidden md:table-cell">
                    <div className="flex gap-1 flex-wrap">
                      {doc.metadata?.tags?.slice(0, 3).map((tag: string) => (
                        <span
                          key={tag}
                          className="text-[10px] px-1.5 py-0.5 bg-claude-subtext/5 text-claude-subtext/70 rounded font-sans"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <RowContextMenu
                      doc={doc}
                      onView={onView}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onMove={onMove}
                    />
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

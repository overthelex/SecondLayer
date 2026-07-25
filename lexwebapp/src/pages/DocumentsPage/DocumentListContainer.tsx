import React from 'react';
import { FileText, SearchX, X } from 'lucide-react';
import { DocumentTable } from './DocumentTable';
import { DocumentGrid } from './DocumentGrid';
import type { VaultDocument, ViewMode, SortField, SortOrder } from './types';

function SkeletonRows() {
  return (
    <div className="bg-white rounded-2xl border border-claude-border shadow-sm overflow-hidden">
      <div className="divide-y divide-claude-border/30">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
            <div className="h-4 w-4 bg-claude-border/30 rounded" />
            <div className="h-4 bg-claude-border/30 rounded w-1/3" />
            <div className="h-4 bg-claude-border/30 rounded w-16" />
            <div className="h-4 bg-claude-border/30 rounded w-24" />
            <div className="h-4 bg-claude-border/30 rounded w-14 hidden md:block" />
            <div className="h-4 bg-claude-border/30 rounded w-20 hidden md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

interface DocumentListContainerProps {
  documents: VaultDocument[];
  loading: boolean;
  viewMode: ViewMode;
  sortBy: SortField;
  sortOrder: SortOrder;
  onSort: (field: SortField) => void;
  onDocumentClick: (doc: VaultDocument, index?: number) => void;
  onEdit: (doc: VaultDocument) => void;
  onDelete: (doc: VaultDocument) => void;
  onMove: (doc: VaultDocument) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: () => void;
  // Pagination
  offset: number;
  setOffset: React.Dispatch<React.SetStateAction<number>>;
  totalDocs: number;
  pageSize: number;
  // Search state
  searchQuery: string;
  onClearSearch: () => void;
}

export function DocumentListContainer({
  documents,
  loading,
  viewMode,
  sortBy,
  sortOrder,
  onSort,
  onDocumentClick,
  onEdit,
  onDelete,
  onMove,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  offset,
  setOffset,
  totalDocs,
  pageSize,
  searchQuery,
  onClearSearch,
}: DocumentListContainerProps) {
  const hasMore = offset + pageSize < totalDocs;
  const hasPrev = offset > 0;
  const isSearchActive = searchQuery.trim().length > 0;

  if (loading) {
    return <SkeletonRows />;
  }

  if (documents.length === 0) {
    if (isSearchActive) {
      return (
        <div className="text-center py-20">
          <SearchX size={48} className="mx-auto mb-4 text-claude-subtext/20" />
          <h3 className="text-lg font-semibold text-claude-text mb-2 font-sans">
            Нічого не знайдено
          </h3>
          <p className="text-sm text-claude-subtext/60 font-sans mb-4">
            За запитом «{searchQuery}» не знайдено документів
          </p>
          <button
            onClick={onClearSearch}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-claude-border text-claude-text rounded-xl text-sm font-medium hover:bg-claude-bg transition-colors font-sans"
          >
            <X size={14} />
            Очистити пошук
          </button>
        </div>
      );
    }

    return (
      <div className="text-center py-20">
        <FileText size={48} className="mx-auto mb-4 text-claude-subtext/20" />
        <h3 className="text-lg font-semibold text-claude-text mb-2 font-sans">
          Немає документів
        </h3>
        <p className="text-sm text-claude-subtext/60 font-sans">
          Завантажте документи за допомогою кнопок вище або перетягніть файли
        </p>
      </div>
    );
  }

  return (
    <>
      {viewMode === 'list' ? (
        <DocumentTable
          documents={documents}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={onSort}
          onDocumentClick={onDocumentClick}
          onView={onDocumentClick}
          onEdit={onEdit}
          onDelete={onDelete}
          onMove={onMove}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          onToggleAll={onToggleAll}
        />
      ) : (
        <DocumentGrid
          documents={documents}
          onDocumentClick={onDocumentClick}
          onView={onDocumentClick}
          onEdit={onEdit}
          onDelete={onDelete}
          onMove={onMove}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={onSort}
        />
      )}

      {/* Pagination footer — always show when there are results */}
      {(hasMore || hasPrev || isSearchActive) && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-xs text-claude-subtext/50 font-sans">
            {isSearchActive ? `Знайдено: ` : ''}{offset + 1}–{Math.min(offset + pageSize, totalDocs)} з {totalDocs}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setOffset((prev) => Math.max(0, prev - pageSize))}
              disabled={!hasPrev}
              className="px-4 py-2 rounded-xl text-sm font-sans font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-white border border-claude-border text-claude-text hover:bg-claude-bg"
            >
              Назад
            </button>
            <button
              onClick={() => setOffset((prev) => prev + pageSize)}
              disabled={!hasMore}
              className="px-4 py-2 rounded-xl text-sm font-sans font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-white border border-claude-border text-claude-text hover:bg-claude-bg"
            >
              Далі
            </button>
          </div>
        </div>
      )}

      {/* Simple count when only one page */}
      {!hasMore && !hasPrev && !isSearchActive && (
        <div className="mt-4 text-center">
          <span className="text-xs text-claude-subtext/50 font-sans">
            {totalDocs} документів
          </span>
        </div>
      )}
    </>
  );
}

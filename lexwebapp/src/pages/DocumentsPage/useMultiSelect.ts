/**
 * useMultiSelect — multi-select state and batch actions for DocumentsPage
 */

import { useState, useCallback, useEffect } from 'react';
import { api } from '../../utils/api-client';
import { showToast } from '../../utils/toast';
import type { VaultDocument } from './types';

interface UseMultiSelectOptions {
  documents: VaultDocument[];
  currentFolderPath: string;
  filterType: string;
  searchQuery: string;
  offset: number;
  pushAction: (action: any) => void;
  loadDocuments: () => Promise<void>;
  loadFolders: (prefix: string) => Promise<void>;
  handleMoveOpen: (doc: VaultDocument) => void;
}

export function useMultiSelect({
  documents,
  currentFolderPath,
  filterType,
  searchQuery,
  offset,
  pushAction,
  loadDocuments,
  loadFolders,
  handleMoveOpen,
}: UseMultiSelectOptions) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Clear selection when documents change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [currentFolderPath, filterType, searchQuery, offset]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allSelected = documents.every((d) => prev.has(d.id));
      if (allSelected) return new Set();
      return new Set(documents.map((d) => d.id));
    });
  }, [documents]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(ids.map((id) => api.documents.delete(id)));
      ids.forEach((id) => {
        const doc = documents.find((d) => d.id === id);
        if (doc) pushAction({ type: 'delete', documentId: id, documentTitle: doc.title });
      });
      showToast.success(`${count} документів видалено`);
      setSelectedIds(new Set());
      loadDocuments();
      loadFolders(currentFolderPath);
    } catch (err) {
      console.error('Batch delete failed:', err);
      showToast.error('Не вдалося видалити деякі документи');
    }
  }, [selectedIds, documents, pushAction, loadDocuments, loadFolders, currentFolderPath]);

  const handleBatchMove = useCallback(() => {
    if (selectedIds.size === 0) return;
    const firstDoc = documents.find((d) => selectedIds.has(d.id));
    if (firstDoc) handleMoveOpen(firstDoc);
  }, [selectedIds, documents, handleMoveOpen]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return {
    selectedIds,
    handleToggleSelect,
    handleToggleAll,
    handleBatchDelete,
    handleBatchMove,
    clearSelection,
  };
}

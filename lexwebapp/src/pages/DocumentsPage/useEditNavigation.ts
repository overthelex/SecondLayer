/**
 * useEditNavigation — edit modal navigation and delete-from-edit for DocumentsPage
 */

import { useCallback } from 'react';
import { api } from '../../utils/api-client';
import { showToast } from '../../utils/toast';
import { toastT } from '../../i18n/toast-i18n';
import type { VaultDocument } from './types';

interface UseEditNavigationOptions {
  documents: VaultDocument[];
  editTarget: VaultDocument | null;
  handleEditOpen: (doc: VaultDocument) => void;
  setEditTarget: (doc: VaultDocument | null) => void;
  setDocuments: (docs: VaultDocument[]) => void;
  setTotalDocs: React.Dispatch<React.SetStateAction<number>>;
  pushAction: (action: any) => void;
  undoAction: () => Promise<void>;
  loadDocuments: () => Promise<void>;
  loadFolders: (prefix: string) => Promise<void>;
  currentFolderPath: string;
}

export function useEditNavigation({
  documents,
  editTarget,
  handleEditOpen,
  setEditTarget,
  setDocuments,
  setTotalDocs,
  pushAction,
  undoAction,
  loadDocuments,
  loadFolders,
  currentFolderPath,
}: UseEditNavigationOptions) {
  const editIndex = editTarget ? documents.findIndex((d) => d.id === editTarget.id) : -1;

  const handleEditPrevious = useCallback(() => {
    if (editIndex > 0) handleEditOpen(documents[editIndex - 1]);
  }, [editIndex, documents]);

  const handleEditNext = useCallback(() => {
    if (editIndex < documents.length - 1) handleEditOpen(documents[editIndex + 1]);
  }, [editIndex, documents]);

  const handleEditDelete = useCallback(async () => {
    if (!editTarget) return;
    const idx = documents.findIndex((d) => d.id === editTarget.id);
    try {
      await api.documents.delete(editTarget.id);
      pushAction({ type: 'delete', documentId: editTarget.id, documentTitle: editTarget.title });
      showToast.undoable(`«${editTarget.title}» видалено`, () => {
        undoAction().then(() => { loadDocuments(); loadFolders(currentFolderPath); });
      });
      const newDocs = documents.filter((d) => d.id !== editTarget.id);
      setDocuments(newDocs);
      setTotalDocs((prev) => Math.max(0, prev - 1));
      if (newDocs.length === 0) {
        setEditTarget(null);
      } else if (idx < newDocs.length) {
        handleEditOpen(newDocs[idx]);
      } else {
        handleEditOpen(newDocs[newDocs.length - 1]);
      }
    } catch (err) {
      console.error('Failed to delete document:', err);
      showToast.error(toastT('documentDeleteFailed'));
    }
  }, [editTarget, documents]);

  return {
    editIndex,
    handleEditPrevious,
    handleEditNext,
    handleEditDelete,
  };
}

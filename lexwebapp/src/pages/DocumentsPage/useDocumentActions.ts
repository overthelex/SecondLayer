/**
 * useDocumentActions — document CRUD action handlers for DocumentsPage
 * Handles delete, edit, move operations with undo support
 * Modal state is managed via useDocumentModals reducer.
 */

import { useRef, useCallback } from 'react';
import { api } from '../../utils/api-client';
import { showToast } from '../../utils/toast';
import { useUndoStore } from '../../stores/undoStore';
import { useDocumentModals } from './useDocumentModals';
import type { VaultDocument } from './types';

interface UseDocumentActionsOptions {
  loadDocuments: () => Promise<void>;
  loadFolders: (prefix: string) => Promise<void>;
  currentFolderPath: string;
}

export function useDocumentActions({ loadDocuments, loadFolders, currentFolderPath }: UseDocumentActionsOptions) {
  const pushAction = useUndoStore((s) => s.pushAction);
  const undoAction = useUndoStore((s) => s.undo);

  // All modal state via reducer
  const {
    state: modalState,
    dispatch,
    setDeleteTarget,
    setEditTarget,
    setEditText,
    setMoveTarget,
    setMoveFolder,
  } = useDocumentModals();

  const editOriginalTextRef = useRef<string>('');

  const reload = useCallback(() => {
    loadDocuments();
    loadFolders(currentFolderPath);
  }, [loadDocuments, loadFolders, currentFolderPath]);

  // Delete
  const handleDeleteConfirm = useCallback(async () => {
    if (!modalState.deleteTarget) return;
    dispatch({ type: 'SET_DELETING', value: true });
    try {
      const docId = modalState.deleteTarget.id;
      const docTitle = modalState.deleteTarget.title;
      await api.documents.delete(docId);
      pushAction({ type: 'delete', documentId: docId, documentTitle: docTitle });
      showToast.undoable(`«${docTitle}» видалено`, () => {
        undoAction().then(() => reload());
      });
      dispatch({ type: 'CLOSE_DELETE' });
      reload();
    } catch (err) {
      console.error('Failed to delete document:', err);
    } finally {
      dispatch({ type: 'SET_DELETING', value: false });
    }
  }, [modalState.deleteTarget, pushAction, undoAction, reload, dispatch]);

  // Edit — open modal and fetch full text
  const handleEditOpen = useCallback(async (doc: VaultDocument) => {
    dispatch({ type: 'OPEN_EDIT', target: doc });
    try {
      const resp = await api.documents.getById(doc.id);
      const data = resp.data;
      const text = data.full_text || data.content || '';
      editOriginalTextRef.current = text;
      dispatch({ type: 'SET_EDIT_TEXT', text });
    } catch (err) {
      console.error('Failed to fetch document for editing:', err);
      showToast.error('Не вдалося завантажити документ');
      dispatch({ type: 'CLOSE_EDIT' });
    } finally {
      dispatch({ type: 'SET_EDIT_LOADING', value: false });
    }
  }, [dispatch]);

  // Save edited text
  const handleEditSave = useCallback(async () => {
    if (!modalState.editTarget) return;
    dispatch({ type: 'SET_EDIT_SAVING', value: true });
    try {
      await api.documents.update(modalState.editTarget.id, { full_text: modalState.editText });
      if (modalState.editText !== editOriginalTextRef.current) {
        pushAction({
          type: 'edit',
          documentId: modalState.editTarget.id,
          documentTitle: modalState.editTarget.title,
          previousText: editOriginalTextRef.current,
          newText: modalState.editText,
        });
      }
      showToast.success('Документ збережено');
      dispatch({ type: 'CLOSE_EDIT' });
      loadDocuments();
    } catch (err) {
      console.error('Failed to save document:', err);
    } finally {
      dispatch({ type: 'SET_EDIT_SAVING', value: false });
    }
  }, [modalState.editTarget, modalState.editText, pushAction, loadDocuments, dispatch]);

  // Move — open modal
  const handleMoveOpen = useCallback(async (doc: VaultDocument) => {
    dispatch({ type: 'OPEN_MOVE', target: doc, folder: doc.metadata?.folderPath || '' });
    try {
      const resp = await api.documents.getFolders();
      dispatch({ type: 'SET_MOVE_FOLDERS', folders: resp.data.folders || [] });
    } catch {
      dispatch({ type: 'SET_MOVE_FOLDERS', folders: [] });
    } finally {
      dispatch({ type: 'SET_MOVE_FOLDERS_LOADING', value: false });
    }
  }, [dispatch]);

  const handleMoveBrowse = useCallback(async (prefix: string) => {
    dispatch({ type: 'SET_MOVE_BROWSE_PATH', path: prefix });
    dispatch({ type: 'SET_MOVE_FOLDERS_LOADING', value: true });
    try {
      const resp = await api.documents.getFolders(prefix || undefined);
      dispatch({ type: 'SET_MOVE_FOLDERS', folders: resp.data.folders || [] });
    } catch {
      dispatch({ type: 'SET_MOVE_FOLDERS', folders: [] });
    } finally {
      dispatch({ type: 'SET_MOVE_FOLDERS_LOADING', value: false });
    }
  }, [dispatch]);

  const handleMoveConfirm = useCallback(async () => {
    if (!modalState.moveTarget) return;
    dispatch({ type: 'SET_MOVE_LOADING', value: true });
    try {
      const previousFolder = modalState.moveTarget.metadata?.folderPath || '';
      await api.documents.move(modalState.moveTarget.id, modalState.moveFolder);
      pushAction({
        type: 'move',
        documentId: modalState.moveTarget.id,
        documentTitle: modalState.moveTarget.title,
        previousFolder,
        newFolder: modalState.moveFolder,
      });
      showToast.undoable(
        `Документ переміщено${modalState.moveFolder ? ` до ${modalState.moveFolder}` : ' у корінь'}`,
        () => { undoAction().then(() => reload()); },
      );
      dispatch({ type: 'CLOSE_MOVE' });
      reload();
    } catch (err) {
      console.error('Failed to move document:', err);
      showToast.error('Не вдалося перемістити документ');
    } finally {
      dispatch({ type: 'SET_MOVE_LOADING', value: false });
    }
  }, [modalState.moveTarget, modalState.moveFolder, pushAction, undoAction, reload, dispatch]);

  // Save OCR text
  const handleSaveOcrText = useCallback(async (documentId: string, text: string) => {
    await api.documents.update(documentId, { full_text: text });
    showToast.success('Текст збережено');
  }, []);

  return {
    // Delete
    deleteTarget: modalState.deleteTarget,
    setDeleteTarget,
    deleting: modalState.deleting,
    handleDeleteConfirm,
    // Edit
    editTarget: modalState.editTarget,
    setEditTarget,
    editText: modalState.editText,
    setEditText,
    editLoading: modalState.editLoading,
    editSaving: modalState.editSaving,
    editOriginalTextRef,
    handleEditOpen,
    handleEditSave,
    // Move
    moveTarget: modalState.moveTarget,
    setMoveTarget,
    moveFolder: modalState.moveFolder,
    setMoveFolder,
    moveFolders: modalState.moveFolders,
    moveFoldersLoading: modalState.moveFoldersLoading,
    moveLoading: modalState.moveLoading,
    moveBrowsePath: modalState.moveBrowsePath,
    setMoveBrowsePath: (path: string) => dispatch({ type: 'SET_MOVE_BROWSE_PATH', path }),
    handleMoveOpen,
    handleMoveBrowse,
    handleMoveConfirm,
    // OCR
    handleSaveOcrText,
    // Undo helpers
    pushAction,
    undoAction,
    reload,
  };
}

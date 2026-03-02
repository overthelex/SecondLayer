/**
 * useDocumentActions — document CRUD action handlers for DocumentsPage
 * Handles delete, edit, move operations with undo support
 */

import { useState, useRef, useCallback } from 'react';
import { api } from '../../utils/api-client';
import { showToast } from '../../utils/toast';
import { useUndoStore } from '../../stores/undoStore';
import type { VaultDocument } from './types';

interface UseDocumentActionsOptions {
  loadDocuments: () => Promise<void>;
  loadFolders: (prefix: string) => Promise<void>;
  currentFolderPath: string;
}

export function useDocumentActions({ loadDocuments, loadFolders, currentFolderPath }: UseDocumentActionsOptions) {
  const pushAction = useUndoStore((s) => s.pushAction);
  const undoAction = useUndoStore((s) => s.undo);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<VaultDocument | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Edit state
  const [editTarget, setEditTarget] = useState<VaultDocument | null>(null);
  const [editText, setEditText] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const editOriginalTextRef = useRef<string>('');

  // Move state
  const [moveTarget, setMoveTarget] = useState<VaultDocument | null>(null);
  const [moveFolder, setMoveFolder] = useState('');
  const [moveFolders, setMoveFolders] = useState<string[]>([]);
  const [moveFoldersLoading, setMoveFoldersLoading] = useState(false);
  const [moveLoading, setMoveLoading] = useState(false);
  const [moveBrowsePath, setMoveBrowsePath] = useState('');

  const reload = useCallback(() => {
    loadDocuments();
    loadFolders(currentFolderPath);
  }, [loadDocuments, loadFolders, currentFolderPath]);

  // Delete
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const docId = deleteTarget.id;
      const docTitle = deleteTarget.title;
      await api.documents.delete(docId);
      pushAction({ type: 'delete', documentId: docId, documentTitle: docTitle });
      showToast.undoable(`«${docTitle}» видалено`, () => {
        undoAction().then(() => reload());
      });
      setDeleteTarget(null);
      reload();
    } catch (err) {
      console.error('Failed to delete document:', err);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, pushAction, undoAction, reload]);

  // Edit — open modal and fetch full text
  const handleEditOpen = useCallback(async (doc: VaultDocument) => {
    setEditTarget(doc);
    setEditLoading(true);
    setEditText('');
    try {
      const resp = await api.documents.getById(doc.id);
      const data = resp.data;
      const text = data.full_text || data.content || '';
      editOriginalTextRef.current = text;
      setEditText(text);
    } catch (err) {
      console.error('Failed to fetch document for editing:', err);
      showToast.error('Не вдалося завантажити документ');
      setEditTarget(null);
    } finally {
      setEditLoading(false);
    }
  }, []);

  // Save edited text
  const handleEditSave = useCallback(async () => {
    if (!editTarget) return;
    setEditSaving(true);
    try {
      await api.documents.update(editTarget.id, { full_text: editText });
      if (editText !== editOriginalTextRef.current) {
        pushAction({
          type: 'edit',
          documentId: editTarget.id,
          documentTitle: editTarget.title,
          previousText: editOriginalTextRef.current,
          newText: editText,
        });
      }
      showToast.success('Документ збережено');
      setEditTarget(null);
      loadDocuments();
    } catch (err) {
      console.error('Failed to save document:', err);
    } finally {
      setEditSaving(false);
    }
  }, [editTarget, editText, pushAction, loadDocuments]);

  // Move — open modal
  const handleMoveOpen = useCallback(async (doc: VaultDocument) => {
    setMoveTarget(doc);
    setMoveFolder(doc.metadata?.folderPath || '');
    setMoveBrowsePath('');
    setMoveFoldersLoading(true);
    try {
      const resp = await api.documents.getFolders();
      setMoveFolders(resp.data.folders || []);
    } catch {
      setMoveFolders([]);
    } finally {
      setMoveFoldersLoading(false);
    }
  }, []);

  const handleMoveBrowse = useCallback(async (prefix: string) => {
    setMoveBrowsePath(prefix);
    setMoveFoldersLoading(true);
    try {
      const resp = await api.documents.getFolders(prefix || undefined);
      setMoveFolders(resp.data.folders || []);
    } catch {
      setMoveFolders([]);
    } finally {
      setMoveFoldersLoading(false);
    }
  }, []);

  const handleMoveConfirm = useCallback(async () => {
    if (!moveTarget) return;
    setMoveLoading(true);
    try {
      const previousFolder = moveTarget.metadata?.folderPath || '';
      await api.documents.move(moveTarget.id, moveFolder);
      pushAction({
        type: 'move',
        documentId: moveTarget.id,
        documentTitle: moveTarget.title,
        previousFolder,
        newFolder: moveFolder,
      });
      showToast.undoable(
        `Документ переміщено${moveFolder ? ` до ${moveFolder}` : ' у корінь'}`,
        () => { undoAction().then(() => reload()); },
      );
      setMoveTarget(null);
      reload();
    } catch (err) {
      console.error('Failed to move document:', err);
      showToast.error('Не вдалося перемістити документ');
    } finally {
      setMoveLoading(false);
    }
  }, [moveTarget, moveFolder, pushAction, undoAction, reload]);

  // Save OCR text
  const handleSaveOcrText = useCallback(async (documentId: string, text: string) => {
    await api.documents.update(documentId, { full_text: text });
    showToast.success('Текст збережено');
  }, []);

  return {
    // Delete
    deleteTarget,
    setDeleteTarget,
    deleting,
    handleDeleteConfirm,
    // Edit
    editTarget,
    setEditTarget,
    editText,
    setEditText,
    editLoading,
    editSaving,
    editOriginalTextRef,
    handleEditOpen,
    handleEditSave,
    // Move
    moveTarget,
    setMoveTarget,
    moveFolder,
    setMoveFolder,
    moveFolders,
    moveFoldersLoading,
    moveLoading,
    moveBrowsePath,
    setMoveBrowsePath,
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

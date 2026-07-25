/**
 * useDocumentModals — useReducer-based modal state for DocumentsPage
 * Consolidates delete, edit, and move modal state into a single reducer.
 */

import { useReducer, useCallback } from 'react';
import type { VaultDocument } from './types';

// ── State ──────────────────────────────────────────────────────────

export interface ModalState {
  // Delete modal
  deleteTarget: VaultDocument | null;
  deleting: boolean;

  // Edit modal
  editTarget: VaultDocument | null;
  editText: string;
  editLoading: boolean;
  editSaving: boolean;

  // Move modal
  moveTarget: VaultDocument | null;
  moveFolder: string;
  moveFolders: string[];
  moveFoldersLoading: boolean;
  moveLoading: boolean;
  moveBrowsePath: string;
}

const initialState: ModalState = {
  deleteTarget: null,
  deleting: false,
  editTarget: null,
  editText: '',
  editLoading: false,
  editSaving: false,
  moveTarget: null,
  moveFolder: '',
  moveFolders: [],
  moveFoldersLoading: false,
  moveLoading: false,
  moveBrowsePath: '',
};

// ── Actions ────────────────────────────────────────────────────────

export type ModalAction =
  // Delete
  | { type: 'OPEN_DELETE'; target: VaultDocument }
  | { type: 'CLOSE_DELETE' }
  | { type: 'SET_DELETING'; value: boolean }
  // Edit
  | { type: 'OPEN_EDIT'; target: VaultDocument }
  | { type: 'CLOSE_EDIT' }
  | { type: 'SET_EDIT_TEXT'; text: string }
  | { type: 'SET_EDIT_LOADING'; value: boolean }
  | { type: 'SET_EDIT_SAVING'; value: boolean }
  // Move
  | { type: 'OPEN_MOVE'; target: VaultDocument; folder: string }
  | { type: 'CLOSE_MOVE' }
  | { type: 'SET_MOVE_FOLDER'; folder: string }
  | { type: 'SET_MOVE_FOLDERS'; folders: string[] }
  | { type: 'SET_MOVE_FOLDERS_LOADING'; value: boolean }
  | { type: 'SET_MOVE_LOADING'; value: boolean }
  | { type: 'SET_MOVE_BROWSE_PATH'; path: string };

// ── Reducer ────────────────────────────────────────────────────────

function modalReducer(state: ModalState, action: ModalAction): ModalState {
  switch (action.type) {
    // Delete
    case 'OPEN_DELETE':
      return { ...state, deleteTarget: action.target };
    case 'CLOSE_DELETE':
      return { ...state, deleteTarget: null };
    case 'SET_DELETING':
      return { ...state, deleting: action.value };

    // Edit
    case 'OPEN_EDIT':
      return { ...state, editTarget: action.target, editText: '', editLoading: true };
    case 'CLOSE_EDIT':
      return { ...state, editTarget: null, editText: '', editLoading: false };
    case 'SET_EDIT_TEXT':
      return { ...state, editText: action.text };
    case 'SET_EDIT_LOADING':
      return { ...state, editLoading: action.value };
    case 'SET_EDIT_SAVING':
      return { ...state, editSaving: action.value };

    // Move
    case 'OPEN_MOVE':
      return {
        ...state,
        moveTarget: action.target,
        moveFolder: action.folder,
        moveBrowsePath: '',
        moveFoldersLoading: true,
      };
    case 'CLOSE_MOVE':
      return {
        ...state,
        moveTarget: null,
        moveFolder: '',
        moveFolders: [],
        moveFoldersLoading: false,
        moveLoading: false,
        moveBrowsePath: '',
      };
    case 'SET_MOVE_FOLDER':
      return { ...state, moveFolder: action.folder };
    case 'SET_MOVE_FOLDERS':
      return { ...state, moveFolders: action.folders };
    case 'SET_MOVE_FOLDERS_LOADING':
      return { ...state, moveFoldersLoading: action.value };
    case 'SET_MOVE_LOADING':
      return { ...state, moveLoading: action.value };
    case 'SET_MOVE_BROWSE_PATH':
      return { ...state, moveBrowsePath: action.path };

    default:
      return state;
  }
}

// ── Hook ───────────────────────────────────────────────────────────

export function useDocumentModals() {
  const [state, dispatch] = useReducer(modalReducer, initialState);

  // Convenience setters that match the old useState API
  const setDeleteTarget = useCallback(
    (target: VaultDocument | null) => {
      if (target) dispatch({ type: 'OPEN_DELETE', target });
      else dispatch({ type: 'CLOSE_DELETE' });
    },
    [],
  );

  const setEditTarget = useCallback(
    (target: VaultDocument | null) => {
      if (target) dispatch({ type: 'OPEN_EDIT', target });
      else dispatch({ type: 'CLOSE_EDIT' });
    },
    [],
  );

  const setEditText = useCallback(
    (text: string) => dispatch({ type: 'SET_EDIT_TEXT', text }),
    [],
  );

  const setMoveTarget = useCallback(
    (target: VaultDocument | null) => {
      if (target) dispatch({ type: 'OPEN_MOVE', target, folder: target.metadata?.folderPath || '' });
      else dispatch({ type: 'CLOSE_MOVE' });
    },
    [],
  );

  const setMoveFolder = useCallback(
    (folder: string) => dispatch({ type: 'SET_MOVE_FOLDER', folder }),
    [],
  );

  return {
    state,
    dispatch,
    // Convenience setters (backward-compatible with useState API)
    setDeleteTarget,
    setEditTarget,
    setEditText,
    setMoveTarget,
    setMoveFolder,
  };
}

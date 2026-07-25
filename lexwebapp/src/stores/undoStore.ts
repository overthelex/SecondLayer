import { create } from 'zustand';
import { api } from '../utils/api-client';

export type UndoActionType = 'delete' | 'edit' | 'move';

export interface UndoAction {
  type: UndoActionType;
  documentId: string;
  documentTitle: string;
  timestamp: number;
  // delete: no extra data needed (restore/re-delete via API)
  // edit: store previous and new text
  previousText?: string;
  newText?: string;
  // move: store previous and new folder
  previousFolder?: string;
  newFolder?: string;
}

const MAX_STACK_SIZE = 50;
const ACTION_TTL_MS = 10 * 60 * 1000; // 10 minutes

function pruneExpired(stack: UndoAction[]): UndoAction[] {
  const cutoff = Date.now() - ACTION_TTL_MS;
  return stack.filter((a) => a.timestamp > cutoff);
}

interface UndoState {
  undoStack: UndoAction[];
  redoStack: UndoAction[];
  onActionExecuted: (() => void) | null;

  setOnActionExecuted: (cb: (() => void) | null) => void;
  pushAction: (action: Omit<UndoAction, 'timestamp'>) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const useUndoStore = create<UndoState>((set, get) => ({
  undoStack: [],
  redoStack: [],
  onActionExecuted: null,

  setOnActionExecuted: (cb) => set({ onActionExecuted: cb }),

  pushAction: (action) => {
    const full: UndoAction = { ...action, timestamp: Date.now() };
    set((state) => ({
      undoStack: pruneExpired([full, ...state.undoStack]).slice(0, MAX_STACK_SIZE),
      redoStack: [], // clear redo on new action
    }));
  },

  undo: async () => {
    const { undoStack, onActionExecuted } = get();
    const stack = pruneExpired(undoStack);
    if (stack.length === 0) return;

    const [action, ...rest] = stack;
    set({ undoStack: rest });

    try {
      switch (action.type) {
        case 'delete':
          await api.documents.restore(action.documentId);
          break;
        case 'edit':
          if (action.previousText !== undefined) {
            await api.documents.update(action.documentId, { full_text: action.previousText });
          }
          break;
        case 'move':
          if (action.previousFolder !== undefined) {
            await api.documents.move(action.documentId, action.previousFolder);
          }
          break;
      }

      set((state) => ({
        redoStack: [action, ...state.redoStack].slice(0, MAX_STACK_SIZE),
      }));

      onActionExecuted?.();
    } catch (err) {
      // Restore the action back to undo stack on failure
      set((state) => ({ undoStack: [action, ...state.undoStack] }));
      throw err;
    }
  },

  redo: async () => {
    const { redoStack, onActionExecuted } = get();
    if (redoStack.length === 0) return;

    const [action, ...rest] = redoStack;
    set({ redoStack: rest });

    try {
      switch (action.type) {
        case 'delete':
          await api.documents.delete(action.documentId);
          break;
        case 'edit':
          if (action.newText !== undefined) {
            await api.documents.update(action.documentId, { full_text: action.newText });
          }
          break;
        case 'move':
          if (action.newFolder !== undefined) {
            await api.documents.move(action.documentId, action.newFolder);
          }
          break;
      }

      set((state) => ({
        undoStack: [action, ...state.undoStack].slice(0, MAX_STACK_SIZE),
      }));

      onActionExecuted?.();
    } catch (err) {
      // Restore the action back to redo stack on failure
      set((state) => ({ redoStack: [action, ...state.redoStack] }));
      throw err;
    }
  },

  canUndo: () => pruneExpired(get().undoStack).length > 0,
  canRedo: () => get().redoStack.length > 0,
}));

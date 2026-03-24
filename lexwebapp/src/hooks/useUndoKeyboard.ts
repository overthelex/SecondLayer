import { useEffect } from 'react';
import { useUndoStore } from '../stores/undoStore';
import { showToast } from '../utils/toast';
import { toastT } from '../i18n/toast-i18n';

export function useUndoKeyboard() {
  const undo = useUndoStore((s) => s.undo);
  const redo = useUndoStore((s) => s.redo);
  const canUndo = useUndoStore((s) => s.canUndo);
  const canRedo = useUndoStore((s) => s.canRedo);

  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      // Skip when focus is in text-editable elements (preserve native undo)
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }

      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;

      // Ctrl+Shift+Z or Cmd+Shift+Z → redo
      if (e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        if (!canRedo()) return;
        try {
          await redo();
        } catch {
          showToast.error(toastT('redoFailed'));
        }
        return;
      }

      // Ctrl+Y / Cmd+Y → redo
      if (e.key === 'y') {
        e.preventDefault();
        if (!canRedo()) return;
        try {
          await redo();
        } catch {
          showToast.error(toastT('redoFailed'));
        }
        return;
      }

      // Ctrl+Z / Cmd+Z → undo
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (!canUndo()) return;
        try {
          await undo();
        } catch {
          showToast.error(toastT('undoFailed'));
        }
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo, canUndo, canRedo]);
}

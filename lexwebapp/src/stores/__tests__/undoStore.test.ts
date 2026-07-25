/**
 * undoStore Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock API client
vi.mock('../../utils/api-client', () => ({
  api: {
    documents: {
      restore: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      move: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { useUndoStore } from '../undoStore';
import { api } from '../../utils/api-client';

describe('undoStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUndoStore.setState({
      undoStack: [],
      redoStack: [],
      onActionExecuted: null,
    });
  });

  describe('pushAction', () => {
    it('should add action to undo stack', () => {
      useUndoStore.getState().pushAction({
        type: 'delete',
        documentId: 'doc-1',
        documentTitle: 'Test Doc',
      });

      const state = useUndoStore.getState();
      expect(state.undoStack).toHaveLength(1);
      expect(state.undoStack[0].documentId).toBe('doc-1');
      expect(state.undoStack[0].timestamp).toBeGreaterThan(0);
    });

    it('should clear redo stack on new action', () => {
      useUndoStore.setState({
        redoStack: [{
          type: 'delete',
          documentId: 'old-doc',
          documentTitle: 'Old',
          timestamp: Date.now(),
        }],
      });

      useUndoStore.getState().pushAction({
        type: 'delete',
        documentId: 'new-doc',
        documentTitle: 'New',
      });

      expect(useUndoStore.getState().redoStack).toHaveLength(0);
    });

    it('should prepend new actions (most recent first)', () => {
      useUndoStore.getState().pushAction({
        type: 'delete',
        documentId: 'doc-1',
        documentTitle: 'First',
      });
      useUndoStore.getState().pushAction({
        type: 'delete',
        documentId: 'doc-2',
        documentTitle: 'Second',
      });

      const stack = useUndoStore.getState().undoStack;
      expect(stack[0].documentId).toBe('doc-2');
      expect(stack[1].documentId).toBe('doc-1');
    });

    it('should limit stack to 50 items', () => {
      for (let i = 0; i < 60; i++) {
        useUndoStore.getState().pushAction({
          type: 'delete',
          documentId: `doc-${i}`,
          documentTitle: `Doc ${i}`,
        });
      }

      expect(useUndoStore.getState().undoStack.length).toBeLessThanOrEqual(50);
    });
  });

  describe('undo', () => {
    it('should call restore API for delete undo', async () => {
      useUndoStore.getState().pushAction({
        type: 'delete',
        documentId: 'doc-1',
        documentTitle: 'Test',
      });

      await useUndoStore.getState().undo();

      expect(api.documents.restore).toHaveBeenCalledWith('doc-1');
      expect(useUndoStore.getState().undoStack).toHaveLength(0);
      expect(useUndoStore.getState().redoStack).toHaveLength(1);
    });

    it('should call update API for edit undo', async () => {
      useUndoStore.getState().pushAction({
        type: 'edit',
        documentId: 'doc-1',
        documentTitle: 'Test',
        previousText: 'old text',
        newText: 'new text',
      });

      await useUndoStore.getState().undo();

      expect(api.documents.update).toHaveBeenCalledWith('doc-1', { full_text: 'old text' });
    });

    it('should call move API for move undo', async () => {
      useUndoStore.getState().pushAction({
        type: 'move',
        documentId: 'doc-1',
        documentTitle: 'Test',
        previousFolder: 'folder-a',
        newFolder: 'folder-b',
      });

      await useUndoStore.getState().undo();

      expect(api.documents.move).toHaveBeenCalledWith('doc-1', 'folder-a');
    });

    it('should restore action to undo stack on failure', async () => {
      vi.mocked(api.documents.restore).mockRejectedValueOnce(new Error('API error'));

      useUndoStore.getState().pushAction({
        type: 'delete',
        documentId: 'doc-1',
        documentTitle: 'Test',
      });

      await expect(useUndoStore.getState().undo()).rejects.toThrow('API error');
      expect(useUndoStore.getState().undoStack).toHaveLength(1);
    });

    it('should do nothing when stack is empty', async () => {
      await useUndoStore.getState().undo();
      expect(api.documents.restore).not.toHaveBeenCalled();
    });

    it('should call onActionExecuted callback', async () => {
      const callback = vi.fn();
      useUndoStore.getState().setOnActionExecuted(callback);

      useUndoStore.getState().pushAction({
        type: 'delete',
        documentId: 'doc-1',
        documentTitle: 'Test',
      });

      await useUndoStore.getState().undo();

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('redo', () => {
    it('should call delete API for delete redo', async () => {
      useUndoStore.getState().pushAction({
        type: 'delete',
        documentId: 'doc-1',
        documentTitle: 'Test',
      });
      await useUndoStore.getState().undo();

      await useUndoStore.getState().redo();

      expect(api.documents.delete).toHaveBeenCalledWith('doc-1');
      expect(useUndoStore.getState().undoStack).toHaveLength(1);
      expect(useUndoStore.getState().redoStack).toHaveLength(0);
    });

    it('should do nothing when redo stack is empty', async () => {
      await useUndoStore.getState().redo();
      expect(api.documents.delete).not.toHaveBeenCalled();
    });
  });

  describe('canUndo / canRedo', () => {
    it('should return false when stacks are empty', () => {
      expect(useUndoStore.getState().canUndo()).toBe(false);
      expect(useUndoStore.getState().canRedo()).toBe(false);
    });

    it('should return true when items exist', () => {
      useUndoStore.getState().pushAction({
        type: 'delete',
        documentId: 'doc-1',
        documentTitle: 'Test',
      });

      expect(useUndoStore.getState().canUndo()).toBe(true);
      expect(useUndoStore.getState().canRedo()).toBe(false);
    });

    it('canUndo should filter expired actions', () => {
      // Manually add an expired action
      useUndoStore.setState({
        undoStack: [{
          type: 'delete',
          documentId: 'doc-1',
          documentTitle: 'Test',
          timestamp: Date.now() - 11 * 60 * 1000, // 11 minutes ago (expired)
        }],
      });

      expect(useUndoStore.getState().canUndo()).toBe(false);
    });
  });

  describe('expiration', () => {
    it('should prune expired actions on push', () => {
      // Add an expired action manually
      useUndoStore.setState({
        undoStack: [{
          type: 'delete',
          documentId: 'old-doc',
          documentTitle: 'Old',
          timestamp: Date.now() - 11 * 60 * 1000,
        }],
      });

      useUndoStore.getState().pushAction({
        type: 'delete',
        documentId: 'new-doc',
        documentTitle: 'New',
      });

      const stack = useUndoStore.getState().undoStack;
      expect(stack).toHaveLength(1);
      expect(stack[0].documentId).toBe('new-doc');
    });
  });
});

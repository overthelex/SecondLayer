/**
 * Upload Store - Zustand state for file uploads
 */

import { create } from 'zustand';
import {
  uploadManager,
  UploadManager,
  UploadItem,
  UploadEvent,
} from '../services/upload/UploadManager';
import { uploadService, ActiveSession } from '../services/api/UploadService';
import { matterService } from '../services/api/MatterService';
import { showToast } from '../utils/toast';
import { useEncryptionStore } from './encryptionStore';
import { encryptUploadedDocuments } from '../services/crypto/PostUploadEncryptor';

export interface RecoveredSession {
  uploadId: string;
  fileName: string;
  status: 'recovering' | 'completed' | 'failed';
  documentId?: string;
  error?: string;
}

interface UploadState {
  items: UploadItem[];
  isUploading: boolean;
  isPaused: boolean;
  globalProgress: number;
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  totalBytes: number;
  uploadedBytes: number;
  concurrency: number;

  // Server backpressure state
  serverQueueDepth: number;
  isThrottled: boolean;

  // Recovery state
  recoveredSessions: RecoveredSession[];
  isRecovering: boolean;

  // Actions
  addFiles: (
    files: Array<{
      file: File;
      mimeType: string;
      relativePath: string;
      docType: string;
    }>
  ) => void;
  startUpload: () => void;
  pauseUpload: () => void;
  resumeUpload: () => void;
  cancelFile: (itemId: string) => void;
  cancelAll: () => void;
  retryFile: (itemId: string) => void;
  retryAllFailed: () => void;
  removeFile: (itemId: string) => void;
  clearFinished: () => void;
  updateDocType: (itemId: string, docType: string) => void;
  updateAllDocTypes: (docType: string) => void;
  setConcurrency: (n: number) => void;
  recoverSessions: () => Promise<void>;
  dismissRecoveredSession: (uploadId: string) => void;
  clearRecoveredSessions: () => void;
}

function syncFromManager(manager: UploadManager) {
  const items = manager.getItems();
  const stats = manager.getStats();
  return {
    items: [...items],
    totalFiles: stats.total,
    completedFiles: stats.completed,
    failedFiles: stats.failed,
    totalBytes: stats.totalBytes,
    uploadedBytes: stats.uploadedBytes,
  };
}

// Track active poll controllers per uploadId for cancellation
const activePollControllers = new Map<string, AbortController>();

export const useUploadStore = create<UploadState>((set) => {
  // Subscribe to upload manager events
  uploadManager.subscribe((event: UploadEvent) => {
    const sync = syncFromManager(uploadManager);
    if (event.type === 'all-completed') {
      set({ ...sync, isUploading: false });

      // Auto-create matter from completed uploads (fire-and-forget)
      const completedItems = sync.items.filter(i => i.status === 'completed');
      if (completedItems.length >= 1) {
        // Collect documentIds from completed items; some may not have documentId yet
        const knownIds = completedItems.map(i => i.documentId).filter(Boolean) as string[];

        if (knownIds.length > 0) {
          matterService.autoCreateFromUpload(knownIds).then(result => {
            showToast.success(
              `Створено справу "${result.matter.matter_name}" (${result.documentsAssigned} документів)`
            );
          }).catch(err => {
            console.warn('[UploadStore] Auto-create matter failed (non-critical)', err);
          });
        } else {
          // documentIds not yet available — fetch recent docs from upload sessions
          const uploadIds = completedItems.map(i => i.uploadId).filter(Boolean) as string[];
          if (uploadIds.length > 0) {
            // Small delay to let backend finish processing
            setTimeout(() => {
              Promise.all(uploadIds.map(id => uploadService.getStatus(id).catch(() => null)))
                .then(sessions => {
                  const docIds = sessions
                    .filter(s => s && s.documentId)
                    .map(s => s!.documentId!) as string[];
                  if (docIds.length > 0) {
                    return matterService.autoCreateFromUpload(docIds);
                  }
                  return null;
                })
                .then(result => {
                  if (result) {
                    showToast.success(
                      `Створено справу "${result.matter.matter_name}" (${result.documentsAssigned} документів)`
                    );
                  }
                })
                .catch(err => {
                  console.warn('[UploadStore] Auto-create matter (deferred) failed', err);
                });
            }, 5000);
          }
        }
      }

      // Post-upload encryption: always encrypt completed documents (E2EE mandatory)
      const encState = useEncryptionStore.getState();
      if (encState.isUnlocked && encState.publicKey) {
        const docIds = completedItems.map(i => i.documentId).filter(Boolean) as string[];
        if (docIds.length > 0) {
          encryptUploadedDocuments(docIds, encState.publicKey).then(results => {
            const succeeded = results.filter(r => r.success).length;
            const failed = results.filter(r => !r.success).length;
            if (succeeded > 0) {
              showToast.success(`Зашифровано ${succeeded} документів`);
            }
            if (failed > 0) {
              showToast.error(`Не вдалося зашифрувати ${failed} документів`);
            }
          }).catch(err => {
            console.warn('[UploadStore] Post-upload encryption failed', err);
          });
        }
      }
    } else if (event.type === 'throttle-changed') {
      set({
        ...sync,
        isThrottled: event.isThrottled ?? false,
        serverQueueDepth: event.serverQueueDepth ?? 0,
      });
    } else {
      set(sync);
    }
  });

  return {
    items: [],
    isUploading: false,
    isPaused: false,
    globalProgress: 0,
    totalFiles: 0,
    completedFiles: 0,
    failedFiles: 0,
    totalBytes: 0,
    uploadedBytes: 0,
    concurrency: uploadManager.getConcurrency(),
    serverQueueDepth: 0,
    isThrottled: false,
    recoveredSessions: [],
    isRecovering: false,

    addFiles: (files) => {
      // E2EE is mandatory — always encrypt uploads
      const filesWithEncrypt = files.map(f => ({
        ...f,
        encrypt: true,
      }));
      uploadManager.addFiles(filesWithEncrypt);
      set(syncFromManager(uploadManager));
    },

    startUpload: () => {
      uploadManager.start();
      set({ isUploading: true, isPaused: false, ...syncFromManager(uploadManager) });
    },

    pauseUpload: () => {
      uploadManager.pause();
      set({ isPaused: true, ...syncFromManager(uploadManager) });
    },

    resumeUpload: () => {
      uploadManager.resume();
      set({ isPaused: false, ...syncFromManager(uploadManager) });
    },

    cancelFile: async (itemId) => {
      await uploadManager.cancelFile(itemId);
      set(syncFromManager(uploadManager));
    },

    cancelAll: async () => {
      await uploadManager.cancelAll();
      set({ isUploading: false, isPaused: false, ...syncFromManager(uploadManager) });
    },

    retryFile: (itemId) => {
      uploadManager.retryFile(itemId);
      set(syncFromManager(uploadManager));
    },

    retryAllFailed: () => {
      uploadManager.retryAllFailed();
      set(syncFromManager(uploadManager));
    },

    removeFile: (itemId) => {
      uploadManager.removeFile(itemId);
      set(syncFromManager(uploadManager));
    },

    clearFinished: () => {
      uploadManager.clearFinished();
      set(syncFromManager(uploadManager));
    },

    updateDocType: (itemId, docType) => {
      uploadManager.updateDocType(itemId, docType);
      set({ items: [...uploadManager.getItems()] });
    },

    updateAllDocTypes: (docType) => {
      uploadManager.updateAllDocTypes(docType);
      set({ items: [...uploadManager.getItems()] });
    },

    setConcurrency: (n) => {
      uploadManager.setConcurrency(n);
      set({ concurrency: uploadManager.getConcurrency() });
    },

    recoverSessions: async () => {
      try {
        set({ isRecovering: true });
        const sessions = await uploadService.getActiveSessions();
        const stuck = sessions.filter(
          (s: ActiveSession) => s.status === 'assembling' || s.status === 'processing'
        );

        if (stuck.length === 0) {
          set({ isRecovering: false });
          return;
        }

        const recovered: RecoveredSession[] = stuck.map((s: ActiveSession) => ({
          uploadId: s.uploadId,
          fileName: s.fileName,
          status: 'recovering' as const,
        }));
        set({ recoveredSessions: recovered });

        // Poll each session until it resolves
        for (const s of stuck) {
          const controller = new AbortController();
          activePollControllers.set(s.uploadId, controller);
          pollRecovery(s.uploadId, controller.signal, set);
        }
      } catch (err) {
        console.error('[UploadStore] Recovery check failed:', err);
        set({ isRecovering: false });
      }
    },

    dismissRecoveredSession: (uploadId) => {
      activePollControllers.get(uploadId)?.abort();
      activePollControllers.delete(uploadId);
      set((state) => ({
        recoveredSessions: state.recoveredSessions.filter((s) => s.uploadId !== uploadId),
      }));
    },

    clearRecoveredSessions: () => {
      activePollControllers.forEach((controller) => controller.abort());
      activePollControllers.clear();
      set({ recoveredSessions: [], isRecovering: false });
    },
  };
});

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

function finalizePollSession(
  uploadId: string,
  result: Partial<RecoveredSession>,
  set: (fn: (state: UploadState) => Partial<UploadState>) => void
) {
  activePollControllers.delete(uploadId);
  set((state) => ({
    recoveredSessions: state.recoveredSessions.map((s) =>
      s.uploadId === uploadId ? { ...s, ...result } : s
    ),
    isRecovering: state.recoveredSessions.some(
      (s) => s.uploadId !== uploadId && s.status === 'recovering'
    ),
  }));
}

async function pollRecovery(
  uploadId: string,
  signal: AbortSignal,
  set: (fn: (state: UploadState) => Partial<UploadState>) => void
) {
  const maxPolls = 60; // 5 minutes at 5s intervals
  for (let i = 0; i < maxPolls; i++) {
    try {
      await abortableSleep(5000, signal);
    } catch {
      return; // Aborted — clean exit
    }

    if (signal.aborted) return;

    try {
      const status = await uploadService.getStatus(uploadId);
      if (signal.aborted) return;

      if (status.status === 'completed') {
        finalizePollSession(uploadId, { status: 'completed', documentId: status.documentId }, set);
        return;
      }
      if (status.status === 'failed') {
        finalizePollSession(uploadId, { status: 'failed', error: status.errorMessage }, set);
        return;
      }
      // Still processing — continue polling
    } catch {
      if (signal.aborted) return;
      // Network error — continue polling
    }
  }

  // Timed out
  if (!signal.aborted) {
    finalizePollSession(uploadId, { status: 'failed', error: 'Recovery poll timed out' }, set);
  }
}

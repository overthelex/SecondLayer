import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Pause,
  Play,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useUploadStore } from '../../stores/uploadStore';
import { UploadItemRow } from './UploadItemRow';
import { formatFileSize } from './constants';

interface UploadQueuePanelProps {
  showUploadPanel: boolean;
  setShowUploadPanel: (show: boolean) => void;
}

export function UploadQueuePanel({
  showUploadPanel,
  setShowUploadPanel,
}: UploadQueuePanelProps) {
  // State values via shallow selector to avoid full-store re-renders
  const {
    items: uploadItems,
    isUploading,
    isPaused,
    totalFiles,
    completedFiles,
    failedFiles,
    totalBytes,
    uploadedBytes,
  } = useUploadStore(useShallow(s => ({
    items: s.items,
    isUploading: s.isUploading,
    isPaused: s.isPaused,
    totalFiles: s.totalFiles,
    completedFiles: s.completedFiles,
    failedFiles: s.failedFiles,
    totalBytes: s.totalBytes,
    uploadedBytes: s.uploadedBytes,
  })));

  // Actions (stable refs)
  const pauseUpload = useUploadStore(s => s.pauseUpload);
  const resumeUpload = useUploadStore(s => s.resumeUpload);
  const cancelFile = useUploadStore(s => s.cancelFile);
  const cancelAll = useUploadStore(s => s.cancelAll);
  const retryFile = useUploadStore(s => s.retryFile);
  const retryAllFailed = useUploadStore(s => s.retryAllFailed);
  const removeFile = useUploadStore(s => s.removeFile);
  const clearFinished = useUploadStore(s => s.clearFinished);
  const updateDocType = useUploadStore(s => s.updateDocType);

  const uploadQueueRef = useRef<HTMLDivElement>(null);

  // Auto-scroll upload queue to the first active item
  useEffect(() => {
    if (!isUploading || !uploadQueueRef.current) return;
    const activeEl = uploadQueueRef.current.querySelector('[data-upload-active="true"]');
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [uploadItems, isUploading]);

  const queuedCount = uploadItems.filter((i) => i.status === 'queued').length;
  const activeCount = uploadItems.filter((i) =>
    ['initializing', 'uploading', 'assembling', 'processing'].includes(i.status)
  ).length;
  const doneCount = completedFiles;
  const errorCount = failedFiles;
  const globalProgress = totalBytes > 0 ? uploadedBytes / totalBytes : 0;

  return (
    <AnimatePresence>
      {showUploadPanel && uploadItems.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mb-6 bg-white rounded-2xl border border-claude-border shadow-sm overflow-hidden"
        >
          {/* Queue header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-claude-border/50">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold text-claude-text font-sans">
                Черга завантаження
              </h3>
              <span className="text-xs text-claude-subtext/60 font-sans">
                {totalFiles} файлів
                {doneCount > 0 && ` · ${doneCount} готово`}
                {errorCount > 0 && ` · ${errorCount} помилок`}
                {activeCount > 0 && ` · ${activeCount} активних`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* Pause/Resume */}
              {isUploading && (
                <button
                  onClick={isPaused ? resumeUpload : pauseUpload}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-claude-border rounded-lg hover:bg-claude-bg transition-colors font-sans"
                  title={isPaused ? 'Продовжити' : 'Пауза'}
                >
                  {isPaused ? <Play size={12} /> : <Pause size={12} />}
                  {isPaused ? 'Продовжити' : 'Пауза'}
                </button>
              )}

              {/* Retry all failed */}
              {errorCount > 0 && !isUploading && (
                <button
                  onClick={retryAllFailed}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors font-sans"
                >
                  <RotateCcw size={12} />
                  Повторити ({errorCount})
                </button>
              )}

              {doneCount > 0 && (
                <button
                  onClick={clearFinished}
                  className="text-xs text-claude-subtext hover:text-claude-text transition-colors font-sans"
                >
                  Очистити готові
                </button>
              )}

              {/* Cancel all */}
              {isUploading && (
                <button
                  onClick={cancelAll}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors font-sans"
                >
                  <XCircle size={12} />
                  Скасувати все
                </button>
              )}

              <button
                onClick={() => {
                  if (!isUploading) {
                    clearFinished();
                    setShowUploadPanel(false);
                  }
                }}
                className="p-1 text-claude-subtext hover:text-claude-text transition-colors"
                disabled={isUploading}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Global progress bar */}
          {(isUploading || doneCount > 0) && (
            <div className="px-5 py-2 border-b border-claude-border/30">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-claude-subtext/60 font-sans">
                  {formatFileSize(uploadedBytes)} / {formatFileSize(totalBytes)}
                </span>
                <span className="text-[10px] text-claude-subtext/60 font-sans">
                  {Math.round(globalProgress * 100)}%
                </span>
              </div>
              <div className="h-1.5 bg-claude-border/30 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${isPaused ? 'bg-amber-400' : 'bg-claude-accent'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${globalProgress * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
          )}

          {/* Queue items */}
          <div ref={uploadQueueRef} className="max-h-[300px] overflow-y-auto divide-y divide-claude-border/30">
            {uploadItems.map((item) => (
              <UploadItemRow
                key={item.id}
                item={item}
                onRemove={removeFile}
                onCancel={cancelFile}
                onRetry={retryFile}
                onDocTypeChange={updateDocType}
              />
            ))}
          </div>

          {/* Queue footer — queued count (upload starts automatically) */}
          {queuedCount > 0 && !isUploading && (
            <div className="px-5 py-3 border-t border-claude-border/50">
              <span className="text-xs text-claude-subtext/60 font-sans">
                {queuedCount} файлів в черзі
              </span>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}


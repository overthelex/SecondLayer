import React, { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FolderUp, Shield } from 'lucide-react';
import type { DocType } from './types';
import { useEncryptionStore } from '../../stores/encryptionStore';
import { EncryptionSetupDialog } from '../../components/encryption/EncryptionSetupDialog';

const ACCEPTED_TYPES =
  '.pdf,.docx,.doc,.html,.htm,.txt,.rtf,.jpg,.jpeg,.png,.bmp,.gif,.xlsx,.xls,.csv,.mp4,.mov,.avi,.mkv,.webm,.eml,.zip,.gz,.tgz,.tar';

function guessMimeType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    html: 'text/html',
    htm: 'text/html',
    txt: 'text/plain',
    rtf: 'application/rtf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    bmp: 'image/bmp',
    gif: 'image/gif',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    csv: 'text/csv',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
    webm: 'video/webm',
    eml: 'message/rfc822',
    zip: 'application/zip',
    gz: 'application/gzip',
    tgz: 'application/x-tgz',
    tar: 'application/x-tar',
  };
  return map[ext || ''] || 'application/octet-stream';
}

// Recursively read FileSystemEntry items (for drag-and-drop folder support)
async function readEntries(entries: any[]): Promise<File[]> {
  const files: File[] = [];

  async function processEntry(entry: any): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve) => entry.file(resolve));
      files.push(file);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const subEntries = await new Promise<any[]>((resolve) => {
        const allEntries: any[] = [];
        const readBatch = () => {
          reader.readEntries((batch: any[]) => {
            if (batch.length === 0) {
              resolve(allEntries);
            } else {
              allEntries.push(...batch);
              readBatch();
            }
          });
        };
        readBatch();
      });
      for (const sub of subEntries) {
        await processEntry(sub);
      }
    }
  }

  for (const entry of entries) {
    await processEntry(entry);
  }
  return files;
}

interface UploadZoneProps {
  isDragOver: boolean;
  setIsDragOver: (v: boolean) => void;
  showCompactUpload: boolean;
  setUploadZoneExpanded: (v: boolean) => void;
  currentFolderPath: string;
  defaultDocType: DocType;
  addFiles: (items: { file: File; mimeType: string; relativePath: string; docType: DocType }[]) => void;
  setShowUploadPanel: (v: boolean) => void;
  dropZoneRef: React.RefObject<HTMLDivElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  folderInputRef: React.RefObject<HTMLInputElement | null>;
}

export function UploadZone({
  isDragOver,
  setIsDragOver,
  showCompactUpload,
  setUploadZoneExpanded,
  currentFolderPath,
  defaultDocType,
  addFiles,
  setShowUploadPanel,
  dropZoneRef,
  fileInputRef,
  folderInputRef,
}: UploadZoneProps) {
  const handleFilesSelected = useCallback(
    (files: FileList | File[]) => {
      const newItems = Array.from(files)
        .filter((f) => f.size > 0)
        .map((file) => ({
          file,
          mimeType: guessMimeType(file),
          relativePath: (file as any).webkitRelativePath || currentFolderPath || '',
          docType: defaultDocType,
        }));

      if (newItems.length === 0) return;
      addFiles(newItems);
      setShowUploadPanel(true);
    },
    [defaultDocType, addFiles, currentFolderPath, setShowUploadPanel]
  );

  const handleFileSelect = () => fileInputRef.current?.click();
  const handleFolderSelect = () => folderInputRef.current?.click();

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      handleFilesSelected(e.target.files);
      e.target.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
    setUploadZoneExpanded(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const items = e.dataTransfer.items;
    if (items) {
      const files: File[] = [];
      const entries: any[] = [];
      for (let i = 0; i < items.length; i++) {
        const entry = (items[i] as any).webkitGetAsEntry?.();
        if (entry) {
          entries.push(entry);
        } else if (items[i].kind === 'file') {
          const f = items[i].getAsFile();
          if (f) files.push(f);
        }
      }

      if (entries.length > 0) {
        readEntries(entries).then((allFiles) => {
          handleFilesSelected(allFiles);
        });
      } else if (files.length > 0) {
        handleFilesSelected(files);
      }
    } else if (e.dataTransfer.files.length) {
      handleFilesSelected(e.dataTransfer.files);
    }
  };

  const { hasEncryption, isUnlocked, encryptNewUploads, setEncryptNewUploads } = useEncryptionStore();
  const [showEncryptionDialog, setShowEncryptionDialog] = useState(false);

  const handleEncryptionToggle = () => {
    if (!hasEncryption) {
      // First time: show setup dialog
      setShowEncryptionDialog(true);
      return;
    }
    if (!isUnlocked) {
      // Keys exist but locked: show unlock dialog
      setShowEncryptionDialog(true);
      return;
    }
    // Toggle encryption for new uploads
    setEncryptNewUploads(!encryptNewUploads);
  };

  return (
    <>
      <EncryptionSetupDialog
        isOpen={showEncryptionDialog}
        onClose={() => {
          setShowEncryptionDialog(false);
          // If unlock/setup succeeded, enable encryption
          const state = useEncryptionStore.getState();
          if (state.isUnlocked) {
            setEncryptNewUploads(true);
          }
        }}
        mode={hasEncryption ? 'unlock' : 'setup'}
      />

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_TYPES}
        className="hidden"
        onChange={handleFileInputChange}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        accept={ACCEPTED_TYPES}
        className="hidden"
        onChange={handleFileInputChange}
        {...({ webkitdirectory: '', directory: '' } as any)}
      />

      <div
        ref={dropZoneRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {showCompactUpload ? (
          /* Compact upload toolbar */
          <div className={`mb-4 transition-all ${isDragOver ? 'ring-2 ring-claude-accent ring-offset-2 rounded-xl' : ''}`}>
            <div className="flex items-center gap-2">
              <button
                onClick={handleFileSelect}
                className="inline-flex items-center gap-2 px-4 py-2 bg-claude-text text-white rounded-xl text-sm font-medium hover:bg-claude-text/90 transition-all active:scale-[0.98] shadow-sm font-sans"
              >
                <Upload size={14} strokeWidth={2} />
                Завантажити
              </button>
              <button
                onClick={handleFolderSelect}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-claude-border text-claude-subtext rounded-xl text-sm font-medium hover:bg-claude-bg transition-all active:scale-[0.98] font-sans"
              >
                <FolderUp size={14} strokeWidth={2} />
                Папку
              </button>
              <button
                onClick={handleEncryptionToggle}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all active:scale-[0.98] font-sans ${
                  encryptNewUploads && isUnlocked
                    ? 'bg-green-50 border border-green-300 text-green-700 hover:bg-green-100'
                    : 'bg-white border border-claude-border text-claude-subtext hover:bg-claude-bg'
                }`}
                title={
                  encryptNewUploads && isUnlocked
                    ? 'Шифрування увімкнено'
                    : 'Увімкнути шифрування'
                }
              >
                <Shield size={14} strokeWidth={2} />
                {encryptNewUploads && isUnlocked ? 'E2EE' : 'E2EE'}
              </button>
              <span className="text-xs text-claude-subtext/40 font-sans ml-1 hidden sm:inline">
                або перетягніть файли · Ctrl+U
              </span>
            </div>

            {/* Drag overlay for compact mode */}
            <AnimatePresence>
              {isDragOver && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-2 flex items-center justify-center bg-claude-accent/10 rounded-xl py-6"
                >
                  <div className="text-claude-accent font-semibold text-lg font-sans">
                    Відпустіть для завантаження
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          /* Full upload zone */
          <div
            className={`relative rounded-2xl border-2 border-dashed p-8 mb-6 transition-all duration-300 ${
              isDragOver
                ? 'border-claude-accent bg-claude-accent/5 scale-[1.01]'
                : 'border-claude-border hover:border-claude-subtext/40 bg-white'
            }`}
            role="button"
            aria-label="Зона завантаження файлів"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleFileSelect(); }}
          >
            <div className="text-center">
              <div className="flex justify-center gap-3 mb-4">
                <button
                  onClick={handleFileSelect}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-claude-text text-white rounded-xl text-sm font-medium hover:bg-claude-text/90 transition-all active:scale-[0.98] shadow-sm"
                >
                  <Upload size={16} strokeWidth={2} />
                  Завантажити файли
                </button>
                <button
                  onClick={handleFolderSelect}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-claude-border text-claude-text rounded-xl text-sm font-medium hover:bg-claude-bg transition-all active:scale-[0.98] shadow-sm"
                >
                  <FolderUp size={16} strokeWidth={2} />
                  Завантажити папку
                </button>
              </div>
              <p className="text-sm text-claude-subtext/70 font-sans">
                Перетягніть файли або папку сюди &middot; PDF, DOCX, HTML, TXT, зображення, відео &middot; до 2 ГБ &middot; Ctrl+U
              </p>
            </div>

            {/* Drag overlay */}
            <AnimatePresence>
              {isDragOver && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex items-center justify-center bg-claude-accent/10 rounded-2xl z-10"
                >
                  <div className="text-claude-accent font-semibold text-lg font-sans">
                    Відпустіть для завантаження
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </>
  );
}

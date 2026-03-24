import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderInput, Folder, CornerLeftUp, ChevronDown, Loader2, X, Plus } from 'lucide-react';
import { showToast } from '../../utils/toast';
import { toastTDynamic } from '../../i18n/toast-i18n';
import type { VaultDocument } from './types';

interface MoveDocumentModalProps {
  target: VaultDocument | null;
  moveFolder: string;
  onMoveFolderChange: (folder: string) => void;
  moveFolders: string[];
  moveFoldersLoading: boolean;
  moveLoading: boolean;
  moveBrowsePath: string;
  onBrowse: (prefix: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}

export function MoveDocumentModal({
  target,
  moveFolder,
  onMoveFolderChange,
  moveFolders,
  moveFoldersLoading,
  moveLoading,
  moveBrowsePath,
  onBrowse,
  onConfirm,
  onClose,
}: MoveDocumentModalProps) {
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    const sanitized = newFolderName.trim().replace(/[\/\\]/g, '-');
    const fullPath = moveBrowsePath ? `${moveBrowsePath}${sanitized}/` : `${sanitized}/`;
    onMoveFolderChange(fullPath);
    setNewFolderName('');
    setShowNewFolder(false);
    showToast.success(toastTDynamic('folderWillBeCreated', sanitized));
  };

  return (
    <AnimatePresence>
      {target && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => !moveLoading && onClose()}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4 max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-claude-bg rounded-lg">
                <FolderInput size={20} className="text-claude-text" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-claude-text font-sans">
                  Перемістити документ
                </h3>
                <p className="text-xs text-claude-subtext/60 font-sans truncate">
                  {target.title}
                </p>
              </div>
            </div>

            {/* Current location */}
            <div className="text-xs text-claude-subtext/60 font-sans mb-3">
              Поточна папка: <span className="font-medium text-claude-text">{target.metadata?.folderPath || '/ (корінь)'}</span>
            </div>

            {/* Folder browser */}
            <div className="flex-1 overflow-y-auto border border-claude-border rounded-xl mb-4">
              <button
                onClick={() => {
                  onMoveFolderChange('');
                  onBrowse('');
                }}
                className={`flex items-center gap-2 w-full px-3 py-2 text-sm font-sans transition-colors ${
                  moveFolder === '' ? 'bg-claude-accent/10 text-claude-accent font-medium' : 'text-claude-text hover:bg-claude-bg'
                }`}
              >
                <CornerLeftUp size={14} className="text-claude-subtext/60" />
                / (корінь)
              </button>

              {moveBrowsePath && (
                <button
                  onClick={() => {
                    const segments = moveBrowsePath.split('/').filter(Boolean);
                    segments.pop();
                    const parent = segments.length ? segments.join('/') + '/' : '';
                    onBrowse(parent);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-claude-subtext hover:bg-claude-bg transition-colors font-sans border-b border-claude-border/30"
                >
                  <CornerLeftUp size={14} />
                  ..
                </button>
              )}

              {moveBrowsePath && (
                <button
                  onClick={() => onMoveFolderChange(moveBrowsePath)}
                  className={`flex items-center gap-2 w-full px-3 py-2 text-sm font-sans transition-colors border-b border-claude-border/30 ${
                    moveFolder === moveBrowsePath ? 'bg-claude-accent/10 text-claude-accent font-medium' : 'text-claude-text hover:bg-claude-bg'
                  }`}
                >
                  <Folder size={14} className="text-claude-accent" />
                  {moveBrowsePath.replace(/\/$/, '').split('/').pop()} (поточна)
                </button>
              )}

              {moveFoldersLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 size={18} className="animate-spin text-claude-subtext/40" />
                </div>
              ) : moveFolders.length === 0 && !showNewFolder ? (
                <div className="text-center py-4 text-xs text-claude-subtext/40 font-sans">
                  Немає підпапок
                </div>
              ) : (
                moveFolders.map((folder) => {
                  const fullPath = moveBrowsePath ? `${moveBrowsePath}${folder}/` : `${folder}/`;
                  return (
                    <div key={folder} className="flex items-center border-b border-claude-border/20 last:border-0">
                      <button
                        onClick={() => onMoveFolderChange(fullPath)}
                        className={`flex-1 flex items-center gap-2 px-3 py-2 text-sm font-sans transition-colors ${
                          moveFolder === fullPath ? 'bg-claude-accent/10 text-claude-accent font-medium' : 'text-claude-text hover:bg-claude-bg'
                        }`}
                      >
                        <Folder size={14} className={moveFolder === fullPath ? 'text-claude-accent' : 'text-claude-subtext/40'} />
                        {folder}
                      </button>
                      <button
                        onClick={() => onBrowse(fullPath)}
                        className="px-2 py-2 text-claude-subtext/40 hover:text-claude-text transition-colors"
                        title="Відкрити папку"
                      >
                        <ChevronDown size={14} className="rotate-[-90deg]" />
                      </button>
                    </div>
                  );
                })
              )}

              {/* Create new folder */}
              {showNewFolder ? (
                <div className="flex items-center gap-2 px-3 py-2 border-t border-claude-border/30">
                  <Folder size={14} className="text-green-500 flex-shrink-0" />
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateFolder();
                      if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); }
                    }}
                    placeholder="Назва папки..."
                    className="flex-1 text-sm px-2 py-1 border border-claude-border rounded-lg focus:outline-none focus:border-claude-subtext/40 font-sans"
                    autoFocus
                  />
                  <button
                    onClick={handleCreateFolder}
                    disabled={!newFolderName.trim()}
                    className="text-xs text-green-600 hover:text-green-700 font-medium font-sans disabled:opacity-40"
                  >
                    OK
                  </button>
                  <button
                    onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}
                    className="p-0.5 text-claude-subtext/40 hover:text-claude-text"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewFolder(true)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-green-600 hover:bg-green-50 transition-colors font-sans border-t border-claude-border/30"
                >
                  <Plus size={14} />
                  Створити папку
                </button>
              )}
            </div>

            {/* Manual input */}
            <div className="mb-4">
              <label className="text-xs text-claude-subtext/60 font-sans mb-1 block">
                Або введіть шлях вручну:
              </label>
              <input
                type="text"
                value={moveFolder}
                onChange={(e) => onMoveFolderChange(e.target.value)}
                placeholder="наприклад: contracts/2026/"
                className="w-full px-3 py-2 border border-claude-border rounded-xl text-sm text-claude-text font-sans focus:outline-none focus:border-claude-subtext/40 transition-colors"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                disabled={moveLoading}
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-claude-text bg-white border border-claude-border rounded-xl hover:bg-claude-bg transition-colors font-sans disabled:opacity-50"
              >
                Скасувати
              </button>
              <button
                disabled={moveLoading}
                onClick={onConfirm}
                className="px-4 py-2 text-sm font-medium text-white bg-claude-text rounded-xl hover:bg-claude-text/90 transition-colors font-sans disabled:opacity-50 flex items-center gap-2"
              >
                {moveLoading && <Loader2 size={14} className="animate-spin" />}
                Перемістити
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

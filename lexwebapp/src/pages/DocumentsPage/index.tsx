import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  FolderUp,
  FileText,
  Search,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  LayoutGrid,
  List,
  Trash2,
  FolderInput,
  Folder,
  CornerLeftUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { mcpService } from '../../services';
import { useUploadStore } from '../../stores/uploadStore';
import { showToast } from '../../utils/toast';
import { api } from '../../utils/api-client';
import { FolderNavigator } from './FolderNavigator';
import { UploadQueuePanel } from './UploadQueuePanel';
import { DocumentTable } from './DocumentTable';
import { DocumentGrid } from './DocumentGrid';
import { DocumentViewerModal } from '../../components/DocumentViewerModal';
import { ClassificationPanel } from './ClassificationPanel';
import type { VaultDocument, DocType, ViewMode, SortField, SortOrder } from './types';
import { isPreviewableBinary } from './types';
import { processEmlContent } from '../../utils/eml-parser';
import { useUndoStore } from '../../stores/undoStore';
import { useUndoKeyboard } from '../../hooks/useUndoKeyboard';
import { useDocumentData } from './useDocumentData';
import { useDocumentActions } from './useDocumentActions';

const DOC_TYPE_LABELS: Record<DocType, string> = {
  contract: 'Договір',
  legislation: 'Законодавство',
  court_decision: 'Судове рішення',
  internal: 'Внутрішній',
  other: 'Інше',
};

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

function SkeletonRows() {
  return (
    <div className="bg-white rounded-2xl border border-claude-border shadow-sm overflow-hidden">
      <div className="divide-y divide-claude-border/30">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4 animate-pulse">
            <div className="h-4 w-4 bg-claude-border/30 rounded" />
            <div className="h-4 bg-claude-border/30 rounded w-1/3" />
            <div className="h-4 bg-claude-border/30 rounded w-16" />
            <div className="h-4 bg-claude-border/30 rounded w-24" />
            <div className="h-4 bg-claude-border/30 rounded w-14 hidden md:block" />
            <div className="h-4 bg-claude-border/30 rounded w-20 hidden md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DocumentsPage() {
  const navigate = useNavigate();
  const params = useParams();

  // Derive folder path from URL: /documents/folders/a/b → "a/b/"
  const currentFolderPath = useMemo(() => {
    const wildcard = params['*'] || '';
    if (!wildcard) return '';
    return wildcard.endsWith('/') ? wildcard : wildcard + '/';
  }, [params]);

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<DocType | ''>('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [offset, setOffset] = useState(0);
  const [sortBy, setSortBy] = useState<SortField>('uploadedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Preview state
  const [previewDoc, setPreviewDoc] = useState<{
    type: 'document';
    title: string;
    subtitle?: string;
    badge?: string;
    content: string;
    previewUrl?: string;
    mimeType?: string;
    ocrText?: string;
    documentId?: string;
  } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number>(-1);

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0);
  }, [filterType, currentFolderPath, searchQuery]);

  // Data fetching hook
  const {
    documents,
    setDocuments,
    totalDocs,
    setTotalDocs,
    loading,
    folders,
    foldersLoading,
    docStats,
    loadDocuments,
    loadFolders,
    loadStats,
    PAGE_SIZE,
  } = useDocumentData({
    currentFolderPath,
    filterType,
    searchQuery,
    sortBy,
    sortOrder,
    offset,
  });

  // CRUD actions hook
  const actions = useDocumentActions({
    loadDocuments,
    loadFolders,
    currentFolderPath,
  });

  const {
    deleteTarget, setDeleteTarget, deleting, handleDeleteConfirm,
    editTarget, setEditTarget, editText, setEditText, editLoading, editSaving,
    handleEditOpen, handleEditSave,
    moveTarget, setMoveTarget, moveFolder, setMoveFolder,
    moveFolders, moveFoldersLoading, moveLoading, moveBrowsePath,
    handleMoveOpen, handleMoveBrowse, handleMoveConfirm,
    handleSaveOcrText, pushAction, undoAction,
  } = actions;

  // Upload state from Zustand store
  const {
    items: uploadItems,
    isUploading,
    completedFiles,
    addFiles,
    startUpload,
    recoverSessions,
    recoveredSessions,
    dismissRecoveredSession,
    clearRecoveredSessions,
  } = useUploadStore();

  // Undo/redo
  const setOnActionExecuted = useUndoStore((s) => s.setOnActionExecuted);
  useUndoKeyboard();

  // Register reload callback for undo/redo
  useEffect(() => {
    setOnActionExecuted(() => {
      loadDocuments();
      loadFolders(currentFolderPath);
    });
    return () => setOnActionExecuted(null);
  }, [currentFolderPath]);

  // Local UI state
  const [isDragOver, setIsDragOver] = useState(false);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [defaultDocType, setDefaultDocType] = useState<DocType>('other');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Check for stuck upload sessions on mount
  useEffect(() => {
    recoverSessions();
  }, []);

  // Reload docs when a recovered session completes
  useEffect(() => {
    const hasNewlyCompleted = recoveredSessions.some((s) => s.status === 'completed');
    if (hasNewlyCompleted) {
      loadDocuments();
    }
  }, [recoveredSessions]);

  // Show upload panel when items are added
  useEffect(() => {
    if (uploadItems.length > 0) {
      setShowUploadPanel(true);
    }
  }, [uploadItems.length]);

  // Reload docs and folders when uploads complete
  useEffect(() => {
    if (completedFiles > 0 && !isUploading) {
      loadDocuments();
      loadFolders(currentFolderPath);
      loadStats();
    }
  }, [completedFiles, isUploading]);

  // Navigation helpers
  const navigateToFolder = useCallback((folderPath: string) => {
    if (!folderPath) {
      navigate('/documents');
    } else {
      const cleanPath = folderPath.replace(/\/+$/, '');
      navigate(`/documents/folders/${cleanPath}`);
    }
  }, [navigate]);

  // File selection handlers
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
    [defaultDocType, addFiles, currentFolderPath]
  );

  const handleFileSelect = () => fileInputRef.current?.click();
  const handleFolderSelect = () => folderInputRef.current?.click();

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      handleFilesSelected(e.target.files);
      e.target.value = '';
    }
  };

  // Drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
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

  // Upload actions
  const handleStartUpload = () => {
    startUpload();
    showToast.success(`Завантаження ${uploadItems.filter((i) => i.status === 'queued').length} файлів розпочато`);
  };

  const handleSearch = async () => {
    loadDocuments();
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setOffset(0);
    loadDocuments();
  };

  // Sort handler
  const handleSort = (field: SortField) => {
    if (field === sortBy) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  // Document preview
  const handleDocumentClick = async (doc: VaultDocument, index?: number) => {
    if (index != null) setPreviewIndex(index);
    else setPreviewIndex(documents.findIndex((d) => d.id === doc.id));
    const mimeType = doc.metadata?.mimeType || doc.mime_type;

    // For binary previewable files (images, PDFs, videos), fetch presigned URL
    if (isPreviewableBinary(mimeType)) {
      setPreviewLoading(true);
      setPreviewOpen(true);
      try {
        const [previewResp, docResp] = await Promise.all([
          api.documents.getPreviewUrl(doc.id),
          api.documents.getById(doc.id).catch(() => null),
        ]);

        const { previewUrl, mimeType: serverMime } = previewResp.data;
        const badge = DOC_TYPE_LABELS[doc.type] || doc.type;
        const ocrText = docResp?.data?.full_text ?? undefined;
        const effectiveMime = serverMime || mimeType;
        const isImagePreview = effectiveMime?.startsWith('image/');

        if (previewUrl) {
          setPreviewDoc({
            type: 'document',
            title: doc.title,
            subtitle: doc.metadata?.uploadedAt ? `Завантажено: ${new Date(doc.metadata.uploadedAt).toLocaleDateString('uk-UA')}` : undefined,
            badge,
            content: ocrText || '',
            previewUrl,
            mimeType: effectiveMime,
            ...(isImagePreview ? { ocrText: ocrText || '', documentId: doc.id } : {}),
          });
        } else {
          try {
            const result = await mcpService.callTool('get_document', { documentId: doc.id });
            const parsed = result?.result?.content?.[0]?.text
              ? JSON.parse(result.result.content[0].text)
              : result?.result || result;
            const rawContent = parsed.content || parsed.text || parsed.sections?.map((s: any) => s.content).join('\n\n') || 'Вміст недоступний';
            const content = processEmlContent(rawContent);
            setPreviewDoc({
              type: 'document',
              title: doc.title,
              subtitle: doc.metadata?.uploadedAt ? `Завантажено: ${new Date(doc.metadata.uploadedAt).toLocaleDateString('uk-UA')}` : undefined,
              badge,
              content,
            });
          } catch {
            setPreviewDoc({
              type: 'document',
              title: doc.title,
              subtitle: doc.metadata?.uploadedAt ? `Завантажено: ${new Date(doc.metadata.uploadedAt).toLocaleDateString('uk-UA')}` : undefined,
              badge,
              content: 'Попередній перегляд недоступний для цього файлу.',
            });
          }
        }
      } catch (err) {
        console.error('Failed to fetch preview URL:', err);
        showToast.error('Не вдалося завантажити попередній перегляд');
        setPreviewOpen(false);
      } finally {
        setPreviewLoading(false);
      }
      return;
    }

    // For text/document files, load full text via MCP tool
    setPreviewLoading(true);
    setPreviewOpen(true);
    try {
      const result = await mcpService.callTool('get_document', { documentId: doc.id });
      const parsed = result?.result?.content?.[0]?.text
        ? JSON.parse(result.result.content[0].text)
        : result?.result || result;

      const rawContent = parsed.content || parsed.text || parsed.sections?.map((s: any) => s.content).join('\n\n') || 'Вміст недоступний';
      const content = processEmlContent(rawContent);
      const badge = DOC_TYPE_LABELS[doc.type] || doc.type;

      setPreviewDoc({
        type: 'document',
        title: doc.title,
        subtitle: doc.metadata?.uploadedAt ? `Завантажено: ${new Date(doc.metadata.uploadedAt).toLocaleDateString('uk-UA')}` : undefined,
        badge,
        content,
      });
    } catch (err) {
      console.error('Failed to fetch document:', err);
      showToast.error('Не вдалося завантажити документ');
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Preview navigation handlers (with auto-pagination)
  const handlePreviewPrevious = useCallback(async () => {
    if (previewIndex > 0) {
      const prevDoc = documents[previewIndex - 1];
      if (prevDoc) handleDocumentClick(prevDoc, previewIndex - 1);
    } else if (offset > 0) {
      const newOffset = Math.max(0, offset - PAGE_SIZE);
      setOffset(newOffset);
      setPreviewLoading(true);
      try {
        const params: Record<string, any> = { limit: PAGE_SIZE, offset: newOffset, sortBy, sortOrder };
        if (filterType) params.type = filterType;
        if (currentFolderPath) params.folderPath = currentFolderPath;
        if (searchQuery.trim()) params.query = searchQuery.trim();
        const result = await mcpService.callTool('list_documents', params);
        const parsed = result?.result?.content?.[0]?.text ? JSON.parse(result.result.content[0].text) : result?.result || result;
        const newDocs: VaultDocument[] = parsed.documents || [];
        setDocuments(newDocs);
        setTotalDocs(parsed.total || 0);
        if (newDocs.length > 0) {
          const lastDoc = newDocs[newDocs.length - 1];
          handleDocumentClick(lastDoc, newDocs.length - 1);
        }
      } catch (err) {
        console.error('Failed to load previous page:', err);
        setPreviewLoading(false);
      }
    }
  }, [previewIndex, documents, offset, sortBy, sortOrder, filterType, currentFolderPath, searchQuery]);

  const handlePreviewNext = useCallback(async () => {
    if (previewIndex < documents.length - 1) {
      const nextDoc = documents[previewIndex + 1];
      if (nextDoc) handleDocumentClick(nextDoc, previewIndex + 1);
    } else if (offset + PAGE_SIZE < totalDocs) {
      const newOffset = offset + PAGE_SIZE;
      setOffset(newOffset);
      setPreviewLoading(true);
      try {
        const params: Record<string, any> = { limit: PAGE_SIZE, offset: newOffset, sortBy, sortOrder };
        if (filterType) params.type = filterType;
        if (currentFolderPath) params.folderPath = currentFolderPath;
        if (searchQuery.trim()) params.query = searchQuery.trim();
        const result = await mcpService.callTool('list_documents', params);
        const parsed = result?.result?.content?.[0]?.text ? JSON.parse(result.result.content[0].text) : result?.result || result;
        const newDocs: VaultDocument[] = parsed.documents || [];
        setDocuments(newDocs);
        setTotalDocs(parsed.total || 0);
        if (newDocs.length > 0) {
          handleDocumentClick(newDocs[0], 0);
        }
      } catch (err) {
        console.error('Failed to load next page:', err);
        setPreviewLoading(false);
      }
    }
  }, [previewIndex, documents, offset, totalDocs, sortBy, sortOrder, filterType, currentFolderPath, searchQuery]);

  // Silent delete from preview modal
  const handlePreviewDelete = useCallback(async () => {
    if (previewIndex < 0 || !documents[previewIndex]) return;
    const doc = documents[previewIndex];
    try {
      await api.documents.delete(doc.id);
      pushAction({ type: 'delete', documentId: doc.id, documentTitle: doc.title });
      showToast.undoable(`«${doc.title}» видалено`, () => {
        undoAction().then(() => { loadDocuments(); loadFolders(currentFolderPath); });
      });
      const newDocs = documents.filter((_, i) => i !== previewIndex);
      setDocuments(newDocs);
      setTotalDocs((prev) => Math.max(0, prev - 1));
      if (newDocs.length === 0) {
        setPreviewOpen(false);
        setPreviewDoc(null);
        setPreviewIndex(-1);
      } else if (previewIndex < newDocs.length) {
        handleDocumentClick(newDocs[previewIndex], previewIndex);
      } else {
        handleDocumentClick(newDocs[newDocs.length - 1], newDocs.length - 1);
      }
    } catch (err) {
      console.error('Failed to delete document:', err);
      showToast.error('Не вдалося видалити документ');
    }
  }, [previewIndex, documents]);

  // Edit navigation handlers
  const handleEditPrevious = useCallback(() => {
    if (!editTarget) return;
    const idx = documents.findIndex((d) => d.id === editTarget.id);
    if (idx > 0) handleEditOpen(documents[idx - 1]);
  }, [editTarget, documents]);

  const handleEditNext = useCallback(() => {
    if (!editTarget) return;
    const idx = documents.findIndex((d) => d.id === editTarget.id);
    if (idx < documents.length - 1) handleEditOpen(documents[idx + 1]);
  }, [editTarget, documents]);

  // Silent delete from edit modal
  const handleEditDelete = useCallback(async () => {
    if (!editTarget) return;
    const idx = documents.findIndex((d) => d.id === editTarget.id);
    try {
      await api.documents.delete(editTarget.id);
      pushAction({ type: 'delete', documentId: editTarget.id, documentTitle: editTarget.title });
      showToast.undoable(`«${editTarget.title}» видалено`, () => {
        undoAction().then(() => { loadDocuments(); loadFolders(currentFolderPath); });
      });
      const newDocs = documents.filter((d) => d.id !== editTarget.id);
      setDocuments(newDocs);
      setTotalDocs((prev) => Math.max(0, prev - 1));
      if (newDocs.length === 0) {
        setEditTarget(null);
      } else if (idx < newDocs.length) {
        handleEditOpen(newDocs[idx]);
      } else {
        handleEditOpen(newDocs[newDocs.length - 1]);
      }
    } catch (err) {
      console.error('Failed to delete document:', err);
      showToast.error('Не вдалося видалити документ');
    }
  }, [editTarget, documents]);

  // Keyboard navigation for edit modal
  useEffect(() => {
    if (!editTarget) return;
    const handleKeydown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      const idx = documents.findIndex((d) => d.id === editTarget.id);
      if (e.key === 'ArrowLeft' && idx > 0) {
        e.preventDefault();
        handleEditOpen(documents[idx - 1]);
      } else if (e.key === 'ArrowRight' && idx < documents.length - 1) {
        e.preventDefault();
        handleEditOpen(documents[idx + 1]);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleEditDelete();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [editTarget, documents, handleEditDelete]);

  // Pagination
  const hasMore = offset + PAGE_SIZE < totalDocs;
  const hasPrev = offset > 0;
  const isSearchActive = searchQuery.trim().length > 0;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
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

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          {/* Recovery Banner */}
          <AnimatePresence>
            {recoveredSessions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-amber-800 font-sans">
                    Відновлення завантажень
                  </h4>
                  {recoveredSessions.every((s) => s.status !== 'recovering') && (
                    <button
                      onClick={clearRecoveredSessions}
                      className="text-xs text-amber-600 hover:text-amber-800 transition-colors font-sans"
                    >
                      Закрити
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  {recoveredSessions.map((s) => (
                    <div key={s.uploadId} className="flex items-center gap-2 text-xs font-sans">
                      {s.status === 'recovering' ? (
                        <Loader2 size={12} className="text-amber-500 animate-spin flex-shrink-0" />
                      ) : s.status === 'completed' ? (
                        <CheckCircle size={12} className="text-green-500 flex-shrink-0" />
                      ) : (
                        <AlertCircle size={12} className="text-red-500 flex-shrink-0" />
                      )}
                      <span className="text-amber-900 truncate flex-1">{s.fileName}</span>
                      <span className={`flex-shrink-0 ${
                        s.status === 'recovering' ? 'text-amber-600' :
                        s.status === 'completed' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {s.status === 'recovering' ? 'Обробка...' :
                         s.status === 'completed' ? 'Готово' : s.error || 'Помилка'}
                      </span>
                      {s.status !== 'recovering' && (
                        <button
                          onClick={() => dismissRecoveredSession(s.uploadId)}
                          className="text-amber-400 hover:text-amber-700 transition-colors"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Upload Zone */}
          <div
            ref={dropZoneRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative rounded-2xl border-2 border-dashed p-8 mb-6 transition-all duration-300 ${
              isDragOver
                ? 'border-claude-accent bg-claude-accent/5 scale-[1.01]'
                : 'border-claude-border hover:border-claude-subtext/40 bg-white'
            }`}
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
                Перетягніть файли або папку сюди &middot; PDF, DOCX, HTML, TXT, зображення, відео &middot; до 2 ГБ
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

          {/* Upload Queue Panel */}
          <UploadQueuePanel
            showUploadPanel={showUploadPanel}
            setShowUploadPanel={setShowUploadPanel}
            defaultDocType={defaultDocType}
            setDefaultDocType={setDefaultDocType}
            onStartUpload={handleStartUpload}
          />

          {/* Document Statistics — removed per design */}

          {/* Classification Panel */}
          <ClassificationPanel
            stats={docStats}
            onComplete={() => {
              loadDocuments();
              loadStats();
            }}
          />

          {/* Search and Filters */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 relative">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-claude-subtext/40"
              />
              <input
                type="text"
                placeholder="Пошук за назвою або змістом..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full pl-10 pr-9 py-2.5 bg-white border border-claude-border rounded-xl text-sm text-claude-text placeholder:text-claude-subtext/40 focus:outline-none focus:border-claude-subtext/40 transition-colors font-sans"
              />
              {searchQuery && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-claude-subtext/40 hover:text-claude-text transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Type filter */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as DocType | '')}
              className="px-3 py-2.5 bg-white border border-claude-border rounded-xl text-sm text-claude-text focus:outline-none focus:border-claude-subtext/40 transition-colors font-sans"
            >
              <option value="">Всі типи</option>
              {(Object.keys(DOC_TYPE_LABELS) as DocType[]).map((t) => (
                <option key={t} value={t}>
                  {DOC_TYPE_LABELS[t]}
                </option>
              ))}
            </select>

            {/* View mode toggle */}
            <div className="flex border border-claude-border rounded-xl overflow-hidden">
              <button
                onClick={() => setViewMode('list')}
                className={`p-2.5 transition-colors ${
                  viewMode === 'list'
                    ? 'bg-claude-text text-white'
                    : 'bg-white text-claude-subtext hover:bg-claude-bg'
                }`}
              >
                <List size={16} />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2.5 transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-claude-text text-white'
                    : 'bg-white text-claude-subtext hover:bg-claude-bg'
                }`}
              >
                <LayoutGrid size={16} />
              </button>
            </div>
          </div>

          {/* Folder Navigator */}
          {(currentFolderPath || folders.length > 0) && (
            <FolderNavigator
              currentPath={currentFolderPath}
              folders={folders}
              onNavigate={(folderName) => {
                const newPath = currentFolderPath
                  ? `${currentFolderPath}${folderName}/`
                  : `${folderName}/`;
                navigateToFolder(newPath);
              }}
              onReset={() => navigateToFolder('')}
              onBreadcrumbClick={(depth) => {
                const segments = currentFolderPath.split('/').filter(Boolean);
                const newPath = segments.slice(0, depth).join('/') + '/';
                navigateToFolder(newPath);
              }}
              loading={foldersLoading}
            />
          )}

          {/* Document List */}
          {loading ? (
            <SkeletonRows />
          ) : documents.length === 0 ? (
            <div className="text-center py-20">
              <FileText size={48} className="mx-auto mb-4 text-claude-subtext/20" />
              <h3 className="text-lg font-semibold text-claude-text mb-2 font-sans">
                Немає документів
              </h3>
              <p className="text-sm text-claude-subtext/60 font-sans">
                Завантажте документи за допомогою кнопок вище або перетягніть файли
              </p>
            </div>
          ) : viewMode === 'list' ? (
            <DocumentTable
              documents={documents}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={handleSort}
              onDocumentClick={handleDocumentClick}
              onView={handleDocumentClick}
              onEdit={handleEditOpen}
              onDelete={setDeleteTarget}
              onMove={handleMoveOpen}
            />
          ) : (
            <DocumentGrid
              documents={documents}
              onDocumentClick={handleDocumentClick}
              onView={handleDocumentClick}
              onEdit={handleEditOpen}
              onDelete={setDeleteTarget}
              onMove={handleMoveOpen}
            />
          )}

          {/* Pagination footer */}
          {documents.length > 0 && !isSearchActive && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-claude-subtext/50 font-sans">
                {offset + 1}–{Math.min(offset + PAGE_SIZE, totalDocs)} з {totalDocs}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
                  disabled={!hasPrev}
                  className="px-4 py-2 rounded-xl text-sm font-sans font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-white border border-claude-border text-claude-text hover:bg-claude-bg"
                >
                  Назад
                </button>
                <button
                  onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
                  disabled={!hasMore}
                  className="px-4 py-2 rounded-xl text-sm font-sans font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-white border border-claude-border text-claude-text hover:bg-claude-bg"
                >
                  Далі
                </button>
              </div>
            </div>
          )}

          {/* Search results count */}
          {documents.length > 0 && isSearchActive && (
            <div className="mt-4 text-center">
              <span className="text-xs text-claude-subtext/50 font-sans">
                Знайдено {documents.length} документів
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Document Preview Modal */}
      <DocumentViewerModal
        isOpen={previewOpen}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewDoc(null);
          setPreviewIndex(-1);
        }}
        item={previewLoading ? {
          type: 'document',
          title: 'Завантаження...',
          content: '',
        } : previewDoc}
        onSaveOcrText={handleSaveOcrText}
        onPrevious={handlePreviewPrevious}
        onNext={handlePreviewNext}
        hasPrevious={previewIndex > 0 || offset > 0}
        hasNext={previewIndex < documents.length - 1 || offset + PAGE_SIZE < totalDocs}
        currentIndex={offset + previewIndex}
        totalCount={totalDocs}
        onDelete={handlePreviewDelete}
      />

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => !deleting && setDeleteTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-50 rounded-lg">
                  <Trash2 size={20} className="text-red-500" />
                </div>
                <h3 className="text-lg font-semibold text-claude-text font-sans">
                  Видалити документ?
                </h3>
              </div>
              <p className="text-sm text-claude-subtext/70 mb-6 font-sans">
                Ви впевнені, що хочете видалити &laquo;{deleteTarget.title}&raquo;? Цю дію неможливо скасувати.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  disabled={deleting}
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 text-sm font-medium text-claude-text bg-white border border-claude-border rounded-xl hover:bg-claude-bg transition-colors font-sans disabled:opacity-50"
                >
                  Скасувати
                </button>
                <button
                  disabled={deleting}
                  onClick={handleDeleteConfirm}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors font-sans disabled:opacity-50 flex items-center gap-2"
                >
                  {deleting && <Loader2 size={14} className="animate-spin" />}
                  Видалити
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Document Modal */}
      <AnimatePresence>
        {editTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => !editSaving && setEditTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {(() => {
                    const idx = documents.findIndex((d) => d.id === editTarget.id);
                    return (
                      <>
                        <button
                          disabled={editSaving || idx <= 0}
                          onClick={handleEditPrevious}
                          className="p-1 text-claude-subtext hover:text-claude-text transition-colors disabled:opacity-30"
                          title="Попередній (←)"
                        >
                          <ChevronLeft size={18} />
                        </button>
                        <button
                          disabled={editSaving || idx >= documents.length - 1}
                          onClick={handleEditNext}
                          className="p-1 text-claude-subtext hover:text-claude-text transition-colors disabled:opacity-30"
                          title="Наступний (→)"
                        >
                          <ChevronRight size={18} />
                        </button>
                        {documents.length > 1 && (
                          <span className="text-[11px] text-claude-subtext font-medium tabular-nums mr-1">
                            {idx + 1} / {documents.length}
                          </span>
                        )}
                      </>
                    );
                  })()}
                  <h3 className="text-lg font-semibold text-claude-text font-sans truncate">
                    Редагувати: {editTarget.title}
                  </h3>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleEditDelete}
                    disabled={editSaving}
                    className="p-1 text-claude-subtext/40 hover:text-red-500 transition-colors disabled:opacity-30"
                    title="Видалити (Delete)"
                  >
                    <Trash2 size={16} />
                  </button>
                  <button
                    onClick={() => !editSaving && setEditTarget(null)}
                    className="p-1 text-claude-subtext/40 hover:text-claude-text transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
              {editLoading ? (
                <div className="flex-1 flex items-center justify-center py-20">
                  <Loader2 size={24} className="animate-spin text-claude-subtext/40" />
                </div>
              ) : (
                <>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="flex-1 min-h-[400px] w-full p-4 border border-claude-border rounded-xl text-sm text-claude-text font-mono resize-none focus:outline-none focus:border-claude-subtext/40 transition-colors"
                    placeholder="Вміст документа..."
                  />
                  <div className="flex justify-end gap-3 mt-4">
                    <button
                      disabled={editSaving}
                      onClick={() => setEditTarget(null)}
                      className="px-4 py-2 text-sm font-medium text-claude-text bg-white border border-claude-border rounded-xl hover:bg-claude-bg transition-colors font-sans disabled:opacity-50"
                    >
                      Скасувати
                    </button>
                    <button
                      disabled={editSaving}
                      onClick={handleEditSave}
                      className="px-4 py-2 text-sm font-medium text-white bg-claude-text rounded-xl hover:bg-claude-text/90 transition-colors font-sans disabled:opacity-50 flex items-center gap-2"
                    >
                      {editSaving && <Loader2 size={14} className="animate-spin" />}
                      Зберегти
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Move Document Modal */}
      <AnimatePresence>
        {moveTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => !moveLoading && setMoveTarget(null)}
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
                    {moveTarget.title}
                  </p>
                </div>
              </div>

              {/* Current location */}
              <div className="text-xs text-claude-subtext/60 font-sans mb-3">
                Поточна папка: <span className="font-medium text-claude-text">{moveTarget.metadata?.folderPath || '/ (корінь)'}</span>
              </div>

              {/* Folder browser */}
              <div className="flex-1 overflow-y-auto border border-claude-border rounded-xl mb-4">
                <button
                  onClick={() => {
                    setMoveFolder('');
                    handleMoveBrowse('');
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
                      handleMoveBrowse(parent);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-claude-subtext hover:bg-claude-bg transition-colors font-sans border-b border-claude-border/30"
                  >
                    <CornerLeftUp size={14} />
                    ..
                  </button>
                )}

                {moveBrowsePath && (
                  <button
                    onClick={() => setMoveFolder(moveBrowsePath)}
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
                ) : moveFolders.length === 0 ? (
                  <div className="text-center py-4 text-xs text-claude-subtext/40 font-sans">
                    Немає підпапок
                  </div>
                ) : (
                  moveFolders.map((folder) => {
                    const fullPath = moveBrowsePath ? `${moveBrowsePath}${folder}/` : `${folder}/`;
                    return (
                      <div key={folder} className="flex items-center border-b border-claude-border/20 last:border-0">
                        <button
                          onClick={() => setMoveFolder(fullPath)}
                          className={`flex-1 flex items-center gap-2 px-3 py-2 text-sm font-sans transition-colors ${
                            moveFolder === fullPath ? 'bg-claude-accent/10 text-claude-accent font-medium' : 'text-claude-text hover:bg-claude-bg'
                          }`}
                        >
                          <Folder size={14} className={moveFolder === fullPath ? 'text-claude-accent' : 'text-claude-subtext/40'} />
                          {folder}
                        </button>
                        <button
                          onClick={() => handleMoveBrowse(fullPath)}
                          className="px-2 py-2 text-claude-subtext/40 hover:text-claude-text transition-colors"
                          title="Відкрити папку"
                        >
                          <ChevronDown size={14} className="rotate-[-90deg]" />
                        </button>
                      </div>
                    );
                  })
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
                  onChange={(e) => setMoveFolder(e.target.value)}
                  placeholder="наприклад: contracts/2026/"
                  className="w-full px-3 py-2 border border-claude-border rounded-xl text-sm text-claude-text font-sans focus:outline-none focus:border-claude-subtext/40 transition-colors"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  disabled={moveLoading}
                  onClick={() => setMoveTarget(null)}
                  className="px-4 py-2 text-sm font-medium text-claude-text bg-white border border-claude-border rounded-xl hover:bg-claude-bg transition-colors font-sans disabled:opacity-50"
                >
                  Скасувати
                </button>
                <button
                  disabled={moveLoading}
                  onClick={handleMoveConfirm}
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
    </div>
  );
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

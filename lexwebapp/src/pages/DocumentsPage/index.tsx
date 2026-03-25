import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useUploadStore } from '../../stores/uploadStore';
import { FolderNavigator } from './FolderNavigator';
import { UploadQueuePanel } from './UploadQueuePanel';
import { DocumentViewerModal } from '../../components/DocumentViewerModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { EditDocumentModal } from './EditDocumentModal';
import { MoveDocumentModal } from './MoveDocumentModal';
import { RecoveryBanner } from './RecoveryBanner';
import { UploadZone } from './UploadZone';
import { DocumentSearchBar } from './DocumentSearchBar';
import { BatchActionsBar } from './BatchActionsBar';
import { DocumentListContainer } from './DocumentListContainer';
import type { DocType, ViewMode, SortField, SortOrder } from './types';
import { useUndoStore } from '../../stores/undoStore';
import { useUndoKeyboard } from '../../hooks/useUndoKeyboard';
import { useDocumentData } from './useDocumentData';
import { useDocumentActions } from './useDocumentActions';
import { useDocumentPreview } from './useDocumentPreview';
import { useMultiSelect } from './useMultiSelect';
import { useEditNavigation } from './useEditNavigation';

const VIEW_MODE_KEY = 'documents-view-mode';

export function DocumentsPage() {
  const navigate = useNavigate();
  const params = useParams();

  // Derive folder path from URL: /documents/folders/a/b -> "a/b/"
  const currentFolderPath = useMemo(() => {
    const wildcard = params['*'] || '';
    if (!wildcard) return '';
    return wildcard.endsWith('/') ? wildcard : wildcard + '/';
  }, [params]);

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<DocType | ''>('');
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(VIEW_MODE_KEY);
    return (saved === 'grid' || saved === 'list') ? saved : 'list';
  });
  const [offset, setOffset] = useState(0);
  const [sortBy, setSortBy] = useState<SortField>('uploadedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Compact upload zone
  const [uploadZoneExpanded, setUploadZoneExpanded] = useState(false);

  // Persist view mode
  const handleSetViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  }, []);

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

  // Preview hook
  const preview = useDocumentPreview({
    documents,
    setDocuments,
    setTotalDocs,
    offset,
    setOffset,
    totalDocs,
    PAGE_SIZE,
    sortBy,
    sortOrder,
    filterType,
    currentFolderPath,
    searchQuery,
    pushAction,
    undoAction,
    loadDocuments,
    loadFolders,
  });

  // Multi-select hook
  const {
    selectedIds,
    handleToggleSelect,
    handleToggleAll,
    handleBatchDelete,
    handleBatchMove,
    clearSelection,
  } = useMultiSelect({
    documents,
    currentFolderPath,
    filterType,
    searchQuery,
    offset,
    pushAction,
    loadDocuments,
    loadFolders,
    handleMoveOpen,
  });

  // Edit navigation hook
  const {
    editIndex,
    handleEditPrevious,
    handleEditNext,
    handleEditDelete,
  } = useEditNavigation({
    documents,
    editTarget,
    handleEditOpen,
    setEditTarget,
    setDocuments,
    setTotalDocs,
    pushAction,
    undoAction,
    loadDocuments,
    loadFolders,
    currentFolderPath,
  });

  // Upload state from Zustand store
  const { items: uploadItems, isUploading, completedFiles, recoveredSessions } = useUploadStore(
    useShallow(s => ({
      items: s.items,
      isUploading: s.isUploading,
      completedFiles: s.completedFiles,
      recoveredSessions: s.recoveredSessions,
    }))
  );
  const addFiles = useUploadStore(s => s.addFiles);
  const recoverSessions = useUploadStore(s => s.recoverSessions);
  const dismissRecoveredSession = useUploadStore(s => s.dismissRecoveredSession);
  const clearRecoveredSessions = useUploadStore(s => s.clearRecoveredSessions);
  // Undo/redo
  const setOnActionExecuted = useUndoStore((s) => s.setOnActionExecuted);
  useUndoKeyboard();

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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Check for stuck upload sessions on mount
  useEffect(() => { recoverSessions(); }, []);

  // Reload docs when a recovered session completes
  useEffect(() => {
    if (recoveredSessions.some((s) => s.status === 'completed')) loadDocuments();
  }, [recoveredSessions]);

  // Show upload panel when items are added
  useEffect(() => {
    if (uploadItems.length > 0) setShowUploadPanel(true);
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
    if (!folderPath) navigate('/documents');
    else navigate(`/documents/folders/${folderPath.replace(/\/+$/, '')}`);
  }, [navigate]);

  const handleSearch = () => { loadDocuments(); };

  const handleClearSearch = () => {
    setSearchQuery('');
    setOffset(0);
    loadDocuments();
  };

  const handleSort = (field: SortField) => {
    if (field === sortBy) setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(field); setSortOrder('desc'); }
  };

  // Keyboard shortcut for upload (Ctrl+U)
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
        e.preventDefault();
        fileInputRef.current?.click();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, []);

  const hasDocuments = documents.length > 0;
  const showCompactUpload = hasDocuments && !uploadZoneExpanded;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <RecoveryBanner
            recoveredSessions={recoveredSessions}
            onDismiss={dismissRecoveredSession}
            onClearAll={clearRecoveredSessions}
          />

          <UploadZone
            isDragOver={isDragOver}
            setIsDragOver={setIsDragOver}
            showCompactUpload={showCompactUpload}
            setUploadZoneExpanded={setUploadZoneExpanded}
            currentFolderPath={currentFolderPath}
            defaultDocType="other"
            addFiles={addFiles}
            setShowUploadPanel={setShowUploadPanel}
            dropZoneRef={dropZoneRef}
            fileInputRef={fileInputRef}
            folderInputRef={folderInputRef}
          />

          <UploadQueuePanel
            showUploadPanel={showUploadPanel}
            setShowUploadPanel={setShowUploadPanel}
          />

          <DocumentSearchBar
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            onSearch={handleSearch}
            onClearSearch={handleClearSearch}
            filterType={filterType}
            onFilterTypeChange={setFilterType}
            viewMode={viewMode}
            onViewModeChange={handleSetViewMode}
          />

          <BatchActionsBar
            selectedCount={selectedIds.size}
            onBatchMove={handleBatchMove}
            onBatchDelete={handleBatchDelete}
            onClearSelection={clearSelection}
          />

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

          <DocumentListContainer
            documents={documents}
            loading={loading}
            viewMode={viewMode}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            onDocumentClick={preview.handleDocumentClick}
            onEdit={handleEditOpen}
            onDelete={setDeleteTarget}
            onMove={handleMoveOpen}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onToggleAll={handleToggleAll}
            offset={offset}
            setOffset={setOffset}
            totalDocs={totalDocs}
            pageSize={PAGE_SIZE}
            searchQuery={searchQuery}
            onClearSearch={handleClearSearch}
          />
        </div>
      </div>

      <DocumentViewerModal
        isOpen={preview.previewOpen}
        onClose={preview.closePreview}
        item={preview.previewLoading ? {
          type: 'document',
          title: 'Завантаження...',
          content: '',
        } : preview.previewDoc}
        onSaveOcrText={handleSaveOcrText}
        onPrevious={preview.handlePreviewPrevious}
        onNext={preview.handlePreviewNext}
        hasPrevious={preview.previewIndex > 0 || offset > 0}
        hasNext={preview.previewIndex < documents.length - 1 || offset + PAGE_SIZE < totalDocs}
        currentIndex={offset + preview.previewIndex}
        totalCount={totalDocs}
        onDelete={preview.handlePreviewDelete}
      />

      <DeleteConfirmModal
        target={deleteTarget}
        deleting={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      <EditDocumentModal
        target={editTarget}
        editText={editText}
        onEditTextChange={setEditText}
        editLoading={editLoading}
        editSaving={editSaving}
        onSave={handleEditSave}
        onClose={() => !editSaving && setEditTarget(null)}
        onPrevious={handleEditPrevious}
        onNext={handleEditNext}
        onDelete={handleEditDelete}
        currentIndex={editIndex}
        totalCount={documents.length}
      />

      <MoveDocumentModal
        target={moveTarget}
        moveFolder={moveFolder}
        onMoveFolderChange={setMoveFolder}
        moveFolders={moveFolders}
        moveFoldersLoading={moveFoldersLoading}
        moveLoading={moveLoading}
        moveBrowsePath={moveBrowsePath}
        onBrowse={handleMoveBrowse}
        onConfirm={handleMoveConfirm}
        onClose={() => !moveLoading && setMoveTarget(null)}
      />
    </div>
  );
}

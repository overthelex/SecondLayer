/**
 * useDocumentData — data fetching hook for DocumentsPage
 * Manages documents list, folders, stats, and pagination
 */

import { useState, useEffect, useCallback } from 'react';
import { mcpService } from '../../services';
import { api } from '../../utils/api-client';
import type { VaultDocument, DocType, SortField, SortOrder, DocumentStats } from './types';

const PAGE_SIZE = 50;

interface UseDocumentDataOptions {
  currentFolderPath: string;
  filterType: DocType | '';
  searchQuery: string;
  sortBy: SortField;
  sortOrder: SortOrder;
  offset: number;
}

export function useDocumentData(options: UseDocumentDataOptions) {
  const { currentFolderPath, filterType, searchQuery, sortBy, sortOrder, offset } = options;

  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [loading, setLoading] = useState(false);
  const [folders, setFolders] = useState<string[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [docStats, setDocStats] = useState<DocumentStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {
        limit: PAGE_SIZE,
        offset,
        sortBy,
        sortOrder,
      };
      if (filterType) params.type = filterType;
      if (currentFolderPath) params.folderPath = currentFolderPath;
      if (searchQuery.trim()) params.query = searchQuery.trim();

      const result = await mcpService.callTool('list_documents', params);
      const parsed = result?.result?.content?.[0]?.text
        ? JSON.parse(result.result.content[0].text)
        : result?.result || result;

      setDocuments(parsed.documents || []);
      setTotalDocs(parsed.total || 0);
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setLoading(false);
    }
  }, [filterType, currentFolderPath, offset, sortBy, sortOrder, searchQuery]);

  const loadFolders = useCallback(async (prefix: string) => {
    setFoldersLoading(true);
    try {
      const resp = await api.documents.getFolders(prefix || undefined);
      setFolders(resp.data.folders || []);
    } catch (err) {
      console.error('Failed to load folders:', err);
      setFolders([]);
    } finally {
      setFoldersLoading(false);
    }
  }, []);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const resp = await api.documents.getStats();
      setDocStats(resp.data);
    } catch (err) {
      console.error('Failed to load document stats:', err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // Load documents when deps change
  useEffect(() => {
    loadDocuments();
    loadFolders(currentFolderPath);
  }, [filterType, currentFolderPath, offset, sortBy, sortOrder]);

  // Debounced text search
  useEffect(() => {
    if (!searchQuery.trim()) {
      loadDocuments();
      return;
    }
    const timer = setTimeout(() => {
      loadDocuments();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load stats on mount
  useEffect(() => {
    loadStats();
  }, []);

  return {
    documents,
    setDocuments,
    totalDocs,
    setTotalDocs,
    loading,
    folders,
    foldersLoading,
    docStats,
    statsLoading,
    loadDocuments,
    loadFolders,
    loadStats,
    PAGE_SIZE,
  };
}

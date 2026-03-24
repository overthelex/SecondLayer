/**
 * useDocumentPreview — preview state and navigation for DocumentsPage
 * Handles document preview modal, navigation between documents, and delete-from-preview
 */

import { useState, useCallback } from 'react';
import { mcpService } from '../../services';
import { api } from '../../utils/api-client';
import { showToast } from '../../utils/toast';
import { toastT } from '../../i18n/toast-i18n';
import { processEmlContent } from '../../utils/eml-parser';
import type { VaultDocument, DocType, SortField, SortOrder } from './types';
import { isPreviewableBinary } from './types';
import { DOC_TYPE_LABELS } from './constants';
import { useEncryptionStore } from '../../stores/encryptionStore';
import { encryptionService } from '../../services/api/EncryptionService';
import { decryptContent, unwrapDEK } from '../../services/crypto';

export interface PreviewDocData {
  type: 'document';
  title: string;
  subtitle?: string;
  badge?: string;
  content: string;
  previewUrl?: string;
  mimeType?: string;
  ocrText?: string;
  documentId?: string;
}

interface UseDocumentPreviewOptions {
  documents: VaultDocument[];
  setDocuments: (docs: VaultDocument[]) => void;
  setTotalDocs: React.Dispatch<React.SetStateAction<number>>;
  offset: number;
  setOffset: React.Dispatch<React.SetStateAction<number>>;
  totalDocs: number;
  PAGE_SIZE: number;
  sortBy: SortField;
  sortOrder: SortOrder;
  filterType: DocType | '';
  currentFolderPath: string;
  searchQuery: string;
  pushAction: (action: any) => void;
  undoAction: () => Promise<void>;
  loadDocuments: () => Promise<void>;
  loadFolders: (prefix: string) => Promise<void>;
}

export function useDocumentPreview(options: UseDocumentPreviewOptions) {
  const {
    documents, setDocuments, setTotalDocs,
    offset, setOffset, totalDocs, PAGE_SIZE,
    sortBy, sortOrder, filterType, currentFolderPath, searchQuery,
    pushAction, undoAction, loadDocuments, loadFolders,
  } = options;

  const [previewDoc, setPreviewDoc] = useState<PreviewDocData | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number>(-1);
  const [previewDeletePending, setPreviewDeletePending] = useState(false);

  /**
   * Decrypt document content if it's encrypted.
   * Fetches wrapped DEK from server, unwraps with private key, decrypts content.
   */
  const decryptDocumentContent = useCallback(async (
    documentId: string,
    encryptedContent: string
  ): Promise<string> => {
    const { privateKey, isUnlocked } = useEncryptionStore.getState();
    if (!isUnlocked || !privateKey) {
      throw new Error('Сейф заблоковано. Розблокуйте шифрування для перегляду.');
    }

    // Fetch wrapped DEK for this document
    const keyData = await encryptionService.getDocumentKey(documentId);
    const dek = await unwrapDEK(keyData.encrypted_dek, privateKey);
    return decryptContent(encryptedContent, dek);
  }, []);

  const handleDocumentClick = useCallback(async (doc: VaultDocument, index?: number) => {
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
        let ocrText = docResp?.data?.full_text ?? undefined;
        const effectiveMime = serverMime || mimeType;
        const isImagePreview = effectiveMime?.startsWith('image/');

        // Decrypt OCR text if the document is encrypted
        if (doc.is_encrypted && ocrText) {
          try {
            ocrText = await decryptDocumentContent(doc.id, ocrText);
          } catch {
            ocrText = undefined; // Can't decrypt — show binary preview only
          }
        }

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
        showToast.error(toastT('previewLoadFailed'));
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

      let rawContent = parsed.content || parsed.text || parsed.sections?.map((s: any) => s.content).join('\n\n') || 'Вміст недоступний';

      // Decrypt if document is encrypted
      const isEncrypted = doc.is_encrypted || parsed.is_encrypted;
      if (isEncrypted && rawContent && rawContent !== 'Вміст недоступний') {
        try {
          rawContent = await decryptDocumentContent(doc.id, rawContent);
        } catch (decryptErr: any) {
          rawContent = `🔒 ${decryptErr.message || 'Не вдалося розшифрувати документ. Розблокуйте сейф.'}`;
        }
      }

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
      showToast.error(toastT('documentDownloadFailed'));
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  }, [documents]);

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

  // Delete from preview modal — with double-click confirmation
  const handlePreviewDelete = useCallback(async () => {
    if (previewIndex < 0 || !documents[previewIndex]) return;

    // First press = arm, second press = delete
    if (!previewDeletePending) {
      setPreviewDeletePending(true);
      showToast.success(toastT('pressDeleteToConfirm'));
      setTimeout(() => setPreviewDeletePending(false), 3000);
      return;
    }

    setPreviewDeletePending(false);
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
      showToast.error(toastT('documentDeleteFailed'));
    }
  }, [previewIndex, documents, previewDeletePending]);

  const closePreview = useCallback(() => {
    setPreviewOpen(false);
    setPreviewDoc(null);
    setPreviewIndex(-1);
    setPreviewDeletePending(false);
  }, []);

  return {
    previewDoc,
    previewOpen,
    previewLoading,
    previewIndex,
    previewDeletePending,
    handleDocumentClick,
    handlePreviewPrevious,
    handlePreviewNext,
    handlePreviewDelete,
    closePreview,
  };
}

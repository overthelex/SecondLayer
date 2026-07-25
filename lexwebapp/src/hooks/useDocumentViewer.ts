import { useState, useCallback } from 'react';
import type { Decision } from '../components/DecisionCard';
import type { DocumentViewerItem } from '../components/DocumentViewerModal/types';
import type { DownloadedDecision } from '../stores/decisionsSearchStore';
import { STATUS_LABELS, DOC_TYPE_LABELS, SECTION_TYPE_LABELS } from '../components/right-panel/constants';
import { mcpService } from '../services/api/MCPService';
import { getErrorMessage } from '../utils/errors';
import { useEncryptionStore } from '../stores/encryptionStore';
import { encryptionService } from '../services/api/EncryptionService';
import { decryptContent, unwrapDEK } from '../services/crypto';

/** Parse MCP tool result wrapper to get the inner JSON payload. */
function parseToolResult(data: any): any {
  try {
    if (data?.result?.content?.[0]?.text) {
      return JSON.parse(data.result.content[0].text);
    }
    if (data?.result) return data.result;
    return data;
  } catch {
    return data;
  }
}

function formatSections(sections: Array<{ type: string; text: string }>): string {
  return sections
    .map(s => {
      const label = SECTION_TYPE_LABELS[s.type] || s.type;
      return `## ${label}\n\n${s.text}`;
    })
    .join('\n\n---\n\n');
}

interface UseDocumentViewerOptions {
  downloadedDecisions: Record<string, DownloadedDecision>;
}

export function useDocumentViewer({ downloadedDecisions }: UseDocumentViewerOptions) {
  const [viewerItem, setViewerItem] = useState<DocumentViewerItem | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [isViewerLoading, setIsViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);

  const closeViewer = useCallback(() => setIsViewerOpen(false), []);

  const openDecisionModal = useCallback(async (d: Decision) => {
    setViewerItem({
      type: 'decision',
      title: d.number,
      subtitle: `${d.court} • ${d.date}`,
      badge: STATUS_LABELS[d.status] || d.status,
      badgeVariant: d.status as 'active' | 'overturned' | 'modified',
      content: d.summary || 'Немає тексту рішення.',
      relevance: d.relevance,
      externalUrl: d.externalUrl,
    });
    setIsViewerOpen(true);
    setViewerError(null);

    // Use cached full text from decisions search store
    if (d.docId && downloadedDecisions[d.docId]) {
      const downloaded = downloadedDecisions[d.docId];
      if (downloaded.sections.length > 0) {
        setViewerItem(prev => prev ? { ...prev, content: formatSections(downloaded.sections) } : prev);
      } else if (downloaded.fullText) {
        setViewerItem(prev => prev ? { ...prev, content: downloaded.fullText } : prev);
      }
      return;
    }

    // Fetch full text via MCP
    const docId = d.docId;
    const caseNumber = d.number !== 'N/A' ? d.number : undefined;

    if (docId || caseNumber) {
      setIsViewerLoading(true);
      try {
        const params: Record<string, any> = { depth: 5 };
        if (docId) params.doc_id = docId;
        else if (caseNumber) params.case_number = caseNumber;

        const result = await mcpService.callTool('get_court_decision', params);
        const parsed = parseToolResult(result);

        if (parsed?.full_text && typeof parsed.full_text === 'string') {
          setViewerItem(prev => prev ? { ...prev, content: parsed.full_text } : prev);
        } else if (parsed?.sections && Array.isArray(parsed.sections) && parsed.sections.length > 0) {
          setViewerItem(prev => prev ? { ...prev, content: formatSections(parsed.sections) } : prev);
        }
      } catch (err: unknown) {
        console.error('Failed to fetch full decision text:', err);
        const msg = getErrorMessage(err);
        if (msg.includes('429')) {
          setViewerError(msg.includes('Daily') ? 'Вичерпано денний ліміт використання. Повний текст буде доступний завтра.' : 'Вичерпано місячний ліміт використання.');
        } else if (msg.includes('402')) {
          setViewerError('Недостатньо коштів на балансі для завантаження повного тексту.');
        } else if (msg.includes('401')) {
          setViewerError('Сесія закінчилась. Увійдіть повторно для завантаження повного тексту.');
        } else {
          setViewerError('Не вдалося завантажити повний текст рішення.');
        }
      } finally {
        setIsViewerLoading(false);
      }
    }
  }, [downloadedDecisions]);

  const openCitationModal = useCallback((c: { text: string; source: string; npaTitle?: string; url?: string }) => {
    setViewerItem({
      type: 'citation',
      title: c.source,
      subtitle: c.npaTitle && c.source !== c.npaTitle ? c.npaTitle : undefined,
      content: c.text || 'Немає тексту.',
      externalUrl: c.url || undefined,
    });
    setIsViewerOpen(true);
  }, []);

  const openDocumentModal = useCallback(async (doc: { id: string; title: string; type: string; uploadedAt?: string; metadata?: Record<string, any> }) => {
    const snippet = doc.metadata?.snippet || doc.metadata?.text || doc.metadata?.content || '';
    setViewerItem({
      type: 'document',
      title: doc.title,
      subtitle: doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString('uk-UA') : undefined,
      badge: DOC_TYPE_LABELS[doc.type] || doc.type,
      badgeVariant: 'default',
      content: snippet || 'Завантаження...',
      relevance: doc.metadata?.relevance != null ? Math.round(doc.metadata.relevance * 100) : undefined,
    });
    setIsViewerOpen(true);
    setIsViewerLoading(true);
    setViewerError(null);

    try {
      const result = await mcpService.callTool('get_document', { documentId: doc.id });
      const parsed = parseToolResult(result);

      let content = parsed?.content || parsed?.text || '';
      if (!content && parsed?.sections && Array.isArray(parsed.sections) && parsed.sections.length > 0) {
        content = formatSections(parsed.sections);
      }

      // Decrypt if document is encrypted
      const isEncrypted = parsed?.is_encrypted;
      if (isEncrypted && content) {
        const { privateKey, isUnlocked } = useEncryptionStore.getState();
        if (!isUnlocked || !privateKey) {
          content = '\u{1F512} Сейф заблоковано. Розблокуйте шифрування для перегляду.';
        } else {
          try {
            const keyData = await encryptionService.getDocumentKey(doc.id);
            const dek = await unwrapDEK(keyData.encrypted_dek, privateKey);
            content = await decryptContent(content, dek);
          } catch {
            content = '\u{1F512} Не вдалося розшифрувати документ. Розблокуйте сейф.';
          }
        }
      }

      if (content) {
        setViewerItem(prev => prev ? { ...prev, content } : prev);
      } else {
        setViewerItem(prev => prev ? { ...prev, content: snippet || 'Немає вмісту для перегляду.' } : prev);
      }
    } catch (err: unknown) {
      console.error('Failed to fetch vault document:', err);
      // Fall back to snippet if available
      if (!snippet) {
        setViewerItem(prev => prev ? { ...prev, content: 'Не вдалося завантажити вміст документа.' } : prev);
      }
    } finally {
      setIsViewerLoading(false);
    }
  }, []);

  return {
    viewerItem,
    isViewerOpen,
    isViewerLoading,
    viewerError,
    closeViewer,
    openDecisionModal,
    openCitationModal,
    openDocumentModal,
  };
}

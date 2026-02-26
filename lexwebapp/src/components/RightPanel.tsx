import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Gavel, BookOpen, FileText, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { Decision } from './DecisionCard';
import { DocumentViewerModal } from './DocumentViewerModal';
import { useUIStore, useDecisionsSearchStore } from '../stores';
import { useEvidenceAggregator } from '../hooks/chat/useEvidenceAggregator';
import { DecisionsTab } from './chat/DecisionsTab';
import { RegulationsTab } from './chat/RegulationsTab';
import { DocumentsTab } from './chat/DocumentsTab';
import { mcpService } from '../services/api/MCPService';
import type { DownloadedDecision } from '../stores/decisionsSearchStore';

interface DocumentViewerItem {
  type: 'decision' | 'citation' | 'document';
  title: string;
  subtitle?: string;
  badge?: string;
  badgeVariant?: 'active' | 'overturned' | 'modified' | 'default';
  content: string;
  relevance?: number;
  externalUrl?: string;
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Чинне',
  overturned: 'Скасовано',
  modified: 'Змінено',
};

const DOC_TYPE_LABELS: Record<string, string> = {
  contract: 'Договір',
  legislation: 'Законодавство',
  court_decision: 'Судове рішення',
  internal: 'Внутрішній',
  other: 'Інше',
};

const SECTION_TYPE_LABELS: Record<string, string> = {
  HEADER: 'Заголовок',
  FACTS: 'Обставини справи',
  COURT_REASONING: 'Мотивувальна частина',
  DECISION: 'Резолютивна частина',
  DISSENT: 'Окрема думка',
  AMOUNTS: 'Суми та компенсації',
  CLAIMS: 'Позовні вимоги',
  LAW_REFERENCES: 'Посилання на закон',
};

interface RightPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Map a DownloadedDecision from the search store into the Decision interface for DecisionsTab */
function mapDownloadedToDecision(d: DownloadedDecision): Decision {
  return {
    id: d.id,
    number: d.caseNumber || `ID ${d.docId}`,
    court: d.court || 'Невідомий суд',
    date: d.date || '',
    summary: d.fullText.substring(0, 300) + (d.fullText.length > 300 ? '...' : ''),
    relevance: 100,
    status: 'active',
    documentType: 'court_decision',
    docId: d.docId,
  };
}

export function RightPanel({ isOpen, onClose }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<'decisions' | 'regulations' | 'documents'>('decisions');
  const userSelectedTab = useRef(false);
  const location = useLocation();
  const isDecisionsPage = location.pathname === '/decisions';

  const { decisions: chatDecisions, otherCourtDocs, citations, vaultDocuments, messagesCount } = useEvidenceAggregator();
  const { downloadedDecisions } = useDecisionsSearchStore();

  // On /decisions page, merge downloaded decisions into the decisions list
  const downloadedList = useMemo(() => {
    if (!isDecisionsPage) return [];
    return Object.values(downloadedDecisions).map(mapDownloadedToDecision);
  }, [isDecisionsPage, downloadedDecisions]);

  const decisions = useMemo(() => {
    if (!isDecisionsPage) return chatDecisions;
    // On decisions page: show downloaded decisions (chat decisions are likely empty)
    if (downloadedList.length > 0) return downloadedList;
    return chatDecisions;
  }, [isDecisionsPage, chatDecisions, downloadedList]);

  // Reset user-selection flag when conversation is cleared
  useEffect(() => {
    if (messagesCount === 0) {
      userSelectedTab.current = false;
      setActiveTab('decisions');
    }
  }, [messagesCount]);

  // Auto-switch to the most relevant tab when data first arrives
  useEffect(() => {
    if (userSelectedTab.current) return;
    if (citations.length > 0 && decisions.length === 0) {
      setActiveTab('regulations');
    } else if (decisions.length > 0) {
      setActiveTab('decisions');
    }
  }, [citations.length, decisions.length]);

  // --- Viewer modal state ---
  const [viewerItem, setViewerItem] = useState<DocumentViewerItem | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [isViewerLoading, setIsViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);

  const openDecisionModal = async (d: Decision) => {
    // Open modal immediately with summary while loading
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

    // If we have the full text from the decisions search store, use it directly
    if (d.docId && downloadedDecisions[d.docId]) {
      const downloaded = downloadedDecisions[d.docId];
      if (downloaded.sections.length > 0) {
        const sectionsText = downloaded.sections
          .map((s) => {
            const label = SECTION_TYPE_LABELS[s.type] || s.type;
            return `## ${label}\n\n${s.text}`;
          })
          .join('\n\n---\n\n');
        setViewerItem(prev => prev ? { ...prev, content: sectionsText } : prev);
      } else if (downloaded.fullText) {
        setViewerItem(prev => prev ? { ...prev, content: downloaded.fullText } : prev);
      }
      return;
    }

    // Try to fetch full text if we have a docId or case number
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
          const sectionsText = parsed.sections
            .map((s: any) => {
              const label = SECTION_TYPE_LABELS[s.type] || s.type;
              return `## ${label}\n\n${s.text}`;
            })
            .join('\n\n---\n\n');

          setViewerItem(prev => prev ? { ...prev, content: sectionsText } : prev);
        }
      } catch (err: any) {
        console.error('Failed to fetch full decision text:', err);
        const msg = err?.message || '';
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
  };

  const openCitationModal = (c: { text: string; source: string }) => {
    setViewerItem({
      type: 'citation',
      title: c.source,
      content: c.text || 'Немає тексту.',
    });
    setIsViewerOpen(true);
  };

  const openDocumentModal = (doc: { id: string; title: string; type: string; uploadedAt?: string; metadata?: Record<string, any> }) => {
    setViewerItem({
      type: 'document',
      title: doc.title,
      subtitle: doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString('uk-UA') : undefined,
      badge: DOC_TYPE_LABELS[doc.type] || doc.type,
      badgeVariant: 'default',
      content: doc.metadata?.snippet || doc.metadata?.text || doc.metadata?.content || 'Немає вмісту для перегляду.',
      relevance: doc.metadata?.relevance != null ? Math.round(doc.metadata.relevance * 100) : undefined,
    });
    setIsViewerOpen(true);
  };

  // --- Resize handle ---
  const { rightPanelWidth, setRightPanelWidth } = useUIStore();
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = rightPanelWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [rightPanelWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = startX.current - e.clientX;
      setRightPanelWidth(startWidth.current + delta);
    };
    const handleMouseUp = () => {
      if (!isResizing.current) return;
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [setRightPanelWidth]);

  // --- Tabs ---
  const tabs = [
    { id: 'decisions' as const, label: 'Рішення', icon: Gavel, count: decisions.length },
    { id: 'regulations' as const, label: 'Норми', icon: BookOpen, count: citations.length },
    { id: 'documents' as const, label: 'Документи', icon: FileText, count: vaultDocuments.length + otherCourtDocs.length },
  ];

  return <>
    {/* Mobile Backdrop */}
    <AnimatePresence>
      {isOpen && <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        onClick={onClose}
        className="fixed inset-0 bg-black/25 z-40 lg:hidden backdrop-blur-[2px]"
      />}
    </AnimatePresence>

    <motion.aside
      initial={false}
      animate={{ x: isOpen ? 0 : rightPanelWidth }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      style={{ width: rightPanelWidth }}
      className="fixed lg:static inset-y-0 right-0 z-50 bg-white border-l border-claude-border flex flex-col lg:translate-x-0 lg:h-full"
    >
      {/* Resize Handle */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-claude-text/20 active:bg-claude-text/30 transition-colors z-50 hidden lg:block"
      />

      {/* Header */}
      <div className="px-4 py-3 border-b border-claude-border/50 flex items-center justify-between">
        <h2 className="font-sans font-semibold text-[15px] text-claude-text tracking-tight">
          Доказова база
        </h2>
        <button onClick={onClose} className="lg:hidden p-2 text-claude-subtext hover:text-claude-text hover:bg-claude-subtext/8 rounded-lg transition-all duration-200">
          <X size={18} strokeWidth={2} />
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-claude-border/50 bg-claude-bg/30">
        <div className="flex overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { userSelectedTab.current = true; setActiveTab(tab.id); }}
              className={`flex-1 min-w-0 px-2 py-2.5 text-[10px] font-medium uppercase tracking-wider transition-all duration-200 border-b-2 ${
                activeTab === tab.id
                  ? 'border-claude-text text-claude-text'
                  : 'border-transparent text-claude-subtext hover:text-claude-text'
              }`}
            >
              <div className="flex items-center justify-center gap-1">
                <tab.icon size={12} strokeWidth={2} />
                <span className="truncate">{tab.label}</span>
                {tab.count > 0 && (
                  <span className={`text-[9px] min-w-[16px] h-4 flex items-center justify-center rounded-full px-1 font-semibold ${
                    activeTab === tab.id ? 'bg-claude-text text-white' : 'bg-claude-subtext/15 text-claude-subtext'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'decisions' && (
          <DecisionsTab decisions={decisions} onOpenModal={openDecisionModal} />
        )}
        {activeTab === 'regulations' && (
          <RegulationsTab citations={citations} onOpenModal={openCitationModal} />
        )}
        {activeTab === 'documents' && (
          <DocumentsTab
            otherCourtDocs={otherCourtDocs}
            vaultDocuments={vaultDocuments}
            onOpenDocModal={openDocumentModal}
          />
        )}
      </div>
    </motion.aside>

    <DocumentViewerModal
      isOpen={isViewerOpen}
      onClose={() => setIsViewerOpen(false)}
      item={viewerItem}
      isLoading={isViewerLoading}
      errorMessage={viewerError}
    />
  </>;
}

/** Parse MCP tool result wrapper to get the inner JSON payload */
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

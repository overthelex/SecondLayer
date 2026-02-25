import { useState, useCallback, useRef, useEffect } from 'react';
import { Gavel, BookOpen, FileText, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Decision } from './DecisionCard';
import { DocumentViewerModal } from './DocumentViewerModal';
import { useUIStore } from '../stores';
import { useEvidenceAggregator } from '../hooks/chat/useEvidenceAggregator';
import { DecisionsTab } from './chat/DecisionsTab';
import { RegulationsTab } from './chat/RegulationsTab';
import { DocumentsTab } from './chat/DocumentsTab';

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

interface RightPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RightPanel({ isOpen, onClose }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<'decisions' | 'regulations' | 'documents'>('decisions');
  const userSelectedTab = useRef(false);

  const { decisions, otherCourtDocs, citations, vaultDocuments, messagesCount } = useEvidenceAggregator();

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

  const openDecisionModal = (d: Decision) => {
    setViewerItem({
      type: 'decision',
      title: d.number,
      subtitle: `${d.court} • ${d.date}`,
      badge: STATUS_LABELS[d.status] || d.status,
      badgeVariant: d.status as 'active' | 'overturned' | 'modified',
      content: d.summary || 'Немає тексту рішення.',
      relevance: d.relevance,
    });
    setIsViewerOpen(true);
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
    />
  </>;
}

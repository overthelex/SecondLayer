import { useState, useRef, useEffect, useMemo } from 'react';
import { Gavel, BookOpen, FileText, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import type { Decision } from '../DecisionCard';
import { DocumentViewerModal } from '../DocumentViewerModal';
import { useUIStore, useDecisionsSearchStore, useChatStore } from '../../stores';
import { useEvidenceAggregator } from '../../hooks/chat/useEvidenceAggregator';
import { useDocumentViewer } from '../../hooks/useDocumentViewer';
import { useLegalT, getLegalT } from '../../i18n/legal-i18n';
import { DecisionsTab } from '../chat/DecisionsTab';
import { RegulationsTab } from '../chat/RegulationsTab';
import { DocumentsTab } from '../chat/DocumentsTab';
import { ResizeHandle } from './ResizeHandle';
import { TabsHeader, type TabId } from './TabsHeader';
import type { DownloadedDecision } from '../../stores/decisionsSearchStore';

/** Map a DownloadedDecision from the search store into the Decision interface for DecisionsTab */
function mapDownloadedToDecision(d: DownloadedDecision): Decision {
  return {
    id: d.id,
    number: d.caseNumber || `ID ${d.docId}`,
    court: d.court || getLegalT().unknownCourt,
    date: d.date || '',
    summary: d.fullText.substring(0, 300) + (d.fullText.length > 300 ? '...' : ''),
    relevance: 100,
    status: 'active',
    documentType: 'court_decision',
    docId: d.docId,
  };
}

interface RightPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RightPanel({ isOpen, onClose }: RightPanelProps) {
  const { t } = useLegalT();
  const [activeTab, setActiveTab] = useState<TabId>('decisions');
  const userSelectedTab = useRef(false);
  const location = useLocation();
  const isDecisionsPage = location.pathname === '/decisions';

  const rightPanelWidth = useUIStore(s => s.rightPanelWidth);
  const conversationId = useChatStore(s => s.conversationId);
  const { decisions: chatDecisions, otherCourtDocs, citations, vaultDocuments, messagesCount } = useEvidenceAggregator(conversationId ?? undefined);
  const downloadedDecisions = useDecisionsSearchStore(s => s.downloadedDecisions);

  // On /decisions page, merge downloaded decisions into the decisions list
  const downloadedList = useMemo(() => {
    if (!isDecisionsPage) return [];
    return Object.values(downloadedDecisions).map(mapDownloadedToDecision);
  }, [isDecisionsPage, downloadedDecisions]);

  const decisions = useMemo(() => {
    if (!isDecisionsPage) return chatDecisions;
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

  const handleTabChange = (id: TabId) => {
    userSelectedTab.current = true;
    setActiveTab(id);
  };

  // Document viewer modal
  const viewer = useDocumentViewer({ downloadedDecisions });

  const tabs = [
    { id: 'decisions' as const, label: t.tabDecisions, icon: Gavel, count: decisions.length },
    { id: 'regulations' as const, label: t.tabRegulations, icon: BookOpen, count: citations.length },
    { id: 'documents' as const, label: t.tabDocumentsPanel, icon: FileText, count: vaultDocuments.length + otherCourtDocs.length },
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
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      style={{ width: rightPanelWidth }}
      className="fixed lg:static inset-y-0 right-0 z-50 bg-zinc-50 border-l border-zinc-200/80 flex flex-col lg:translate-x-0 lg:h-full"
    >
      <ResizeHandle />

      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-zinc-200/60 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-1 h-4 bg-zinc-900 rounded-full flex-shrink-0" />
          <h2 className="font-sans font-semibold text-[11px] text-zinc-900 tracking-[0.12em] uppercase">
            {t.evidenceBase}
          </h2>
        </div>
        <button onClick={onClose} className="lg:hidden p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/70 rounded-md transition-colors duration-150">
          <X size={15} strokeWidth={2} />
        </button>
      </div>

      <TabsHeader tabs={tabs} activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'decisions' && (
          <DecisionsTab decisions={decisions} onOpenModal={viewer.openDecisionModal} />
        )}
        {activeTab === 'regulations' && (
          <RegulationsTab citations={citations} onOpenModal={viewer.openCitationModal} />
        )}
        {activeTab === 'documents' && (
          <DocumentsTab
            otherCourtDocs={otherCourtDocs}
            vaultDocuments={vaultDocuments}
            onOpenDocModal={viewer.openDocumentModal}
          />
        )}
      </div>
    </motion.aside>

    <DocumentViewerModal
      isOpen={viewer.isViewerOpen}
      onClose={viewer.closeViewer}
      item={viewer.viewerItem}
      isLoading={viewer.isViewerLoading}
      errorMessage={viewer.viewerError}
    />
  </>;
}

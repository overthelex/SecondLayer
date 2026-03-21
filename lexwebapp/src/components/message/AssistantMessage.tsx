import { useState, useCallback, useRef } from 'react';
import { Copy, RotateCw, Star, ThumbsUp, ThumbsDown, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Decision } from '../DecisionCard';
import { AnalyticsBlock } from '../AnalyticsBlock';
import { ThinkingSteps } from '../ThinkingSteps';
import { PlanDisplay } from '../PlanDisplay';
import { LexLogo3D } from '../LexLogo3D';
import { CostSummary } from '../CostSummary';
import { DocumentViewerModal } from '../DocumentViewerModal';
import type { DocumentViewerItem } from '../DocumentViewerModal';
import { MarkdownContent } from './MarkdownContent';
import { isRawJsonContent } from './utils';
import showToast from '../../utils/toast';
import type { ExecutionPlan, CitationWarning, CostSummary as CostSummaryType } from '../../types/models/Message';
import { useChatStore } from '../../stores';
import { EvidenceService } from '../../services/api/EvidenceService';

interface AssistantMessageProps {
  content: string;
  isStreaming?: boolean;
  decisions?: Decision[];
  analytics?: {
    totalCases: number;
    satisfied: number;
    rejected: number;
    partial: number;
    trend: 'up' | 'down' | 'stable';
    interpretation: string;
  };
  citations?: Array<{ text: string; source: string }>;
  documents?: Array<{ id: string; title: string; type: string }>;
  thinkingSteps?: Array<{ id: string; title: string; content?: string; isComplete: boolean }>;
  executionPlan?: ExecutionPlan;
  citationWarnings?: CitationWarning[];
  costSummary?: CostSummaryType;
  onRegenerate?: () => void;
}

export function AssistantMessage({
  content, isStreaming, decisions, analytics, citations, documents,
  thinkingSteps, executionPlan, citationWarnings, costSummary, onRegenerate,
}: AssistantMessageProps) {
  const [showThinking, setShowThinking] = useState(false);
  const [starred, setStarred] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [docViewerItem, setDocViewerItem] = useState<DocumentViewerItem | null>(null);
  const [isDocViewerOpen, setIsDocViewerOpen] = useState(false);

  const allMessages = useChatStore(state => state.messages);

  const [isDocLoading, setIsDocLoading] = useState(false);
  const loadingDocRef = useRef<string | null>(null);

  const openDocByRef = useCallback((docId: string) => {
    const allDecisions = allMessages.flatMap(m => (m as any).decisions ?? []) as Decision[];
    const decision = allDecisions.find(d =>
      d.id.includes(docId) || (d as any).externalUrl?.includes(`/Review/${docId}`)
    );
    if (!decision) return;

    const STATUS_LABELS: Record<string, string> = { active: 'Чинне', overturned: 'Скасовано', modified: 'Змінено' };

    // Show modal immediately with summary
    setDocViewerItem({
      type: 'decision',
      title: decision.number,
      subtitle: [decision.court, decision.date].filter(Boolean).join(' • '),
      badge: STATUS_LABELS[decision.status] || decision.status,
      badgeVariant: decision.status as 'active' | 'overturned' | 'modified',
      content: decision.summary || 'Завантаження повного тексту...',
      relevance: decision.relevance,
      externalUrl: decision.externalUrl,
    });
    setIsDocViewerOpen(true);

    // Extract numeric EDRSR doc_id from decision id (prefixes: d-, sc-, chain-, pc-, gcd-) or from externalUrl
    const edsrDocId = decision.docId
      || decision.id.replace(/^(?:d|sc|chain|pc|gcd)-/, '')
      || decision.externalUrl?.match(/\/Review\/(\d+)/)?.[1];

    if (edsrDocId && /^\d+$/.test(String(edsrDocId))) {
      // Prevent duplicate fetches
      if (loadingDocRef.current === String(edsrDocId)) return;
      loadingDocRef.current = String(edsrDocId);
      setIsDocLoading(true);

      EvidenceService.getEdsrFulltext(edsrDocId).then(result => {
        if (result?.full_text) {
          setDocViewerItem(prev => prev ? {
            ...prev,
            content: result.full_text!,
            subtitle: [result.court_name || decision.court, result.judgment_form, decision.date].filter(Boolean).join(' • '),
          } : prev);
        } else {
          setDocViewerItem(prev => prev ? {
            ...prev,
            content: prev.content === 'Завантаження повного тексту...'
              ? (decision.summary || 'Повний текст рішення недоступний.')
              : prev.content,
          } : prev);
        }
      }).finally(() => {
        setIsDocLoading(false);
        loadingDocRef.current = null;
      });
    }
  }, [allMessages]);

  const hasEvidence = (decisions && decisions.length > 0) || (citations && citations.length > 0) || (documents && documents.length > 0);
  const displayContent = (!isStreaming && isRawJsonContent(content) && hasEvidence)
    ? 'Результати відображені на панелі праворуч.'
    : content;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      showToast.success('Скопійовано');
    }).catch(() => {
      showToast.error('Не вдалося скопіювати');
    });
  }, [content]);

  const handleStar = useCallback(() => {
    setStarred((prev) => !prev);
    showToast.info(starred ? 'Вилучено з обраного' : 'Збережено в обране');
  }, [starred]);

  const handleFeedback = useCallback((type: 'up' | 'down') => {
    setFeedback((prev) => prev === type ? null : type);
    if (feedback !== type) {
      showToast.info(type === 'up' ? 'Дякуємо за відгук!' : 'Дякуємо, врахуємо');
    }
  }, [feedback]);

  return (
    <>
      <div className="flex gap-3 md:gap-4">
        {/* Avatar */}
        <div className="flex-shrink-0 mt-1">
          <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center">
            <LexLogo3D spinning={!!isStreaming} size={32} />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-4">
          {executionPlan && <PlanDisplay plan={executionPlan} />}

          {thinkingSteps && thinkingSteps.length > 0 && (
            <div>
              <button onClick={() => setShowThinking(!showThinking)} className="flex items-center gap-2 text-[12px] text-zinc-400 hover:text-zinc-700 transition-colors duration-150 mb-2">
                <ChevronDown size={13} className={`transition-transform duration-200 ${showThinking ? 'rotate-180' : ''}`} strokeWidth={2} />
                <span className="font-medium tracking-tight">
                  {thinkingSteps[0]?.title || 'Обдумую відповідь...'}
                </span>
              </button>
              <AnimatePresence>
                {showThinking && <ThinkingSteps steps={thinkingSteps} isThinking={isStreaming} />}
              </AnimatePresence>
            </div>
          )}

          <MarkdownContent content={displayContent} isStreaming={isStreaming} openDocByRef={openDocByRef} />

          {citationWarnings && citationWarnings.length > 0 && (
            <div className="space-y-2 mt-4">
              {citationWarnings.map((warning, idx) => (
                <motion.div
                  key={`cw-${idx}`}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: idx * 0.08 }}
                  className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border ${
                    warning.status === 'explicitly_overruled'
                      ? 'bg-orange-50 border-orange-200/70'
                      : 'bg-amber-50 border-amber-200/70'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] leading-relaxed ${
                      warning.status === 'explicitly_overruled'
                        ? 'text-orange-700'
                        : 'text-amber-700'
                    }`}>
                      {warning.message}
                    </p>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {warning.status === 'explicitly_overruled' ? 'Скасовано вищою інстанцією' : 'Частково змінено'} · впевненість: {Math.round(warning.confidence * 100)}%
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {analytics && <AnalyticsBlock data={analytics} />}

          {costSummary && !isStreaming && (
            <CostSummary data={costSummary} />
          )}

          {!isStreaming && content && (
            <div className="flex items-center gap-0.5 pt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <button
                onClick={handleCopy}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-md transition-colors duration-150"
                aria-label="Copy message"
                title="Копіювати"
              >
                <Copy size={12} strokeWidth={2} />
              </button>
              <button
                onClick={handleStar}
                className={`p-1.5 hover:bg-zinc-100 rounded-md transition-colors duration-150 ${starred ? 'text-zinc-700' : 'text-zinc-400 hover:text-zinc-600'}`}
                aria-label="Save to favorites"
                title="Зберегти в обране"
              >
                <Star size={12} strokeWidth={2} fill={starred ? 'currentColor' : 'none'} />
              </button>
              {onRegenerate && (
                <button
                  onClick={onRegenerate}
                  className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-md transition-colors duration-150"
                  aria-label="Regenerate response"
                  title="Повторити"
                >
                  <RotateCw size={12} strokeWidth={2} />
                </button>
              )}
              <div className="w-px h-3 bg-zinc-200 mx-1" />
              <button
                onClick={() => handleFeedback('up')}
                className={`p-1.5 hover:bg-zinc-100 rounded-md transition-colors duration-150 ${feedback === 'up' ? 'text-zinc-700' : 'text-zinc-400 hover:text-zinc-600'}`}
                aria-label="Good response"
                title="Гарна відповідь"
              >
                <ThumbsUp size={12} strokeWidth={2} fill={feedback === 'up' ? 'currentColor' : 'none'} />
              </button>
              <button
                onClick={() => handleFeedback('down')}
                className={`p-1.5 hover:bg-zinc-100 rounded-md transition-colors duration-150 ${feedback === 'down' ? 'text-zinc-700' : 'text-zinc-400 hover:text-zinc-600'}`}
                aria-label="Bad response"
                title="Погана відповідь"
              >
                <ThumbsDown size={12} strokeWidth={2} fill={feedback === 'down' ? 'currentColor' : 'none'} />
              </button>
            </div>
          )}
        </div>
      </div>

      <DocumentViewerModal
        isOpen={isDocViewerOpen}
        onClose={() => setIsDocViewerOpen(false)}
        item={docViewerItem}
        isLoading={isDocLoading}
      />
    </>
  );
}

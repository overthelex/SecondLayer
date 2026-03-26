/**
 * DocumentsTab — renders vault documents + other court docs (Ухвала, Окрема думка, etc.).
 */

import { FileText, ChevronDown, ChevronUp } from 'lucide-react';
import type { Decision } from '../DecisionCard';
import { ExpandableCard, EmptyTabState } from './ExpandableCard';
import { useExpandableCards } from '../../hooks/useExpandableCards';
import { DOC_TYPE_LABELS } from '../right-panel/constants';

function formatDate(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface VaultDocument {
  id: string;
  title: string;
  type: string;
  uploadedAt?: string;
  metadata?: Record<string, any>;
}

interface DocumentsTabProps {
  otherCourtDocs: Decision[];
  vaultDocuments: VaultDocument[];
  onOpenDocModal: (doc: VaultDocument) => void;
  onOpenDecisionModal?: (decision: Decision) => void;
}

export function DocumentsTab({ otherCourtDocs, vaultDocuments, onOpenDocModal, onOpenDecisionModal }: DocumentsTabProps) {
  const { isExpanded, toggleCard } = useExpandableCards();

  if (vaultDocuments.length === 0 && otherCourtDocs.length === 0) {
    return <EmptyTabState icon={FileText} text="Документи з'являться після пошуку" />;
  }

  return (
    <div className="space-y-2">
      {/* Other court document types (Ухвала, Окрема думка, etc.) */}
      {otherCourtDocs.map((d, i) => {
        const cardId = `other-${d.id}`;
        const expanded = isExpanded(cardId);

        return (
          <ExpandableCard
            key={d.id}
            id={cardId}
            index={i}
            icon={FileText}
            isExpanded={expanded}
            onToggle={() => toggleCard(cardId)}
            content={d.summary || 'Немає тексту.'}
            onOpenModal={onOpenDecisionModal ? () => onOpenDecisionModal(d) : undefined}
            externalUrl={d.externalUrl}
            header={
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0 pr-2">
                  <div className="font-medium text-[11.5px] text-zinc-800 truncate leading-tight mb-1">
                    {d.number}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-zinc-400">
                    <span className="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 border border-zinc-200 font-medium text-[9px] uppercase tracking-[0.04em]">
                      {d.documentType}
                    </span>
                    {d.court && <span>{d.court}</span>}
                    {d.date && <><span className="text-zinc-300">·</span><span>{formatDate(d.date)}</span></>}
                  </div>
                </div>
                {expanded ? <ChevronUp size={13} className="text-zinc-400 flex-shrink-0 mt-0.5" strokeWidth={2} /> : <ChevronDown size={13} className="text-zinc-400 flex-shrink-0 mt-0.5" strokeWidth={2} />}
              </div>
            }
            preview={
              d.summary ? (
                <p className="text-[11px] text-zinc-500 leading-relaxed mt-1.5 line-clamp-2">{d.summary}</p>
              ) : null
            }
          />
        );
      })}

      {/* Vault documents */}
      {vaultDocuments.map((doc, i) => {
        const cardId = `doc-${doc.id}`;
        const expanded = isExpanded(cardId);

        return (
          <ExpandableCard
            key={doc.id}
            id={cardId}
            index={i}
            icon={FileText}
            isExpanded={expanded}
            onToggle={() => toggleCard(cardId)}
            content={doc.metadata?.snippet || doc.metadata?.text || doc.metadata?.content || 'Немає вмісту для перегляду.'}
            onOpenModal={() => onOpenDocModal(doc)}
            header={
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0 pr-2">
                  <div className="font-medium text-[11.5px] text-zinc-800 truncate leading-tight mb-1">
                    {doc.title}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                    <span className={`px-1.5 py-0.5 rounded font-medium border text-[9px] uppercase tracking-[0.04em] ${
                      doc.type === 'court_decision'
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : doc.type === 'legislation'
                        ? 'bg-zinc-100 text-zinc-600 border-zinc-200'
                        : doc.type === 'contract'
                        ? 'bg-zinc-100 text-zinc-600 border-zinc-200'
                        : 'bg-zinc-100 text-zinc-500 border-zinc-200'
                    }`}>
                      {DOC_TYPE_LABELS[doc.type] || doc.type}
                    </span>
                    {doc.uploadedAt && (
                      <span>{new Date(doc.uploadedAt).toLocaleDateString('uk-UA')}</span>
                    )}
                  </div>
                </div>
                {expanded ? <ChevronUp size={13} className="text-zinc-400 flex-shrink-0 mt-0.5" strokeWidth={2} /> : <ChevronDown size={13} className="text-zinc-400 flex-shrink-0 mt-0.5" strokeWidth={2} />}
              </div>
            }
            preview={
              doc.metadata?.snippet ? (
                <p className="text-[11px] text-zinc-500 leading-relaxed mt-1.5 line-clamp-2">
                  {doc.metadata.snippet}
                </p>
              ) : null
            }
          />
        );
      })}
    </div>
  );
}

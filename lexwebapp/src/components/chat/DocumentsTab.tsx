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
}

export function DocumentsTab({ otherCourtDocs, vaultDocuments, onOpenDocModal }: DocumentsTabProps) {
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
            externalUrl={d.externalUrl}
            header={
              <div className="flex items-start gap-2.5">
                <div className="p-1 bg-claude-bg rounded-md flex-shrink-0 mt-0.5">
                  <FileText size={12} className="text-claude-text" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div className="font-medium text-[13px] text-claude-text mb-1 truncate leading-tight">
                      {d.number}
                    </div>
                    {expanded ? <ChevronUp size={14} className="text-claude-subtext flex-shrink-0 ml-2" /> : <ChevronDown size={14} className="text-claude-subtext flex-shrink-0 ml-2" />}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-claude-subtext">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium border bg-amber-50 text-amber-700 border-amber-200">
                      {d.documentType}
                    </span>
                    {d.court && <span>{d.court}</span>}
                    {d.date && <span>{formatDate(d.date)}</span>}
                  </div>
                </div>
              </div>
            }
            preview={
              d.summary ? (
                <div className="ml-[30px]">
                  <p className="text-[11px] text-claude-subtext leading-relaxed mt-1.5 line-clamp-2">{d.summary}</p>
                </div>
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
              <div className="flex items-start gap-2.5">
                <div className="p-1 bg-claude-bg rounded-md flex-shrink-0 mt-0.5">
                  <FileText size={12} className="text-claude-text" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div className="font-medium text-[13px] text-claude-text mb-1 truncate leading-tight">
                      {doc.title}
                    </div>
                    {expanded ? <ChevronUp size={14} className="text-claude-subtext flex-shrink-0 ml-2" /> : <ChevronDown size={14} className="text-claude-subtext flex-shrink-0 ml-2" />}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-claude-subtext">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                      doc.type === 'court_decision'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : doc.type === 'legislation'
                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                        : doc.type === 'contract'
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-claude-bg text-claude-subtext border-claude-border'
                    }`}>
                      {DOC_TYPE_LABELS[doc.type] || doc.type}
                    </span>
                    {doc.uploadedAt && (
                      <span>{new Date(doc.uploadedAt).toLocaleDateString('uk-UA')}</span>
                    )}
                  </div>
                </div>
              </div>
            }
            preview={
              doc.metadata?.snippet ? (
                <div className="ml-[30px]">
                  <p className="text-[11px] text-claude-subtext leading-relaxed mt-1.5 line-clamp-2">
                    {doc.metadata.snippet}
                  </p>
                </div>
              ) : null
            }
          />
        );
      })}
    </div>
  );
}

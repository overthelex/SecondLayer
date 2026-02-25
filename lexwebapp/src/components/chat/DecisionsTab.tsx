/**
 * DecisionsTab — renders court decision cards (Рішення/Вирок).
 */

import { useState } from 'react';
import { Gavel, ChevronDown, ChevronUp } from 'lucide-react';
import type { Decision } from '../DecisionCard';
import { ExpandableCard, EmptyTabState } from './ExpandableCard';

function formatDate(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Чинне',
  overturned: 'Скасовано',
  modified: 'Змінено',
};

interface DecisionsTabProps {
  decisions: Decision[];
  onOpenModal: (decision: Decision) => void;
}

export function DecisionsTab({ decisions, onOpenModal }: DecisionsTabProps) {
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const toggleCard = (id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (decisions.length === 0) {
    return <EmptyTabState icon={Gavel} text="Судові рішення з'являться після аналізу" />;
  }

  return (
    <div className="space-y-2">
      {decisions.map((decision, i) => {
        const cardId = `decision-${decision.id}`;
        const isExpanded = expandedCards.has(cardId);

        return (
          <ExpandableCard
            key={decision.id}
            id={cardId}
            index={i}
            icon={Gavel}
            isExpanded={isExpanded}
            onToggle={() => toggleCard(cardId)}
            content={decision.summary || 'Немає тексту рішення.'}
            onOpenModal={() => onOpenModal(decision)}
            externalUrl={decision.externalUrl}
            header={
              <>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-1 bg-claude-bg rounded-md flex-shrink-0">
                      <Gavel size={12} className="text-claude-text" strokeWidth={2} />
                    </div>
                    <span className="font-mono text-[12px] font-semibold text-claude-text truncate">
                      {decision.number}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wide border ${
                      decision.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : decision.status === 'overturned'
                        ? 'bg-red-50 text-red-600 border-red-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {STATUS_LABELS[decision.status] || decision.status}
                    </span>
                    {isExpanded ? <ChevronUp size={14} className="text-claude-subtext" /> : <ChevronDown size={14} className="text-claude-subtext" />}
                  </div>
                </div>
                <div className="text-[11px] text-claude-subtext mb-2">
                  {decision.court} {decision.date && `• ${formatDate(decision.date)}`}
                </div>
              </>
            }
            preview={
              decision.summary ? (
                <p className="text-[12px] text-claude-text/80 leading-relaxed line-clamp-2">
                  {decision.summary}
                </p>
              ) : null
            }
          />
        );
      })}
    </div>
  );
}

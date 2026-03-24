/**
 * DecisionsTab — renders court decision cards (Рішення/Вирок).
 */

import { Gavel, ChevronDown, ChevronUp } from 'lucide-react';
import type { Decision } from '../DecisionCard';
import { ExpandableCard, EmptyTabState } from './ExpandableCard';
import { useExpandableCards } from '../../hooks/useExpandableCards';
import { STATUS_LABELS } from '../right-panel/constants';

function formatDate(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

interface DecisionsTabProps {
  decisions: Decision[];
  onOpenModal: (decision: Decision) => void;
}

export function DecisionsTab({ decisions, onOpenModal }: DecisionsTabProps) {
  const { isExpanded, toggleCard } = useExpandableCards();

  if (decisions.length === 0) {
    return <EmptyTabState icon={Gavel} text="Судові рішення з'являться після аналізу" />;
  }

  return (
    <div className="space-y-2">
      {decisions.map((decision, i) => {
        const cardId = `decision-${decision.id}`;
        const expanded = isExpanded(cardId);

        return (
          <ExpandableCard
            key={decision.id}
            id={cardId}
            index={i}
            icon={Gavel}
            isExpanded={expanded}
            onToggle={() => toggleCard(cardId)}
            content={decision.summary || 'Немає тексту рішення.'}
            onOpenModal={() => onOpenModal(decision)}
            externalUrl={decision.externalUrl}
            header={
              <>
                <div className="flex items-start justify-between mb-1.5">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="font-mono text-[11.5px] font-semibold text-zinc-800 truncate leading-tight">
                      {decision.number}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-[0.04em] border ${
                      decision.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : decision.status === 'overturned'
                        ? 'bg-red-50 text-red-600 border-red-200'
                        : 'bg-zinc-100 text-zinc-500 border-zinc-200'
                    }`}>
                      {STATUS_LABELS[decision.status] || decision.status}
                    </span>
                    {expanded ? <ChevronUp size={13} className="text-zinc-400" strokeWidth={2} /> : <ChevronDown size={13} className="text-zinc-400" strokeWidth={2} />}
                  </div>
                </div>
                <div className="text-[10.5px] text-zinc-400 leading-tight">
                  {decision.court}{decision.date && <span className="mx-1 text-zinc-300">·</span>}{decision.date && formatDate(decision.date)}
                </div>
              </>
            }
            preview={
              decision.summary ? (
                <p className="text-[11px] text-zinc-500 leading-relaxed line-clamp-2 mt-1.5">
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

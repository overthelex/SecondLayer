/**
 * RegulationsTab — renders legislation/norm citation cards.
 */

import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import { ExpandableCard, EmptyTabState } from './ExpandableCard';
import { useExpandableCards } from '../../hooks/useExpandableCards';

interface Citation {
  text: string;
  source: string;
}

interface RegulationsTabProps {
  citations: Citation[];
  onOpenModal: (citation: Citation) => void;
}

export function RegulationsTab({ citations, onOpenModal }: RegulationsTabProps) {
  const { isExpanded, toggleCard } = useExpandableCards();

  if (citations.length === 0) {
    return <EmptyTabState icon={BookOpen} text="Нормативні акти з'являться після аналізу" />;
  }

  return (
    <div className="space-y-2">
      {citations.map((citation, idx) => {
        const cardId = `citation-${idx}`;
        const expanded = isExpanded(cardId);
        // Safeguard: citation.text may arrive as an object/array from MCP content blocks
        const safeText = typeof citation.text === 'string' ? citation.text : JSON.stringify(citation.text);

        return (
          <ExpandableCard
            key={idx}
            id={cardId}
            index={idx}
            icon={BookOpen}
            isExpanded={expanded}
            onToggle={() => toggleCard(cardId)}
            content={safeText || 'Немає тексту.'}
            onOpenModal={() => onOpenModal(citation)}
            header={
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0 pr-2">
                  <div className="font-medium text-[11.5px] text-zinc-800 leading-snug">
                    {citation.source}
                  </div>
                </div>
                {expanded ? <ChevronUp size={13} className="text-zinc-400 flex-shrink-0 mt-0.5" strokeWidth={2} /> : <ChevronDown size={13} className="text-zinc-400 flex-shrink-0 mt-0.5" strokeWidth={2} />}
              </div>
            }
            preview={
              <p className="text-[11px] text-zinc-500 leading-relaxed line-clamp-3 mt-1.5">
                {safeText}
              </p>
            }
          />
        );
      })}
    </div>
  );
}

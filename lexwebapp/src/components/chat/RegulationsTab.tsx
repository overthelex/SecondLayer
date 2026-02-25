/**
 * RegulationsTab — renders legislation/norm citation cards.
 */

import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import { ExpandableCard, EmptyTabState } from './ExpandableCard';

interface Citation {
  text: string;
  source: string;
}

interface RegulationsTabProps {
  citations: Citation[];
  onOpenModal: (citation: Citation) => void;
}

export function RegulationsTab({ citations, onOpenModal }: RegulationsTabProps) {
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const toggleCard = (id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (citations.length === 0) {
    return <EmptyTabState icon={BookOpen} text="Нормативні акти з'являться після аналізу" />;
  }

  return (
    <div className="space-y-2">
      {citations.map((citation, idx) => {
        const cardId = `citation-${idx}`;
        const isExpanded = expandedCards.has(cardId);

        return (
          <ExpandableCard
            key={idx}
            id={cardId}
            index={idx}
            icon={BookOpen}
            isExpanded={isExpanded}
            onToggle={() => toggleCard(cardId)}
            content={citation.text || 'Немає тексту.'}
            onOpenModal={() => onOpenModal(citation)}
            header={
              <div className="flex items-start gap-2.5">
                <div className="p-1 bg-claude-bg rounded-md flex-shrink-0 mt-0.5">
                  <BookOpen size={12} className="text-claude-text" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div className="font-medium text-[13px] text-claude-text mb-1 leading-tight">
                      {citation.source}
                    </div>
                    {isExpanded ? <ChevronUp size={14} className="text-claude-subtext flex-shrink-0 ml-2" /> : <ChevronDown size={14} className="text-claude-subtext flex-shrink-0 ml-2" />}
                  </div>
                </div>
              </div>
            }
            preview={
              <div className="ml-[30px]">
                <p className="text-[11px] text-claude-subtext leading-relaxed line-clamp-3">
                  {citation.text}
                </p>
              </div>
            }
          />
        );
      })}
    </div>
  );
}

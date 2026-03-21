import { useState, useCallback } from 'react';

/** Shared expand/collapse state for card lists (DecisionsTab, RegulationsTab, DocumentsTab). */
export function useExpandableCards() {
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const toggleCard = useCallback((id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isExpanded = useCallback((id: string) => expandedCards.has(id), [expandedCards]);

  return { isExpanded, toggleCard };
}

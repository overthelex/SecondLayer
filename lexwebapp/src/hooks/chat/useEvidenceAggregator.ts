/**
 * useEvidenceAggregator — aggregates and deduplicates evidence from all chat messages.
 * Returns decisions (split into proper decisions vs other court docs), citations, and vault documents.
 */

import { useMemo } from 'react';
import { useChatStore } from '../../stores';
import type { Decision, Citation, VaultDocument } from '../../types/models/Message';

/** Only "Рішення" and "Вирок" are proper court decisions */
const DECISION_TYPES = new Set(['Рішення', 'Вирок']);

export function useEvidenceAggregator() {
  const messages = useChatStore(state => state.messages);

  const allDecisions = useMemo(() => {
    const seen = new Set<string>();
    return messages.flatMap(m => m.decisions ?? []).filter(d => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });
  }, [messages]);

  const decisions = useMemo(() =>
    allDecisions.filter(d => d.documentType && DECISION_TYPES.has(d.documentType)),
    [allDecisions]
  );

  const otherCourtDocs = useMemo(() =>
    allDecisions.filter(d => !d.documentType || !DECISION_TYPES.has(d.documentType)),
    [allDecisions]
  );

  const citations = useMemo(() => {
    const seen = new Set<string>();
    return messages.flatMap(m => m.citations ?? []).filter(c => {
      const key = c.source.toLowerCase().replace(/\s+/g, ' ').trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [messages]);

  const vaultDocuments = useMemo(() => {
    const seen = new Set<string>();
    return messages.flatMap(m => m.documents ?? []).filter(d => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });
  }, [messages]);

  return { decisions, otherCourtDocs, citations, vaultDocuments, messagesCount: messages.length };
}

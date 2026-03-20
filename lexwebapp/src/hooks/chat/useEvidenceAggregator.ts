/**
 * useEvidenceAggregator — aggregates and deduplicates evidence from all chat messages.
 * Returns decisions (split into proper decisions vs other court docs), citations, and vault documents.
 *
 * Supports two data sources:
 * 1. SSE-streamed evidence during active chat (real-time, from messages in store)
 * 2. API-fetched evidence for persisted conversations (hydration on conversation load)
 */

import { useMemo, useEffect, useState, useRef } from 'react';
import { useChatStore } from '../../stores';
import { EvidenceService } from '../../services/api/EvidenceService';
import type { Decision, Citation } from '../../types/models/Message';

/** Proper court decisions — shown in the "Рішення" tab */
const DECISION_TYPES = new Set(['Рішення', 'Вирок', 'Постанова']);

/** Procedural court docs (ухвали, окремі думки) — shown in "Документи" tab */
const PROCEDURAL_TYPES = new Set(['Ухвала', 'Окрема думка', 'Окрема ухвала']);

export function useEvidenceAggregator(conversationId?: string) {
  const messages = useChatStore(state => state.messages);

  // API-fetched evidence for persisted conversations
  const [apiDecisions, setApiDecisions] = useState<Decision[]>([]);
  const [apiCourtDocs, setApiCourtDocs] = useState<Decision[]>([]);
  const [apiCitations, setApiCitations] = useState<Citation[]>([]);
  const fetchedConvRef = useRef<string | null>(null);

  // Hydrate from API when conversationId changes and we have no SSE data
  useEffect(() => {
    if (!conversationId || fetchedConvRef.current === conversationId) return;

    // Only hydrate if we have few messages (loading persisted conversation)
    const hasAssistantMessages = messages.some(m => m.role === 'assistant' && (m.decisions?.length || m.citations?.length));
    if (hasAssistantMessages) {
      fetchedConvRef.current = conversationId;
      return;
    }

    fetchedConvRef.current = conversationId;

    Promise.all([
      EvidenceService.getDecisions(conversationId),
      EvidenceService.getCourtDocuments(conversationId),
      EvidenceService.getRegulations(conversationId),
    ]).then(([decisions, courtDocs, regulations]) => {
      setApiDecisions(decisions);
      setApiCourtDocs(courtDocs);
      setApiCitations(regulations);
    }).catch(() => {
      // Silently fail — SSE data will be primary source
    });
  }, [conversationId, messages]);

  // SSE-streamed evidence from current messages
  const allDecisions = useMemo(() => {
    const seen = new Set<string>();
    return messages.flatMap(m => m.decisions ?? []).filter(d => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });
  }, [messages]);

  // Merge SSE + API decisions with dedup
  const decisions = useMemo(() => {
    const sseDecisions = allDecisions.filter(d => !d.documentType || DECISION_TYPES.has(d.documentType));
    if (apiDecisions.length === 0) return sseDecisions;

    const seen = new Set(sseDecisions.map(d => d.id));
    const merged = [...sseDecisions];
    for (const d of apiDecisions) {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        merged.push(d);
      }
    }
    return merged;
  }, [allDecisions, apiDecisions]);

  const otherCourtDocs = useMemo(() => {
    const sseDocs = allDecisions.filter(d => d.documentType && PROCEDURAL_TYPES.has(d.documentType));
    if (apiCourtDocs.length === 0) return sseDocs;

    const seen = new Set(sseDocs.map(d => d.id));
    const merged = [...sseDocs];
    for (const d of apiCourtDocs) {
      if (!seen.has(d.id)) {
        seen.add(d.id);
        merged.push(d);
      }
    }
    return merged;
  }, [allDecisions, apiCourtDocs]);

  const citations = useMemo(() => {
    const seen = new Set<string>();
    const sseCitations = messages.flatMap(m => m.citations ?? []).filter(c => {
      const key = c.source.toLowerCase().replace(/\s+/g, ' ').trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (apiCitations.length === 0) return sseCitations;

    const merged = [...sseCitations];
    for (const c of apiCitations) {
      const key = c.source.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(c);
      }
    }
    return merged;
  }, [messages, apiCitations]);

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

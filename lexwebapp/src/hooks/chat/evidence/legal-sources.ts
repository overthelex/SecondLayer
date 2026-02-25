import type { Decision, Citation } from '../../../types/models/Message';
import type { EvidenceResult } from './types';

export function extractRetrieveLegalSourcesEvidence(toolName: string, parsed: any): EvidenceResult {
  if (toolName !== 'retrieve_legal_sources') {
    return { decisions: [], citations: [], documents: [] };
  }
  const decisions: Decision[] = [];
  const citations: Citation[] = [];

  if (parsed.cases && Array.isArray(parsed.cases)) {
    for (const c of parsed.cases) {
      decisions.push({
        id: `rls-${c.id || Math.random().toString(36).slice(2, 8)}`,
        number: c.id || 'N/A',
        court: c.court || '',
        date: c.date || '',
        summary: c.text?.slice(0, 300) || c.title || '',
        relevance: 70,
        status: 'active',
      });
    }
  }
  if (parsed.laws && Array.isArray(parsed.laws)) {
    for (const l of parsed.laws) {
      citations.push({
        text: l.text || l.full_text || l.title || '',
        source: l.article ? `${l.title || l.rada_id || ''}, ст. ${l.article}` : (l.title || 'Норма'),
      });
    }
  }
  return { decisions, citations, documents: [] };
}

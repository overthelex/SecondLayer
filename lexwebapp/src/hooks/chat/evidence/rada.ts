import type { Citation, VaultDocument } from '../../../types/models/Message';
import type { EvidenceResult } from './types';

const RADA_TOOLS = [
  'rada_search_parliament_bills',
  'rada_get_deputy_info',
  'rada_search_legislation_text',
  'rada_analyze_voting_record',
];

export function extractRadaEvidence(toolName: string, parsed: any): EvidenceResult {
  const citations: Citation[] = [];
  const documents: VaultDocument[] = [];
  if (!RADA_TOOLS.some((t) => toolName === t)) {
    return { decisions: [], citations, documents };
  }

  // Bills
  if (parsed.bills && Array.isArray(parsed.bills)) {
    for (const bill of parsed.bills) {
      documents.push({
        id: `bill-${bill.id || bill.number || Math.random().toString(36).slice(2, 8)}`,
        title: bill.title || bill.name || `Законопроект ${bill.number || ''}`,
        type: 'legislation',
        metadata: {
          snippet: bill.summary || bill.description || '',
          status: bill.status,
          number: bill.number,
          date: bill.date || bill.registration_date,
        },
      });
    }
  }

  // Deputy info (single)
  if (parsed.name && (parsed.faction || parsed.party || parsed.deputy_id)) {
    documents.push({
      id: `deputy-${parsed.deputy_id || parsed.id || Math.random().toString(36).slice(2, 8)}`,
      title: parsed.name || parsed.full_name || 'Народний депутат',
      type: 'other',
      metadata: {
        snippet: [parsed.faction || parsed.party, parsed.region, parsed.position].filter(Boolean).join(' \u2022 '),
        deputy_id: parsed.deputy_id || parsed.id,
      },
    });
  }

  // Deputies array
  if (parsed.deputies && Array.isArray(parsed.deputies)) {
    for (const dep of parsed.deputies) {
      documents.push({
        id: `deputy-${dep.id || Math.random().toString(36).slice(2, 8)}`,
        title: dep.name || dep.full_name || 'Депутат',
        type: 'other',
        metadata: {
          snippet: [dep.faction || dep.party, dep.region].filter(Boolean).join(' \u2022 '),
        },
      });
    }
  }

  // Legislation text search
  if (parsed.results && Array.isArray(parsed.results) && toolName === 'rada_search_legislation_text') {
    for (const r of parsed.results) {
      citations.push({
        text: (r.text || r.snippet || r.content || '').slice(0, 500),
        source: r.title || r.law_title || r.source || 'Законодавство',
      });
    }
  }

  // Voting record
  if (parsed.votings && Array.isArray(parsed.votings)) {
    for (const v of parsed.votings) {
      citations.push({
        text: `За: ${v.yes || 0}, Проти: ${v.no || 0}, Утримались: ${v.abstain || 0}${v.result ? ` \u2014 ${v.result}` : ''}`,
        source: v.title || v.bill_title || 'Голосування',
      });
    }
  }
  if (parsed.voting_summary) {
    citations.push({
      text: typeof parsed.voting_summary === 'string'
        ? parsed.voting_summary.slice(0, 500)
        : JSON.stringify(parsed.voting_summary).slice(0, 500),
      source: 'Аналіз голосувань',
    });
  }

  return { decisions: [], citations, documents };
}

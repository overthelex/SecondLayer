import type { Decision } from '../../../types/models/Message';
import type { EvidenceResult, ToolResultData } from './types';
import { classifyDocumentType, courtDocUrl } from './parse';

/** Extract a summary from a court case object, trying all known field names */
function extractSummary(c: ToolResultData): string {
  if (c.title) return String(c.title);
  if (c.resolution) return String(c.resolution);
  if (c.summary) return String(c.summary);
  if (c.similarity_reason) return String(c.similarity_reason);
  if (Array.isArray(c.snippets) && c.snippets.length > 0) return c.snippets.join(' ');
  if (c.description) return String(c.description);
  if (typeof c.text === 'string' && c.text.length > 0) return c.text.slice(0, 500);
  if (typeof c.content === 'string' && c.content.length > 0) return c.content.slice(0, 500);
  if (c.snippet) return String(c.snippet);
  // Try to build from document type + case number
  const docType = c.doc_type || c.document_type || c.judgment_code || '';
  const caseNum = c.cause_num || c.case_number || '';
  if (docType && caseNum) return `${docType} у справі ${caseNum}`;
  if (docType) return String(docType);
  return '';
}

const COURT_TOOLS = [
  'search_legal_precedents',
  'search_supreme_court_practice', // backward-compat alias
  'get_case_documents_chain',
  'find_similar_fact_pattern_cases',
  'compare_practice_pro_contra',
  'get_court_decision',
  'count_cases_by_party',
  'check_precedent_status',
  'analyze_case_pattern',
  'analyze_legal_patterns', // backward-compat alias
  'get_similar_reasoning',
  'get_citation_graph',
  'get_case_text',
];

export function extractCourtEvidence(toolName: string, parsed: ToolResultData): EvidenceResult {
  const decisions: Decision[] = [];
  if (!COURT_TOOLS.some((t) => toolName.includes(t) || toolName === t)) {
    return { decisions, citations: [], documents: [] };
  }

  // source_case (single)
  if (parsed.source_case) {
    const sc = parsed.source_case;
    decisions.push({
      id: `sc-${sc.doc_id || Date.now()}`,
      number: sc.cause_num || sc.case_number || 'N/A',
      court: sc.court_code || sc.court || '',
      date: sc.adjudication_date || sc.date || '',
      summary: extractSummary(sc),
      relevance: 100,
      status: 'active',
      documentType: classifyDocumentType(sc),
      externalUrl: courtDocUrl(sc.doc_id),
      docId: sc.doc_id ? String(sc.doc_id) : undefined,
    });
  }

  // similar_cases / results array
  const cases = parsed.similar_cases || parsed.results || parsed.cases || parsed.precedents || [];
  for (const c of cases) {
    decisions.push({
      id: `d-${c.doc_id || c.id || Math.random().toString(36).slice(2, 8)}`,
      number: c.cause_num || c.case_number || c.number || 'N/A',
      court: c.court_code || c.court || '',
      date: c.adjudication_date || c.date || '',
      summary: extractSummary(c),
      relevance: c.similarity
        ? Math.round(c.similarity * 100)
        : c.relevance
          ? Math.round(c.relevance * 100)
          : 70,
      status: 'active',
      documentType: classifyDocumentType(c),
      externalUrl: courtDocUrl(c.doc_id),
      docId: c.doc_id ? String(c.doc_id) : undefined,
    });
  }

  // get_case_documents_chain format
  let chainDocs: ToolResultData[] = [];
  if (parsed.documents && Array.isArray(parsed.documents)) {
    chainDocs = parsed.documents;
  } else if (parsed.grouped_documents && typeof parsed.grouped_documents === 'object') {
    chainDocs = (Object.values(parsed.grouped_documents) as ToolResultData[][]).flat();
  }
  for (const doc of chainDocs) {
    decisions.push({
      id: `chain-${doc.doc_id || Math.random().toString(36).slice(2, 8)}`,
      number: doc.case_number || parsed.case_number || doc.title || 'N/A',
      court: doc.court || doc.instance || '',
      date: doc.date || '',
      summary: extractSummary(doc),
      relevance: 80,
      status: 'active',
      documentType: classifyDocumentType(doc),
      externalUrl: courtDocUrl(doc.doc_id),
      docId: doc.doc_id ? String(doc.doc_id) : undefined,
    });
  }

  // compare_practice_pro_contra format
  const proContraCases = [...(parsed.pro || []), ...(parsed.contra || [])];
  for (const c of proContraCases) {
    decisions.push({
      id: `pc-${c.doc_id || Math.random().toString(36).slice(2, 8)}`,
      number: c.case_number || 'N/A',
      court: c.court || c.chamber || '',
      date: c.date || '',
      summary: extractSummary(c),
      relevance: 70,
      status: 'active',
      documentType: classifyDocumentType(c),
      externalUrl: courtDocUrl(c.doc_id),
      docId: c.doc_id ? String(c.doc_id) : undefined,
    });
  }

  // get_court_decision — single decision with sections
  if (parsed.sections && Array.isArray(parsed.sections) && (parsed.doc_id || parsed.case_number)) {
    const summarySection = parsed.sections.find((s: ToolResultData) => s.type === 'DECISION' || s.type === 'COURT_REASONING');
    decisions.push({
      id: `gcd-${parsed.doc_id || Date.now()}`,
      number: parsed.case_number || String(parsed.doc_id) || 'N/A',
      court: '',
      date: '',
      summary: summarySection?.text?.slice(0, 500) || parsed.title || parsed.resolution || '',
      relevance: 100,
      status: 'active',
      externalUrl: courtDocUrl(parsed.doc_id),
      docId: parsed.doc_id ? String(parsed.doc_id) : undefined,
    });
  }

  return { decisions, citations: [], documents: [] };
}

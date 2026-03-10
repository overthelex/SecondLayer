import type { Citation, VaultDocument } from '../../../types/models/Message';
import type { EvidenceResult, ToolResultData } from './types';

const VAULT_TOOLS = [
  'list_documents',
  'semantic_search',
  'semantic_search_vault',
  'get_document',
  'store_document',
  'parse_document',
  'extract_document_sections',
  'summarize_document',
  'compare_documents',
  'extract_key_clauses',
];

export function extractVaultEvidence(toolName: string, parsed: ToolResultData): EvidenceResult {
  const citations: Citation[] = [];
  const documents: VaultDocument[] = [];
  if (!VAULT_TOOLS.some((t) => toolName.includes(t) || toolName === t)) {
    return { decisions: [], citations, documents };
  }

  // list_documents
  if (parsed.documents && Array.isArray(parsed.documents)) {
    for (const doc of parsed.documents) {
      documents.push({
        id: doc.id || `vd-${Math.random().toString(36).slice(2, 8)}`,
        title: doc.title || doc.name || 'Без назви',
        type: doc.type || 'other',
        uploadedAt: doc.created_at || doc.uploadedAt || doc.uploaded_at || '',
        metadata: doc.metadata || {},
      });
    }
  }

  // semantic_search
  if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].documentId) {
    for (const r of parsed) {
      documents.push({
        id: r.documentId || `vd-${Math.random().toString(36).slice(2, 8)}`,
        title: r.title || r.sectionTitle || 'Без назви',
        type: r.type || 'other',
        metadata: { relevance: r.relevance, snippet: r.text?.slice(0, 200) },
      });
    }
  }

  // get_document / store_document — single
  if (parsed.id && parsed.title && !parsed.documents) {
    documents.push({
      id: parsed.id,
      title: parsed.title,
      type: parsed.type || 'other',
      uploadedAt: parsed.created_at || parsed.uploadedAt || '',
      metadata: parsed.metadata || {},
    });
  }

  // parse_document / summarize_document / extract_key_clauses
  if (parsed.summary || parsed.text || parsed.clauses || parsed.sections) {
    const content = parsed.summary || parsed.text || '';
    if (content) {
      citations.push({
        text: content,
        source: parsed.title || parsed.document_id || toolName,
      });
    }
    if (parsed.clauses && Array.isArray(parsed.clauses)) {
      for (const clause of parsed.clauses) {
        citations.push({
          text: clause.text || clause.content || '',
          source: clause.title || clause.name || 'Ключове положення',
        });
      }
    }
    if (parsed.sections && Array.isArray(parsed.sections)) {
      for (const sec of parsed.sections) {
        citations.push({
          text: sec.content || sec.text || '',
          source: sec.name || sec.title || 'Секція',
        });
      }
    }
  }

  // compare_documents
  if (parsed.comparison || parsed.differences) {
    const compText = parsed.comparison || parsed.summary || '';
    if (compText) {
      citations.push({
        text: compText,
        source: 'Порівняння документів',
      });
    }
  }

  return { decisions: [], citations, documents };
}

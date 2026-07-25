/**
 * MCP result formatters — convert tool results to human-readable strings
 */

import { getLegalT } from '../../../i18n/legal-i18n';

interface SearchCase {
  case_number?: string;
  number?: string;
  court?: string;
  date?: string;
  summary?: string;
  category?: string;
}

interface SearchPrecedent {
  case_number: string;
  similarity: number;
  summary: string;
}

interface LegislationItem {
  title: string;
  type: string;
}

interface SearchResponse {
  cases?: SearchCase[];
  precedents?: SearchPrecedent[];
  legislation?: LegislationItem[];
  total?: number;
  [key: string]: unknown;
}

interface DocumentSection {
  name: string;
  content: string;
}

interface DocumentChunk {
  document_id: string;
  text: string;
}

interface DocumentResponse {
  text?: string;
  sections?: DocumentSection[];
  documents?: DocumentChunk[];
  [key: string]: unknown;
}

interface LegislationArticle {
  article_number?: string;
  text?: string;
  content?: string;
}

interface LegislationResponse {
  text?: string;
  content?: string;
  legislation_id?: string;
  article_number?: string;
  section_name?: string;
  context?: string;
  articles?: LegislationArticle[];
  [key: string]: unknown;
}

export function formatSearchResults(response: SearchResponse): string {
  const t = getLegalT();
  if (response.cases && Array.isArray(response.cases)) {
    return `${t.casesFound}: ${response.total || response.cases.length}\n\n${response.cases
      .map(
        (c: SearchCase, i: number) =>
          `${i + 1}. ${c.case_number || c.number || 'N/A'}\n   ${t.court}: ${c.court || 'N/A'}\n   ${t.date}: ${c.date || 'N/A'}\n   ${c.summary || c.category || ''}`
      )
      .join('\n\n')}`;
  }

  if (response.precedents && Array.isArray(response.precedents)) {
    return `${t.precedentsFound}: ${response.total || response.precedents.length}\n\n${response.precedents
      .map(
        (p: SearchPrecedent, i: number) =>
          `${i + 1}. ${p.case_number}\n   ${t.similarity}: ${Math.round(p.similarity * 100)}%\n   ${p.summary}`
      )
      .join('\n\n')}`;
  }

  if (response.legislation && Array.isArray(response.legislation)) {
    return `${t.lawsFound}: ${response.legislation.length}\n\n${response.legislation
      .map((l: LegislationItem, i: number) => `${i + 1}. ${l.title}\n   ${t.formatType}: ${l.type}`)
      .join('\n\n')}`;
  }

  return JSON.stringify(response, null, 2);
}

export function formatDocumentResults(response: DocumentResponse): string {
  const t = getLegalT();
  if (response.text) {
    return response.text;
  }

  if (response.sections && Array.isArray(response.sections)) {
    return response.sections
      .map((s: DocumentSection) => `## ${s.name}\n\n${s.content}`)
      .join('\n\n---\n\n');
  }

  if (response.documents && Array.isArray(response.documents)) {
    return response.documents
      .map((d: DocumentChunk) => `### ${t.document}: ${d.document_id}\n\n${d.text}`)
      .join('\n\n---\n\n');
  }

  return JSON.stringify(response, null, 2);
}

export function formatLegislationResults(response: LegislationResponse): string {
  const t = getLegalT();
  if (response.text) {
    return `# ${response.legislation_id} - ${t.articleLabel} ${response.article_number}\n\n${response.text}${response.context ? `\n\n---\n\n${response.context}` : ''}`;
  }

  if (response.content) {
    return `# ${response.legislation_id} - ${response.section_name}\n\n${response.content}`;
  }

  if (response.articles && Array.isArray(response.articles)) {
    return response.articles
      .map(
        (a: LegislationArticle) =>
          `## ${t.articleLabel} ${a.article_number}\n\n${a.text || a.content}`
      )
      .join('\n\n---\n\n');
  }

  return JSON.stringify(response, null, 2);
}

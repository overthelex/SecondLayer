import type { Citation } from '../../../types/models/Message';
import type { EvidenceResult, ToolResultData } from './types';

const LEGISLATION_TOOLS = [
  'search_legislation',
  'get_legislation_articles',
  'get_legislation_section',
  'find_relevant_law_articles', // backward-compat alias
];

export function extractLegislationEvidence(toolName: string, parsed: ToolResultData): EvidenceResult {
  const citations: Citation[] = [];
  if (!LEGISLATION_TOOLS.some((t) => toolName.includes(t) || toolName === t)) {
    return { decisions: [], citations, documents: [] };
  }

  // Single article result
  if (parsed.full_text || parsed.text || parsed.content) {
    const articleNum = parsed.article_number || parsed.section_name || '';
    const title = parsed.title || parsed.rada_id || parsed.legislation_id || '';
    citations.push({
      text: parsed.full_text || parsed.text || parsed.content || '',
      source: articleNum ? `${title}, ст. ${articleNum}` : title,
    });
  }

  // Array of legislation results (legislation can be object or array)
  if (parsed.legislation && Array.isArray(parsed.legislation)) {
    for (const l of parsed.legislation) {
      citations.push({
        text: l.full_text || l.text || l.snippet || l.title || '',
        source: l.article_number
          ? `${l.title || l.rada_id || 'Норма'}, ст. ${l.article_number}`
          : (l.title || l.type || 'Нормативний акт'),
      });
    }
  }

  // find_relevant_law_articles
  if (toolName === 'find_relevant_law_articles') {
    const refs = parsed.relevant_articles || parsed.articles || (Array.isArray(parsed) ? parsed : []);
    for (const r of refs) {
      if (typeof r === 'string') {
        citations.push({ text: r, source: r });
      } else if (r?.article || r?.reference || r?.norm) {
        citations.push({
          text: r.text || r.content || r.description || r.article || r.reference || r.norm || '',
          source: r.article || r.reference || r.norm || r.title || 'Норма',
        });
      }
    }
  } else if (parsed.articles && Array.isArray(parsed.articles)) {
    const legTitle = parsed.legislation?.title || '';
    for (const a of parsed.articles) {
      if (typeof a === 'object' && a !== null) {
        citations.push({
          text: a.full_text || a.text || a.content || '',
          source: a.article_number
            ? `${a.title || legTitle || a.rada_id || 'Норма'}, ст. ${a.article_number}`
            : `Стаття ${a.article_number || ''}`,
        });
      }
    }
  }

  return { decisions: [], citations, documents: [] };
}

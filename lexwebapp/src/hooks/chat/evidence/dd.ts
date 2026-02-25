import type { Citation } from '../../../types/models/Message';
import type { EvidenceResult } from './types';

const DD_TOOLS = [
  'generate_dd_report',
  'risk_scoring',
  'format_answer_pack',
];

export function extractDDEvidence(toolName: string, parsed: any): EvidenceResult {
  const citations: Citation[] = [];
  if (!DD_TOOLS.some((t) => toolName === t)) {
    return { decisions: [], citations, documents: [] };
  }

  // DD report
  if (parsed.report || parsed.summary || parsed.findings) {
    const reportText = parsed.report || parsed.summary || '';
    if (reportText) {
      citations.push({
        text: (typeof reportText === 'string' ? reportText : JSON.stringify(reportText)).slice(0, 500),
        source: 'Due Diligence звіт',
      });
    }
    if (parsed.findings && Array.isArray(parsed.findings)) {
      for (const f of parsed.findings) {
        citations.push({
          text: (f.description || f.text || f.finding || '').slice(0, 500),
          source: f.category || f.type || 'Висновок DD',
        });
      }
    }
  }

  // Risk scoring
  if (parsed.risk_score != null || parsed.score != null) {
    citations.push({
      text: `Рівень ризику: ${parsed.risk_score || parsed.score}${parsed.risk_level ? ` (${parsed.risk_level})` : ''}. ${parsed.explanation || parsed.summary || ''}`.trim(),
      source: 'Скоринг ризиків',
    });
  }
  if (parsed.risks && Array.isArray(parsed.risks)) {
    for (const r of parsed.risks) {
      citations.push({
        text: `${r.name || r.type || 'Ризик'}: ${r.score || r.level || ''}. ${r.description || ''}`.trim(),
        source: r.category || 'Ризик',
      });
    }
  }

  // Answer pack
  if (parsed.answers && Array.isArray(parsed.answers)) {
    for (const a of parsed.answers) {
      citations.push({
        text: (a.answer || a.text || a.content || '').slice(0, 500),
        source: a.question || a.topic || 'Відповідь',
      });
    }
  }

  return { decisions: [], citations, documents: [] };
}

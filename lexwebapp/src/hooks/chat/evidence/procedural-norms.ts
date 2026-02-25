import type { Citation } from '../../../types/models/Message';
import type { EvidenceResult } from './types';

const PROCEDURAL_NORM_TOOLS = [
  'search_procedural_norms',
  'calculate_procedural_deadlines',
  'build_procedural_checklist',
];

export function extractProceduralNormEvidence(toolName: string, rawResult: any): EvidenceResult {
  const citations: Citation[] = [];
  if (!PROCEDURAL_NORM_TOOLS.some((t) => toolName === t)) {
    return { decisions: [], citations, documents: [] };
  }

  const textContent = rawResult?.content?.find((b: any) => b.type === 'text')?.text;
  if (textContent) {
    const sourceLabel =
      toolName === 'search_procedural_norms' ? 'Процесуальна норма' :
      toolName === 'calculate_procedural_deadlines' ? 'Процесуальні строки' :
      'Процесуальний чеклист';
    citations.push({ text: textContent, source: sourceLabel });
  }

  return { decisions: [], citations, documents: [] };
}

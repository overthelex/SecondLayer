import type { Citation } from '../../../types/models/Message';
import type { EvidenceResult, ToolResultData } from './types';

const PROCEDURAL_NORM_TOOLS = [
  'search_procedural_norms',
  'calculate_procedural_deadlines',
  'build_procedural_checklist',
];

export function extractProceduralNormEvidence(toolName: string, rawResult: ToolResultData): EvidenceResult {
  const citations: Citation[] = [];
  if (!PROCEDURAL_NORM_TOOLS.some((t) => toolName === t)) {
    return { decisions: [], citations, documents: [] };
  }

  interface ContentBlock { type?: string; text?: string }
  const textContent = rawResult?.content?.find((b: ContentBlock) => b.type === 'text')?.text;
  if (textContent) {
    const sourceLabel =
      toolName === 'search_procedural_norms' ? 'Процесуальна норма' :
      toolName === 'calculate_procedural_deadlines' ? 'Процесуальні строки' :
      'Процесуальний чеклист';
    citations.push({ text: textContent, source: sourceLabel });
  }

  return { decisions: [], citations, documents: [] };
}

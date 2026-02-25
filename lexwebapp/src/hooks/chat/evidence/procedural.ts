import type { Citation } from '../../../types/models/Message';
import type { EvidenceResult } from './types';

const PROCEDURAL_TOOLS = [
  'calculate_procedural_deadlines',
  'build_procedural_checklist',
  'calculate_monetary_claims',
];

export function extractProceduralEvidence(toolName: string, parsed: any): EvidenceResult {
  const citations: Citation[] = [];
  if (!PROCEDURAL_TOOLS.some((t) => toolName === t)) {
    return { decisions: [], citations, documents: [] };
  }

  // Deadlines
  if (parsed.deadlines && Array.isArray(parsed.deadlines)) {
    for (const dl of parsed.deadlines) {
      citations.push({
        text: `${dl.description || dl.action || dl.name}: ${dl.deadline || dl.date || dl.days_left ? `${dl.days_left} днів` : ''}`,
        source: dl.legal_basis || dl.norm || 'Процесуальний строк',
      });
    }
  }

  // Checklist
  if (parsed.checklist && Array.isArray(parsed.checklist)) {
    for (const item of parsed.checklist) {
      citations.push({
        text: `${item.step || item.action || item.description || ''}${item.deadline ? ` (до ${item.deadline})` : ''}`,
        source: item.legal_basis || item.norm || 'Процесуальний чеклист',
      });
    }
  }
  if (parsed.items && Array.isArray(parsed.items)) {
    for (const item of parsed.items) {
      citations.push({
        text: item.description || item.text || item.name || '',
        source: item.legal_basis || 'Чеклист',
      });
    }
  }

  // Monetary claims
  if (parsed.total != null || parsed.amount != null || parsed.calculation) {
    citations.push({
      text: parsed.calculation
        || `Загальна сума: ${parsed.total || parsed.amount || 0} грн${parsed.breakdown ? `. ${parsed.breakdown}` : ''}`,
      source: parsed.legal_basis || 'Розрахунок грошових вимог',
    });
  }
  if (parsed.components && Array.isArray(parsed.components)) {
    for (const comp of parsed.components) {
      citations.push({
        text: `${comp.name || comp.type || 'Складова'}: ${comp.amount || 0} грн`,
        source: comp.legal_basis || 'Складова вимоги',
      });
    }
  }

  return { decisions: [], citations, documents: [] };
}

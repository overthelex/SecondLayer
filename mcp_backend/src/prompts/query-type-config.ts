// Proprietary implementation: @secondlayer/core (private repo)

export interface QueryTypeConfigEntry {
  defaultBudget: 'quick' | 'standard' | 'deep';
  requiresGrounding: boolean;
  description: string;
  maxToolCalls: number;
  thinkingPrefix: string;
  preferredScenarios: string[];
}

export const QUERY_TYPE_CONFIG: Record<string, QueryTypeConfigEntry> = {
  case_lookup: { defaultBudget: 'standard', requiresGrounding: true, description: '', maxToolCalls: 5, thinkingPrefix: 'Шукаю справу', preferredScenarios: ['case_search'] },
  practice_analysis: { defaultBudget: 'standard', requiresGrounding: true, description: '', maxToolCalls: 10, thinkingPrefix: 'Аналізую практику', preferredScenarios: ['practice_search'] },
  legislation_lookup: { defaultBudget: 'quick', requiresGrounding: true, description: '', maxToolCalls: 3, thinkingPrefix: 'Шукаю законодавство', preferredScenarios: ['legislation_search'] },
  legal_consultation: { defaultBudget: 'standard', requiresGrounding: true, description: '', maxToolCalls: 8, thinkingPrefix: 'Надаю консультацію', preferredScenarios: ['consultation'] },
  registry_lookup: { defaultBudget: 'quick', requiresGrounding: true, description: '', maxToolCalls: 3, thinkingPrefix: 'Шукаю в реєстрі', preferredScenarios: ['registry_search'] },
  parliament_query: { defaultBudget: 'standard', requiresGrounding: true, description: '', maxToolCalls: 5, thinkingPrefix: 'Шукаю парламентські дані', preferredScenarios: ['parliament_search'] },
  document_query: { defaultBudget: 'standard', requiresGrounding: true, description: '', maxToolCalls: 5, thinkingPrefix: 'Шукаю документи', preferredScenarios: ['document_search'] },
  calculation: { defaultBudget: 'quick', requiresGrounding: false, description: '', maxToolCalls: 2, thinkingPrefix: 'Виконую розрахунок', preferredScenarios: ['calculation'] },
  document_drafting: { defaultBudget: 'standard', requiresGrounding: false, description: '', maxToolCalls: 5, thinkingPrefix: 'Складаю документ', preferredScenarios: ['drafting'] },
  comparative_analysis: { defaultBudget: 'deep', requiresGrounding: true, description: '', maxToolCalls: 10, thinkingPrefix: 'Порівнюю', preferredScenarios: ['comparison'] },
  due_diligence: { defaultBudget: 'deep', requiresGrounding: true, description: '', maxToolCalls: 10, thinkingPrefix: 'Виконую due diligence', preferredScenarios: ['due_diligence'] },
  institutional_analysis: { defaultBudget: 'deep', requiresGrounding: true, description: '', maxToolCalls: 10, thinkingPrefix: 'Аналізую інституцію', preferredScenarios: ['practice_search'] },
  osint_investigation: { defaultBudget: 'standard', requiresGrounding: true, description: '', maxToolCalls: 5, thinkingPrefix: 'Перевіряю через OSINT-джерела', preferredScenarios: ['osint_entity_screening', 'osint_cyber_check', 'osint_darknet_intel'] },
  unsupported: { defaultBudget: 'quick', requiresGrounding: false, description: '', maxToolCalls: 0, thinkingPrefix: '', preferredScenarios: [] },
};

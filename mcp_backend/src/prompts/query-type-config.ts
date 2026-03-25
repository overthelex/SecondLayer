// Proprietary implementation: @secondlayer/core (private repo)

export interface QueryTypeConfigEntry {
  defaultBudget: 'quick' | 'standard' | 'deep';
  requiresGrounding: boolean;
  description: string;
  maxToolCalls: number;
}

export const QUERY_TYPE_CONFIG: Record<string, QueryTypeConfigEntry> = {
  case_lookup: { defaultBudget: 'standard', requiresGrounding: true, description: '', maxToolCalls: 5 },
  practice_analysis: { defaultBudget: 'deep', requiresGrounding: true, description: '', maxToolCalls: 10 },
  legislation_lookup: { defaultBudget: 'quick', requiresGrounding: true, description: '', maxToolCalls: 3 },
  legal_consultation: { defaultBudget: 'standard', requiresGrounding: true, description: '', maxToolCalls: 8 },
  registry_lookup: { defaultBudget: 'quick', requiresGrounding: true, description: '', maxToolCalls: 3 },
  parliament_query: { defaultBudget: 'standard', requiresGrounding: true, description: '', maxToolCalls: 5 },
  document_query: { defaultBudget: 'standard', requiresGrounding: true, description: '', maxToolCalls: 5 },
  calculation: { defaultBudget: 'quick', requiresGrounding: false, description: '', maxToolCalls: 2 },
  document_drafting: { defaultBudget: 'standard', requiresGrounding: false, description: '', maxToolCalls: 5 },
  comparative_analysis: { defaultBudget: 'deep', requiresGrounding: true, description: '', maxToolCalls: 10 },
  due_diligence: { defaultBudget: 'deep', requiresGrounding: true, description: '', maxToolCalls: 10 },
  institutional_analysis: { defaultBudget: 'standard', requiresGrounding: true, description: '', maxToolCalls: 5 },
  unsupported: { defaultBudget: 'quick', requiresGrounding: false, description: '', maxToolCalls: 0 },
};

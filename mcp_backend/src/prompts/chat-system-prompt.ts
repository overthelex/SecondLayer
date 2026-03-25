// Proprietary implementation: @secondlayer/core (private repo)

export type QueryType =
  | 'case_lookup'
  | 'practice_analysis'
  | 'legislation_lookup'
  | 'legal_consultation'
  | 'registry_lookup'
  | 'parliament_query'
  | 'document_query'
  | 'calculation'
  | 'document_drafting'
  | 'comparative_analysis'
  | 'due_diligence'
  | 'institutional_analysis'
  | 'unsupported';

export const VALID_QUERY_TYPES: QueryType[] = [
  'case_lookup',
  'practice_analysis',
  'legislation_lookup',
  'legal_consultation',
  'registry_lookup',
  'parliament_query',
  'document_query',
  'calculation',
  'document_drafting',
  'comparative_analysis',
  'due_diligence',
  'institutional_analysis',
  'unsupported',
];

export interface ChatIntentClassification {
  queryType: QueryType;
  domains: string[];
  slots: Record<string, unknown>;
  confidence: number;
  suggestedTools: string[];
  keywords?: string;
}

export const DOMAIN_TOOL_MAP: Record<string, string[]> = {};

export const DEFAULT_TOOLS: string[] = [];

export const CHAT_SYSTEM_PROMPT = '';

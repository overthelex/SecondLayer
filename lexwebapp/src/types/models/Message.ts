/**
 * Message Domain Model
 */

export interface CitationWarning {
  case_number: string;
  status: 'explicitly_overruled' | 'limited';
  confidence: number;
  message: string;
}

export interface CostSummary {
  tools_used: string[];
  total_cost_usd: number;
  charged_usd?: number;
  balance_usd?: number | null;
  response_id?: string;
  /** @deprecated use charged_usd */
  credits_deducted?: number;
  /** @deprecated use balance_usd */
  new_balance_credits?: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  thinkingSteps?: ThinkingStep[];
  executionPlan?: ExecutionPlan;
  decisions?: Decision[];
  citations?: Citation[];
  documents?: VaultDocument[];
  citationWarnings?: CitationWarning[];
  costSummary?: CostSummary;
  metadata?: Record<string, any>;
}

export interface ThinkingStep {
  id: string;
  title: string;
  content: string;
  isComplete: boolean;
}

export interface ExecutionPlan {
  goal: string;
  steps: PlanStep[];
  expected_iterations: number;
}

export interface PlanStep {
  id: number;
  tool: string;
  params: Record<string, any>;
  purpose: string;
  depends_on?: number[];
  completed?: boolean;
  depth?: 'standard' | 'deep';
}

export interface Decision {
  id: string;
  number: string;
  court: string;
  date: string;
  summary: string;
  relevance: number;
  status: 'active' | 'overturned' | 'modified';
  documentType?: string;
  externalUrl?: string;
  docId?: string;
}

export interface Citation {
  text: string;
  source: string;
}

export interface VaultDocument {
  id: string;
  title: string;
  type: string;
  uploadedAt?: string;
  metadata?: Record<string, any>;
}

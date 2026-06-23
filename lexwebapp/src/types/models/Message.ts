/**
 * Message Domain Model
 */

/**
 * Per-message warning about one of two distinct problems:
 * - `overruled`: shepardization found the cited case was overruled/modified
 *   by a higher court (legacy path, emitted by ShepardizationService).
 * - `fabricated`: LEXAI-637 — the model cited a case number that never
 *   appeared in any tool result of the current turn. Pulled from prior
 *   messages' context or from training memory.
 */
export type CitationWarning =
  | {
      kind: 'overruled';
      case_number: string;
      status: 'explicitly_overruled' | 'limited';
      confidence: number;
      message: string;
    }
  | {
      kind: 'fabricated';
      fabricated: string[];
      message: string;
    }
  | {
      kind: 'unverified_articles';
      unverified: string[];
      message: string;
    };

/**
 * Breakdown of search-leg usage for a single chat turn.
 * - `fts`: PostgreSQL full-text queries (fulltext + hybrid modes)
 * - `qdrant`: vector/semantic queries (semantic + hybrid modes)
 * - `structured`: metadata-only (structured mode), neither FTS nor Qdrant
 */
export interface SearchStats {
  fts: number;
  qdrant: number;
  structured?: number;
}

export interface CostSummary {
  tools_used: string[];
  total_cost_usd: number;
  charged_usd?: number;
  balance_usd?: number | null;
  response_id?: string;
  search_stats?: SearchStats;
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
  overheadCost?: number; // Fixed LLM cost for classification + plan gen + final synthesis (USD)
}

export interface PlanStep {
  id: number;
  tool: string;
  params: Record<string, any>;
  purpose: string;
  depends_on?: number[];
  completed?: boolean;
  depth?: 'standard' | 'deep';
  recommendedDepth?: 'standard' | 'deep';
  estimatedCost?: number;      // Total cost for this step (per-call cost × estimatedCalls), USD
  estimatedCalls?: number;     // How many times this tool is typically invoked
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
  /** Full NPA (нормативно-правовий акт) title, e.g. "Цивільний кодекс України" */
  npaTitle?: string;
  /** Article/section number, e.g. "625", "44" */
  articleNumber?: string;
  /** Direct URL to the article on zakon.rada.gov.ua */
  url?: string;
  /** rada_id for the legislation, e.g. "435-15" */
  radaId?: string;
  /** Hierarchy: section (Розділ) number */
  sectionNumber?: string;
  /** Hierarchy: section (Розділ) title */
  sectionTitle?: string;
  /** Hierarchy: chapter (Глава) number */
  chapterNumber?: string;
  /** Hierarchy: chapter (Глава) title */
  chapterTitle?: string;
}

export interface VaultDocument {
  id: string;
  title: string;
  type: string;
  uploadedAt?: string;
  metadata?: Record<string, any>;
}

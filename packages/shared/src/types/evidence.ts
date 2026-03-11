/**
 * Shared evidence types — single source of truth for backend and frontend.
 * Backend extracts evidence from tool results and sends it via SSE.
 * Frontend uses these types for rendering in the evidence panel.
 */

export interface Decision {
  id: string;
  number: string;
  court: string;
  date: string;
  summary: string;
  relevance: number;
  status: string;
  documentType?: string;
  externalUrl?: string;
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

export interface ExtractedEvidence {
  decisions: Decision[];
  citations: Citation[];
  documents: VaultDocument[];
}

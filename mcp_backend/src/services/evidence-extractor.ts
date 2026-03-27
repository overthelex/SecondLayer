// Proprietary implementation: @secondlayer/core (private repo)

export interface Decision {
  id: string;
  number: string;
  court: string;
  date: string;
  summary: string;
}

export interface Citation {
  law: string;
  article: string;
  text?: string;
}

export interface VaultDocument {
  id: string;
  name: string;
  type: string;
}

export interface ExtractedEvidence {
  decisions: Decision[];
  citations: Citation[];
  vault_documents: VaultDocument[];
}

export function extractFromToolResult(toolName: string, rawResult: unknown): ExtractedEvidence {
  return { decisions: [], citations: [], vault_documents: [] };
}

export function extractNormsFromAnswer(answerText: string): Citation[] {
  return [];
}

export function extractAllEvidence(
  thinkingSteps: Array<{ tool: string; params: unknown; result: unknown }>,
  answerText?: string
): ExtractedEvidence {
  return { decisions: [], citations: [], vault_documents: [] };
}

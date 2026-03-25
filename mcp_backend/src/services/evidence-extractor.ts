// Proprietary implementation: @secondlayer/core (private repo)

export interface ExtractedEvidence {
  decisions: Array<{
    id: string;
    number: string;
    court: string;
    date: string;
    summary: string;
  }>;
  citations: Array<{
    law: string;
    article: string;
    text?: string;
  }>;
  vault_documents: Array<{
    id: string;
    name: string;
    type: string;
  }>;
}

export class EvidenceExtractor {
  constructor(...args: any[]) {}

  extractFromToolResult(toolName: string, rawResult: unknown): ExtractedEvidence {
    return { decisions: [], citations: [], vault_documents: [] };
  }

  extractNormsFromAnswer(answerText: string): Array<{ law: string; article: string; text?: string }> {
    return [];
  }

  extractAllEvidence(
    thinkingSteps: Array<{ tool: string; params: unknown; result: unknown }>,
    answerText?: string
  ): ExtractedEvidence {
    return { decisions: [], citations: [], vault_documents: [] };
  }
}

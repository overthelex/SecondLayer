/**
 * ResultCompactor — summarizes and compacts tool results for the LLM context window.
 *
 * Extracted from ChatService to isolate result compaction logic
 * (summarization, court-specific compaction, RAG-based compaction).
 */

import { logger } from '../utils/logger.js';
import type { IEmbeddingPort } from '../domain/ports/index.js';
import type { BudgetLimits } from './chat-constants.js';

export class ResultCompactor {
  constructor(private embeddingService?: IEmbeddingPort) {}

  /**
   * Summarize large tool results to prevent context window overflow.
   * Budget-aware: deep analysis preserves much more content.
   */
  summarize(result: any, limits: BudgetLimits): any {
    if (!result) return { empty: true };

    const maxLen = limits.maxResultChars;

    // For MCP tool results with content array — try compact extraction first
    if (result.content && Array.isArray(result.content)) {
      const compacted = this.compactCourtResult(result, limits);
      if (compacted) return compacted;

      // Fallback: truncate text blocks
      const cloned = { ...result, content: result.content.map((b: any) => ({ ...b })) };
      for (const block of cloned.content) {
        if (block.type === 'text' && typeof block.text === 'string') {
          if (block.text.length > maxLen) {
            block.text = block.text.slice(0, maxLen) + '\n\n[... результат скорочено]';
          }
        }
      }
      return cloned;
    }

    const text = typeof result === 'string' ? result : JSON.stringify(result);

    if (text.length <= maxLen) {
      return result;
    }

    // Generic truncation
    return {
      summary: text.slice(0, maxLen),
      truncated: true,
      original_length: text.length,
    };
  }

  /**
   * Compact court document chain/search results for LLM context.
   * Never sends full_text to LLM — extracts key sections (FACTS, REASONING, DECISION) instead.
   * Budget-aware section limits: quick=500, standard=1500, deep=3000 chars per section.
   */
  private compactCourtResult(result: any, limits: BudgetLimits): any | null {
    if (!result.content?.[0]?.text) return null;

    let parsed: any;
    try {
      parsed = JSON.parse(result.content[0].text);
    } catch {
      return null;
    }

    const resSlice = limits.resolutionSlice;
    const sectionLimit = limits.maxTokens > 4096 ? 3000 : (limits.maxResultChars <= 6000 ? 500 : 1500);

    // Case documents chain: { case_number, total_documents, grouped_documents }
    if (parsed.grouped_documents && parsed.total_documents) {
      const compact: any = {
        case_number: parsed.case_number,
        total_documents: parsed.total_documents,
        grouped_documents: {},
      };

      for (const [instance, docs] of Object.entries(parsed.grouped_documents)) {
        compact.grouped_documents[instance] = (docs as any[]).map((d: any) => {
          const entry: any = {
            doc_id: d.doc_id,
            url: d.doc_id ? `https://reyestr.court.gov.ua/Review/${d.doc_id}` : undefined,
            case_number: d.cause_num || d.case_number,
            document_type: d.document_type,
            instance: d.instance,
            court: d.court,
            judge: d.judge,
            date: d.date,
            resolution: d.resolution ? d.resolution.slice(0, resSlice) : undefined,
          };
          if (d.snippets) entry.snippets = d.snippets;
          return entry;
        });
      }

      const compactText = JSON.stringify(compact);
      if (compactText.length > limits.maxResultChars) {
        return { content: [{ type: 'text', text: compactText.slice(0, limits.maxResultChars) + '\n[... скорочено]' }] };
      }
      return { content: [{ type: 'text', text: compactText }] };
    }

    // Search results: { results: [...], total_count }
    if (Array.isArray(parsed.results)) {
      const compact = {
        total_count: parsed.total_count || parsed.results.length,
        results: parsed.results.map((r: any) => {
          const entry: any = {
            doc_id: r.doc_id,
            url: r.doc_id ? `https://reyestr.court.gov.ua/Review/${r.doc_id}` : undefined,
            case_number: r.cause_num || r.case_number,
            document_type: r.document_type,
            court: r.court_code || r.court,
            judge: r.judge,
            date: r.date || r.adjudication_date,
            instance: r.instance,
            resolution: r.resolution ? r.resolution.slice(0, resSlice) : undefined,
          };
          entry.key_sections = this.extractKeySections(r.sections, r.full_text, sectionLimit);
          if (r.snippets) entry.snippets = r.snippets;
          return entry;
        }),
      };

      const compactText = JSON.stringify(compact);
      if (compactText.length > limits.maxResultChars) {
        return { content: [{ type: 'text', text: compactText.slice(0, limits.maxResultChars) + '\n[... скорочено]' }] };
      }
      return { content: [{ type: 'text', text: compactText }] };
    }

    return null;
  }

  /**
   * Extract key sections (FACTS, COURT_REASONING, DECISION) from court document.
   * Uses structured sections if available, otherwise falls back to regex extraction from full_text.
   */
  private extractKeySections(
    sections: any,
    fullText: string | undefined,
    charLimit: number
  ): { facts?: string; reasoning?: string; decision?: string } | undefined {
    const result: { facts?: string; reasoning?: string; decision?: string } = {};

    // Try structured sections first
    if (sections && Array.isArray(sections)) {
      for (const s of sections) {
        const type = (s.type || s.section_type || '').toUpperCase();
        const text = s.text || s.content || '';
        if (!text) continue;

        if (type.includes('FACT') || type.includes('ВСТАНОВИВ')) {
          result.facts = text.slice(0, charLimit);
        } else if (type.includes('REASON') || type.includes('МОТИВ')) {
          result.reasoning = text.slice(0, charLimit);
        } else if (type.includes('DECISION') || type.includes('РЕЗОЛЮТ')) {
          result.decision = text.slice(0, charLimit);
        }
      }
    }

    // If we didn't find sections from structured data, try regex from full_text
    if (!result.facts && !result.reasoning && !result.decision && fullText) {
      // Ukrainian court decisions commonly have: ВСТАНОВИВ, МОТИВУВАЛЬНА ЧАСТИНА, ВИРІШИВ/УХВАЛИВ/ПОСТАНОВИВ
      const factsMatch = fullText.match(/ВСТАНОВИВ[:\s]*([\s\S]{10,}?)(?=(?:МОТИВУВАЛЬНА|ВИРІШИВ|УХВАЛИВ|ПОСТАНОВИВ)|$)/i);
      const reasoningMatch = fullText.match(/МОТИВУВАЛЬНА[^:]*:[:\s]*([\s\S]{10,}?)(?=(?:ВИРІШИВ|УХВАЛИВ|ПОСТАНОВИВ|РЕЗОЛЮТИВНА)|$)/i);
      const decisionMatch = fullText.match(/(?:ВИРІШИВ|УХВАЛИВ|ПОСТАНОВИВ)[:\s]*([\s\S]{10,}?)$/i);

      if (factsMatch) result.facts = factsMatch[1].trim().slice(0, charLimit);
      if (reasoningMatch) result.reasoning = reasoningMatch[1].trim().slice(0, charLimit);
      if (decisionMatch) result.decision = decisionMatch[1].trim().slice(0, charLimit);
    }

    // Return undefined if no sections extracted to avoid empty object in JSON
    return (result.facts || result.reasoning || result.decision) ? result : undefined;
  }

  /**
   * RAG-based compaction of tool results when context gets too large.
   * Embeds the user query, computes cosine similarity with each tool result,
   * and keeps the top-K most relevant results fully while summarizing the rest.
   * Only triggers when there are 3+ results and total chars exceed threshold.
   */
  async ragCompact(
    query: string,
    toolResults: Array<{ tool: string; content: string }>,
    maxChars: number
  ): Promise<Array<{ tool: string; content: string }>> {
    if (!this.embeddingService || toolResults.length < 3) return toolResults;

    const totalChars = toolResults.reduce((sum, r) => sum + r.content.length, 0);
    if (totalChars <= maxChars * 1.5) return toolResults;

    try {
      // Embed the query
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);

      // Embed each tool result (use first 500 chars as representative)
      const scored = await Promise.all(
        toolResults.map(async (r) => {
          const snippet = r.content.slice(0, 500);
          const embedding = await this.embeddingService!.generateEmbedding(snippet);
          const similarity = this.cosineSimilarity(queryEmbedding, embedding);
          return { ...r, similarity };
        })
      );

      // Sort by relevance (highest first)
      scored.sort((a, b) => b.similarity - a.similarity);

      // Keep top results fully until we approach the budget; summarize the rest
      const compacted: Array<{ tool: string; content: string }> = [];
      let usedChars = 0;

      for (const item of scored) {
        if (usedChars + item.content.length <= maxChars) {
          compacted.push({ tool: item.tool, content: item.content });
          usedChars += item.content.length;
        } else {
          // Summarize to just metadata line
          const summary = `[${item.tool}]: результат скорочено (релевантність: ${item.similarity.toFixed(2)}, ${item.content.length} символів)`;
          compacted.push({ tool: item.tool, content: summary });
          usedChars += summary.length;
        }
      }

      logger.info('[ResultCompactor] RAG compacted tool results', {
        originalResults: toolResults.length,
        originalChars: totalChars,
        compactedChars: usedChars,
        fullResults: compacted.filter(r => !r.content.startsWith('[')).length,
      });

      return compacted;
    } catch (err: any) {
      logger.warn('[ResultCompactor] RAG compaction failed, returning original results', { error: err.message });
      return toolResults;
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }
}

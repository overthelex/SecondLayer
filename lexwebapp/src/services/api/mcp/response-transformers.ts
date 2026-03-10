/**
 * MCP response transformers — parse and transform backend responses into app models
 */

import type {
  Message,
  ThinkingStep,
  Decision,
  Citation,
} from '../../../types/models';
import type { ReasoningStep, PrecedentChunk, SourceAttribution } from '../../../types/api/responses';
import {
  formatSearchResults,
  formatDocumentResults,
  formatLegislationResults,
} from './formatters';

/** Loosely-typed backend response — the envelope is dynamic JSON. */
interface BackendToolResponse {
  result?: {
    content?: Array<{ type?: string; text?: string }>;
    answer?: string;
    [key: string]: unknown;
  };
  summary?: string;
  answer?: string;
  reasoning_chain?: ReasoningStep[];
  precedent_chunks?: PrecedentChunk[];
  source_attribution?: SourceAttribution[];
  [key: string]: unknown;
}

/**
 * Parse backend response structure (content[0].text JSON envelope)
 */
export function parseBackendResponse(data: BackendToolResponse): BackendToolResponse {
  try {
    if (data.result?.content?.[0]?.text) {
      return JSON.parse(data.result.content[0].text);
    }
    if (data.result) {
      return data.result as BackendToolResponse;
    }
    return data;
  } catch (e) {
    console.warn('Failed to parse result content:', e);
    return data;
  }
}

/**
 * Transform a tool result into a Message model
 */
export function transformToolResultToMessage(toolName: string, result: unknown): Message {
  const parsedResult = parseBackendResponse(result as BackendToolResponse);
  return transformToMessage(parsedResult, toolName);
}

function transformToMessage(response: BackendToolResponse, toolName: string): Message {
  let content = '';
  let thinkingSteps: ThinkingStep[] | undefined;
  let decisions: Decision[] | undefined;
  let citations: Citation[] | undefined;

  if (
    toolName === 'get_legal_advice' ||
    toolName === 'packaged_lawyer_answer'
  ) {
    content =
      (response.summary as string) ||
      (response.answer as string) ||
      (response.result?.answer as string) ||
      'Відповідь отримано від backend.';

    thinkingSteps = transformThinkingSteps(response.reasoning_chain);
    decisions = transformDecisions(response.precedent_chunks);
    citations = transformCitations(response.source_attribution);
  } else if (
    toolName.includes('search') ||
    toolName.includes('find') ||
    toolName.includes('classify')
  ) {
    content = formatSearchResults(response);
  } else if (toolName.includes('document') || toolName.includes('parse')) {
    content = formatDocumentResults(response);
  } else if (toolName.includes('legislation')) {
    content = formatLegislationResults(response);
  } else {
    content = JSON.stringify(response, null, 2);
  }

  return {
    id: (Date.now() + 1).toString(),
    role: 'assistant',
    content,
    isStreaming: false,
    thinkingSteps,
    decisions,
    citations,
  };
}

function transformThinkingSteps(reasoningChain?: ReasoningStep[]): ThinkingStep[] | undefined {
  if (!reasoningChain || reasoningChain.length === 0) return undefined;

  return reasoningChain.map((step, index) => ({
    id: `s${index + 1}`,
    title: `Крок ${step.step || index + 1}: ${step.action || 'Обробка'}`,
    content: step.output
      ? JSON.stringify(step.output, null, 2)
      : step.explanation || '',
    isComplete: true,
  }));
}

function transformDecisions(precedentChunks?: PrecedentChunk[]): Decision[] | undefined {
  if (!precedentChunks || precedentChunks.length === 0) return undefined;

  return precedentChunks.map((prec, index) => ({
    id: `d${index + 1}`,
    number: prec.case_number || prec.number || `Справа ${index + 1}`,
    court: prec.court || 'Невідомий суд',
    date: prec.date || '',
    summary: prec.summary || prec.reasoning || prec.content || '',
    relevance: Math.round((prec.similarity || prec.relevance || 0.5) * 100),
    status: 'active' as const,
  }));
}

function transformCitations(sourceAttribution?: SourceAttribution[]): Citation[] | undefined {
  if (!sourceAttribution || sourceAttribution.length === 0) return undefined;

  return sourceAttribution.map((src, index) => ({
    text: src.text || src.content || '',
    source: src.citation || src.source || `Джерело ${index + 1}`,
  }));
}

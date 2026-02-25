/**
 * Evidence extraction from MCP tool results.
 * Dispatches to domain-specific extractors and merges results.
 */

export type { EvidenceResult } from './types';
export { classifyDocumentType } from './parse';

import type { EvidenceResult } from './types';
import { parseToolResultContent } from './parse';
import { extractCourtEvidence } from './court';
import { extractLegislationEvidence } from './legislation';
import { extractProceduralNormEvidence } from './procedural-norms';
import { extractVaultEvidence } from './vault';
import { extractRetrieveLegalSourcesEvidence } from './legal-sources';
import { extractRadaEvidence } from './rada';
import { extractRegistryEvidence } from './registry';
import { extractProceduralEvidence } from './procedural';
import { extractDDEvidence } from './dd';

function mergeEvidence(target: EvidenceResult, source: EvidenceResult): void {
  target.decisions.push(...source.decisions);
  target.citations.push(...source.citations);
  target.documents.push(...source.documents);
}

/**
 * Extract Decision[], Citation[], VaultDocument[] from a tool_result SSE event.
 * Handles all court-case, legislation, RADA, registry, vault and procedural tools.
 */
export function extractEvidenceFromToolResult(
  toolName: string,
  rawResult: any
): EvidenceResult {
  const result: EvidenceResult = { decisions: [], citations: [], documents: [] };

  const parsed = parseToolResultContent(rawResult);
  if (!parsed) return result;

  mergeEvidence(result, extractCourtEvidence(toolName, parsed));
  mergeEvidence(result, extractLegislationEvidence(toolName, parsed));
  mergeEvidence(result, extractProceduralNormEvidence(toolName, rawResult));
  mergeEvidence(result, extractVaultEvidence(toolName, parsed));
  mergeEvidence(result, extractRetrieveLegalSourcesEvidence(toolName, parsed));
  mergeEvidence(result, extractRadaEvidence(toolName, parsed));
  mergeEvidence(result, extractRegistryEvidence(toolName, parsed));
  mergeEvidence(result, extractProceduralEvidence(toolName, parsed));
  mergeEvidence(result, extractDDEvidence(toolName, parsed));

  return result;
}

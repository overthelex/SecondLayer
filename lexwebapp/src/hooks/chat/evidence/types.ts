import type { Decision, Citation, VaultDocument } from '../../../types/models/Message';

export interface EvidenceResult {
  decisions: Decision[];
  citations: Citation[];
  documents: VaultDocument[];
}

/**
 * Loosely-typed parsed tool result from MCP backend.
 * Backend tool responses are dynamic JSON — each tool returns a different shape.
 * Using Record<string, any> here is intentional: these are external API boundaries
 * where the structure is not statically known.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolResultData = Record<string, any>;

export const EMPTY: EvidenceResult = { decisions: [], citations: [], documents: [] };

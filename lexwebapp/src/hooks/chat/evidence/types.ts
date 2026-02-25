import type { Decision, Citation, VaultDocument } from '../../../types/models/Message';

export interface EvidenceResult {
  decisions: Decision[];
  citations: Citation[];
  documents: VaultDocument[];
}

export const EMPTY: EvidenceResult = { decisions: [], citations: [], documents: [] };

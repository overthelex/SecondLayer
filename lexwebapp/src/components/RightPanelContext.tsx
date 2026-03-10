import { createContext, useContext } from 'react';
import type { Decision } from './DecisionCard';

interface VaultDocument {
  id: string;
  title: string;
  type: string;
  uploadedAt?: string;
  metadata?: Record<string, any>;
}

interface Citation {
  text: string;
  source: string;
}

export interface RightPanelContextValue {
  /** Court decisions for the decisions tab */
  decisions: Decision[];
  /** Legislation/norm citations for the regulations tab */
  citations: Citation[];
  /** Other court doc types (Ухвала, Окрема думка, etc.) */
  otherCourtDocs: Decision[];
  /** Vault-stored documents */
  vaultDocuments: VaultDocument[];
  /** Open decision viewer modal */
  openDecisionModal: (decision: Decision) => void;
  /** Open citation viewer modal */
  openCitationModal: (citation: Citation) => void;
  /** Open document viewer modal */
  openDocumentModal: (doc: VaultDocument) => void;
  /** Active consultation ID (null if not on consultation page) */
  consultationId: string | null;
  /** Callback to update unread chat message count */
  onUnreadCountChange: (count: number) => void;
}

const RightPanelContext = createContext<RightPanelContextValue | null>(null);

export const RightPanelProvider = RightPanelContext.Provider;

export function useRightPanelContext(): RightPanelContextValue {
  const ctx = useContext(RightPanelContext);
  if (!ctx) {
    throw new Error('useRightPanelContext must be used within a RightPanelProvider');
  }
  return ctx;
}

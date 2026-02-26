/**
 * Decisions Search Store
 *
 * Manages download state for court decisions from reyestr.court.gov.ua.
 * Tracks per-document download status and caches downloaded full texts.
 */

import { create } from 'zustand';
import { api } from '../utils/api-client';

export type DownloadStatus = 'idle' | 'downloading' | 'done' | 'error';

export interface DownloadedDecision {
  id: string;
  docId: string;
  title: string;
  caseNumber: string | null;
  court: string | null;
  date: string | null;
  disputeCategory: string | null;
  fullText: string;
  sections: Array<{ type: string; text: string }>;
}

interface DecisionsSearchState {
  downloadStatus: Record<string, DownloadStatus>;
  downloadedDecisions: Record<string, DownloadedDecision>;
  availableInDB: Set<string>;

  checkAvailability: (docIds: string[]) => Promise<void>;
  fetchFullText: (docId: string) => Promise<DownloadedDecision | null>;
  fetchBatch: (docIds: string[]) => Promise<void>;
  clearAll: () => void;
}

export const useDecisionsSearchStore = create<DecisionsSearchState>((set, get) => ({
  downloadStatus: {},
  downloadedDecisions: {},
  availableInDB: new Set(),

  checkAvailability: async (docIds: string[]) => {
    if (docIds.length === 0) return;
    try {
      const response = await api.decisions.checkAvailable(docIds);
      const available: Record<string, boolean> = response.data.available;
      set((state) => {
        const newAvailable = new Set(state.availableInDB);
        for (const [id, inDB] of Object.entries(available)) {
          if (inDB) newAvailable.add(id);
        }
        return { availableInDB: newAvailable };
      });
    } catch (err) {
      console.error('Failed to check availability:', err);
    }
  },

  fetchFullText: async (docId: string) => {
    const state = get();
    // Already downloaded in this session
    if (state.downloadedDecisions[docId]) {
      return state.downloadedDecisions[docId];
    }

    set((s) => ({
      downloadStatus: { ...s.downloadStatus, [docId]: 'downloading' as DownloadStatus },
    }));

    try {
      const response = await api.decisions.fetchFullText(docId);
      const doc: DownloadedDecision = response.data.document;

      set((s) => ({
        downloadStatus: { ...s.downloadStatus, [docId]: 'done' as DownloadStatus },
        downloadedDecisions: { ...s.downloadedDecisions, [docId]: doc },
        availableInDB: new Set([...s.availableInDB, docId]),
      }));

      return doc;
    } catch (err) {
      console.error(`Failed to fetch fulltext for ${docId}:`, err);
      set((s) => ({
        downloadStatus: { ...s.downloadStatus, [docId]: 'error' as DownloadStatus },
      }));
      return null;
    }
  },

  fetchBatch: async (docIds: string[]) => {
    const state = get();
    const toFetch = docIds.filter(id => !state.downloadedDecisions[id]);
    if (toFetch.length === 0) return;

    // Mark all as downloading
    set((s) => {
      const newStatus = { ...s.downloadStatus };
      for (const id of toFetch) newStatus[id] = 'downloading';
      return { downloadStatus: newStatus };
    });

    try {
      const response = await api.decisions.fetchFullTextBatch(toFetch);
      const results: Record<string, { status: string; document?: DownloadedDecision; error?: string }> = response.data.results;

      set((s) => {
        const newStatus = { ...s.downloadStatus };
        const newDocs = { ...s.downloadedDecisions };
        const newAvailable = new Set(s.availableInDB);

        for (const [id, result] of Object.entries(results)) {
          if (result.status === 'ok' && result.document) {
            newStatus[id] = 'done';
            newDocs[id] = result.document;
            newAvailable.add(id);
          } else {
            newStatus[id] = 'error';
          }
        }

        return {
          downloadStatus: newStatus,
          downloadedDecisions: newDocs,
          availableInDB: newAvailable,
        };
      });
    } catch (err) {
      console.error('Batch fetch failed:', err);
      set((s) => {
        const newStatus = { ...s.downloadStatus };
        for (const id of toFetch) newStatus[id] = 'error';
        return { downloadStatus: newStatus };
      });
    }
  },

  clearAll: () => {
    set({
      downloadStatus: {},
      downloadedDecisions: {},
      availableInDB: new Set(),
    });
  },
}));

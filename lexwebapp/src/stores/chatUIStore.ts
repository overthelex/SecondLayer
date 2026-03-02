/**
 * Chat UI Store
 * Ephemeral UI state for the chat interface (not persisted)
 * Separated from chatStore to keep domain state clean
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { ExecutionPlan } from '../types/models';

/** Pending plan awaiting user depth choices before execution */
export interface PendingPlanReview {
  plan: ExecutionPlan;
  planSessionId: string;
  query: string;
  assistantMessageId: string;
}

interface ChatUIState {
  isStreaming: boolean;
  streamController: AbortController | null;
  currentTool: string | null;
  pendingPlanReview: PendingPlanReview | null;
  isPlanLoading: boolean;

  setStreaming: (isStreaming: boolean) => void;
  setStreamController: (controller: AbortController | null) => void;
  setCurrentTool: (toolName: string | null) => void;
  setPendingPlanReview: (review: PendingPlanReview | null) => void;
  setIsPlanLoading: (loading: boolean) => void;
  cancelStream: () => void;
}

export const useChatUIStore = create<ChatUIState>()(
  devtools(
    (set, get) => ({
      isStreaming: false,
      streamController: null,
      currentTool: null,
      pendingPlanReview: null,
      isPlanLoading: false,

      setStreaming: (isStreaming) => set({ isStreaming }),
      setStreamController: (controller) => set({ streamController: controller }),
      setCurrentTool: (toolName) => set({ currentTool: toolName }),
      setPendingPlanReview: (review) => set({ pendingPlanReview: review }),
      setIsPlanLoading: (loading) => set({ isPlanLoading: loading }),

      cancelStream: () => {
        const { streamController } = get();
        if (streamController) {
          streamController.abort();
          set({
            streamController: null,
            isStreaming: false,
            currentTool: null,
          });
        }
      },
    }),
    { name: 'ChatUIStore' }
  )
);

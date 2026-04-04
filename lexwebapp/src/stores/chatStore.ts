/**
 * Chat Store
 * Zustand store for chat state management with server-side sync
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { Message, ThinkingStep, ExecutionPlan } from '../types/models';
import { api } from '../utils/api-client';
import type { ConversationThinkingStep } from '../services/api/ConversationService';
import { useEncryptionStore } from './encryptionStore';
import { encryptChatMessage, decryptChatMessage, decodeBase64 } from '../services/crypto';

interface ConversationSummary {
  id: string;
  title: string;
  updated_at: string;
}

/** Pending plan awaiting user depth choices before execution */
export interface PendingPlanReview {
  plan: ExecutionPlan;
  planSessionId: string;
  query: string;
  assistantMessageId: string;
}

/** Pending budget escalation awaiting user confirmation */
export interface PendingBudgetEscalation {
  reason: string;
  estimatedCostMin: number;
  estimatedCostMax: number;
  query: string;
}

interface ChatState {
  // State
  messages: Message[];
  isStreaming: boolean;
  streamController: AbortController | null;
  currentTool: string | null;

  // Plan review state
  pendingPlanReview: PendingPlanReview | null;
  isPlanLoading: boolean;

  // Budget escalation state
  pendingBudgetEscalation: PendingBudgetEscalation | null;

  // Query queue — holds next query to execute after current stream ends
  queuedQuery: { content: string; documentIds?: string[] } | null;

  // Conversation state
  conversationId: string | null;
  conversations: ConversationSummary[];
  conversationsLoading: boolean;

  // Per-conversation message cache (memory-only, not persisted)
  // Prevents messages from disappearing when switching conversations mid-stream
  conversationCache: Record<string, Message[]>;

  // Actions
  addMessage: (message: Message) => void;
  removeMessage: (messageId: string) => void;
  clearMessages: () => void;
  setStreaming: (isStreaming: boolean) => void;

  // Streaming actions
  updateMessage: (messageId: string, updates: Partial<Message>) => void;
  addThinkingStep: (messageId: string, step: ThinkingStep) => void;
  setStreamController: (controller: AbortController | null) => void;
  setCurrentTool: (toolName: string | null) => void;
  cancelStream: () => void;

  // Plan review actions
  setPendingPlanReview: (review: PendingPlanReview | null) => void;
  setIsPlanLoading: (loading: boolean) => void;

  // Budget escalation actions
  setPendingBudgetEscalation: (escalation: PendingBudgetEscalation | null) => void;

  // Queue actions
  setQueuedQuery: (query: { content: string; documentIds?: string[] } | null) => void;

  // Draft input — allows external components to prefill the chat input
  draftInput: string | null;
  setDraftInput: (text: string | null) => void;

  // Conversation actions
  loadConversations: () => Promise<void>;
  createConversation: (title?: string) => Promise<string>;
  switchConversation: (conversationId: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  renameConversation: (conversationId: string, title: string) => Promise<void>;
  newConversation: () => void;
  syncMessage: (message: Message) => void;

}

function isAuthenticated(): boolean {
  return !!localStorage.getItem('auth_token');
}

export const useChatStore = create<ChatState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        messages: [],
        isStreaming: false,
        streamController: null,
        currentTool: null,
        pendingPlanReview: null,
        isPlanLoading: false,
        pendingBudgetEscalation: null,
        queuedQuery: null,
        draftInput: null,
        conversationId: null,
        conversations: [],
        conversationsLoading: false,
        conversationCache: {},

        // Add message to the end
        addMessage: (message) =>
          set((state) => ({
            messages: [...state.messages, message],
          })),

        // Remove message by ID
        removeMessage: (messageId) =>
          set((state) => ({
            messages: state.messages.filter((msg) => msg.id !== messageId),
          })),

        // Clear all messages
        clearMessages: () =>
          set({
            messages: [],
            conversationId: null,
          }),

        // Set streaming state
        setStreaming: (isStreaming) => set({ isStreaming }),

        // Update specific message (for incremental streaming updates)
        updateMessage: (messageId, updates) =>
          set((state) => ({
            messages: state.messages.map((msg) =>
              msg.id === messageId ? { ...msg, ...updates } : msg
            ),
          })),

        // Add thinking step to message
        addThinkingStep: (messageId, step) =>
          set((state) => ({
            messages: state.messages.map((msg) => {
              if (msg.id !== messageId) return msg;
              const existing = (msg.thinkingSteps || []);
              const idx = existing.findIndex((s) => s.id === step.id);
              return {
                ...msg,
                thinkingSteps: idx >= 0
                  ? existing.map((s, i) => (i === idx ? step : s))
                  : [...existing, step],
              };
            }),
          })),

        // Set stream controller for cancellation
        setStreamController: (controller) =>
          set({ streamController: controller }),

        // Set current tool being executed
        setCurrentTool: (toolName) => set({ currentTool: toolName }),

        // Plan review actions
        setPendingPlanReview: (review) => set({ pendingPlanReview: review }),
        setIsPlanLoading: (loading) => set({ isPlanLoading: loading }),
        setPendingBudgetEscalation: (escalation) => set({ pendingBudgetEscalation: escalation }),
        setQueuedQuery: (query) => set({ queuedQuery: query }),
        setDraftInput: (text) => set({ draftInput: text }),

        // Cancel active stream
        cancelStream: () => {
          const { streamController } = get();
          if (streamController) {
            streamController.abort();
            set({
              streamController: null,
              isStreaming: false,
              currentTool: null,
              queuedQuery: null,
            });
          }
        },

        // Load conversations list from server
        loadConversations: async () => {
          if (!isAuthenticated()) return;
          set({ conversationsLoading: true });
          try {
            const response = await api.conversations.list({ limit: 50 });
            set({
              conversations: response.data.conversations ?? [],
              conversationsLoading: false,
            });
          } catch {
            set({ conversationsLoading: false });
          }
        },

        // Create new conversation on server
        createConversation: async (title?: string) => {
          if (!isAuthenticated()) return '';
          try {
            const response = await api.conversations.create(title);
            const conv = response.data;
            set((state) => ({
              conversationId: conv.id,
              conversations: [
                { id: conv.id, title: conv.title, updated_at: conv.updated_at },
                ...state.conversations,
              ],
            }));
            return conv.id;
          } catch {
            return '';
          }
        },

        // Switch to existing conversation
        switchConversation: async (conversationId: string) => {
          console.log('[ChatStore] switchConversation called', { conversationId, isAuth: isAuthenticated() });
          if (!isAuthenticated()) { console.warn('[ChatStore] Not authenticated, aborting switch'); return; }
          const { conversationId: currentId, messages, streamController } = get();

          // Save current conversation messages to cache before switching
          if (currentId && messages.length > 0) {
            set((state) => ({
              conversationCache: { ...state.conversationCache, [currentId]: [...messages] },
            }));
          }

          // Cancel any active stream from the previous conversation
          if (streamController) {
            streamController.abort();
          }

          // Restore cached messages for the target conversation immediately
          const cached = get().conversationCache[conversationId] || [];

          // Reset all per-conversation state to prevent leakage
          set({
            conversationId,
            messages: cached.length > 0 ? cached : [],
            isStreaming: false,
            streamController: null,
            currentTool: null,
            pendingPlanReview: null,
            isPlanLoading: false,
            queuedQuery: null,
          });

          try {
            const response = await api.conversations.get(conversationId);
            // User may have switched again while we were fetching — bail out
            if (get().conversationId !== conversationId) return;
            const data = response.data;

            // Decrypt encrypted messages if E2EE is unlocked
            const encState = useEncryptionStore.getState();
            const canDecrypt = encState.isUnlocked && encState.privateKey && encState.publicKey;

            const fetchedMessages: Message[] = await Promise.all(
              (data.messages || []).map(async (m: { id: string; role: 'user' | 'assistant'; content: string; is_encrypted?: boolean; thinking_steps?: ConversationThinkingStep[]; decisions?: Message['decisions']; citations?: Message['citations']; documents?: Message['documents']; cost_summary?: Message['costSummary'] }) => {
                let content = m.content;
                if (m.is_encrypted && canDecrypt) {
                  try {
                    const pubKeyBytes = decodeBase64(encState.publicKey!);
                    content = await decryptChatMessage(
                      m.content,
                      conversationId,
                      pubKeyBytes,
                      encState.privateKey!,
                    );
                  } catch {
                    content = '[Зашифроване повідомлення — не вдалося розшифрувати]';
                  }
                } else if (m.is_encrypted && !canDecrypt) {
                  content = '[Зашифроване повідомлення — розблокуйте шифрування]';
                }

                return {
                  id: m.id,
                  role: m.role,
                  content,
                  thinkingSteps: Array.isArray(m.thinking_steps)
                    ? m.thinking_steps.map((s: ConversationThinkingStep, i: number) => ({
                        id: `step-${i}`,
                        title: `\u2713 ${s.tool || 'tool'}`,
                        content: typeof s.result === 'string'
                          ? s.result
                          : (JSON.stringify(s.result ?? '', null, 2) || ''),
                        isComplete: true,
                      }))
                    : undefined,
                  decisions: m.decisions,
                  citations: m.citations,
                  documents: m.documents,
                  costSummary: m.cost_summary ?? undefined,
                };
              })
            );
            set((state) => ({
              messages: fetchedMessages,
              conversationCache: { ...state.conversationCache, [conversationId]: fetchedMessages },
            }));
          } catch (err) {
            console.error('[ChatStore] Failed to load conversation messages', conversationId, err);
            // Clear messages on error so user sees empty state, not stale data
            set({ messages: [] });
          }
        },

        // Delete conversation
        deleteConversation: async (conversationId: string) => {
          if (!isAuthenticated()) return;
          try {
            await api.conversations.delete(conversationId);
            const { conversationId: currentId } = get();
            set((state) => {
              const newCache = { ...state.conversationCache };
              delete newCache[conversationId];
              return {
                conversations: state.conversations.filter((c) => c.id !== conversationId),
                conversationCache: newCache,
                ...(currentId === conversationId
                  ? { conversationId: null, messages: [] }
                  : {}),
              };
            });
          } catch {
            // ignore
          }
        },

        // Rename conversation
        renameConversation: async (conversationId: string, title: string) => {
          if (!isAuthenticated()) return;
          try {
            await api.conversations.rename(conversationId, title);
            set((state) => ({
              conversations: state.conversations.map((c) =>
                c.id === conversationId ? { ...c, title } : c
              ),
            }));
          } catch {
            // ignore
          }
        },

        // Start a new empty conversation
        newConversation: () => {
          const { streamController } = get();
          // Cancel any active stream from the previous conversation
          if (streamController) {
            streamController.abort();
          }
          set({
            messages: [],
            conversationId: null,
            isStreaming: false,
            streamController: null,
            currentTool: null,
            pendingPlanReview: null,
            isPlanLoading: false,
            queuedQuery: null,
          });
        },

        // Sync message to server (fire-and-forget, encrypts if E2EE is unlocked)
        syncMessage: (message: Message) => {
          if (!isAuthenticated()) return;
          const { conversationId } = get();
          if (!conversationId) return;

          const encState = useEncryptionStore.getState();
          const shouldEncrypt = encState.isUnlocked && encState.privateKey && encState.publicKey;

          const doSync = async () => {
            let content = message.content;
            let isEncrypted = false;

            if (shouldEncrypt && content) {
              try {
                const pubKeyBytes = decodeBase64(encState.publicKey!);
                content = await encryptChatMessage(
                  content,
                  conversationId,
                  pubKeyBytes,
                  encState.privateKey!,
                );
                isEncrypted = true;
              } catch (err) {
                console.error('[ChatStore] Message encryption failed, syncing plaintext:', err);
              }
            }

            await api.conversations.addMessage(conversationId, {
              role: message.role,
              content,
              thinking_steps: message.thinkingSteps?.map(s => ({ tool: s.title, result: s.content })),
              decisions: message.decisions,
              citations: message.citations,
              documents: message.documents,
              cost_summary: message.costSummary,
              is_encrypted: isEncrypted,
            });
          };

          doSync().catch(() => {
            // Silent fail - localStorage backup remains
          });
        },

      }),
      {
        name: 'chat-storage', // localStorage key
        partialize: (state) => ({
          // Only persist messages (not runtime state like streamController or conversationCache)
          messages: state.messages,
          conversationId: state.conversationId,
        }),
      }
    ),
    { name: 'ChatStore' } // DevTools name
  )
);

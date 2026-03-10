import apiClient from './client';
import type {
  ConversationThinkingStep,
  ConversationDecision,
  ConversationCitation,
  ConversationDocument,
  ConversationCostSummary,
} from '../../services/api/ConversationService';

export const conversationsApi = {
  create: (title?: string) => apiClient.post('/api/conversations', { title }),
  list: (params?: { limit?: number; offset?: number }) =>
    apiClient.get('/api/conversations', { params }),
  get: (id: string) => apiClient.get(`/api/conversations/${id}`),
  rename: (id: string, title: string) =>
    apiClient.put(`/api/conversations/${id}`, { title }),
  delete: (id: string) => apiClient.delete(`/api/conversations/${id}`),
  addMessage: (conversationId: string, message: {
    role: 'user' | 'assistant';
    content: string;
    thinking_steps?: ConversationThinkingStep[];
    decisions?: ConversationDecision[];
    citations?: ConversationCitation[];
    documents?: ConversationDocument[];
    cost_summary?: ConversationCostSummary;
  }) => apiClient.post(`/api/conversations/${conversationId}/messages`, message),
};

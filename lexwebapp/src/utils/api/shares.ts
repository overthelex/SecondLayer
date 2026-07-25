import apiClient from './client';

export type ShareScope = 'conversation' | 'message';

export interface SharedMessage {
  role: 'user' | 'assistant';
  content: string;
  decisions?: unknown[];
  citations?: unknown[];
  documents?: unknown[];
}

export interface ShareSnapshot {
  messages: SharedMessage[];
}

export interface CreateSharePayload {
  scope: ShareScope;
  title?: string;
  snapshot: ShareSnapshot;
  conversationId?: string | null;
}

export const sharesApi = {
  create: (payload: CreateSharePayload) =>
    apiClient.post<{ token: string }>('/api/shares', payload),
  get: (token: string) =>
    apiClient.get(`/api/shares/${token}`),
  list: () => apiClient.get('/api/shares'),
  revoke: (token: string) => apiClient.delete(`/api/shares/${token}`),
};

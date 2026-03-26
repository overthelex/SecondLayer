import apiClient from './client';

export const sessionReplayApi = {
  // Client-facing
  createSession: (sessionId: string, viewport: string) =>
    apiClient.post('/api/session-replay/sessions', { sessionId, viewport }),

  sendChunk: (sessionId: string, chunkIndex: number, events: any[]) =>
    apiClient.post(`/api/session-replay/sessions/${sessionId}/chunks`, { chunkIndex, events }),

  endSession: (sessionId: string) =>
    apiClient.post(`/api/session-replay/sessions/${sessionId}/end`),

  // Admin
  listSessions: (params?: { userId?: string; from?: string; to?: string; limit?: number; offset?: number }) =>
    apiClient.get('/api/admin/session-replay/sessions', { params }),

  getSession: (sessionId: string) =>
    apiClient.get(`/api/admin/session-replay/sessions/${sessionId}`),

  getSessionEvents: (sessionId: string) =>
    apiClient.get(`/api/admin/session-replay/sessions/${sessionId}/events`),

  getSessionLogs: (sessionId: string) =>
    apiClient.get(`/api/admin/session-replay/sessions/${sessionId}/logs`),
};

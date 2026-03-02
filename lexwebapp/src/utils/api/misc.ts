import apiClient from './client';

export const decisionsApi = {
  checkAvailable: (docIds: string[]) =>
    apiClient.get('/api/decisions/check-available', { params: { doc_ids: docIds.join(',') } }),
  fetchFullText: (docId: string) =>
    apiClient.post('/api/decisions/fetch-fulltext', { doc_id: docId }),
  fetchFullTextBatch: (docIds: string[]) =>
    apiClient.post('/api/decisions/fetch-fulltext-batch', { doc_ids: docIds }),
};

export const keysApi = {
  list: () => apiClient.get('/api/keys'),
  create: (data: { name: string; description?: string; expiresAt?: string }) =>
    apiClient.post('/api/keys', data),
  revoke: (keyId: string) => apiClient.delete(`/api/keys/${keyId}`),
};

export const gdprApi = {
  requestExport: () => apiClient.post('/api/gdpr/export'),
  getExport: (id: string) => apiClient.get(`/api/gdpr/export/${id}`),
  requestDeletion: (confirmation: string) =>
    apiClient.post('/api/gdpr/delete', { confirmation }),
  listRequests: () => apiClient.get('/api/gdpr/requests'),
};

export const toolsApi = {
  execute: (toolName: string, params: any) =>
    apiClient.post(`/api/tools/${toolName}`, params),
};

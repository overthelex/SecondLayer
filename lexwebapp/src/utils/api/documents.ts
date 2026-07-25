import apiClient from './client';

export const documentsApi = {
  getFolders: (prefix?: string) =>
    apiClient.get('/api/documents/folders', { params: { prefix } }),
  deleteFolder: (folderPath: string) =>
    apiClient.delete(`/api/documents/folders/${encodeURIComponent(folderPath)}`),
  getById: (id: string) => apiClient.get(`/api/documents/${id}`),
  delete: (id: string) => apiClient.delete(`/api/documents/${id}`),
  restore: (id: string) => apiClient.patch(`/api/documents/${id}/restore`),
  update: (id: string, data: { full_text?: string; title?: string; type?: string }) =>
    apiClient.patch(`/api/documents/${id}`, data),
  move: (id: string, folderPath: string) =>
    apiClient.post(`/api/documents/${id}/move`, { folderPath }),
  getStats: () => apiClient.get('/api/documents/stats'),
  getPreviewUrl: (id: string) => apiClient.get(`/api/documents/${id}/preview`),
  startClassification: (params: { concurrency?: number; documentIds?: string[] }) =>
    apiClient.post('/api/documents/classify', params),
  getClassificationJob: (jobId: string) =>
    apiClient.get(`/api/documents/classify/${jobId}`),
  cancelClassification: (jobId: string) =>
    apiClient.post(`/api/documents/classify/${jobId}/cancel`),
  dismissClassification: () =>
    apiClient.post('/api/documents/classify/dismiss'),
};

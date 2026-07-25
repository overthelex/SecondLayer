import apiClient from './client';

export const authApi = {
  getMe: () => apiClient.get('/auth/me'),
  logout: () => apiClient.post('/auth/logout'),
  refreshToken: () => apiClient.post('/auth/refresh'),
  updateProfile: (data: { name?: string; picture?: string }) =>
    apiClient.put('/auth/profile', data),
};

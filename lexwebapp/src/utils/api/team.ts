import apiClient from './client';

export const teamApi = {
  getMembers: () => apiClient.get('/api/team/members'),
  getStats: () => apiClient.get('/api/team/stats'),
  getOrganization: () => apiClient.get('/api/team/organization'),
  createOrganization: (data: { name: string; taxId?: string; contactEmail?: string; description?: string }) =>
    apiClient.post('/api/team/organization', data),
  inviteMember: (email: string, role: string) =>
    apiClient.post('/api/team/invite', { email, role }),
  updateMember: (memberId: string, data: { role?: string; status?: string }) =>
    apiClient.put(`/api/team/members/${memberId}`, data),
  removeMember: (memberId: string) =>
    apiClient.delete(`/api/team/members/${memberId}`),
  resendInvite: (memberId: string) =>
    apiClient.post(`/api/team/members/${memberId}/resend-invite`, {}),
};

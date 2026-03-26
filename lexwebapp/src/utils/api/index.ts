/**
 * Barrel re-export — identical `api` shape as the original api-client.ts
 */

export { default, default as apiClient } from './client';
export { API_URL } from './client';

import { authApi } from './auth';
import { billingApi, paymentApi } from './billing';
import { adminApi } from './admin';
import { documentsApi } from './documents';
import { teamApi } from './team';
import { conversationsApi } from './conversations';
import { decisionsApi, keysApi, gdprApi, toolsApi } from './misc';

export const api = {
  auth: authApi,
  billing: billingApi,
  payment: paymentApi,
  team: teamApi,
  tools: toolsApi,
  conversations: conversationsApi,
  documents: documentsApi,
  admin: adminApi,
  decisions: decisionsApi,
  keys: keysApi,
  gdpr: gdprApi,
};

// Re-export individual modules for direct imports
export { authApi } from './auth';
export { billingApi, paymentApi } from './billing';
export { adminApi } from './admin';
export { documentsApi } from './documents';
export { teamApi } from './team';
export { conversationsApi } from './conversations';
export { decisionsApi, keysApi, gdprApi, toolsApi } from './misc';
export { sessionReplayApi } from './session-replay';

/**
 * Authentik User Provisioning Service
 * Auto-creates users in Authentik when they register in lexwebapp,
 * giving them SSO access to Nextcloud and other Authentik-protected services.
 */

import { logger } from '../utils/logger.js';

const AUTHENTIK_API_URL = process.env.AUTHENTIK_API_URL || '';
const AUTHENTIK_API_TOKEN = process.env.AUTHENTIK_API_TOKEN || '';

interface AuthentikUser {
  pk: number;
  username: string;
  name: string;
  email: string;
  is_active: boolean;
}

interface ProvisionUserData {
  email: string;
  name?: string;
  password?: string;
}

/**
 * Check if Authentik provisioning is configured
 */
export function isAuthentikConfigured(): boolean {
  return !!(AUTHENTIK_API_URL && AUTHENTIK_API_TOKEN);
}

/**
 * Make an authenticated request to the Authentik API
 */
async function authentikFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${AUTHENTIK_API_URL.replace(/\/$/, '')}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${AUTHENTIK_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

/**
 * Find existing user in Authentik by email
 */
async function findAuthentikUser(email: string): Promise<AuthentikUser | null> {
  const res = await authentikFetch(`/api/v3/core/users/?search=${encodeURIComponent(email)}`);
  if (!res.ok) {
    throw new Error(`Authentik search failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json() as { results?: AuthentikUser[] };
  const match = data.results?.find((u: AuthentikUser) => u.email === email);
  return match || null;
}

/**
 * Create a user in Authentik
 */
async function createAuthentikUser(data: ProvisionUserData): Promise<AuthentikUser> {
  const username = data.email.split('@')[0].replace(/[^a-zA-Z0-9._-]/g, '_');

  const res = await authentikFetch('/api/v3/core/users/', {
    method: 'POST',
    body: JSON.stringify({
      username,
      name: data.name || username,
      email: data.email,
      is_active: true,
      path: 'lexwebapp',
      groups: [],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Authentik user creation failed: ${res.status} ${body}`);
  }

  return await res.json() as AuthentikUser;
}

/**
 * Set password for an Authentik user
 */
async function setAuthentikPassword(userId: number, password: string): Promise<void> {
  const res = await authentikFetch(`/api/v3/core/users/${userId}/set_password/`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Authentik set password failed: ${res.status} ${body}`);
  }
}

/**
 * Provision a user in Authentik (fire-and-forget safe).
 * Checks if user already exists by email to avoid duplicates.
 * If password is provided (email/password registration), sets it in Authentik too.
 */
export async function provisionAuthentikUser(data: ProvisionUserData): Promise<void> {
  if (!isAuthentikConfigured()) {
    logger.debug('[Authentik] Provisioning skipped — not configured');
    return;
  }

  try {
    // Check if user already exists
    const existing = await findAuthentikUser(data.email);
    if (existing) {
      logger.info('[Authentik] User already exists, skipping provisioning', { email: data.email });
      return;
    }

    // Create user
    const authentikUser = await createAuthentikUser(data);
    logger.info('[Authentik] User provisioned successfully', {
      email: data.email,
      authentikPk: authentikUser.pk,
      username: authentikUser.username,
    });

    // Set password if provided (email/password registration)
    if (data.password) {
      await setAuthentikPassword(authentikUser.pk, data.password);
      logger.info('[Authentik] Password set for user', { email: data.email });
    }
  } catch (error: any) {
    // Non-fatal: log and continue — user can still use lexwebapp
    logger.error('[Authentik] User provisioning failed', {
      email: data.email,
      error: error.message,
    });
  }
}

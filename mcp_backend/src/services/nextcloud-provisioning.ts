/**
 * Nextcloud User Provisioning Service
 * Auto-creates personal Nextcloud accounts for users when they register/login.
 * Uses Nextcloud OCS Provisioning API with admin credentials.
 */

import crypto from 'crypto';
import { logger } from '../utils/logger.js';

const NEXTCLOUD_URL = (process.env.NEXTCLOUD_URL || '').replace(/\/$/, '');
const NEXTCLOUD_USER = process.env.NEXTCLOUD_USER || 'admin';
const NEXTCLOUD_PASSWORD = process.env.NEXTCLOUD_PASSWORD || 'admin';

interface ProvisionNextcloudData {
  email: string;
  name?: string;
  password?: string;
}

/**
 * Check if Nextcloud provisioning is configured
 */
export function isNextcloudConfigured(): boolean {
  return !!NEXTCLOUD_URL;
}

/**
 * Make an authenticated OCS API request to Nextcloud
 */
async function nextcloudOcs(path: string, options: RequestInit = {}): Promise<any> {
  const url = `${NEXTCLOUD_URL}${path}`;
  const auth = 'Basic ' + Buffer.from(`${NEXTCLOUD_USER}:${NEXTCLOUD_PASSWORD}`).toString('base64');

  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': auth,
      'OCS-APIRequest': 'true',
      'Accept': 'application/json',
      ...options.headers,
    },
  });

  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}

/**
 * Generate a Nextcloud-safe username from email.
 * Nextcloud usernames: lowercase, alphanumeric + dots/hyphens/underscores.
 */
function emailToUsername(email: string): string {
  return email.split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '_')
    .substring(0, 64);
}

/**
 * Check if a Nextcloud user already exists
 */
async function findNextcloudUser(username: string): Promise<boolean> {
  const result = await nextcloudOcs(`/ocs/v1.php/cloud/users/${encodeURIComponent(username)}`, {
    method: 'GET',
  });

  // 200 with statuscode=100 = user exists, 404 or statuscode=404 = not found
  return result.status === 200 && result.data?.ocs?.meta?.statuscode === 100;
}

/**
 * Create a user in Nextcloud via OCS Provisioning API
 */
async function createNextcloudUser(
  username: string,
  data: ProvisionNextcloudData
): Promise<void> {
  const password = data.password || crypto.randomBytes(24).toString('base64url');

  const body = new URLSearchParams();
  body.append('userid', username);
  body.append('password', password);
  body.append('email', data.email);
  if (data.name) {
    body.append('displayName', data.name);
  }

  const result = await nextcloudOcs('/ocs/v1.php/cloud/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const statuscode = result.data?.ocs?.meta?.statuscode;
  if (statuscode !== 100) {
    const msg = result.data?.ocs?.meta?.message || JSON.stringify(result.data);
    throw new Error(`OCS create user failed (statuscode=${statuscode}): ${msg}`);
  }
}

/**
 * Provision a Nextcloud account for a user (fire-and-forget safe).
 * Checks if user already exists by username to avoid duplicates.
 */
export async function provisionNextcloudUser(data: ProvisionNextcloudData): Promise<void> {
  if (!isNextcloudConfigured()) {
    logger.debug('[Nextcloud] Provisioning skipped — not configured');
    return;
  }

  try {
    const username = emailToUsername(data.email);

    // Check if user already exists
    const exists = await findNextcloudUser(username);
    if (exists) {
      logger.info('[Nextcloud] User already exists, skipping provisioning', {
        email: data.email,
        username,
      });
      return;
    }

    // Create user
    await createNextcloudUser(username, data);
    logger.info('[Nextcloud] User provisioned successfully', {
      email: data.email,
      username,
    });
  } catch (error: any) {
    // Non-fatal: log and continue — user can still use lexwebapp
    logger.error('[Nextcloud] User provisioning failed', {
      email: data.email,
      error: error.message,
    });
  }
}

/**
 * OIDC Service — Authentik SSO integration
 * Handles OpenID Connect authorization code flow with PKCE
 */

import crypto from 'crypto';
import { Issuer, Client, generators } from 'openid-client';
import { logger } from '../utils/logger.js';
import type { ICachePort } from '../domain/ports/index.js';

const OIDC_DISCOVERY_URL = process.env.OIDC_DISCOVERY_URL || '';
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID || '';
const OIDC_CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET || '';
const OIDC_REDIRECT_URI = process.env.OIDC_REDIRECT_URI || '';
const OIDC_STATE_TTL = 600; // 10 minutes

let oidcClient: Client | null = null;
let oidcCache: ICachePort | null = null;

export function setOidcCache(cache: ICachePort): void {
  oidcCache = cache;
}

export function isOidcConfigured(): boolean {
  return !!(OIDC_DISCOVERY_URL && OIDC_CLIENT_ID && OIDC_CLIENT_SECRET);
}

async function getClient(): Promise<Client> {
  if (oidcClient) return oidcClient;

  const issuer = await Issuer.discover(OIDC_DISCOVERY_URL);
  oidcClient = new issuer.Client({
    client_id: OIDC_CLIENT_ID,
    client_secret: OIDC_CLIENT_SECRET,
    redirect_uris: [OIDC_REDIRECT_URI],
    response_types: ['code'],
  });

  logger.info('[OIDC] Client initialized', {
    issuer: issuer.metadata.issuer,
    clientId: OIDC_CLIENT_ID,
  });

  return oidcClient;
}

export interface OidcAuthUrl {
  url: string;
  state: string;
}

/**
 * Generate authorization URL for Authentik.
 * Stores state + code_verifier in Redis for validation on callback.
 */
export async function getAuthorizationUrl(callbackUrl?: string): Promise<OidcAuthUrl> {
  const client = await getClient();
  const state = generators.state();
  const codeVerifier = generators.codeVerifier();
  const codeChallenge = generators.codeChallenge(codeVerifier);

  const redirectUri = callbackUrl || OIDC_REDIRECT_URI;

  const url = client.authorizationUrl({
    scope: 'openid email profile',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    redirect_uri: redirectUri,
  });

  // Store state → code_verifier + redirect_uri mapping in cache
  if (oidcCache) {
    await oidcCache.set(
      `oidc:state:${state}`,
      JSON.stringify({ codeVerifier, redirectUri }),
      OIDC_STATE_TTL
    );
  }

  return { url, state };
}

export interface OidcUserInfo {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
}

const AUTHENTIK_API_URL = process.env.AUTHENTIK_API_URL || '';
const AUTHENTIK_AUTH_FLOW_SLUG = process.env.AUTHENTIK_AUTH_FLOW_SLUG || 'default-authentication-flow';

/**
 * Authenticate user via Authentik Flow Executor API (headless).
 * Executes the authentication flow step by step:
 * 1. GET flow → ak-stage-identification
 * 2. POST uid_field → ak-stage-password
 * 3. POST password → xak-flow-redirect (success)
 * Then fetches user info from the Authentik session.
 */
export async function loginWithCredentials(
  username: string,
  password: string
): Promise<OidcUserInfo> {
  if (!AUTHENTIK_API_URL) {
    throw new Error('AUTHENTIK_API_URL is not configured');
  }

  const flowUrl = `${AUTHENTIK_API_URL}/api/v3/flows/executor/${AUTHENTIK_AUTH_FLOW_SLUG}/`;

  // We need to track cookies (authentik_session) across requests
  let sessionCookie = '';

  const fetchWithCookies = async (url: string, options: RequestInit = {}): Promise<any> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };
    if (sessionCookie) {
      headers['Cookie'] = sessionCookie;
    }

    const resp = await fetch(url, { ...options, headers, redirect: 'manual' });

    // Capture set-cookie header
    const setCookie = resp.headers.get('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/authentik_session=([^;]+)/);
      if (match) {
        sessionCookie = `authentik_session=${match[1]}`;
      }
    }

    const text = await resp.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Unexpected response from Authentik: ${text.substring(0, 200)}`);
    }
  };

  // Step 1: GET flow — get identification stage
  const step1 = await fetchWithCookies(flowUrl);

  if (step1.component !== 'ak-stage-identification') {
    logger.error('[OIDC] Unexpected flow stage', { component: step1.component });
    throw new Error(`Unexpected flow stage: ${step1.component}`);
  }

  // Step 2: POST identification (email/username)
  const step2 = await fetchWithCookies(flowUrl, {
    method: 'POST',
    body: JSON.stringify({ component: 'ak-stage-identification', uid_field: username }),
  });

  if (step2.component === 'ak-stage-access-denied') {
    throw new Error('invalid_grant: user not found');
  }

  if (step2.component !== 'ak-stage-password') {
    logger.error('[OIDC] Unexpected flow stage after identification', { component: step2.component });
    throw new Error(`Unexpected flow stage: ${step2.component}`);
  }

  // Step 3: POST password
  const step3 = await fetchWithCookies(flowUrl, {
    method: 'POST',
    body: JSON.stringify({ component: 'ak-stage-password', password }),
  });

  if (step3.component === 'ak-stage-access-denied') {
    throw new Error('invalid_grant: invalid password');
  }

  if (step3.component !== 'xak-flow-redirect') {
    // Could be MFA or other stage — not supported yet
    logger.error('[OIDC] Unexpected flow stage after password', { component: step3.component });
    throw new Error(`Unexpected flow stage: ${step3.component}`);
  }

  // Step 4: Get user info from session
  const userInfoResp = await fetchWithCookies(`${AUTHENTIK_API_URL}/api/v3/core/users/me/`);

  const user = userInfoResp.user || userInfoResp;
  const userInfo: OidcUserInfo = {
    sub: String(user.pk || user.uid || ''),
    email: user.email || '',
    name: user.name || undefined,
    picture: user.avatar || undefined,
    email_verified: true,
  };

  if (!userInfo.email) {
    throw new Error('No email returned from Authentik');
  }

  logger.info('[OIDC] User authenticated via Flow Executor', {
    sub: userInfo.sub,
    email: userInfo.email,
  });

  return userInfo;
}

/**
 * Handle callback from Authentik.
 * Exchanges authorization code for tokens, returns user info.
 */
export async function handleCallback(
  callbackUrl: string,
  queryParams: Record<string, string>
): Promise<OidcUserInfo> {
  const client = await getClient();

  const state = queryParams.state;
  if (!state) throw new Error('Missing state parameter');

  // Retrieve stored code_verifier
  let codeVerifier: string | undefined;
  let storedRedirectUri: string | undefined;

  if (oidcCache) {
    const raw = await oidcCache.get(`oidc:state:${state}`);
    if (!raw) throw new Error('State expired or invalid');
    const parsed = JSON.parse(raw);
    codeVerifier = parsed.codeVerifier;
    storedRedirectUri = parsed.redirectUri;
    await oidcCache.del(`oidc:state:${state}`);
  }

  const params = client.callbackParams(callbackUrl + '?' + new URLSearchParams(queryParams).toString());

  const tokenSet = await client.callback(
    storedRedirectUri || OIDC_REDIRECT_URI,
    params,
    {
      state,
      code_verifier: codeVerifier,
    }
  );

  // Get user info from the ID token or userinfo endpoint
  const claims = tokenSet.claims();
  let userInfo: OidcUserInfo = {
    sub: claims.sub,
    email: (claims.email as string) || '',
    name: (claims.name as string) || undefined,
    picture: (claims.picture as string) || undefined,
    email_verified: claims.email_verified as boolean | undefined,
  };

  // If email is missing from claims, try userinfo endpoint
  if (!userInfo.email) {
    const info = await client.userinfo(tokenSet.access_token!);
    userInfo = {
      sub: info.sub,
      email: (info.email as string) || '',
      name: (info.name as string) || undefined,
      picture: (info.picture as string) || undefined,
      email_verified: info.email_verified as boolean | undefined,
    };
  }

  if (!userInfo.email) {
    throw new Error('No email returned from OIDC provider');
  }

  logger.info('[OIDC] User authenticated', {
    sub: userInfo.sub,
    email: userInfo.email,
  });

  return userInfo;
}

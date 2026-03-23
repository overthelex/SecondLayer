/**
 * Diia Service
 * Integration with Ukrainian government's Diia Business API.
 *
 * Auth flow (Diia.Sign / Дія.Підпис):
 * 1. GET  /api/v1/auth/acquirer/{DIIA_ACQUIRER_TOKEN}  → session bearer token (no auth header, token in URL)
 * 2. GET  /api/v2/acquirers/branches                   → list branches
 * 3. GET  /api/v1/acquirers/branch/{id}/offers         → list offers
 * 4. POST /api/v2/acquirers/branch/{id}/offer-request/dynamic → get deeplink
 * 5. User scans QR in Diia app → Diia POSTs to our webhook
 *
 * SDK reference: https://github.com/diiaintegration/ua-acquirers-sdk-js
 */

import crypto from 'crypto';
import { logger } from '../utils/logger.js';

const DIIA_BASE_URL = process.env.DIIA_BASE_URL || 'https://api2s.diia.gov.ua';
const DIIA_ACQUIRER_TOKEN = process.env.DIIA_ACQUIRER_TOKEN || '';
const DIIA_AUTH_ACQUIRER_TOKEN = process.env.DIIA_AUTH_ACQUIRER_TOKEN || '';

interface DiiaSessionResponse {
  token: string;
}

interface DiiaBranch {
  id: string;
  _id?: string;
  name: string;
  deliveryTypes?: string[];
  offerRequestType?: string;
  scopes?: Record<string, unknown>;
}

interface DiiaOffer {
  id: string;
  _id?: string;
  name: string;
  returnLink?: string;
  scopes?: Record<string, unknown>;
}

export interface DiiaDeeplinkResult {
  deeplink: string;
  requestId: string;        // plain UUID — used by frontend for polling
  hashedRequestId: string;  // SHA256(requestId) — Diia sends this in X-Document-Request-Trace-Id
}

export interface DiiaSignFile {
  fileName: string;
  fileHash: string;  // SHA256 hash of file content, base64-encoded
}

/** Thrown when the Diia acquirer lacks required scope permissions. */
export class DiiaPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiiaPermissionError';
  }
}

export class DiiaService {
  private tokenCache: { token: string; expiresAt: number } | null = null;

  /**
   * Step 1: Get Bearer session token.
   * GET /api/v1/auth/acquirer/{acquirerToken}  — token is in URL path, no auth header.
   */
  async getSessionToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.token;
    }

    if (!DIIA_ACQUIRER_TOKEN) {
      throw new Error('DIIA_ACQUIRER_TOKEN is not configured');
    }

    const url = `${DIIA_BASE_URL}/api/v1/auth/acquirer/${DIIA_ACQUIRER_TOKEN}`;
    const headers: Record<string, string> = {};
    if (DIIA_AUTH_ACQUIRER_TOKEN) {
      headers['Authorization'] = `Basic ${DIIA_AUTH_ACQUIRER_TOKEN}`;
    }
    const response = await fetch(url, { method: 'GET', headers });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Diia session token failed: ${response.status} ${body}`);
    }

    const data = await response.json() as DiiaSessionResponse;

    // Cache for 1h 55m (tokens valid 2 hours)
    this.tokenCache = {
      token: data.token,
      expiresAt: Date.now() + 115 * 60 * 1000,
    };

    logger.info('[Diia] Session token obtained');
    return data.token;
  }

  /** GET /api/v2/acquirers/branches */
  async getBranches(): Promise<DiiaBranch[]> {
    const token = await this.getSessionToken();
    const response = await fetch(`${DIIA_BASE_URL}/api/v2/acquirers/branches?skip=0&limit=50`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Diia getBranches failed: ${response.status} ${body}`);
    }

    const data = await response.json() as { branches: DiiaBranch[] };
    return data.branches || [];
  }

  /** Common branch details shared between create and update */
  private getAuthBranchBody() {
    return {
      name: 'Авторизація в застосунку Lex / legal.org.ua',
      email: 'admin@legal.org.ua',
      region: 'м. Київ',
      district: 'Деснянський р-н',
      location: 'м. Київ',
      street: 'вул. 47-а Садова',
      house: '1а',
      customFullName: 'ФОП Кириченко І.В. — юридична AI-платформа',
      customFullAddress: '04132, Україна, м. Київ, вул. 47-а Садова, 1а',
      deliveryTypes: ['api'],
      offerRequestType: 'dynamic',
      scopes: { diiaId: ['auth'] },
    };
  }

  /** POST /api/v2/acquirers/branch — create branch for auth */
  async createBranch(): Promise<string> {
    const token = await this.getSessionToken();

    const response = await fetch(`${DIIA_BASE_URL}/api/v2/acquirers/branch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(this.getAuthBranchBody()),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (response.status === 403 && body.includes('forbidden')) {
        throw new DiiaPermissionError(`Diia acquirer не має дозволу на scope diiaId:auth. Зверніться до Diia Business для активації. (${body})`);
      }
      throw new Error(`Diia createBranch failed: ${response.status} ${body}`);
    }

    const data = await response.json() as { _id: string };
    logger.info('[Diia] Branch created', { branchId: data._id });
    return data._id;
  }

  /** PUT /api/v2/acquirers/branch/{branchId} — update existing branch */
  async updateBranch(branchId: string, body: Record<string, unknown>): Promise<void> {
    const token = await this.getSessionToken();

    const response = await fetch(`${DIIA_BASE_URL}/api/v2/acquirers/branch/${branchId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      logger.warn('[Diia] updateBranch failed (non-critical)', { branchId, status: response.status, text });
    } else {
      logger.info('[Diia] Branch updated', { branchId });
    }
  }

  /** PUT /api/v1/acquirers/branch/{branchId}/offer/{offerId} — update existing offer */
  async updateOffer(branchId: string, offerId: string, body: Record<string, unknown>): Promise<void> {
    const token = await this.getSessionToken();

    const response = await fetch(`${DIIA_BASE_URL}/api/v1/acquirers/branch/${branchId}/offer/${offerId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      logger.warn('[Diia] updateOffer failed (non-critical)', { branchId, offerId, status: response.status, text });
    } else {
      logger.info('[Diia] Offer updated', { branchId, offerId });
    }
  }

  /** GET /api/v1/acquirers/branch/{branchId}/offers */
  async getOffers(branchId: string): Promise<DiiaOffer[]> {
    const token = await this.getSessionToken();
    const response = await fetch(
      `${DIIA_BASE_URL}/api/v1/acquirers/branch/${branchId}/offers?skip=0&limit=50`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Diia getOffers failed: ${response.status} ${body}`);
    }

    const data = await response.json() as { offers: DiiaOffer[] };
    return data.offers || [];
  }

  /** POST /api/v1/acquirers/branch/{branchId}/offer — create auth offer */
  async createOffer(branchId: string, returnLink: string): Promise<string> {
    const token = await this.getSessionToken();

    const offerBody = {
      name: 'Авторизація в застосунку Lex / legal.org.ua',
      returnLink,
      scopes: { diiaId: ['auth'] },
    };

    const response = await fetch(`${DIIA_BASE_URL}/api/v1/acquirers/branch/${branchId}/offer`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(offerBody),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (response.status === 403 && body.includes('forbidden')) {
        throw new DiiaPermissionError(`Diia acquirer не має дозволу на scope diiaId:auth. Зверніться до Diia Business для активації. (${body})`);
      }
      throw new Error(`Diia createOffer failed: ${response.status} ${body}`);
    }

    const data = await response.json() as { _id: string };
    logger.info('[Diia] Offer created', { offerId: data._id, branchId });
    return data._id;
  }

  /**
   * POST /api/v2/acquirers/branch/{branchId}/offer-request/dynamic
   * Returns the deeplink and the requestId for polling.
   *
   * Note: Diia.Sign auth requires the requestId to be SHA256-hashed before sending.
   */
  async getAuthDeeplink(branchId: string, offerId: string): Promise<DiiaDeeplinkResult> {
    const token = await this.getSessionToken();

    const requestId = crypto.randomUUID();
    // ECDSA algorithm: hash requestId with SHA256 → base64 (44 chars)
    // DSTU (default) would require ГОСТ 34.311 via IIT library — use ECDSA instead
    const hashedRequestId = crypto.createHash('sha256').update(requestId).digest('base64');

    const response = await fetch(
      `${DIIA_BASE_URL}/api/v2/acquirers/branch/${branchId}/offer-request/dynamic`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ offerId, requestId: hashedRequestId, signAlgo: 'ECDSA' }),
      }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Diia getAuthDeeplink failed: ${response.status} ${body}`);
    }

    const data = await response.json() as { deeplink: string };
    logger.info('[Diia] Auth deeplink created', { branchId, offerId });

    return { deeplink: data.deeplink, requestId, hashedRequestId };
  }

  /**
   * Initialize a full auth session.
   * Auto-discovers (or creates) branch and offer, then returns the auth deeplink.
   * Uses DIIA_BRANCH_ID / DIIA_OFFER_ID env vars as cache to skip discovery.
   */
  async initAuthSession(returnUrl: string): Promise<DiiaDeeplinkResult> {
    // Use cached branch/offer IDs from env if available
    let branchId = process.env.DIIA_BRANCH_ID || '';
    let offerId = process.env.DIIA_OFFER_ID || '';

    if (!branchId) {
      const branches = await this.getBranches();
      // Prefer a branch that has diiaId auth scopes
      const authBranch = branches.find(b =>
        b.scopes && typeof b.scopes === 'object' && 'diiaId' in b.scopes
      );
      if (authBranch) {
        branchId = authBranch.id || authBranch._id || '';
        // Update branch details in background (name, address, etc.)
        this.updateBranch(branchId, this.getAuthBranchBody()).catch(() => {});
      } else if (branches.length > 0) {
        // No branch with auth scopes — try the first one, createOffer will fail if scope is missing
        logger.warn('[Diia] No branch with diiaId scope found, using first branch');
        branchId = branches[0].id || branches[0]._id || '';
      } else {
        // First-time setup: create branch
        branchId = await this.createBranch();
      }
      logger.info('[Diia] Using branch', { branchId });
    }

    if (!offerId) {
      const offers = await this.getOffers(branchId);
      if (offers.length > 0) {
        offerId = offers[0].id || offers[0]._id || '';
        // Update offer name in background
        this.updateOffer(branchId, offerId, {
          name: 'Авторизація в застосунку Lex / legal.org.ua',
          scopes: { diiaId: ['auth'] },
        }).catch(() => {});
      } else {
        // First-time setup: create offer
        offerId = await this.createOffer(branchId, returnUrl);
      }
      logger.info('[Diia] Using offer', { offerId });
    }

    return this.getAuthDeeplink(branchId, offerId);
  }

  // ---------------------------------------------------------------------------
  // Дія.Підпис (Signing) — hashedFilesSigning scope
  // ---------------------------------------------------------------------------

  /** Common signing branch details */
  private getSigningBranchBody() {
    return {
      name: 'Підпис документів Lex / legal.org.ua',
      email: 'admin@legal.org.ua',
      region: 'м. Київ',
      district: 'Деснянський р-н',
      location: 'м. Київ',
      street: 'вул. 47-а Садова',
      house: '1а',
      customFullName: 'ФОП Кириченко І.В. — юридична AI-платформа',
      customFullAddress: '04132, Україна, м. Київ, вул. 47-а Садова, 1а',
      deliveryTypes: ['api'],
      offerRequestType: 'dynamic',
      scopes: { diiaId: ['hashedFilesSigning'] },
    };
  }

  /** POST /api/v2/acquirers/branch — create branch for document signing */
  async createSigningBranch(): Promise<string> {
    const token = await this.getSessionToken();

    const response = await fetch(`${DIIA_BASE_URL}/api/v2/acquirers/branch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(this.getSigningBranchBody()),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (response.status === 403 && body.includes('forbidden')) {
        throw new DiiaPermissionError(
          `Diia acquirer не має дозволу на scope diiaId:hashedFilesSigning. Зверніться до Diia Business для активації. (${body})`
        );
      }
      throw new Error(`Diia createSigningBranch failed: ${response.status} ${body}`);
    }

    const data = await response.json() as { _id: string };
    logger.info('[Diia] Signing branch created', { branchId: data._id });
    return data._id;
  }

  /** POST /api/v1/acquirers/branch/{branchId}/offer — create signing offer */
  async createSigningOffer(branchId: string, returnLink: string): Promise<string> {
    const token = await this.getSessionToken();

    const offerBody = {
      name: 'Підпис документів Lex / legal.org.ua',
      returnLink,
      scopes: { diiaId: ['hashedFilesSigning'] },
    };

    const response = await fetch(`${DIIA_BASE_URL}/api/v1/acquirers/branch/${branchId}/offer`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(offerBody),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (response.status === 403 && body.includes('forbidden')) {
        throw new DiiaPermissionError(
          `Diia acquirer не має дозволу на scope diiaId:hashedFilesSigning. Зверніться до Diia Business для активації. (${body})`
        );
      }
      throw new Error(`Diia createSigningOffer failed: ${response.status} ${body}`);
    }

    const data = await response.json() as { _id: string };
    logger.info('[Diia] Signing offer created', { offerId: data._id, branchId });
    return data._id;
  }

  /**
   * POST /api/v2/acquirers/branch/{branchId}/offer-request/dynamic
   * Returns deeplink for document signing with file hashes.
   */
  async getSigningDeeplink(
    branchId: string,
    offerId: string,
    files: DiiaSignFile[],
  ): Promise<DiiaDeeplinkResult> {
    const token = await this.getSessionToken();

    const requestId = crypto.randomUUID();
    const hashedRequestId = crypto.createHash('sha256').update(requestId).digest('base64');

    const response = await fetch(
      `${DIIA_BASE_URL}/api/v2/acquirers/branch/${branchId}/offer-request/dynamic`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          offerId,
          requestId: hashedRequestId,
          signAlgo: 'ECDSA',
          data: {
            hashedFilesSigning: {
              hashedFiles: files,
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Diia getSigningDeeplink failed: ${response.status} ${body}`);
    }

    const data = await response.json() as { deeplink: string };
    logger.info('[Diia] Signing deeplink created', { branchId, offerId, fileCount: files.length });

    return { deeplink: data.deeplink, requestId, hashedRequestId };
  }

  /**
   * Initialize a full signing session.
   * Auto-discovers (or creates) branch and offer for hashedFilesSigning scope.
   * Uses DIIA_SIGN_BRANCH_ID / DIIA_SIGN_OFFER_ID env vars as cache.
   */
  async initSigningSession(
    returnUrl: string,
    files: DiiaSignFile[],
  ): Promise<DiiaDeeplinkResult> {
    let branchId = process.env.DIIA_SIGN_BRANCH_ID || '';
    let offerId = process.env.DIIA_SIGN_OFFER_ID || '';

    if (!branchId) {
      const branches = await this.getBranches();
      const signingBranch = branches.find(b =>
        b.scopes && typeof b.scopes === 'object' && 'diiaId' in b.scopes &&
        Array.isArray((b.scopes as any).diiaId) &&
        (b.scopes as any).diiaId.includes('hashedFilesSigning')
      );
      if (signingBranch) {
        branchId = signingBranch.id || signingBranch._id || '';
        this.updateBranch(branchId, this.getSigningBranchBody()).catch(() => {});
      } else {
        branchId = await this.createSigningBranch();
      }
      logger.info('[Diia] Using signing branch', { branchId });
    }

    if (!offerId) {
      const offers = await this.getOffers(branchId);
      if (offers.length > 0) {
        offerId = offers[0].id || offers[0]._id || '';
        this.updateOffer(branchId, offerId, {
          name: 'Підпис документів Lex / legal.org.ua',
          scopes: { diiaId: ['hashedFilesSigning'] },
        }).catch(() => {});
      } else {
        offerId = await this.createSigningOffer(branchId, returnUrl);
      }
      logger.info('[Diia] Using signing offer', { offerId });
    }

    return this.getSigningDeeplink(branchId, offerId, files);
  }

  /** Whether Diia is configured (acquirer token present). */
  isConfigured(): boolean {
    return Boolean(DIIA_ACQUIRER_TOKEN);
  }
}

// Singleton
let diiaServiceInstance: DiiaService | null = null;

export function getDiiaService(): DiiaService {
  if (!diiaServiceInstance) {
    diiaServiceInstance = new DiiaService();
  }
  return diiaServiceInstance;
}

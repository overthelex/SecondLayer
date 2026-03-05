/**
 * Diia Service
 * Integration with Ukrainian government's Diia Business API for user authentication.
 * Docs: https://api2t.diia.gov.ua (test) / https://api2.diia.gov.ua (prod)
 */

import { logger } from '../utils/logger.js';

const DIIA_BASE_URL = process.env.DIIA_BASE_URL || 'https://api2t.diia.gov.ua';
const DIIA_AUTH_ACQUIRER_TOKEN = process.env.DIIA_AUTH_ACQUIRER_TOKEN || '';

interface DiiaSessionResponse {
  token: string;
}

interface DiiaBranch {
  id: string;
  name: string;
  customFullName?: string;
  customAddress?: string;
  offerRequestType?: string;
}

interface DiiaOffer {
  id: string;
  name: string;
  returnLink?: string;
  shareAttributes?: string[];
}

interface DiiaAuthLink {
  deepLink: string;
  barcode: string;
  requestId: string;
}

export interface DiiaUserInfo {
  rnokpp?: string;    // IPN / tax number
  firstName?: string;
  lastName?: string;
  middleName?: string;
  email?: string;
  phoneNumber?: string;
  birthDate?: string;
}

export class DiiaService {
  private tokenCache: { token: string; expiresAt: number } | null = null;

  /**
   * Get Bearer token for Diia API using Basic auth (acquirer credentials).
   * Token is cached until close to expiry.
   */
  async getAcquirerToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.token;
    }

    if (!DIIA_AUTH_ACQUIRER_TOKEN) {
      throw new Error('DIIA_AUTH_ACQUIRER_TOKEN is not configured');
    }

    const response = await fetch(`${DIIA_BASE_URL}/api/v1/auth/acquirer/session`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${DIIA_AUTH_ACQUIRER_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Diia auth session failed: ${response.status} ${body}`);
    }

    const data = await response.json() as DiiaSessionResponse;

    // Cache for 23 hours (tokens typically valid 24h)
    this.tokenCache = {
      token: data.token,
      expiresAt: Date.now() + 23 * 60 * 60 * 1000,
    };

    logger.info('[Diia] Acquirer session token obtained');
    return data.token;
  }

  /**
   * Get list of configured branches for this acquirer.
   */
  async getBranches(): Promise<DiiaBranch[]> {
    const token = await this.getAcquirerToken();

    const response = await fetch(`${DIIA_BASE_URL}/api/v2/acquirer/branches`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Diia branches request failed: ${response.status} ${body}`);
    }

    const data = await response.json() as { branches: DiiaBranch[] };
    return data.branches || [];
  }

  /**
   * Get offers for a specific branch.
   */
  async getBranchOffers(branchId: string): Promise<DiiaOffer[]> {
    const token = await this.getAcquirerToken();

    const response = await fetch(`${DIIA_BASE_URL}/api/v1/acquirer/branch/${branchId}/offers`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Diia offers request failed: ${response.status} ${body}`);
    }

    const data = await response.json() as { offers: DiiaOffer[] };
    return data.offers || [];
  }

  /**
   * Create an auth sharing link (deeplink + QR barcode) for a given branch/offer.
   * The returnUrl is where Diia redirects after the user authenticates.
   */
  async createAuthLink(branchId: string, offerId: string, returnUrl: string): Promise<DiiaAuthLink> {
    const token = await this.getAcquirerToken();

    const response = await fetch(
      `${DIIA_BASE_URL}/api/v2/acquirer/branch/${branchId}/offer/${offerId}/sharing-link`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ returnLink: returnUrl }),
      }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Diia sharing link creation failed: ${response.status} ${body}`);
    }

    return await response.json() as DiiaAuthLink;
  }

  /**
   * Initialize a Diia auth session.
   * Discovers the first available branch and offer, then creates an auth deeplink.
   * Returns the deeplink, barcode, and requestId for tracking.
   */
  async initAuthSession(returnUrl: string): Promise<DiiaAuthLink & { branchId: string; offerId: string }> {
    const branches = await this.getBranches();

    if (!branches.length) {
      throw new Error('No Diia branches configured for this acquirer. Please set up a branch in the Diia Business Cabinet.');
    }

    const branch = branches[0];
    logger.info('[Diia] Using branch', { branchId: branch.id, name: branch.name });

    const offers = await this.getBranchOffers(branch.id);

    if (!offers.length) {
      throw new Error('No Diia offers configured for branch ' + branch.id);
    }

    const offer = offers[0];
    logger.info('[Diia] Using offer', { offerId: offer.id, name: offer.name });

    const link = await this.createAuthLink(branch.id, offer.id, returnUrl);

    return { ...link, branchId: branch.id, offerId: offer.id };
  }

  /**
   * Verify a Diia auth result by requestId.
   * Called after the user returns from the Diia app.
   */
  async getAuthResult(requestId: string): Promise<DiiaUserInfo | null> {
    const token = await this.getAcquirerToken();

    const response = await fetch(`${DIIA_BASE_URL}/api/v1/acquirer/document-request/${requestId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Diia auth result fetch failed: ${response.status} ${body}`);
    }

    return await response.json() as DiiaUserInfo;
  }

  /** Whether Diia is configured (tokens present). */
  isConfigured(): boolean {
    return Boolean(DIIA_AUTH_ACQUIRER_TOKEN);
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

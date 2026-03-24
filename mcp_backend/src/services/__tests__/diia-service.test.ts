/**
 * Unit tests for DiiaService.
 * Mocks fetch to test API integration without external calls.
 */

import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

jest.mock('../../utils/logger.js', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// Set env vars before importing
const ORIGINAL_ENV = process.env;
beforeAll(() => {
  process.env = {
    ...ORIGINAL_ENV,
    DIIA_ACQUIRER_TOKEN: 'test-acquirer-token',
    DIIA_AUTH_ACQUIRER_TOKEN: 'test-basic-auth',
    DIIA_BASE_URL: 'https://api2s.diia.gov.ua',
    DIIA_BRANCH_ID: '',
    DIIA_OFFER_ID: '',
    DIIA_SIGN_BRANCH_ID: '',
    DIIA_SIGN_OFFER_ID: '',
  };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

// Import after env setup (uses top-level constants from env)
// We need to re-import fresh each time due to singleton + cached env vars
let DiiaService: any;
let DiiaPermissionError: any;

beforeEach(async () => {
  jest.resetModules();
  mockFetch.mockReset();

  // Re-mock after resetModules
  jest.mock('../../utils/logger.js', () => ({
    logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  }));

  const mod = await import('../diia-service.js');
  DiiaService = mod.DiiaService;
  DiiaPermissionError = mod.DiiaPermissionError;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockOkJson(data: any) {
  return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) };
}

function mockError(status: number, body: string) {
  return { ok: false, status, json: async () => ({}), text: async () => body };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DiiaService', () => {
  describe('getSessionToken', () => {
    it('fetches session token from Diia API', async () => {
      mockFetch.mockResolvedValueOnce(mockOkJson({ token: 'bearer-abc-123' }));

      const service = new DiiaService();
      const token = await service.getSessionToken();

      expect(token).toBe('bearer-abc-123');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api2s.diia.gov.ua/api/v1/auth/acquirer/test-acquirer-token',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Basic test-basic-auth',
          }),
        }),
      );
    });

    it('caches token on second call', async () => {
      mockFetch.mockResolvedValueOnce(mockOkJson({ token: 'bearer-cached' }));

      const service = new DiiaService();
      await service.getSessionToken();
      const token2 = await service.getSessionToken();

      expect(token2).toBe('bearer-cached');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('throws on API error', async () => {
      mockFetch.mockResolvedValueOnce(mockError(401, 'Unauthorized'));

      const service = new DiiaService();
      await expect(service.getSessionToken()).rejects.toThrow('Diia session token failed: 401');
    });
  });

  describe('getBranches', () => {
    it('returns branch list from Diia API', async () => {
      const branches = [{ id: 'br-1', name: 'Test Branch' }];
      mockFetch
        .mockResolvedValueOnce(mockOkJson({ token: 'tk' })) // session token
        .mockResolvedValueOnce(mockOkJson({ branches }));

      const service = new DiiaService();
      const result = await service.getBranches();

      expect(result).toEqual(branches);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('returns empty array when no branches field', async () => {
      mockFetch
        .mockResolvedValueOnce(mockOkJson({ token: 'tk' }))
        .mockResolvedValueOnce(mockOkJson({}));

      const service = new DiiaService();
      const result = await service.getBranches();

      expect(result).toEqual([]);
    });
  });

  describe('createBranch', () => {
    it('creates a branch and returns its ID', async () => {
      mockFetch
        .mockResolvedValueOnce(mockOkJson({ token: 'tk' }))
        .mockResolvedValueOnce(mockOkJson({ _id: 'new-branch-id' }));

      const service = new DiiaService();
      const branchId = await service.createBranch();

      expect(branchId).toBe('new-branch-id');
    });

    it('throws DiiaPermissionError on 403 forbidden', async () => {
      mockFetch
        .mockResolvedValueOnce(mockOkJson({ token: 'tk' }))
        .mockResolvedValueOnce(mockError(403, 'forbidden: scope not active'));

      const service = new DiiaService();
      await expect(service.createBranch()).rejects.toThrow(DiiaPermissionError);
    });
  });

  describe('getAuthDeeplink', () => {
    it('returns deeplink, requestId, and hashedRequestId', async () => {
      mockFetch
        .mockResolvedValueOnce(mockOkJson({ token: 'tk' }))
        .mockResolvedValueOnce(mockOkJson({ deeplink: 'https://diia.app/dl/123' }));

      const service = new DiiaService();
      const result = await service.getAuthDeeplink('br-1', 'of-1');

      expect(result.deeplink).toBe('https://diia.app/dl/123');
      expect(result.requestId).toBeDefined();
      expect(result.hashedRequestId).toBeDefined();

      // Verify hash is SHA256(requestId) in base64
      const expectedHash = crypto.createHash('sha256').update(result.requestId).digest('base64');
      expect(result.hashedRequestId).toBe(expectedHash);
    });

    it('sends ECDSA signAlgo and hashed requestId', async () => {
      mockFetch
        .mockResolvedValueOnce(mockOkJson({ token: 'tk' }))
        .mockResolvedValueOnce(mockOkJson({ deeplink: 'https://diia.app/dl/456' }));

      const service = new DiiaService();
      await service.getAuthDeeplink('br-1', 'of-1');

      const [url, opts] = mockFetch.mock.calls[1];
      expect(url).toContain('/api/v2/acquirers/branch/br-1/offer-request/dynamic');
      const body = JSON.parse(opts.body);
      expect(body.signAlgo).toBe('ECDSA');
      expect(body.offerId).toBe('of-1');
    });
  });

  describe('initAuthSession', () => {
    it('auto-discovers branch and offer, returns deeplink', async () => {
      mockFetch
        // getSessionToken
        .mockResolvedValueOnce(mockOkJson({ token: 'tk' }))
        // getBranches
        .mockResolvedValueOnce(mockOkJson({
          branches: [{ id: 'br-found', name: 'Auth', scopes: { diiaId: ['auth'] } }],
        }))
        // updateBranch (fire-and-forget)
        .mockResolvedValueOnce(mockOkJson({}))
        // getOffers
        .mockResolvedValueOnce(mockOkJson({
          offers: [{ id: 'of-found', name: 'Авторизація в застосунку Lex' }],
        }))
        // getAuthDeeplink
        .mockResolvedValueOnce(mockOkJson({ deeplink: 'https://diia.app/dl/auto' }));

      const service = new DiiaService();
      const result = await service.initAuthSession('https://legal.org.ua/auth/callback');

      expect(result.deeplink).toBe('https://diia.app/dl/auto');
      expect(result.requestId).toBeDefined();
    });

    it('creates branch when none exist', async () => {
      mockFetch
        .mockResolvedValueOnce(mockOkJson({ token: 'tk' }))
        // getBranches: empty
        .mockResolvedValueOnce(mockOkJson({ branches: [] }))
        // createBranch
        .mockResolvedValueOnce(mockOkJson({ _id: 'new-br' }))
        // getOffers: empty
        .mockResolvedValueOnce(mockOkJson({ offers: [] }))
        // createOffer
        .mockResolvedValueOnce(mockOkJson({ _id: 'new-of' }))
        // getAuthDeeplink
        .mockResolvedValueOnce(mockOkJson({ deeplink: 'https://diia.app/dl/new' }));

      const service = new DiiaService();
      const result = await service.initAuthSession('https://legal.org.ua/callback');

      expect(result.deeplink).toBe('https://diia.app/dl/new');
    });
  });

  describe('initSigningSession', () => {
    const testFiles = [
      { fileName: 'contract.pdf', fileHash: 'abc123==' },
    ];

    it('auto-discovers signing branch and returns deeplink', async () => {
      mockFetch
        .mockResolvedValueOnce(mockOkJson({ token: 'tk' }))
        // getBranches
        .mockResolvedValueOnce(mockOkJson({
          branches: [{
            id: 'sign-br',
            name: 'Signing',
            scopes: { diiaId: ['hashedFilesSigning'] },
          }],
        }))
        // updateBranch
        .mockResolvedValueOnce(mockOkJson({}))
        // getOffers
        .mockResolvedValueOnce(mockOkJson({
          offers: [{ id: 'sign-of', name: 'Підпис документів' }],
        }))
        // updateOffer
        .mockResolvedValueOnce(mockOkJson({}))
        // getSigningDeeplink
        .mockResolvedValueOnce(mockOkJson({ deeplink: 'https://diia.app/sign/auto' }));

      const service = new DiiaService();
      const result = await service.initSigningSession('https://legal.org.ua/docs', testFiles);

      expect(result.deeplink).toBe('https://diia.app/sign/auto');
    });

    it('sends file hashes in deeplink request body', async () => {
      mockFetch
        .mockResolvedValueOnce(mockOkJson({ token: 'tk' }))
        .mockResolvedValueOnce(mockOkJson({ deeplink: 'https://diia.app/sign/test' }));

      const service = new DiiaService();
      await service.getSigningDeeplink('br-1', 'of-1', testFiles);

      const [, opts] = mockFetch.mock.calls[1];
      const body = JSON.parse(opts.body);
      expect(body.data.hashedFilesSigning.hashedFiles).toEqual(testFiles);
      expect(body.signAlgo).toBe('ECDSA');
    });
  });

  describe('isConfigured', () => {
    it('returns true when DIIA_ACQUIRER_TOKEN is set', () => {
      const service = new DiiaService();
      expect(service.isConfigured()).toBe(true);
    });
  });

  describe('DiiaPermissionError', () => {
    it('is an instance of Error with correct name', () => {
      const err = new DiiaPermissionError('scope not active');
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('DiiaPermissionError');
      expect(err.message).toBe('scope not active');
    });
  });
});

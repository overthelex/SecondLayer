/**
 * billing-services factory tests
 *
 * Verifies that createBillingServices() correctly instantiates and wires
 * billing-related services, selects real vs mock payment providers based on
 * env vars, and registers callbacks.
 */

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('../../services/cost-tracker.js', () => ({
  CostTracker: jest.fn().mockImplementation(() => ({
    setBillingService: jest.fn(),
    setMetricsCallback: jest.fn(),
    recordVoyageCall: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../services/billing-service.js', () => ({
  BillingService: jest.fn().mockImplementation(() => ({
    setCurrencyService: jest.fn(),
    setReferralRewardCallback: jest.fn(),
    setAuditService: jest.fn(),
    getEmailPreferences: jest.fn().mockResolvedValue({}),
  })),
}));

jest.mock('../../services/currency-service.js', () => ({
  CurrencyService: jest.fn().mockImplementation(() => ({
    refreshRate: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../services/pricing-service.js', () => ({
  PricingService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../services/subscription-service.js', () => ({
  SubscriptionService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../services/invoice-service.js', () => ({
  InvoiceService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../services/email-service.js', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    setPreferenceFetcher: jest.fn(),
    setReferralDataFetcher: jest.fn(),
  })),
}));

jest.mock('../../services/referral-service.js', () => ({
  ReferralService: jest.fn().mockImplementation(() => ({
    processReward: jest.fn(),
  })),
}));

jest.mock('../../services/api-key-service.js', () => ({
  ApiKeyService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../services/credit-service.js', () => ({
  CreditService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../services/b2b-invoice-service.js', () => ({
  B2BInvoiceService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../services/encryption-key-service.js', () => ({
  EncryptionKeyService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../services/monobank-service.js', () => ({
  MonobankService: jest.fn().mockImplementation(() => ({
    constructor: { name: 'MonobankService' },
    setAuditService: jest.fn(),
  })),
}));

jest.mock('../../services/metamask-service.js', () => ({
  MetaMaskService: jest.fn().mockImplementation(() => ({
    constructor: { name: 'MetaMaskService' },
  })),
}));

jest.mock('../../services/binance-pay-service.js', () => ({
  BinancePayService: jest.fn().mockImplementation(() => ({
    constructor: { name: 'BinancePayService' },
  })),
}));

jest.mock('../../services/nowpayments-service.js', () => ({
  NOWPaymentsService: jest.fn().mockImplementation(() => ({
    constructor: { name: 'NOWPaymentsService' },
  })),
}));

jest.mock('../../services/__mocks__/monobank-service-mock.js', () => ({
  MockMonobankService: jest.fn().mockImplementation(() => ({
    constructor: { name: 'MockMonobankService' },
    setAuditService: jest.fn(),
  })),
}));

jest.mock('../../services/__mocks__/metamask-service-mock.js', () => ({
  MockMetaMaskService: jest.fn().mockImplementation(() => ({
    constructor: { name: 'MockMetaMaskService' },
  })),
}));

jest.mock('../../services/__mocks__/binance-pay-service-mock.js', () => ({
  MockBinancePayService: jest.fn().mockImplementation(() => ({
    constructor: { name: 'MockBinancePayService' },
  })),
}));

jest.mock('../../services/__mocks__/nowpayments-service-mock.js', () => ({
  MockNOWPaymentsService: jest.fn().mockImplementation(() => ({
    constructor: { name: 'MockNOWPaymentsService' },
  })),
}));

jest.mock('../../services/user-preferences-service.js', () => ({
  UserPreferencesService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../services/prometheus-service.js', () => ({
  PrometheusService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../middleware/crypto-tag-required.js', () => ({
  initializeCryptoTagMiddleware: jest.fn(),
}));

jest.mock('../../controllers/auth.js', () => ({
  setAuthEmailService: jest.fn(),
  setAuthReferralService: jest.fn(),
  setAuthBillingService: jest.fn(),
  setAuthMinioService: jest.fn(),
  setAuthBannerService: jest.fn(),
}));

jest.mock('../../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('node-cron', () => ({
  schedule: jest.fn(),
  default: { schedule: jest.fn() },
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { createBillingServices } from '../billing-services.js';
import { CostTracker } from '../../services/cost-tracker.js';
import { BillingService } from '../../services/billing-service.js';
import { CurrencyService } from '../../services/currency-service.js';
import { PricingService } from '../../services/pricing-service.js';
import { SubscriptionService } from '../../services/subscription-service.js';
import { InvoiceService } from '../../services/invoice-service.js';
import { EmailService } from '../../services/email-service.js';
import { ReferralService } from '../../services/referral-service.js';
import { ApiKeyService } from '../../services/api-key-service.js';
import { CreditService } from '../../services/credit-service.js';
import { B2BInvoiceService } from '../../services/b2b-invoice-service.js';
import { EncryptionKeyService } from '../../services/encryption-key-service.js';
import { MonobankService } from '../../services/monobank-service.js';
import { MetaMaskService } from '../../services/metamask-service.js';
import { BinancePayService } from '../../services/binance-pay-service.js';
import { NOWPaymentsService } from '../../services/nowpayments-service.js';
import { MockMonobankService } from '../../services/__mocks__/monobank-service-mock.js';
import { MockMetaMaskService } from '../../services/__mocks__/metamask-service-mock.js';
import { MockBinancePayService } from '../../services/__mocks__/binance-pay-service-mock.js';
import { MockNOWPaymentsService } from '../../services/__mocks__/nowpayments-service-mock.js';
import { setAuthEmailService, setAuthReferralService, setAuthBillingService } from '../../controllers/auth.js';
import cron from 'node-cron';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeDb() {
  return {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    getPool: jest.fn(),
    setMetricsCollector: jest.fn(),
  } as any;
}

function makeEmbeddingService() {
  return {
    embed: jest.fn(),
    setTokenUsageCallback: jest.fn(),
  } as any;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createBillingServices', () => {
  let db: ReturnType<typeof makeDb>;
  let embeddingService: ReturnType<typeof makeEmbeddingService>;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.clearAllMocks();
    db = makeDb();
    embeddingService = makeEmbeddingService();
    // Clear payment-related env vars
    delete process.env.MOCK_PAYMENTS;
    delete process.env.MONOBANK_API_KEY;
    delete process.env.CRYPTO_RECEIVING_WALLET;
    delete process.env.ETHEREUM_RPC_URL;
    delete process.env.BINANCE_PAY_API_KEY;
    delete process.env.BINANCE_PAY_SECRET_KEY;
    delete process.env.NOWPAYMENTS_API_KEY;
    delete process.env.NOWPAYMENTS_IPN_SECRET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // ── return shape ──────────────────────────────────────────────────────────

  describe('return shape', () => {
    it('returns costTracker', () => {
      const s = createBillingServices(db, embeddingService);
      expect(s.costTracker).toBeDefined();
    });

    it('returns billingService', () => {
      const s = createBillingServices(db, embeddingService);
      expect(s.billingService).toBeDefined();
    });

    it('returns currencyService', () => {
      const s = createBillingServices(db, embeddingService);
      expect(s.currencyService).toBeDefined();
    });

    it('returns pricingService', () => {
      const s = createBillingServices(db, embeddingService);
      expect(s.pricingService).toBeDefined();
    });

    it('returns subscriptionService', () => {
      const s = createBillingServices(db, embeddingService);
      expect(s.subscriptionService).toBeDefined();
    });

    it('returns invoiceService', () => {
      const s = createBillingServices(db, embeddingService);
      expect(s.invoiceService).toBeDefined();
    });

    it('returns emailService', () => {
      const s = createBillingServices(db, embeddingService);
      expect(s.emailService).toBeDefined();
    });

    it('returns referralService', () => {
      const s = createBillingServices(db, embeddingService);
      expect(s.referralService).toBeDefined();
    });

    it('returns apiKeyService', () => {
      const s = createBillingServices(db, embeddingService);
      expect(s.apiKeyService).toBeDefined();
    });

    it('returns creditService', () => {
      const s = createBillingServices(db, embeddingService);
      expect(s.creditService).toBeDefined();
    });

    it('returns b2bInvoiceService', () => {
      const s = createBillingServices(db, embeddingService);
      expect(s.b2bInvoiceService).toBeDefined();
    });

    it('returns encryptionKeyService', () => {
      const s = createBillingServices(db, embeddingService);
      expect(s.encryptionKeyService).toBeDefined();
    });

    it('returns userPreferencesService', () => {
      const s = createBillingServices(db, embeddingService);
      expect(s.userPreferencesService).toBeDefined();
    });

    it('returns prometheusService', () => {
      const s = createBillingServices(db, embeddingService);
      expect(s.prometheusService).toBeDefined();
    });

    it('returns monobankService', () => {
      const s = createBillingServices(db, embeddingService);
      expect(s.monobankService).toBeDefined();
    });

    it('returns metamaskService', () => {
      const s = createBillingServices(db, embeddingService);
      expect(s.metamaskService).toBeDefined();
    });

    it('returns binancePayService', () => {
      const s = createBillingServices(db, embeddingService);
      expect(s.binancePayService).toBeDefined();
    });

    it('returns nowpaymentsService', () => {
      const s = createBillingServices(db, embeddingService);
      expect(s.nowpaymentsService).toBeDefined();
    });
  });

  // ── constructor call counts ───────────────────────────────────────────────

  describe('constructor invocations', () => {
    it('constructs CostTracker once', () => {
      createBillingServices(db, embeddingService);
      expect(CostTracker).toHaveBeenCalledTimes(1);
    });

    it('constructs BillingService once', () => {
      createBillingServices(db, embeddingService);
      expect(BillingService).toHaveBeenCalledTimes(1);
    });

    it('constructs CurrencyService once', () => {
      createBillingServices(db, embeddingService);
      expect(CurrencyService).toHaveBeenCalledTimes(1);
    });

    it('constructs PricingService once', () => {
      createBillingServices(db, embeddingService);
      expect(PricingService).toHaveBeenCalledTimes(1);
    });

    it('constructs SubscriptionService once', () => {
      createBillingServices(db, embeddingService);
      expect(SubscriptionService).toHaveBeenCalledTimes(1);
    });

    it('constructs InvoiceService once', () => {
      createBillingServices(db, embeddingService);
      expect(InvoiceService).toHaveBeenCalledTimes(1);
    });

    it('constructs EmailService once', () => {
      createBillingServices(db, embeddingService);
      expect(EmailService).toHaveBeenCalledTimes(1);
    });

    it('constructs ReferralService once', () => {
      createBillingServices(db, embeddingService);
      expect(ReferralService).toHaveBeenCalledTimes(1);
    });

    it('constructs ApiKeyService once', () => {
      createBillingServices(db, embeddingService);
      expect(ApiKeyService).toHaveBeenCalledTimes(1);
    });

    it('constructs CreditService once', () => {
      createBillingServices(db, embeddingService);
      expect(CreditService).toHaveBeenCalledTimes(1);
    });

    it('constructs B2BInvoiceService once', () => {
      createBillingServices(db, embeddingService);
      expect(B2BInvoiceService).toHaveBeenCalledTimes(1);
    });

    it('constructs EncryptionKeyService once', () => {
      createBillingServices(db, embeddingService);
      expect(EncryptionKeyService).toHaveBeenCalledTimes(1);
    });
  });

  // ── billing wiring ────────────────────────────────────────────────────────

  describe('billing service wiring', () => {
    it('wires currencyService into billingService via setCurrencyService', () => {
      const s = createBillingServices(db, embeddingService);
      expect((s.billingService as any).setCurrencyService).toHaveBeenCalledWith(s.currencyService);
    });

    it('wires billingService into costTracker via setBillingService', () => {
      const s = createBillingServices(db, embeddingService);
      expect((s.costTracker as any).setBillingService).toHaveBeenCalledWith(s.billingService);
    });

    it('calls setReferralRewardCallback on billingService', () => {
      const s = createBillingServices(db, embeddingService);
      expect((s.billingService as any).setReferralRewardCallback).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

    it('registers token usage callback on embeddingService', () => {
      createBillingServices(db, embeddingService);
      expect(embeddingService.setTokenUsageCallback).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  // ── auth controller wiring ────────────────────────────────────────────────

  describe('auth controller wiring', () => {
    it('calls setAuthReferralService with the referral service', () => {
      const s = createBillingServices(db, embeddingService);
      expect(setAuthReferralService).toHaveBeenCalledWith(s.referralService);
    });

    it('calls setAuthBillingService with the billing service', () => {
      const s = createBillingServices(db, embeddingService);
      expect(setAuthBillingService).toHaveBeenCalledWith(s.billingService);
    });

    it('calls setAuthEmailService with the email service', () => {
      const s = createBillingServices(db, embeddingService);
      expect(setAuthEmailService).toHaveBeenCalledWith(s.emailService);
    });
  });

  // ── email service callbacks ───────────────────────────────────────────────

  describe('email service callback registration', () => {
    it('calls setPreferenceFetcher on emailService', () => {
      const s = createBillingServices(db, embeddingService);
      expect((s.emailService as any).setPreferenceFetcher).toHaveBeenCalledWith(expect.any(Function));
    });

    it('calls setReferralDataFetcher on emailService', () => {
      const s = createBillingServices(db, embeddingService);
      expect((s.emailService as any).setReferralDataFetcher).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  // ── NBU rate refresh cron ─────────────────────────────────────────────────

  describe('currency rate scheduling', () => {
    it('refreshes the NBU rate on startup', () => {
      const s = createBillingServices(db, embeddingService);
      expect((s.currencyService as any).refreshRate).toHaveBeenCalled();
    });

    it('schedules a daily cron job for NBU rate refresh', () => {
      createBillingServices(db, embeddingService);
      expect(cron.schedule).toHaveBeenCalledWith(
        '0 6 * * *',
        expect.any(Function),
        expect.objectContaining({ timezone: 'Europe/Kyiv' })
      );
    });
  });

  // ── MOCK_PAYMENTS=true selects mock providers ─────────────────────────────

  describe('payment provider selection — MOCK_PAYMENTS=true', () => {
    beforeEach(() => {
      process.env.MOCK_PAYMENTS = 'true';
    });

    it('uses MockMonobankService', () => {
      const s = createBillingServices(db, embeddingService);
      expect(MockMonobankService).toHaveBeenCalledTimes(1);
      expect(MonobankService).not.toHaveBeenCalled();
      expect(s.monobankService).toBeDefined();
    });

    it('uses MockMetaMaskService', () => {
      const s = createBillingServices(db, embeddingService);
      expect(MockMetaMaskService).toHaveBeenCalledTimes(1);
      expect(MetaMaskService).not.toHaveBeenCalled();
      expect(s.metamaskService).toBeDefined();
    });

    it('uses MockBinancePayService', () => {
      const s = createBillingServices(db, embeddingService);
      expect(MockBinancePayService).toHaveBeenCalledTimes(1);
      expect(BinancePayService).not.toHaveBeenCalled();
      expect(s.binancePayService).toBeDefined();
    });

    it('uses MockNOWPaymentsService', () => {
      const s = createBillingServices(db, embeddingService);
      expect(MockNOWPaymentsService).toHaveBeenCalledTimes(1);
      expect(NOWPaymentsService).not.toHaveBeenCalled();
      expect(s.nowpaymentsService).toBeDefined();
    });
  });

  // ── Real payment providers when keys are set ──────────────────────────────

  describe('payment provider selection — real providers with env vars', () => {
    beforeEach(() => {
      delete process.env.MOCK_PAYMENTS;
      process.env.MONOBANK_API_KEY = 'mono-test-key';
      process.env.CRYPTO_RECEIVING_WALLET = '0xABC';
      process.env.ETHEREUM_RPC_URL = 'https://eth-rpc.example.com';
      process.env.BINANCE_PAY_API_KEY = 'bp-api-key';
      process.env.BINANCE_PAY_SECRET_KEY = 'bp-secret';
      process.env.NOWPAYMENTS_API_KEY = 'now-api-key';
      process.env.NOWPAYMENTS_IPN_SECRET = 'now-ipn-secret';
    });

    it('uses real MonobankService when MONOBANK_API_KEY is set', () => {
      createBillingServices(db, embeddingService);
      expect(MonobankService).toHaveBeenCalledTimes(1);
      expect(MockMonobankService).not.toHaveBeenCalled();
    });

    it('uses real MetaMaskService when wallet and RPC are set', () => {
      createBillingServices(db, embeddingService);
      expect(MetaMaskService).toHaveBeenCalledTimes(1);
      expect(MockMetaMaskService).not.toHaveBeenCalled();
    });

    it('uses real BinancePayService when Binance keys are set', () => {
      createBillingServices(db, embeddingService);
      expect(BinancePayService).toHaveBeenCalledTimes(1);
      expect(MockBinancePayService).not.toHaveBeenCalled();
    });

    it('uses real NOWPaymentsService when NOWPayments keys are set', () => {
      createBillingServices(db, embeddingService);
      expect(NOWPaymentsService).toHaveBeenCalledTimes(1);
      expect(MockNOWPaymentsService).not.toHaveBeenCalled();
    });
  });

  // ── Mock fallback when crypto keys are absent ─────────────────────────────

  describe('payment provider selection — mock fallback without crypto keys', () => {
    beforeEach(() => {
      delete process.env.MOCK_PAYMENTS;
      process.env.MONOBANK_API_KEY = 'mono-test-key';
      // No crypto / Binance / NOWPayments keys
    });

    it('falls back to MockMetaMaskService when no crypto wallet set', () => {
      createBillingServices(db, embeddingService);
      expect(MockMetaMaskService).toHaveBeenCalledTimes(1);
      expect(MetaMaskService).not.toHaveBeenCalled();
    });

    it('falls back to MockBinancePayService when no Binance keys', () => {
      createBillingServices(db, embeddingService);
      expect(MockBinancePayService).toHaveBeenCalledTimes(1);
      expect(BinancePayService).not.toHaveBeenCalled();
    });

    it('falls back to MockNOWPaymentsService when no NOWPayments keys', () => {
      createBillingServices(db, embeddingService);
      expect(MockNOWPaymentsService).toHaveBeenCalledTimes(1);
      expect(NOWPaymentsService).not.toHaveBeenCalled();
    });
  });
});

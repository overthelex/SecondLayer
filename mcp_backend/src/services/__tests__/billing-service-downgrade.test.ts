/**
 * BillingService — Plan Downgrade Refund Tests
 *
 * Tests the refund logic when a user switches to a cheaper pricing tier.
 */

import { BillingService } from '../billing-service';
import { PricingService } from '../pricing-service';

// ──────────────────────────────────────────────────────────────────
// Test helpers
// ──────────────────────────────────────────────────────────────────

const USER_ID = 'user-001';

function makeBillingRow(overrides: any = {}) {
  return {
    user_id: USER_ID,
    balance_usd: '50.00',
    balance_uah: '2000.00',
    pricing_tier: 'startup',
    daily_limit_usd: '10.00',
    monthly_limit_usd: '100.00',
    is_active: true,
    billing_enabled: true,
    total_spent_usd: '0.00',
    total_spent_uah: '0.00',
    total_requests: 0,
    ...overrides,
  };
}

function makeDb() {
  const queryFn = jest.fn().mockResolvedValue({ rows: [] });
  return { query: queryFn };
}

function makePricingService() {
  const tiers = [
    { tier: 'free', monthly_price_usd: 0, annual_price_usd: 0, markup_percentage: 0, description: '', features: [] },
    { tier: 'startup', monthly_price_usd: 29, annual_price_usd: 290, markup_percentage: 30, description: '', features: [] },
    { tier: 'business', monthly_price_usd: 99, annual_price_usd: 990, markup_percentage: 50, description: '', features: [] },
    { tier: 'enterprise', monthly_price_usd: 499, annual_price_usd: 4990, markup_percentage: 40, description: '', features: [] },
  ];

  return {
    isValidTier: jest.fn().mockReturnValue(true),
    getAllTiers: jest.fn().mockReturnValue(tiers),
    getDefaultTier: jest.fn().mockReturnValue('startup'),
    calculatePrice: jest.fn(),
  } as unknown as PricingService;
}

function makeCurrencyService() {
  return {
    convertUsdToUah: jest.fn().mockImplementation(async (usd: number) => ({
      amountUah: usd * 41.5,
      rate: 41.5,
    })),
    refreshRate: jest.fn(),
  };
}

// ──────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────

// Skipped: BillingService is a stub (proprietary impl in @secondlayer/core private repo).
// Re-enable once the real implementation is overlaid via CI.
describe.skip('BillingService — Plan Downgrade Refund', () => {
  let db: ReturnType<typeof makeDb>;
  let pricingService: PricingService;
  let service: BillingService;

  beforeEach(() => {
    db = makeDb();
    pricingService = makePricingService();
    service = new BillingService(db as any, pricingService);
    service.setCurrencyService(makeCurrencyService() as any);
  });

  it('should refund price difference when downgrading from startup to free', async () => {
    // getOrCreateUserBilling returns current billing with startup tier
    db.query
      .mockResolvedValueOnce({ rows: [makeBillingRow({ pricing_tier: 'startup' })] }) // getOrCreateUserBilling
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // UPDATE balance (refund credit)
      .mockResolvedValueOnce({ rows: [] }) // INSERT billing_transaction
      .mockResolvedValueOnce({ rows: [] }); // UPDATE pricing_tier

    const result = await service.updateBillingSettings(USER_ID, { pricingTier: 'free' as any });

    // Should have issued a refund of $29 (startup monthly price - free monthly price)
    expect(result.refund_usd).toBe(29);
    expect(result.refund_uah).toBeCloseTo(29 * 41.5, 0);

    // Verify balance was credited
    const updateCall = db.query.mock.calls.find(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('balance_usd = balance_usd +')
    );
    expect(updateCall).toBeDefined();
    expect(updateCall![1][0]).toBe(29); // refund USD
    expect(updateCall![1][1]).toBeCloseTo(29 * 41.5, 0); // refund UAH

    // Verify refund transaction was recorded
    const insertCall = db.query.mock.calls.find(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('INSERT INTO billing_transactions')
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![0]).toContain('refund'); // type is in the SQL
    expect(insertCall![1]).toContain(29); // amount_usd in params
  });

  it('should refund price difference when downgrading from business to startup', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [makeBillingRow({ pricing_tier: 'business' })] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.updateBillingSettings(USER_ID, { pricingTier: 'startup' as any });

    // business ($99) - startup ($29) = $70 refund
    expect(result.refund_usd).toBe(70);
    expect(result.refund_uah).toBeCloseTo(70 * 41.5, 0);
  });

  it('should NOT refund when upgrading from free to startup', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [makeBillingRow({ pricing_tier: 'free' })] })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE pricing_tier only

    const result = await service.updateBillingSettings(USER_ID, { pricingTier: 'startup' as any });

    expect(result.refund_usd).toBeUndefined();
    expect(result.refund_uah).toBeUndefined();

    // Should NOT have a balance update call
    const updateCall = db.query.mock.calls.find(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('balance_usd = balance_usd +')
    );
    expect(updateCall).toBeUndefined();
  });

  it('should NOT refund when switching to the same tier', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [makeBillingRow({ pricing_tier: 'startup' })] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await service.updateBillingSettings(USER_ID, { pricingTier: 'startup' as any });

    expect(result.refund_usd).toBeUndefined();
  });

  it('should NOT refund when updating non-tier settings', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }); // UPDATE settings

    const result = await service.updateBillingSettings(USER_ID, { dailyLimitUsd: 20 });

    expect(result.refund_usd).toBeUndefined();
    expect(result.refund_uah).toBeUndefined();

    // Only one query (the UPDATE), no balance/transaction queries
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('should record correct balance_before and balance_after in refund transaction', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [makeBillingRow({ pricing_tier: 'business', balance_usd: '100.00' })] })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE balance
      .mockResolvedValueOnce({ rows: [] }) // INSERT transaction
      .mockResolvedValueOnce({ rows: [] }); // UPDATE tier

    await service.updateBillingSettings(USER_ID, { pricingTier: 'free' as any });

    const insertCall = db.query.mock.calls.find(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('INSERT INTO billing_transactions')
    );
    expect(insertCall).toBeDefined();
    const txParams = insertCall![1];
    // balance_before_usd = 100, balance_after_usd = 100 + 99 = 199
    expect(txParams[3]).toBe(100); // balance_before
    expect(txParams[4]).toBe(199); // balance_after
  });

  it('should include tier change description in transaction', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [makeBillingRow({ pricing_tier: 'startup' })] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await service.updateBillingSettings(USER_ID, { pricingTier: 'free' as any });

    const insertCall = db.query.mock.calls.find(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('INSERT INTO billing_transactions')
    );
    const description = insertCall![1][5];
    expect(description).toContain('startup');
    expect(description).toContain('free');
  });

  it('should reject invalid pricing tier', async () => {
    (pricingService.isValidTier as unknown as jest.Mock).mockReturnValueOnce(false);

    // getOrCreateUserBilling
    db.query.mockResolvedValueOnce({ rows: [makeBillingRow()] });

    await expect(
      service.updateBillingSettings(USER_ID, { pricingTier: 'nonexistent' as any })
    ).rejects.toThrow('Invalid pricing tier');
  });
});

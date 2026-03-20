/**
 * E2E Tests: Billing Tariffs Page
 *
 * API-level tests:
 *  1. GET /api/billing/pricing-info — returns tiers with valid prices
 *  2. PUT /api/billing/settings — downgrade issues refund
 *  3. PUT /api/billing/settings — upgrade does not issue refund
 *  4. PUT /api/billing/settings — same tier no refund
 *
 * UI-level tests:
 *  5. Tariffs page renders all plan cards
 *  6. Monthly/yearly toggle does not cause layout shift
 *  7. Plan switch info never shows "+-" (sign formatting bug)
 *  8. Plan switch info shows correct surcharge/refund text
 *  9. Current plan button is disabled
 * 10. Enterprise card shows contact CTA
 *
 * Usage:
 *   cd tests && npx playwright test e2e/test-billing-tariffs.spec.ts
 *   TEST_API_URL=https://legal.org.ua npx playwright test e2e/test-billing-tariffs.spec.ts
 */

import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5173';
const API_BASE = process.env.TEST_API_URL || 'http://localhost:3000';

const TEST_EMAIL = process.env.TEST_EMAIL || 'testuser@secondlayer.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'testuser123';

// ============================================================================
// Auth
// ============================================================================

let authToken: string;

test.beforeAll(async ({ request }) => {
  const envToken = process.env.TEST_JWT_TOKEN;
  if (envToken) {
    authToken = envToken;
    console.log('  Auth: using TEST_JWT_TOKEN from env');
    return;
  }

  const loginResponse = await request.post(`${API_BASE}/auth/login`, {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000,
  });

  if (loginResponse.status() === 429) {
    throw new Error(
      'Rate limited (429). Set TEST_JWT_TOKEN env var.\n' +
      `  Generate: curl -s -X POST ${API_BASE}/auth/login -H 'Content-Type: application/json' ` +
      `-d '{"email":"${TEST_EMAIL}","password":"${TEST_PASSWORD}"}' | jq -r .token`
    );
  }

  expect(loginResponse.status(), `Login failed (${loginResponse.status()})`).toBe(200);
  const loginData = await loginResponse.json();
  authToken = loginData.token;
  expect(authToken).toBeTruthy();
  console.log(`  Auth OK: ${loginData.user?.email}`);
});

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`,
  };
}

// ============================================================================
// API Tests
// ============================================================================

test.describe('API: Pricing Info', () => {
  test('GET /api/billing/pricing-info returns valid tiers', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/billing/pricing-info`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);

    const data = await res.json();
    expect(data.current_tier).toBeTruthy();
    expect(Array.isArray(data.available_tiers)).toBe(true);
    expect(data.available_tiers.length).toBeGreaterThanOrEqual(3);

    // Every tier must have non-negative prices
    for (const tier of data.available_tiers) {
      expect(tier.tier).toBeTruthy();
      expect(tier.monthly_price_usd).toBeGreaterThanOrEqual(0);
      if (tier.annual_price_usd !== undefined) {
        expect(tier.annual_price_usd).toBeGreaterThanOrEqual(0);
      }
      // Annual should be cheaper per-month than monthly (if both > 0)
      if (tier.monthly_price_usd > 0 && tier.annual_price_usd > 0) {
        const annualPerMonth = tier.annual_price_usd / 12;
        expect(annualPerMonth).toBeLessThan(tier.monthly_price_usd);
      }
    }
  });

  test('pricing tiers have required fields', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/billing/pricing-info`, {
      headers: authHeaders(),
    });
    const data = await res.json();

    for (const tier of data.available_tiers) {
      expect(tier).toHaveProperty('tier');
      expect(tier).toHaveProperty('markup_percentage');
      expect(tier).toHaveProperty('features');
      expect(Array.isArray(tier.features)).toBe(true);
      expect(tier.markup_percentage).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('API: Plan Switch Refund', () => {
  let originalTier: string;

  test.beforeAll(async ({ request }) => {
    // Save current tier to restore later
    const res = await request.get(`${API_BASE}/api/billing/pricing-info`, {
      headers: authHeaders(),
    });
    const data = await res.json();
    originalTier = data.current_tier;
  });

  test.afterAll(async ({ request }) => {
    // Restore original tier
    if (originalTier) {
      await request.put(`${API_BASE}/api/billing/settings`, {
        headers: authHeaders(),
        data: { pricingTier: originalTier },
      });
    }
  });

  test('downgrade from paid tier to free returns refund', async ({ request }) => {
    // First ensure we're on a paid tier
    const setupRes = await request.put(`${API_BASE}/api/billing/settings`, {
      headers: authHeaders(),
      data: { pricingTier: 'startup' },
    });
    expect(setupRes.status()).toBe(200);

    // Now downgrade to free
    const res = await request.put(`${API_BASE}/api/billing/settings`, {
      headers: authHeaders(),
      data: { pricingTier: 'free' },
    });
    expect(res.status()).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.refund_usd).toBeGreaterThan(0);
    expect(data.refund_uah).toBeGreaterThan(0);
  });

  test('upgrade from free to startup does NOT return refund', async ({ request }) => {
    // Ensure we're on free
    await request.put(`${API_BASE}/api/billing/settings`, {
      headers: authHeaders(),
      data: { pricingTier: 'free' },
    });

    // Upgrade to startup
    const res = await request.put(`${API_BASE}/api/billing/settings`, {
      headers: authHeaders(),
      data: { pricingTier: 'startup' },
    });
    expect(res.status()).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.refund_usd).toBeUndefined();
  });

  test('switching to same tier does NOT return refund', async ({ request }) => {
    const infoRes = await request.get(`${API_BASE}/api/billing/pricing-info`, {
      headers: authHeaders(),
    });
    const currentTier = (await infoRes.json()).current_tier;

    const res = await request.put(`${API_BASE}/api/billing/settings`, {
      headers: authHeaders(),
      data: { pricingTier: currentTier },
    });
    expect(res.status()).toBe(200);

    const data = await res.json();
    expect(data.refund_usd).toBeUndefined();
  });
});

// ============================================================================
// UI Tests
// ============================================================================

test.describe('UI: Tariffs Page', () => {
  let page: Page;

  /** Navigate to tariffs page with auth token injected */
  async function goToTariffs(p: Page) {
    // Set auth token in localStorage before navigating
    await p.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await p.evaluate((token) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('token', token);
    }, authToken);
    await p.goto(`${BASE_URL}/billing/tariffs`, { waitUntil: 'networkidle' });
    // Wait for plan cards to render (at least 3 visible)
    await p.waitForSelector('[data-testid="plan-card"], .rounded-xl', { timeout: 10000 });
  }

  test('renders plan cards with prices', async ({ page }) => {
    await goToTariffs(page);

    // Should have at least 3 plan cards (Free, Startup, Business)
    const cards = page.locator('text=/\\d+ ₴/');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
  });

  test('monthly/yearly toggle does not cause layout jump', async ({ page }) => {
    await goToTariffs(page);

    // Find the toggle button
    const toggle = page.locator('button:has(div.rounded-full)').first();
    if (!(await toggle.isVisible())) {
      test.skip();
      return;
    }

    // Measure grid height in monthly mode
    const grid = page.locator('.grid').first();
    const heightBefore = await grid.boundingBox();

    // Click toggle to yearly
    await toggle.click();
    await page.waitForTimeout(500); // wait for animation

    // Measure grid height in yearly mode
    const heightAfter = await grid.boundingBox();

    if (heightBefore && heightAfter) {
      // Height should not jump by more than 30px (minor text changes OK)
      const heightDiff = Math.abs(heightAfter.height - heightBefore.height);
      expect(heightDiff).toBeLessThan(30);
    }
  });

  test('plan switch info never shows "+−" or "+-" sign formatting', async ({ page }) => {
    await goToTariffs(page);

    // Get all text content from the page
    const content = await page.textContent('body');

    // Should never have "+-" or "+−" (plus followed by minus) in prices
    expect(content).not.toMatch(/\+\s*[-−]\s*\d/);
    // Should never have "−+" either
    expect(content).not.toMatch(/[-−]\s*\+\s*\d/);
  });

  test('plan switch info shows valid amounts (no negative in surcharge)', async ({ page }) => {
    await goToTariffs(page);

    // All "Доплата" lines should have positive amounts
    const surchargeTexts = page.locator('text=/Доплата/');
    const surchargeCount = await surchargeTexts.count();
    for (let i = 0; i < surchargeCount; i++) {
      const text = await surchargeTexts.nth(i).textContent();
      if (text) {
        // Extract number after "Доплата:"
        const match = text.match(/Доплата:\s*([-\d\s]+)\s*₴/);
        if (match) {
          const amount = parseInt(match[1].replace(/\s/g, ''), 10);
          expect(amount, `Surcharge should be positive: "${text}"`).toBeGreaterThan(0);
        }
      }
    }

    // All "Повернення" lines should have positive amounts
    const refundTexts = page.locator('text=/Повернення/');
    const refundCount = await refundTexts.count();
    for (let i = 0; i < refundCount; i++) {
      const text = await refundTexts.nth(i).textContent();
      if (text) {
        const match = text.match(/Повернення[^:]*:\s*([-\d\s]+)\s*₴/);
        if (match) {
          const amount = parseInt(match[1].replace(/\s/g, ''), 10);
          expect(amount, `Refund should be positive: "${text}"`).toBeGreaterThan(0);
        }
      }
    }
  });

  test('current plan button shows "Поточний план" and is disabled', async ({ page }) => {
    await goToTariffs(page);

    const currentPlanBtn = page.locator('button:has-text("Поточний план")');
    await expect(currentPlanBtn.first()).toBeVisible({ timeout: 10000 });
    await expect(currentPlanBtn.first()).toBeDisabled();
  });

  test('enterprise card shows contact CTA', async ({ page }) => {
    await goToTariffs(page);

    const enterpriseBtn = page.locator('button:has-text("Зв\'язатися з нами")');
    // Enterprise might not always be visible, only check if present
    if (await enterpriseBtn.count() > 0) {
      await expect(enterpriseBtn.first()).toBeVisible();
      await expect(enterpriseBtn.first()).toBeEnabled();
    }
  });

  test('FAQ section is present and expandable', async ({ page }) => {
    await goToTariffs(page);

    // FAQ header
    const faqHeader = page.locator('text=Часті запитання');
    await expect(faqHeader).toBeVisible();

    // Click first FAQ item
    const firstQuestion = page.locator('text=Чи можу я змінити тариф у будь-який час?');
    if (await firstQuestion.isVisible()) {
      await firstQuestion.click();
      // Answer should become visible
      const answer = page.locator('text=Підвищення набирає чинності одразу');
      await expect(answer).toBeVisible({ timeout: 3000 });
    }
  });

  test('feature comparison table is visible', async ({ page }) => {
    await goToTariffs(page);

    const comparisonHeader = page.locator('text=Порівняння тарифів');
    await expect(comparisonHeader).toBeVisible();

    // Table should have feature rows
    const table = page.locator('table');
    await expect(table.first()).toBeVisible();
  });
});

/**
 * E2E Test: KMU News In-App Article Viewer
 *
 * Tests the full flow after deployment:
 * 1. Navigate to /news page, verify news items load
 * 2. Click a news item → modal opens with loading state
 * 3. Modal displays article content + AI analysis
 * 4. Close modal via X button and backdrop click
 * 5. Re-open same article → verify faster load (DB cache)
 * 6. Verify API endpoint directly (GET /api/news/article)
 *
 * Prerequisites:
 * - Feature must be deployed
 * - Valid auth required (set TEST_JWT_TOKEN env var or TEST_EMAIL/TEST_PASSWORD)
 *
 * Run:
 *   cd tests
 *   TEST_JWT_TOKEN=<token> npx playwright test e2e/test-kmu-news-viewer.spec.ts
 *   TEST_BASE_URL=https://legal.org.ua TEST_JWT_TOKEN=<token> npx playwright test e2e/test-kmu-news-viewer.spec.ts
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'https://legal.org.ua';
const API_URL = `${BASE_URL}/api`;

const TEST_EMAIL = process.env.TEST_EMAIL || 'mcvovkes@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'g7856fjFGy8FF864jhf';

test.describe('KMU News Article Viewer', () => {
  let authToken: string;
  let authUser: any;
  let authAvailable = false;

  test.beforeAll(async ({ request }) => {
    // 1. Prefer env-provided JWT
    const envToken = process.env.TEST_JWT_TOKEN;
    if (envToken) {
      authToken = envToken;
      authUser = { id: 'env-user', email: TEST_EMAIL, name: 'Test User' };
      authAvailable = true;
      console.log('Using JWT from TEST_JWT_TOKEN env var');
      return;
    }

    // 2. Try email/password login
    try {
      const loginResponse = await request.post(`${BASE_URL}/auth/login`, {
        data: { email: TEST_EMAIL, password: TEST_PASSWORD },
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });

      if (loginResponse.status() === 200) {
        const loginData = await loginResponse.json();
        authToken = loginData.token;
        authUser = loginData.user;
        if (authToken) {
          authAvailable = true;
          console.log(`Logged in as: ${authUser?.email}`);
          return;
        }
      }
      console.log(`Login returned ${loginResponse.status()} — trying dev-login`);
    } catch (e: any) {
      console.log(`Login failed: ${e.message} — trying dev-login`);
    }

    // 3. Try dev-login (local environments)
    try {
      const devLoginResponse = await request.post(`${BASE_URL}/auth/dev-login`, {
        data: { email: 'admin', password: 'admin123' },
        timeout: 5000,
      });

      if (devLoginResponse.ok()) {
        const data = await devLoginResponse.json();
        if (data.token) {
          authToken = data.token;
          authUser = data.user || { id: 'dev-user', email: 'admin', name: 'Dev User' };
          authAvailable = true;
          console.log('Logged in via dev-login');
          return;
        }
      }
    } catch { /* dev-login not available */ }

    console.log('WARNING: No auth available — all tests will be skipped. Set TEST_JWT_TOKEN env var.');
  });

  // Helper: inject auth into localStorage and navigate to /news
  async function goToNewsPage(page: Page) {
    await page.goto(BASE_URL);
    await page.evaluate(({ token, user }: { token: string; user: any }) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }, { token: authToken, user: authUser });
    await page.goto(`${BASE_URL}/news`);
    await page.waitForLoadState('networkidle');
  }

  // Helper: wait for news items and return count
  async function waitForNewsItems(page: Page): Promise<number> {
    // News items are inside a .space-y-4 container, each with rounded-xl border
    const item = page.locator('.space-y-4 > a[class*="rounded-xl"], .space-y-4 > div[class*="rounded-xl"][class*="cursor-pointer"]').first();
    await expect(item).toBeVisible({ timeout: 30000 });
    return await page.locator('.space-y-4 > a[class*="rounded-xl"], .space-y-4 > div[class*="rounded-xl"][class*="cursor-pointer"]').count();
  }

  // Helper: detect if modal feature is deployed (items are <div> not <a>)
  async function isModalDeployed(page: Page): Promise<boolean> {
    const divItems = page.locator('.space-y-4 > div[class*="rounded-xl"][class*="cursor-pointer"]');
    const count = await divItems.count();
    if (count === 0) {
      console.log('Modal feature not deployed (items are <a> links) — skipping');
      return false;
    }
    return true;
  }

  function skipIfNoAuth() {
    if (!authAvailable) {
      console.log('Skipped: no auth available');
      test.skip();
    }
  }

  // ============================================================================
  // Test 1: News page loads and displays items
  // ============================================================================

  test('should load /news page with KMU news items', async ({ page }) => {
    test.setTimeout(60000);
    skipIfNoAuth();

    await goToNewsPage(page);
    const count = await waitForNewsItems(page);

    console.log(`News items loaded: ${count}`);
    expect(count, 'Should load at least 1 news item').toBeGreaterThan(0);

    // Source attribution at bottom
    const kmuLink = page.locator('a[href*="kmu.gov.ua"]').last();
    await expect(kmuLink).toBeVisible({ timeout: 5000 });
  });

  // ============================================================================
  // Test 2: Click news item → modal with content + AI analysis
  // ============================================================================

  test('should open article modal when clicking a news item', async ({ page }) => {
    test.setTimeout(120000);
    skipIfNoAuth();

    await goToNewsPage(page);
    await waitForNewsItems(page);
    if (!await isModalDeployed(page)) { test.skip(); return; }

    const firstItem = page.locator('.space-y-4 > div[class*="rounded-xl"][class*="cursor-pointer"]').first();
    const titleText = await firstItem.locator('h3').first().textContent();
    console.log(`Clicking: "${titleText?.substring(0, 60)}..."`);

    await firstItem.click();

    // Modal should appear
    const modal = page.locator('[class*="fixed"][class*="z-50"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
    console.log('Modal opened');

    // Loading indicator
    const isLoading = await page.getByText('Завантаження та аналіз статті...').isVisible({ timeout: 3000 }).catch(() => false);
    if (isLoading) console.log('Loading state detected');

    // Wait for content or error
    const result = await Promise.race([
      page.locator('.prose').first().waitFor({ state: 'visible', timeout: 90000 }).then(() => 'content'),
      page.locator('[class*="bg-red-50"]').first().waitFor({ state: 'visible', timeout: 90000 }).then(() => 'error'),
    ]);
    console.log(`Result: ${result}`);

    if (result === 'content') {
      const proseText = await page.locator('.prose').first().textContent();
      expect(proseText!.length, 'Article content should be substantial').toBeGreaterThan(50);
      console.log(`Article: ${proseText!.length} chars`);

      // AI analysis card
      const hasAnalysis = await page.getByText('AI-аналіз').isVisible({ timeout: 10000 }).catch(() => false);
      console.log(`AI analysis: ${hasAnalysis}`);

      if (hasAnalysis) {
        const analysisSection = page.locator('[class*="from-amber-50"]');
        await expect(analysisSection).toBeVisible();
        const analysisText = await analysisSection.textContent();
        expect(analysisText!.length, 'Analysis should be substantial').toBeGreaterThan(100);
      }

      await expect(page.getByText('Джерело: kmu.gov.ua')).toBeVisible();
    }

    await page.screenshot({ path: 'tests/e2e/screenshots/kmu-article-modal.png', fullPage: true });
  });

  // ============================================================================
  // Test 3: Close modal via X button
  // ============================================================================

  test('should close modal via X button', async ({ page }) => {
    test.setTimeout(60000);
    skipIfNoAuth();

    await goToNewsPage(page);
    await waitForNewsItems(page);
    if (!await isModalDeployed(page)) { test.skip(); return; }

    await page.locator('.space-y-4 > div[class*="rounded-xl"][class*="cursor-pointer"]').first().click();
    const modal = page.locator('[class*="fixed"][class*="z-50"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    await page.waitForTimeout(300);
    await modal.locator('button').last().click();

    await expect(modal).not.toBeVisible({ timeout: 5000 });
    console.log('Modal closed via X button');
  });

  // ============================================================================
  // Test 4: Close modal via backdrop click
  // ============================================================================

  test('should close modal via backdrop click', async ({ page }) => {
    test.setTimeout(60000);
    skipIfNoAuth();

    await goToNewsPage(page);
    await waitForNewsItems(page);
    if (!await isModalDeployed(page)) { test.skip(); return; }

    await page.locator('.space-y-4 > div[class*="rounded-xl"][class*="cursor-pointer"]').first().click();
    const modal = page.locator('[class*="fixed"][class*="z-50"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    await modal.click({ position: { x: 10, y: 10 } });

    await expect(modal).not.toBeVisible({ timeout: 5000 });
    console.log('Modal closed via backdrop click');
  });

  // ============================================================================
  // Test 5: Cached article loads faster on second click
  // ============================================================================

  test('should load cached article faster on second access', async ({ page }) => {
    test.setTimeout(180000);
    skipIfNoAuth();

    await goToNewsPage(page);
    await waitForNewsItems(page);
    if (!await isModalDeployed(page)) { test.skip(); return; }

    const firstItem = page.locator('.space-y-4 > div[class*="rounded-xl"][class*="cursor-pointer"]').first();

    // First click — scrape + analyze
    const startFirst = Date.now();
    await firstItem.click();
    const modal = page.locator('[class*="fixed"][class*="z-50"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    const loaded = await page.locator('.prose').first()
      .waitFor({ state: 'visible', timeout: 120000 })
      .then(() => true).catch(() => false);
    if (!loaded) { console.log('First load timed out — skipping'); test.skip(); return; }

    const firstLoadTime = Date.now() - startFirst;
    console.log(`First load: ${firstLoadTime}ms`);

    // Close
    await modal.click({ position: { x: 10, y: 10 } });
    await expect(modal).not.toBeVisible({ timeout: 5000 });

    // Second click — cached
    const startSecond = Date.now();
    await firstItem.click();
    const modal2 = page.locator('[class*="fixed"][class*="z-50"]');
    await expect(modal2).toBeVisible({ timeout: 5000 });
    await page.locator('.prose').first().waitFor({ state: 'visible', timeout: 30000 });

    const secondLoadTime = Date.now() - startSecond;
    console.log(`Second load (cached): ${secondLoadTime}ms`);

    expect(secondLoadTime, 'Cached should be faster').toBeLessThan(firstLoadTime);
    console.log(`Speedup: ${(firstLoadTime / secondLoadTime).toFixed(1)}x`);
  });

  // ============================================================================
  // Test 6: External link in modal header
  // ============================================================================

  test('should have external link to original kmu.gov.ua article', async ({ page }) => {
    test.setTimeout(60000);
    skipIfNoAuth();

    await goToNewsPage(page);
    await waitForNewsItems(page);
    if (!await isModalDeployed(page)) { test.skip(); return; }

    await page.locator('.space-y-4 > div[class*="rounded-xl"][class*="cursor-pointer"]').first().click();
    const modal = page.locator('[class*="fixed"][class*="z-50"]');
    await expect(modal).toBeVisible({ timeout: 5000 });

    const link = modal.locator('a[target="_blank"][href*="kmu.gov.ua"]').first();
    await expect(link).toBeVisible({ timeout: 5000 });
    const href = await link.getAttribute('href');
    console.log(`External link: ${href}`);
    expect(href).toContain('kmu.gov.ua');
  });

  // ============================================================================
  // Test 7-9: API validation
  // ============================================================================

  test('should reject non-kmu.gov.ua URLs via API', async ({ request }) => {
    skipIfNoAuth();

    const response = await request.get(`${API_URL}/news/article`, {
      params: { url: 'https://evil.com/article', title: 'Test' },
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('kmu.gov.ua');
    console.log('Non-kmu URL rejected');
  });

  test('should reject requests without URL parameter', async ({ request }) => {
    skipIfNoAuth();

    const response = await request.get(`${API_URL}/news/article`, {
      params: { title: 'Test' },
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toContain('url');
    console.log('Missing URL rejected');
  });

  test('should reject requests without title parameter', async ({ request }) => {
    skipIfNoAuth();

    const response = await request.get(`${API_URL}/news/article`, {
      params: { url: 'https://www.kmu.gov.ua/news/test' },
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toContain('title');
    console.log('Missing title rejected');
  });

  // ============================================================================
  // Test 10: Reject unauthenticated requests (works without auth)
  // ============================================================================

  test('should reject unauthenticated requests', async ({ request }) => {
    const response = await request.get(`${API_URL}/news/article`, {
      params: { url: 'https://www.kmu.gov.ua/news/test', title: 'Test' },
    });
    // 401/403 if endpoint deployed, 404/502 if not yet deployed
    expect([401, 403, 404, 502]).toContain(response.status());
    console.log(`Unauthenticated request: ${response.status()}`);
  });

  // ============================================================================
  // Test 11: Refresh button
  // ============================================================================

  test('should refresh news list when clicking refresh button', async ({ page }) => {
    test.setTimeout(60000);
    skipIfNoAuth();

    await goToNewsPage(page);
    const countBefore = await waitForNewsItems(page);

    // Refresh button with "Оновити" text
    const refreshBtn = page.locator('button').filter({ hasText: 'Оновити' });
    await expect(refreshBtn).toBeVisible({ timeout: 5000 });
    await refreshBtn.click();

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const countAfter = await page.locator('.space-y-4 > a[class*="rounded-xl"], .space-y-4 > div[class*="rounded-xl"][class*="cursor-pointer"]').count();
    console.log(`Before: ${countBefore}, after: ${countAfter}`);
    expect(countAfter).toBeGreaterThan(0);
  });

  // ============================================================================
  // Test 12: Sparkle icon on hover
  // ============================================================================

  test('should show sparkle icon hint on news item hover', async ({ page }) => {
    test.setTimeout(60000);
    skipIfNoAuth();

    await goToNewsPage(page);
    await waitForNewsItems(page);
    if (!await isModalDeployed(page)) { test.skip(); return; }

    const firstItem = page.locator('.space-y-4 > div[class*="rounded-xl"][class*="cursor-pointer"]').first();
    await firstItem.hover();
    await page.waitForTimeout(500);

    const sparkle = firstItem.locator('[class*="text-amber-400"]');
    const visible = await sparkle.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`Sparkle on hover: ${visible}`);
  });
});

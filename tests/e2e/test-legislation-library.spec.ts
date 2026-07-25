/**
 * E2E Tests: Legislation Library (/legal-codes-library)
 *
 * Tests the full legislation library flow:
 * 1. Library listing page (codes grid, search, categories)
 * 2. Code viewer (TOC, article display, navigation)
 * 3. Bug detection: article duplication, navigation beyond 20, content display
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'https://localdev.legal.org.ua';
const API_URL = `${BASE_URL}/api`;

// Test credentials
const TEST_EMAIL = process.env.TEST_EMAIL || 'mcvovkes@gmail.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'g7856fjFGy8FF864jhf';

// Civil Code — the most commonly used code for testing
const TEST_CODE_ID = '435-15';
const TEST_CODE_NAME = 'Цивільний кодекс';

let authToken: string;

test.beforeAll(async ({ request }) => {
  const loginResponse = await request.post(`${BASE_URL}/auth/login`, {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000,
  });
  expect(loginResponse.status(), 'Login should succeed').toBe(200);
  const loginData = await loginResponse.json();
  authToken = loginData.token;
  expect(authToken, 'Should have auth token').toBeTruthy();
});

// ============================================================================
// Group 1: Library Listing Page
// ============================================================================

test.describe('Library Listing Page', () => {
  test('should render main codes grid', async ({ page }) => {
    await page.goto(`${BASE_URL}/legal-codes-library`);

    // Wait for the page to render codes
    await expect(page.getByText('Цивільний кодекс')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Кримінальний кодекс')).toBeVisible();
    await expect(page.getByText('Господарський кодекс')).toBeVisible();
    await expect(page.getByText('Сімейний кодекс')).toBeVisible();
    await expect(page.getByText('Земельний кодекс')).toBeVisible();
    await expect(page.getByText('Податковий кодекс')).toBeVisible();
  });

  test('should render procedural codes section', async ({ page }) => {
    await page.goto(`${BASE_URL}/legal-codes-library`);

    await expect(page.getByText('Процесуальні кодекси')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Цивільний процесуальний кодекс (ЦПК)')).toBeVisible();
    await expect(page.getByText('Кримінальний процесуальний кодекс (КПК)')).toBeVisible();
  });

  test('should have a working search input', async ({ page }) => {
    await page.goto(`${BASE_URL}/legal-codes-library`);

    const searchInput = page.getByPlaceholder(/пошук|знайти/i);
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    await searchInput.fill('власність');
    await searchInput.press('Enter');

    // Should show loading or results
    await page.waitForTimeout(1000);
    // Verify no error toast appeared
    const errorToast = page.locator('[class*="toast"][class*="error"], [class*="Toastify__toast--error"]');
    await expect(errorToast).toHaveCount(0);
  });

  test('should open a code when clicked', async ({ page }) => {
    await page.goto(`${BASE_URL}/legal-codes-library`);

    // Click on Civil Code
    const civilCode = page.getByText('Цивільний кодекс').first();
    await expect(civilCode).toBeVisible({ timeout: 10000 });
    await civilCode.click();

    // Should show code viewer with back button and title
    await expect(page.getByText(/№\s*435-15/)).toBeVisible({ timeout: 15000 });
    // Should show "ЗМІСТ" (table of contents header)
    await expect(page.getByText('ЗМІСТ')).toBeVisible({ timeout: 15000 });
  });
});

// ============================================================================
// Group 2: Code Viewer — Table of Contents
// ============================================================================

test.describe('Code Viewer — Table of Contents', () => {
  test('should display TOC with sections after opening a code', async ({ page }) => {
    await page.goto(`${BASE_URL}/legal-codes-library`);

    // Open Civil Code
    await page.getByText('Цивільний кодекс').first().click();
    await expect(page.getByText('ЗМІСТ')).toBeVisible({ timeout: 15000 });

    // Should show article count
    await expect(page.getByText(/\d+\s*статей/)).toBeVisible({ timeout: 10000 });

    // Should have expandable sections (Розділ)
    const sections = page.locator('button:has-text("Розділ")');
    await expect(sections.first()).toBeVisible({ timeout: 10000 });
    const sectionCount = await sections.count();
    expect(sectionCount).toBeGreaterThan(0);
  });

  test('should expand sections and show articles', async ({ page }) => {
    await page.goto(`${BASE_URL}/legal-codes-library`);

    await page.getByText('Цивільний кодекс').first().click();
    await expect(page.getByText('ЗМІСТ')).toBeVisible({ timeout: 15000 });

    // First 2 sections should be auto-expanded
    // Look for article entries (Ст. X)
    const articleButtons = page.locator('button:has-text("Ст.")');
    await expect(articleButtons.first()).toBeVisible({ timeout: 10000 });
  });

  test('should not have duplicate articles in TOC', async ({ page }) => {
    await page.goto(`${BASE_URL}/legal-codes-library`);

    await page.getByText('Цивільний кодекс').first().click();
    await expect(page.getByText('ЗМІСТ')).toBeVisible({ timeout: 15000 });

    // Expand all sections to check for duplicates
    const sectionButtons = page.locator('button:has-text("Розділ")');
    const count = await sectionButtons.count();
    for (let i = 0; i < Math.min(count, 5); i++) {
      const btn = sectionButtons.nth(i);
      // Click to expand (or it may already be expanded)
      await btn.click();
      await page.waitForTimeout(300);
    }

    // Also expand chapters
    const chapterButtons = page.locator('button:has-text("Глава")');
    const chapterCount = await chapterButtons.count();
    for (let i = 0; i < Math.min(chapterCount, 10); i++) {
      await chapterButtons.nth(i).click();
      await page.waitForTimeout(200);
    }

    // Collect all visible article numbers
    const articleEntries = page.locator('button:has-text("Ст.")');
    const articleTexts: string[] = [];
    const articlesCount = await articleEntries.count();
    for (let i = 0; i < articlesCount; i++) {
      const text = await articleEntries.nth(i).textContent();
      if (text) articleTexts.push(text.trim());
    }

    // Check for duplicates
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const text of articleTexts) {
      if (seen.has(text)) {
        duplicates.push(text);
      }
      seen.add(text);
    }

    expect(
      duplicates,
      `Found duplicate articles in TOC: ${duplicates.join(', ')}`
    ).toHaveLength(0);
  });
});

// ============================================================================
// Group 3: Article Display
// ============================================================================

test.describe('Article Display', () => {
  test('should load and display article content when clicked in TOC', async ({ page }) => {
    await page.goto(`${BASE_URL}/legal-codes-library`);

    await page.getByText('Цивільний кодекс').first().click();
    await expect(page.getByText('ЗМІСТ')).toBeVisible({ timeout: 15000 });

    // Wait for articles to appear in TOC
    const firstArticle = page.locator('button:has-text("Ст.")').first();
    await expect(firstArticle).toBeVisible({ timeout: 10000 });
    await firstArticle.click();

    // Should show article title with "Стаття X."
    await expect(page.locator('h2:has-text("Стаття")')).toBeVisible({ timeout: 15000 });

    // Should show article text content (not empty)
    const articleText = page.locator('.whitespace-pre-wrap');
    await expect(articleText).toBeVisible();
    const content = await articleText.textContent();
    expect(content?.length).toBeGreaterThan(10);
  });

  test('should show action buttons (copy, link, comment)', async ({ page }) => {
    await page.goto(`${BASE_URL}/legal-codes-library`);

    await page.getByText('Цивільний кодекс').first().click();
    await expect(page.getByText('ЗМІСТ')).toBeVisible({ timeout: 15000 });

    const firstArticle = page.locator('button:has-text("Ст.")').first();
    await expect(firstArticle).toBeVisible({ timeout: 10000 });
    await firstArticle.click();
    await expect(page.locator('h2:has-text("Стаття")')).toBeVisible({ timeout: 15000 });

    // Verify action buttons
    await expect(page.getByText('Копіювати')).toBeVisible();
    await expect(page.getByText('Посилання')).toBeVisible();
    await expect(page.getByText('Коментар')).toBeVisible();
  });

  test('should toggle comment panel', async ({ page }) => {
    await page.goto(`${BASE_URL}/legal-codes-library`);

    await page.getByText('Цивільний кодекс').first().click();
    await expect(page.getByText('ЗМІСТ')).toBeVisible({ timeout: 15000 });

    const firstArticle = page.locator('button:has-text("Ст.")').first();
    await expect(firstArticle).toBeVisible({ timeout: 10000 });
    await firstArticle.click();
    await expect(page.locator('h2:has-text("Стаття")')).toBeVisible({ timeout: 15000 });

    // Click comment button
    await page.getByText('Коментар').click();

    // Should show textarea for comments
    const textarea = page.locator('textarea[placeholder*="нотатку"]');
    await expect(textarea).toBeVisible({ timeout: 5000 });

    // Click again to hide
    await page.getByText('Коментар').click();
    await expect(textarea).not.toBeVisible({ timeout: 5000 });
  });

  test('article content should not contain raw HTML or JSON', async ({ page }) => {
    await page.goto(`${BASE_URL}/legal-codes-library`);

    await page.getByText('Цивільний кодекс').first().click();
    await expect(page.getByText('ЗМІСТ')).toBeVisible({ timeout: 15000 });

    const firstArticle = page.locator('button:has-text("Ст.")').first();
    await expect(firstArticle).toBeVisible({ timeout: 10000 });
    await firstArticle.click();
    await expect(page.locator('h2:has-text("Стаття")')).toBeVisible({ timeout: 15000 });

    const articleText = page.locator('.whitespace-pre-wrap');
    const content = await articleText.textContent();

    // Should not contain raw HTML tags
    expect(content).not.toMatch(/<\/?[a-z][\s\S]*>/i);
    // Should not contain JSON braces (data leak)
    expect(content).not.toMatch(/^\s*\{[\s\S]*"article_number"/);
    // Should not contain [object Object]
    expect(content).not.toContain('[object Object]');
  });
});

// ============================================================================
// Group 4: Prev/Next Navigation
// ============================================================================

test.describe('Prev/Next Navigation', () => {
  test('should show correct article position counter', async ({ page }) => {
    await page.goto(`${BASE_URL}/legal-codes-library`);

    await page.getByText('Цивільний кодекс').first().click();
    await expect(page.getByText('ЗМІСТ')).toBeVisible({ timeout: 15000 });

    const firstArticle = page.locator('button:has-text("Ст.")').first();
    await expect(firstArticle).toBeVisible({ timeout: 10000 });
    await firstArticle.click();
    await expect(page.locator('h2:has-text("Стаття")')).toBeVisible({ timeout: 15000 });

    // Check counter — should show "1 / N" where N is total articles, NOT 20
    const counter = page.locator('text=/\\d+\\s*\\/\\s*\\d+/');
    await expect(counter).toBeVisible();
    const counterText = await counter.textContent();
    const match = counterText?.match(/(\d+)\s*\/\s*(\d+)/);
    expect(match).toBeTruthy();

    const [, current, total] = match!;
    expect(parseInt(current)).toBe(1);

    // BUG DETECTION: total should be >> 20 for Civil Code (has 1308+ articles)
    // If total is 20 or less, the articles_summary truncation bug is present
    const totalNum = parseInt(total);
    expect(
      totalNum,
      `BUG: Article counter shows ${totalNum} total articles — likely truncated to articles_summary (20 items). Civil Code has 1300+ articles.`
    ).toBeGreaterThan(20);
  });

  test('prev button should be disabled on first article', async ({ page }) => {
    await page.goto(`${BASE_URL}/legal-codes-library`);

    await page.getByText('Цивільний кодекс').first().click();
    await expect(page.getByText('ЗМІСТ')).toBeVisible({ timeout: 15000 });

    const firstArticle = page.locator('button:has-text("Ст.")').first();
    await expect(firstArticle).toBeVisible({ timeout: 10000 });
    await firstArticle.click();
    await expect(page.locator('h2:has-text("Стаття")')).toBeVisible({ timeout: 15000 });

    // Prev button should exist but be disabled
    const prevButton = page.locator('button:has-text("Попередня")');
    await expect(prevButton).toBeVisible();
    await expect(prevButton).toBeDisabled();
  });

  test('next button should navigate to next article', async ({ page }) => {
    await page.goto(`${BASE_URL}/legal-codes-library`);

    await page.getByText('Цивільний кодекс').first().click();
    await expect(page.getByText('ЗМІСТ')).toBeVisible({ timeout: 15000 });

    const firstArticle = page.locator('button:has-text("Ст.")').first();
    await expect(firstArticle).toBeVisible({ timeout: 10000 });
    await firstArticle.click();

    const articleTitle = page.locator('h2:has-text("Стаття")');
    await expect(articleTitle).toBeVisible({ timeout: 15000 });
    const firstTitle = await articleTitle.textContent();

    // Click next
    const nextButton = page.locator('button:has-text("Ст.")').filter({ has: page.locator('svg') }).last();
    // Use the Наступна/Ст. X button in the nav bar
    const navNext = page.locator('button').filter({ hasText: /Ст\.\s*\d/ }).last();
    if (await navNext.isVisible()) {
      await navNext.click();
      await page.waitForTimeout(2000);
      const secondTitle = await articleTitle.textContent();
      expect(secondTitle).not.toBe(firstTitle);
    }
  });

  test('BUG: navigation should work for articles beyond #20', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto(`${BASE_URL}/legal-codes-library`);

    await page.getByText('Цивільний кодекс').first().click();
    await expect(page.getByText('ЗМІСТ')).toBeVisible({ timeout: 15000 });

    // Expand sections to find an article with number > 20
    const sections = page.locator('button:has-text("Розділ")');
    const sectionCount = await sections.count();

    // Try expanding later sections to find high-numbered articles
    for (let i = Math.min(sectionCount - 1, 4); i >= 2; i--) {
      await sections.nth(i).click();
      await page.waitForTimeout(500);
    }

    // Expand chapters within expanded sections
    const chapters = page.locator('button:has-text("Глава")');
    const chapCount = await chapters.count();
    if (chapCount > 3) {
      await chapters.nth(3).click();
      await page.waitForTimeout(500);
    }

    // Find an article with number > 20
    const allArticleButtons = page.locator('button:has-text("Ст.")');
    const articleCount = await allArticleButtons.count();
    let highArticle: string | null = null;

    for (let i = articleCount - 1; i >= 0; i--) {
      const text = await allArticleButtons.nth(i).textContent();
      const m = text?.match(/Ст\.\s*(\d+)/);
      if (m && parseInt(m[1]) > 20) {
        highArticle = text!;
        await allArticleButtons.nth(i).click();
        break;
      }
    }

    if (!highArticle) {
      test.skip(true, 'Could not find article > 20 in expanded TOC');
      return;
    }

    // Wait for article to load
    await expect(page.locator('h2:has-text("Стаття")')).toBeVisible({ timeout: 15000 });

    // BUG CHECK: counter should show correct position, not "0 / 20"
    const counter = page.locator('text=/\\d+\\s*\\/\\s*\\d+/');
    const counterText = await counter.textContent();
    const match = counterText?.match(/(\d+)\s*\/\s*(\d+)/);
    expect(match).toBeTruthy();

    const [, current, total] = match!;
    expect(
      parseInt(current),
      `BUG: Article position shows ${current} — likely 0 because article is not found in truncated articles_summary array`
    ).toBeGreaterThan(0);
    expect(
      parseInt(total),
      `BUG: Total articles shows ${total} — should be >> 20 for Civil Code`
    ).toBeGreaterThan(20);
  });
});

// ============================================================================
// Group 5: API-Level Tests (Backend Data Integrity)
// ============================================================================

test.describe('API — Legislation Data Integrity', () => {
  test('get_legislation_structure should return all articles in TOC', async ({ request }) => {
    const response = await request.post(`${API_URL}/tools/get_legislation_structure`, {
      data: { rada_id: TEST_CODE_ID },
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      timeout: 30000,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    const data = body?.result?.content?.[0]?.text
      ? JSON.parse(body.result.content[0].text)
      : body;

    expect(data.total_articles).toBeGreaterThan(100);
    expect(data.table_of_contents).toBeDefined();
    expect(data.table_of_contents.length).toBeGreaterThan(0);

    // BUG: articles_summary is truncated to 20
    expect(
      data.articles_summary?.length,
      `BUG: articles_summary has only ${data.articles_summary?.length} items, but total_articles is ${data.total_articles}. Navigation uses this truncated list.`
    ).toBe(data.total_articles);
  });

  test('TOC should not contain duplicate article entries', async ({ request }) => {
    const response = await request.post(`${API_URL}/tools/get_legislation_structure`, {
      data: { rada_id: TEST_CODE_ID },
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      timeout: 30000,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    const data = body?.result?.content?.[0]?.text
      ? JSON.parse(body.result.content[0].text)
      : body;

    // Recursively collect all article_numbers from TOC
    const articleNumbers: string[] = [];
    function collectArticles(entries: any[]) {
      for (const entry of entries) {
        if (entry.article_number && !entry.type) {
          articleNumbers.push(entry.article_number);
        }
        if (entry.articles) collectArticles(entry.articles);
        if (entry.chapters) collectArticles(entry.chapters);
      }
    }
    collectArticles(data.table_of_contents);

    // Check for duplicates
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const num of articleNumbers) {
      if (seen.has(num)) {
        duplicates.push(num);
      }
      seen.add(num);
    }

    expect(
      duplicates,
      `BUG: Duplicate articles found in TOC: ${duplicates.slice(0, 10).join(', ')}${duplicates.length > 10 ? ` (+${duplicates.length - 10} more)` : ''}`
    ).toHaveLength(0);
  });

  test('article content should not be empty or contain metadata', async ({ request }) => {
    // First get structure to find article numbers
    const structResponse = await request.post(`${API_URL}/tools/get_legislation_structure`, {
      data: { rada_id: TEST_CODE_ID },
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      timeout: 30000,
    });
    const structBody = await structResponse.json();
    const structData = structBody?.result?.content?.[0]?.text
      ? JSON.parse(structBody.result.content[0].text)
      : structBody;

    // Test first 3 articles from summary
    const testArticles = (structData.articles_summary || []).slice(0, 3);
    expect(testArticles.length).toBeGreaterThan(0);

    for (const article of testArticles) {
      const artResponse = await request.post(`${API_URL}/tools/get_legislation_article`, {
        data: { rada_id: TEST_CODE_ID, article_number: article.article_number },
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        timeout: 15000,
      });

      expect(artResponse.status()).toBe(200);
      const artBody = await artResponse.json();
      const artData = artBody?.result?.content?.[0]?.text
        ? JSON.parse(artBody.result.content[0].text)
        : artBody;

      // Article should have content
      expect(artData.full_text, `Article ${article.article_number} has empty full_text`).toBeTruthy();
      expect(artData.full_text.length).toBeGreaterThan(10);
      expect(artData.title, `Article ${article.article_number} has empty title`).toBeTruthy();

      // Content should not contain raw JSON or [object Object]
      expect(artData.full_text).not.toContain('[object Object]');
      expect(artData.full_text).not.toMatch(/^\s*\{.*"article_number"/);
    }
  });

  test('TOC sections should be in correct numeric order', async ({ request }) => {
    const response = await request.post(`${API_URL}/tools/get_legislation_structure`, {
      data: { rada_id: TEST_CODE_ID },
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      timeout: 30000,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    const data = body?.result?.content?.[0]?.text
      ? JSON.parse(body.result.content[0].text)
      : body;

    const toc = data.table_of_contents;
    const sections = toc.filter((e: any) => e.type === 'section');

    // Verify sections are in ascending numeric order
    for (let i = 1; i < sections.length; i++) {
      const prevNum = parseInt(sections[i - 1].number, 10);
      const currNum = parseInt(sections[i].number, 10);
      if (!isNaN(prevNum) && !isNaN(currNum)) {
        expect(
          currNum,
          `BUG: Section ${sections[i].number} appears after section ${sections[i - 1].number} — sections not sorted correctly`
        ).toBeGreaterThan(prevNum);
      }
    }

    // Verify chapters within each section are also sorted
    for (const section of sections) {
      if (section.chapters && section.chapters.length > 1) {
        for (let i = 1; i < section.chapters.length; i++) {
          const prevNum = parseInt(section.chapters[i - 1].number, 10);
          const currNum = parseInt(section.chapters[i].number, 10);
          if (!isNaN(prevNum) && !isNaN(currNum)) {
            expect(
              currNum,
              `BUG: In section ${section.number}, chapter ${section.chapters[i].number} after chapter ${section.chapters[i - 1].number}`
            ).toBeGreaterThan(prevNum);
          }
        }
      }
    }
  });

  test('articles_summary count should match total_articles', async ({ request }) => {
    const response = await request.post(`${API_URL}/tools/get_legislation_structure`, {
      data: { rada_id: TEST_CODE_ID },
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      timeout: 30000,
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    const data = body?.result?.content?.[0]?.text
      ? JSON.parse(body.result.content[0].text)
      : body;

    // BUG DETECTION: articles_summary is truncated
    if (data.articles_summary && data.total_articles) {
      expect(
        data.articles_summary.length,
        `BUG: articles_summary has ${data.articles_summary.length} items but total_articles is ${data.total_articles}. ` +
        `This breaks prev/next navigation for articles beyond #20.`
      ).toBe(data.total_articles);
    }
  });
});

// ============================================================================
// Group 6: Back Navigation & State
// ============================================================================

test.describe('Navigation & State', () => {
  test('back button should return to library listing', async ({ page }) => {
    await page.goto(`${BASE_URL}/legal-codes-library`);

    // Open a code
    await page.getByText('Цивільний кодекс').first().click();
    await expect(page.getByText('ЗМІСТ')).toBeVisible({ timeout: 15000 });

    // Click back
    const backButton = page.locator('button').filter({ has: page.locator('svg') }).first();
    await backButton.click();

    // Should be back on listing
    await expect(page.getByText('Цивільний кодекс').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Кримінальний кодекс')).toBeVisible();
  });

  test('selected article should be highlighted in TOC', async ({ page }) => {
    await page.goto(`${BASE_URL}/legal-codes-library`);

    await page.getByText('Цивільний кодекс').first().click();
    await expect(page.getByText('ЗМІСТ')).toBeVisible({ timeout: 15000 });

    const firstArticle = page.locator('button:has-text("Ст.")').first();
    await expect(firstArticle).toBeVisible({ timeout: 10000 });
    await firstArticle.click();

    // The selected article button should have accent styling
    await expect(page.locator('h2:has-text("Стаття")')).toBeVisible({ timeout: 15000 });

    // Check that the TOC button for the selected article has the accent class
    const selectedTocButton = page.locator('button.bg-claude-accent\\/10');
    await expect(selectedTocButton).toBeVisible();
  });

  test('TOC toggle button should show/hide sidebar', async ({ page }) => {
    await page.goto(`${BASE_URL}/legal-codes-library`);

    await page.getByText('Цивільний кодекс').first().click();
    await expect(page.getByText('ЗМІСТ')).toBeVisible({ timeout: 15000 });

    // Click TOC toggle (Menu icon button)
    const tocToggle = page.locator('button[title="Зміст"]');
    await tocToggle.click();

    // TOC should be hidden
    await expect(page.getByText('ЗМІСТ')).not.toBeVisible({ timeout: 5000 });

    // Click again to show
    await tocToggle.click();
    await expect(page.getByText('ЗМІСТ')).toBeVisible({ timeout: 5000 });
  });
});

// ============================================================================
// Group 7: Search Within Code
// ============================================================================

test.describe('Search Within Code', () => {
  test('should open search panel and find articles', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto(`${BASE_URL}/legal-codes-library`);

    await page.getByText('Цивільний кодекс').first().click();
    await expect(page.getByText('ЗМІСТ')).toBeVisible({ timeout: 15000 });

    // Click search button
    const searchToggle = page.locator('button[title="Пошук"]');
    await searchToggle.click();

    // Search panel should appear
    const searchInput = page.locator('input[placeholder*="пошук"], input[placeholder*="Пошук"]').last();
    await expect(searchInput).toBeVisible({ timeout: 5000 });

    // Search for a common legal term
    await searchInput.fill('власність');
    await searchInput.press('Enter');

    // Should show results after loading
    await page.waitForTimeout(5000);

    // Should show result count or result items
    const results = page.locator('button:has-text("Ст.")');
    // At least one result expected for "власність" in Civil Code
    const resultCount = await results.count();
    expect(resultCount).toBeGreaterThan(0);
  });
});

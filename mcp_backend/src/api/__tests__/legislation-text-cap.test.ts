import { LegislationTools } from '../legislation-tools';

/**
 * Regression for the 69.22 truncation report (2026-07-02): get_legislation_section
 * promises "повний текст статті", but the blanket 2000-char cap from PR #1846 (meant
 * for multi-article SEARCH blowups) also cut explicit single-article fetches —
 * ПКУ п. 69.22 (13.5K chars, воєнний режим) came back truncated. Explicit fetches
 * must return full text (generous outlier-only cap); search hits stay at 2000.
 */

const LONG_TEXT = 'а'.repeat(13_464); // real size of ПКУ п.69.22
const HUGE_TEXT = 'б'.repeat(200_000); // ПКУ ст. 14 scale

function makeArticle(fullText: string, articleNumber = '69.22') {
  return {
    rada_id: '2755-17',
    article_number: articleNumber,
    title: 'Особливості справляння податків на період воєнного стану',
    full_text: fullText,
    url: 'https://zakon.rada.gov.ua/laws/show/2755-17',
  };
}

function buildTools(service: Partial<Record<string, jest.Mock>>) {
  const renderer: any = { renderArticleHTML: jest.fn(), renderMultipleArticlesHTML: jest.fn() };
  return new LegislationTools({
    parseArticleReferenceWithAI: jest.fn().mockResolvedValue(null),
    getArticle: jest.fn(),
    getMultipleArticles: jest.fn(),
    findRelevantArticles: jest.fn().mockResolvedValue([]),
    getLegislationStructure: jest.fn().mockResolvedValue(null),
    ...service,
  } as any, renderer);
}

describe('get_legislation_section (explicit single-article fetch)', () => {
  it('returns the FULL text of a long article (13.5K chars, no truncation)', async () => {
    const tools = buildTools({
      getArticle: jest.fn().mockResolvedValue(makeArticle(LONG_TEXT)),
    });

    const result = await tools.getLegislationSection({ rada_id: '2755-17', article_number: '69.22' });

    expect(result.full_text).toBe(LONG_TEXT);
    expect(result.full_text).not.toContain('[обрізано');
    expect(result.full_text_length).toBe(LONG_TEXT.length);
  });

  it('still caps pathological outliers (200K chars) and reports the real length', async () => {
    const tools = buildTools({
      getArticle: jest.fn().mockResolvedValue(makeArticle(HUGE_TEXT, '14')),
    });

    const result = await tools.getLegislationSection({ rada_id: '2755-17', article_number: '14' });

    expect(result.full_text.length).toBeLessThan(HUGE_TEXT.length);
    expect(result.full_text).toContain(`[обрізано; повний текст — ${HUGE_TEXT.length} символів]`);
    expect(result.full_text_length).toBe(HUGE_TEXT.length);
  });
});

describe('get_legislation_articles (explicit multi-article fetch)', () => {
  it('gives a few named articles their full text via the shared budget', async () => {
    const tools = buildTools({
      getMultipleArticles: jest.fn().mockResolvedValue([
        makeArticle(LONG_TEXT, '69.22'),
        makeArticle(LONG_TEXT, '69.1'),
      ]),
    });

    const result = await tools.getLegislationArticles({
      rada_id: '2755-17',
      article_numbers: ['69.22', '69.1'],
    });

    for (const a of result.articles) {
      expect(a.full_text).toBe(LONG_TEXT); // 120K budget / 2 = 60K each — no cut
    }
  });

  it('caps per-article text when many articles are requested', async () => {
    const many = Array.from({ length: 100 }, (_, i) => makeArticle(LONG_TEXT, String(i + 1)));
    const tools = buildTools({
      getMultipleArticles: jest.fn().mockResolvedValue(many),
    });

    const result = await tools.getLegislationArticles({
      rada_id: '2755-17',
      article_numbers: many.map(a => a.article_number),
    });

    // 120K / 100 = 1.2K → floor is the 2000-char search cap
    for (const a of result.articles) {
      expect(a.full_text.length).toBeLessThanOrEqual(2000 + 60);
      expect(a.full_text).toContain('[обрізано');
    }
  });
});

describe('search_legislation list hits keep the 2000-char cap', () => {
  it('caps semantic search results', async () => {
    const tools = buildTools({
      findRelevantArticles: jest.fn().mockResolvedValue([makeArticle(LONG_TEXT)]),
    });

    const result = await tools.searchLegislation({ query: 'воєнний стан податки пільги' });

    expect(result.articles[0].full_text.length).toBeLessThanOrEqual(2000 + 60);
    expect(result.articles[0].full_text).toContain('[обрізано');
  });
});

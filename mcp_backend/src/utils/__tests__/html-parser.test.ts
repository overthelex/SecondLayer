jest.mock('../logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

import { CourtDecisionHTMLParser, extractSearchTermsRegex, extractTextFromHTML } from '../html-parser';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHtml(paragraphs: string[], withArticle = true): string {
  const body = paragraphs.map(p => `<p>${p}</p>`).join('\n');
  if (withArticle) {
    return `<html><head><title>Test Title</title><meta name="description" content="Test desc"><link rel="canonical" href="https://example.com/doc/1"></head><body><div id="article-container">${body}</div></body></html>`;
  }
  return `<html><body><article>${body}</article></body></html>`;
}

// ---------------------------------------------------------------------------
// CourtDecisionHTMLParser
// ---------------------------------------------------------------------------

describe('CourtDecisionHTMLParser', () => {
  describe('extractArticleHTML', () => {
    it('should return inner HTML of #article-container', () => {
      const html = makeHtml(['Перший параграф', 'Другий параграф']);
      const parser = new CourtDecisionHTMLParser(html);
      const result = parser.extractArticleHTML();
      expect(result).toContain('Перший параграф');
    });

    it('should fall back to <article> when #article-container is missing', () => {
      const html = makeHtml(['Параграф в article'], false);
      const parser = new CourtDecisionHTMLParser(html);
      const result = parser.extractArticleHTML();
      expect(result).toContain('Параграф в article');
    });

    it('should return empty string when no container found at all', () => {
      const html = '<html><body><div class="other">text</div></body></html>';
      const parser = new CourtDecisionHTMLParser(html);
      const result = parser.extractArticleHTML();
      expect(result).toBe('');
    });
  });

  describe('extractMainText', () => {
    it('should return non-empty paragraphs from #article-container', () => {
      const html = makeHtml(['Суд ВСТАНОВИВ:', 'Позивач звернувся до суду.', '']);
      const parser = new CourtDecisionHTMLParser(html);
      const paragraphs = parser.extractMainText();
      expect(paragraphs.length).toBe(2); // empty filtered out
      expect(paragraphs[0]).toBe('Суд ВСТАНОВИВ:');
    });

    it('should strip extra whitespace within paragraph text', () => {
      const html = makeHtml(['  Текст   з   пробілами  ']);
      const parser = new CourtDecisionHTMLParser(html);
      const [para] = parser.extractMainText();
      expect(para).toBe('Текст з пробілами');
    });

    it('should throw when no container is found at all', () => {
      const html = '<html><body><div>no-container</div></body></html>';
      const parser = new CourtDecisionHTMLParser(html);
      expect(() => parser.extractMainText()).toThrow('Could not find decision text container');
    });
  });

  describe('identifySections', () => {
    it('should classify paragraph containing УСТАНОВИВ: as ustanovyv section', () => {
      const parser = new CourtDecisionHTMLParser('<html><body></body></html>');
      const paragraphs = ['Шапка справи.', 'УСТАНОВИВ: факти справи.', 'Продовження фактів.', 'ВИРІШИВ: відмовити.'];
      const sections = parser.identifySections(paragraphs);

      expect(sections.header).toContain('Шапка справи.');
      expect(sections.ustanovyv).toContain('УСТАНОВИВ: факти справи.');
      expect(sections.ustanovyv).toContain('Продовження фактів.');
      expect(sections.vyrishyv).toContain('ВИРІШИВ: відмовити.');
    });

    it('should recognise ВСТАНОВИВ: as an ustanovyv marker', () => {
      const parser = new CourtDecisionHTMLParser('<html><body></body></html>');
      const sections = parser.identifySections(['ВСТАНОВИВ: факт.']);
      expect(sections.ustanovyv).toContain('ВСТАНОВИВ: факт.');
    });

    it('should put footer paragraphs after Суддя keyword', () => {
      const parser = new CourtDecisionHTMLParser('<html><body></body></html>');
      const sections = parser.identifySections(['ВИРІШИВ: рішення.', 'Суддя Петренко']);
      expect(sections.footer).toContain('Суддя Петренко');
    });

    it('should return all sections empty for empty input', () => {
      const parser = new CourtDecisionHTMLParser('<html><body></body></html>');
      const sections = parser.identifySections([]);
      expect(sections.header).toHaveLength(0);
      expect(sections.ustanovyv).toHaveLength(0);
      expect(sections.vyrishyv).toHaveLength(0);
    });
  });

  describe('extractKeyContent', () => {
    it('should include ВСТАНОВЛЕНІ ФАКТИ label when ustanovyv is populated', () => {
      const parser = new CourtDecisionHTMLParser('<html><body></body></html>');
      const content = parser.extractKeyContent({
        header: [],
        ustanovyv: ['Факт 1', 'Факт 2'],
        reasoning: [],
        vyrishyv: [],
        footer: [],
      });
      expect(content).toContain('ВСТАНОВЛЕНІ ФАКТИ:');
      expect(content).toContain('Факт 1');
    });

    it('should include РЕЗОЛЮЦІЯ label when vyrishyv is populated', () => {
      const parser = new CourtDecisionHTMLParser('<html><body></body></html>');
      const content = parser.extractKeyContent({
        header: [],
        ustanovyv: [],
        reasoning: [],
        vyrishyv: ['Відмовити у задоволенні позову.'],
        footer: [],
      });
      expect(content).toContain('РЕЗОЛЮЦІЯ:');
    });

    it('should return empty string when all sections are empty', () => {
      const parser = new CourtDecisionHTMLParser('<html><body></body></html>');
      const content = parser.extractKeyContent({ header: [], ustanovyv: [], reasoning: [], vyrishyv: [], footer: [] });
      expect(content).toBe('');
    });
  });

  describe('getMetadata', () => {
    it('should extract title from <title> tag', () => {
      const html = makeHtml(['Справа № 123/456/20']);
      const parser = new CourtDecisionHTMLParser(html);
      const meta = parser.getMetadata();
      expect(meta.title).toBe('Test Title');
    });

    it('should extract description from meta tag', () => {
      const html = makeHtml(['Текст']);
      const parser = new CourtDecisionHTMLParser(html);
      const meta = parser.getMetadata();
      expect(meta.description).toBe('Test desc');
    });

    it('should extract case number from article-container text', () => {
      const html = makeHtml(['Справа № 12-3456/2024 стосується договору.']);
      const parser = new CourtDecisionHTMLParser(html);
      const meta = parser.getMetadata();
      expect(meta.caseNumber).toBe('12-3456/2024');
    });

    it('should return null caseNumber when not found', () => {
      const html = makeHtml(['Текст без номера справи.']);
      const parser = new CourtDecisionHTMLParser(html);
      const meta = parser.getMetadata();
      expect(meta.caseNumber).toBeNull();
    });

    it('should extract canonical url', () => {
      const html = makeHtml(['Текст']);
      const parser = new CourtDecisionHTMLParser(html);
      const meta = parser.getMetadata();
      expect(meta.url).toBe('https://example.com/doc/1');
    });
  });

  describe('toText', () => {
    it('should return full joined text for format=full', () => {
      const html = makeHtml(['Параграф 1.', 'Параграф 2.']);
      const parser = new CourtDecisionHTMLParser(html);
      const text = parser.toText('full');
      expect(text).toBe('Параграф 1. Параграф 2.');
    });

    it('should separate paragraphs with double newlines for format=plain', () => {
      const html = makeHtml(['Параграф 1.', 'Параграф 2.']);
      const parser = new CourtDecisionHTMLParser(html);
      const text = parser.toText('plain');
      expect(text).toBe('Параграф 1.\n\nПараграф 2.');
    });

    it('should truncate text to maxLength when specified', () => {
      const html = makeHtml(['Довгий параграф, який містить багато слів і символів.']);
      const parser = new CourtDecisionHTMLParser(html);
      const text = parser.toText('full', 10);
      expect(text.length).toBe(10);
    });

    it('should return empty string when no paragraphs extracted', () => {
      const html = makeHtml([]);
      const parser = new CourtDecisionHTMLParser(html);
      const text = parser.toText('full');
      expect(text).toBe('');
    });

    it('should throw and rethrow error from extractMainText', () => {
      const html = '<html><body></body></html>';
      const parser = new CourtDecisionHTMLParser(html);
      expect(() => parser.toText('full')).toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// extractSearchTermsRegex
// ---------------------------------------------------------------------------

describe('extractSearchTermsRegex', () => {
  it('should extract law article numbers from text', () => {
    const text = 'Відповідно до ст. 625 ЦК України та статті 280 ЦПК України.';
    const result = extractSearchTermsRegex(text);
    expect(result.lawArticles).toContain('625');
    expect(result.lawArticles).toContain('280');
  });

  it('should detect "стягнення заборгованості" dispute type', () => {
    const text = 'Справа про стягнення заборгованості за договором.';
    const result = extractSearchTermsRegex(text);
    expect(result.disputeType).toBe('стягнення заборгованості');
  });

  it('should detect "розірвання договору" dispute type', () => {
    const text = 'Позивач вимагає розірвання договору оренди.';
    const result = extractSearchTermsRegex(text);
    expect(result.disputeType).toBe('розірвання договору');
  });

  it('should detect "відшкодування збитків" dispute type', () => {
    const text = 'Позов про відшкодування збитків завданих протиправними діями.';
    const result = extractSearchTermsRegex(text);
    expect(result.disputeType).toBe('відшкодування збитків');
  });

  it('should return null disputeType for unrecognised pattern', () => {
    const text = 'Загальний текст без конкретного типу спору.';
    const result = extractSearchTermsRegex(text);
    expect(result.disputeType).toBeNull();
  });

  it('should extract legal keywords present in text', () => {
    // Use exact root forms that match the legalTerms list in the source
    const text = 'Позивач вимагає стягнення неустойка та штраф за порушення договір.';
    const result = extractSearchTermsRegex(text);
    expect(result.keywords).toContain('стягнення');
    expect(result.keywords).toContain('неустойка');
    expect(result.keywords).toContain('штраф');
    expect(result.keywords).toContain('порушення');
    expect(result.keywords).toContain('договір');
  });

  it('should return empty lawArticles for text with no citations', () => {
    const text = 'Текст без жодних посилань на статті.';
    const result = extractSearchTermsRegex(text);
    expect(result.lawArticles).toHaveLength(0);
  });

  it('should deduplicate law articles', () => {
    const text = 'ст. 625 ЦК та знову ст. 625 ЦК.';
    const result = extractSearchTermsRegex(text);
    const count = result.lawArticles.filter(a => a === '625').length;
    expect(count).toBe(1);
  });

  it('should cap lawArticles at 10', () => {
    const articles = Array.from({ length: 20 }, (_, i) => `ст. ${100 + i}`).join(' ');
    const result = extractSearchTermsRegex(articles);
    expect(result.lawArticles.length).toBeLessThanOrEqual(10);
  });

  it('should return caseEssence of dispute type or fallback', () => {
    const result = extractSearchTermsRegex('without specific type');
    expect(result.caseEssence).toBe('загальний спір');
  });
});

// ---------------------------------------------------------------------------
// extractTextFromHTML (convenience wrapper)
// ---------------------------------------------------------------------------

describe('extractTextFromHTML', () => {
  it('should extract text from HTML with article-container', () => {
    const html = makeHtml(['УСТАНОВИВ: факти справи.', 'ВИРІШИВ: задовольнити позов.']);
    const text = extractTextFromHTML(html);
    expect(text).toContain('ВСТАНОВЛЕНІ ФАКТИ:');
  });

  it('should return empty string on parse error', () => {
    // Pass undefined-typed argument to trigger the error path
    const result = extractTextFromHTML(null as any);
    expect(result).toBe('');
  });

  it('should respect maxLength parameter', () => {
    const html = makeHtml(['УСТАНОВИВ: довгий текст.', 'ВИРІШИВ: рішення суду.']);
    const text = extractTextFromHTML(html, 20);
    expect(text.length).toBeLessThanOrEqual(20);
  });
});

/**
 * Tests for EchrHudocSyncService — HUDOC query building, HTML conversion,
 * sync orchestration, and database interaction.
 */

jest.mock('../../utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

import {
  EchrHudocSyncService,
  buildSearchQuery,
  buildSearchURL,
  buildFulltextURL,
  htmlToText,
  generateYearRanges,
} from '../echr-hudoc-sync-service';
import type {
  EchrSyncConfig,
  HudocSearchResponse,
  SyncDatabase,
} from '../echr-hudoc-sync-service';

// ── Test helpers ───────────────────────────────────────────────────────────

function makeDb(overrides: Partial<SyncDatabase> = {}): SyncDatabase {
  return {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    ...overrides,
  };
}

function makeHudocResponse(count: number, items: Array<Record<string, string>> = []): HudocSearchResponse {
  return {
    resultcount: count,
    results: items.map(columns => ({ columns })),
    message: null,
  };
}

function makeFetchFn(responses: Array<{ ok: boolean; status: number; body: any }>): typeof fetch {
  let callIndex = 0;
  return jest.fn().mockImplementation(async () => {
    const resp = responses[callIndex] || responses[responses.length - 1];
    callIndex++;
    return {
      ok: resp.ok,
      status: resp.status,
      json: async () => resp.body,
      text: async () => JSON.stringify(resp.body),
    };
  }) as unknown as typeof fetch;
}

function makeItem(itemid: string, respondent = 'UKR'): Record<string, string> {
  return {
    itemid,
    appno: '12345/06',
    docname: `CASE OF TEST v. ${respondent}`,
    respondent,
    languageisocode: 'ENG',
    kpdate: '2024-01-15',
    conclusion: 'Violation of Article 6',
    importance: '2',
    doctype: 'HEJUD',
    originatingbody: 'ECHR',
    typedescription: 'Judgment',
    extractedappno: '12345/06',
    documentcollectionid: 'JUDGMENTS',
    documentcollectionid2: 'ECHR',
    isplaceholder: 'False',
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 1. HUDOC Query Building
// ════════════════════════════════════════════════════════════════════════════

describe('HUDOC query building', () => {
  describe('buildSearchQuery', () => {
    it('should include country filter when country is provided', () => {
      const query = buildSearchQuery({ country: 'UKR' });
      expect(query).toContain('(respondent:"UKR")');
    });

    it('should include base ECHR site filter', () => {
      const query = buildSearchQuery({ country: 'UKR' });
      expect(query).toContain('(contentsitename=ECHR)');
    });

    it('should exclude press releases and old commission docs', () => {
      const query = buildSearchQuery({ country: 'UKR' });
      expect(query).toContain('(NOT (doctype=PR OR doctype=HFCOMOLD OR doctype=HECOMOLD))');
    });

    it('should add date filter for incremental sync (startDate only)', () => {
      const query = buildSearchQuery({ country: 'UKR', startDate: '2024-01-01' });
      expect(query).toContain('(kpdate>="2024-01-01")');
    });

    it('should add date range filter when both startDate and endDate are set', () => {
      const query = buildSearchQuery({
        country: 'UKR',
        startDate: '2023-01-01',
        endDate: '2023-12-31',
      });
      expect(query).toContain('(kpdate>="2023-01-01" AND kpdate<="2023-12-31")');
    });

    it('should add endDate-only filter', () => {
      const query = buildSearchQuery({ country: 'TUR', endDate: '2020-12-31' });
      expect(query).toContain('(kpdate<="2020-12-31")');
    });

    it('should include language filter when lang is provided', () => {
      const query = buildSearchQuery({ country: 'UKR', lang: 'UKR' });
      expect(query).toContain('(languageisocode:"UKR")');
    });

    it('should include importance filter', () => {
      const query = buildSearchQuery({ country: 'UKR', importance: '1' });
      expect(query).toContain('(importance:"1")');
    });

    it('should include doctype filter', () => {
      const query = buildSearchQuery({ country: 'UKR', doctype: 'HEJUD' });
      expect(query).toContain('(doctype=HEJUD)');
    });

    it('should join all parts with AND', () => {
      const query = buildSearchQuery({ country: 'UKR', lang: 'ENG', importance: '2' });
      const parts = query.split(' AND ');
      // base + exclude + country + lang + importance = 5 parts
      expect(parts.length).toBe(5);
    });

    it('should handle empty country gracefully', () => {
      const query = buildSearchQuery({ country: '' });
      expect(query).not.toContain('respondent');
    });
  });

  describe('buildSearchURL', () => {
    it('should produce a valid HUDOC URL', () => {
      const url = buildSearchURL({ country: 'UKR' }, 0);
      expect(url).toContain('http://hudoc.echr.coe.int/app/query/results');
      expect(url).toContain('start=0');
    });

    it('should include pagination offset', () => {
      const url = buildSearchURL({ country: 'UKR', pageSize: 500 }, 500);
      expect(url).toContain('start=500');
      expect(url).toContain('length=500');
    });

    it('should use default page size of 500', () => {
      const url = buildSearchURL({ country: 'UKR' }, 0);
      expect(url).toContain('length=500');
    });

    it('should encode the query string', () => {
      const url = buildSearchURL({ country: 'UKR' }, 0);
      // The URL should be encoded - respondent:"UKR" becomes encoded
      expect(url).toContain(encodeURIComponent('respondent:"UKR"'));
    });

    it('should include sort parameter', () => {
      const url = buildSearchURL({ country: 'UKR' }, 0);
      expect(url).toContain(encodeURIComponent('itemid Ascending'));
    });
  });

  describe('buildFulltextURL', () => {
    it('should produce correct fulltext URL', () => {
      const url = buildFulltextURL('001-12345');
      expect(url).toBe('http://hudoc.echr.coe.int/app/conversion/docx/html/body?library=ECHR&id=001-12345');
    });
  });

  describe('pagination — auto-split when > 9500 results', () => {
    it('should detect need to split when result count exceeds 9500', () => {
      const db = makeDb();
      const service = new EchrHudocSyncService(db);
      expect(service.needsSplit(9501)).toBe(true);
      expect(service.needsSplit(10000)).toBe(true);
    });

    it('should not split when result count is within limit', () => {
      const db = makeDb();
      const service = new EchrHudocSyncService(db);
      expect(service.needsSplit(9500)).toBe(false);
      expect(service.needsSplit(5000)).toBe(false);
      expect(service.needsSplit(0)).toBe(false);
    });

    it('should generate year ranges for splitting', () => {
      const ranges = generateYearRanges(2020, 2024);
      expect(ranges).toEqual([
        { start: '2020-01-01', end: '2024-12-31' },
      ]);
    });

    it('should split into 5-year buckets', () => {
      const ranges = generateYearRanges(2000, 2024);
      expect(ranges.length).toBe(5); // 2000-2004, 2005-2009, 2010-2014, 2015-2019, 2020-2024
      expect(ranges[0]).toEqual({ start: '2000-01-01', end: '2004-12-31' });
      expect(ranges[4]).toEqual({ start: '2020-01-01', end: '2024-12-31' });
    });

    it('should handle single year range', () => {
      const ranges = generateYearRanges(2024, 2024);
      expect(ranges).toEqual([{ start: '2024-01-01', end: '2024-12-31' }]);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. HTML to Text Conversion
// ════════════════════════════════════════════════════════════════════════════

describe('HTML to text conversion', () => {
  describe('htmlToText', () => {
    it('should strip basic HTML tags', () => {
      const result = htmlToText('<p>Hello <b>world</b></p>');
      expect(result).toContain('Hello');
      expect(result).toContain('world');
      expect(result).not.toContain('<p>');
      expect(result).not.toContain('<b>');
    });

    it('should remove script tags and their content', () => {
      const result = htmlToText('<p>Text</p><script>alert("xss")</script><p>More</p>');
      expect(result).toContain('Text');
      expect(result).toContain('More');
      expect(result).not.toContain('alert');
      expect(result).not.toContain('script');
    });

    it('should remove style tags and their content', () => {
      const result = htmlToText('<style>.cls { color: red; }</style><p>Content</p>');
      expect(result).toContain('Content');
      expect(result).not.toContain('color');
      expect(result).not.toContain('style');
    });

    it('should normalize whitespace — collapse multiple spaces', () => {
      const result = htmlToText('<p>Hello     world     test</p>');
      expect(result).toBe('Hello world test');
    });

    it('should normalize whitespace — collapse multiple newlines', () => {
      const result = htmlToText('<p>First</p>\n\n\n\n<p>Second</p>');
      // Multiple newlines (>2) should be collapsed to double newlines
      expect(result).not.toMatch(/\n{3,}/);
    });

    it('should handle empty input', () => {
      expect(htmlToText('')).toBe('');
    });

    it('should handle null-like input', () => {
      expect(htmlToText(undefined as any)).toBe('');
      expect(htmlToText(null as any)).toBe('');
    });

    it('should decode HTML entities', () => {
      const result = htmlToText('<p>A &amp; B &lt; C &gt; D &quot;E&quot; &#39;F&#39;</p>');
      expect(result).toContain('A & B');
      expect(result).toContain('< C >');
      expect(result).toContain('"E"');
      expect(result).toContain("'F'");
    });

    it('should convert &nbsp; to space', () => {
      const result = htmlToText('<p>Word1&nbsp;Word2</p>');
      expect(result).toContain('Word1 Word2');
    });

    it('should handle plain text input without HTML', () => {
      const result = htmlToText('Just plain text');
      expect(result).toBe('Just plain text');
    });

    it('should trim leading and trailing whitespace', () => {
      const result = htmlToText('   <p>Content</p>   ');
      expect(result).toBe('Content');
    });

    it('should handle complex HUDOC-style HTML', () => {
      const html = `
        <div class="WordSection1">
          <p class="JuPara">THE FACTS</p>
          <p class="JuPara">1. The applicant, Mr Test, is a Ukrainian national.</p>
          <p class="JuPara">&nbsp;</p>
          <p class="JuPara">2. The facts of the case may be summarised as follows.</p>
        </div>
      `;
      const result = htmlToText(html);
      expect(result).toContain('THE FACTS');
      expect(result).toContain('Ukrainian national');
      expect(result).not.toContain('WordSection1');
      expect(result).not.toContain('JuPara');
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. Sync Result Structure
// ════════════════════════════════════════════════════════════════════════════

describe('Sync result structure', () => {
  describe('syncCountry', () => {
    it('should return correct EchrSyncResult shape with all fields', async () => {
      const items = [makeItem('001-001'), makeItem('001-002')];
      const response = makeHudocResponse(2, items);

      const fetchFn = makeFetchFn([{ ok: true, status: 200, body: response }]);

      const db = makeDb({
        query: jest.fn()
          // First call: getLastSyncDate
          .mockResolvedValueOnce({ rows: [{ last_date: null }], rowCount: 0 })
          // Subsequent calls: upsertRecords (one per record)
          .mockResolvedValue({ rows: [{ is_insert: true }], rowCount: 1 }),
      });

      const service = new EchrHudocSyncService(db, fetchFn);
      const result = await service.syncCountry({ country: 'UKR' });

      // Verify all required fields exist
      expect(result).toHaveProperty('country', 'UKR');
      expect(result).toHaveProperty('totalFetched');
      expect(result).toHaveProperty('newRecords');
      expect(result).toHaveProperty('updatedRecords');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('durationMs');
      expect(result).toHaveProperty('syncDate');

      // Verify types
      expect(typeof result.totalFetched).toBe('number');
      expect(typeof result.newRecords).toBe('number');
      expect(typeof result.updatedRecords).toBe('number');
      expect(typeof result.errors).toBe('number');
      expect(typeof result.durationMs).toBe('number');
      expect(typeof result.syncDate).toBe('string');
    });

    it('should return zero counts when no results found', async () => {
      const response = makeHudocResponse(0, []);
      const fetchFn = makeFetchFn([{ ok: true, status: 200, body: response }]);

      const db = makeDb({
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ last_date: null }], rowCount: 0 })
          .mockResolvedValue({ rows: [], rowCount: 0 }),
      });

      const service = new EchrHudocSyncService(db, fetchFn);
      const result = await service.syncCountry({ country: 'UKR' });

      expect(result.totalFetched).toBe(0);
      expect(result.newRecords).toBe(0);
      expect(result.updatedRecords).toBe(0);
      expect(result.errors).toBe(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should report durationMs as a positive number', async () => {
      const response = makeHudocResponse(1, [makeItem('001-001')]);
      const fetchFn = makeFetchFn([{ ok: true, status: 200, body: response }]);

      const db = makeDb({
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ last_date: null }], rowCount: 0 })
          .mockResolvedValue({ rows: [{ is_insert: true }], rowCount: 1 }),
      });

      const service = new EchrHudocSyncService(db, fetchFn);
      const result = await service.syncCountry({ country: 'UKR' });

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should set syncDate to an ISO date string', async () => {
      const response = makeHudocResponse(0, []);
      const fetchFn = makeFetchFn([{ ok: true, status: 200, body: response }]);

      const db = makeDb({
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ last_date: null }], rowCount: 0 }),
      });

      const service = new EchrHudocSyncService(db, fetchFn);
      const result = await service.syncCountry({ country: 'UKR' });

      // Verify syncDate parses as a valid date
      const parsed = new Date(result.syncDate);
      expect(parsed.getTime()).not.toBeNaN();
    });

    it('should handle network failure gracefully', async () => {
      const fetchFn = jest.fn().mockRejectedValue(new Error('Network error: ECONNREFUSED')) as unknown as typeof fetch;

      const db = makeDb({
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ last_date: null }], rowCount: 0 }),
      });

      const service = new EchrHudocSyncService(db, fetchFn);
      const result = await service.syncCountry({ country: 'UKR' });

      // Should not throw; should return result with error count
      expect(result.errors).toBeGreaterThan(0);
      expect(result.country).toBe('UKR');
      expect(result.totalFetched).toBe(0);
    });

    it('should handle HUDOC API returning HTTP 500', async () => {
      const fetchFn = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      }) as unknown as typeof fetch;

      const db = makeDb({
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ last_date: null }], rowCount: 0 }),
      });

      const service = new EchrHudocSyncService(db, fetchFn);
      const result = await service.syncCountry({ country: 'UKR' });

      expect(result.errors).toBeGreaterThan(0);
    });

    it('should count new records when upsert returns is_insert=true', async () => {
      const items = [makeItem('001-100'), makeItem('001-101'), makeItem('001-102')];
      const response = makeHudocResponse(3, items);
      const fetchFn = makeFetchFn([{ ok: true, status: 200, body: response }]);

      const db = makeDb({
        query: jest.fn()
          // getLastSyncDate
          .mockResolvedValueOnce({ rows: [{ last_date: null }], rowCount: 0 })
          // 3 upserts, all new
          .mockResolvedValueOnce({ rows: [{ is_insert: true }], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [{ is_insert: true }], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [{ is_insert: true }], rowCount: 1 }),
      });

      const service = new EchrHudocSyncService(db, fetchFn);
      const result = await service.syncCountry({ country: 'UKR' });

      expect(result.totalFetched).toBe(3);
      expect(result.newRecords).toBe(3);
      expect(result.updatedRecords).toBe(0);
    });

    it('should count updated records when upsert returns is_insert=false', async () => {
      const items = [makeItem('001-200')];
      const response = makeHudocResponse(1, items);
      const fetchFn = makeFetchFn([{ ok: true, status: 200, body: response }]);

      const db = makeDb({
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ last_date: null }], rowCount: 0 })
          // Record already exists, so is_insert=false
          .mockResolvedValueOnce({ rows: [{ is_insert: false }], rowCount: 1 }),
      });

      const service = new EchrHudocSyncService(db, fetchFn);
      const result = await service.syncCountry({ country: 'UKR' });

      expect(result.totalFetched).toBe(1);
      expect(result.newRecords).toBe(0);
      expect(result.updatedRecords).toBe(1);
    });

    it('should use incremental sync when last sync date exists', async () => {
      const items = [makeItem('001-300')];
      const response = makeHudocResponse(1, items);
      const fetchFn = makeFetchFn([{ ok: true, status: 200, body: response }]);

      const db = makeDb({
        query: jest.fn()
          // getLastSyncDate returns a date
          .mockResolvedValueOnce({ rows: [{ last_date: '2024-06-01' }], rowCount: 1 })
          // upsert
          .mockResolvedValue({ rows: [{ is_insert: true }], rowCount: 1 }),
      });

      const service = new EchrHudocSyncService(db, fetchFn);
      await service.syncCountry({ country: 'UKR' });

      // Verify the fetch was called with a URL containing the date filter
      expect(fetchFn).toHaveBeenCalled();
      const calledUrl = (fetchFn as jest.Mock).mock.calls[0][0] as string;
      expect(calledUrl).toContain(encodeURIComponent('2024-06-01'));
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. getLastSyncDate
// ════════════════════════════════════════════════════════════════════════════

describe('getLastSyncDate', () => {
  it('should return null when no previous sync exists', async () => {
    const db = makeDb({
      query: jest.fn().mockResolvedValue({ rows: [{ last_date: null }], rowCount: 0 }),
    });

    const service = new EchrHudocSyncService(db);
    const result = await service.getLastSyncDate('UKR');

    expect(result).toBeNull();
  });

  it('should return null when rows are empty', async () => {
    const db = makeDb({
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    });

    const service = new EchrHudocSyncService(db);
    const result = await service.getLastSyncDate('UKR');

    expect(result).toBeNull();
  });

  it('should return correct date when sync data exists', async () => {
    const db = makeDb({
      query: jest.fn().mockResolvedValue({
        rows: [{ last_date: '2024-06-01' }],
        rowCount: 1,
      }),
    });

    const service = new EchrHudocSyncService(db);
    const result = await service.getLastSyncDate('UKR');

    expect(result).toBe('2024-06-01');
  });

  it('should query with the correct country parameter', async () => {
    const queryFn = jest.fn().mockResolvedValue({ rows: [{ last_date: null }], rowCount: 0 });
    const db = makeDb({ query: queryFn });

    const service = new EchrHudocSyncService(db);
    await service.getLastSyncDate('TUR');

    expect(queryFn).toHaveBeenCalledWith(
      expect.stringContaining('echr_cases'),
      ['TUR']
    );
  });

  it('should query the echr_cases table with MAX(kp_date)', async () => {
    const queryFn = jest.fn().mockResolvedValue({ rows: [{ last_date: null }], rowCount: 0 });
    const db = makeDb({ query: queryFn });

    const service = new EchrHudocSyncService(db);
    await service.getLastSyncDate('UKR');

    const sql = queryFn.mock.calls[0][0] as string;
    expect(sql).toContain('MAX');
    expect(sql).toContain('kp_date');
    expect(sql).toContain('respondent');
  });

  it('should handle database errors', async () => {
    const db = makeDb({
      query: jest.fn().mockRejectedValue(new Error('connection refused')),
    });

    const service = new EchrHudocSyncService(db);
    await expect(service.getLastSyncDate('UKR')).rejects.toThrow('connection refused');
  });
});

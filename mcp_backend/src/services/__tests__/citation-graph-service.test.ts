/**
 * Unit tests for CitationGraphService (Neo4j-backed citation graph).
 * neo4j-driver is fully mocked — no live Neo4j required.
 */

const mockRun = jest.fn();
const mockSessionClose = jest.fn().mockResolvedValue(undefined);
const mockSession = jest.fn(() => ({ run: mockRun, close: mockSessionClose }));
const mockDriverClose = jest.fn().mockResolvedValue(undefined);

jest.mock('neo4j-driver', () => {
  const int = (n: number) => ({ __int: n, toNumber: () => n });
  return {
    __esModule: true,
    default: {
      driver: () => ({ session: mockSession, close: mockDriverClose }),
      auth: { basic: (u: string, p: string) => ({ scheme: 'basic', principal: u, credentials: p }) },
      session: { READ: 'READ' },
      int,
      isInt: (v: any) => !!v && typeof v === 'object' && '__int' in v,
    },
  };
});

import { CitationGraphService } from '../citation-graph-service.js';

function rec(obj: Record<string, any>) {
  return { get: (k: string) => obj[k] };
}
const neoInt = (n: number) => ({ __int: n, toNumber: () => n });

describe('CitationGraphService', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, CITATION_BACKEND: 'neo4j', NEO4J_URI: 'bolt://test:7687', NEO4J_PASSWORD: 'x' };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('isEnabled', () => {
    it('is true when CITATION_BACKEND=neo4j', () => {
      expect(new CitationGraphService().isEnabled()).toBe(true);
    });

    it('is false by default (postgres)', () => {
      process.env = { ...ORIGINAL_ENV };
      delete process.env.CITATION_BACKEND;
      expect(new CitationGraphService().isEnabled()).toBe(false);
    });

    it('is false for explicit postgres', () => {
      process.env = { ...ORIGINAL_ENV, CITATION_BACKEND: 'postgres' };
      expect(new CitationGraphService().isEnabled()).toBe(false);
    });
  });

  describe('getDecisionCitations', () => {
    it('maps Decision->Article records and closes the session', async () => {
      mockRun.mockResolvedValueOnce({
        records: [
          rec({ law: 'ЦПК України', article: '175', ct: 'codex_article', ctx: 'ст. 175 ЦПК' }),
          rec({ law: 'КК України', article: '185', ct: 'codex_article', ctx: 'ст. 185 КК' }),
        ],
      });

      const svc = new CitationGraphService();
      const out = await svc.getDecisionCitations('86560781');

      expect(out).toEqual([
        { law: 'ЦПК України', article: '175', citationType: 'codex_article', context: 'ст. 175 ЦПК' },
        { law: 'КК України', article: '185', citationType: 'codex_article', context: 'ст. 185 КК' },
      ]);
      // doc_id is coerced to string for the Decision key lookup
      expect(mockRun.mock.calls[0][1]).toMatchObject({ docId: '86560781' });
      expect(mockSessionClose).toHaveBeenCalled();
    });
  });

  describe('getArticleStats', () => {
    it('parses neo4j Integer properties to JS numbers', async () => {
      mockRun.mockResolvedValueOnce({
        records: [rec({ law: 'КУпАП', article: '130', tc: neoInt(2965804), ud: neoInt(1500000) })],
      });

      const stats = await new CitationGraphService().getArticleStats('КУпАП', '130');
      expect(stats).toEqual({ law: 'КУпАП', article: '130', totalCitations: 2965804, uniqueDecisions: 1500000 });
    });

    it('returns null when the article is absent', async () => {
      mockRun.mockResolvedValueOnce({ records: [] });
      expect(await new CitationGraphService().getArticleStats('X', '1')).toBeNull();
    });
  });

  describe('getDecisionCitationSummary', () => {
    it('returns top cited articles (with popularity) and total count', async () => {
      mockRun
        .mockResolvedValueOnce({
          records: [
            rec({ law: 'Кримінальний кодекс України', article: '185', ct: 'codex_article', pop: neoInt(3308876) }),
            rec({ law: 'КУпАП', article: '130', ct: 'codex_article', pop: neoInt(2965804) }),
          ],
        })
        .mockResolvedValueOnce({ records: [rec({ c: neoInt(7) })] });

      const out = await new CitationGraphService().getDecisionCitationSummary('125502043');
      expect(out.citedCount).toBe(7);
      expect(out.topCitedArticles).toEqual([
        { law: 'Кримінальний кодекс України', article: '185', citationType: 'codex_article', popularity: 3308876 },
        { law: 'КУпАП', article: '130', citationType: 'codex_article', popularity: 2965804 },
      ]);
      // docId coerced to string; runs the list + count queries
      expect(mockRun.mock.calls[0][1]).toMatchObject({ docId: '125502043' });
      expect(mockRun).toHaveBeenCalledTimes(2);
    });

    it('returns zero count and empty list when the decision has no citations', async () => {
      mockRun
        .mockResolvedValueOnce({ records: [] })
        .mockResolvedValueOnce({ records: [rec({ c: neoInt(0) })] });

      const out = await new CitationGraphService().getDecisionCitationSummary('999');
      expect(out).toEqual({ citedCount: 0, topCitedArticles: [] });
    });
  });

  describe('getArticleCitedBy', () => {
    it('returns decisions and total count from two queries', async () => {
      mockRun
        .mockResolvedValueOnce({ records: [rec({ docId: '111' }), rec({ docId: '222' })] })
        .mockResolvedValueOnce({ records: [rec({ c: neoInt(42) })] });

      const out = await new CitationGraphService().getArticleCitedBy('ЦПК України', '178');
      expect(out).toEqual({ count: 42, decisions: ['111', '222'] });
      expect(mockRun).toHaveBeenCalledTimes(2);
    });
  });

  describe('getCaseStats (decision↔case layer)', () => {
    it('returns precedent stats for the most-cited matching case', async () => {
      mockRun.mockResolvedValueOnce({
        records: [rec({ cn: '826/3858/18', mc: neoInt(18), ld: neoInt(86270655), citing: neoInt(184018) })],
      });
      const out = await new CitationGraphService().getCaseStats(['826/3858/18', '826/3858/2018']);
      expect(out).toEqual({
        causeNum: '826/3858/18',
        citingDecisions: 184018,
        memberCount: 18,
        latestDocId: '86270655',
        departedByDecision: null,
        departedOn: null,
      });
      expect(mockRun.mock.calls[0][1]).toMatchObject({ cns: ['826/3858/18', '826/3858/2018'] });
    });

    it('surfaces a Grand Chamber departure (DEPARTS_FROM) when present', async () => {
      mockRun.mockResolvedValueOnce({
        records: [rec({ cn: '761/15791/15-ц', mc: neoInt(4), ld: neoInt(72150984), citing: neoInt(0), depBy: '72150984', depOn: '2018-01-29' })],
      });
      const out = await new CitationGraphService().getCaseStats(['761/15791/15-ц']);
      expect(out).toMatchObject({ departedByDecision: '72150984', departedOn: '2018-01-29' });
    });

    it('returns null for empty input without querying', async () => {
      const out = await new CitationGraphService().getCaseStats([]);
      expect(out).toBeNull();
      expect(mockRun).not.toHaveBeenCalled();
    });

    it('returns null when no Case node matches', async () => {
      mockRun.mockResolvedValueOnce({ records: [] });
      expect(await new CitationGraphService().getCaseStats(['x/1'])).toBeNull();
    });
  });

  describe('getCaseCitedBy / getDecisionCitedCases', () => {
    it('returns citing decision doc_ids for a case', async () => {
      mockRun.mockResolvedValueOnce({ records: [rec({ docId: '111' }), rec({ docId: '222' })] });
      expect(await new CitationGraphService().getCaseCitedBy('826/3858/18', 50)).toEqual(['111', '222']);
    });

    it('returns cases a decision cites with member/latest metadata', async () => {
      mockRun.mockResolvedValueOnce({
        records: [rec({ cn: '240/4937/18', mc: neoInt(26), ld: neoInt(104672151) })],
      });
      const out = await new CitationGraphService().getDecisionCitedCases('500');
      expect(out).toEqual([{ causeNum: '240/4937/18', memberCount: 26, latestDocId: '104672151' }]);
    });
  });

  describe('healthCheck', () => {
    it('returns ok with node-label counts', async () => {
      mockRun.mockResolvedValueOnce({
        records: [
          rec({ label: 'Decision', c: neoInt(33138541) }),
          rec({ label: 'Article', c: neoInt(3133367) }),
          rec({ label: null, c: neoInt(0) }),
        ],
      });

      const h = await new CitationGraphService().healthCheck();
      expect(h.ok).toBe(true);
      expect(h.enabled).toBe(true);
      expect(h.counts).toEqual({ Decision: 33138541, Article: 3133367 });
    });

    it('returns ok=false with error on driver failure', async () => {
      mockRun.mockRejectedValueOnce(new Error('connection refused'));
      const h = await new CitationGraphService().healthCheck();
      expect(h.ok).toBe(false);
      expect(h.error).toContain('connection refused');
    });
  });

  describe('getCitationGraph', () => {
    it('builds decision/article/law nodes and edges at depth 1', async () => {
      mockRun.mockResolvedValueOnce({
        records: [rec({ law: 'ЦПК України', article: '175', ct: 'codex_article', ctx: null })],
      });

      const g = await new CitationGraphService().getCitationGraph('500', 1);
      expect(g.root).toEqual({ docId: '500' });
      expect(g.nodes).toEqual(
        expect.arrayContaining([
          { id: 'decision:500', type: 'decision', label: '500' },
          { id: 'article:ЦПК України|175', type: 'article', label: 'ЦПК України ст.175' },
          { id: 'law:ЦПК України', type: 'law', label: 'ЦПК України' },
        ])
      );
      expect(g.edges).toEqual(
        expect.arrayContaining([
          { from: 'decision:500', to: 'article:ЦПК України|175', type: 'CITES_ARTICLE' },
          { from: 'article:ЦПК України|175', to: 'law:ЦПК України', type: 'OF_LAW' },
        ])
      );
    });
  });

  describe('close', () => {
    it('closes the driver if initialized', async () => {
      const svc = new CitationGraphService();
      mockRun.mockResolvedValueOnce({ records: [] });
      await svc.getDecisionCitations('1'); // triggers driver init
      await svc.close();
      expect(mockDriverClose).toHaveBeenCalled();
    });
  });
});

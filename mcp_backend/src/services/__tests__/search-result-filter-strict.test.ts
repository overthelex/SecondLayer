/**
 * CORE-21 P1.5b — strict relevance threshold for FTS-collapsed (vector-only) fusion.
 * Verifies the parameterized keep-threshold in SearchResultFilter.
 */
import { SearchResultFilter, STRICT_MIN_SCORE } from '../search-result-filter';

function mkResults(n: number) {
  return Array.from({ length: n }, (_, i) => ({ doc_id: i + 1, cause_num: `${i + 1}/2/24`, court_name: 'КАС ВС' }));
}

function llmReturning(scores: Record<number, number>, capture?: { prompt?: string }) {
  return {
    chatCompletion: jest.fn().mockImplementation((req: any) => {
      if (capture) capture.prompt = req.messages.find((m: any) => m.role === 'system')?.content;
      const arr = Object.entries(scores).map(([d, s]) => ({ doc_id: Number(d), score: s }));
      return Promise.resolve({ content: JSON.stringify(arr) });
    }),
  } as any;
}

describe('SearchResultFilter strict threshold (CORE-21 P1.5b)', () => {
  const results = mkResults(9); // >= MIN_RESULTS_TO_FILTER (8)
  const scores: Record<number, number> = { 1: 9, 2: 8, 3: 6, 4: 6, 5: 5, 6: 4, 7: 3, 8: 6, 9: 7 };

  it('default keeps score >= 5 (partially relevant survive)', async () => {
    const out = await new SearchResultFilter(llmReturning(scores)).filterResults(results, 'q');
    expect(out.filtered.map(r => r.doc_id).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 8, 9]);
  });

  it('strict (minScore 7) drops the 5-6 flood, keeps only 7-10', async () => {
    const out = await new SearchResultFilter(llmReturning(scores))
      .filterResults(results, 'q', { minScore: STRICT_MIN_SCORE });
    expect(out.filtered.map(r => r.doc_id).sort((a, b) => a - b)).toEqual([1, 2, 9]);
  });

  it('threads the threshold into the ranking prompt', async () => {
    const cap: { prompt?: string } = {};
    await new SearchResultFilter(llmReturning(scores, cap))
      .filterResults(results, 'q', { minScore: STRICT_MIN_SCORE });
    expect(cap.prompt).toContain('>= 7');
  });

  it('uses the default >= 5 in the prompt when no option is passed', async () => {
    const cap: { prompt?: string } = {};
    await new SearchResultFilter(llmReturning(scores, cap)).filterResults(results, 'q');
    expect(cap.prompt).toContain('>= 5');
  });

  it('still skips filtering below the 8-result floor even when strict', async () => {
    const out = await new SearchResultFilter(llmReturning(scores))
      .filterResults(mkResults(5), 'q', { minScore: STRICT_MIN_SCORE });
    expect(out.filtered.length).toBe(5);
  });

  it('STRICT_MIN_SCORE is 7', () => {
    expect(STRICT_MIN_SCORE).toBe(7);
  });
});

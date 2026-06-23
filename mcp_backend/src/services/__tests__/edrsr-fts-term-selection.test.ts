/**
 * CORE-21 P1.5a — IDF-weighted FTS term selection.
 * selectFtsTerms (pure ordering) + EdsrFtsService.lexemeDf (df → idf, db-backed).
 */
import { selectFtsTerms, EdsrFtsService } from '../edrsr-fts-service';

describe('selectFtsTerms (CORE-21 P1.5a)', () => {
  // Mimics lexemeDf output: common terms low idf, discriminative terms high.
  const idf = new Map<string, number>([
    ['податок', 0.2], ['нерухоме', 1.0], ['майно', 0.3],
    ['окупована', 4.0], ['територія', 2.0], ['донецьк', 5.0],
  ]);
  const reproTokens = ['податок', 'нерухоме', 'майно', 'окупована', 'територія', 'Донецьк'];

  it('orders discriminative (rare) terms first, common last', () => {
    const out = selectFtsTerms(reproTokens, idf);
    expect(out.slice(0, 3)).toEqual(['Донецьк', 'окупована', 'територія']);
    expect(out.slice(-2)).toEqual(['майно', 'податок']); // commonest → relaxation drops these first
  });

  it('keeps the rare occupation/ДРРП terms across relaxation', () => {
    // Relaxation pops from the tail; dropping the 3 commonest still leaves the rare ones.
    const ranked = selectFtsTerms(reproTokens, idf);
    expect(ranked.slice(0, 3)).toEqual(expect.arrayContaining(['Донецьк', 'окупована']));
    expect(ranked.indexOf('податок')).toBeGreaterThan(ranked.indexOf('Донецьк'));
  });

  it('falls back to the original positional order when the idf map is empty', () => {
    expect(selectFtsTerms(['a', 'b', 'c'], new Map())).toEqual(['a', 'b', 'c']);
  });

  it('is a stable sort on equal idf (input order preserved)', () => {
    const flat = new Map([['x', 1], ['y', 1], ['z', 1]]);
    expect(selectFtsTerms(['x', 'y', 'z'], flat)).toEqual(['x', 'y', 'z']);
  });

  it('matches tokens case-insensitively but returns original casing', () => {
    expect(selectFtsTerms(['Донецьк', 'податок'], idf)).toEqual(['Донецьк', 'податок']);
  });
});

describe('EdsrFtsService.lexemeDf (CORE-21 P1.5a)', () => {
  const svc = new EdsrFtsService();

  function dbReturning(rows: any[], probeRows: any[] = []) {
    return {
      query: jest.fn().mockImplementation((sql: string) =>
        Promise.resolve({ rows: /LIMIT 1/.test(sql) ? probeRows : rows })),
    };
  }

  it('computes idf for matched lexemes and max idf for absent ones (table populated)', async () => {
    const db = dbReturning([
      { lexeme: 'податок', df: 900, sample_docs: 1000 },
      { lexeme: 'донецьк', df: 10, sample_docs: 1000 },
    ]);
    const m = await svc.lexemeDf(['податок', 'донецьк', 'окупована'], db);
    expect(m.get('податок')!).toBeCloseTo(Math.log(1000 / 900));
    expect(m.get('донецьк')!).toBeCloseTo(Math.log(1000 / 10));
    expect(m.get('окупована')!).toBeCloseTo(Math.log(1000)); // absent + populated → max idf
    expect(m.get('донецьк')!).toBeGreaterThan(m.get('податок')!);
  });

  it('returns an empty map when the df table is empty (positional fallback)', async () => {
    const m = await svc.lexemeDf(['податок', 'донецьк'], dbReturning([], []));
    expect(m.size).toBe(0);
  });

  it('never throws — returns an empty map on db error', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('relation does not exist')) };
    const m = await svc.lexemeDf(['x'], db);
    expect(m.size).toBe(0);
  });

  it('lowercases tokens before lookup', async () => {
    const db = dbReturning([{ lexeme: 'донецьк', df: 10, sample_docs: 1000 }]);
    const m = await svc.lexemeDf(['Донецьк'], db);
    expect(m.get('донецьк')!).toBeCloseTo(Math.log(1000 / 10));
  });
});

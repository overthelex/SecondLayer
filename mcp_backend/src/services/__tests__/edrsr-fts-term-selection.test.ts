/**
 * CORE-21 P1.5a — IDF-weighted FTS term selection.
 * selectFtsTerms (pure ordering) + EdsrFtsService.lexemeDf (df → idf, db-backed).
 */
import { selectFtsTerms, EdsrFtsService, sanitizeFtsToken, buildPrefixTsquery } from '../edrsr-fts-service';

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

describe('selectFtsTerms — anchor-floor demotion (LEXAI Cause-A)', () => {
  // sample 3.0M → floor = 3.0M * 1e-4 = 300 docs. "сумування"/"дррп" sub-floor (junk);
  // "окупована"/"нерухоме" well above. Junk has HIGH idf (rare) yet must NOT lead.
  const sampleDocs = 3_000_000;
  const idf = new Map<string, number>([
    ['окупована', Math.log(sampleDocs / 41321)],
    ['нерухоме', Math.log(sampleDocs / 193320)],
    ['сумування', Math.log(sampleDocs / 80)],   // rarest → highest idf
    ['дррп', Math.log(sampleDocs / 526)],        // just above floor
  ]);
  const df = new Map<string, number>([
    ['окупована', 41321], ['нерухоме', 193320], ['сумування', 80], ['дррп', 526],
  ]);
  const tokens = ['сумування', 'окупована', 'дррп', 'нерухоме'];

  it('demotes sub-floor junk to the tail even though it has the highest idf', () => {
    const out = selectFtsTerms(tokens, idf, { df, sampleDocs });
    // anchors (df ≥ 300) first, ordered by idf desc: окупована (rarer) before нерухоме;
    // дррп (526) is an anchor too. сумування (80 < 300) is demoted to LAST.
    expect(out[out.length - 1]).toBe('сумування');
    expect(out.indexOf('окупована')).toBeLessThan(out.indexOf('сумування'));
    expect(out.indexOf('нерухоме')).toBeLessThan(out.indexOf('сумування'));
  });

  it('keeps idf-only behaviour (junk leads) when df is NOT supplied — proves the regression', () => {
    const out = selectFtsTerms(tokens, idf);            // no df → old behaviour
    expect(out[0]).toBe('сумування');                   // rarest leads → this is the bug
  });

  it('never empties an all-junk query — returns least-rare junk first', () => {
    const jIdf = new Map([['сумування', 5.0], ['ввп', 6.0]]);
    const jDf = new Map([['сумування', 80], ['ввп', 20]]);
    const out = selectFtsTerms(['ввп', 'сумування'], jIdf, { df: jDf, sampleDocs });
    expect(out).toEqual(['сумування', 'ввп']);          // both weak → df desc (80 before 20)
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

  it('lexemeStats returns raw df (0 for absent) and the sample size (LEXAI Cause-A)', async () => {
    const db = dbReturning([
      { lexeme: 'окупована', df: 41321, sample_docs: 3_000_000 },
      { lexeme: 'сумування', df: 80, sample_docs: 3_000_000 },
    ]);
    const s = await svc.lexemeStats(['Окупована', 'сумування', 'абракадабра'], db);
    expect(s.sampleDocs).toBe(3_000_000);
    expect(s.df.get('окупована')).toBe(41321);
    expect(s.df.get('сумування')).toBe(80);
    expect(s.df.get('абракадабра')).toBe(0);                 // absent → 0, the junk signal
    expect(s.idf.get('окупована')!).toBeCloseTo(Math.log(3_000_000 / 41321));
  });

  it('lexemeStats degrades to empty maps + 0 sample on db error', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('relation does not exist')) };
    const s = await svc.lexemeStats(['x'], db);
    expect(s.idf.size).toBe(0);
    expect(s.df.size).toBe(0);
    expect(s.sampleDocs).toBe(0);
  });
});

describe('prefix tsquery helpers (LEXAI Cause-A.2)', () => {
  it('sanitizeFtsToken lowercases and strips tsquery metacharacters', () => {
    expect(sanitizeFtsToken('Окупована:*')).toBe('окупована');
    expect(sanitizeFtsToken('60-кв.м')).toBe('60квм');
    expect(sanitizeFtsToken('a&b|c!')).toBe('abc');
  });

  it('buildPrefixTsquery ANDs stems with :* prefix', () => {
    expect(buildPrefixTsquery(['окупован', 'нерухом'])).toBe('окупован:* & нерухом:*');
  });

  it('buildPrefixTsquery returns null when nothing usable', () => {
    expect(buildPrefixTsquery([])).toBeNull();
    expect(buildPrefixTsquery(['', '  '])).toBeNull();
  });
});

describe('EdsrFtsService.snapTokensToStems (LEXAI Cause-A.2)', () => {
  const svc = new EdsrFtsService();
  // floor at sampleDocs 3.0M = max(8, 3.0M*1e-4) = 300.
  function db(prefixDf: Record<string, number>, sampleDocs = 3_000_000) {
    return {
      query: jest.fn().mockImplementation((sql: string) => {
        if (/LIMIT 1/.test(sql)) return Promise.resolve({ rows: [{ sample_docs: sampleDocs }] });
        // unnest candidates query → return df for known prefixes, 0 otherwise
        return Promise.resolve({ rows: Object.entries(prefixDf).map(([cand, d]) => ({ cand, df: d })) });
      }),
    };
  }

  it('snaps a declined token to the SHORTEST above-floor stem (inflection-tolerant)', async () => {
    // shortest valid prefix wins so the :* query catches all declensions. "нерух" (≥floor)
    // is chosen over the longer "нерухом"/"нерухомість".
    const m = await svc.snapTokensToStems(['нерухомість'], db({ 'нерух': 193320, 'нерухом': 193000, 'нерухомість': 5000 }));
    expect(m.get('нерухомість')).toBe('нерух');
  });

  it('skips below-floor short prefixes and snaps to the first above-floor one', async () => {
    // "окуп"/"окупо" sub-floor here; "окупов" clears it → snapped (not the full form).
    const m = await svc.snapTokensToStems(['окупована'], db({ 'окупо': 50, 'окупов': 41321, 'окупован': 41000 }));
    expect(m.get('окупована')).toBe('окупов');
  });

  it('drops junk with no above-floor corpus stem', async () => {
    const m = await svc.snapTokensToStems(['сумування'], db({ 'сумування': 80, 'сумуван': 80, 'сумув': 90 }));
    expect(m.has('сумування')).toBe(false);
  });

  it('returns empty map when the df table is empty (plainto fallback)', async () => {
    const m = await svc.snapTokensToStems(['окупована'], db({}, 0));
    expect(m.size).toBe(0);
  });

  it('never throws — empty map on db error', async () => {
    const errDb = { query: jest.fn().mockRejectedValue(new Error('boom')) };
    expect((await svc.snapTokensToStems(['окупована'], errDb)).size).toBe(0);
  });
});

/**
 * Parity between the TypeScript normaliser and npa.norm_number() in Postgres.
 *
 * The SQL function is the definition — it is what the alias table was built
 * with and what every DB-backed lookup uses. The TS port exists for offline
 * callers. If the two drift, resolution silently stops matching stored aliases,
 * so both are checked against the SAME fixture.
 *
 * The DB half is skipped without DATABASE_URL, like the other DB-touching
 * suites here. It is the half that actually proves parity; the offline half
 * only protects the port.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { normalizeActNumber, pickActNumber, type ActNumberMatch } from '../act-number.js';

interface Vector { in: string; norm: string; note: string }

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), '..', 'config', 'act-number-vectors.json'), 'utf-8')
) as { cases: Vector[] };

describe('normalizeActNumber (TypeScript port)', () => {
  it('loads the shared fixture', () => {
    expect(fixture.cases.length).toBeGreaterThan(30);
  });

  it.each(fixture.cases)('$in -> $norm ($note)', ({ in: input, norm }) => {
    expect(normalizeActNumber(input)).toBe(norm);
  });

  it('keeps постанова and розпорядження apart', () => {
    // A visual homoglyph fold sends both п and р to "p". These are different acts.
    expect(normalizeActNumber('154-2022-п')).not.toBe(normalizeActNumber('154-2022-р'));
  });

  it('keeps the 2993 letter-index family apart', () => {
    const forms = ['2993е-12', '2993є-12', '2993і-12', '2993й-12', '2993ї-12', '2993ж-12'];
    const normalised = forms.map(normalizeActNumber);
    expect(new Set(normalised).size).toBe(forms.length);
  });

  it('makes a Cyrillic-typed Roman numeral meet the Latin one', () => {
    expect(normalizeActNumber('2262-ХІІ')).toBe(normalizeActNumber('2262-XII'));
  });
});

describe('article-number prefix stripping (npa-tools mode=article)', () => {
  // Mirrors the expression in npa-tools.ts. Longest-first alternation is the
  // whole point: with (ст|стаття|…) the engine matches «ст», the optional dot
  // and spaces match empty, and it never backtracks — «стаття 111» came out as
  // «аття111» and matched no article at all.
  const strip = (s: string) =>
    s.replace(/^\s*(стаття|статті|статтею|ст|пункт|пп|п)\.?\s*/i, '')
      .replace(/[–—]/g, '-')
      .replace(/\s+/g, '')
      .trim();

  it.each([
    ['стаття 111', '111'],
    ['статті 111-1', '111-1'],
    ['статтею 625', '625'],
    ['ст. 111', '111'],
    ['ст.111', '111'],
    ['пункт 3', '3'],
    ['п. 3', '3'],
    ['111', '111'],
    ['111 - 1', '111-1'],
    ['111–1', '111-1'],
    ['205-1', '205-1'],
  ])('%s -> %s', (input, expected) => {
    expect(strip(input)).toBe(expected);
  });

  it('never leaves a Cyrillic remnant', () => {
    for (const s of ['стаття 111', 'статті 12', 'пункт 3', 'статтею 625']) {
      expect(strip(s)).toMatch(/^[0-9-]+$/);
    }
  });
});

describe('pickActNumber', () => {
  const m = (nreg: string, kind: string, confidence = 1): ActNumberMatch =>
    ({ nreg, kind, aliasRaw: nreg, confidence });

  it('takes a lone match', () => {
    expect(pickActNumber([m('2755-17', 'official')]).nreg).toBe('2755-17');
  });

  it('prefers a stronger kind', () => {
    const r = pickActNumber([m('2755-17', 'nreg'), m('9999-20', 'core_only', 0.5)]);
    expect(r.nreg).toBe('2755-17');
  });

  it('refuses to guess between equals, and hands back the candidates', () => {
    // «8073-X» is КУпАП, split by Rada across three registry ids. Picking the
    // first would attribute law to the wrong half of the code.
    const r = pickActNumber([m('8073-10', 'official'), m('80731-10', 'official'), m('80732-10', 'official')]);
    expect(r.nreg).toBeNull();
    expect(r.ambiguous).toHaveLength(3);
  });

  it('refuses to guess between the УРСР and Ukraine Roman collision', () => {
    // cc 08 renders VIII, and so does cc 19 (19 - 11). «117-VIII» is two acts.
    const r = pickActNumber([m('117-08', 'official'), m('117-19', 'official')]);
    expect(r.nreg).toBeNull();
  });

  it('returns nothing for no matches', () => {
    expect(pickActNumber([]).nreg).toBeNull();
  });
});

const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb('npa.norm_number parity (requires DATABASE_URL)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Pool } = require('pg');
  let pool: any;

  beforeAll(() => { pool = new Pool({ connectionString: process.env.DATABASE_URL }); });
  afterAll(async () => { await pool?.end(); });

  it('agrees with the TypeScript port on every fixture case', async () => {
    const inputs = fixture.cases.map((c) => c.in);
    const { rows } = await pool.query(
      'SELECT i AS input, npa.norm_number(i) AS norm FROM unnest($1::text[]) AS i',
      [inputs]
    );
    const bySql = new Map<string, string>(rows.map((r: any) => [r.input, r.norm]));

    const drift: string[] = [];
    for (const c of fixture.cases) {
      const sql = bySql.get(c.in);
      const ts = normalizeActNumber(c.in);
      if (sql !== c.norm) drift.push(`SQL ${JSON.stringify(c.in)} -> ${JSON.stringify(sql)}, fixture ${JSON.stringify(c.norm)}`);
      if (ts !== sql) drift.push(`TS ${JSON.stringify(c.in)} -> ${JSON.stringify(ts)}, SQL ${JSON.stringify(sql)}`);
    }
    expect(drift).toEqual([]);
  });
});

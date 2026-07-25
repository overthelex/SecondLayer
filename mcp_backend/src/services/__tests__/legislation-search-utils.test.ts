/**
 * Unit tests for the hybrid legislation retrieval helpers (LEXAI-1806).
 * These cover the ranking math only — no DB / Qdrant needed.
 */

import {
  HYBRID_RRF_K,
  MEGA_RECORD_CHAR_THRESHOLD,
  ARTICLE_NUMBER_MATCH_BOOST,
  TRANSITIONAL_BOOST,
  MEGA_RECORD_PENALTY_FACTOR,
  legislationKey,
  bareArticleNumber,
  extractArticleNumberTokens,
  buildLegislationTsquery,
  fuseRankLists,
  applyLegislationBoosts,
} from '../legislation-search-utils';

describe('legislationKey', () => {
  it('lowercases rada_id and keeps article_number verbatim', () => {
    expect(legislationKey('2755-17', '266')).toBe('2755-17:266');
    expect(legislationKey('254К/96-ВР', '124')).toBe('254к/96-вр:124');
    expect(legislationKey('2755-17', 'п.38.6')).toBe('2755-17:п.38.6');
  });
});

describe('bareArticleNumber', () => {
  it('strips transitional prefixes', () => {
    expect(bareArticleNumber('п.38.6')).toBe('38.6');
    expect(bareArticleNumber('п. 69.22')).toBe('69.22');
    expect(bareArticleNumber('ст.266')).toBe('266');
  });
  it('leaves bare numbers untouched', () => {
    expect(bareArticleNumber('266')).toBe('266');
    expect(bareArticleNumber('354-1')).toBe('354-1');
  });
});

describe('extractArticleNumberTokens', () => {
  it('pulls article and point tokens', () => {
    expect(extractArticleNumberTokens('пільга за ст 266 та п 38.6 і 69.22')).toEqual(
      expect.arrayContaining(['266', '38.6', '69.22'])
    );
  });
  it('drops 4-digit years to avoid date noise', () => {
    const tokens = extractArticleNumberTokens('окупація з 14 квітня 2014 року, стаття 266');
    expect(tokens).toContain('266');
    expect(tokens).toContain('14');
    expect(tokens).not.toContain('2014');
  });
  it('dedupes', () => {
    expect(extractArticleNumberTokens('266 266 266')).toEqual(['266']);
  });
  it('returns [] for text with no numbers', () => {
    expect(extractArticleNumberTokens('податок на нерухоме майно')).toEqual([]);
  });
});

describe('buildLegislationTsquery', () => {
  it('builds OR-of-prefixes from content tokens', () => {
    const q = buildLegislationTsquery('податок на нерухоме майно окупованій території');
    expect(q).toContain(':*');
    expect(q).toContain(' | ');
    // stems, not full inflected forms — so "нерухомого" / "територія" also match
    expect(q).toContain('нерух:*');
    expect(q).toContain('терито:*');
  });
  it('drops stopwords and short tokens', () => {
    const q = buildLegislationTsquery('на про від що як');
    expect(q).toBe('');
  });
  it('drops pure-number tokens (handled by the article_number branch instead)', () => {
    const q = buildLegislationTsquery('266 нерухоме');
    expect(q).toContain('нерух:*');
    expect(q).not.toContain('266');
  });
  it('returns empty string for empty input (caller must skip to_tsquery)', () => {
    expect(buildLegislationTsquery('')).toBe('');
  });
});

describe('fuseRankLists (RRF)', () => {
  it('accumulates score for keys present in both legs', () => {
    const scores = fuseRankLists(['a', 'b'], ['b', 'c']);
    // b is rank 2 in vector (1/(k+2)) and rank 1 in fts (1/(k+1))
    const expectedB = 1 / (HYBRID_RRF_K + 1) + 1 / (HYBRID_RRF_K + 2);
    expect(scores.get('b')).toBeCloseTo(expectedB, 10);
    // a only in vector at rank 1, c only in fts at rank 2
    expect(scores.get('a')).toBeCloseTo(1 / (HYBRID_RRF_K + 1), 10);
    expect(scores.get('c')).toBeCloseTo(1 / (HYBRID_RRF_K + 2), 10);
    // b (both legs) outranks single-leg keys
    expect(scores.get('b')!).toBeGreaterThan(scores.get('a')!);
    expect(scores.get('b')!).toBeGreaterThan(scores.get('c')!);
  });
  it('handles an empty leg', () => {
    const scores = fuseRankLists([], ['x', 'y']);
    expect(scores.get('x')).toBeCloseTo(1 / (HYBRID_RRF_K + 1), 10);
    expect(scores.size).toBe(2);
  });
});

describe('applyLegislationBoosts', () => {
  const base = 0.01;
  it('boosts an exact article-number token match', () => {
    const scored = applyLegislationBoosts(
      base,
      { article_number: '266', full_text_length: 5000, is_transitional: false },
      ['266']
    );
    expect(scored).toBeCloseTo(base + ARTICLE_NUMBER_MATCH_BOOST, 10);
  });
  it('matches a transitional point number after stripping the п. prefix', () => {
    const scored = applyLegislationBoosts(
      base,
      { article_number: 'п.38.6', full_text_length: 2725, is_transitional: true },
      ['38.6']
    );
    expect(scored).toBeCloseTo(base + ARTICLE_NUMBER_MATCH_BOOST + TRANSITIONAL_BOOST, 10);
  });
  it('demotes a mega-record even when its number token matches', () => {
    const megaLen = MEGA_RECORD_CHAR_THRESHOLD + 1;
    const scored = applyLegislationBoosts(
      base,
      { article_number: '346', full_text_length: megaLen, is_transitional: false },
      ['346']
    );
    // penalty is multiplicative and applied last
    expect(scored).toBeCloseTo((base + ARTICLE_NUMBER_MATCH_BOOST) * MEGA_RECORD_PENALTY_FACTOR, 10);
  });
  it('a real transitional provision outranks the demoted mega-record', () => {
    const mega = applyLegislationBoosts(
      1 / (HYBRID_RRF_K + 1),
      { article_number: '346', full_text_length: 997546, is_transitional: false },
      []
    );
    const real = applyLegislationBoosts(
      1 / (HYBRID_RRF_K + 3),
      { article_number: 'п.69.22', full_text_length: 13464, is_transitional: true },
      ['69.22']
    );
    expect(real).toBeGreaterThan(mega);
  });
  it('leaves score unchanged when nothing applies', () => {
    const scored = applyLegislationBoosts(
      base,
      { article_number: '500', full_text_length: 1000, is_transitional: false },
      ['266']
    );
    expect(scored).toBe(base);
  });
});

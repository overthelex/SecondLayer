import { articleGroundingRatio } from '../legislation-tools';

/**
 * Regression for the search_legislation grounding guard (LEXAI): the AI classifier can
 * confidently resolve a plausible-but-wrong article. The grounding ratio must be LOW for an
 * off-topic article (so the handler supplements with semantic search) and HIGH for the
 * genuinely relevant one.
 */
describe('articleGroundingRatio', () => {
  // Real-world miss from chat-c758e2a4: query about ВПО/occupied-territory property-tax
  // пільги was resolved to ст. 265 "склад податку на майно" (wrong) instead of ст. 266.
  const query =
    'податок на нерухоме майно окупована територія звільнення від оподаткування пільга ВПО';

  const article265 =
    'Склад податку на майно 265.1. Податок на майно складається з: податку на нерухоме майно, ' +
    'відмінне від земельної ділянки; транспортного податку; плати за землю.';

  const article266 =
    'Податок на нерухоме майно, відмінне від земельної ділянки. Пільги із сплати податку. ' +
    'Звільнення від оподаткування об’єктів на тимчасово окупованій території. База оподаткування ' +
    'зменшується для внутрішньо переміщених осіб (ВПО).';

  it('flags an off-topic article as poorly grounded', () => {
    const ratio = articleGroundingRatio(query, article265);
    expect(ratio).toBeLessThan(0.5);
  });

  it('rates the on-topic article as well grounded', () => {
    const ratio = articleGroundingRatio(query, article266);
    expect(ratio).toBeGreaterThanOrEqual(0.5);
  });

  it('does not flag when the query has no distinctive terms', () => {
    expect(articleGroundingRatio('ст 5', 'будь-який текст')).toBe(1);
  });

  it('tolerates Ukrainian inflection via prefix matching', () => {
    // query "оподаткування" vs article "оподаткуванню" — same stem, different ending.
    expect(articleGroundingRatio('оподаткування пільга', 'правила оподаткуванню та пільгам'))
      .toBeGreaterThanOrEqual(0.5);
  });
});

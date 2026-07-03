jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../adapters/rada-api-adapter', () => ({ RadaAPIAdapter: class {} }));
jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

import { BillService } from '../bill-service';

// LEXAI-1819: the bill_documents FTS uses the 'simple' config (no Ukrainian
// stemmer), so full-word prefixes break on inflection («патентний:*» does not
// match «патентним») and strict AND makes multi-word natural queries brittle.

describe('BillService.toPrefixTsQuery', () => {
  it('truncates Cyrillic tokens to inflection-tolerant stems', () => {
    // «патентним тролінгом» in the bill title must be matched by the
    // nominative-case query — repro from MSP demo query 2 (2026-07-03)
    expect(BillService.toPrefixTsQuery('патентний тролінг')).toBe('патентн:* & тролінг:*');
    expect(BillService.toPrefixTsQuery('торговельні марки промислові зразки')).toBe(
      'торговельн:* & марк:* & промисл:* & зразк:*'
    );
    expect(BillService.toPrefixTsQuery('патентного тролінгу')).toBe('патентн:* & тролінг:*');
  });

  it('keeps Latin and numeric tokens as-is', () => {
    expect(BillService.toPrefixTsQuery('NEMIROFF 2258')).toBe('nemiroff:* & 2258:*');
  });

  it('keeps short tokens whole (no over-truncation below 4-char stems)', () => {
    expect(BillService.toPrefixTsQuery('для прав дії')).toBe('для:* & прав:* & дії:*');
  });

  it('drops single-character tokens and returns empty for unusable input', () => {
    expect(BillService.toPrefixTsQuery('і в')).toBe('');
    expect(BillService.toPrefixTsQuery('!!!')).toBe('');
  });

  it('builds an OR query when requested', () => {
    expect(BillService.toPrefixTsQuery('патентний тролінг', '|')).toBe('патентн:* | тролінг:*');
  });
});

describe('BillService.searchBillDocuments OR-relaxation fallback', () => {
  const makeService = (queryImpl: jest.Mock) =>
    new BillService({ query: queryImpl } as any, {} as any);

  it('re-runs with OR semantics when the AND pass finds nothing for a multi-word query', async () => {
    const row = { doc_id: 1, bill_number: '2258' };
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] }) // AND pass
      .mockResolvedValueOnce({ rows: [row] }); // OR pass
    const service = makeService(query);

    const result = await service.searchBillDocuments({ query: 'патентний тролінг закон' });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][1][0]).toContain(' & ');
    expect(query.mock.calls[1][1][0]).toContain(' | ');
    expect(result.documents).toEqual([row]);
    expect(result.relaxed).toBe(true);
  });

  it('does not relax when the AND pass has results', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ doc_id: 1 }] });
    const service = makeService(query);

    const result = await service.searchBillDocuments({ query: 'патентний тролінг' });

    expect(query).toHaveBeenCalledTimes(1);
    expect(result.relaxed).toBeUndefined();
  });

  it('does not relax single-token queries (OR would change nothing)', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const service = makeService(query);

    const result = await service.searchBillDocuments({ query: 'тролінг' });

    expect(query).toHaveBeenCalledTimes(1);
    expect(result.documents).toEqual([]);
  });
});

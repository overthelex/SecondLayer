import {
  buildWhere,
  parseCourtSearchIR,
  parseIntentIR,
  CourtSearchIR,
  PROCEDURE_TO_JUSTICE_KIND,
} from '../src/query-ir';
import type { FieldDef } from '../src/query-ir';

describe('query-ir / parseCourtSearchIR', () => {
  it('accepts a valid IR and returns typed value', () => {
    const r = parseCourtSearchIR({
      query_fts: 'оренда землі',
      procedure_code: 'gpc',
      justice_kind: 3,
      court_level: 'cassation',
      party_role: 'plaintiff',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.procedure_code).toBe('gpc');
      expect(r.value.justice_kind).toBe(3);
    }
  });

  it('DROPS unknown fields (injection guard via z.strictObject)', () => {
    const r = parseCourtSearchIR({
      query_fts: 'тест',
      ['; DROP TABLE decisions;--']: 1,
      arbitrary_filter: 'x',
    });
    // strictObject => unknown keys make it fail, never silently pass through
    expect(r.ok).toBe(false);
  });

  it('rejects enum values outside the whitelist', () => {
    const r = parseCourtSearchIR({ court_level: 'supreme_galactic_court' });
    expect(r.ok).toBe(false);
  });

  it('rejects malformed dates', () => {
    const r = parseCourtSearchIR({ date_from: '06/01/2026' });
    expect(r.ok).toBe(false);
  });

  it('extracts JSON object from a raw LLM string', () => {
    const r = parseCourtSearchIR('here you go:\n{"query_fts":"борг","justice_kind":1}\nhope it helps');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.justice_kind).toBe(1);
  });

  it('degrades (ok:false, no throw) on garbage input', () => {
    expect(parseCourtSearchIR('not json at all').ok).toBe(false);
    expect(parseCourtSearchIR(42).ok).toBe(false);
    expect(parseCourtSearchIR(null).ok).toBe(false);
  });
});

describe('query-ir / parseIntentIR', () => {
  it('validates query_type against the whitelist and keeps stable slot names', () => {
    const r = parseIntentIR({
      query_type: 'registry_lookup',
      slots: { edrpou: '12345678' },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.slots?.edrpou).toBe('12345678');
  });

  it('rejects an unknown query_type', () => {
    expect(parseIntentIR({ query_type: 'time_travel' }).ok).toBe(false);
  });
});

describe('query-ir / PROCEDURE_TO_JUSTICE_KIND', () => {
  it('maps procedure codes to justice kinds', () => {
    expect(PROCEDURE_TO_JUSTICE_KIND.cpc).toBe(1);
    expect(PROCEDURE_TO_JUSTICE_KIND.crpc).toBe(2);
    expect(PROCEDURE_TO_JUSTICE_KIND.gpc).toBe(3);
    expect(PROCEDURE_TO_JUSTICE_KIND.cac).toBe(4);
  });
});

describe('query-ir / buildWhere', () => {
  const FIELDS: FieldDef[] = [
    { name: 'name', match: 'ilike', columns: ['name'] },
    { name: 'edrpou', match: 'exact', columns: ['edrpou'] },
    { name: 'justice_kind', match: 'exact', columns: ['d.justice_kind'], type: 'number' },
    { name: 'code', match: 'exact', columns: ['code'], transform: 'uppercase' },
    { name: 'tags', match: 'array_contains', columns: ['tags'] },
    { name: 'date_from', match: 'gte', columns: ['d.adjudication_date'] },
    { name: 'owner', match: 'ilike_multi', columns: ['owner_a', 'owner_b'] },
  ];

  it('builds parameterized conditions joined by AND', () => {
    const r = buildWhere(FIELDS, { name: 'Іван', edrpou: '12345678' });
    expect(r.whereClause).toBe('name ILIKE $1 AND edrpou = $2');
    expect(r.values).toEqual(['%Іван%', '12345678']);
    expect(r.nextParamIndex).toBe(3);
  });

  it('ignores fields not present in the whitelist', () => {
    const r = buildWhere(FIELDS, { name: 'x', injected_col: 'DROP', '1=1': true });
    expect(r.whereClause).toBe('name ILIKE $1');
    expect(r.values).toEqual(['%x%']);
  });

  it('coerces numbers and uppercases when declared', () => {
    const r = buildWhere(FIELDS, { justice_kind: '3', code: 'abc' });
    expect(r.whereClause).toBe('d.justice_kind = $1 AND code = $2');
    expect(r.values).toEqual([3, 'ABC']);
  });

  it('skips null / undefined / empty-string values', () => {
    const r = buildWhere(FIELDS, { name: '', edrpou: null, justice_kind: undefined });
    expect(r.whereClause).toBeNull();
    expect(r.values).toEqual([]);
    expect(r.nextParamIndex).toBe(1);
  });

  it('renders array_contains, gte and ilike_multi correctly', () => {
    const r = buildWhere(FIELDS, { tags: 'urgent', date_from: '2026-01-01', owner: 'ТОВ' });
    expect(r.whereClause).toBe(
      '$1 = ANY(tags) AND d.adjudication_date >= $2 AND (owner_a ILIKE $3 OR owner_b ILIKE $3)'
    );
    expect(r.values).toEqual(['urgent', '2026-01-01', '%ТОВ%']);
  });

  it('honors startParamIndex for composition with prior conditions', () => {
    const r = buildWhere(FIELDS, { name: 'x', edrpou: '12345678' }, { startParamIndex: 5 });
    expect(r.whereClause).toBe('name ILIKE $5 AND edrpou = $6');
    expect(r.nextParamIndex).toBe(7);
  });

  it('end-to-end: validated IR feeds the builder', () => {
    const parsed = parseCourtSearchIR({ judge: 'Петренко', justice_kind: 2 });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const edrsrFields: FieldDef[] = [
      { name: 'judge', match: 'ilike', columns: ['d.judge'] },
      { name: 'justice_kind', match: 'exact', columns: ['d.justice_kind'], type: 'number' },
    ];
    const r = buildWhere(edrsrFields, parsed.value as Record<string, any>);
    expect(r.whereClause).toBe('d.judge ILIKE $1 AND d.justice_kind = $2');
    expect(r.values).toEqual(['%Петренко%', 2]);
  });
});

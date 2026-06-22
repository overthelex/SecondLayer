/**
 * EdsrFtsService.searchFulltext — party filter SQL construction
 *
 * Verifies that party_name / party_role are anchored into the tsquery match
 * (phraseto_tsquery + to_tsquery role forms), not appended as bag-of-words.
 */

import { describe, it, expect, jest } from '@jest/globals';
import { EdsrFtsService } from '../edrsr-fts-service';

const makeDb = () => {
  const calls: { sql: string; params: any[] }[] = [];
  const db = {
    calls,
    query: jest.fn((sql: string, params: any[]) => {
      calls.push({ sql, params });
      return Promise.resolve({ rows: [] });
    }),
  };
  return db;
};

describe('EdsrFtsService.searchFulltext party filters', () => {
  it('uses only plainto_tsquery when no party filter', async () => {
    const svc = new EdsrFtsService();
    const db = makeDb();
    await svc.searchFulltext('оренда землі', db);

    const sql = db.calls[0].sql;
    expect(sql).toContain("plainto_tsquery('simple', $1)");
    expect(sql).not.toContain('phraseto_tsquery');
    expect(sql).not.toMatch(/&& to_tsquery/); // no role-noun clause
    // topical query is the only tsquery param
    expect(db.calls[0].params[0]).toBe('оренда землі');
  });

  it('anchors party_name as a phrase combined with && ', async () => {
    const svc = new EdsrFtsService();
    const db = makeDb();
    await svc.searchFulltext('доставка вантажу', db, { party_name: 'Нова Пошта' });

    const sql = db.calls[0].sql;
    expect(sql).toContain('phraseto_tsquery');
    expect(sql).toContain('&&');
    // party name passed as a bound param, never interpolated
    expect(db.calls[0].params).toContain('Нова Пошта');
  });

  it('adds enumerated role case-forms for defendant', async () => {
    const svc = new EdsrFtsService();
    const db = makeDb();
    await svc.searchFulltext('доставка', db, { party_name: 'Нова Пошта', party_role: 'defendant' });

    const sql = db.calls[0].sql;
    expect(sql).toContain("to_tsquery('simple'");
    expect(sql).toContain('відповідач');
    expect(sql).toContain('відповідача');
    expect(sql).not.toContain('позивач');
  });

  it('adds plaintiff role forms for plaintiff', async () => {
    const svc = new EdsrFtsService();
    const db = makeDb();
    await svc.searchFulltext('спір', db, { party_name: 'Нова Пошта', party_role: 'plaintiff' });

    const sql = db.calls[0].sql;
    expect(sql).toContain('позивач');
    expect(sql).not.toContain('відповідач');
  });

  it('treats party_role "any" as no role constraint', async () => {
    const svc = new EdsrFtsService();
    const db = makeDb();
    await svc.searchFulltext('спір', db, { party_name: 'Нова Пошта', party_role: 'any' });

    const sql = db.calls[0].sql;
    expect(sql).toContain('phraseto_tsquery');
    expect(sql).not.toMatch(/&& to_tsquery/);
  });
});

describe('EdsrFtsService.countByParty', () => {
  it('counts + groups by court with phrase + role anchor', async () => {
    const svc = new EdsrFtsService();
    const db = {
      calls: [] as any[],
      query: jest.fn((sql: string, params: any[]) => {
        (db as any).calls.push({ sql, params });
        return Promise.resolve({ rows: [{ court_code: 1690, n: 7 }, { court_code: 2605, n: 3 }] });
      }),
    };
    const res = await svc.countByParty('Нова Пошта', 'defendant', db);

    const sql = db.calls[0].sql;
    expect(sql).toContain('phraseto_tsquery');
    expect(sql).toContain('відповідач');
    expect(sql).toContain('GROUP BY d.court_code');
    expect(db.calls[0].params).toContain('Нова Пошта');
    expect(res.total).toBe(10);
    expect(res.by_court).toHaveLength(2);
    expect(res.sample).toBeUndefined(); // sampleLimit defaults to 0
  });

  it('applies date/justice filters and fetches a sample when requested', async () => {
    const svc = new EdsrFtsService();
    const db = {
      calls: [] as any[],
      query: jest.fn((sql: string, params: any[]) => {
        (db as any).calls.push({ sql, params });
        if (sql.includes('GROUP BY')) return Promise.resolve({ rows: [{ court_code: 1, n: 2 }] });
        return Promise.resolve({ rows: [{ doc_id: 5, cause_num: '1/2', court_code: 1, justice_kind: 3, adjudication_date: '2024-01-01' }] });
      }),
    };
    const res = await svc.countByParty('Нова Пошта', 'plaintiff', db, { date_from: '2023-01-01', justice_kind: 3 }, 50);

    const countSql = db.calls[0].sql;
    expect(countSql).toContain('позивач');
    expect(countSql).toContain('d.adjudication_date >=');
    expect(countSql).toContain('d.justice_kind =');
    expect(db.calls).toHaveLength(2); // count + sample
    expect(db.calls[1].sql).toContain('LIMIT 50');
    expect(res.sample).toHaveLength(1);
    expect(res.sample![0].doc_id).toBe(5);
  });
});

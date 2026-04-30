/**
 * Access Gate tests
 *
 * Verifies the rule that gates chat / upload behind beta-tester membership
 * or a successful Monobank top-up.
 */

import { evaluateAccessGate, hasMonobankTopup } from '../access-gate';
import type { User } from '../user-service';

function makeDb(rows: any[] = []) {
  return { query: jest.fn().mockResolvedValue({ rows }) } as any;
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-001',
    google_id: 'g',
    email: 'u@example.com',
    email_verified: true,
    created_at: new Date(),
    updated_at: new Date(),
    role: 'user',
    is_beta_tester: false,
    is_admin: false,
    ...overrides,
  } as User;
}

describe('access-gate', () => {
  describe('evaluateAccessGate', () => {
    it('denies unauthenticated requests', async () => {
      const db = makeDb();
      const decision = await evaluateAccessGate(db, null);
      expect(decision).toEqual({ allowed: false, reason: 'unauthenticated' });
      expect(db.query).not.toHaveBeenCalled();
    });

    it('allows beta testers without checking the database', async () => {
      const db = makeDb();
      const decision = await evaluateAccessGate(db, makeUser({ is_beta_tester: true }));
      expect(decision).toEqual({ allowed: true, reason: 'beta_tester' });
      expect(db.query).not.toHaveBeenCalled();
    });

    it('allows administrators (role)', async () => {
      const db = makeDb();
      const decision = await evaluateAccessGate(db, makeUser({ role: 'administrator' }));
      expect(decision).toEqual({ allowed: true, reason: 'administrator' });
      expect(db.query).not.toHaveBeenCalled();
    });

    it('allows administrators (legacy is_admin flag)', async () => {
      const db = makeDb();
      const decision = await evaluateAccessGate(db, makeUser({ is_admin: true }));
      expect(decision).toEqual({ allowed: true, reason: 'administrator' });
      expect(db.query).not.toHaveBeenCalled();
    });

    it('allows ordinary users with at least one successful Monobank top-up', async () => {
      const db = makeDb([{ '?column?': 1 }]);
      const decision = await evaluateAccessGate(db, makeUser());
      expect(decision).toEqual({ allowed: true, reason: 'monobank_topup' });
      expect(db.query).toHaveBeenCalledTimes(1);
      const sql = db.query.mock.calls[0][0] as string;
      expect(sql).toMatch(/billing_transactions/);
      expect(sql).toMatch(/payment_provider = 'monobank'/);
      expect(sql).toMatch(/type = 'topup'/);
    });

    it('denies ordinary users without a Monobank top-up', async () => {
      const db = makeDb([]);
      const decision = await evaluateAccessGate(db, makeUser());
      expect(decision).toEqual({ allowed: false, reason: 'no_monobank_topup' });
    });

    it('fails closed when the database lookup throws', async () => {
      const db = { query: jest.fn().mockRejectedValue(new Error('boom')) } as any;
      const decision = await evaluateAccessGate(db, makeUser());
      expect(decision).toEqual({ allowed: false, reason: 'no_monobank_topup' });
    });
  });

  describe('hasMonobankTopup', () => {
    it('returns true when at least one successful top-up exists', async () => {
      const db = makeDb([{ '?column?': 1 }]);
      await expect(hasMonobankTopup(db, 'user-001')).resolves.toBe(true);
    });

    it('returns false when no top-up exists', async () => {
      const db = makeDb([]);
      await expect(hasMonobankTopup(db, 'user-001')).resolves.toBe(false);
    });
  });
});

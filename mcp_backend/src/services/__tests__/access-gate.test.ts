/**
 * Access Gate tests
 *
 * Verifies the rule that gates chat / upload behind:
 * beta-tester membership, admin role, positive balance, or a successful Monobank top-up.
 */

import { evaluateAccessGate, hasMonobankTopup, hasPositiveBalance } from '../access-gate';
import type { User } from '../user-service';

function makeDb(queryResults: any[][] = [[]]) {
  let callIndex = 0;
  return {
    query: jest.fn().mockImplementation(() => {
      const rows = queryResults[callIndex] || [];
      callIndex++;
      return Promise.resolve({ rows });
    }),
  } as any;
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

    it('allows users with positive balance (welcome bonus)', async () => {
      // First query (balance check) returns a row
      const db = makeDb([[{ '?column?': 1 }]]);
      const decision = await evaluateAccessGate(db, makeUser());
      expect(decision).toEqual({ allowed: true, reason: 'has_balance' });
      expect(db.query).toHaveBeenCalledTimes(1);
      const sql = db.query.mock.calls[0][0] as string;
      expect(sql).toMatch(/user_billing/);
      expect(sql).toMatch(/balance_usd > 0 OR balance_uah > 0/);
    });

    it('allows ordinary users with Monobank top-up when balance is zero', async () => {
      // First query (balance) returns empty, second (topup) returns a row
      const db = makeDb([[], [{ '?column?': 1 }]]);
      const decision = await evaluateAccessGate(db, makeUser());
      expect(decision).toEqual({ allowed: true, reason: 'monobank_topup' });
      expect(db.query).toHaveBeenCalledTimes(2);
    });

    it('denies ordinary users without balance or top-up', async () => {
      // Both queries return empty
      const db = makeDb([[], []]);
      const decision = await evaluateAccessGate(db, makeUser());
      expect(decision).toEqual({ allowed: false, reason: 'no_balance' });
    });

    it('fails closed when the database lookup throws', async () => {
      const db = { query: jest.fn().mockRejectedValue(new Error('boom')) } as any;
      const decision = await evaluateAccessGate(db, makeUser());
      expect(decision).toEqual({ allowed: false, reason: 'no_balance' });
    });
  });

  describe('hasPositiveBalance', () => {
    it('returns true when user has positive balance', async () => {
      const db = makeDb([[{ '?column?': 1 }]]);
      await expect(hasPositiveBalance(db, 'user-001')).resolves.toBe(true);
    });

    it('returns false when user has no balance', async () => {
      const db = makeDb([[]]);
      await expect(hasPositiveBalance(db, 'user-001')).resolves.toBe(false);
    });
  });

  describe('hasMonobankTopup', () => {
    it('returns true when at least one successful top-up exists', async () => {
      const db = makeDb([[{ '?column?': 1 }]]);
      await expect(hasMonobankTopup(db, 'user-001')).resolves.toBe(true);
    });

    it('returns false when no top-up exists', async () => {
      const db = makeDb([[]]);
      await expect(hasMonobankTopup(db, 'user-001')).resolves.toBe(false);
    });
  });
});

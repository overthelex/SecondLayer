import { AttorneyProfileService } from '../attorney-profile-service.js';

jest.mock('../../utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Columns that actually exist in attorney_profiles table on prod
const VALID_AP_COLUMNS = new Set([
  'id', 'user_id', 'organization_id', 'bar_license_number', 'bar_admission_date',
  'years_experience', 'education', 'specializations', 'court_types',
  'region', 'city', 'serves_remotely', 'languages',
  'consultation_fee_uah', 'hourly_rate_uah', 'representation_fee_uah',
  'free_initial_consultation', 'bio', 'photo_url',
  'total_consultations', 'average_rating', 'rating_count',
  'is_available', 'max_active_consultations', 'is_public',
  'created_at', 'updated_at',
  'bank_iban', 'bank_name', 'bank_account_holder',
]);

/** Extract column references like ap.column_name from SQL */
function extractApColumns(sql: string): string[] {
  const matches = sql.match(/ap\.(\w+)/g) || [];
  return [...new Set(matches.map(m => m.replace('ap.', '')))];
}

function createMockDb() {
  return {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    getPool: jest.fn(),
  };
}

describe('AttorneyProfileService', () => {
  describe('searchAttorneys SQL column validation', () => {
    test('should only reference columns that exist in attorney_profiles table', async () => {
      const db = createMockDb();
      // First call = search query, second call = count query
      db.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

      const service = new AttorneyProfileService(db as any);
      await service.searchAttorneys({});

      const searchSql = db.query.mock.calls[0][0] as string;
      const columns = extractApColumns(searchSql);

      const invalid = columns.filter(col => !VALID_AP_COLUMNS.has(col));
      expect(invalid).toEqual([]);
    });

    test('should return attorneys and total count', async () => {
      const db = createMockDb();
      const mockAttorney = { id: 'a1', user_id: 'u1', user_name: 'Test' };
      db.query
        .mockResolvedValueOnce({ rows: [mockAttorney], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });

      const service = new AttorneyProfileService(db as any);
      const result = await service.searchAttorneys({});

      expect(result.attorneys).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    test('should apply specialization filter', async () => {
      const db = createMockDb();
      db.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

      const service = new AttorneyProfileService(db as any);
      await service.searchAttorneys({ specialization: 'criminal' });

      const searchSql = db.query.mock.calls[0][0] as string;
      expect(searchSql).toContain('specializations');
      expect(db.query.mock.calls[0][1]).toContain('criminal');
    });

    test('should respect limit and offset', async () => {
      const db = createMockDb();
      db.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

      const service = new AttorneyProfileService(db as any);
      await service.searchAttorneys({ limit: 5, offset: 10 });

      const params = db.query.mock.calls[0][1] as any[];
      expect(params).toContain(5);
      expect(params).toContain(10);
    });
  });
});

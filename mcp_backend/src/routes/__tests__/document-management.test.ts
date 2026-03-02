/**
 * Document management endpoint tests
 *
 * Covers:
 * 1. DELETE /api/documents/:id — delete document (rest-api.ts)
 * 2. POST /api/documents/:id/move — move to folder (http-server.ts)
 * 3. Edge cases: missing auth, missing params, not-found documents
 *
 * These test the Express route handlers via extracted logic,
 * mocking the database layer.
 */

import { createRestAPIRouter } from '../rest-api';
import express, { Express } from 'express';
import request from 'supertest';

// ──────────────────────────────────────────────────────────────────────────
// Mock DB factory
// ──────────────────────────────────────────────────────────────────────────

function makeDb(overrides: any = {}) {
  return {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    transaction: jest.fn(),
    connect: jest.fn(),
    close: jest.fn(),
    setMetricsCollector: jest.fn(),
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Test app factory — injects a mock user into req
// ──────────────────────────────────────────────────────────────────────────

function createTestApp(db: any, userId?: string): Express {
  const app = express();
  app.use(express.json());

  // Fake auth middleware — sets req.user
  app.use((req: any, _res, next) => {
    if (userId) {
      req.user = { id: userId, email: 'test@test.com' };
    }
    next();
  });

  app.use('/api/documents', createRestAPIRouter(db));

  return app;
}

// ──────────────────────────────────────────────────────────────────────────
// Tests: DELETE document
// ──────────────────────────────────────────────────────────────────────────

describe('DELETE /api/documents/:id', () => {
  it('deletes a document owned by the user', async () => {
    const db = makeDb({
      query: jest.fn().mockResolvedValue({
        rows: [{ id: 'doc-1' }],
        rowCount: 1,
      }),
    });
    const app = createTestApp(db, 'user-1');

    const res = await request(app).delete('/api/documents/doc-1');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('doc-1');

    // Verify the DELETE query includes user_id check
    const sql: string = db.query.mock.calls[0][0];
    expect(sql).toContain('DELETE FROM documents');
    expect(sql).toContain('user_id');
    expect(db.query.mock.calls[0][1]).toEqual(['doc-1', 'user-1']);
  });

  it('returns 404 when document does not exist or belongs to another user', async () => {
    const db = makeDb({
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    });
    const app = createTestApp(db, 'user-1');

    const res = await request(app).delete('/api/documents/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Document not found');
  });

  it('returns 401 when user is not authenticated', async () => {
    const db = makeDb();
    const app = createTestApp(db); // no userId

    const res = await request(app).delete('/api/documents/doc-1');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('returns 500 when database throws', async () => {
    const db = makeDb({
      query: jest.fn().mockRejectedValue(new Error('connection refused')),
    });
    const app = createTestApp(db, 'user-1');

    const res = await request(app).delete('/api/documents/doc-1');

    expect(res.status).toBe(500);
    expect(res.body.error).toContain('delete');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Tests: Move to folder (POST /api/documents/:id/move)
//
// This endpoint is mounted in http-server.ts, not in rest-api.ts.
// We test the logic inline here by simulating the handler behaviour.
// ──────────────────────────────────────────────────────────────────────────

describe('Move document to folder — logic', () => {
  /**
   * Simulates the move endpoint handler from http-server.ts:
   *   POST /api/documents/:id/move { folderPath: string }
   */
  function createMoveApp(db: any, userId?: string): Express {
    const app = express();
    app.use(express.json());

    app.use((req: any, _res, next) => {
      if (userId) {
        req.user = { id: userId, email: 'test@test.com' };
      }
      next();
    });

    app.post('/api/documents/:id/move', async (req: any, res) => {
      try {
        const uId = req.user?.id;
        if (!uId) {
          res.status(401).json({ error: 'Authentication required' });
          return;
        }
        const { id } = req.params;
        const { folderPath } = req.body;

        if (folderPath === undefined) {
          res.status(400).json({ error: 'folderPath is required' });
          return;
        }

        const sanitized = typeof folderPath === 'string' ? folderPath : '';
        const result = await db.query(
          `UPDATE documents
           SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{folderPath}', $3::jsonb),
               updated_at = NOW()
           WHERE id = $1 AND user_id = $2
           RETURNING id, title, metadata`,
          [id, uId, JSON.stringify(sanitized)]
        );

        if (result.rows.length === 0) {
          res.status(404).json({ error: 'Document not found' });
          return;
        }

        res.json(result.rows[0]);
      } catch (error: any) {
        res.status(500).json({ error: 'Failed to move document', message: error.message });
      }
    });

    return app;
  }

  it('moves a document to a new folder', async () => {
    const db = makeDb({
      query: jest.fn().mockResolvedValue({
        rows: [{ id: 'doc-1', title: 'Contract', metadata: { folderPath: '/archive' } }],
        rowCount: 1,
      }),
    });
    const app = createMoveApp(db, 'user-1');

    const res = await request(app)
      .post('/api/documents/doc-1/move')
      .send({ folderPath: '/archive' });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('doc-1');

    const sql: string = db.query.mock.calls[0][0];
    expect(sql).toContain('jsonb_set');
    expect(sql).toContain('folderPath');

    const params = db.query.mock.calls[0][1];
    expect(params[0]).toBe('doc-1');
    expect(params[1]).toBe('user-1');
    expect(params[2]).toBe('"/archive"'); // JSON-stringified string
  });

  it('moves to root (empty string) when folderPath is empty string', async () => {
    const db = makeDb({
      query: jest.fn().mockResolvedValue({
        rows: [{ id: 'doc-1', title: 'Doc', metadata: { folderPath: '' } }],
        rowCount: 1,
      }),
    });
    const app = createMoveApp(db, 'user-1');

    const res = await request(app)
      .post('/api/documents/doc-1/move')
      .send({ folderPath: '' });

    expect(res.status).toBe(200);
    const params = db.query.mock.calls[0][1];
    expect(params[2]).toBe('""'); // empty string, JSON-encoded
  });

  it('sanitizes non-string folderPath to empty string', async () => {
    const db = makeDb({
      query: jest.fn().mockResolvedValue({
        rows: [{ id: 'doc-1', title: 'Doc', metadata: { folderPath: '' } }],
        rowCount: 1,
      }),
    });
    const app = createMoveApp(db, 'user-1');

    const res = await request(app)
      .post('/api/documents/doc-1/move')
      .send({ folderPath: 12345 });

    expect(res.status).toBe(200);
    const params = db.query.mock.calls[0][1];
    expect(params[2]).toBe('""'); // sanitized to empty string
  });

  it('returns 400 when folderPath is not provided', async () => {
    const db = makeDb();
    const app = createMoveApp(db, 'user-1');

    const res = await request(app)
      .post('/api/documents/doc-1/move')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('folderPath');
  });

  it('returns 404 when document not found or belongs to another user', async () => {
    const db = makeDb({
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    });
    const app = createMoveApp(db, 'user-1');

    const res = await request(app)
      .post('/api/documents/doc-1/move')
      .send({ folderPath: '/archive' });

    expect(res.status).toBe(404);
  });

  it('returns 401 when user is not authenticated', async () => {
    const db = makeDb();
    const app = createMoveApp(db);

    const res = await request(app)
      .post('/api/documents/doc-1/move')
      .send({ folderPath: '/archive' });

    expect(res.status).toBe(401);
  });

  it('returns 500 when database throws', async () => {
    const db = makeDb({
      query: jest.fn().mockRejectedValue(new Error('timeout')),
    });
    const app = createMoveApp(db, 'user-1');

    const res = await request(app)
      .post('/api/documents/doc-1/move')
      .send({ folderPath: '/archive' });

    expect(res.status).toBe(500);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Tests: REST API list documents (GET /api/documents)
// ──────────────────────────────────────────────────────────────────────────

describe('GET /api/documents', () => {
  it('returns documents for authenticated user with X-Total-Count header', async () => {
    const db = makeDb({
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [
            { id: 'd1', title: 'Doc 1', type: 'contract', has_full_text: true },
            { id: 'd2', title: 'Doc 2', type: 'legislation', has_full_text: false },
          ],
          rowCount: 2,
        }),
    });
    const app = createTestApp(db, 'user-1');

    const res = await request(app).get('/api/documents?_start=0&_end=10');

    expect(res.status).toBe(200);
    expect(res.headers['x-total-count']).toBe('3');
    expect(res.body).toHaveLength(2);
  });

  it('returns empty array with 0 count when not authenticated', async () => {
    const db = makeDb();
    const app = createTestApp(db); // no userId

    const res = await request(app).get('/api/documents');

    expect(res.status).toBe(200);
    expect(res.headers['x-total-count']).toBe('0');
    expect(res.body).toEqual([]);
  });
});

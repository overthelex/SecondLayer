/**
 * Tests for support-routes (LEXAI-869)
 * POST /api/support/contact
 */

import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { createSupportRoutes } from '../support-routes';

// ── Logger mock ────────────────────────────────────────────────────────────

jest.mock('../../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

// ── requireJWT mock — applied at module level ──────────────────────────────

jest.mock('../../middleware/dual-auth.js', () => ({
  requireJWT: jest.fn((req: any, _res: Response, next: NextFunction) => next()),
}));

import { requireJWT } from '../../middleware/dual-auth.js';

// ── Helpers ────────────────────────────────────────────────────────────────

const TEST_USER = { id: 'user-001', email: 'ivan@test.com' };

/** Inject req.user to simulate a JWT-authenticated request */
function withAuth(userId = TEST_USER.id) {
  (requireJWT as jest.Mock).mockImplementation((req: any, _res: Response, next: NextFunction) => {
    req.user = { id: userId };
    next();
  });
}

/** Make requireJWT pass with no user attached (simulates the 401 path in handler) */
function withoutUser() {
  (requireJWT as jest.Mock).mockImplementation((_req: any, _res: Response, next: NextFunction) => {
    // does not set req.user
    next();
  });
}

function makeEmailService(overrides: any = {}) {
  return {
    sendSupportMessage: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeDb(rows: any[] = [{ email: TEST_USER.email, name: 'Іван' }]) {
  return {
    query: jest.fn().mockResolvedValue({ rows }),
  };
}

function buildApp(serviceOverrides: any = {}, dbRows?: any[]) {
  const app = express();
  app.use(express.json());

  const emailService = makeEmailService(serviceOverrides.emailService);
  const db = makeDb(dbRows);

  const router = createSupportRoutes(emailService as any, db as any);
  app.use('/api/support', router);

  return { app, emailService, db };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('POST /api/support/contact', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    withAuth();
  });

  describe('authentication', () => {
    it('returns 401 when req.user is not set', async () => {
      withoutUser();
      const { app } = buildApp();

      const res = await request(app)
        .post('/api/support/contact')
        .send({ type: 'feedback', message: 'Тестове повідомлення' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Unauthorized');
    });
  });

  describe('type validation', () => {
    it('returns 400 for an unknown type', async () => {
      const { app } = buildApp();

      const res = await request(app)
        .post('/api/support/contact')
        .send({ type: 'spam', message: 'Тестове повідомлення' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Невалідний тип');
    });

    it('returns 400 when type is missing', async () => {
      const { app } = buildApp();

      const res = await request(app)
        .post('/api/support/contact')
        .send({ message: 'Тестове повідомлення' });

      expect(res.status).toBe(400);
    });

    it('accepts type="feedback"', async () => {
      const { app } = buildApp();

      const res = await request(app)
        .post('/api/support/contact')
        .send({ type: 'feedback', message: 'Тестове повідомлення про баг' });

      expect(res.status).toBe(200);
    });

    it('accepts type="question"', async () => {
      const { app } = buildApp();

      const res = await request(app)
        .post('/api/support/contact')
        .send({ type: 'question', message: 'Тестове питання про платформу' });

      expect(res.status).toBe(200);
    });
  });

  describe('message validation', () => {
    it('returns 400 when message is missing', async () => {
      const { app } = buildApp();

      const res = await request(app)
        .post('/api/support/contact')
        .send({ type: 'feedback' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('обов');
    });

    it('returns 400 when message is not a string', async () => {
      const { app } = buildApp();

      const res = await request(app)
        .post('/api/support/contact')
        .send({ type: 'feedback', message: 42 });

      expect(res.status).toBe(400);
    });

    it('returns 400 when trimmed message is under 3 characters', async () => {
      const { app } = buildApp();

      const res = await request(app)
        .post('/api/support/contact')
        .send({ type: 'feedback', message: 'ab' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('коротке');
    });

    it('returns 400 when trimmed message is under 3 characters due to whitespace', async () => {
      const { app } = buildApp();

      const res = await request(app)
        .post('/api/support/contact')
        .send({ type: 'feedback', message: '  a  ' });

      expect(res.status).toBe(400);
    });

    it('returns 400 when message exceeds 5000 characters', async () => {
      const { app } = buildApp();
      const longMessage = 'а'.repeat(5001);

      const res = await request(app)
        .post('/api/support/contact')
        .send({ type: 'feedback', message: longMessage });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('задовге');
    });

    it('accepts a message of exactly 3 characters', async () => {
      const { app } = buildApp();

      const res = await request(app)
        .post('/api/support/contact')
        .send({ type: 'feedback', message: 'abc' });

      expect(res.status).toBe(200);
    });

    it('accepts a message of exactly 5000 characters', async () => {
      const { app } = buildApp();
      const maxMessage = 'а'.repeat(5000);

      const res = await request(app)
        .post('/api/support/contact')
        .send({ type: 'feedback', message: maxMessage });

      expect(res.status).toBe(200);
    });
  });

  describe('user DB lookup', () => {
    it('returns 400 when user has no email in DB', async () => {
      const { app } = buildApp({}, [{ email: null, name: 'Іван' }]);

      const res = await request(app)
        .post('/api/support/contact')
        .send({ type: 'feedback', message: 'Тестове повідомлення про баг' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('email');
    });

    it('returns 400 when user row not found in DB', async () => {
      const { app } = buildApp({}, []);

      const res = await request(app)
        .post('/api/support/contact')
        .send({ type: 'feedback', message: 'Тестове повідомлення про баг' });

      expect(res.status).toBe(400);
    });

    it('queries DB with the authenticated userId', async () => {
      const { app, db } = buildApp();

      await request(app)
        .post('/api/support/contact')
        .send({ type: 'feedback', message: 'Тестове повідомлення про баг' });

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [TEST_USER.id]
      );
    });
  });

  describe('successful submission', () => {
    it('returns { ok: true } on success', async () => {
      const { app } = buildApp();

      const res = await request(app)
        .post('/api/support/contact')
        .send({ type: 'feedback', message: 'Тестове повідомлення про баг' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('calls emailService.sendSupportMessage with correct params', async () => {
      const { app, emailService } = buildApp();

      await request(app)
        .post('/api/support/contact')
        .send({
          type: 'question',
          message: '  Що таке ескроу?  ',
          pageUrl: 'https://legal.org.ua/attorneys',
        });

      expect(emailService.sendSupportMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'question',
          message: 'Що таке ескроу?',
          fromEmail: TEST_USER.email,
          fromName: 'Іван',
          userId: TEST_USER.id,
          pageUrl: 'https://legal.org.ua/attorneys',
        })
      );
    });

    it('uses email as fromName when user has no name', async () => {
      const { app, emailService } = buildApp({}, [{ email: 'noname@test.com', name: null }]);

      await request(app)
        .post('/api/support/contact')
        .send({ type: 'feedback', message: 'Тестове повідомлення про баг' });

      expect(emailService.sendSupportMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          fromEmail: 'noname@test.com',
          fromName: 'noname@test.com',
        })
      );
    });

    it('truncates pageUrl to 500 characters', async () => {
      const { app, emailService } = buildApp();
      const longUrl = 'https://legal.org.ua/' + 'a'.repeat(600);

      await request(app)
        .post('/api/support/contact')
        .send({ type: 'feedback', message: 'Тестове повідомлення', pageUrl: longUrl });

      const callArgs = emailService.sendSupportMessage.mock.calls[0][0];
      expect(callArgs.pageUrl.length).toBe(500);
    });

    it('omits pageUrl when not provided', async () => {
      const { app, emailService } = buildApp();

      await request(app)
        .post('/api/support/contact')
        .send({ type: 'feedback', message: 'Тестове повідомлення' });

      const callArgs = emailService.sendSupportMessage.mock.calls[0][0];
      expect(callArgs.pageUrl).toBeUndefined();
    });

    it('passes user-agent header to sendSupportMessage', async () => {
      const { app, emailService } = buildApp();

      await request(app)
        .post('/api/support/contact')
        .set('User-Agent', 'Mozilla/5.0 TestBrowser')
        .send({ type: 'feedback', message: 'Тестове повідомлення' });

      expect(emailService.sendSupportMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          userAgent: expect.stringContaining('Mozilla'),
        })
      );
    });

    it('truncates user-agent to 300 characters', async () => {
      const { app, emailService } = buildApp();
      const longUA = 'Mozilla/' + 'a'.repeat(400);

      await request(app)
        .post('/api/support/contact')
        .set('User-Agent', longUA)
        .send({ type: 'feedback', message: 'Тестове повідомлення' });

      const callArgs = emailService.sendSupportMessage.mock.calls[0][0];
      expect(callArgs.userAgent.length).toBe(300);
    });
  });

  describe('error handling', () => {
    it('returns 500 when emailService throws', async () => {
      const { app } = buildApp({
        emailService: {
          sendSupportMessage: jest.fn().mockRejectedValue(new Error('SMTP down')),
        },
      });

      const res = await request(app)
        .post('/api/support/contact')
        .send({ type: 'feedback', message: 'Тестове повідомлення' });

      expect(res.status).toBe(500);
      expect(res.body.error).toContain('відправити');
    });

    it('returns 500 when db.query throws', async () => {
      const { app } = buildApp({}, undefined);
      // Override db to throw
      const throwingDb = {
        query: jest.fn().mockRejectedValue(new Error('DB connection lost')),
      };

      const appWithBadDb = express();
      appWithBadDb.use(express.json());
      const emailService = makeEmailService();
      const router = createSupportRoutes(emailService as any, throwingDb as any);
      appWithBadDb.use('/api/support', router);

      const res = await request(appWithBadDb)
        .post('/api/support/contact')
        .send({ type: 'feedback', message: 'Тестове повідомлення' });

      expect(res.status).toBe(500);
    });
  });
});

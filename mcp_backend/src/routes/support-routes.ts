/**
 * Support Widget Routes
 * Receives feedback/question submissions from the in-app SupportWidget (FAB)
 * and forwards them to the support inbox via email.
 */

import { Router, Request, Response } from 'express';
import type { EmailService } from '../services/email-service.js';
import type { BaseDatabase } from '@secondlayer/shared';
import { requireJWT } from '../middleware/dual-auth.js';
import { logger } from '../utils/logger.js';

const MAX_MESSAGE_LENGTH = 5000;

export function createSupportRoutes(
  emailService: EmailService,
  db: BaseDatabase
): Router {
  const router = Router();

  /**
   * POST /api/support/contact
   * Body: { type: 'feedback' | 'question', message: string, pageUrl?: string }
   */
  router.post('/contact', requireJWT as any, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorized' });

      const { type, message, pageUrl } = req.body || {};

      if (type !== 'feedback' && type !== 'question') {
        return res.status(400).json({ error: 'Невалідний тип звернення' });
      }
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Повідомлення обов’язкове' });
      }
      const trimmed = message.trim();
      if (trimmed.length < 3) {
        return res.status(400).json({ error: 'Повідомлення занадто коротке' });
      }
      if (trimmed.length > MAX_MESSAGE_LENGTH) {
        return res.status(400).json({ error: `Повідомлення задовге (макс. ${MAX_MESSAGE_LENGTH} символів)` });
      }

      const userResult = await db.query(
        'SELECT email, name FROM users WHERE id = $1',
        [userId]
      );
      const userRow = userResult.rows[0] as { email: string; name: string | null } | undefined;
      if (!userRow?.email) {
        return res.status(400).json({ error: 'У вашому профілі не вказано email' });
      }

      await emailService.sendSupportMessage({
        type,
        message: trimmed,
        fromEmail: userRow.email,
        fromName: userRow.name || userRow.email,
        userId,
        pageUrl: typeof pageUrl === 'string' ? pageUrl.slice(0, 500) : undefined,
        userAgent: typeof req.headers['user-agent'] === 'string'
          ? (req.headers['user-agent'] as string).slice(0, 300)
          : undefined,
      });

      return res.json({ ok: true });
    } catch (err: any) {
      logger.error('Support contact submit failed', { error: err.message });
      return res.status(500).json({ error: 'Не вдалося відправити повідомлення' });
    }
  });

  return router;
}

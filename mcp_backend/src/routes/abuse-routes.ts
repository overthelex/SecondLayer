/**
 * Abuse Report Routes
 * Public endpoint for receiving abuse/violation reports.
 * No authentication required — this is a public compliance form.
 */

import { Router, Request, Response } from 'express';
import type { BaseDatabase } from '@secondlayer/shared';
import type { EmailService } from '../services/email-service.js';
import { createRateLimiter } from '../middleware/rate-limit.js';
import { logger } from '../utils/logger.js';

const VALID_TYPES = [
  'forbidden_content',
  'copyright',
  'illegal_use',
  'other',
] as const;

type AbuseType = typeof VALID_TYPES[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_URL_LENGTH = 2000;

// 5 requests per hour per IP
const abuseRateLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 5,
  keyPrefix: 'ratelimit:abuse-report',
});

export function createAbuseRoutes(
  db: BaseDatabase,
  emailService: EmailService,
): Router {
  const router = Router();

  /**
   * POST /api/abuse-report
   * Body: { type, email, description, contentUrl? }
   */
  router.post('/', abuseRateLimit as any, async (req: Request, res: Response) => {
    try {
      const { type, email, description, contentUrl } = req.body || {};

      // --- validation ---
      if (!type || !VALID_TYPES.includes(type as AbuseType)) {
        return res.status(400).json({
          error: `Невалідний тип порушення. Допустимі: ${VALID_TYPES.join(', ')}`,
        });
      }

      if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
        return res.status(400).json({ error: 'Невалідний email' });
      }

      if (!description || typeof description !== 'string') {
        return res.status(400).json({ error: 'Опис порушення обов\'язковий' });
      }

      const trimmedDesc = description.trim();
      if (trimmedDesc.length < 10) {
        return res.status(400).json({ error: 'Опис занадто короткий (мінімум 10 символів)' });
      }
      if (trimmedDesc.length > MAX_DESCRIPTION_LENGTH) {
        return res.status(400).json({ error: `Опис занадто довгий (максимум ${MAX_DESCRIPTION_LENGTH} символів)` });
      }

      const trimmedUrl = contentUrl && typeof contentUrl === 'string'
        ? contentUrl.trim().slice(0, MAX_URL_LENGTH)
        : null;

      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const userAgent = typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent'].slice(0, 500)
        : null;

      // --- persist ---
      await db.query(
        `INSERT INTO abuse_reports (type, reporter_email, description, content_url, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [type, email.trim(), trimmedDesc, trimmedUrl, ip, userAgent],
      );

      // --- notify admins via email ---
      try {
        const typeLabels: Record<string, string> = {
          forbidden_content: 'Заборонений контент',
          copyright: 'Порушення авторських прав',
          illegal_use: 'Незаконне використання',
          other: 'Інше',
        };

        const escape = (s: string) =>
          s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const supportInbox = process.env.SUPPORT_EMAIL || 'info@legal.org.ua';
        const subject = `LEX — Повідомлення про порушення: ${typeLabels[type] || type}`;

        const html = `
<!DOCTYPE html>
<html lang="uk">
<head><meta charset="utf-8"></head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #f1f5f9; margin: 0; padding: 20px;">
  <div style="max-width:600px; margin: 0 auto; background:#fff; border-radius:12px; padding:24px;">
    <h2 style="margin-top:0; color:#dc2626;">Повідомлення про порушення</h2>
    <table style="width:100%; font-size:13px; color:#475569; border-collapse:collapse;">
      <tr><td style="padding:4px 0; width:130px;"><b>Тип:</b></td><td>${escape(typeLabels[type] || type)}</td></tr>
      <tr><td style="padding:4px 0;"><b>Email:</b></td><td>${escape(email.trim())}</td></tr>
      ${trimmedUrl ? `<tr><td style="padding:4px 0;"><b>URL контенту:</b></td><td>${escape(trimmedUrl)}</td></tr>` : ''}
      <tr><td style="padding:4px 0;"><b>IP:</b></td><td>${escape(ip)}</td></tr>
    </table>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0;">
    <div style="white-space:pre-wrap; line-height:1.6; font-size:14px; color:#1e293b;">${escape(trimmedDesc)}</div>
  </div>
</body>
</html>`.trim();

        // Use the transporter directly via the email service's internal method pattern
        // Since EmailService doesn't expose a generic send, we use sendMail-like approach
        // through a lightweight helper on the email service.
        // For now, we call the underlying nodemailer via the same support inbox pattern.
        await (emailService as any).transporter.sendMail({
          from: `"LEX AI" <${process.env.SMTP_FROM || 'noreply@legal.org.ua'}>`,
          to: supportInbox,
          replyTo: email.trim(),
          subject,
          html,
        });
      } catch (emailErr: any) {
        // Email notification failure should not block the user response
        logger.error('Failed to send abuse report notification email', { error: emailErr.message });
      }

      logger.info('Abuse report submitted', { type, email: email.trim(), ip });

      return res.json({
        success: true,
        message: 'Дякуємо за повідомлення. Ми розглянемо його найближчим часом.',
      });
    } catch (err: any) {
      logger.error('Abuse report submission failed', { error: err.message });
      return res.status(500).json({ error: 'Не вдалося зберегти повідомлення. Спробуйте пізніше.' });
    }
  });

  return router;
}

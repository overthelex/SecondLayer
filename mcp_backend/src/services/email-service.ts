/**
 * Email Service
 * Handles transactional email notifications for billing events
 */

import nodemailer from 'nodemailer';
import { readFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';
import { maskSensitive } from '../utils/sanitize-log.js';
import type { EmailPreferences } from './billing-service.js';

export interface EmailConfig {
  from: string;
  fromName: string;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
}

export interface PaymentSuccessParams {
  email: string;
  name: string;
  amount: number;
  currency: string;
  newBalance: number;
  paymentId: string;
}

export interface PaymentFailureParams {
  email: string;
  name: string;
  amount: number;
  currency: string;
  reason: string;
}

export interface LowBalanceParams {
  email: string;
  name: string;
  balance: number;
  currency: string;
}

export interface ReferralData {
  referralCode: string | null;
  totalReferrals: number;
  totalEarnedUsd: number;
  totalEarnedUah: number;
  isVerified: boolean;
}

export type PreferenceFetcher = (userId: string) => Promise<EmailPreferences>;
export type ReferralDataFetcher = (userId: string) => Promise<ReferralData>;

export class EmailService {
  private transporter: nodemailer.Transporter;
  private config: EmailConfig;
  private frontendUrl: string;
  private getPreferences?: PreferenceFetcher;
  private getReferralData?: ReferralDataFetcher;
  private logoBuffer: Buffer | null = null;

  constructor() {
    this.frontendUrl = process.env.FRONTEND_URL || 'https://billing.legal.org.ua';

    this.config = {
      from: process.env.EMAIL_FROM || 'noreply@legal.org.ua',
      fromName: process.env.EMAIL_FROM_NAME || 'SecondLayer Legal Platform',
      smtp: {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER || '',
          pass: process.env.SMTP_PASS || '',
        },
      },
    };

    // Load logo for email templates
    try {
      const logoPath = join(__dirname, '..', '..', 'assets', 'logolex_dark.png');
      this.logoBuffer = readFileSync(logoPath);
      logger.info('LEX logo loaded for email templates');
    } catch {
      logger.warn('LEX logo not found at assets/logolex_dark.png — emails will render without logo');
    }

    // Create transporter
    if (this.config.smtp.auth.user && this.config.smtp.auth.pass) {
      this.transporter = nodemailer.createTransport(this.config.smtp);
      logger.info('EmailService initialized with SMTP (authenticated)', {
        host: this.config.smtp.host,
      });
    } else if (process.env.SMTP_HOST) {
      // IP-based auth (no credentials) — e.g. postfix with mynetworks
      this.transporter = nodemailer.createTransport({
        host: this.config.smtp.host,
        port: this.config.smtp.port,
        secure: this.config.smtp.secure,
        tls: { rejectUnauthorized: false },
      });
      logger.info('EmailService initialized with SMTP (IP-based auth)', {
        host: this.config.smtp.host,
        port: this.config.smtp.port,
      });
    } else {
      // Development mode: use JSON transport (log only)
      this.transporter = nodemailer.createTransport({
        jsonTransport: true,
      } as any);
      logger.warn('EmailService in development mode (no SMTP configured)');
    }
  }

  /**
   * Set the preference fetcher (called after construction to avoid circular deps)
   */
  setPreferenceFetcher(fetcher: PreferenceFetcher): void {
    this.getPreferences = fetcher;
  }

  /**
   * Set the referral data fetcher (called after construction to avoid circular deps)
   */
  setReferralDataFetcher(fetcher: ReferralDataFetcher): void {
    this.getReferralData = fetcher;
  }

  /**
   * Send payment success notification with LEX branding and referral data
   */
  async sendPaymentSuccess(params: PaymentSuccessParams & { userId?: string }): Promise<void> {
    try {
      // Check user preferences if userId is available
      if (params.userId && this.getPreferences) {
        const prefs = await this.getPreferences(params.userId);
        if (!prefs.email_notifications || !prefs.notify_payment_success) {
          logger.info('Payment success email skipped due to user preferences', { userId: params.userId });
          return;
        }
      }

      // Fetch referral data if available
      let referralData: ReferralData | null = null;
      if (params.userId && this.getReferralData) {
        try {
          referralData = await this.getReferralData(params.userId);
        } catch (err: any) {
          logger.warn('Failed to fetch referral data for payment email', { userId: params.userId, error: err.message });
        }
      }

      const html = this.generatePaymentSuccessTemplate(params, referralData);

      const attachments: nodemailer.SendMailOptions['attachments'] = [];
      if (this.logoBuffer) {
        attachments.push({
          filename: 'logolex.png',
          content: this.logoBuffer,
          cid: 'lexlogo@legal.org.ua',
        });
      }

      await this.transporter.sendMail({
        from: `"${this.config.fromName}" <${this.config.from}>`,
        to: params.email,
        subject: `LEX — Оплата успішна: ${params.currency} ${params.amount.toFixed(2)}`,
        html,
        attachments,
      });

      logger.info('Payment success email sent', {
        email: maskSensitive(params.email, 4),
        amount: params.amount,
        currency: params.currency,
        hasReferralData: !!referralData,
      });
    } catch (error: any) {
      logger.error('Failed to send payment success email', {
        email: maskSensitive(params.email, 4),
        error: error.message,
      });
    }
  }

  /**
   * Send payment failure notification
   */
  async sendPaymentFailure(params: PaymentFailureParams & { userId?: string }): Promise<void> {
    try {
      // Check user preferences if userId is available
      if (params.userId && this.getPreferences) {
        const prefs = await this.getPreferences(params.userId);
        if (!prefs.email_notifications || !prefs.notify_payment_failure) {
          logger.info('Payment failure email skipped due to user preferences', { userId: params.userId });
          return;
        }
      }

      const html = this.generatePaymentFailureTemplate(params);

      await this.transporter.sendMail({
        from: `"${this.config.fromName}" <${this.config.from}>`,
        to: params.email,
        subject: `Payment Failed - ${params.currency} ${params.amount.toFixed(2)}`,
        html,
      });

      logger.info('Payment failure email sent', {
        email: maskSensitive(params.email, 4),
        amount: params.amount,
        currency: params.currency,
      });
    } catch (error: any) {
      logger.error('Failed to send payment failure email', {
        email: maskSensitive(params.email, 4),
        error: error.message,
      });
    }
  }

  /**
   * Send low balance alert
   */
  async sendLowBalanceAlert(params: LowBalanceParams & { userId?: string }): Promise<void> {
    try {
      // Check user preferences if userId is available
      if (params.userId && this.getPreferences) {
        const prefs = await this.getPreferences(params.userId);
        if (!prefs.email_notifications || !prefs.notify_low_balance) {
          logger.info('Low balance email skipped due to user preferences', { userId: params.userId });
          return;
        }
        // Use user's custom threshold
        if (params.balance >= prefs.low_balance_threshold_usd) {
          logger.info('Balance above user threshold, skipping alert', {
            userId: params.userId,
            balance: params.balance,
            threshold: prefs.low_balance_threshold_usd,
          });
          return;
        }
      }

      const html = this.generateLowBalanceTemplate(params);

      await this.transporter.sendMail({
        from: `"${this.config.fromName}" <${this.config.from}>`,
        to: params.email,
        subject: `Low Balance Alert - ${params.currency} ${params.balance.toFixed(2)}`,
        html,
      });

      logger.info('Low balance alert sent', {
        email: maskSensitive(params.email, 4),
        balance: params.balance,
        currency: params.currency,
      });
    } catch (error: any) {
      logger.error('Failed to send low balance alert', {
        email: maskSensitive(params.email, 4),
        error: error.message,
      });
    }
  }

  /**
   * Send email verification link
   */
  async sendVerificationEmail(email: string, token: string): Promise<void> {
    try {
      const verificationUrl = `${this.frontendUrl}/verify-email?token=${token}`;

      await this.transporter.sendMail({
        from: `"${this.config.fromName}" <${this.config.from}>`,
        to: email,
        subject: 'Verify your email - SecondLayer',
        html: this.generateVerificationEmailTemplate(email, verificationUrl),
      });

      logger.info('Verification email sent', { email });
    } catch (error: any) {
      logger.error('Failed to send verification email', {
        email,
        error: error.message,
      });
    }
  }

  /**
   * Send password reset link
   */
  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    try {
      const resetUrl = `${this.frontendUrl}/reset-password?token=${token}`;

      await this.transporter.sendMail({
        from: `"${this.config.fromName}" <${this.config.from}>`,
        to: email,
        subject: 'Reset your password - SecondLayer',
        html: this.generatePasswordResetEmailTemplate(email, resetUrl),
      });

      logger.info('Password reset email sent', { email });
    } catch (error: any) {
      logger.error('Failed to send password reset email', {
        email,
        error: error.message,
      });
    }
  }

  /**
   * Generate verification email template
   */
  private generateVerificationEmailTemplate(email: string, verificationUrl: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2196F3; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
    .button { display: inline-block; background: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Verify Your Email</h1>
    </div>
    <div class="content">
      <p>Thank you for registering with SecondLayer!</p>
      <p>Please click the button below to verify your email address:</p>
      <p style="text-align: center;">
        <a href="${verificationUrl}" class="button">Verify Email</a>
      </p>
      <p>Or copy and paste this link into your browser:</p>
      <p style="word-break: break-all; font-size: 14px; color: #666;">${verificationUrl}</p>
      <p>This link is valid for 24 hours.</p>
      <p>If you didn't create an account, you can safely ignore this email.</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} SecondLayer Legal Platform. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Generate password reset email template
   */
  private generatePasswordResetEmailTemplate(email: string, resetUrl: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #ff9800; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
    .button { display: inline-block; background: #2196F3; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Password Reset</h1>
    </div>
    <div class="content">
      <p>You requested a password reset for your SecondLayer account.</p>
      <p>Click the button below to create a new password:</p>
      <p style="text-align: center;">
        <a href="${resetUrl}" class="button">Reset Password</a>
      </p>
      <p>Or copy and paste this link into your browser:</p>
      <p style="word-break: break-all; font-size: 14px; color: #666;">${resetUrl}</p>
      <p>This link is valid for 1 hour.</p>
      <p>If you didn't request a password reset, you can safely ignore this email.</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} SecondLayer Legal Platform. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Generate LEX-branded payment success email template with referral data
   */
  private generatePaymentSuccessTemplate(params: PaymentSuccessParams, referralData: ReferralData | null): string {
    const logoImg = this.logoBuffer
      ? '<img src="cid:lexlogo@legal.org.ua" alt="LEX" width="80" height="80" style="display:block;margin:0 auto 10px;" />'
      : '<div style="font-size:36px;font-weight:bold;color:#1e293b;letter-spacing:4px;">LEX</div>';

    const referralSection = this.generateReferralSection(referralData);

    return `
<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 0; background: #f1f5f9; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.07); }
    .header { background: #1e293b; padding: 30px 20px; text-align: center; }
    .header h1 { color: #ffffff; font-size: 20px; margin: 10px 0 0; font-weight: 600; }
    .success-badge { display: inline-block; background: #22c55e; color: #fff; padding: 6px 18px; border-radius: 20px; font-size: 14px; font-weight: 600; margin-top: 12px; }
    .content { padding: 30px; }
    .amount-block { text-align: center; margin: 24px 0; }
    .amount { font-size: 36px; font-weight: 700; color: #1e293b; }
    .amount-label { font-size: 13px; color: #64748b; margin-top: 4px; }
    .details-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .details-table td { padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
    .details-table td:first-child { color: #64748b; }
    .details-table td:last-child { text-align: right; font-weight: 600; color: #1e293b; }
    .details-table tr:last-child td { border-bottom: none; }
    .btn { display: inline-block; background: #1e293b; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; }
    .btn-center { text-align: center; margin: 24px 0; }
    .referral-box { background: #fefce8; border: 1px solid #fde047; border-radius: 10px; padding: 20px; margin: 24px 0; }
    .referral-box h3 { margin: 0 0 8px; font-size: 16px; color: #854d0e; }
    .referral-box p { margin: 4px 0; font-size: 14px; color: #713f12; }
    .referral-code { display: inline-block; background: #ffffff; border: 2px dashed #eab308; padding: 8px 20px; border-radius: 6px; font-size: 20px; font-weight: 700; letter-spacing: 2px; color: #854d0e; margin: 10px 0; }
    .referral-stats { display: flex; gap: 16px; margin-top: 12px; }
    .referral-stat { flex: 1; background: #fff; border-radius: 6px; padding: 10px; text-align: center; }
    .referral-stat-value { font-size: 18px; font-weight: 700; color: #854d0e; }
    .referral-stat-label { font-size: 11px; color: #a16207; margin-top: 2px; }
    .referral-btn { display: inline-block; background: #eab308; color: #ffffff; padding: 10px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 13px; margin-top: 12px; }
    .divider { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
    .footer { text-align: center; padding: 20px; font-size: 12px; color: #94a3b8; }
    .footer a { color: #64748b; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="header">
        ${logoImg}
        <h1>Оплата пройшла успішно</h1>
        <div class="success-badge">Підтверджено</div>
      </div>
      <div class="content">
        <p>Вітаємо, ${params.name}!</p>
        <p>Ваш платіж успішно оброблено. Кошти зараховано на баланс.</p>

        <div class="amount-block">
          <div class="amount">${params.currency} ${params.amount.toFixed(2)}</div>
          <div class="amount-label">сума поповнення</div>
        </div>

        <table class="details-table">
          <tr>
            <td>Номер платежу</td>
            <td>${params.paymentId}</td>
          </tr>
          <tr>
            <td>Поточний баланс</td>
            <td>$${Number(params.newBalance).toFixed(2)} USD</td>
          </tr>
          <tr>
            <td>Дата</td>
            <td>${new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
          </tr>
        </table>

        <div class="btn-center">
          <a href="${this.frontendUrl}/dashboard" class="btn">Перейти до кабінету</a>
        </div>

        ${referralSection}

        <hr class="divider" />
        <p style="font-size:13px; color:#64748b; text-align:center;">
          Якщо у вас виникли питання — напишіть нам на <a href="mailto:support@legal.org.ua" style="color:#1e293b;">support@legal.org.ua</a>
        </p>
      </div>
      <div class="footer">
        <p>&copy; ${new Date().getFullYear()} LEX Legal Platform. Усі права захищено.</p>
        <p><a href="${this.frontendUrl}">legal.org.ua</a></p>
      </div>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Generate referral program section for payment email
   */
  private generateReferralSection(referralData: ReferralData | null): string {
    if (!referralData) {
      // Show generic referral CTA even without data
      return `
        <div class="referral-box">
          <h3>Запрошуйте колег — заробляйте 20%</h3>
          <p>Приєднуйтеся до реферальної програми LEX та отримуйте <strong>20% від кожного поповнення</strong> запрошених користувачів — довічно!</p>
          <div style="text-align:center; margin-top:12px;">
            <a href="${this.frontendUrl}/referral" class="referral-btn">Дізнатися більше</a>
          </div>
        </div>
      `;
    }

    if (!referralData.isVerified || !referralData.referralCode) {
      // User not verified yet — encourage to join
      return `
        <div class="referral-box">
          <h3>Запрошуйте колег — заробляйте 20%</h3>
          <p>Верифікуйте свій акаунт (ФОП, ТОВ або адвокат) та отримайте персональний реферальний код.</p>
          <p>Ви отримуватимете <strong>20% від кожного поповнення</strong> запрошених вами користувачів — довічно!</p>
          <div style="text-align:center; margin-top:12px;">
            <a href="${this.frontendUrl}/referral" class="referral-btn">Приєднатися до програми</a>
          </div>
        </div>
      `;
    }

    // Verified user with referral code — show code and stats
    return `
      <div class="referral-box">
        <h3>Ваша реферальна програма</h3>
        <p>Діліться вашим кодом з колегами та отримуйте <strong>20% від кожного їхнього поповнення</strong> — довічно!</p>
        <div style="text-align:center;">
          <div class="referral-code">${referralData.referralCode}</div>
        </div>
        <!--[if mso]><table role="presentation" width="100%"><tr><td width="50%" style="padding:5px"><![endif]-->
        <div style="text-align:center;">
          <table role="presentation" style="margin:12px auto;border-collapse:collapse;">
            <tr>
              <td style="background:#fff;border-radius:6px;padding:10px 20px;text-align:center;">
                <div class="referral-stat-value">${referralData.totalReferrals}</div>
                <div class="referral-stat-label">запрошених</div>
              </td>
              <td style="width:16px;"></td>
              <td style="background:#fff;border-radius:6px;padding:10px 20px;text-align:center;">
                <div class="referral-stat-value">$${referralData.totalEarnedUsd.toFixed(2)}</div>
                <div class="referral-stat-label">зароблено</div>
              </td>
            </tr>
          </table>
        </div>
        <p style="text-align:center; font-size:13px;">Посилання для запрошення: <a href="${this.frontendUrl}/register?ref=${referralData.referralCode}" style="color:#854d0e; font-weight:600;">${this.frontendUrl}/register?ref=${referralData.referralCode}</a></p>
        <div style="text-align:center; margin-top:8px;">
          <a href="${this.frontendUrl}/referral" class="referral-btn">Переглянути статистику</a>
        </div>
      </div>
    `;
  }

  /**
   * Generate payment failure email template
   */
  private generatePaymentFailureTemplate(params: PaymentFailureParams): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #f44336; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
    .amount { font-size: 28px; font-weight: bold; color: #f44336; margin: 20px 0; }
    .reason { background: #fff3cd; padding: 15px; border-left: 4px solid #ff9800; margin: 20px 0; }
    .button { display: inline-block; background: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚠ Payment Failed</h1>
    </div>
    <div class="content">
      <p>Hi ${params.name},</p>
      <p>We were unable to process your payment.</p>

      <div class="amount">${params.currency} ${params.amount.toFixed(2)}</div>

      <div class="reason">
        <strong>Reason:</strong> ${params.reason}
      </div>

      <p>Please try again with a different payment method or contact your bank for more information.</p>

      <a href="${this.frontendUrl}/topup" class="button">Try Again</a>

      <p>If you continue to experience issues, please contact our support team.</p>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} SecondLayer Legal Platform. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Generate low balance alert email template
   */
  private generateLowBalanceTemplate(params: LowBalanceParams): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #ff9800; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
    .balance { font-size: 32px; font-weight: bold; color: #ff9800; margin: 20px 0; }
    .warning { background: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0; }
    .button { display: inline-block; background: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚡ Low Balance Alert</h1>
    </div>
    <div class="content">
      <p>Hi ${params.name},</p>
      <p>Your SecondLayer account balance is running low.</p>

      <div class="balance">${params.currency} ${params.balance.toFixed(2)}</div>

      <div class="warning">
        ⚠️ You may not be able to use the API if your balance reaches $0.00
      </div>

      <p>Top up your account to continue using SecondLayer without interruption.</p>

      <a href="${this.frontendUrl}/topup" class="button">Top Up Now</a>

      <p>Need help? Contact our support team.</p>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} SecondLayer Legal Platform. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }
}

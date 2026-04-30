/**
 * Tests for EmailService — transporter initialization, email sending,
 * preference checking, template generation, and consultation emails.
 */

const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-msg-id' });
const mockVerify = jest.fn().mockResolvedValue(true);

jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: mockSendMail,
    verify: mockVerify,
  }),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue(Buffer.from('fake-image-data')),
}));

jest.mock('../../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../utils/sanitize-log.js', () => ({
  maskSensitive: jest.fn((val: string) => val),
}));

import { EmailService } from '../email-service';
import nodemailer from 'nodemailer';

describe('EmailService', () => {
  const originalEnv = process.env;
  let service: EmailService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      EMAIL_FROM: 'noreply@test.com',
      EMAIL_FROM_NAME: 'LEX Test',
      SMTP_HOST: 'smtp.test.com',
      SMTP_PORT: '587',
      SMTP_SECURE: 'false',
      SMTP_USER: 'testuser',
      SMTP_PASS: 'testpass',
      FRONTEND_URL: 'https://app.test.com',
    };
    service = new EmailService();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should create transporter with SMTP credentials', () => {
      new EmailService();

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.test.com',
          port: 587,
        })
      );
    });

    it('should create IP-based transporter when no credentials', () => {
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;

      new EmailService();

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.test.com',
          tls: expect.objectContaining({ rejectUnauthorized: false }),
        })
      );
    });

    it('should fall back to JSON transport in dev mode', () => {
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;

      new EmailService();

      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ jsonTransport: true })
      );
    });
  });

  describe('sendPaymentSuccess', () => {
    it('should send payment success email', async () => {
      await service.sendPaymentSuccess({
        email: 'user@test.com',
        name: 'Test User',
        amount: 100,
        currency: 'UAH',
        newBalance: 500,
        paymentId: 'pay-123',
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const mailOptions = mockSendMail.mock.calls[0][0];
      expect(mailOptions.to).toBe('user@test.com');
      expect(mailOptions.html).toContain('100');
      expect(mailOptions.html).toContain('UAH');
    });

    it('should skip when user preferences disable notifications', async () => {
      service.setPreferenceFetcher(async (): Promise<any> => ({
        payment_receipts: true,
        low_balance_alerts: true,
        monthly_summary: true,
        promotional: true,
        email_notifications: false,
        notify_payment_success: true,
        notify_low_balance: true,
        low_balance_threshold_usd: 5,
      }));

      await service.sendPaymentSuccess({
        email: 'user@test.com',
        name: 'Test',
        amount: 100,
        currency: 'UAH',
        newBalance: 500,
        paymentId: 'pay-123',
        userId: 'user-1',
      });

      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('should skip when payment success notifications disabled', async () => {
      service.setPreferenceFetcher(async (): Promise<any> => ({
        payment_receipts: true,
        low_balance_alerts: true,
        monthly_summary: true,
        promotional: true,
        email_notifications: true,
        notify_payment_success: false,
        notify_low_balance: true,
        low_balance_threshold_usd: 5,
      }));

      await service.sendPaymentSuccess({
        email: 'user@test.com',
        name: 'Test',
        amount: 50,
        currency: 'USD',
        newBalance: 200,
        paymentId: 'pay-456',
        userId: 'user-2',
      });

      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('should include referral data when available', async () => {
      service.setReferralDataFetcher(async () => ({
        referralCode: 'REF123',
        totalReferrals: 3,
        totalEarnedUsd: 15,
        totalEarnedUah: 600,
        isVerified: true,
      }));

      await service.sendPaymentSuccess({
        email: 'user@test.com',
        name: 'Test',
        amount: 100,
        currency: 'UAH',
        newBalance: 500,
        paymentId: 'pay-789',
        userId: 'user-3',
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('REF123');
    });
  });

  describe('sendPaymentFailure', () => {
    it('should send payment failure email', async () => {
      await service.sendPaymentFailure({
        email: 'user@test.com',
        name: 'Test User',
        amount: 50,
        currency: 'USD',
        reason: 'Card declined',
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const mailOptions = mockSendMail.mock.calls[0][0];
      expect(mailOptions.to).toBe('user@test.com');
      expect(mailOptions.html).toContain('Card declined');
    });
  });

  describe('sendLowBalanceAlert', () => {
    it('should send low balance alert', async () => {
      await service.sendLowBalanceAlert({
        email: 'user@test.com',
        name: 'Test User',
        balance: 2.5,
        currency: 'USD',
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('2.5');
    });

    it('should skip if balance above custom threshold', async () => {
      service.setPreferenceFetcher(async (): Promise<any> => ({
        payment_receipts: true,
        low_balance_alerts: true,
        monthly_summary: true,
        promotional: true,
        email_notifications: true,
        notify_payment_success: true,
        notify_low_balance: true,
        low_balance_threshold_usd: 1,
      }));

      await service.sendLowBalanceAlert({
        email: 'user@test.com',
        name: 'Test',
        balance: 3,
        currency: 'USD',
        userId: 'user-1',
      });

      expect(mockSendMail).not.toHaveBeenCalled();
    });
  });

  describe('sendVerificationEmail', () => {
    it('should send verification email with correct link', async () => {
      await service.sendVerificationEmail('new@test.com', 'verify-token-123');

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('https://app.test.com/verify-email?token=verify-token-123');
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should send reset email with correct link', async () => {
      await service.sendPasswordResetEmail('user@test.com', 'reset-token-456');

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('https://app.test.com/reset-password?token=reset-token-456');
    });
  });

  describe('sendAdminCredit', () => {
    it('should send admin credit email', async () => {
      await service.sendAdminCredit({
        email: 'test@test.com',
        name: 'Test Account',
        amount: 50,
        currency: 'USD',
        newBalance: 50,
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const mailOptions = mockSendMail.mock.calls[0][0];
      expect(mailOptions.to).toBe('test@test.com');
      expect(mailOptions.html).toContain('50');
    });
  });

  describe('consultation emails', () => {
    it('should send consultation request email', async () => {
      await service.sendConsultationRequestEmail({
        email: 'attorney@test.com',
        attorneyName: 'Адвокат',
        clientName: 'Клієнт',
        requestTitle: 'Правова допомога',
        consultationId: 'cons-1',
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('Правова допомога');
    });

    it('should send consultation accepted email', async () => {
      await service.sendConsultationAcceptedEmail({
        email: 'client@test.com',
        clientName: 'Клієнт',
        attorneyName: 'Адвокат',
        requestTitle: 'Допомога',
        agreedFeeUah: 5000,
        consultationId: 'cons-2',
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
    });

    it('should send consultation declined email', async () => {
      await service.sendConsultationDeclinedEmail({
        email: 'client@test.com',
        clientName: 'Клієнт',
        attorneyName: 'Адвокат',
        requestTitle: 'Допомога',
        reason: 'Конфлікт інтересів',
        consultationId: 'cons-3',
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
    });

    it('should send consultation completed email', async () => {
      await service.sendConsultationCompletedEmail({
        email: 'client@test.com',
        clientName: 'Клієнт',
        attorneyName: 'Адвокат',
        requestTitle: 'Допомога',
        consultationId: 'cons-4',
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
    });

    it('should send consultation cancelled email', async () => {
      await service.sendConsultationCancelledEmail({
        email: 'user@test.com',
        recipientName: 'User',
        cancelledByName: 'Other',
        requestTitle: 'Консультація',
        reason: 'Не потрібно',
        consultationId: 'cons-5',
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
    });

    it('should send dispute email', async () => {
      await service.sendConsultationDisputeEmail({
        email: 'user@test.com',
        recipientName: 'User',
        raisedByName: 'Other',
        requestTitle: 'Консультація',
        reason: 'Неякісна робота',
        consultationId: 'cons-6',
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendLegislationChangeNotification', () => {
    it('should send legislation change email', async () => {
      await service.sendLegislationChangeNotification({
        email: 'user@test.com',
        name: 'Test User',
        lawTitle: 'Цивільний кодекс',
        radaId: '435-15',
        changeCount: 3,
        changedArticles: '1, 5, 10',
        link: 'https://zakon.rada.gov.ua/laws/show/435-15',
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const html = mockSendMail.mock.calls[0][0].html;
      expect(html).toContain('Цивільний кодекс');
    });
  });

  describe('error handling', () => {
    it('should not throw when sendMail fails', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP connection failed'));

      await expect(
        service.sendPaymentSuccess({
          email: 'user@test.com',
          name: 'Test',
          amount: 100,
          currency: 'UAH',
          newBalance: 500,
          paymentId: 'pay-err',
        })
      ).resolves.not.toThrow();
    });
  });

  // ── sendSupportMessage (LEXAI-869) ─────────────────────────────────────

  describe('sendSupportMessage', () => {
    const baseParams = {
      type: 'feedback' as const,
      message: 'Знайшов баг на сторінці адвокатів',
      fromEmail: 'user@test.com',
      fromName: 'Іван Тест',
      userId: 'user-001',
    };

    it('sends email to the SUPPORT_EMAIL env variable', async () => {
      process.env.SUPPORT_EMAIL = 'support@legal.org.ua';
      service = new EmailService();

      await service.sendSupportMessage(baseParams);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.to).toBe('support@legal.org.ua');
    });

    it('falls back to info@legal.org.ua when SUPPORT_EMAIL is not set', async () => {
      delete process.env.SUPPORT_EMAIL;
      service = new EmailService();

      await service.sendSupportMessage(baseParams);

      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.to).toBe('info@legal.org.ua');
    });

    it('sets replyTo to the sender email', async () => {
      await service.sendSupportMessage(baseParams);

      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.replyTo).toBe('user@test.com');
    });

    it('includes "Зауваження" in subject for type="feedback"', async () => {
      await service.sendSupportMessage({ ...baseParams, type: 'feedback' });

      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.subject).toContain('Зауваження');
    });

    it('includes "Питання" in subject for type="question"', async () => {
      await service.sendSupportMessage({ ...baseParams, type: 'question' });

      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.subject).toContain('Питання');
    });

    it('includes sender name in the subject', async () => {
      await service.sendSupportMessage(baseParams);

      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.subject).toContain('Іван Тест');
    });

    it('includes message content in the HTML body', async () => {
      await service.sendSupportMessage(baseParams);

      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.html).toContain('Знайшов баг на сторінці адвокатів');
    });

    it('includes sender name and email in the HTML body', async () => {
      await service.sendSupportMessage(baseParams);

      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.html).toContain('Іван Тест');
      expect(mail.html).toContain('user@test.com');
    });

    it('includes userId in the HTML body', async () => {
      await service.sendSupportMessage(baseParams);

      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.html).toContain('user-001');
    });

    it('includes pageUrl in the HTML body when provided', async () => {
      await service.sendSupportMessage({
        ...baseParams,
        pageUrl: 'https://legal.org.ua/attorneys',
      });

      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.html).toContain('https://legal.org.ua/attorneys');
    });

    it('does not include pageUrl row in HTML when omitted', async () => {
      await service.sendSupportMessage(baseParams);

      const mail = mockSendMail.mock.calls[0][0];
      // The template uses conditional rendering — <b>Сторінка:</b> should be absent
      expect(mail.html).not.toContain('<b>Сторінка:</b>');
    });

    it('escapes HTML special characters in the message', async () => {
      await service.sendSupportMessage({
        ...baseParams,
        message: '<script>alert("xss")</script>',
      });

      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.html).not.toContain('<script>');
      expect(mail.html).toContain('&lt;script&gt;');
    });

    it('throws when sendMail rejects (not swallowed)', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP unavailable'));

      await expect(service.sendSupportMessage(baseParams)).rejects.toThrow('SMTP unavailable');
    });
  });
});

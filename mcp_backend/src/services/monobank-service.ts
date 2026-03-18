/**
 * MonobankService
 * Full Monobank Acquiring payment integration.
 * Configure MONOBANK_API_KEY to enable real payments.
 */

import { createVerify, createPublicKey } from 'crypto';
import { logger } from '../utils/logger.js';
import { BillingService } from './billing-service.js';
import { EmailService } from './email-service.js';
import { invoiceService } from './invoice-service.js';
import type { IDatabase } from '../domain/ports/index.js';

export interface MonobankInvoiceResult {
  invoiceId: string;
  pageUrl: string;
  paymentIntentId: string;
}

export interface MonobankPaymentStatus {
  status: 'created' | 'processing' | 'hold' | 'success' | 'failure' | 'reversed' | 'expired';
  amount: number;
  currency: string;
  invoiceId: string;
}

export interface MonobankWebhookBody {
  invoiceId: string;
  status: string;
  amount: number;
  ccy: number;
  reference?: string;
  [key: string]: unknown;
}

export class MonobankService {
  constructor(
    protected billingService: BillingService,
    protected emailService: EmailService,
    protected db: IDatabase
  ) {}

  private get apiKey(): string {
    const key = process.env.MONOBANK_API_KEY;
    if (!key) throw new Error('MonobankService not yet configured: MONOBANK_API_KEY is missing');
    return key;
  }

  private get redirectUrl(): string {
    return process.env.MONOBANK_REDIRECT_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
  }

  /**
   * Create a Monobank invoice (hosted payment page).
   * Stores payment_intent in DB for idempotent webhook processing.
   */
  async createInvoice(
    userId: string,
    amountUah: number,
    description: string,
    redirectUrl?: string,
    email?: string
  ): Promise<MonobankInvoiceResult> {
    const key = this.apiKey; // throws if not configured

    if (amountUah < 1) {
      throw new Error('Мінімальна сума поповнення — 1 ₴');
    }

    // Amount in kopecks (1 UAH = 100 kopecks)
    const amountKopecks = Math.round(amountUah * 100);
    const finalRedirectUrl = redirectUrl || `${this.redirectUrl}/payment/success`;
    const orderRef = `SL-${userId.substring(0, 8)}-${Date.now()}`;

    logger.info('[MonobankService] Creating invoice', { userId, amountUah, amountKopecks });

    const response = await fetch('https://api.monobank.ua/api/merchant/invoice/create', {
      method: 'POST',
      headers: {
        'X-Token': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountKopecks,
        ccy: 980, // UAH
        merchantPaymInfo: {
          reference: orderRef,
          destination: description,
          comment: description,
        },
        redirectUrl: finalRedirectUrl,
        webHookUrl: `${process.env.PUBLIC_URL || 'http://localhost:3000'}/webhooks/monobank`,
        validity: 3600, // 1 hour
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Monobank API error: ${response.status} ${body}`);
    }

    const data = (await response.json()) as { invoiceId: string; pageUrl: string };

    // Store payment_intent for idempotent webhook processing
    const insertResult = await this.db.query(
      `INSERT INTO payment_intents
        (user_id, provider, external_id, amount_usd, amount_uah, status, metadata)
       VALUES ($1, 'monobank', $2, $3, $4, 'pending', $5)
       RETURNING id`,
      [
        userId,
        data.invoiceId,
        0, // amount_usd not applicable for UAH payments
        amountUah,
        JSON.stringify({ email, orderRef, pageUrl: data.pageUrl }),
      ]
    );

    const paymentIntentId = insertResult.rows[0].id;

    logger.info('[MonobankService] Invoice created', {
      userId,
      invoiceId: data.invoiceId,
      paymentIntentId,
      amountUah,
    });

    return {
      invoiceId: data.invoiceId,
      pageUrl: data.pageUrl,
      paymentIntentId,
    };
  }

  private cachedPubKey: string | null = null;
  private pubKeyFetchedAt = 0;

  /**
   * Fetch Monobank's ECDSA public key for webhook signature verification.
   * Cached for 1 hour.
   */
  private async getMonobankPublicKey(): Promise<string> {
    const ONE_HOUR = 60 * 60 * 1000;
    if (this.cachedPubKey && Date.now() - this.pubKeyFetchedAt < ONE_HOUR) {
      return this.cachedPubKey;
    }

    const response = await fetch('https://api.monobank.ua/api/merchant/pubkey', {
      headers: { 'X-Token': this.apiKey },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Monobank public key: ${response.status}`);
    }

    const data = (await response.json()) as { key: string };
    this.cachedPubKey = data.key;
    this.pubKeyFetchedAt = Date.now();

    logger.info('[MonobankService] Public key fetched/refreshed');
    return data.key;
  }

  /**
   * Validate Monobank webhook ECDSA signature.
   * Monobank signs the raw request body with ECDSA P-256 and sends
   * the base64-encoded signature in the X-Sign header.
   */
  async validateSignature(rawBody: Buffer | string, signature: string): Promise<boolean> {
    try {
      const pubKeyBase64 = await this.getMonobankPublicKey();
      const pubKeyDer = Buffer.from(pubKeyBase64, 'base64');
      const pubKey = createPublicKey({
        key: pubKeyDer,
        format: 'der',
        type: 'spki',
      });

      const verify = createVerify('SHA256');
      verify.update(typeof rawBody === 'string' ? rawBody : rawBody);
      verify.end();

      return verify.verify(pubKey, signature, 'base64');
    } catch (err: any) {
      logger.error('[MonobankService] Signature validation error', { error: err.message });
      return false;
    }
  }

  /**
   * Handle Monobank webhook callback.
   * Validates signature, looks up payment_intent, credits balance, sends email.
   */
  async handleWebhook(rawBody: Buffer | string, body: MonobankWebhookBody, signature: string): Promise<{ received: boolean }> {
    if (!(await this.validateSignature(rawBody, signature))) {
      logger.warn('[MonobankService] Webhook signature validation failed');
      throw new Error('Invalid webhook signature');
    }

    logger.info('[MonobankService] Webhook received', {
      invoiceId: body.invoiceId,
      status: body.status,
    });

    // Only process successful payments
    if (body.status !== 'success') {
      // Update status for non-success terminal statuses
      if (['failure', 'reversed', 'expired'].includes(body.status)) {
        await this.db.query(
          'UPDATE payment_intents SET status = $1, updated_at = NOW() WHERE external_id = $2 AND provider = $3',
          [body.status === 'failure' ? 'failed' : body.status, body.invoiceId, 'monobank']
        );
      }
      return { received: true };
    }

    // Look up payment_intent by invoiceId (external_id)
    const piResult = await this.db.query(
      'SELECT * FROM payment_intents WHERE external_id = $1 AND provider = $2',
      [body.invoiceId, 'monobank']
    );

    if (piResult.rows.length === 0) {
      logger.warn('[MonobankService] Webhook: payment intent not found', { invoiceId: body.invoiceId });
      return { received: true };
    }

    const pi = piResult.rows[0];

    // Idempotency: skip if already processed
    if (pi.status === 'succeeded') {
      logger.warn('[MonobankService] Webhook: already processed', { invoiceId: body.invoiceId });
      return { received: true };
    }

    // Mark as succeeded
    await this.db.query(
      'UPDATE payment_intents SET status = $1, updated_at = NOW() WHERE id = $2',
      ['succeeded', pi.id]
    );

    // Credit user balance
    const amountUah = parseFloat(pi.amount_uah) || (body.amount / 100);
    const transaction = await this.billingService.topUpBalance({
      userId: pi.user_id,
      amountUsd: 0,
      amountUah,
      description: `Поповнення через Monobank: ${amountUah} ₴`,
      paymentProvider: 'monobank',
      paymentId: pi.id,
      metadata: { invoiceId: body.invoiceId, reference: body.reference },
    });

    // Generate invoice number
    const invoiceNumber = invoiceService.generateInvoiceNumber(transaction.id);
    await this.billingService.setTransactionInvoiceNumber(transaction.id, invoiceNumber);

    logger.info('[MonobankService] Payment succeeded', {
      paymentIntentId: pi.id,
      amountUah,
      transactionId: transaction.id,
      invoiceNumber,
    });

    // Send confirmation email
    const metadata = JSON.parse(pi.metadata || '{}');
    if (metadata.email) {
      try {
        await this.emailService.sendPaymentSuccess({
          email: metadata.email,
          name: 'User',
          amount: amountUah,
          currency: 'UAH',
          newBalance: transaction.balance_after_usd,
          paymentId: pi.id,
          userId: pi.user_id,
        });
      } catch (emailErr: any) {
        logger.error('[MonobankService] Failed to send confirmation email', { error: emailErr.message });
      }
    }

    return { received: true };
  }

  /**
   * Get the status of a Monobank invoice.
   */
  async getPaymentStatus(invoiceId: string): Promise<MonobankPaymentStatus> {
    const key = this.apiKey; // throws if not configured

    logger.info('[MonobankService] Getting payment status', { invoiceId });

    const response = await fetch(
      `https://api.monobank.ua/api/merchant/invoice/status?invoiceId=${encodeURIComponent(invoiceId)}`,
      {
        method: 'GET',
        headers: { 'X-Token': key },
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Monobank API error: ${response.status} ${body}`);
    }

    const data = (await response.json()) as any;
    return {
      status: data.status,
      amount: data.amount / 100, // convert kopecks back to UAH
      currency: 'UAH',
      invoiceId,
    };
  }
}

/**
 * NOWPayments Service
 * Handles crypto payment invoices via NOWPayments API with IPN webhook verification
 */

import crypto from 'crypto';
import { BillingService } from './billing-service.js';
import { EmailService } from './email-service.js';
import { invoiceService } from './invoice-service.js';
import { logger } from '../utils/logger.js';
import type { IDatabase } from '../domain/ports/index.js';

const NOWPAYMENTS_API = 'https://api.nowpayments.io/v1';

export interface NOWPaymentsInvoiceResult {
  invoiceId: string;
  paymentIntentId: string;
  invoiceUrl: string;
  amountUsd: number;
}

export class NOWPaymentsService {
  private apiKey: string;
  private ipnSecret: string;

  constructor(
    private billingService: BillingService,
    private emailService: EmailService,
    private db: IDatabase
  ) {
    this.apiKey = process.env.NOWPAYMENTS_API_KEY || '';
    this.ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET || '';

    if (!this.apiKey || !this.ipnSecret) {
      throw new Error('NOWPAYMENTS_API_KEY and NOWPAYMENTS_IPN_SECRET are required');
    }

    logger.info('NOWPaymentsService initialized');
  }

  /**
   * Create a NOWPayments hosted invoice
   */
  async createInvoice(
    userId: string,
    amountUsd: number,
    email: string
  ): Promise<NOWPaymentsInvoiceResult> {
    if (amountUsd < 1) {
      throw new Error('Minimum top-up amount is $1.00');
    }

    const orderDescription = `SecondLayer balance top-up: $${amountUsd.toFixed(2)}`;
    const orderRef = `SL-${userId.substring(0, 8)}-${Date.now()}`;

    const body = {
      price_amount: amountUsd,
      price_currency: 'usd',
      order_id: orderRef,
      order_description: orderDescription,
      ipn_callback_url: `${process.env.PUBLIC_URL || process.env.APP_URL || 'https://stage.legal.org.ua'}/webhooks/nowpayments`,
      success_url: `${process.env.FRONTEND_URL || process.env.APP_URL || 'https://stage.legal.org.ua'}/billing?tab=topup&status=success`,
      cancel_url: `${process.env.FRONTEND_URL || process.env.APP_URL || 'https://stage.legal.org.ua'}/billing?tab=topup&status=cancel`,
    };

    const response = await fetch(`${NOWPAYMENTS_API}/invoice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json() as any;

    if (!response.ok || !data.id) {
      logger.error('NOWPayments invoice creation failed', { response: data });
      throw new Error(`NOWPayments error: ${data.message || 'Unknown error'}`);
    }

    // Store in payment_intents for idempotency
    const insertResult = await this.db.query(
      `INSERT INTO payment_intents
        (user_id, provider, external_id, amount_usd, status, metadata)
       VALUES ($1, 'nowpayments', $2, $3, 'pending', $4)
       RETURNING id`,
      [userId, String(data.id), amountUsd, JSON.stringify({ email, orderRef, invoiceUrl: data.invoice_url })]
    );

    const paymentIntentId = insertResult.rows[0].id;

    logger.info('NOWPayments invoice created', {
      paymentIntentId,
      userId,
      amountUsd,
      invoiceId: data.id,
    });

    return {
      invoiceId: String(data.id),
      paymentIntentId,
      invoiceUrl: data.invoice_url,
      amountUsd,
    };
  }

  /**
   * Verify IPN webhook signature
   * NOWPayments signs the sorted JSON body with HMAC-SHA512 using IPN secret
   */
  verifySignature(rawBody: Buffer, signature: string): boolean {
    const sortedBody = JSON.stringify(
      Object.keys(JSON.parse(rawBody.toString('utf8')))
        .sort()
        .reduce((acc: Record<string, any>, key) => {
          acc[key] = JSON.parse(rawBody.toString('utf8'))[key];
          return acc;
        }, {})
    );

    const expected = crypto
      .createHmac('sha512', this.ipnSecret)
      .update(sortedBody)
      .digest('hex');

    return expected === signature;
  }

  /**
   * Handle NOWPayments IPN webhook callback
   */
  async handleWebhook(
    rawBody: Buffer,
    signature: string
  ): Promise<{ received: boolean }> {
    if (!this.verifySignature(rawBody, signature)) {
      throw new Error('Invalid NOWPayments IPN signature');
    }

    const payload = JSON.parse(rawBody.toString('utf8'));
    const { payment_status, invoice_id, payment_id, price_amount, price_currency } = payload;

    logger.info('NOWPayments IPN received', { payment_status, invoice_id, payment_id });

    const terminalStatuses = ['finished', 'confirmed'];
    if (!terminalStatuses.includes(payment_status)) {
      // Not yet final — acknowledge but skip processing
      return { received: true };
    }

    // Look up by invoice_id (external_id)
    const piResult = await this.db.query(
      'SELECT * FROM payment_intents WHERE external_id = $1 AND provider = $2',
      [String(invoice_id), 'nowpayments']
    );

    if (piResult.rows.length === 0) {
      logger.warn('NOWPayments webhook: payment intent not found', { invoice_id });
      return { received: true };
    }

    const pi = piResult.rows[0];

    if (pi.status === 'succeeded') {
      logger.warn('NOWPayments webhook: already processed', { invoice_id });
      return { received: true };
    }

    // Mark as succeeded
    await this.db.query(
      'UPDATE payment_intents SET status = $1, updated_at = NOW() WHERE id = $2',
      ['succeeded', pi.id]
    );

    // Credit user balance
    const transaction = await this.billingService.topUpBalance({
      userId: pi.user_id,
      amountUsd: parseFloat(pi.amount_usd),
      description: `NOWPayments crypto payment: ${invoice_id}`,
      paymentProvider: 'nowpayments',
      paymentId: pi.id,
      metadata: { invoice_id, payment_id, payment_status },
    });

    const invoiceNumber = invoiceService.generateInvoiceNumber(transaction.id);
    await this.billingService.setTransactionInvoiceNumber(transaction.id, invoiceNumber);

    logger.info('NOWPayments payment succeeded', {
      paymentIntentId: pi.id,
      amountUsd: pi.amount_usd,
      transactionId: transaction.id,
    });

    // Send confirmation email
    const metadata = JSON.parse(pi.metadata || '{}');
    if (metadata.email) {
      await this.emailService.sendPaymentSuccess({
        email: metadata.email,
        name: 'User',
        amount: parseFloat(pi.amount_usd),
        currency: 'USD',
        newBalance: transaction.balance_after_usd,
        paymentId: pi.id,
        userId: pi.user_id,
      });
    }

    return { received: true };
  }

  /**
   * Get payment status by internal payment intent ID
   */
  async getPaymentStatus(paymentIntentId: string): Promise<{ status: string; amount: number; currency: string }> {
    const result = await this.db.query(
      'SELECT status, amount_usd FROM payment_intents WHERE id = $1 AND provider = $2',
      [paymentIntentId, 'nowpayments']
    );

    if (result.rows.length === 0) {
      throw new Error('Payment intent not found');
    }

    return {
      status: result.rows[0].status,
      amount: parseFloat(result.rows[0].amount_usd),
      currency: 'usd',
    };
  }
}

/**
 * Mock NOWPayments Service for Development/Testing
 */

import { BillingService } from '../billing-service.js';
import { EmailService } from '../email-service.js';
import { invoiceService } from '../invoice-service.js';
import { logger } from '../../utils/logger.js';

export interface NOWPaymentsInvoiceResult {
  invoiceId: string;
  paymentIntentId: string;
  invoiceUrl: string;
  amountUsd: number;
}

export class MockNOWPaymentsService {
  private mockInvoices: Map<string, any> = new Map();

  constructor(
    private billingService: BillingService,
    private emailService: EmailService
  ) {
    logger.info('MockNOWPaymentsService initialized (TEST MODE)');
  }

  async createInvoice(
    userId: string,
    amountUsd: number,
    email: string
  ): Promise<NOWPaymentsInvoiceResult> {
    if (amountUsd < 1) {
      throw new Error('Minimum top-up amount is $1.00');
    }

    const invoiceId = `np_mock_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const paymentIntentId = invoiceId;

    this.mockInvoices.set(invoiceId, {
      userId,
      amountUsd,
      email,
      status: 'pending',
    });

    logger.info('[MOCK] NOWPayments invoice created', { invoiceId, userId, amountUsd });

    return {
      invoiceId,
      paymentIntentId,
      invoiceUrl: `https://nowpayments.io/payment/?iid=${invoiceId}`,
      amountUsd,
    };
  }

  verifySignature(_rawBody: Buffer, _signature: string): boolean {
    return true; // Always valid in mock mode
  }

  async handleWebhook(
    rawBody: Buffer,
    _signature: string
  ): Promise<{ received: boolean }> {
    logger.info('[MOCK] NOWPayments IPN received (signature not verified in mock mode)');

    const payload = JSON.parse(rawBody.toString('utf8'));
    const invoiceId = payload?.invoice_id || payload?.invoiceId;

    if (invoiceId && this.mockInvoices.has(invoiceId)) {
      const invoice = this.mockInvoices.get(invoiceId);
      if (invoice.status !== 'succeeded') {
        invoice.status = 'succeeded';
        this.mockInvoices.set(invoiceId, invoice);

        const transaction = await this.billingService.topUpBalance({
          userId: invoice.userId,
          amountUsd: invoice.amountUsd,
          description: `[MOCK] NOWPayments payment: ${invoiceId}`,
          paymentProvider: 'nowpayments_mock',
          paymentId: invoiceId,
          metadata: { invoiceId },
        });

        const invoiceNumber = invoiceService.generateInvoiceNumber(transaction.id);
        await this.billingService.setTransactionInvoiceNumber(transaction.id, invoiceNumber);

        logger.info('[MOCK] NOWPayments payment succeeded', { invoiceId, amountUsd: invoice.amountUsd });
      }
    }

    return { received: true };
  }

  async getPaymentStatus(paymentIntentId: string): Promise<{ status: string; amount: number; currency: string }> {
    const invoice = this.mockInvoices.get(paymentIntentId);
    if (!invoice) {
      throw new Error('Payment intent not found');
    }

    return {
      status: invoice.status,
      amount: invoice.amountUsd,
      currency: 'usd',
    };
  }

  /**
   * Mock-only: simulate successful payment (for testing)
   */
  async simulatePaymentSuccess(invoiceId: string): Promise<void> {
    const invoice = this.mockInvoices.get(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    await this.handleWebhook(
      Buffer.from(JSON.stringify({ invoice_id: invoiceId, payment_status: 'finished' })),
      'mock_signature'
    );
  }
}

/**
 * Invoice Service
 * Generates invoice numbers and PDF invoices for billing transactions
 */

import fs from 'fs';
import PDFDocument from 'pdfkit';
import { logger } from '../utils/logger.js';

// Cyrillic-supporting font paths (checked in order)
const FONT_CANDIDATES: { regular: string; bold: string }[] = [
  { // Alpine (Docker prod/stage)
    regular: '/usr/share/fonts/freefont/FreeSans.otf',
    bold: '/usr/share/fonts/freefont/FreeSansBold.otf',
  },
  { // Debian/Ubuntu (local dev)
    regular: '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    bold: '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  },
  { // Alternative Debian path
    regular: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    bold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  },
];

function findFont(): { regular: string; bold: string } | null {
  for (const candidate of FONT_CANDIDATES) {
    if (fs.existsSync(candidate.regular) && fs.existsSync(candidate.bold)) {
      return candidate;
    }
  }
  return null;
}

export interface InvoiceItem {
  description: string;
  amount: number;
  currency: string;
}

export interface InvoiceData {
  invoiceNumber: string;
  date: Date;
  dueDate?: Date;
  customerName: string;
  customerEmail: string;
  items: InvoiceItem[];
  subtotal: number;
  tax?: number;
  total: number;
  currency: 'USD' | 'UAH';
  paymentMethod: string;
  status: 'paid' | 'pending' | 'overdue';
  paymentId?: string;
  transactionId?: string;
}

export class InvoiceService {
  /**
   * Generate invoice number from transaction ID
   */
  generateInvoiceNumber(transactionId: string): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const txShort = transactionId.substring(0, 8).toUpperCase();
    return `INV-${timestamp}-${txShort}`;
  }

  /**
   * Generate PDF invoice as buffer
   */
  async generateInvoicePDF(invoice: InvoiceData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Register Unicode font for Cyrillic + ₴ support
        const font = findFont();
        let fontRegular = 'Helvetica';
        let fontBold = 'Helvetica-Bold';
        if (font) {
          doc.registerFont('Sans', font.regular);
          doc.registerFont('Sans-Bold', font.bold);
          fontRegular = 'Sans';
          fontBold = 'Sans-Bold';
        } else {
          logger.warn('[InvoiceService] No Cyrillic font found, falling back to Helvetica');
        }

        const currencySymbol = invoice.currency === 'USD' ? '$' : '\u20B4';

        // Header
        doc
          .fontSize(24)
          .font(fontBold)
          .text('SecondLayer', 50, 50)
          .fontSize(10)
          .font(fontRegular)
          .text('\u041E\u0434\u0435\u0440\u0436\u0443\u0432\u0430\u0447: \u0424\u041E\u041F \u041A\u0438\u0440\u0438\u0447\u0435\u043D\u043A\u043E \u0406\u0433\u043E\u0440 \u0412\u0456\u043A\u0442\u043E\u0440\u043E\u0432\u0438\u0447', 50, 80)
          .text('IBAN: UA613220010000026006330050699', 50, 95)
          .text('\u0404\u0414\u0420\u041F\u041E\u0423: 2967214056 | \u0410\u0422 \u00AB\u0423\u041D\u0406\u0412\u0415\u0420\u0421\u0410\u041B \u0411\u0410\u041D\u041A\u00BB', 50, 110);

        // Invoice title and status
        doc
          .fontSize(20)
          .font(fontBold)
          .text('INVOICE', 400, 50, { align: 'right' });

        doc
          .fontSize(10)
          .font(fontRegular)
          .text(`Invoice #: ${invoice.invoiceNumber}`, 400, 80, { align: 'right' })
          .text(`Date: ${invoice.date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`, 400, 95, { align: 'right' })
          .text(`Status: ${invoice.status.toUpperCase()}`, 400, 110, { align: 'right' });

        // Bill To
        doc
          .fontSize(12)
          .font(fontBold)
          .text('Bill To:', 50, 160);

        doc
          .fontSize(10)
          .font(fontRegular)
          .text(invoice.customerName, 50, 180)
          .text(invoice.customerEmail, 50, 195);

        // Items table
        const tableTop = 250;
        const descriptionX = 50;
        const amountX = 450;

        // Table header
        doc
          .fontSize(10)
          .font(fontBold)
          .text('Description', descriptionX, tableTop)
          .text('Amount', amountX, tableTop);

        doc
          .moveTo(50, tableTop + 15)
          .lineTo(550, tableTop + 15)
          .stroke();

        // Table rows
        let currentY = tableTop + 25;
        doc.font(fontRegular);

        for (const item of invoice.items) {
          doc
            .text(item.description, descriptionX, currentY, { width: 380 })
            .text(`${currencySymbol}${item.amount.toFixed(2)}`, amountX, currentY);
          currentY += 20;
        }

        // Totals
        currentY += 20;
        doc
          .moveTo(50, currentY)
          .lineTo(550, currentY)
          .stroke();

        currentY += 15;
        const totalsX = 350;

        doc
          .fontSize(10)
          .text('Subtotal:', totalsX, currentY)
          .text(`${currencySymbol}${invoice.subtotal.toFixed(2)}`, amountX, currentY);

        if (invoice.tax && invoice.tax > 0) {
          currentY += 20;
          doc
            .text('VAT (20%):', totalsX, currentY)
            .text(`${currencySymbol}${invoice.tax.toFixed(2)}`, amountX, currentY);
        }

        currentY += 20;
        doc
          .font(fontBold)
          .fontSize(12)
          .text('Total:', totalsX, currentY)
          .text(`${currencySymbol}${invoice.total.toFixed(2)}`, amountX, currentY);

        // Payment info
        currentY += 40;
        doc
          .fontSize(10)
          .font(fontRegular)
          .text(`Payment Method: ${invoice.paymentMethod}`, 50, currentY);

        if (invoice.paymentId) {
          currentY += 15;
          doc.text(`Payment ID: ${invoice.paymentId}`, 50, currentY);
        }

        // Footer
        doc
          .fontSize(8)
          .text(
            '\u0424\u041E\u041F \u041A\u0438\u0440\u0438\u0447\u0435\u043D\u043A\u043E \u0406.\u0412. | \u0404\u0414\u0420\u041F\u041E\u0423: 2967214056 | billing@legal.org.ua',
            50,
            700,
            { align: 'center', width: 500 }
          );

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Create invoice data from payment transaction
   */
  createInvoiceFromTransaction(
    transactionId: string,
    invoiceNumber: string,
    userName: string,
    userEmail: string,
    amount: number,
    currency: 'USD' | 'UAH',
    paymentMethod: string,
    date: Date,
    paymentId?: string
  ): InvoiceData {
    // Calculate tax for UAH (20% VAT — amount includes VAT)
    const tax = currency === 'UAH' ? amount * 0.2 : undefined;
    const subtotal = tax ? amount - tax : amount;

    return {
      invoiceNumber,
      date,
      customerName: userName,
      customerEmail: userEmail,
      items: [
        {
          description: 'SecondLayer Account Top-Up',
          amount: subtotal,
          currency,
        },
      ],
      subtotal,
      tax,
      total: amount,
      currency,
      paymentMethod,
      status: 'paid',
      paymentId,
      transactionId,
    };
  }
}

export const invoiceService = new InvoiceService();

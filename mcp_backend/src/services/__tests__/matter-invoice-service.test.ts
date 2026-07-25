/**
 * Tests for MatterInvoiceService — invoice CRUD, time entry billing,
 * payment recording, voiding, PDF generation, and line items.
 */

jest.mock('pdfkit', () => {
  const mockDoc = {
    font: jest.fn().mockReturnThis(),
    fontSize: jest.fn().mockReturnThis(),
    text: jest.fn().mockReturnThis(),
    moveDown: jest.fn().mockReturnThis(),
    moveTo: jest.fn().mockReturnThis(),
    lineTo: jest.fn().mockReturnThis(),
    stroke: jest.fn().mockReturnThis(),
    strokeColor: jest.fn().mockReturnThis(),
    lineWidth: jest.fn().mockReturnThis(),
    fillColor: jest.fn().mockReturnThis(),
    rect: jest.fn().mockReturnThis(),
    fill: jest.fn().mockReturnThis(),
    registerFont: jest.fn().mockReturnThis(),
    addPage: jest.fn().mockReturnThis(),
    end: jest.fn(),
    on: jest.fn().mockImplementation(function(this: any, event: string, cb: Function) {
      if (event === 'data') setTimeout(() => cb(Buffer.from('chunk')), 0);
      if (event === 'end') setTimeout(() => cb(), 10);
      return this;
    }),
    y: 100,
    page: { width: 595, height: 842 },
  };
  return jest.fn().mockImplementation(() => mockDoc);
});

jest.mock('../../utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

import { MatterInvoiceService } from '../matter-invoice-service';

const createMockDb = () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
});

const createMockAudit = () => ({
  log: jest.fn().mockResolvedValue(undefined),
});

const MOCK_INVOICE = {
  id: 'inv-1',
  matter_id: 'matter-1',
  invoice_number: 'ABC-2026-001',
  status: 'draft',
  subtotal_usd: '1000.00',
  tax_rate: '0.00',
  tax_amount_usd: '0.00',
  total_usd: '1000.00',
  amount_paid_usd: '0.00',
  issue_date: new Date('2026-01-15'),
  due_date: new Date('2026-02-14'),
  created_at: new Date(),
  updated_at: new Date(),
  matter_name: 'Test Matter',
  client_name: 'Test Client',
};

describe('MatterInvoiceService', () => {
  let service: MatterInvoiceService;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockAudit: ReturnType<typeof createMockAudit>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    mockAudit = createMockAudit();
    service = new MatterInvoiceService(mockDb as any, mockAudit as any);
  });

  describe('createInvoice', () => {
    it('should create draft invoice with auto-generated number', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ invoice_number: 'MAT-2026-001' }] }) // generate_invoice_number
        .mockResolvedValueOnce({ rows: [MOCK_INVOICE], rowCount: 1 }); // INSERT

      const result = await service.createInvoice({
        matter_id: 'matter-1',
        created_by: 'user-1',
      });

      expect(result).toBeDefined();
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'invoice.create' })
      );
    });

    it('should use custom due_days', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ invoice_number: 'MAT-2026-002' }] })
        .mockResolvedValueOnce({ rows: [MOCK_INVOICE], rowCount: 1 });

      await service.createInvoice({
        matter_id: 'matter-1',
        created_by: 'user-1',
        due_days: 60,
      });

      expect(mockDb.query).toHaveBeenCalled();
    });
  });

  describe('generateFromTimeEntries', () => {
    it('should create invoice from approved time entries', async () => {
      // createInvoice mocks
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ invoice_number: 'MAT-2026-003' }] })
        .mockResolvedValueOnce({ rows: [MOCK_INVOICE], rowCount: 1 })
        // fetchTimeEntries
        .mockResolvedValueOnce({
          rows: [{
            id: 'te-1',
            description: 'Research',
            duration_minutes: 120,
            hourly_rate_usd: 100,
          }],
          rowCount: 1,
        })
        // insert line item
        .mockResolvedValueOnce({ rows: [{ id: 'li-1' }], rowCount: 1 })
        // update time entry status
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        // getInvoiceWithDetails
        .mockResolvedValueOnce({ rows: [MOCK_INVOICE], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // line items
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // payments

      const result = await service.generateFromTimeEntries({
        matter_id: 'matter-1',
        time_entry_ids: ['te-1'],
        created_by: 'user-1',
      });

      expect(result).toBeDefined();
    });

    it('should throw when no approved unbilled entries found', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ invoice_number: 'MAT-2026-004' }] })
        .mockResolvedValueOnce({ rows: [MOCK_INVOICE], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // no time entries

      await expect(service.generateFromTimeEntries({
        matter_id: 'matter-1',
        time_entry_ids: ['te-nonexistent'],
        created_by: 'user-1',
      })).rejects.toThrow();
    });
  });

  describe('getInvoiceWithDetails', () => {
    it('should return invoice with line items and payments', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [MOCK_INVOICE], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ id: 'li-1', description: 'Work', amount_usd: '500' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.getInvoiceWithDetails('inv-1');

      expect(result.line_items).toHaveLength(1);
      expect(result.payments).toHaveLength(0);
    });

    it('should throw when invoice not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(service.getInvoiceWithDetails('nonexistent')).rejects.toThrow();
    });
  });

  describe('listInvoices', () => {
    it('should return paginated invoice list', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [MOCK_INVOICE], rowCount: 1 });

      const result = await service.listInvoices({ matter_id: 'matter-1' });

      expect(result.total).toBe(5);
      expect(result.invoices).toHaveLength(1);
    });

    it('should filter by status', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await service.listInvoices({ status: 'paid' });

      expect(mockDb.query.mock.calls[0][0]).toContain('status');
    });
  });

  describe('sendInvoice', () => {
    it('should send draft invoice', async () => {
      const sent = { ...MOCK_INVOICE, status: 'sent' };
      mockDb.query.mockResolvedValueOnce({ rows: [sent], rowCount: 1 });

      const result = await service.sendInvoice('inv-1', 'user-1');

      expect(result.status).toBe('sent');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'invoice.send' })
      );
    });

    it('should throw when invoice not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(service.sendInvoice('nonexistent', 'user-1')).rejects.toThrow();
    });
  });

  describe('recordPayment', () => {
    it('should record payment', async () => {
      const payment = {
        id: 'pay-1',
        invoice_id: 'inv-1',
        amount_usd: '500.00',
        payment_date: new Date(),
        recorded_by: 'user-1',
      };
      mockDb.query.mockResolvedValueOnce({ rows: [payment], rowCount: 1 });

      const result = await service.recordPayment({
        invoice_id: 'inv-1',
        amount_usd: 500,
        recorded_by: 'user-1',
      });

      expect(result.amount_usd).toBe('500.00');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'invoice.record_payment' })
      );
    });
  });

  describe('voidInvoice', () => {
    it('should void draft invoice and unlink time entries', async () => {
      const voided = { ...MOCK_INVOICE, status: 'void' };
      mockDb.query
        .mockResolvedValueOnce({ rows: [voided], rowCount: 1 }) // UPDATE invoice
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // unlink time entries

      const result = await service.voidInvoice('inv-1', 'user-1');

      expect(result.status).toBe('void');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'invoice.void' })
      );
    });

    it('should throw for paid invoice', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await expect(service.voidInvoice('inv-paid', 'user-1')).rejects.toThrow();
    });
  });

  describe('addLineItem', () => {
    it('should add line item with calculated amount', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ max: 2 }] }) // get max line_order
        .mockResolvedValueOnce({
          rows: [{
            id: 'li-new',
            invoice_id: 'inv-1',
            description: 'Additional work',
            quantity: 2,
            unit_price_usd: '150.00',
            amount_usd: '300.00',
            line_order: 3,
          }],
          rowCount: 1,
        });

      const result = await service.addLineItem({
        invoice_id: 'inv-1',
        description: 'Additional work',
        quantity: 2,
        unit_price_usd: 150,
        user_id: 'user-1',
      });

      expect(result.amount_usd).toBe('300.00');
    });
  });

  describe('generatePDF', () => {
    it('should return PDF buffer', async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [MOCK_INVOICE], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [] }) // line items
        .mockResolvedValueOnce({ rows: [] }); // payments

      const result = await service.generatePDF('inv-1');
      expect(Buffer.isBuffer(result)).toBe(true);
    });
  });
});

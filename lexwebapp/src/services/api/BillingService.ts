/**
 * Billing Service
 * Handles billing, payments, and transaction operations
 */

import { BaseService } from '../base/BaseService';
import { Balance, BillingBalance, BillingSettings } from '../../types/models';
import {
  UpdateBillingSettingsRequest,
  GetTransactionHistoryRequest,
  GetBalanceResponse,
  GetTransactionHistoryResponse,
} from '../../types/api';

export class BillingService extends BaseService {
  /**
   * Get account balance
   */
  async getBalance(): Promise<Balance> {
    return this.request(
      () => this.client.get<GetBalanceResponse>('/api/billing/balance'),
      (data) => data.balance
    );
  }

  /**
   * Get full billing summary from backend
   */
  async getBillingSummary(): Promise<BillingBalance> {
    return this.request(() => this.client.get<BillingBalance>('/api/billing/balance'));
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(
    params?: GetTransactionHistoryRequest
  ): Promise<GetTransactionHistoryResponse> {
    return this.request(() => this.client.get<GetTransactionHistoryResponse>(
      '/api/billing/history',
      { params }
    ));
  }

  /**
   * Update billing settings
   */
  async updateSettings(data: UpdateBillingSettingsRequest): Promise<BillingSettings> {
    return this.request(
      () => this.client.put<{ settings: BillingSettings }>('/api/billing/settings', data),
      (data) => data.settings
    );
  }

  /**
   * Create Monobank invoice
   */
  async createMonobankInvoice(amount_uah: number): Promise<{ invoiceId: string; pageUrl: string }> {
    return this.request(() => this.client.post<{ invoiceId: string; pageUrl: string }>(
      '/api/billing/payment/monobank/create',
      { amount_uah }
    ));
  }

  /**
   * Send test email
   */
  async sendTestEmail(): Promise<void> {
    return this.requestVoid(() => this.client.post('/api/billing/test-email'));
  }
}

// Export singleton instance
export const billingService = new BillingService();

// Proprietary implementation: @secondlayer/core (private repo)

export interface EmailPreferences {
  payment_receipts: boolean;
  low_balance_alerts: boolean;
  monthly_summary: boolean;
  promotional: boolean;
  email_notifications?: boolean;
  notify_low_balance?: boolean;
  notify_payment_success?: boolean;
  notify_payment_failure?: boolean;
  notify_monthly_report?: boolean;
  low_balance_threshold_usd: number;
}

export interface UserBilling {
  userId: string;
  tier: string;
  balanceUsd: number;
  balanceUah: number;
  billing_enabled: boolean;
  balance_usd: number;
}

export interface BalanceCheckResult {
  hasCredits: boolean;
  hasBalance: boolean;
  currentBalance: number;
  reason: string;
}

export interface TopUpInput {
  userId: string;
  amountUsd?: number;
  amountUah?: number;
  method?: string;
  externalId?: string;
  description?: string;
  source?: string;
  paymentProvider?: string;
  paymentId?: string;
  metadata?: Record<string, unknown>;
}

export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  type: string;
  createdAt: string;
  balance_after_usd: number;
}

export interface ChargeInput {
  userId: string;
  requestId: string;
  amountUsd: number;
  toolName?: string;
  description?: string;
}

export interface BillingSummary {
  balanceUsd: number;
  balanceUah: number;
  tier: string;
  totalSpent: number;
  balance_usd: number;
  balance_uah: number;
  total_spent_usd: number;
  total_requests: number;
  daily_limit_usd: number;
  monthly_limit_usd: number;
  today_spent_usd: number;
  month_spent_usd: number;
  last_request_at: string | null;
  is_active: boolean;
  pricing_tier: string;
}

export interface PricingTierInfo {
  tier: string;
  markup_percentage: number;
}

export interface PriceCalcResult {
  cost_usd: number;
  markup_percentage: number;
  markup_amount_usd: number;
  price_usd: number;
  tier: string;
}

export interface LimitsCheckResult {
  allowed: boolean;
  withinLimits: boolean;
  reason?: string;
  dailySpent?: number;
  dailyLimit?: number;
  monthlySpent?: number;
  monthlyLimit?: number;
}

export class BillingService {
  constructor(...args: any[]) {}

  async getOrCreateUserBilling(userId: string): Promise<UserBilling> {
    return { userId, tier: 'free', balanceUsd: 0, balanceUah: 0, billing_enabled: false, balance_usd: 0 };
  }

  async checkBalance(userId: string, estimatedCostUsd?: number): Promise<BalanceCheckResult> {
    return { hasCredits: false, hasBalance: false, currentBalance: 0, reason: 'stub' };
  }

  async chargeUser(input: ChargeInput): Promise<void> {}

  async topUpBalance(input: TopUpInput): Promise<Transaction> {
    return { id: '', userId: input.userId, amount: 0, type: 'top_up', createdAt: new Date().toISOString(), balance_after_usd: 0 };
  }

  async getBillingSummary(userId: string): Promise<BillingSummary> {
    return {
      balanceUsd: 0, balanceUah: 0, tier: 'free', totalSpent: 0,
      balance_usd: 0, balance_uah: 0, total_spent_usd: 0, total_requests: 0,
      daily_limit_usd: 50, monthly_limit_usd: 1000,
      today_spent_usd: 0, month_spent_usd: 0,
      last_request_at: null, is_active: false, pricing_tier: 'free',
    };
  }

  async getBillingInfo(userId: string): Promise<unknown> {
    return null;
  }

  async updateBillingInfo(userId: string, data: unknown): Promise<void> {}

  async getPaymentMethods(userId: string): Promise<unknown[]> {
    return [];
  }

  async removePaymentMethod(userId: string, methodId: string): Promise<void> {}

  async setPrimaryPaymentMethod(userId: string, methodId: string): Promise<void> {}

  async getUserPricingInfo(userId: string): Promise<any> {
    return { tier: 'free', markup_percentage: 0, balance_usd: 0, balance_uah: 0 };
  }

  getAllPricingTiers(): unknown[] {
    return [];
  }

  async getUserPricingTier(userId: string): Promise<PricingTierInfo> {
    return { tier: 'free', markup_percentage: 0 };
  }

  calculateEstimatedPrice(costUsd: number, tier: PricingTierInfo): PriceCalcResult {
    return { cost_usd: costUsd, markup_percentage: 0, markup_amount_usd: 0, price_usd: costUsd, tier: tier.tier };
  }

  async getTransactionHistory(userId: string, filters?: Record<string, unknown>): Promise<unknown[]> {
    return [];
  }

  async setTransactionInvoiceNumber(transactionId: string, invoiceNumber: string): Promise<void> {}

  async getEmailPreferences(userId: string): Promise<EmailPreferences> {
    return {
      payment_receipts: false, low_balance_alerts: false, monthly_summary: false, promotional: false,
      email_notifications: true, notify_low_balance: true, notify_payment_success: true,
      notify_payment_failure: false, notify_monthly_report: true, low_balance_threshold_usd: 20,
    };
  }

  async updateBillingSettings(userId: string, settings: unknown): Promise<void> {}

  async getDailyRequestCount(userId: string): Promise<number> {
    return 0;
  }

  async checkLimits(userId: string, estimatedCostUsd: number): Promise<LimitsCheckResult> {
    return { allowed: true, withinLimits: true };
  }

  async convertFromUah(amountUah: number): Promise<number> {
    return 0;
  }

  setCurrencyService(service: any): void {}

  setReferralRewardCallback(callback: (...args: any[]) => Promise<void>): void {}

  setAuditService(service: any): void {}

  async savePaymentMethod(userId: string, method: any): Promise<void> {}
}

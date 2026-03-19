/**
 * Billing Domain Models
 */

export interface Balance {
  amount_usd: number;
  currency: 'USD' | 'UAH';
  lastUpdated: string;
}

export interface BillingBalance {
  user_id: string;
  balance_usd: number;
  balance_uah: number;
  total_spent_usd: number;
  total_requests: number;
  daily_limit_usd: number;
  monthly_limit_usd: number;
  pricing_tier: string;
  today_spending_usd: number;
  monthly_spending_usd: number;
  last_request_at?: string;
}

export interface Transaction {
  id: string;
  type: 'deposit' | 'withdrawal' | 'usage';
  amount: number;
  currency: 'USD' | 'UAH';
  description: string;
  timestamp: string;
  status: 'pending' | 'completed' | 'failed';
}

export interface BillingSettings {
  daily_limit_usd?: number;
  monthly_limit_usd?: number;
  email_notifications?: boolean;
  low_balance_alert?: number;
}

export interface PaymentIntent {
  id: string;
  amount: number;
  currency: 'USD' | 'UAH';
  status: 'pending' | 'succeeded' | 'failed';
  provider: 'monobank' | 'metamask' | 'binance_pay';
  createdAt: string;
}

// B2B Invoicing for legal entities
export interface B2BInvoice {
  id: string;
  invoice_number: string;
  organization_id: string;
  requested_by: string;
  invoice_type: 'subscription' | 'topup';
  status: 'draft' | 'issued' | 'sent' | 'paid' | 'cancelled' | 'overdue';
  tier_key: string | null;
  billing_cycle: string | null;
  amount_uah: number;
  vat_uah: number;
  total_uah: number;
  amount_usd: number | null;
  buyer_name: string;
  buyer_edrpou: string;
  buyer_address: string | null;
  buyer_email: string | null;
  issue_date: string;
  due_date: string;
  paid_at: string | null;
  cancelled_at: string | null;
  confirmed_by: string | null;
  payment_reference: string | null;
  notes: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  organization_name?: string;
  requested_by_name?: string;
  tier_name?: string;
}

export interface CreateB2BInvoiceRequest {
  invoice_type: 'subscription' | 'topup';
  tier_key?: string;
  billing_cycle?: 'monthly' | 'quarterly' | 'annual';
  amount_uah?: number;
  notes?: string;
}

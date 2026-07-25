/**
 * Types for Admin Billing Management
 */

export interface BillingTier {
  id: string;
  tier_key: string;
  display_name: string;
  markup_percentage: number;
  description: string;
  features: string[];
  default_daily_limit_usd: number;
  default_monthly_limit_usd: number;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface VolumeDiscount {
  id: string;
  min_monthly_spend_usd: number;
  discount_percentage: number;
}

export interface Organization {
  id: string;
  name: string;
  plan: string;
  max_members: number;
  billing_tier_key: string | null;
  billing_email: string | null;
  balance_usd: number;
  total_spent_usd: number;
  member_count: number;
  owner_email: string;
  owner_name: string;
  created_at: string;
}

export interface Subscription {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  tier_key: string;
  status: string;
  billing_cycle: string;
  price_usd: number;
  trial_ends_at: string | null;
  next_billing_date: string | null;
  canceled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  user_email?: string;
  user_name?: string;
  org_name?: string;
  tier_display_name?: string;
}

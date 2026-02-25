export interface CostBreakdown {
  period: { from: string; to: string; days: number };
  totals: {
    openai_cost_usd: number;
    anthropic_cost_usd: number;
    zakononline_cost_usd: number;
    secondlayer_cost_usd: number;
    voyage_cost_usd: number;
    total_cost_usd: number;
    total_requests: number;
  };
  by_provider: Array<{
    provider: string;
    cost_usd: number;
    requests?: number;
    tokens?: number;
    calls?: number;
  }>;
  by_model: Array<{
    provider: string;
    model: string;
    cost_usd: number;
    tokens: number;
    requests: number;
  }>;
  daily: Array<{
    date: string;
    openai: number;
    anthropic: number;
    zakononline: number;
    secondlayer: number;
    voyage: number;
  }>;
}

export interface ToolUsage {
  tool_name: string;
  request_count: number;
  total_revenue_usd: number;
  avg_cost_usd: number;
}

export interface Transaction {
  id: string;
  user_id: string;
  user_email?: string;
  type: string;
  status: string;
  amount_usd: number;
  description?: string;
  created_at: string;
}

export interface Cohort {
  month: string;
  users: number;
  active_users: number;
  total_revenue_usd: number;
  retention_rate: number;
}

export interface Pagination {
  limit: number;
  offset: number;
  total: number;
}

export interface UserCostSummary {
  id: string;
  email: string;
  name: string | null;
  pricing_tier: string;
  request_count: number;
  total_cost_usd: number;
  openai_cost_usd: number;
  anthropic_cost_usd: number;
  zakononline_cost_usd: number;
  voyage_cost_usd: number;
  secondlayer_cost_usd: number;
  last_request_at: string | null;
}

export interface UserRequest {
  id: string;
  request_id: string;
  tool_name: string;
  user_query: string | null;
  openai_cost_usd: number;
  anthropic_cost_usd: number;
  zakononline_cost_usd: number;
  secondlayer_cost_usd: number;
  voyage_cost_usd: number;
  total_cost_usd: number;
  base_cost_usd: number;
  markup_amount_usd: number;
  markup_percentage: number;
  client_tier: string | null;
  execution_time_ms: number | null;
  status: string;
  openai_total_tokens: number | null;
  zakononline_api_calls: number | null;
  created_at: string;
  completed_at: string | null;
}

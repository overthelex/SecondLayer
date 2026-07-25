export const PAGE_SIZE = 20;
export const USER_REQ_PAGE = 25;

export const COLORS = {
  blue: '#60a5fa',
  emerald: '#34d399',
  amber: '#fbbf24',
  red: '#f87171',
  purple: '#a78bfa',
  indigo: '#818cf8',
  cyan: '#22d3ee',
  pink: '#f472b6',
};

export const PROVIDER_COLORS: Record<string, string> = {
  OpenAI: COLORS.emerald,
  Anthropic: COLORS.purple,
  VoyageAI: COLORS.cyan,
  ZakonOnline: COLORS.amber,
  'SecondLayer API': COLORS.blue,
};

export const TIER_COLORS: Record<string, string> = {
  free: '#9ca3af',
  startup: '#60a5fa',
  business: '#a78bfa',
  enterprise: '#f59e0b',
  attorney: '#f97316',
  internal: '#34d399',
};

export const PIE_COLORS = [COLORS.emerald, COLORS.purple, COLORS.amber, COLORS.blue, COLORS.red, COLORS.indigo];

export const tooltipStyle = {
  contentStyle: {
    backgroundColor: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '12px',
    padding: '8px 12px',
  },
  labelStyle: { fontSize: '11px', color: '#6b7280' },
};

/**
 * AdminCostsPage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock recharts to avoid rendering issues in tests
vi.mock('recharts', () => {
  const MockResponsiveContainer = ({ children }: any) => <div>{children}</div>;
  const MockAreaChart = ({ children }: any) => <div>{children}</div>;
  const MockPieChart = ({ children }: any) => <div>{children}</div>;
  const noop = () => null;
  return {
    ResponsiveContainer: MockResponsiveContainer,
    AreaChart: MockAreaChart,
    Area: noop,
    PieChart: MockPieChart,
    Pie: noop,
    Cell: noop,
    XAxis: noop,
    YAxis: noop,
    Tooltip: noop,
    Legend: noop,
  };
});

// Mock window.prompt
const mockPrompt = vi.fn();
window.prompt = mockPrompt;

// Mock api-client
const mockGetUsageAnalytics = vi.fn();
const mockGetTransactions = vi.fn();
const mockGetCohorts = vi.fn();
const mockRefundTransaction = vi.fn();
const mockGetCostBreakdown = vi.fn();
const mockGetUsersCostsSummary = vi.fn();

vi.mock('../../utils/api-client', () => ({
  default: {},
  api: {
    admin: {
      getUsageAnalytics: (days: number) => mockGetUsageAnalytics(days),
      getTransactions: (params?: any) => mockGetTransactions(params),
      getCohorts: () => mockGetCohorts(),
      refundTransaction: (id: string, reason: string) => mockRefundTransaction(id, reason),
      getCostBreakdown: (days: number) => mockGetCostBreakdown(days),
      getUsersCostsSummary: (days: number) => mockGetUsersCostsSummary(days),
    },
  },
}));

import { AdminCostsPage } from '../AdminCostsPage';

const mockUsage = [
  { tool_name: 'search_court_cases', request_count: 500, total_revenue_usd: 25.0, avg_cost_usd: 0.05 },
  { tool_name: 'get_legal_advice', request_count: 300, total_revenue_usd: 45.0, avg_cost_usd: 0.15 },
];

const mockCostData = {
  period: { from: '2026-01-26', to: '2026-02-25', days: 30 },
  totals: {
    openai_cost_usd: 50,
    anthropic_cost_usd: 10,
    zakononline_cost_usd: 5,
    secondlayer_cost_usd: 3,
    voyage_cost_usd: 2,
    total_cost_usd: 70,
    total_requests: 800,
  },
  by_provider: [
    { provider: 'openai', cost_usd: 50, requests: 600 },
    { provider: 'anthropic', cost_usd: 10, requests: 200 },
  ],
  by_model: [
    { provider: 'openai', model: 'gpt-4o', cost_usd: 40, tokens: 500000, requests: 400 },
  ],
  daily: [],
};

const mockTransactionsData = {
  transactions: [
    {
      id: 'tx-1',
      user_id: 'u1',
      user_email: 'alice@example.com',
      type: 'charge',
      status: 'completed',
      amount_usd: 0.05,
      created_at: '2026-02-15T10:00:00Z',
    },
    {
      id: 'tx-2',
      user_id: 'u2',
      user_email: 'bob@example.com',
      type: 'topup',
      status: 'completed',
      amount_usd: 50.0,
      created_at: '2026-02-14T10:00:00Z',
    },
    {
      id: 'tx-3',
      user_id: 'u3',
      user_email: 'carol@example.com',
      type: 'charge',
      status: 'failed',
      amount_usd: 0.01,
      created_at: '2026-02-13T10:00:00Z',
    },
  ],
  pagination: { limit: 20, offset: 0, total: 3 },
};

const mockCohortsData = [
  { month: '2026-01', users: 30, active_users: 25, total_revenue_usd: 1200.0, retention_rate: 83 },
  { month: '2026-02', users: 20, active_users: 18, total_revenue_usd: 900.0, retention_rate: 90 },
];

/** Set up all mocks to return successful defaults */
function mockAllSuccess() {
  mockGetCostBreakdown.mockResolvedValue({ data: mockCostData });
  mockGetUsageAnalytics.mockResolvedValue({ data: { usage: mockUsage } });
  mockGetTransactions.mockResolvedValue({ data: mockTransactionsData });
  mockGetCohorts.mockResolvedValue({ data: { cohorts: mockCohortsData } });
  mockGetUsersCostsSummary.mockResolvedValue({ data: { users: [] } });
}

describe('AdminCostsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders header and loads all sections', async () => {
    mockAllSuccess();

    render(<AdminCostsPage />);

    await waitFor(() => {
      expect(screen.getByText('Cost Breakdown')).toBeInTheDocument();
    });

    expect(screen.getByText('Tool Usage')).toBeInTheDocument();
    expect(screen.getByText('Transactions')).toBeInTheDocument();
    expect(screen.getByText('Cohort Analysis')).toBeInTheDocument();
  });

  it('displays total requests in header', async () => {
    mockAllSuccess();

    render(<AdminCostsPage />);

    await waitFor(() => {
      expect(screen.getByText(/800 requests/)).toBeInTheDocument();
    });
  });

  it('renders tool usage table with data', async () => {
    mockAllSuccess();

    render(<AdminCostsPage />);

    await waitFor(() => {
      expect(screen.getByText('search_court_cases')).toBeInTheDocument();
    });

    expect(screen.getByText('get_legal_advice')).toBeInTheDocument();
    expect(screen.getByText('$25.00')).toBeInTheDocument();
    expect(screen.getByText('$45.00')).toBeInTheDocument();
  });

  it('shows "No usage data" when usage is empty', async () => {
    mockAllSuccess();
    mockGetUsageAnalytics.mockResolvedValue({ data: { usage: [] } });

    render(<AdminCostsPage />);

    await waitFor(() => {
      expect(screen.getByText('No usage data')).toBeInTheDocument();
    });
  });

  it('changing cost days button refetches data', async () => {
    mockAllSuccess();

    render(<AdminCostsPage />);

    await waitFor(() => {
      expect(screen.getByText('search_court_cases')).toBeInTheDocument();
    });

    // Days selector is now button-based: 7d, 30d, 90d
    const btn7d = screen.getByText('7d');
    fireEvent.click(btn7d);

    await waitFor(() => {
      expect(mockGetCostBreakdown).toHaveBeenCalledWith(7);
      expect(mockGetUsageAnalytics).toHaveBeenCalledWith(7);
    });
  });

  it('renders transactions table', async () => {
    mockAllSuccess();

    render(<AdminCostsPage />);

    await waitFor(() => {
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    });

    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
    expect(screen.getByText('carol@example.com')).toBeInTheDocument();
  });

  it('shows refund button only for completed charges', async () => {
    mockAllSuccess();

    render(<AdminCostsPage />);

    await waitFor(() => {
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    });

    // Only tx-1 (completed charge) should have refund button
    const refundButtons = screen.getAllByRole('button', { name: 'Refund' });
    expect(refundButtons).toHaveLength(1);
  });

  it('calls refundTransaction on refund button click', async () => {
    const toast = await import('react-hot-toast');
    mockAllSuccess();
    mockRefundTransaction.mockResolvedValue({});
    mockPrompt.mockReturnValue('Customer complaint');

    render(<AdminCostsPage />);

    await waitFor(() => {
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Refund' }));

    await waitFor(() => {
      expect(mockRefundTransaction).toHaveBeenCalledWith('tx-1', 'Customer complaint');
      expect(toast.default.success).toHaveBeenCalledWith('Transaction refunded');
    });
  });

  it('does not refund when prompt is cancelled', async () => {
    mockAllSuccess();
    mockPrompt.mockReturnValue(null);

    render(<AdminCostsPage />);

    await waitFor(() => {
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Refund' }));
    expect(mockRefundTransaction).not.toHaveBeenCalled();
  });

  it('transaction type filter triggers re-fetch', async () => {
    mockAllSuccess();

    render(<AdminCostsPage />);

    await waitFor(() => {
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    });

    const typeSelect = screen.getByDisplayValue('All Types');
    await userEvent.selectOptions(typeSelect, 'charge');

    await waitFor(() => {
      expect(mockGetTransactions).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'charge' })
      );
    });
  });

  it('transaction status filter triggers re-fetch', async () => {
    mockAllSuccess();

    render(<AdminCostsPage />);

    await waitFor(() => {
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    });

    const statusSelect = screen.getByDisplayValue('All Statuses');
    await userEvent.selectOptions(statusSelect, 'completed');

    await waitFor(() => {
      expect(mockGetTransactions).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'completed' })
      );
    });
  });

  it('renders cohort analysis table', async () => {
    mockAllSuccess();

    render(<AdminCostsPage />);

    await waitFor(() => {
      expect(screen.getByText('$1200.00')).toBeInTheDocument();
    });

    expect(screen.getByText('$900.00')).toBeInTheDocument();
    // Retention percentages may appear in both text and bar style, so use getAllByText
    expect(screen.getAllByText('83%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('90%').length).toBeGreaterThan(0);
  });

  it('shows "No cohort data" when cohorts are empty', async () => {
    mockAllSuccess();
    mockGetCohorts.mockResolvedValue({ data: { cohorts: [] } });

    render(<AdminCostsPage />);

    await waitFor(() => {
      expect(screen.getByText('No cohort data')).toBeInTheDocument();
    });
  });

  it('shows error state when all APIs fail', async () => {
    mockGetCostBreakdown.mockRejectedValue({ message: 'Connection refused' });
    mockGetUsageAnalytics.mockRejectedValue({ message: 'Connection refused' });
    mockGetTransactions.mockRejectedValue({ message: 'Connection refused' });
    mockGetCohorts.mockRejectedValue(new Error('fail'));
    mockGetUsersCostsSummary.mockRejectedValue(new Error('fail'));

    render(<AdminCostsPage />);

    await waitFor(() => {
      expect(screen.getByText('Connection refused')).toBeInTheDocument();
    });

    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('shows "No transactions found" when transactions are empty', async () => {
    mockAllSuccess();
    mockGetTransactions.mockResolvedValue({
      data: { transactions: [], pagination: { limit: 20, offset: 0, total: 0 } },
    });

    render(<AdminCostsPage />);

    await waitFor(() => {
      expect(screen.getByText('No transactions found')).toBeInTheDocument();
    });
  });
});

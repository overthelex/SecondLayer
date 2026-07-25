/**
 * AdminOverviewPage Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// Mock recharts to avoid rendering issues in tests
vi.mock('recharts', () => {
  const MockResponsiveContainer = ({ children }: any) => <div>{children}</div>;
  const MockAreaChart = ({ children }: any) => <div>{children}</div>;
  const MockLineChart = ({ children }: any) => <div>{children}</div>;
  const MockComposedChart = ({ children }: any) => <div>{children}</div>;
  const MockPieChart = ({ children }: any) => <div>{children}</div>;
  const noop = () => null;
  return {
    ResponsiveContainer: MockResponsiveContainer,
    AreaChart: MockAreaChart,
    Area: noop,
    LineChart: MockLineChart,
    Line: noop,
    ComposedChart: MockComposedChart,
    Bar: noop,
    PieChart: MockPieChart,
    Pie: noop,
    Cell: noop,
    XAxis: noop,
    YAxis: noop,
    Tooltip: noop,
    Legend: noop,
  };
});

// Mock api-client
const mockGetOverview = vi.fn();
const mockGetRevenueChart = vi.fn();
const mockGetTierDistribution = vi.fn();
const mockGetTrafficMetrics = vi.fn();
const mockGetLatencyMetrics = vi.fn();
const mockGetServicesHealth = vi.fn();
const mockGetSystemMetrics = vi.fn();
const mockGetUsageAnalytics = vi.fn();

vi.mock('../../utils/api-client', () => ({
  default: {},
  api: {
    admin: {
      getOverview: () => mockGetOverview(),
      getRevenueChart: (days?: number) => mockGetRevenueChart(days),
      getTierDistribution: () => mockGetTierDistribution(),
      getTrafficMetrics: (range?: string) => mockGetTrafficMetrics(range),
      getLatencyMetrics: (range?: string) => mockGetLatencyMetrics(range),
      getServicesHealth: () => mockGetServicesHealth(),
      getSystemMetrics: () => mockGetSystemMetrics(),
      getUsageAnalytics: (days?: number) => mockGetUsageAnalytics(days),
    },
  },
}));

import { AdminOverviewPage } from '../AdminOverviewPage';

const mockOverview = {
  today: { revenue_usd: 125.5, profit_usd: 80.25, requests: 342 },
  month: { revenue_usd: 3200.0, profit_usd: 2100.0, requests: 8500 },
  users: { total: 150, active: 45, low_balance: 3 },
  alerts: { failed_requests_today: 7 },
};

const mockChart = [
  { date: '2026-01-15', revenue_usd: 100, cost_usd: 30, profit_usd: 70, requests: 200 },
  { date: '2026-01-16', revenue_usd: 150, cost_usd: 50, profit_usd: 100, requests: 300 },
];

const mockTiers = [
  { tier: 'free', user_count: 80, total_balance_usd: 0 },
  { tier: 'basic', user_count: 50, total_balance_usd: 250 },
  { tier: 'professional', user_count: 20, total_balance_usd: 1500 },
];

/** Set up all mocks to return successful defaults */
function mockAllSuccess() {
  mockGetOverview.mockResolvedValue({ data: mockOverview });
  mockGetRevenueChart.mockResolvedValue({ data: { data: mockChart } });
  mockGetTierDistribution.mockResolvedValue({ data: { tiers: mockTiers } });
  mockGetTrafficMetrics.mockResolvedValue({ data: null });
  mockGetLatencyMetrics.mockResolvedValue({ data: null });
  mockGetServicesHealth.mockResolvedValue({ data: { services: [] } });
  mockGetSystemMetrics.mockResolvedValue({ data: null });
  mockGetUsageAnalytics.mockResolvedValue({ data: { usage: [] } });
}

/** Set up all mocks to reject */
function mockAllFail(error: any) {
  mockGetOverview.mockRejectedValue(error);
  mockGetRevenueChart.mockRejectedValue(error);
  mockGetTierDistribution.mockRejectedValue(error);
  mockGetTrafficMetrics.mockRejectedValue(error);
  mockGetLatencyMetrics.mockRejectedValue(error);
  mockGetServicesHealth.mockRejectedValue(error);
  mockGetSystemMetrics.mockRejectedValue(error);
  mockGetUsageAnalytics.mockRejectedValue(error);
}

describe('AdminOverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner initially', () => {
    mockGetOverview.mockReturnValue(new Promise(() => {}));
    mockGetRevenueChart.mockReturnValue(new Promise(() => {}));
    mockGetTierDistribution.mockReturnValue(new Promise(() => {}));
    mockGetTrafficMetrics.mockReturnValue(new Promise(() => {}));
    mockGetLatencyMetrics.mockReturnValue(new Promise(() => {}));
    mockGetServicesHealth.mockReturnValue(new Promise(() => {}));
    mockGetSystemMetrics.mockReturnValue(new Promise(() => {}));
    mockGetUsageAnalytics.mockReturnValue(new Promise(() => {}));

    render(<AdminOverviewPage />);
    expect(screen.getByText('Loading overview...')).toBeInTheDocument();
  });

  it('renders KPI cards after data loads', async () => {
    mockAllSuccess();

    render(<AdminOverviewPage />);

    await waitFor(() => {
      expect(screen.getByText('System Overview')).toBeInTheDocument();
    });

    expect(screen.getByText('Revenue Today')).toBeInTheDocument();
    expect(screen.getByText('Revenue This Month')).toBeInTheDocument();
    expect(screen.getByText('Requests Today')).toBeInTheDocument();
    expect(screen.getByText('Active Users (30d)')).toBeInTheDocument();
  });

  it('renders tier distribution section', async () => {
    mockAllSuccess();

    render(<AdminOverviewPage />);

    await waitFor(() => {
      expect(screen.getByText('Tier Distribution')).toBeInTheDocument();
    });

    expect(screen.getByText('free')).toBeInTheDocument();
    expect(screen.getByText('basic')).toBeInTheDocument();
    expect(screen.getByText('professional')).toBeInTheDocument();
  });

  it('shows "No revenue data available" when chart is empty', async () => {
    mockAllSuccess();
    mockGetRevenueChart.mockResolvedValue({ data: { data: [] } });

    render(<AdminOverviewPage />);

    await waitFor(() => {
      expect(screen.getByText('No revenue data available')).toBeInTheDocument();
    });
  });

  it('shows "No tier data" when tiers are empty', async () => {
    mockAllSuccess();
    mockGetTierDistribution.mockResolvedValue({ data: { tiers: [] } });

    render(<AdminOverviewPage />);

    await waitFor(() => {
      expect(screen.getByText('No tier data')).toBeInTheDocument();
    });
  });

  it('shows error state with retry button on API failure', async () => {
    mockAllFail({ message: 'Network error' });

    render(<AdminOverviewPage />);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('retries fetching on retry button click', async () => {
    mockAllFail({ message: 'Fail' });

    render(<AdminOverviewPage />);

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    mockAllSuccess();

    fireEvent.click(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('System Overview')).toBeInTheDocument();
    });
  });

  it('refresh button re-fetches data', async () => {
    mockAllSuccess();

    render(<AdminOverviewPage />);

    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Refresh'));

    expect(mockGetOverview).toHaveBeenCalledTimes(2);
    expect(mockGetRevenueChart).toHaveBeenCalledTimes(2);
    expect(mockGetTierDistribution).toHaveBeenCalledTimes(2);
  });

  it('handles null values in overview data gracefully', async () => {
    const partialOverview = {
      today: { revenue_usd: null, profit_usd: null, requests: null },
      month: { revenue_usd: null, profit_usd: null, requests: null },
      users: { total: null, active: null, low_balance: null },
      alerts: { failed_requests_today: null },
    };

    mockAllSuccess();
    mockGetOverview.mockResolvedValue({ data: partialOverview });
    mockGetRevenueChart.mockResolvedValue({ data: { data: [] } });
    mockGetTierDistribution.mockResolvedValue({ data: { tiers: [] } });

    render(<AdminOverviewPage />);

    await waitFor(() => {
      expect(screen.getByText('System Overview')).toBeInTheDocument();
    });

    expect(screen.getAllByText('$0.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  });

  it('shows server error message from response data', async () => {
    mockAllFail({
      response: { data: { error: 'Unauthorized access' } },
    });

    render(<AdminOverviewPage />);

    await waitFor(() => {
      expect(screen.getByText('Unauthorized access')).toBeInTheDocument();
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock consultation service
const mockListConsultations = vi.fn();
vi.mock('../../services/api/ConsultationService', () => ({
  consultationService: {
    listConsultations: (...args: any[]) => mockListConsultations(...args),
  },
}));

// Mock routes
vi.mock('../../router/routes', () => ({
  ROUTES: { CONSULTATIONS: '/consultations' },
  generateRoute: {
    consultationDetail: (id: string) => `/consultations/${id}`,
  },
}));

// Mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { ConsultationsPage } from '../ConsultationsPage';

const makeConsultation = (overrides: any = {}) => ({
  id: 'cons-1',
  client_user_id: 'client-1',
  attorney_user_id: 'attorney-1',
  consultation_type: 'consultation',
  status: 'pending',
  request_title: 'Тестова консультація',
  urgency: 'normal',
  client_name: 'Клієнт Тест',
  attorney_name: 'Адвокат Тест',
  created_at: '2026-03-20T10:00:00Z',
  updated_at: '2026-03-20T10:00:00Z',
  ...overrides,
});

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ConsultationsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ConsultationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListConsultations.mockResolvedValue({ consultations: [], total: 0 });
  });

  it('shows loading spinner initially', () => {
    mockListConsultations.mockReturnValue(new Promise(() => {}));
    renderWithProviders();
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows empty state when no consultations', async () => {
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText('Консультацій поки немає')).toBeInTheDocument();
    });
  });

  it('renders consultation list', async () => {
    mockListConsultations.mockResolvedValue({
      consultations: [
        makeConsultation({ id: 'c1', request_title: 'Перша' }),
        makeConsultation({ id: 'c2', request_title: 'Друга', status: 'completed' }),
      ],
      total: 2,
    });
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText('Перша')).toBeInTheDocument();
      expect(screen.getByText('Друга')).toBeInTheDocument();
    });
    expect(screen.getByText('Всього: 2')).toBeInTheDocument();
  });

  it('shows correct status badges', async () => {
    mockListConsultations.mockResolvedValue({
      consultations: [
        makeConsultation({ status: 'pending' }),
      ],
      total: 1,
    });
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText('Очікує')).toBeInTheDocument();
    });
  });

  it('navigates to detail on card click', async () => {
    const user = userEvent.setup();
    mockListConsultations.mockResolvedValue({
      consultations: [makeConsultation()],
      total: 1,
    });
    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText('Тестова консультація')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Тестова консультація'));
    expect(mockNavigate).toHaveBeenCalledWith('/consultations/cons-1');
  });

  describe('Filters', () => {
    it('renders role and status filters', async () => {
      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByText('Всі ролі')).toBeInTheDocument();
        expect(screen.getByText('Всі статуси')).toBeInTheDocument();
      });
    });

    it('refetches when role filter changes', async () => {
      const user = userEvent.setup();
      renderWithProviders();

      await waitFor(() => {
        expect(mockListConsultations).toHaveBeenCalledTimes(1);
      });

      const roleSelect = screen.getByDisplayValue('Всі ролі');
      await user.selectOptions(roleSelect, 'client');

      await waitFor(() => {
        expect(mockListConsultations).toHaveBeenCalledWith(
          expect.objectContaining({ role: 'client' })
        );
      });
    });
  });

  describe('Real-time invalidation', () => {
    it('listens for consultation-updated events', async () => {
      renderWithProviders();

      await waitFor(() => {
        expect(mockListConsultations).toHaveBeenCalledTimes(1);
      });

      // Update the mock to return new data
      mockListConsultations.mockResolvedValue({
        consultations: [makeConsultation({ request_title: 'Оновлена' })],
        total: 1,
      });

      // Dispatch the event that SSE would fire
      window.dispatchEvent(new CustomEvent('consultation-updated'));

      await waitFor(() => {
        expect(mockListConsultations).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Layout', () => {
    it('consultation cards don\'t overlap', async () => {
      mockListConsultations.mockResolvedValue({
        consultations: [
          makeConsultation({ id: 'c1', request_title: 'Перша' }),
          makeConsultation({ id: 'c2', request_title: 'Друга' }),
        ],
        total: 2,
      });
      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByText('Перша')).toBeInTheDocument();
      });

      // Cards should be in a space-y-3 container
      const card1 = screen.getByText('Перша').closest('.border');
      const container = card1?.parentElement;
      expect(container?.className).toContain('space-y-3');
    });

    it('status badge and fee don\'t overlap title', async () => {
      mockListConsultations.mockResolvedValue({
        consultations: [makeConsultation({ agreed_fee_uah: 5000 })],
        total: 1,
      });
      renderWithProviders();

      await waitFor(() => {
        expect(screen.getByText('5000 грн')).toBeInTheDocument();
      });

      // Title container should have min-w-0 and flex-1 to truncate, badge has shrink-0
      const title = screen.getByText('Тестова консультація');
      expect(title.closest('.min-w-0')?.className).toContain('flex-1');
    });
  });
});

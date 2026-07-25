/**
 * Consultation Escrow UI Tests
 *
 * Tests cover:
 * - PaymentStep: free auto-complete, paid flow, confirm and create, back navigation
 * - EscrowStatusBadge: all escrow statuses rendering, fee breakdown, polling
 * - PaymentSuccessPage: consultation context, billing fallback
 * - PaymentErrorPage: consultation retry link, generic error
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PaymentStep } from '../components/consultation/PaymentStep';
import { EscrowStatusBadge } from '../components/consultation/EscrowStatusBadge';
import { PaymentSuccessPage } from '../pages/PaymentSuccessPage';
import { PaymentErrorPage } from '../pages/PaymentErrorPage';

// ──────────────────────────────────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────────────────────────────────

const mockGetPaymentStatus = vi.fn();
vi.mock('../services/api/ConsultationService', () => ({
  consultationService: {
    getPaymentStatus: (...args: any[]) => mockGetPaymentStatus(...args),
  },
}));

// ──────────────────────────────────────────────────────────────────────────
// PaymentStep
// ──────────────────────────────────────────────────────────────────────────

describe('PaymentStep', () => {
  const defaultProps = {
    attorneyName: 'Іван Петренко',
    serviceType: 'consultation',
    onPaymentComplete: vi.fn(),
    onBack: vi.fn(),
    submitting: false,
    error: '',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('auto-completes for free consultations', () => {
    render(<PaymentStep {...defaultProps} consultationFee={0} />);
    expect(defaultProps.onPaymentComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Безкоштовно/)).toBeInTheDocument();
  });

  it('auto-completes when fee is undefined', () => {
    render(<PaymentStep {...defaultProps} consultationFee={undefined} />);
    expect(defaultProps.onPaymentComplete).toHaveBeenCalledTimes(1);
  });

  it('shows order summary for paid consultations', () => {
    render(<PaymentStep {...defaultProps} consultationFee={1500} />);
    expect(screen.getByText('Іван Петренко')).toBeInTheDocument();
    expect(screen.getByText('Консультація')).toBeInTheDocument();
    expect(screen.getByText('1500 грн')).toBeInTheDocument();
    expect(defaultProps.onPaymentComplete).not.toHaveBeenCalled();
  });

  it('shows escrow explanation text', () => {
    render(<PaymentStep {...defaultProps} consultationFee={1000} />);
    expect(screen.getByText(/безпечну оплату через Monobank/)).toBeInTheDocument();
    expect(screen.getByText(/заморожені \(escrow\)/)).toBeInTheDocument();
  });

  it('calls onPaymentComplete when confirm button is clicked', () => {
    render(<PaymentStep {...defaultProps} consultationFee={1000} />);
    const button = screen.getByText('Підтвердити та створити запит');
    fireEvent.click(button);
    expect(defaultProps.onPaymentComplete).toHaveBeenCalledTimes(1);
  });

  it('calls onBack when back button is clicked', () => {
    render(<PaymentStep {...defaultProps} consultationFee={1000} />);
    const button = screen.getByText('Назад');
    fireEvent.click(button);
    expect(defaultProps.onBack).toHaveBeenCalledTimes(1);
  });

  it('shows loading state when submitting', () => {
    render(<PaymentStep {...defaultProps} consultationFee={1000} submitting={true} />);
    expect(screen.getByText(/Створюємо запит/)).toBeInTheDocument();
  });

  it('shows error message when error prop is set', () => {
    render(<PaymentStep {...defaultProps} consultationFee={1000} error="Сервер недоступний" />);
    expect(screen.getByText('Сервер недоступний')).toBeInTheDocument();
  });

  it('renders correct label for representation service type', () => {
    render(<PaymentStep {...defaultProps} consultationFee={500} serviceType="representation" />);
    expect(screen.getByText('Представництво в суді')).toBeInTheDocument();
  });

  it('renders correct label for document_review service type', () => {
    render(<PaymentStep {...defaultProps} consultationFee={500} serviceType="document_review" />);
    expect(screen.getByText('Аналіз документів')).toBeInTheDocument();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// EscrowStatusBadge
// ──────────────────────────────────────────────────────────────────────────

describe('EscrowStatusBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makePayment = (status: string) => ({
    id: 'pay-001',
    consultation_id: 'consult-001',
    amount_uah: 1000,
    platform_fee_uah: 100,
    attorney_payout_uah: 900,
    status,
    payment_provider: 'monobank',
    created_at: '2026-03-18T10:00:00Z',
  });

  // Use completed/cancelled statuses to avoid polling (terminal states don't start polling)
  it('renders "held" status with fee breakdown', async () => {
    mockGetPaymentStatus.mockResolvedValue(makePayment('held'));

    render(<EscrowStatusBadge consultationId="consult-001" consultationStatus="in_progress" />);

    await waitFor(() => {
      expect(screen.getByText('Кошти заморожено (Escrow)')).toBeInTheDocument();
    });
    expect(screen.getAllByText(/1000 грн/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/100 грн/)).toBeInTheDocument();
    expect(screen.getByText(/900 грн/)).toBeInTheDocument();
    expect(screen.getByText(/Захищено системою Escrow/)).toBeInTheDocument();
  });

  it('renders "released" status', async () => {
    mockGetPaymentStatus.mockResolvedValue(makePayment('released'));

    render(<EscrowStatusBadge consultationId="consult-001" consultationStatus="completed" />);

    await waitFor(() => {
      expect(screen.getByText('Кошти передано адвокату')).toBeInTheDocument();
    });
    expect(screen.getByText(/Транзакцію завершено/)).toBeInTheDocument();
  });

  it('renders "refunded" status', async () => {
    mockGetPaymentStatus.mockResolvedValue(makePayment('refunded'));

    render(<EscrowStatusBadge consultationId="consult-001" consultationStatus="cancelled" />);

    await waitFor(() => {
      expect(screen.getByText('Кошти повернено')).toBeInTheDocument();
    });
    expect(screen.getByText(/Кошти повернено на картку/)).toBeInTheDocument();
  });

  it('renders "processing" status', async () => {
    mockGetPaymentStatus.mockResolvedValue(makePayment('processing'));

    render(<EscrowStatusBadge consultationId="consult-001" consultationStatus="in_progress" />);

    await waitFor(() => {
      expect(screen.getByText('Обробка платежу')).toBeInTheDocument();
    });
  });

  it('renders "pending" status', async () => {
    mockGetPaymentStatus.mockResolvedValue(makePayment('pending'));

    render(<EscrowStatusBadge consultationId="consult-001" consultationStatus="in_progress" />);

    await waitFor(() => {
      expect(screen.getByText('Очікує оплати')).toBeInTheDocument();
    });
  });

  it('renders nothing when no payment exists', async () => {
    mockGetPaymentStatus.mockRejectedValue(new Error('Not found'));

    const { container } = render(
      <EscrowStatusBadge consultationId="consult-001" consultationStatus="completed" />
    );

    // Wait for the fetch to resolve and component to re-render
    await waitFor(() => {
      expect(mockGetPaymentStatus).toHaveBeenCalled();
    });

    // After loading, should render nothing (null)
    await waitFor(() => {
      expect(container.querySelector('[class*="rounded-lg"]')).toBeNull();
    });
  });

  it('calls onPaymentConfirmed when payment is held and consultation is accepted', async () => {
    const onConfirmed = vi.fn();
    mockGetPaymentStatus.mockResolvedValue(makePayment('held'));

    render(
      <EscrowStatusBadge
        consultationId="consult-001"
        consultationStatus="accepted"
        onPaymentConfirmed={onConfirmed}
      />
    );

    await waitFor(() => {
      expect(onConfirmed).toHaveBeenCalledTimes(1);
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────
// PaymentSuccessPage
// ──────────────────────────────────────────────────────────────────────────

describe('PaymentSuccessPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('shows consultation link when consultationId is stored', () => {
    sessionStorage.setItem('lastConsultationId', 'consult-123');

    render(
      <MemoryRouter initialEntries={['/payment/success?order_id=SL-abc-123&amount=100000&currency=UAH']}>
        <Routes>
          <Route path="/payment/success" element={<PaymentSuccessPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Оплата успішна')).toBeInTheDocument();
    expect(screen.getByText(/заморожено в системі Escrow/)).toBeInTheDocument();
    expect(screen.getByText('Перейти до консультації')).toBeInTheDocument();
    expect(screen.getByText(/Escrow \(консультація\)/)).toBeInTheDocument();
  });

  it('shows billing link when no consultationId', () => {
    render(
      <MemoryRouter initialEntries={['/payment/success?order_id=SL-abc-123']}>
        <Routes>
          <Route path="/payment/success" element={<PaymentSuccessPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Оплата успішна')).toBeInTheDocument();
    expect(screen.getByText(/Баланс буде оновлено/)).toBeInTheDocument();
    expect(screen.getByText('Перейти до білінгу')).toBeInTheDocument();
  });

  it('displays order amount converted from kopecks', () => {
    render(
      <MemoryRouter initialEntries={['/payment/success?order_id=test&amount=150050&currency=UAH']}>
        <Routes>
          <Route path="/payment/success" element={<PaymentSuccessPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('₴1500.50')).toBeInTheDocument();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// PaymentErrorPage
// ──────────────────────────────────────────────────────────────────────────

describe('PaymentErrorPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('shows consultation retry link when consultationId is stored', () => {
    sessionStorage.setItem('lastConsultationId', 'consult-456');

    render(
      <MemoryRouter initialEntries={['/payment/error?order_id=SL-abc-123']}>
        <Routes>
          <Route path="/payment/error" element={<PaymentErrorPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Оплата не вдалася')).toBeInTheDocument();
    expect(screen.getByText(/платіж за консультацію/)).toBeInTheDocument();
    expect(screen.getByText('Повернутися до консультації')).toBeInTheDocument();
  });

  it('shows generic retry when no consultationId', () => {
    render(
      <MemoryRouter initialEntries={['/payment/error?order_id=SL-abc-123']}>
        <Routes>
          <Route path="/payment/error" element={<PaymentErrorPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Оплата не вдалася')).toBeInTheDocument();
    expect(screen.getByText('Спробувати ще раз')).toBeInTheDocument();
  });

  it('displays error reason from query params', () => {
    render(
      <MemoryRouter initialEntries={['/payment/error?order_id=test&response_description=Insufficient%20funds']}>
        <Routes>
          <Route path="/payment/error" element={<PaymentErrorPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Insufficient funds')).toBeInTheDocument();
  });
});

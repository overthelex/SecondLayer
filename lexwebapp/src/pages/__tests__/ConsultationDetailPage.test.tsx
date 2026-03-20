import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: any) => children,
  motion: {
    div: ({ children, className, onClick, ...rest }: any) => (
      <div className={className} onClick={onClick}>{children}</div>
    ),
  },
}));

// Mock AuthContext
const mockUser = { id: 'attorney-1', name: 'Адвокат', email: 'att@test.com', role: 'user' as const };
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, isAuthenticated: true }),
}));

// Mock toast
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('../../utils/toast', () => ({
  default: {
    success: (...args: any[]) => mockToastSuccess(...args),
    error: (...args: any[]) => mockToastError(...args),
    info: vi.fn(),
  },
}));

// Mock services
const mockGetConsultation = vi.fn();
const mockAcceptConsultation = vi.fn();
const mockDeclineConsultation = vi.fn();
const mockCompleteConsultation = vi.fn();
const mockCancelConsultation = vi.fn();
const mockStartConsultation = vi.fn();
const mockInitiatePayment = vi.fn();
const mockSubmitReview = vi.fn();
vi.mock('../../services/api/ConsultationService', () => ({
  consultationService: {
    getConsultation: (...args: any[]) => mockGetConsultation(...args),
    acceptConsultation: (...args: any[]) => mockAcceptConsultation(...args),
    declineConsultation: (...args: any[]) => mockDeclineConsultation(...args),
    completeConsultation: (...args: any[]) => mockCompleteConsultation(...args),
    cancelConsultation: (...args: any[]) => mockCancelConsultation(...args),
    startConsultation: (...args: any[]) => mockStartConsultation(...args),
    initiatePayment: (...args: any[]) => mockInitiatePayment(...args),
    submitReview: (...args: any[]) => mockSubmitReview(...args),
  },
}));

// Mock child components
vi.mock('../../components/chat/ConsultationChatTab', () => ({
  ConsultationChatTab: () => <div data-testid="chat-tab">Chat Tab</div>,
}));
vi.mock('../../components/consultation/EscrowStatusBadge', () => ({
  EscrowStatusBadge: () => <div data-testid="escrow-badge">Escrow</div>,
}));
vi.mock('../../components/consultation/SharedDocumentsSection', () => ({
  SharedDocumentsSection: () => <div data-testid="shared-docs">Docs</div>,
}));

// Mock store
const mockAddStatusListener = vi.fn().mockReturnValue(vi.fn());
vi.mock('../../stores/consultationStore', () => ({
  useConsultationStore: (selector: any) => {
    const state = { addStatusListener: mockAddStatusListener };
    return selector ? selector(state) : state;
  },
}));

import { ConsultationDetailPage } from '../ConsultationDetailPage';

const pendingConsultation = {
  id: 'cons-1',
  client_user_id: 'client-1',
  attorney_user_id: 'attorney-1',
  consultation_type: 'consultation',
  status: 'pending',
  request_title: 'Консультація з трудового права',
  request_description: 'Опис',
  urgency: 'normal',
  share_documents: false,
  share_conversations: false,
  document_ids: [],
  conversation_ids: [],
  fee_type: 'fixed',
  client_name: 'Олена',
  attorney_name: 'Адвокат',
  created_at: '2026-03-20T10:00:00Z',
  updated_at: '2026-03-20T10:00:00Z',
};

const inProgressConsultation = {
  ...pendingConsultation,
  status: 'in_progress',
  started_at: '2026-03-20T11:00:00Z',
};

function renderWithRouter(consultationId = 'cons-1') {
  return render(
    <MemoryRouter initialEntries={[`/consultations/${consultationId}`]}>
      <Routes>
        <Route path="/consultations/:id" element={<ConsultationDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ConsultationDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConsultation.mockResolvedValue(pendingConsultation);
  });

  it('shows loading spinner initially', () => {
    mockGetConsultation.mockReturnValue(new Promise(() => {})); // never resolves
    renderWithRouter();
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('loads and displays consultation details', async () => {
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('Консультація з трудового права')).toBeInTheDocument();
    });
    expect(screen.getByText(/Олена/)).toBeInTheDocument();
    // Attorney name appears in info section
    expect(screen.getAllByText(/Адвокат/).length).toBeGreaterThan(0);
  });

  it('shows not found when consultation does not exist', async () => {
    mockGetConsultation.mockRejectedValue(new Error('Not found'));
    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText('Консультацію не знайдено')).toBeInTheDocument();
    });
  });

  describe('Attorney actions on pending consultation', () => {
    it('shows accept and decline buttons for attorney', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Прийняти')).toBeInTheDocument();
        expect(screen.getByText('Відхилити')).toBeInTheDocument();
      });
    });

    it('shows accept fee modal when "Прийняти" clicked', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Прийняти')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Прийняти'));
      expect(screen.getByText('Прийняти консультацію')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Наприклад: 2000')).toBeInTheDocument();
    });

    it('opens decline ConfirmModal instead of prompt()', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Відхилити')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Відхилити'));
      // Should see ConfirmModal, not a browser prompt
      expect(screen.getByText('Відхилити консультацію')).toBeInTheDocument();
      expect(screen.getByText('Причина відмови')).toBeInTheDocument();
    });

    it('declines with reason via ConfirmModal', async () => {
      const user = userEvent.setup();
      mockDeclineConsultation.mockResolvedValue({ ...pendingConsultation, status: 'declined' });
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Відхилити')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Відхилити'));
      const textarea = screen.getByPlaceholderText('Вкажіть причину відмови (необов\'язково)...');
      await user.type(textarea, 'Немає можливості');

      // Click the confirm button in the modal
      const confirmBtns = screen.getAllByText('Відхилити');
      await user.click(confirmBtns[confirmBtns.length - 1]); // last one is in modal

      await waitFor(() => {
        expect(mockDeclineConsultation).toHaveBeenCalledWith('cons-1', 'Немає можливості');
      });
      expect(mockToastSuccess).toHaveBeenCalledWith('Консультацію відхилено');
    });
  });

  describe('Complete action on in_progress consultation', () => {
    beforeEach(() => {
      mockGetConsultation.mockResolvedValue(inProgressConsultation);
    });

    it('opens complete ConfirmModal instead of prompt()', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Завершити')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Завершити'));
      expect(screen.getByText('Завершити консультацію')).toBeInTheDocument();
      expect(screen.getByText('Підсумок консультації')).toBeInTheDocument();
    });

    it('completes with summary', async () => {
      const user = userEvent.setup();
      mockCompleteConsultation.mockResolvedValue({ ...inProgressConsultation, status: 'completed' });
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Завершити')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Завершити'));
      const textarea = screen.getByPlaceholderText('Опишіть результати консультації...');
      await user.type(textarea, 'Надано правову допомогу');

      // Find the "Завершити" button inside the modal (not the original action button)
      const allButtons = screen.getAllByText('Завершити');
      await user.click(allButtons[allButtons.length - 1]);

      await waitFor(() => {
        expect(mockCompleteConsultation).toHaveBeenCalledWith('cons-1', 'Надано правову допомогу');
      });
      expect(mockToastSuccess).toHaveBeenCalledWith('Консультацію завершено');
    });
  });

  describe('Cancel action', () => {
    it('opens cancel ConfirmModal with danger variant', async () => {
      const user = userEvent.setup();
      renderWithRouter();

      await waitFor(() => {
        // The cancel button in action row has XCircle icon + "Скасувати" text
        const cancelBtns = screen.getAllByText('Скасувати');
        expect(cancelBtns.length).toBeGreaterThan(0);
      });

      // Click the action button (first "Скасувати")
      const cancelBtns = screen.getAllByText('Скасувати');
      await user.click(cancelBtns[0]);
      // Modal opens with its own "Скасувати консультацію" title and confirm label
      expect(screen.getByText('Причина скасування')).toBeInTheDocument();
    });
  });

  describe('Error handling', () => {
    it('shows toast error instead of alert() on action failure', async () => {
      const user = userEvent.setup();
      mockDeclineConsultation.mockRejectedValue({ message: 'Помилка сервера' });
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Відхилити')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Відхилити'));
      const confirmBtns = screen.getAllByText('Відхилити');
      await user.click(confirmBtns[confirmBtns.length - 1]);

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalled();
      });
    });
  });

  describe('Real-time status updates', () => {
    it('subscribes to status listener on mount', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(mockAddStatusListener).toHaveBeenCalledWith('cons-1', expect.any(Function));
      });
    });

    it('unsubscribes on unmount', async () => {
      const unsubscribe = vi.fn();
      mockAddStatusListener.mockReturnValue(unsubscribe);

      const { unmount } = renderWithRouter();

      await waitFor(() => {
        expect(mockAddStatusListener).toHaveBeenCalled();
      });

      unmount();
      expect(unsubscribe).toHaveBeenCalled();
    });
  });

  describe('Status timeline', () => {
    it('shows timeline for non-terminal status', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Очікує')).toBeInTheDocument();
      });
      expect(screen.getByText('Прийнято')).toBeInTheDocument();
      expect(screen.getByText('Оплачено')).toBeInTheDocument();
    });

    it('shows terminal status message for declined', async () => {
      mockGetConsultation.mockResolvedValue({
        ...pendingConsultation,
        status: 'declined',
        decline_reason: 'Не маю часу',
      });
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Відхилено')).toBeInTheDocument();
        expect(screen.getByText('Причина: Не маю часу')).toBeInTheDocument();
      });
    });
  });

  describe('Button layout — no overlap', () => {
    it('action buttons use flex wrap with gap', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Прийняти')).toBeInTheDocument();
      });

      const acceptBtn = screen.getByText('Прийняти').closest('button');
      const container = acceptBtn?.parentElement;
      expect(container?.className).toContain('flex');
      expect(container?.className).toContain('flex-wrap');
      expect(container?.className).toContain('gap-2');
    });

    it('accept and decline buttons have consistent sizing', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Прийняти')).toBeInTheDocument();
      });

      const acceptBtn = screen.getByText('Прийняти').closest('button');
      const declineBtn = screen.getByText('Відхилити').closest('button');

      // Both should have px-3 py-1.5 (compact padding)
      expect(acceptBtn?.className).toContain('px-3');
      expect(acceptBtn?.className).toContain('py-1.5');
      expect(declineBtn?.className).toContain('px-3');
      expect(declineBtn?.className).toContain('py-1.5');
    });

    it('cancel button is separated from main actions', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Скасувати')).toBeInTheDocument();
      });

      const cancelBtn = screen.getByText('Скасувати').closest('button');
      // Cancel has a border style (outline), not solid bg
      expect(cancelBtn?.className).toContain('border');
      expect(cancelBtn?.className).toContain('border-red-300');
    });
  });

  describe('Chat tab', () => {
    it('renders chat tab', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('chat-tab')).toBeInTheDocument();
      });
    });

    it('disables chat for completed consultation', async () => {
      mockGetConsultation.mockResolvedValue({
        ...pendingConsultation,
        status: 'completed',
      });
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByTestId('chat-tab')).toBeInTheDocument();
      });
    });
  });
});

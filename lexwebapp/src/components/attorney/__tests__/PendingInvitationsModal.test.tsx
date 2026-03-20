import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: any) => children,
  motion: {
    div: ({ children, className, onClick }: any) => (
      <div className={className} onClick={onClick}>{children}</div>
    ),
  },
}));

// Mock toast
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('../../../utils/toast', () => ({
  default: {
    success: (...args: any[]) => mockToastSuccess(...args),
    error: (...args: any[]) => mockToastError(...args),
    info: vi.fn(),
  },
}));

// Mock consultation service
const mockAcceptConsultation = vi.fn();
const mockDeclineConsultation = vi.fn();
vi.mock('../../../services/api/ConsultationService', () => ({
  consultationService: {
    acceptConsultation: (...args: any[]) => mockAcceptConsultation(...args),
    declineConsultation: (...args: any[]) => mockDeclineConsultation(...args),
  },
}));

// Mock consultation store
vi.mock('../../../stores/consultationStore', () => ({
  useConsultationStore: (selector: any) => {
    const state = { pendingConsultations: [] };
    return selector ? selector(state) : state;
  },
}));

import { PendingInvitationsModal } from '../PendingInvitationsModal';
import type { Consultation } from '../../../services/api/ConsultationService';

const makeConsultation = (overrides: Partial<Consultation> = {}): Consultation => ({
  id: 'cons-1',
  client_user_id: 'client-1',
  attorney_user_id: 'attorney-1',
  consultation_type: 'consultation',
  status: 'pending',
  request_title: 'Потрібна консультація з трудового права',
  request_description: 'Опис проблеми',
  urgency: 'normal',
  share_documents: false,
  share_conversations: false,
  document_ids: [],
  conversation_ids: [],
  fee_type: 'fixed',
  client_name: 'Олена Тестова',
  attorney_name: 'Адвокат Петренко',
  created_at: '2026-03-20T10:00:00Z',
  updated_at: '2026-03-20T10:00:00Z',
  ...overrides,
});

describe('PendingInvitationsModal', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockAcceptConsultation.mockResolvedValue({});
    mockDeclineConsultation.mockResolvedValue({});
  });

  it('renders nothing when no consultations', () => {
    render(
      <PendingInvitationsModal open={true} consultations={[]} onClose={mockOnClose} />
    );
    // Should auto-close
    expect(mockOnClose).toHaveBeenCalledWith([]);
  });

  it('renders consultation cards', () => {
    const consultations = [makeConsultation()];
    render(
      <PendingInvitationsModal open={true} consultations={consultations} onClose={mockOnClose} />
    );

    expect(screen.getByText('Нові запити')).toBeInTheDocument();
    expect(screen.getByText('Потрібна консультація з трудового права')).toBeInTheDocument();
    expect(screen.getByText('Олена Тестова')).toBeInTheDocument();
    expect(screen.getByText('Консультація')).toBeInTheDocument();
  });

  it('shows correct count text for 1 item', () => {
    render(
      <PendingInvitationsModal open={true} consultations={[makeConsultation()]} onClose={mockOnClose} />
    );
    expect(screen.getByText('1 новий запит')).toBeInTheDocument();
  });

  it('shows correct count text for 3 items', () => {
    const items = [
      makeConsultation({ id: 'c1' }),
      makeConsultation({ id: 'c2' }),
      makeConsultation({ id: 'c3' }),
    ];
    render(
      <PendingInvitationsModal open={true} consultations={items} onClose={mockOnClose} />
    );
    expect(screen.getByText('3 нових запити')).toBeInTheDocument();
  });

  it('shows urgency badge', () => {
    render(
      <PendingInvitationsModal
        open={true}
        consultations={[makeConsultation({ urgency: 'urgent' })]}
        onClose={mockOnClose}
      />
    );
    expect(screen.getByText('Термінова')).toBeInTheDocument();
  });

  describe('Accept flow with fee', () => {
    it('shows fee input when "Прийняти" clicked', async () => {
      const user = userEvent.setup();
      render(
        <PendingInvitationsModal
          open={true}
          consultations={[makeConsultation()]}
          onClose={mockOnClose}
        />
      );

      await user.click(screen.getByText('Прийняти'));
      expect(screen.getByPlaceholderText('Наприклад: 2000')).toBeInTheDocument();
      expect(screen.getByText('Сума гонорару (грн)')).toBeInTheDocument();
    });

    it('disables confirm button when no fee entered', async () => {
      const user = userEvent.setup();
      render(
        <PendingInvitationsModal
          open={true}
          consultations={[makeConsultation()]}
          onClose={mockOnClose}
        />
      );

      await user.click(screen.getByText('Прийняти'));
      // Confirm button should be disabled when fee is empty
      const confirmBtn = screen.getByText(/Прийняти за/).closest('button');
      expect(confirmBtn).toBeDisabled();
      expect(mockAcceptConsultation).not.toHaveBeenCalled();
    });

    it('accepts with fee when valid amount entered', async () => {
      const user = userEvent.setup();
      render(
        <PendingInvitationsModal
          open={true}
          consultations={[makeConsultation()]}
          onClose={mockOnClose}
        />
      );

      await user.click(screen.getByText('Прийняти'));
      const input = screen.getByPlaceholderText('Наприклад: 2000');
      await user.type(input, '3000');
      await user.click(screen.getByText('Прийняти за 3000 грн'));

      await waitFor(() => {
        expect(mockAcceptConsultation).toHaveBeenCalledWith('cons-1', 3000);
      });
      expect(mockToastSuccess).toHaveBeenCalledWith('Запит прийнято');
    });

    it('hides fee input when "Назад" clicked', async () => {
      const user = userEvent.setup();
      render(
        <PendingInvitationsModal
          open={true}
          consultations={[makeConsultation()]}
          onClose={mockOnClose}
        />
      );

      await user.click(screen.getByText('Прийняти'));
      expect(screen.getByPlaceholderText('Наприклад: 2000')).toBeInTheDocument();

      await user.click(screen.getByText('Назад'));
      expect(screen.queryByPlaceholderText('Наприклад: 2000')).not.toBeInTheDocument();
    });
  });

  describe('Decline flow with reason', () => {
    it('shows reason textarea when "Відхилити" clicked', async () => {
      const user = userEvent.setup();
      render(
        <PendingInvitationsModal
          open={true}
          consultations={[makeConsultation()]}
          onClose={mockOnClose}
        />
      );

      await user.click(screen.getByText('Відхилити'));
      expect(screen.getByPlaceholderText('Вкажіть причину...')).toBeInTheDocument();
      expect(screen.getByText('Причина відмови (необов\'язково)')).toBeInTheDocument();
    });

    it('declines with reason', async () => {
      const user = userEvent.setup();
      render(
        <PendingInvitationsModal
          open={true}
          consultations={[makeConsultation()]}
          onClose={mockOnClose}
        />
      );

      await user.click(screen.getByText('Відхилити'));
      const textarea = screen.getByPlaceholderText('Вкажіть причину...');
      await user.type(textarea, 'Зайнятий цього тижня');
      await user.click(screen.getByText('Підтвердити відхилення'));

      await waitFor(() => {
        expect(mockDeclineConsultation).toHaveBeenCalledWith('cons-1', 'Зайнятий цього тижня');
      });
      expect(mockToastSuccess).toHaveBeenCalledWith('Запит відхилено');
    });

    it('declines without reason (optional)', async () => {
      const user = userEvent.setup();
      render(
        <PendingInvitationsModal
          open={true}
          consultations={[makeConsultation()]}
          onClose={mockOnClose}
        />
      );

      await user.click(screen.getByText('Відхилити'));
      await user.click(screen.getByText('Підтвердити відхилення'));

      await waitFor(() => {
        expect(mockDeclineConsultation).toHaveBeenCalledWith('cons-1', undefined);
      });
    });
  });

  describe('Button layout', () => {
    it('accept and decline buttons are side by side with equal width', () => {
      render(
        <PendingInvitationsModal
          open={true}
          consultations={[makeConsultation()]}
          onClose={mockOnClose}
        />
      );

      const acceptBtn = screen.getByText('Прийняти').closest('button');
      const declineBtn = screen.getByText('Відхилити').closest('button');

      // Both should have flex-1 for equal widths
      expect(acceptBtn?.className).toContain('flex-1');
      expect(declineBtn?.className).toContain('flex-1');

      // They should be in the same flex container
      const container = acceptBtn?.parentElement;
      expect(container?.className).toContain('flex');
      expect(container?.className).toContain('gap-2');
    });

    it('fee input buttons don\'t overflow container', async () => {
      const user = userEvent.setup();
      render(
        <PendingInvitationsModal
          open={true}
          consultations={[makeConsultation()]}
          onClose={mockOnClose}
        />
      );

      await user.click(screen.getByText('Прийняти'));

      // Fee confirm and back buttons should be in flex container
      const confirmBtn = screen.getByText(/Прийняти за/).closest('button');

      expect(confirmBtn?.className).toContain('flex-1');
      const btnContainer = confirmBtn?.parentElement;
      expect(btnContainer?.className).toContain('flex');
      expect(btnContainer?.className).toContain('gap-2');
    });
  });

  describe('Close behavior', () => {
    it('passes remaining consultation IDs on close', async () => {
      const user = userEvent.setup();
      const items = [
        makeConsultation({ id: 'c1', request_title: 'Перший' }),
        makeConsultation({ id: 'c2', request_title: 'Другий' }),
      ];

      render(
        <PendingInvitationsModal open={true} consultations={items} onClose={mockOnClose} />
      );

      // Close via X button
      const closeButton = screen.getAllByRole('button').find(b =>
        b.querySelector('svg') && b.className.includes('text-gray-400')
      );
      if (closeButton) await user.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledWith(['c1', 'c2']);
    });
  });
});

/**
 * Tests for SupportWidget (LEXAI-869)
 * Floating Action Button with drop-up menu for authenticated users.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SupportWidget } from '../SupportWidget';

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: any) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
}));

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

// Thin modal stubs — just render children when isOpen=true
vi.mock('../FeedbackModal', () => ({
  FeedbackModal: ({ isOpen, onClose }: any) =>
    isOpen ? (
      <div data-testid="feedback-modal">
        <button onClick={onClose}>close-feedback</button>
      </div>
    ) : null,
}));

vi.mock('../QuestionModal', () => ({
  QuestionModal: ({ isOpen, onClose }: any) =>
    isOpen ? (
      <div data-testid="question-modal">
        <button onClick={onClose}>close-question</button>
      </div>
    ) : null,
}));

vi.mock('../ConsultationBookingModal', () => ({
  ConsultationBookingModal: ({ isOpen, onClose }: any) =>
    isOpen ? (
      <div data-testid="consultation-modal">
        <button onClick={onClose}>close-consultation</button>
      </div>
    ) : null,
}));

import { useAuth } from '../../../contexts/AuthContext';

// ── Helpers ────────────────────────────────────────────────────────────────

function renderAuthenticated() {
  vi.mocked(useAuth).mockReturnValue({ isAuthenticated: true, user: { id: 'u1' } } as any);
  return render(<SupportWidget />);
}

function renderUnauthenticated() {
  vi.mocked(useAuth).mockReturnValue({ isAuthenticated: false, user: null } as any);
  return render(<SupportWidget />);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SupportWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('visibility', () => {
    it('renders the FAB for authenticated users', () => {
      renderAuthenticated();
      expect(
        screen.getByRole('button', { name: /відкрити меню підтримки/i })
      ).toBeInTheDocument();
    });

    it('renders nothing for unauthenticated users', () => {
      renderUnauthenticated();
      expect(
        screen.queryByRole('button', { name: /відкрити меню підтримки/i })
      ).not.toBeInTheDocument();
    });
  });

  describe('FAB open / close', () => {
    it('opens the drop-up menu on FAB click', async () => {
      const user = userEvent.setup();
      renderAuthenticated();

      await user.click(screen.getByRole('button', { name: /відкрити меню підтримки/i }));

      expect(screen.getByRole('menu', { name: /опції підтримки/i })).toBeInTheDocument();
    });

    it('toggles aria-expanded on the FAB', async () => {
      const user = userEvent.setup();
      renderAuthenticated();

      const fab = screen.getByRole('button', { name: /відкрити меню підтримки/i });
      expect(fab).toHaveAttribute('aria-expanded', 'false');

      await user.click(fab);
      expect(screen.getByRole('button', { name: /закрити меню підтримки/i })).toHaveAttribute(
        'aria-expanded',
        'true'
      );
    });

    it('closes the menu when FAB is clicked again', async () => {
      const user = userEvent.setup();
      renderAuthenticated();

      const fab = screen.getByRole('button', { name: /відкрити меню підтримки/i });
      await user.click(fab);
      expect(screen.getByRole('menu')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /закрити меню підтримки/i }));
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('closes the menu on Escape key', async () => {
      const user = userEvent.setup();
      renderAuthenticated();

      await user.click(screen.getByRole('button', { name: /відкрити меню підтримки/i }));
      expect(screen.getByRole('menu')).toBeInTheDocument();

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('closes the menu on outside mousedown', async () => {
      renderAuthenticated();

      // Open menu first
      const fab = screen.getByRole('button', { name: /відкрити меню підтримки/i });
      await userEvent.setup().click(fab);
      expect(screen.getByRole('menu')).toBeInTheDocument();

      // Click outside the widget container
      fireEvent.mouseDown(document.body);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  describe('menu items', () => {
    it('renders all three menu items when open', async () => {
      const user = userEvent.setup();
      renderAuthenticated();

      await user.click(screen.getByRole('button', { name: /відкрити меню підтримки/i }));

      expect(screen.getByRole('menuitem', { name: /написати зауваження/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /написати питання/i })).toBeInTheDocument();
      expect(
        screen.getByRole('menuitem', { name: /записатись на консультацію/i })
      ).toBeInTheDocument();
    });

    it('opens FeedbackModal when "Написати зауваження" is clicked', async () => {
      const user = userEvent.setup();
      renderAuthenticated();

      await user.click(screen.getByRole('button', { name: /відкрити меню підтримки/i }));
      await user.click(screen.getByRole('menuitem', { name: /написати зауваження/i }));

      expect(screen.getByTestId('feedback-modal')).toBeInTheDocument();
    });

    it('closes the menu when a menu item is clicked', async () => {
      const user = userEvent.setup();
      renderAuthenticated();

      await user.click(screen.getByRole('button', { name: /відкрити меню підтримки/i }));
      await user.click(screen.getByRole('menuitem', { name: /написати зауваження/i }));

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });

    it('opens QuestionModal when "Написати питання" is clicked', async () => {
      const user = userEvent.setup();
      renderAuthenticated();

      await user.click(screen.getByRole('button', { name: /відкрити меню підтримки/i }));
      await user.click(screen.getByRole('menuitem', { name: /написати питання/i }));

      expect(screen.getByTestId('question-modal')).toBeInTheDocument();
    });

    it('opens ConsultationBookingModal when "Записатись на консультацію" is clicked', async () => {
      const user = userEvent.setup();
      renderAuthenticated();

      await user.click(screen.getByRole('button', { name: /відкрити меню підтримки/i }));
      await user.click(screen.getByRole('menuitem', { name: /записатись на консультацію/i }));

      expect(screen.getByTestId('consultation-modal')).toBeInTheDocument();
    });

    it('closes modal when modal onClose is called', async () => {
      const user = userEvent.setup();
      renderAuthenticated();

      await user.click(screen.getByRole('button', { name: /відкрити меню підтримки/i }));
      await user.click(screen.getByRole('menuitem', { name: /написати зауваження/i }));

      expect(screen.getByTestId('feedback-modal')).toBeInTheDocument();

      await user.click(screen.getByText('close-feedback'));
      expect(screen.queryByTestId('feedback-modal')).not.toBeInTheDocument();
    });

    it('only one modal is open at a time', async () => {
      const user = userEvent.setup();
      renderAuthenticated();

      // Open question modal
      await user.click(screen.getByRole('button', { name: /відкрити меню підтримки/i }));
      await user.click(screen.getByRole('menuitem', { name: /написати питання/i }));

      expect(screen.getByTestId('question-modal')).toBeInTheDocument();
      expect(screen.queryByTestId('feedback-modal')).not.toBeInTheDocument();
      expect(screen.queryByTestId('consultation-modal')).not.toBeInTheDocument();
    });
  });

  describe('Escape key does not fire when menu is closed', () => {
    it('does not error on Escape when menu is already closed', async () => {
      const user = userEvent.setup();
      renderAuthenticated();

      // Menu is not open — pressing Escape should be a no-op
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });
});

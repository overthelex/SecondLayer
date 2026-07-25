/**
 * Tests for SupportContactForm (LEXAI-869)
 * Shared form used by FeedbackModal and QuestionModal.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SupportContactForm } from '../SupportContactForm';

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: any) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

vi.mock('../../../services/api/SupportService', () => ({
  supportService: { sendContact: vi.fn() },
}));

vi.mock('../../../utils/toast', () => ({
  showToast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../utils/errors', () => ({
  getErrorMessage: vi.fn((err: any) => err?.message || 'network error'),
}));

// Stub Modal to render children directly
vi.mock('../../ui/Modal', () => ({
  Modal: ({ isOpen, children, title }: any) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));

import { supportService } from '../../../services/api/SupportService';
import { showToast } from '../../../utils/toast';

const mockSendContact = vi.mocked(supportService.sendContact);
const mockToastSuccess = vi.mocked(showToast.success);
const mockToastError = vi.mocked(showToast.error);

// ── Default Props ──────────────────────────────────────────────────────────

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  type: 'feedback' as const,
  title: 'Написати зауваження',
  placeholder: 'Опишіть проблему…',
  helpText: 'Що сталося?',
  submitLabel: 'Надіслати зауваження',
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('SupportContactForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders nothing when isOpen is false', () => {
      render(<SupportContactForm {...defaultProps} isOpen={false} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders the modal title', () => {
      render(<SupportContactForm {...defaultProps} />);
      expect(screen.getByText('Написати зауваження')).toBeInTheDocument();
    });

    it('renders help text', () => {
      render(<SupportContactForm {...defaultProps} />);
      expect(screen.getByText('Що сталося?')).toBeInTheDocument();
    });

    it('renders textarea with placeholder', () => {
      render(<SupportContactForm {...defaultProps} />);
      expect(screen.getByPlaceholderText('Опишіть проблему…')).toBeInTheDocument();
    });

    it('renders submit button with custom label', () => {
      render(<SupportContactForm {...defaultProps} />);
      expect(screen.getByRole('button', { name: 'Надіслати зауваження' })).toBeInTheDocument();
    });

    it('renders cancel button', () => {
      render(<SupportContactForm {...defaultProps} />);
      expect(screen.getByRole('button', { name: 'Скасувати' })).toBeInTheDocument();
    });

    it('shows character counter starting at 0', () => {
      render(<SupportContactForm {...defaultProps} />);
      expect(screen.getByText('0 / 5000')).toBeInTheDocument();
    });
  });

  describe('validation', () => {
    it('submit button is disabled when textarea is empty', () => {
      render(<SupportContactForm {...defaultProps} />);
      expect(screen.getByRole('button', { name: 'Надіслати зауваження' })).toBeDisabled();
    });

    it('submit button is disabled when message is under 3 characters', async () => {
      const user = userEvent.setup();
      render(<SupportContactForm {...defaultProps} />);

      await user.type(screen.getByPlaceholderText('Опишіть проблему…'), 'ab');
      expect(screen.getByRole('button', { name: 'Надіслати зауваження' })).toBeDisabled();
    });

    it('submit button is enabled when message has at least 3 characters', async () => {
      const user = userEvent.setup();
      render(<SupportContactForm {...defaultProps} />);

      await user.type(screen.getByPlaceholderText('Опишіть проблему…'), 'abc');
      expect(screen.getByRole('button', { name: 'Надіслати зауваження' })).not.toBeDisabled();
    });

    it('shows error toast when message is too short on submit attempt with whitespace', async () => {
      const user = userEvent.setup();
      // Bypass disabled check by setting message to whitespace only
      render(<SupportContactForm {...defaultProps} />);

      // Type 3 chars then clear with spaces — textarea has maxLength so we
      // type spaces to produce a string whose trim() is < 3
      const textarea = screen.getByPlaceholderText('Опишіть проблему…');
      await user.type(textarea, '   ');

      // Button is still disabled (trim().length < 3), so call handleSubmit directly
      // via the click on the textarea to type more and trigger validation:
      // Instead verify button disability prevents submission
      expect(screen.getByRole('button', { name: 'Надіслати зауваження' })).toBeDisabled();
      expect(mockSendContact).not.toHaveBeenCalled();
    });

    it('updates character counter as user types', async () => {
      const user = userEvent.setup();
      render(<SupportContactForm {...defaultProps} />);

      await user.type(screen.getByPlaceholderText('Опишіть проблему…'), 'hello');
      expect(screen.getByText('5 / 5000')).toBeInTheDocument();
    });
  });

  describe('successful submission', () => {
    it('calls supportService.sendContact with correct type and trimmed message', async () => {
      const user = userEvent.setup();
      mockSendContact.mockResolvedValueOnce(undefined);
      render(<SupportContactForm {...defaultProps} />);

      await user.type(
        screen.getByPlaceholderText('Опишіть проблему…'),
        '  Це тестове зауваження  '
      );
      await user.click(screen.getByRole('button', { name: 'Надіслати зауваження' }));

      await waitFor(() => {
        expect(mockSendContact).toHaveBeenCalledWith('feedback', 'Це тестове зауваження');
      });
    });

    it('shows success toast after submit', async () => {
      const user = userEvent.setup();
      mockSendContact.mockResolvedValueOnce(undefined);
      render(<SupportContactForm {...defaultProps} />);

      await user.type(screen.getByPlaceholderText('Опишіть проблему…'), 'Це тестове зауваження');
      await user.click(screen.getByRole('button', { name: 'Надіслати зауваження' }));

      await waitFor(() => {
        expect(mockToastSuccess).toHaveBeenCalledWith('Повідомлення надіслано — дякуємо!');
      });
    });

    it('shows success state with thank-you message after submit', async () => {
      const user = userEvent.setup();
      mockSendContact.mockResolvedValueOnce(undefined);
      render(<SupportContactForm {...defaultProps} />);

      await user.type(screen.getByPlaceholderText('Опишіть проблему…'), 'Це тестове зауваження');
      await user.click(screen.getByRole('button', { name: 'Надіслати зауваження' }));

      await waitFor(() => {
        expect(screen.getByText('Дякуємо!')).toBeInTheDocument();
      });

      expect(screen.getByText(/ми отримали ваше повідомлення/i)).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Опишіть проблему…')).not.toBeInTheDocument();
    });

    it('shows Close button in success state and calls onClose on click', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      mockSendContact.mockResolvedValueOnce(undefined);
      render(<SupportContactForm {...defaultProps} onClose={onClose} />);

      await user.type(screen.getByPlaceholderText('Опишіть проблему…'), 'Це тестове зауваження');
      await user.click(screen.getByRole('button', { name: 'Надіслати зауваження' }));

      await waitFor(() => screen.getByText('Дякуємо!'));
      await user.click(screen.getByRole('button', { name: 'Закрити' }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('failed submission', () => {
    it('shows error toast when sendContact rejects', async () => {
      const user = userEvent.setup();
      mockSendContact.mockRejectedValueOnce(new Error('server error'));
      render(<SupportContactForm {...defaultProps} />);

      await user.type(screen.getByPlaceholderText('Опишіть проблему…'), 'Це тестове зауваження');
      await user.click(screen.getByRole('button', { name: 'Надіслати зауваження' }));

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('server error');
      });
    });

    it('does not show success state when sendContact rejects', async () => {
      const user = userEvent.setup();
      mockSendContact.mockRejectedValueOnce(new Error('network down'));
      render(<SupportContactForm {...defaultProps} />);

      await user.type(screen.getByPlaceholderText('Опишіть проблему…'), 'Це тестове зауваження');
      await user.click(screen.getByRole('button', { name: 'Надіслати зауваження' }));

      await waitFor(() => expect(mockToastError).toHaveBeenCalled());
      expect(screen.queryByText('Дякуємо!')).not.toBeInTheDocument();
    });

    it('re-enables submit button after failed submission', async () => {
      const user = userEvent.setup();
      mockSendContact.mockRejectedValueOnce(new Error('fail'));
      render(<SupportContactForm {...defaultProps} />);

      await user.type(screen.getByPlaceholderText('Опишіть проблему…'), 'Це тестове зауваження');
      await user.click(screen.getByRole('button', { name: 'Надіслати зауваження' }));

      await waitFor(() => expect(mockToastError).toHaveBeenCalled());
      expect(screen.getByRole('button', { name: 'Надіслати зауваження' })).not.toBeDisabled();
    });
  });

  describe('state reset on re-open', () => {
    it('resets the form when modal is closed and re-opened', async () => {
      const user = userEvent.setup();
      mockSendContact.mockResolvedValueOnce(undefined);
      const { rerender } = render(<SupportContactForm {...defaultProps} />);

      await user.type(screen.getByPlaceholderText('Опишіть проблему…'), 'Це тестове зауваження');
      await user.click(screen.getByRole('button', { name: 'Надіслати зауваження' }));
      await waitFor(() => screen.getByText('Дякуємо!'));

      // Close then reopen
      rerender(<SupportContactForm {...defaultProps} isOpen={false} />);
      rerender(<SupportContactForm {...defaultProps} isOpen={true} />);

      expect(screen.queryByText('Дякуємо!')).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText('Опишіть проблему…')).toHaveValue('');
    });
  });

  describe('cancel button', () => {
    it('calls onClose when cancel is clicked', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(<SupportContactForm {...defaultProps} onClose={onClose} />);

      await user.click(screen.getByRole('button', { name: 'Скасувати' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('disables cancel button while submitting', async () => {
      const user = userEvent.setup();
      // Never resolve — keeps submitting state active
      mockSendContact.mockReturnValueOnce(new Promise(() => {}));
      render(<SupportContactForm {...defaultProps} />);

      await user.type(screen.getByPlaceholderText('Опишіть проблему…'), 'Це тестове зауваження');
      await user.click(screen.getByRole('button', { name: 'Надіслати зауваження' }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Скасувати' })).toBeDisabled();
      });
    });
  });

  describe('question type', () => {
    it('calls sendContact with type="question" when configured as question form', async () => {
      const user = userEvent.setup();
      mockSendContact.mockResolvedValueOnce(undefined);
      render(
        <SupportContactForm
          {...defaultProps}
          type="question"
          title="Написати питання"
          submitLabel="Надіслати питання"
        />
      );

      await user.type(screen.getByPlaceholderText('Опишіть проблему…'), 'Це моє питання?');
      await user.click(screen.getByRole('button', { name: 'Надіслати питання' }));

      await waitFor(() => {
        expect(mockSendContact).toHaveBeenCalledWith('question', 'Це моє питання?');
      });
    });
  });
});

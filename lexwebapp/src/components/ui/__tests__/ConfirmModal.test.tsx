import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmModal } from '../ConfirmModal';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: any) => children,
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

describe('ConfirmModal', () => {
  const defaultProps = {
    isOpen: true,
    title: 'Підтвердження',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    render(<ConfirmModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByText('Підтвердження')).not.toBeInTheDocument();
  });

  it('renders title when open', () => {
    render(<ConfirmModal {...defaultProps} />);
    expect(screen.getByText('Підтвердження')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<ConfirmModal {...defaultProps} description="Ви впевнені?" />);
    expect(screen.getByText('Ви впевнені?')).toBeInTheDocument();
  });

  it('renders default button labels', () => {
    render(<ConfirmModal {...defaultProps} />);
    expect(screen.getByText('Підтвердити')).toBeInTheDocument();
    expect(screen.getByText('Скасувати')).toBeInTheDocument();
  });

  it('renders custom button labels', () => {
    render(
      <ConfirmModal
        {...defaultProps}
        confirmLabel="Так, видалити"
        cancelLabel="Ні, залишити"
      />
    );
    expect(screen.getByText('Так, видалити')).toBeInTheDocument();
    expect(screen.getByText('Ні, залишити')).toBeInTheDocument();
  });

  it('calls onConfirm without input value when no inputLabel', async () => {
    const user = userEvent.setup();
    render(<ConfirmModal {...defaultProps} />);

    await user.click(screen.getByText('Підтвердити'));
    expect(defaultProps.onConfirm).toHaveBeenCalledWith(undefined);
  });

  it('calls onCancel when cancel button clicked', async () => {
    const user = userEvent.setup();
    render(<ConfirmModal {...defaultProps} />);

    await user.click(screen.getByText('Скасувати'));
    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

  it('calls onCancel when X button clicked', async () => {
    const user = userEvent.setup();
    render(<ConfirmModal {...defaultProps} />);

    // X button is the one inside the header
    const closeButtons = screen.getAllByRole('button');
    // X button is the first one in the header
    await user.click(closeButtons[0]);
    expect(defaultProps.onCancel).toHaveBeenCalled();
  });

  describe('with textarea input', () => {
    it('renders textarea when inputLabel provided', () => {
      render(
        <ConfirmModal
          {...defaultProps}
          inputLabel="Причина"
          inputPlaceholder="Вкажіть причину..."
        />
      );
      expect(screen.getByText('Причина')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Вкажіть причину...')).toBeInTheDocument();
    });

    it('passes textarea value on confirm', async () => {
      const user = userEvent.setup();
      render(
        <ConfirmModal
          {...defaultProps}
          inputLabel="Причина"
          inputPlaceholder="Вкажіть причину..."
        />
      );

      const textarea = screen.getByPlaceholderText('Вкажіть причину...');
      await user.type(textarea, 'Немає часу');
      await user.click(screen.getByText('Підтвердити'));

      expect(defaultProps.onConfirm).toHaveBeenCalledWith('Немає часу');
    });

    it('passes empty string when textarea left empty', async () => {
      const user = userEvent.setup();
      render(
        <ConfirmModal
          {...defaultProps}
          inputLabel="Причина"
        />
      );

      await user.click(screen.getByText('Підтвердити'));
      expect(defaultProps.onConfirm).toHaveBeenCalledWith('');
    });
  });

  describe('danger variant', () => {
    it('applies danger styling to confirm button', () => {
      render(<ConfirmModal {...defaultProps} variant="danger" confirmLabel="Видалити" />);
      const confirmBtn = screen.getByText('Видалити');
      expect(confirmBtn.closest('button')?.className).toContain('bg-red-600');
    });
  });

  describe('loading state', () => {
    it('disables buttons when loading', () => {
      render(<ConfirmModal {...defaultProps} loading={true} />);
      const buttons = screen.getAllByRole('button');
      // Cancel and confirm buttons (skip X)
      const cancelBtn = screen.getByText('Скасувати').closest('button');
      const confirmBtn = screen.getByText('Підтвердити').closest('button');
      expect(cancelBtn).toBeDisabled();
      expect(confirmBtn).toBeDisabled();
    });
  });
});

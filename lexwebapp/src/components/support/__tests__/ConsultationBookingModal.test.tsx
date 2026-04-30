/**
 * Tests for ConsultationBookingModal (LEXAI-869)
 * Embeds the Calendary booking page inside an iframe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConsultationBookingModal } from '../ConsultationBookingModal';

// ── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: any) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

vi.mock('../../ui/Modal', () => ({
  Modal: ({ isOpen, children, title }: any) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));

const CALENDARY_URL = 'https://calendary.biz/b/legal-org-ua/30-min';

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ConsultationBookingModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('visibility', () => {
    it('renders nothing when isOpen is false', () => {
      render(<ConsultationBookingModal isOpen={false} onClose={onClose} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders the dialog when isOpen is true', () => {
      render(<ConsultationBookingModal isOpen={true} onClose={onClose} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('renders the modal title', () => {
      render(<ConsultationBookingModal isOpen={true} onClose={onClose} />);
      expect(screen.getByText('Записатись на консультацію')).toBeInTheDocument();
    });
  });

  describe('iframe', () => {
    it('renders the Calendary iframe', () => {
      render(<ConsultationBookingModal isOpen={true} onClose={onClose} />);
      const iframe = screen.getByTitle(/запис на консультацію/i);
      expect(iframe).toBeInTheDocument();
      expect(iframe.tagName).toBe('IFRAME');
    });

    it('sets the iframe src to the correct Calendary URL', () => {
      render(<ConsultationBookingModal isOpen={true} onClose={onClose} />);
      const iframe = screen.getByTitle(/запис на консультацію/i);
      expect(iframe).toHaveAttribute('src', CALENDARY_URL);
    });

    it('sets loading="lazy" on the iframe', () => {
      render(<ConsultationBookingModal isOpen={true} onClose={onClose} />);
      const iframe = screen.getByTitle(/запис на консультацію/i);
      expect(iframe).toHaveAttribute('loading', 'lazy');
    });
  });

  describe('fallback link', () => {
    it('renders the fallback link when iframe might not load', () => {
      render(<ConsultationBookingModal isOpen={true} onClose={onClose} />);
      const link = screen.getByRole('link', { name: /calendary\.biz/i });
      expect(link).toBeInTheDocument();
    });

    it('fallback link points to the correct Calendary URL', () => {
      render(<ConsultationBookingModal isOpen={true} onClose={onClose} />);
      const link = screen.getByRole('link', { name: /calendary\.biz/i });
      expect(link).toHaveAttribute('href', CALENDARY_URL);
    });

    it('fallback link opens in a new tab', () => {
      render(<ConsultationBookingModal isOpen={true} onClose={onClose} />);
      const link = screen.getByRole('link', { name: /calendary\.biz/i });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('renders the "if widget does not load" helper text', () => {
      render(<ConsultationBookingModal isOpen={true} onClose={onClose} />);
      expect(
        screen.getByText(/якщо віджет не завантажується/i)
      ).toBeInTheDocument();
    });
  });

  describe('description text', () => {
    it('renders the 30-minute consultation description', () => {
      render(<ConsultationBookingModal isOpen={true} onClose={onClose} />);
      expect(screen.getByText(/30-хвилинн/i)).toBeInTheDocument();
    });
  });
});

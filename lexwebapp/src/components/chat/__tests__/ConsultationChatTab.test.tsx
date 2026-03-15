import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// Mock AuthContext
const mockUser = { id: 'user-1', name: 'Test User', email: 'test@test.com', role: 'user' as const };
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, isAuthenticated: true, token: 'fake', isLoading: false }),
}));

// Mock consultation service
const mockGetMessages = vi.fn();
const mockSendMessage = vi.fn();
const mockConnectMessageStream = vi.fn();
const mockMarkMessagesRead = vi.fn();

vi.mock('../../../services', () => ({
  consultationService: {
    getMessages: (...args: any[]) => mockGetMessages(...args),
    sendMessage: (...args: any[]) => mockSendMessage(...args),
    connectMessageStream: (...args: any[]) => mockConnectMessageStream(...args),
    markMessagesRead: (...args: any[]) => mockMarkMessagesRead(...args),
  },
}));

import { ConsultationChatTab } from '../ConsultationChatTab';

// Mock EventSource
function createMockEventSource() {
  const listeners: Record<string, Function[]> = {};
  return {
    addEventListener: vi.fn((event: string, cb: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    }),
    close: vi.fn(),
    onerror: null as any,
    _emit: (event: string, data: any) => {
      listeners[event]?.forEach(cb => cb({ data: JSON.stringify(data) }));
    },
    _listeners: listeners,
  };
}

describe('ConsultationChatTab', () => {
  const mockOnUnreadCountChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMessages.mockResolvedValue({ messages: [], total: 0 });
    mockConnectMessageStream.mockReturnValue(createMockEventSource());
    mockMarkMessagesRead.mockResolvedValue(undefined);
  });

  describe('Empty state', () => {
    it('shows "select consultation" when consultationId is null', () => {
      render(
        <ConsultationChatTab consultationId={null} onUnreadCountChange={mockOnUnreadCountChange} />
      );
      expect(screen.getByText('Оберіть консультацію для чату')).toBeInTheDocument();
    });

    it('shows "no messages" when consultation has no messages', async () => {
      render(
        <ConsultationChatTab consultationId="cons-1" onUnreadCountChange={mockOnUnreadCountChange} />
      );

      await waitFor(() => {
        expect(screen.getByText('Повідомлень поки немає')).toBeInTheDocument();
      });
    });
  });

  describe('Message loading', () => {
    it('fetches and displays messages', async () => {
      mockGetMessages.mockResolvedValue({
        messages: [
          {
            id: 'msg-1',
            consultation_id: 'cons-1',
            sender_id: 'user-2',
            content: 'Привіт!',
            message_type: 'text',
            created_at: '2026-02-28T10:00:00Z',
            sender_name: 'Attorney',
          },
          {
            id: 'msg-2',
            consultation_id: 'cons-1',
            sender_id: 'user-1',
            content: 'Добрий день',
            message_type: 'text',
            created_at: '2026-02-28T10:01:00Z',
            sender_name: 'Test User',
          },
        ],
        total: 2,
      });

      render(
        <ConsultationChatTab consultationId="cons-1" onUnreadCountChange={mockOnUnreadCountChange} />
      );

      await waitFor(() => {
        expect(screen.getByText('Привіт!')).toBeInTheDocument();
        expect(screen.getByText('Добрий день')).toBeInTheDocument();
      });

      // Other person's name shown, own name not shown
      expect(screen.getByText('Attorney')).toBeInTheDocument();
    });

    it('resets unread count after loading', async () => {
      render(
        <ConsultationChatTab consultationId="cons-1" onUnreadCountChange={mockOnUnreadCountChange} />
      );

      await waitFor(() => {
        expect(mockOnUnreadCountChange).toHaveBeenCalledWith(0);
      });
    });
  });

  describe('Sending messages', () => {
    it('sends message on Enter key and shows optimistically', async () => {
      const user = userEvent.setup();
      mockSendMessage.mockResolvedValue({
        id: 'msg-new',
        consultation_id: 'cons-1',
        sender_id: 'user-1',
        content: 'Test message',
        message_type: 'text',
        created_at: '2026-02-28T10:05:00Z',
        sender_name: 'Test User',
      });

      render(
        <ConsultationChatTab consultationId="cons-1" onUnreadCountChange={mockOnUnreadCountChange} />
      );

      await waitFor(() => {
        expect(mockGetMessages).toHaveBeenCalled();
      });

      const input = screen.getByPlaceholderText('Написати повідомлення...');
      await user.type(input, 'Test message{Enter}');

      await waitFor(() => {
        expect(screen.getByText('Test message')).toBeInTheDocument();
      });

      expect(mockSendMessage).toHaveBeenCalledWith('cons-1', 'Test message', undefined, undefined);
    });

    it('does not send empty messages', async () => {
      const user = userEvent.setup();

      render(
        <ConsultationChatTab consultationId="cons-1" onUnreadCountChange={mockOnUnreadCountChange} />
      );

      await waitFor(() => {
        expect(mockGetMessages).toHaveBeenCalled();
      });

      const input = screen.getByPlaceholderText('Написати повідомлення...');
      await user.type(input, '{Enter}');

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('restores input on send failure', async () => {
      const user = userEvent.setup();
      mockSendMessage.mockRejectedValue(new Error('Network error'));

      render(
        <ConsultationChatTab consultationId="cons-1" onUnreadCountChange={mockOnUnreadCountChange} />
      );

      await waitFor(() => {
        expect(mockGetMessages).toHaveBeenCalled();
      });

      const input = screen.getByPlaceholderText('Написати повідомлення...');
      await user.type(input, 'Failed msg{Enter}');

      await waitFor(() => {
        expect(input).toHaveValue('Failed msg');
      });
    });
  });

  describe('SSE connection', () => {
    it('connects to SSE stream when consultationId is set', async () => {
      render(
        <ConsultationChatTab consultationId="cons-1" onUnreadCountChange={mockOnUnreadCountChange} />
      );

      await waitFor(() => {
        expect(mockConnectMessageStream).toHaveBeenCalledWith('cons-1');
      });
    });

    it('closes SSE on unmount', async () => {
      const mockES = createMockEventSource();
      mockConnectMessageStream.mockReturnValue(mockES);

      const { unmount } = render(
        <ConsultationChatTab consultationId="cons-1" onUnreadCountChange={mockOnUnreadCountChange} />
      );

      await waitFor(() => {
        expect(mockConnectMessageStream).toHaveBeenCalled();
      });

      unmount();
      expect(mockES.close).toHaveBeenCalled();
    });

    it('appends messages received via SSE', async () => {
      const mockES = createMockEventSource();
      mockConnectMessageStream.mockReturnValue(mockES);

      render(
        <ConsultationChatTab consultationId="cons-1" onUnreadCountChange={mockOnUnreadCountChange} />
      );

      await waitFor(() => {
        expect(mockConnectMessageStream).toHaveBeenCalled();
      });

      // Simulate SSE message
      mockES._emit('message', {
        id: 'msg-sse',
        consultation_id: 'cons-1',
        sender_id: 'user-2',
        content: 'SSE message',
        message_type: 'text',
        created_at: '2026-02-28T11:00:00Z',
        sender_name: 'Attorney',
      });

      await waitFor(() => {
        expect(screen.getByText('SSE message')).toBeInTheDocument();
      });
    });
  });
});

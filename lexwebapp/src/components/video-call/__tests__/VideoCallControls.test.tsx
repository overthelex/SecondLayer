/**
 * VideoCallControls Component Unit Tests
 *
 * Mocking strategy:
 * - useVideoCallStore is used directly (real Zustand store) so we can preset
 *   state with setState and assert side-effects after user interactions.
 * - lucide-react icons are rendered as-is; we locate buttons by title attributes
 *   so tests remain resilient to icon changes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VideoCallControls } from '../VideoCallControls';
import { useVideoCallStore } from '../../../stores/videoCallStore';

// ---------------------------------------------------------------------------
// Reset store before each test
// ---------------------------------------------------------------------------
const INITIAL_STATE = {
  callState: 'connected' as const,
  callType: 'video' as const,
  sessionId: null,
  consultationId: null,
  remoteUserId: null,
  remoteUserName: null,
  localStream: null,
  remoteStream: null,
  isMuted: false,
  isVideoOff: false,
  isScreenSharing: false,
  transcriptionEnabled: false,
  transcriptionLanguage: 'uk' as const,
  transcriptSegments: [],
  incomingCall: null,
  callDuration: 0,
};

beforeEach(() => {
  useVideoCallStore.setState(INITIAL_STATE);
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('VideoCallControls', () => {
  describe('mute button', () => {
    it('renders the mute button', () => {
      render(<VideoCallControls />);
      expect(screen.getByTitle('Вимкнути мікрофон')).toBeInTheDocument();
    });

    it('shows "Увімкнути мікрофон" title when isMuted=true', () => {
      useVideoCallStore.setState({ isMuted: true });
      render(<VideoCallControls />);
      expect(screen.getByTitle('Увімкнути мікрофон')).toBeInTheDocument();
    });

    it('shows "Вимкнути мікрофон" title when isMuted=false', () => {
      useVideoCallStore.setState({ isMuted: false });
      render(<VideoCallControls />);
      expect(screen.getByTitle('Вимкнути мікрофон')).toBeInTheDocument();
    });

    it('calls toggleMute in the store when clicked', async () => {
      const user = userEvent.setup();
      render(<VideoCallControls />);
      expect(useVideoCallStore.getState().isMuted).toBe(false);
      await user.click(screen.getByTitle('Вимкнути мікрофон'));
      expect(useVideoCallStore.getState().isMuted).toBe(true);
    });

    it('has red background styling when muted', () => {
      useVideoCallStore.setState({ isMuted: true });
      render(<VideoCallControls />);
      const btn = screen.getByTitle('Увімкнути мікрофон');
      expect(btn.className).toContain('bg-red-500');
    });
  });

  describe('video toggle button', () => {
    it('renders video toggle for video call type', () => {
      useVideoCallStore.setState({ callType: 'video' });
      render(<VideoCallControls />);
      expect(screen.getByTitle('Вимкнути камеру')).toBeInTheDocument();
    });

    it('does NOT render video toggle for audio-only calls', () => {
      useVideoCallStore.setState({ callType: 'audio' });
      render(<VideoCallControls />);
      expect(screen.queryByTitle('Вимкнути камеру')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Увімкнути камеру')).not.toBeInTheDocument();
    });

    it('shows "Увімкнути камеру" title when isVideoOff=true', () => {
      useVideoCallStore.setState({ callType: 'video', isVideoOff: true });
      render(<VideoCallControls />);
      expect(screen.getByTitle('Увімкнути камеру')).toBeInTheDocument();
    });

    it('calls toggleVideo in the store when clicked', async () => {
      const user = userEvent.setup();
      useVideoCallStore.setState({ callType: 'video', isVideoOff: false });
      render(<VideoCallControls />);
      await user.click(screen.getByTitle('Вимкнути камеру'));
      expect(useVideoCallStore.getState().isVideoOff).toBe(true);
    });
  });

  describe('screen share button', () => {
    it('renders the screen share button', () => {
      render(<VideoCallControls />);
      expect(screen.getByTitle('Демонстрація екрану')).toBeInTheDocument();
    });

    it('shows "Зупинити демонстрацію" when isScreenSharing=true', () => {
      useVideoCallStore.setState({ isScreenSharing: true });
      render(<VideoCallControls />);
      expect(screen.getByTitle('Зупинити демонстрацію')).toBeInTheDocument();
    });

    it('calls onToggleScreenShare prop and toggles store state', async () => {
      const user = userEvent.setup();
      const onToggleScreenShare = vi.fn();
      render(<VideoCallControls onToggleScreenShare={onToggleScreenShare} />);
      await user.click(screen.getByTitle('Демонстрація екрану'));
      expect(onToggleScreenShare).toHaveBeenCalledWith(true); // !false
      expect(useVideoCallStore.getState().isScreenSharing).toBe(true);
    });
  });

  describe('transcription toggle button', () => {
    it('renders the transcription button', () => {
      render(<VideoCallControls />);
      expect(screen.getByTitle('Увімкнути транскрипцію')).toBeInTheDocument();
    });

    it('shows "Вимкнути транскрипцію" when transcriptionEnabled=true', () => {
      useVideoCallStore.setState({ transcriptionEnabled: true });
      render(<VideoCallControls />);
      expect(screen.getByTitle('Вимкнути транскрипцію')).toBeInTheDocument();
    });

    it('toggles transcription in the store when clicked', async () => {
      const user = userEvent.setup();
      render(<VideoCallControls />);
      await user.click(screen.getByTitle('Увімкнути транскрипцію'));
      expect(useVideoCallStore.getState().transcriptionEnabled).toBe(true);
    });

    it('has blue background styling when transcription is enabled', () => {
      useVideoCallStore.setState({ transcriptionEnabled: true });
      render(<VideoCallControls />);
      const btn = screen.getByTitle('Вимкнути транскрипцію');
      expect(btn.className).toContain('bg-blue-500');
    });
  });

  describe('language selector', () => {
    it('renders the language selector button', () => {
      render(<VideoCallControls />);
      expect(screen.getByTitle('Мова транскрипції')).toBeInTheDocument();
    });

    it('shows language dropdown when language button is clicked', async () => {
      const user = userEvent.setup();
      render(<VideoCallControls />);
      await user.click(screen.getByTitle('Мова транскрипції'));
      expect(screen.getByText('Українська')).toBeInTheDocument();
      expect(screen.getByText('Російська')).toBeInTheDocument();
    });

    it('hides dropdown after a language option is selected', async () => {
      const user = userEvent.setup();
      render(<VideoCallControls />);
      await user.click(screen.getByTitle('Мова транскрипції'));
      await user.click(screen.getByText('Російська'));
      expect(screen.queryByText('Українська')).not.toBeInTheDocument();
    });

    it('sets transcriptionLanguage to ru when Російська is selected', async () => {
      const user = userEvent.setup();
      render(<VideoCallControls />);
      await user.click(screen.getByTitle('Мова транскрипції'));
      await user.click(screen.getByText('Російська'));
      expect(useVideoCallStore.getState().transcriptionLanguage).toBe('ru');
    });

    it('sets transcriptionLanguage to uk when Українська is selected', async () => {
      const user = userEvent.setup();
      useVideoCallStore.setState({ transcriptionLanguage: 'ru' });
      render(<VideoCallControls />);
      await user.click(screen.getByTitle('Мова транскрипції'));
      await user.click(screen.getByText('Українська'));
      expect(useVideoCallStore.getState().transcriptionLanguage).toBe('uk');
    });
  });

  describe('hang up button', () => {
    it('renders the hang up button', () => {
      render(<VideoCallControls />);
      expect(screen.getByTitle('Завершити дзвінок')).toBeInTheDocument();
    });

    it('always has red background styling', () => {
      render(<VideoCallControls />);
      const btn = screen.getByTitle('Завершити дзвінок');
      expect(btn.className).toContain('bg-red-600');
    });

    it('calls onEndCall prop when hang up is clicked', async () => {
      const user = userEvent.setup();
      const onEndCall = vi.fn();
      render(<VideoCallControls onEndCall={onEndCall} />);
      await user.click(screen.getByTitle('Завершити дзвінок'));
      expect(onEndCall).toHaveBeenCalledTimes(1);
    });

    it('does not throw when onEndCall prop is not provided', async () => {
      const user = userEvent.setup();
      render(<VideoCallControls />);
      await expect(user.click(screen.getByTitle('Завершити дзвінок'))).resolves.not.toThrow();
    });
  });
});

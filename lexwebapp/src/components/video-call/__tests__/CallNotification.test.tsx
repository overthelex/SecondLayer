/**
 * CallNotification Component Unit Tests
 *
 * Mocking strategy:
 * - useVideoCallStore is used directly (real Zustand store).
 * - Fake timers are used to verify the 30-second auto-dismiss behaviour.
 * - window CustomEvents are observed via addEventListener spies.
 *
 * Timer note: tests that involve userEvent clicks use real timers (default);
 * only the auto-dismiss block switches to fake timers. This matches the pattern
 * used by other component tests in this project.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CallNotification } from '../CallNotification';
import { useVideoCallStore } from '../../../stores/videoCallStore';
import type { IncomingCallData } from '../../../stores/videoCallStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeIncomingCall(overrides: Partial<IncomingCallData> = {}): IncomingCallData {
  return {
    sessionId: 'session-test',
    callerId: 'caller-id-1',
    callerName: 'Марія',
    callType: 'video',
    consultationId: 'consult-1',
    ...overrides,
  };
}

const INITIAL_STATE = {
  callState: 'idle' as const,
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

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('CallNotification', () => {
  describe('visibility', () => {
    it('renders nothing when incomingCall is null', () => {
      render(<CallNotification />);
      expect(screen.queryByText(/дзвінок/i)).not.toBeInTheDocument();
    });

    it('renders the notification overlay when incomingCall is set', () => {
      useVideoCallStore.setState({ incomingCall: makeIncomingCall() });
      render(<CallNotification />);
      expect(screen.getByText(/Вхідний відеодзвінок від Марія/)).toBeInTheDocument();
    });
  });

  describe('caller info', () => {
    it('shows caller name from store incomingCall', () => {
      useVideoCallStore.setState({
        incomingCall: makeIncomingCall({ callerName: 'Іван Петров' }),
      });
      render(<CallNotification />);
      expect(screen.getByText(/Іван Петров/)).toBeInTheDocument();
    });

    it('shows "Вхідний відеодзвінок" label for video call type', () => {
      useVideoCallStore.setState({
        incomingCall: makeIncomingCall({ callType: 'video' }),
      });
      render(<CallNotification />);
      expect(screen.getByText(/Вхідний відеодзвінок від/)).toBeInTheDocument();
      expect(screen.getByText('Відеодзвінок')).toBeInTheDocument();
    });

    it('shows "Вхідний аудіодзвінок" label for audio call type', () => {
      useVideoCallStore.setState({
        incomingCall: makeIncomingCall({ callType: 'audio' }),
      });
      render(<CallNotification />);
      expect(screen.getByText(/Вхідний аудіодзвінок від/)).toBeInTheDocument();
      expect(screen.getByText('Аудіодзвінок')).toBeInTheDocument();
    });
  });

  describe('accept button', () => {
    it('renders the accept button', () => {
      useVideoCallStore.setState({ incomingCall: makeIncomingCall() });
      render(<CallNotification />);
      expect(screen.getByTitle('Прийняти')).toBeInTheDocument();
    });

    it('dispatches video-call-accept CustomEvent with call detail when clicked', async () => {
      const user = userEvent.setup();
      const incomingCall = makeIncomingCall();
      useVideoCallStore.setState({ incomingCall });

      const listener = vi.fn();
      window.addEventListener('video-call-accept', listener);

      render(<CallNotification />);
      await user.click(screen.getByTitle('Прийняти'));

      expect(listener).toHaveBeenCalledTimes(1);
      const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
      expect(detail.sessionId).toBe(incomingCall.sessionId);
      expect(detail.callerId).toBe(incomingCall.callerId);

      window.removeEventListener('video-call-accept', listener);
    });

    it('updates store state on accept: sets sessionId, remoteUser, callType, callState', async () => {
      const user = userEvent.setup();
      const incomingCall = makeIncomingCall({
        sessionId: 'sess-accept',
        callerId: 'caller-x',
        callerName: 'Олена',
        callType: 'audio',
      });
      useVideoCallStore.setState({ incomingCall });
      render(<CallNotification />);
      await user.click(screen.getByTitle('Прийняти'));

      const state = useVideoCallStore.getState();
      expect(state.sessionId).toBe('sess-accept');
      expect(state.remoteUserId).toBe('caller-x');
      expect(state.remoteUserName).toBe('Олена');
      expect(state.callType).toBe('audio');
      expect(state.callState).toBe('connecting');
      expect(state.incomingCall).toBeNull();
    });

    it('hides the notification after accepting', async () => {
      const user = userEvent.setup();
      useVideoCallStore.setState({ incomingCall: makeIncomingCall() });
      render(<CallNotification />);
      await user.click(screen.getByTitle('Прийняти'));
      expect(screen.queryByTitle('Прийняти')).not.toBeInTheDocument();
    });
  });

  describe('reject button', () => {
    it('renders the reject button', () => {
      useVideoCallStore.setState({ incomingCall: makeIncomingCall() });
      render(<CallNotification />);
      expect(screen.getByTitle('Відхилити')).toBeInTheDocument();
    });

    it('dispatches video-call-reject CustomEvent with call detail when clicked', async () => {
      const user = userEvent.setup();
      const incomingCall = makeIncomingCall();
      useVideoCallStore.setState({ incomingCall });

      const listener = vi.fn();
      window.addEventListener('video-call-reject', listener);

      render(<CallNotification />);
      await user.click(screen.getByTitle('Відхилити'));

      expect(listener).toHaveBeenCalledTimes(1);
      const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
      expect(detail.sessionId).toBe(incomingCall.sessionId);

      window.removeEventListener('video-call-reject', listener);
    });

    it('clears incomingCall in the store after rejection', async () => {
      const user = userEvent.setup();
      useVideoCallStore.setState({ incomingCall: makeIncomingCall() });
      render(<CallNotification />);
      await user.click(screen.getByTitle('Відхилити'));
      expect(useVideoCallStore.getState().incomingCall).toBeNull();
    });

    it('hides the notification after rejection', async () => {
      const user = userEvent.setup();
      useVideoCallStore.setState({ incomingCall: makeIncomingCall() });
      render(<CallNotification />);
      await user.click(screen.getByTitle('Відхилити'));
      expect(screen.queryByTitle('Відхилити')).not.toBeInTheDocument();
    });
  });

  describe('auto-dismiss after 30 seconds', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('clears incomingCall automatically after 30 seconds', () => {
      useVideoCallStore.setState({ incomingCall: makeIncomingCall() });
      render(<CallNotification />);

      expect(useVideoCallStore.getState().incomingCall).not.toBeNull();

      act(() => {
        vi.advanceTimersByTime(30_000);
      });

      expect(useVideoCallStore.getState().incomingCall).toBeNull();
    });

    it('does not dismiss before 30 seconds have elapsed', () => {
      useVideoCallStore.setState({ incomingCall: makeIncomingCall() });
      render(<CallNotification />);

      act(() => {
        vi.advanceTimersByTime(29_999);
      });

      expect(useVideoCallStore.getState().incomingCall).not.toBeNull();
    });

    it('cancels the auto-dismiss timer when the user accepts before 30s', async () => {
      // Use real timers for the click interaction, then switch back
      vi.useRealTimers();
      const user = userEvent.setup();
      useVideoCallStore.setState({ incomingCall: makeIncomingCall() });
      render(<CallNotification />);

      await user.click(screen.getByTitle('Прийняти'));

      // Now switch to fake timers and verify no stale timer fires
      vi.useFakeTimers();
      act(() => {
        vi.advanceTimersByTime(30_000);
      });

      // callState should remain 'connecting', not reset by a late timer
      expect(useVideoCallStore.getState().callState).toBe('connecting');
    });

    it('cancels the auto-dismiss timer when the user rejects before 30s', async () => {
      vi.useRealTimers();
      const user = userEvent.setup();
      useVideoCallStore.setState({ incomingCall: makeIncomingCall() });
      render(<CallNotification />);

      await user.click(screen.getByTitle('Відхилити'));

      vi.useFakeTimers();
      act(() => {
        vi.advanceTimersByTime(30_000);
      });

      // incomingCall already null — no stale side-effects
      expect(useVideoCallStore.getState().incomingCall).toBeNull();
      // callState unchanged from initial idle
      expect(useVideoCallStore.getState().callState).toBe('idle');
    });

    it('restarts the auto-dismiss timer when a new incomingCall arrives', () => {
      const { rerender } = render(<CallNotification />);

      // Set first call and render it
      act(() => {
        useVideoCallStore.setState({ incomingCall: makeIncomingCall({ sessionId: 's1' }) });
      });
      rerender(<CallNotification />);

      // Advance 15 seconds into the first call's timer
      act(() => {
        vi.advanceTimersByTime(15_000);
      });

      // Replace with a second call — this restarts the effect
      act(() => {
        useVideoCallStore.setState({ incomingCall: makeIncomingCall({ sessionId: 's2' }) });
      });
      rerender(<CallNotification />);

      // Advance another 15s (30s total from first, but only 15s from second)
      act(() => {
        vi.advanceTimersByTime(15_000);
      });
      // Second call should still be live at the 15s mark
      expect(useVideoCallStore.getState().incomingCall).not.toBeNull();

      // Advance remaining 15s for the second call to expire
      act(() => {
        vi.advanceTimersByTime(15_000);
      });
      expect(useVideoCallStore.getState().incomingCall).toBeNull();
    });
  });
});

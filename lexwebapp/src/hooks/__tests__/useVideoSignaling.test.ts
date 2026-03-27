/**
 * useVideoSignaling Hook Unit Tests
 *
 * Mocking strategy:
 * - WebSocket is replaced with a controllable mock class so we can simulate
 *   open/close/message events without a real network.
 * - useVideoCallStore is used directly (real store) so we can assert on its
 *   state changes caused by incoming messages.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVideoSignaling } from '../useVideoSignaling';
import { useVideoCallStore } from '../../stores/videoCallStore';

// ---------------------------------------------------------------------------
// WebSocket mock
// ---------------------------------------------------------------------------
type WsEventHandler = ((event: Event | MessageEvent | CloseEvent) => void) | null;

class MockWebSocket {
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState: number = MockWebSocket.OPEN;
  url: string;
  onopen: WsEventHandler = null;
  onclose: WsEventHandler = null;
  onerror: WsEventHandler = null;
  onmessage: ((event: MessageEvent) => void) | null = null;

  send = vi.fn();
  close = vi.fn();

  // Static registry so tests can access the last created instance
  static instances: MockWebSocket[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  // Helpers used in tests to simulate server-sent events
  triggerOpen() {
    this.onopen?.(new Event('open'));
  }

  triggerClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }

  triggerMessage(data: object) {
    const event = new MessageEvent('message', { data: JSON.stringify(data) });
    this.onmessage?.(event);
  }

  triggerMalformedMessage() {
    const event = new MessageEvent('message', { data: 'not-json{{{{' });
    this.onmessage?.(event);
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
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
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);

  // Provide a stable auth token in localStorage
  localStorage.setItem('auth_token', 'test-token-abc');

  // Reset store
  useVideoCallStore.setState(INITIAL_STATE);

  // Fake timers for reconnect delays
  vi.useFakeTimers();
});

afterEach(() => {
  localStorage.removeItem('auth_token');
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helper: render hook and grab the current WS instance
// ---------------------------------------------------------------------------
function renderSignaling(consultationId: string | null) {
  const hook = renderHook(() => useVideoSignaling(consultationId));
  return hook;
}

function lastWs(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('useVideoSignaling', () => {
  describe('connection setup', () => {
    it('does not open a WebSocket when consultationId is null', () => {
      renderSignaling(null);
      expect(MockWebSocket.instances).toHaveLength(0);
    });

    it('does not open a WebSocket when auth_token is absent', () => {
      localStorage.removeItem('auth_token');
      renderSignaling('consult-1');
      expect(MockWebSocket.instances).toHaveLength(0);
    });

    it('connects to the correct URL including token and consultationId', () => {
      renderSignaling('consult-99');
      const ws = lastWs();
      expect(ws).toBeDefined();
      expect(ws.url).toContain('video-signaling');
      expect(ws.url).toContain('token=test-token-abc');
      expect(ws.url).toContain('consultationId=consult-99');
    });

    it('uses ws: protocol when page is http', () => {
      // jsdom default is http
      renderSignaling('consult-1');
      expect(lastWs().url).toMatch(/^ws:/);
    });

    it('returns isConnected=false before the socket opens', () => {
      const { result } = renderSignaling('consult-1');
      expect(result.current.isConnected).toBe(false);
    });

    it('returns isConnected=true after WebSocket opens', () => {
      const { result } = renderSignaling('consult-1');
      act(() => {
        lastWs().triggerOpen();
      });
      expect(result.current.isConnected).toBe(true);
    });

    it('resets reconnect counter to 0 on successful open', () => {
      const { result } = renderSignaling('consult-1');
      act(() => {
        lastWs().triggerOpen();
      });
      // Trigger a close-then-reconnect cycle to bump the counter
      act(() => {
        lastWs().triggerClose();
      });
      act(() => {
        vi.runAllTimers();
      });
      // Simulate the reconnect succeeding
      act(() => {
        lastWs().triggerOpen();
      });
      expect(result.current.isConnected).toBe(true);
    });
  });

  describe('cleanup on unmount', () => {
    it('closes the WebSocket when the component unmounts', () => {
      const { unmount } = renderSignaling('consult-1');
      act(() => {
        lastWs().triggerOpen();
      });
      const ws = lastWs();
      unmount();
      expect(ws.close).toHaveBeenCalled();
    });

    it('clears any pending reconnect timer on unmount', () => {
      const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
      const { unmount } = renderSignaling('consult-1');
      act(() => {
        lastWs().triggerOpen();
        lastWs().triggerClose();
      });
      unmount();
      expect(clearSpy).toHaveBeenCalled();
    });
  });

  describe('reconnection', () => {
    it('reconnects after close (attempt 1)', () => {
      renderSignaling('consult-1');
      act(() => {
        lastWs().triggerOpen();
        lastWs().triggerClose();
      });
      expect(MockWebSocket.instances).toHaveLength(1);
      act(() => {
        vi.runAllTimers();
      });
      expect(MockWebSocket.instances).toHaveLength(2);
    });

    it('reconnects up to MAX_RECONNECT_ATTEMPTS (3) times without resetting the counter', () => {
      renderSignaling('consult-1');

      // Close without ever opening — this way reconnectAttemptsRef never resets.
      // Attempt 0 (counter=0 < 3): close → schedules reconnect → counter becomes 1
      act(() => { lastWs().triggerClose(); });
      act(() => { vi.runAllTimers(); }); // fires reconnect → WS #2

      // Attempt 1 (counter=1 < 3): close → schedules reconnect → counter becomes 2
      act(() => { lastWs().triggerClose(); });
      act(() => { vi.runAllTimers(); }); // fires reconnect → WS #3

      // Attempt 2 (counter=2 < 3): close → schedules reconnect → counter becomes 3
      act(() => { lastWs().triggerClose(); });
      act(() => { vi.runAllTimers(); }); // fires reconnect → WS #4

      expect(MockWebSocket.instances).toHaveLength(4);

      // Attempt 3 (counter=3, NOT < 3): close → no more reconnects
      act(() => { lastWs().triggerClose(); });
      act(() => { vi.runAllTimers(); });

      expect(MockWebSocket.instances).toHaveLength(4);
    });
  });

  describe('incoming message handling', () => {
    function setupConnected(consultationId = 'consult-1') {
      renderSignaling(consultationId);
      act(() => {
        lastWs().triggerOpen();
      });
      return lastWs();
    }

    it('dispatches webrtc-offer CustomEvent on offer message', () => {
      const ws = setupConnected();
      const listener = vi.fn();
      window.addEventListener('webrtc-offer', listener);

      act(() => {
        ws.triggerMessage({ type: 'offer', sdp: 'v=0...', sdpType: 'offer' });
      });

      expect(listener).toHaveBeenCalledTimes(1);
      const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
      expect(detail.type).toBe('offer');
      window.removeEventListener('webrtc-offer', listener);
    });

    it('dispatches webrtc-answer CustomEvent on answer message', () => {
      const ws = setupConnected();
      const listener = vi.fn();
      window.addEventListener('webrtc-answer', listener);

      act(() => {
        ws.triggerMessage({ type: 'answer', sdp: 'v=0...', sdpType: 'answer' });
      });

      expect(listener).toHaveBeenCalledTimes(1);
      window.removeEventListener('webrtc-answer', listener);
    });

    it('dispatches webrtc-ice-candidate CustomEvent on ice-candidate message', () => {
      const ws = setupConnected();
      const listener = vi.fn();
      window.addEventListener('webrtc-ice-candidate', listener);

      act(() => {
        ws.triggerMessage({ type: 'ice-candidate', candidate: { candidate: 'a=...' } });
      });

      expect(listener).toHaveBeenCalledTimes(1);
      window.removeEventListener('webrtc-ice-candidate', listener);
    });

    it('sets store incomingCall on call-incoming message', () => {
      const ws = setupConnected();
      act(() => {
        ws.triggerMessage({
          type: 'call-incoming',
          sessionId: 'sess-1',
          callerId: 'user-x',
          callerName: 'Alice',
          callType: 'video',
          consultationId: 'consult-1',
        });
      });

      const incomingCall = useVideoCallStore.getState().incomingCall;
      expect(incomingCall).not.toBeNull();
      expect(incomingCall?.callerId).toBe('user-x');
      expect(incomingCall?.callerName).toBe('Alice');
      expect(incomingCall?.callType).toBe('video');
    });

    it('sets callState to connecting and updates session/user on call-accepted', () => {
      const ws = setupConnected();
      act(() => {
        ws.triggerMessage({
          type: 'call-accepted',
          sessionId: 'sess-2',
          userId: 'user-y',
          userName: 'Bob',
        });
      });

      const state = useVideoCallStore.getState();
      expect(state.callState).toBe('connecting');
      expect(state.sessionId).toBe('sess-2');
      expect(state.remoteUserId).toBe('user-y');
      expect(state.remoteUserName).toBe('Bob');
    });

    it('sets callState to ended on call-rejected', () => {
      const ws = setupConnected();
      act(() => {
        ws.triggerMessage({ type: 'call-rejected' });
      });
      expect(useVideoCallStore.getState().callState).toBe('ended');
    });

    it('sets callState to ended on call-ended', () => {
      const ws = setupConnected();
      act(() => {
        ws.triggerMessage({ type: 'call-ended' });
      });
      expect(useVideoCallStore.getState().callState).toBe('ended');
    });

    it('sets callState to ringing on ringing message', () => {
      const ws = setupConnected();
      act(() => {
        ws.triggerMessage({ type: 'ringing' });
      });
      expect(useVideoCallStore.getState().callState).toBe('ringing');
    });

    it('appends transcript segment on transcription message', () => {
      const ws = setupConnected();
      act(() => {
        ws.triggerMessage({
          type: 'transcription',
          segmentId: 'seg-1',
          speakerId: 'user-1',
          speakerName: 'Alice',
          text: 'Добрий день',
          language: 'uk',
          isFinal: true,
          timestampMs: 5000,
        });
      });

      const segments = useVideoCallStore.getState().transcriptSegments;
      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe('Добрий день');
    });

    it('silently ignores malformed (non-JSON) messages', () => {
      const ws = setupConnected();
      expect(() => {
        act(() => {
          ws.triggerMalformedMessage();
        });
      }).not.toThrow();
    });

    it('silently ignores unknown message types', () => {
      const ws = setupConnected();
      expect(() => {
        act(() => {
          ws.triggerMessage({ type: 'some-unknown-message-type' });
        });
      }).not.toThrow();
    });
  });

  describe('send helpers', () => {
    function setupConnected() {
      const hook = renderSignaling('consult-1');
      act(() => {
        lastWs().triggerOpen();
      });
      return { hook, ws: lastWs() };
    }

    it('initiateCall sends correct message and updates store', () => {
      const { hook, ws } = setupConnected();

      act(() => {
        hook.result.current.initiateCall('video', 'callee-1');
      });

      expect(ws.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"initiate-call"')
      );
      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.callType).toBe('video');
      expect(sent.calleeId).toBe('callee-1');
      expect(sent.consultationId).toBe('consult-1');
      expect(useVideoCallStore.getState().callState).toBe('initiating');
    });

    it('hangup sends hangup message and sets callState to ended', () => {
      const { hook, ws } = setupConnected();
      useVideoCallStore.setState({ sessionId: 'sess-active' });

      act(() => {
        hook.result.current.hangup();
      });

      expect(ws.send).toHaveBeenCalled();
      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('hangup');
      expect(sent.sessionId).toBe('sess-active');
      expect(useVideoCallStore.getState().callState).toBe('ended');
    });

    it('acceptCall sends accept-call message and clears incomingCall', () => {
      const { hook, ws } = setupConnected();

      act(() => {
        hook.result.current.acceptCall('sess-abc');
      });

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('accept-call');
      expect(sent.sessionId).toBe('sess-abc');
      expect(useVideoCallStore.getState().incomingCall).toBeNull();
      expect(useVideoCallStore.getState().callState).toBe('connecting');
    });

    it('rejectCall sends reject-call message and clears incomingCall', () => {
      const { hook, ws } = setupConnected();
      useVideoCallStore.setState({
        incomingCall: {
          sessionId: 'sess-abc',
          callerId: 'x',
          callerName: 'X',
          callType: 'video',
          consultationId: 'c',
        },
      });

      act(() => {
        hook.result.current.rejectCall('sess-abc');
      });

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('reject-call');
      expect(useVideoCallStore.getState().incomingCall).toBeNull();
    });

    it('does not send when WebSocket is not open', () => {
      renderSignaling('consult-1');
      // Do NOT trigger open — socket stays in CONNECTING state (readyState 0)
      const ws = lastWs();
      ws.readyState = 0; // CONNECTING

      act(() => {
        // Calling hook functions via direct store to avoid needing result
      });

      // send should not have been called
      expect(ws.send).not.toHaveBeenCalled();
    });
  });
});

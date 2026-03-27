/**
 * Tests for SttService
 *
 * Mocks the `ws` WebSocket constructor so no real Deepgram connection is made.
 * The fake WebSocket exposes an EventEmitter API so tests can trigger
 * open/message/close/error events.
 */

jest.mock('../../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Fake WebSocket
// ---------------------------------------------------------------------------

import { EventEmitter } from 'events';

class FakeWebSocket extends EventEmitter {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState: number = FakeWebSocket.CONNECTING;

  send = jest.fn();
  close = jest.fn(() => {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close');
  });

  // Helper: simulate successful connection
  simulateOpen() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open');
  }

  // Helper: simulate a Deepgram transcript message
  simulateMessage(transcript: string, isFinal: boolean) {
    const payload = {
      channel: { alternatives: [{ transcript, confidence: 0.99 }] },
      is_final: isFinal,
      start: 0,
      duration: 1,
    };
    this.emit('message', Buffer.from(JSON.stringify(payload)));
  }

  // Helper: simulate an error
  simulateError(message: string) {
    this.emit('error', new Error(message));
  }
}

// Capture instances created by the module
const fakeWsInstances: FakeWebSocket[] = [];

jest.mock('ws', () => {
  const FakeWS = jest.fn().mockImplementation((_url: string, _opts: any) => {
    const instance = new FakeWebSocket();
    fakeWsInstances.push(instance);
    return instance;
  });
  (FakeWS as any).OPEN = FakeWebSocket.OPEN;
  (FakeWS as any).CONNECTING = FakeWebSocket.CONNECTING;
  (FakeWS as any).CLOSING = FakeWebSocket.CLOSING;
  (FakeWS as any).CLOSED = FakeWebSocket.CLOSED;

  return { WebSocket: FakeWS };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { SttService } from '../stt-service';
import type { VideoCallService } from '../video-call-service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createMockVideoCallService = (): jest.Mocked<
  Pick<VideoCallService, 'saveTranscriptSegment'>
> => ({
  saveTranscriptSegment: jest.fn().mockResolvedValue({
    id: 'seg-1',
    session_id: 'session-1',
    speaker_id: 'user-1',
    text: '',
    language: 'uk',
    is_final: true,
    timestamp_ms: 0,
    created_at: new Date().toISOString(),
  }),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SttService', () => {
  let service: SttService;
  let mockVideoCallService: ReturnType<typeof createMockVideoCallService>;

  beforeEach(() => {
    jest.clearAllMocks();
    fakeWsInstances.length = 0;
    mockVideoCallService = createMockVideoCallService();
    service = new SttService(mockVideoCallService as unknown as VideoCallService);

    // Ensure DEEPGRAM_API_KEY is not set by default
    delete process.env.DEEPGRAM_API_KEY;
  });

  // ── startTranscription — no API key ───────────────────────────────────────

  describe('startTranscription without DEEPGRAM_API_KEY', () => {
    it('returns a no-op handle when DEEPGRAM_API_KEY is not set', () => {
      const onTranscript = jest.fn();
      const handle = service.startTranscription('session-1', 'user-1', 'uk', onTranscript);

      expect(handle).toBeDefined();
      expect(typeof handle.sendAudio).toBe('function');
      expect(typeof handle.stop).toBe('function');
    });

    it('no-op sendAudio does nothing and does not throw', () => {
      const handle = service.startTranscription('session-1', 'user-1', 'uk', jest.fn());

      expect(() => handle.sendAudio(Buffer.from('audio data'))).not.toThrow();
    });

    it('no-op stop does nothing and does not throw', () => {
      const handle = service.startTranscription('session-1', 'user-1', 'uk', jest.fn());

      expect(() => handle.stop()).not.toThrow();
    });

    it('does not create any WebSocket connection', () => {
      service.startTranscription('session-1', 'user-1', 'uk', jest.fn());

      expect(fakeWsInstances).toHaveLength(0);
    });
  });

  // ── startTranscription — with API key ─────────────────────────────────────

  describe('startTranscription with DEEPGRAM_API_KEY set', () => {
    beforeEach(() => {
      process.env.DEEPGRAM_API_KEY = 'test-key';
    });

    it('returns a handle with sendAudio and stop methods', () => {
      const handle = service.startTranscription('session-1', 'user-1', 'uk', jest.fn());

      expect(handle).toBeDefined();
      expect(typeof handle.sendAudio).toBe('function');
      expect(typeof handle.stop).toBe('function');
    });

    it('creates a WebSocket connection to Deepgram', () => {
      service.startTranscription('session-1', 'user-1', 'uk', jest.fn());

      expect(fakeWsInstances).toHaveLength(1);
    });

    it('uses the language in the WebSocket URL', () => {
      const { WebSocket: FakeWS } = jest.requireMock('ws');
      service.startTranscription('session-1', 'user-1', 'en-US', jest.fn());

      const [url] = (FakeWS as jest.Mock).mock.calls[0];
      expect(url).toContain('language=en-US');
    });

    it('defaults to uk language when empty string is passed', () => {
      const { WebSocket: FakeWS } = jest.requireMock('ws');
      service.startTranscription('session-1', 'user-1', '', jest.fn());

      const [url] = (FakeWS as jest.Mock).mock.calls[0];
      expect(url).toContain('language=uk');
    });

    it('buffers audio sent before the connection is open', () => {
      const handle = service.startTranscription('session-1', 'user-1', 'uk', jest.fn());
      const ws = fakeWsInstances[0];

      const buf = Buffer.from('audio-before-open');
      handle.sendAudio(buf);

      // WebSocket not yet open — send should not have been called
      expect(ws.send).not.toHaveBeenCalled();

      // Simulate connection open — buffered data is flushed
      ws.simulateOpen();
      expect(ws.send).toHaveBeenCalledWith(buf);
    });

    it('sends audio directly when connection is already open', () => {
      const handle = service.startTranscription('session-1', 'user-1', 'uk', jest.fn());
      const ws = fakeWsInstances[0];
      ws.simulateOpen();

      const buf = Buffer.from('live-audio');
      handle.sendAudio(buf);

      expect(ws.send).toHaveBeenCalledWith(buf);
    });

    it('invokes onTranscript callback when a message arrives', () => {
      const onTranscript = jest.fn();
      service.startTranscription('session-1', 'user-1', 'uk', onTranscript);
      const ws = fakeWsInstances[0];
      ws.simulateOpen();

      ws.simulateMessage('Доброго ранку', false);

      expect(onTranscript).toHaveBeenCalledTimes(1);
      const [text, isFinal] = onTranscript.mock.calls[0];
      expect(text).toBe('Доброго ранку');
      expect(isFinal).toBe(false);
    });

    it('saves transcript to DB when message is final', async () => {
      const onTranscript = jest.fn();
      service.startTranscription('session-1', 'user-1', 'uk', onTranscript);
      const ws = fakeWsInstances[0];
      ws.simulateOpen();

      ws.simulateMessage('Final text', true);

      // Allow async save to complete
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockVideoCallService.saveTranscriptSegment).toHaveBeenCalledTimes(1);
      const [sessionId, speakerId, text, lang, isFinal] =
        mockVideoCallService.saveTranscriptSegment.mock.calls[0];
      expect(sessionId).toBe('session-1');
      expect(speakerId).toBe('user-1');
      expect(text).toBe('Final text');
      expect(lang).toBe('uk');
      expect(isFinal).toBe(true);
    });

    it('does not save to DB for non-final (interim) transcript messages', async () => {
      service.startTranscription('session-1', 'user-1', 'uk', jest.fn());
      const ws = fakeWsInstances[0];
      ws.simulateOpen();

      ws.simulateMessage('Interim...', false);

      await new Promise((resolve) => setImmediate(resolve));

      expect(mockVideoCallService.saveTranscriptSegment).not.toHaveBeenCalled();
    });

    it('does not invoke callback when transcript is empty', () => {
      const onTranscript = jest.fn();
      service.startTranscription('session-1', 'user-1', 'uk', onTranscript);
      const ws = fakeWsInstances[0];
      ws.simulateOpen();

      // Emit a message with an empty transcript
      const payload = { channel: { alternatives: [{ transcript: '  ' }] }, is_final: false };
      ws.emit('message', Buffer.from(JSON.stringify(payload)));

      expect(onTranscript).not.toHaveBeenCalled();
    });

    it('handles malformed JSON from Deepgram without throwing', () => {
      service.startTranscription('session-1', 'user-1', 'uk', jest.fn());
      const ws = fakeWsInstances[0];
      ws.simulateOpen();

      expect(() => ws.emit('message', Buffer.from('not valid json'))).not.toThrow();
    });
  });

  // ── stopTranscription ──────────────────────────────────────────────────────

  describe('stopTranscription', () => {
    it('closes the WebSocket and removes the handle', () => {
      process.env.DEEPGRAM_API_KEY = 'test-key';
      service.startTranscription('session-1', 'user-1', 'uk', jest.fn());
      const ws = fakeWsInstances[0];
      ws.simulateOpen();

      service.stopTranscription('session-1', 'user-1');

      expect(ws.close).toHaveBeenCalled();
    });

    it('does nothing when there is no active transcription for the key', () => {
      // Should not throw even when key does not exist
      expect(() => service.stopTranscription('ghost-session', 'ghost-user')).not.toThrow();
    });

    it('sends CloseStream message to Deepgram before closing', () => {
      process.env.DEEPGRAM_API_KEY = 'test-key';
      service.startTranscription('session-1', 'user-1', 'uk', jest.fn());
      const ws = fakeWsInstances[0];
      ws.simulateOpen();

      service.stopTranscription('session-1', 'user-1');

      const sentMessages = ws.send.mock.calls.map((c: any[]) => {
        try { return JSON.parse(c[0].toString()); } catch { return null; }
      });
      expect(sentMessages).toContainEqual({ type: 'CloseStream' });
    });
  });

  // ── Multiple simultaneous transcriptions ──────────────────────────────────

  describe('multiple simultaneous transcriptions', () => {
    it('tracks each speaker independently', () => {
      process.env.DEEPGRAM_API_KEY = 'test-key';

      service.startTranscription('session-1', 'speaker-A', 'uk', jest.fn());
      service.startTranscription('session-1', 'speaker-B', 'uk', jest.fn());

      expect(fakeWsInstances).toHaveLength(2);
    });

    it('different sessions are tracked independently', () => {
      process.env.DEEPGRAM_API_KEY = 'test-key';

      service.startTranscription('session-1', 'user-1', 'uk', jest.fn());
      service.startTranscription('session-2', 'user-1', 'uk', jest.fn());

      expect(fakeWsInstances).toHaveLength(2);
    });

    it('stopping one transcription does not affect others', () => {
      process.env.DEEPGRAM_API_KEY = 'test-key';

      service.startTranscription('session-1', 'speaker-A', 'uk', jest.fn());
      service.startTranscription('session-1', 'speaker-B', 'uk', jest.fn());

      const wsA = fakeWsInstances[0];
      const wsB = fakeWsInstances[1];
      wsA.simulateOpen();
      wsB.simulateOpen();

      service.stopTranscription('session-1', 'speaker-A');

      expect(wsA.close).toHaveBeenCalled();
      expect(wsB.close).not.toHaveBeenCalled();
    });

    it('starting a new transcription for the same key stops the previous one', () => {
      process.env.DEEPGRAM_API_KEY = 'test-key';

      service.startTranscription('session-1', 'user-1', 'uk', jest.fn());
      const wsFirst = fakeWsInstances[0];
      wsFirst.simulateOpen();

      // Start again for the same session+speaker key
      service.startTranscription('session-1', 'user-1', 'uk', jest.fn());

      expect(wsFirst.close).toHaveBeenCalled();
      expect(fakeWsInstances).toHaveLength(2);
    });

    it('callbacks fire for their own speaker only', () => {
      process.env.DEEPGRAM_API_KEY = 'test-key';

      const callbackA = jest.fn();
      const callbackB = jest.fn();

      service.startTranscription('session-1', 'speaker-A', 'uk', callbackA);
      service.startTranscription('session-1', 'speaker-B', 'uk', callbackB);

      const wsA = fakeWsInstances[0];
      const wsB = fakeWsInstances[1];
      wsA.simulateOpen();
      wsB.simulateOpen();

      wsA.simulateMessage('Message from A', false);

      expect(callbackA).toHaveBeenCalledTimes(1);
      expect(callbackB).not.toHaveBeenCalled();
    });
  });
});

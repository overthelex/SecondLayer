/**
 * videoCallStore Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useVideoCallStore } from '../videoCallStore';
import type { TranscriptSegment, IncomingCallData } from '../videoCallStore';

// Factory helpers
function makeSegment(overrides: Partial<TranscriptSegment> = {}): TranscriptSegment {
  return {
    id: 'seg-1',
    speakerId: 'user-1',
    speakerName: 'John',
    text: 'Hello',
    language: 'uk',
    isFinal: true,
    timestampMs: 1000,
    ...overrides,
  };
}

function makeIncomingCall(overrides: Partial<IncomingCallData> = {}): IncomingCallData {
  return {
    sessionId: 'session-abc',
    callerId: 'caller-1',
    callerName: 'Alice',
    callType: 'video',
    consultationId: 'consult-1',
    ...overrides,
  };
}

const INITIAL_STATE = {
  callState: 'idle',
  callType: 'video',
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
  transcriptionLanguage: 'uk',
  transcriptSegments: [],
  incomingCall: null,
  callDuration: 0,
};

describe('videoCallStore', () => {
  beforeEach(() => {
    useVideoCallStore.setState(INITIAL_STATE as any);
  });

  describe('initial state', () => {
    it('has callState idle', () => {
      expect(useVideoCallStore.getState().callState).toBe('idle');
    });

    it('has callType video', () => {
      expect(useVideoCallStore.getState().callType).toBe('video');
    });

    it('has null sessionId and consultationId', () => {
      expect(useVideoCallStore.getState().sessionId).toBeNull();
      expect(useVideoCallStore.getState().consultationId).toBeNull();
    });

    it('has null remote user fields', () => {
      expect(useVideoCallStore.getState().remoteUserId).toBeNull();
      expect(useVideoCallStore.getState().remoteUserName).toBeNull();
    });

    it('has null streams', () => {
      expect(useVideoCallStore.getState().localStream).toBeNull();
      expect(useVideoCallStore.getState().remoteStream).toBeNull();
    });

    it('has media flags all false', () => {
      expect(useVideoCallStore.getState().isMuted).toBe(false);
      expect(useVideoCallStore.getState().isVideoOff).toBe(false);
      expect(useVideoCallStore.getState().isScreenSharing).toBe(false);
    });

    it('has transcription defaults', () => {
      expect(useVideoCallStore.getState().transcriptionEnabled).toBe(false);
      expect(useVideoCallStore.getState().transcriptionLanguage).toBe('uk');
      expect(useVideoCallStore.getState().transcriptSegments).toEqual([]);
    });

    it('has null incomingCall and zero duration', () => {
      expect(useVideoCallStore.getState().incomingCall).toBeNull();
      expect(useVideoCallStore.getState().callDuration).toBe(0);
    });
  });

  describe('setCallState', () => {
    it('updates callState to initiating', () => {
      useVideoCallStore.getState().setCallState('initiating');
      expect(useVideoCallStore.getState().callState).toBe('initiating');
    });

    it('updates callState through all valid states', () => {
      const states = ['initiating', 'ringing', 'connecting', 'connected', 'ended', 'idle'] as const;
      for (const state of states) {
        useVideoCallStore.getState().setCallState(state);
        expect(useVideoCallStore.getState().callState).toBe(state);
      }
    });
  });

  describe('setSessionId', () => {
    it('sets a session ID string', () => {
      useVideoCallStore.getState().setSessionId('session-xyz');
      expect(useVideoCallStore.getState().sessionId).toBe('session-xyz');
    });

    it('clears session ID to null', () => {
      useVideoCallStore.setState({ sessionId: 'session-xyz' });
      useVideoCallStore.getState().setSessionId(null);
      expect(useVideoCallStore.getState().sessionId).toBeNull();
    });
  });

  describe('setConsultationId', () => {
    it('sets consultation ID', () => {
      useVideoCallStore.getState().setConsultationId('consult-42');
      expect(useVideoCallStore.getState().consultationId).toBe('consult-42');
    });

    it('clears consultation ID to null', () => {
      useVideoCallStore.setState({ consultationId: 'consult-42' });
      useVideoCallStore.getState().setConsultationId(null);
      expect(useVideoCallStore.getState().consultationId).toBeNull();
    });
  });

  describe('setRemoteUser', () => {
    it('sets remoteUserId and remoteUserName together', () => {
      useVideoCallStore.getState().setRemoteUser('user-99', 'Bob');
      expect(useVideoCallStore.getState().remoteUserId).toBe('user-99');
      expect(useVideoCallStore.getState().remoteUserName).toBe('Bob');
    });

    it('clears remote user to null', () => {
      useVideoCallStore.setState({ remoteUserId: 'u', remoteUserName: 'Name' });
      useVideoCallStore.getState().setRemoteUser(null, null);
      expect(useVideoCallStore.getState().remoteUserId).toBeNull();
      expect(useVideoCallStore.getState().remoteUserName).toBeNull();
    });
  });

  describe('setLocalStream / setRemoteStream', () => {
    it('sets localStream', () => {
      const stream = { id: 'local' } as unknown as MediaStream;
      useVideoCallStore.getState().setLocalStream(stream);
      expect(useVideoCallStore.getState().localStream).toBe(stream);
    });

    it('clears localStream to null', () => {
      const stream = { id: 'local' } as unknown as MediaStream;
      useVideoCallStore.setState({ localStream: stream });
      useVideoCallStore.getState().setLocalStream(null);
      expect(useVideoCallStore.getState().localStream).toBeNull();
    });

    it('sets remoteStream', () => {
      const stream = { id: 'remote' } as unknown as MediaStream;
      useVideoCallStore.getState().setRemoteStream(stream);
      expect(useVideoCallStore.getState().remoteStream).toBe(stream);
    });

    it('clears remoteStream to null', () => {
      const stream = { id: 'remote' } as unknown as MediaStream;
      useVideoCallStore.setState({ remoteStream: stream });
      useVideoCallStore.getState().setRemoteStream(null);
      expect(useVideoCallStore.getState().remoteStream).toBeNull();
    });
  });

  describe('toggleMute', () => {
    it('toggles isMuted from false to true', () => {
      expect(useVideoCallStore.getState().isMuted).toBe(false);
      useVideoCallStore.getState().toggleMute();
      expect(useVideoCallStore.getState().isMuted).toBe(true);
    });

    it('toggles isMuted from true to false', () => {
      useVideoCallStore.setState({ isMuted: true });
      useVideoCallStore.getState().toggleMute();
      expect(useVideoCallStore.getState().isMuted).toBe(false);
    });

    it('enables audio tracks on the local stream when unmuting', () => {
      const track = { kind: 'audio', enabled: false };
      const stream = {
        getAudioTracks: () => [track],
        getVideoTracks: () => [],
      } as unknown as MediaStream;
      // Start muted, stream present
      useVideoCallStore.setState({ isMuted: true, localStream: stream });
      useVideoCallStore.getState().toggleMute();
      // enabled should be set to the old isMuted value (true) — re-enabling
      expect(track.enabled).toBe(true);
      expect(useVideoCallStore.getState().isMuted).toBe(false);
    });

    it('disables audio tracks on the local stream when muting', () => {
      const track = { kind: 'audio', enabled: true };
      const stream = {
        getAudioTracks: () => [track],
        getVideoTracks: () => [],
      } as unknown as MediaStream;
      useVideoCallStore.setState({ isMuted: false, localStream: stream });
      useVideoCallStore.getState().toggleMute();
      // enabled set to old isMuted (false) — disabling
      expect(track.enabled).toBe(false);
      expect(useVideoCallStore.getState().isMuted).toBe(true);
    });

    it('works without a local stream (no crash)', () => {
      useVideoCallStore.setState({ isMuted: false, localStream: null });
      expect(() => useVideoCallStore.getState().toggleMute()).not.toThrow();
      expect(useVideoCallStore.getState().isMuted).toBe(true);
    });
  });

  describe('toggleVideo', () => {
    it('toggles isVideoOff from false to true', () => {
      useVideoCallStore.getState().toggleVideo();
      expect(useVideoCallStore.getState().isVideoOff).toBe(true);
    });

    it('toggles isVideoOff from true to false', () => {
      useVideoCallStore.setState({ isVideoOff: true });
      useVideoCallStore.getState().toggleVideo();
      expect(useVideoCallStore.getState().isVideoOff).toBe(false);
    });

    it('enables video tracks on the local stream when un-hiding video', () => {
      const track = { kind: 'video', enabled: false };
      const stream = {
        getAudioTracks: () => [],
        getVideoTracks: () => [track],
      } as unknown as MediaStream;
      useVideoCallStore.setState({ isVideoOff: true, localStream: stream });
      useVideoCallStore.getState().toggleVideo();
      expect(track.enabled).toBe(true);
    });

    it('works without a local stream (no crash)', () => {
      useVideoCallStore.setState({ isVideoOff: false, localStream: null });
      expect(() => useVideoCallStore.getState().toggleVideo()).not.toThrow();
    });
  });

  describe('toggleScreenSharing', () => {
    it('toggles isScreenSharing from false to true', () => {
      useVideoCallStore.getState().toggleScreenSharing();
      expect(useVideoCallStore.getState().isScreenSharing).toBe(true);
    });

    it('toggles isScreenSharing from true to false', () => {
      useVideoCallStore.setState({ isScreenSharing: true });
      useVideoCallStore.getState().toggleScreenSharing();
      expect(useVideoCallStore.getState().isScreenSharing).toBe(false);
    });
  });

  describe('toggleTranscription', () => {
    it('toggles transcriptionEnabled from false to true', () => {
      useVideoCallStore.getState().toggleTranscription();
      expect(useVideoCallStore.getState().transcriptionEnabled).toBe(true);
    });

    it('toggles transcriptionEnabled from true to false', () => {
      useVideoCallStore.setState({ transcriptionEnabled: true });
      useVideoCallStore.getState().toggleTranscription();
      expect(useVideoCallStore.getState().transcriptionEnabled).toBe(false);
    });
  });

  describe('setTranscriptionLanguage', () => {
    it('changes language to ru', () => {
      useVideoCallStore.getState().setTranscriptionLanguage('ru');
      expect(useVideoCallStore.getState().transcriptionLanguage).toBe('ru');
    });

    it('changes language back to uk', () => {
      useVideoCallStore.setState({ transcriptionLanguage: 'ru' });
      useVideoCallStore.getState().setTranscriptionLanguage('uk');
      expect(useVideoCallStore.getState().transcriptionLanguage).toBe('uk');
    });
  });

  describe('addTranscriptSegment', () => {
    it('appends a new segment to an empty array', () => {
      const seg = makeSegment();
      useVideoCallStore.getState().addTranscriptSegment(seg);
      expect(useVideoCallStore.getState().transcriptSegments).toHaveLength(1);
      expect(useVideoCallStore.getState().transcriptSegments[0]).toEqual(seg);
    });

    it('appends a second segment with a different id', () => {
      useVideoCallStore.getState().addTranscriptSegment(makeSegment({ id: 'seg-1' }));
      useVideoCallStore.getState().addTranscriptSegment(makeSegment({ id: 'seg-2', text: 'World' }));
      expect(useVideoCallStore.getState().transcriptSegments).toHaveLength(2);
    });

    it('updates (replaces) an existing segment with the same id', () => {
      useVideoCallStore.getState().addTranscriptSegment(makeSegment({ id: 'seg-1', text: 'draft', isFinal: false }));
      useVideoCallStore.getState().addTranscriptSegment(makeSegment({ id: 'seg-1', text: 'final text', isFinal: true }));
      const segments = useVideoCallStore.getState().transcriptSegments;
      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe('final text');
      expect(segments[0].isFinal).toBe(true);
    });

    it('preserves order of earlier segments when updating a later one', () => {
      useVideoCallStore.getState().addTranscriptSegment(makeSegment({ id: 'a', text: 'first' }));
      useVideoCallStore.getState().addTranscriptSegment(makeSegment({ id: 'b', text: 'second' }));
      useVideoCallStore.getState().addTranscriptSegment(makeSegment({ id: 'a', text: 'first-updated' }));
      const segs = useVideoCallStore.getState().transcriptSegments;
      expect(segs).toHaveLength(2);
      expect(segs[0].text).toBe('first-updated');
      expect(segs[1].text).toBe('second');
    });
  });

  describe('setIncomingCall', () => {
    it('sets incoming call data', () => {
      const data = makeIncomingCall();
      useVideoCallStore.getState().setIncomingCall(data);
      expect(useVideoCallStore.getState().incomingCall).toEqual(data);
    });

    it('clears incoming call to null', () => {
      useVideoCallStore.setState({ incomingCall: makeIncomingCall() });
      useVideoCallStore.getState().setIncomingCall(null);
      expect(useVideoCallStore.getState().incomingCall).toBeNull();
    });

    it('supports audio call type', () => {
      const data = makeIncomingCall({ callType: 'audio' });
      useVideoCallStore.getState().setIncomingCall(data);
      expect(useVideoCallStore.getState().incomingCall?.callType).toBe('audio');
    });
  });

  describe('incrementDuration', () => {
    it('increments callDuration by 1 from zero', () => {
      useVideoCallStore.getState().incrementDuration();
      expect(useVideoCallStore.getState().callDuration).toBe(1);
    });

    it('increments callDuration repeatedly', () => {
      useVideoCallStore.getState().incrementDuration();
      useVideoCallStore.getState().incrementDuration();
      useVideoCallStore.getState().incrementDuration();
      expect(useVideoCallStore.getState().callDuration).toBe(3);
    });
  });

  describe('resetCall', () => {
    it('resets all state fields to initial values', () => {
      // Dirty the state
      useVideoCallStore.setState({
        callState: 'connected',
        callType: 'audio',
        sessionId: 'session-abc',
        remoteUserId: 'user-1',
        remoteUserName: 'Bob',
        localStream: { id: 'local' } as unknown as MediaStream,
        remoteStream: { id: 'remote' } as unknown as MediaStream,
        isMuted: true,
        isVideoOff: true,
        isScreenSharing: true,
        transcriptionEnabled: true,
        transcriptSegments: [makeSegment()],
        incomingCall: makeIncomingCall(),
        callDuration: 120,
      });

      useVideoCallStore.getState().resetCall();

      const s = useVideoCallStore.getState();
      expect(s.callState).toBe('idle');
      expect(s.callType).toBe('video');
      expect(s.sessionId).toBeNull();
      expect(s.remoteUserId).toBeNull();
      expect(s.remoteUserName).toBeNull();
      expect(s.localStream).toBeNull();
      expect(s.remoteStream).toBeNull();
      expect(s.isMuted).toBe(false);
      expect(s.isVideoOff).toBe(false);
      expect(s.isScreenSharing).toBe(false);
      expect(s.transcriptionEnabled).toBe(false);
      expect(s.transcriptSegments).toEqual([]);
      expect(s.incomingCall).toBeNull();
      expect(s.callDuration).toBe(0);
    });

    it('does not clear consultationId (by design — it persists across calls)', () => {
      // resetCall does NOT include consultationId in its reset set
      useVideoCallStore.setState({ consultationId: 'consult-99' });
      useVideoCallStore.getState().resetCall();
      // consultationId is intentionally not part of resetCall, so it remains
      expect(useVideoCallStore.getState().consultationId).toBe('consult-99');
    });
  });
});

import { create } from 'zustand';

export interface TranscriptSegment {
  id: string;
  speakerId: string;
  speakerName?: string;
  text: string;
  language: string;
  isFinal: boolean;
  timestampMs: number;
}

export interface IncomingCallData {
  sessionId: string;
  callerId: string;
  callerName: string;
  callType: 'video' | 'audio';
  consultationId: string;
}

interface VideoCallState {
  // Call state
  callState: 'idle' | 'initiating' | 'ringing' | 'connecting' | 'connected' | 'ended';
  callType: 'video' | 'audio';
  sessionId: string | null;
  consultationId: string | null;
  remoteUserId: string | null;
  remoteUserName: string | null;

  // Media
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;

  // Transcription
  transcriptionEnabled: boolean;
  transcriptionLanguage: 'uk' | 'ru';
  transcriptSegments: TranscriptSegment[];

  // Incoming call
  incomingCall: IncomingCallData | null;

  // Timer
  callDuration: number;

  // Actions
  setCallState: (state: VideoCallState['callState']) => void;
  setCallType: (type: VideoCallState['callType']) => void;
  setSessionId: (id: string | null) => void;
  setConsultationId: (id: string | null) => void;
  setRemoteUser: (id: string | null, name: string | null) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  toggleScreenSharing: () => void;
  toggleTranscription: () => void;
  setTranscriptionLanguage: (lang: 'uk' | 'ru') => void;
  addTranscriptSegment: (segment: TranscriptSegment) => void;
  setIncomingCall: (data: IncomingCallData | null) => void;
  incrementDuration: () => void;
  resetCall: () => void;
}

export const useVideoCallStore = create<VideoCallState>((set) => ({
  // Call state
  callState: 'idle',
  callType: 'video',
  sessionId: null,
  consultationId: null,
  remoteUserId: null,
  remoteUserName: null,

  // Media
  localStream: null,
  remoteStream: null,
  isMuted: false,
  isVideoOff: false,
  isScreenSharing: false,

  // Transcription
  transcriptionEnabled: false,
  transcriptionLanguage: 'uk',
  transcriptSegments: [],

  // Incoming call
  incomingCall: null,

  // Timer
  callDuration: 0,

  // Actions
  setCallState: (callState) => set({ callState }),
  setCallType: (callType) => set({ callType }),
  setSessionId: (sessionId) => set({ sessionId }),
  setConsultationId: (consultationId) => set({ consultationId }),
  setRemoteUser: (id, name) => set({ remoteUserId: id, remoteUserName: name }),
  setLocalStream: (localStream) => set({ localStream }),
  setRemoteStream: (remoteStream) => set({ remoteStream }),

  toggleMute: () => set((state) => {
    if (state.localStream) {
      state.localStream.getAudioTracks().forEach((track) => {
        track.enabled = state.isMuted;
      });
    }
    return { isMuted: !state.isMuted };
  }),

  toggleVideo: () => set((state) => {
    if (state.localStream) {
      state.localStream.getVideoTracks().forEach((track) => {
        track.enabled = state.isVideoOff;
      });
    }
    return { isVideoOff: !state.isVideoOff };
  }),

  toggleScreenSharing: () => set((state) => ({ isScreenSharing: !state.isScreenSharing })),

  toggleTranscription: () => set((state) => ({ transcriptionEnabled: !state.transcriptionEnabled })),

  setTranscriptionLanguage: (transcriptionLanguage) => set({ transcriptionLanguage }),

  addTranscriptSegment: (segment) => set((state) => {
    const existing = state.transcriptSegments.findIndex((s) => s.id === segment.id);
    if (existing >= 0) {
      const updated = [...state.transcriptSegments];
      updated[existing] = segment;
      return { transcriptSegments: updated };
    }
    return { transcriptSegments: [...state.transcriptSegments, segment] };
  }),

  setIncomingCall: (incomingCall) => set({ incomingCall }),

  incrementDuration: () => set((state) => ({ callDuration: state.callDuration + 1 })),

  resetCall: () => set({
    callState: 'idle',
    callType: 'video',
    sessionId: null,
    remoteUserId: null,
    remoteUserName: null,
    localStream: null,
    remoteStream: null,
    isMuted: false,
    isVideoOff: false,
    isScreenSharing: false,
    transcriptionEnabled: false,
    transcriptSegments: [],
    incomingCall: null,
    callDuration: 0,
  }),
}));

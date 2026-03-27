import { BaseService } from '../base/BaseService';

export interface CallHistoryEntry {
  id: string;
  sessionId: string;
  consultationId: string;
  callerId: string;
  calleeId: string;
  callType: 'video' | 'audio';
  status: string;
  startedAt: string;
  endedAt?: string;
  durationSeconds?: number;
  endReason?: string;
}

export interface CallTranscript {
  sessionId: string;
  segments: {
    id: string;
    speakerId: string;
    speakerName?: string;
    text: string;
    language: string;
    timestampMs: number;
  }[];
}

class VideoCallServiceClass extends BaseService {
  async initiateCall(
    consultationId: string,
    callType: string,
    calleeId: string
  ): Promise<{ sessionId: string }> {
    return this.request(() =>
      this.client.post<{ sessionId: string }>(
        `/api/consultations/${consultationId}/call/initiate`,
        { callType, calleeId }
      )
    );
  }

  async endCall(
    consultationId: string,
    sessionId: string,
    reason: string
  ): Promise<void> {
    return this.requestVoid(() =>
      this.client.post(`/api/consultations/${consultationId}/call/end`, {
        sessionId,
        reason,
      })
    );
  }

  async getIceServers(consultationId: string): Promise<RTCIceServer[]> {
    return this.request(
      () =>
        this.client.get<{ iceServers: RTCIceServer[] }>(
          `/api/consultations/${consultationId}/call/ice-servers`
        ),
      (data) => data.iceServers
    );
  }

  async getCallHistory(consultationId: string): Promise<CallHistoryEntry[]> {
    return this.request(
      () =>
        this.client.get<{ calls: CallHistoryEntry[] }>(
          `/api/consultations/${consultationId}/call/history`
        ),
      (data) => data.calls
    );
  }

  async getTranscript(
    consultationId: string,
    sessionId: string
  ): Promise<CallTranscript> {
    return this.request(() =>
      this.client.get<CallTranscript>(
        `/api/consultations/${consultationId}/call/${sessionId}/transcript`
      )
    );
  }
}

export const videoCallService = new VideoCallServiceClass();

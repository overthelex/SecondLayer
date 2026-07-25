import { WebSocket } from 'ws';
import { logger } from '../utils/logger.js';
import type { VideoCallService } from './video-call-service.js';

export interface DeepgramHandle {
  sendAudio(audioBuffer: Buffer): void;
  stop(): void;
}

interface DeepgramTranscriptResult {
  channel?: {
    alternatives?: Array<{
      transcript?: string;
      confidence?: number;
    }>;
  };
  is_final?: boolean;
  start?: number;
  duration?: number;
}

export type TranscriptCallback = (text: string, isFinal: boolean, timestampMs: number) => void;

export class SttService {
  private activeTranscriptions = new Map<string, DeepgramHandle>();

  constructor(private videoCallService: VideoCallService) {}

  startTranscription(
    sessionId: string,
    speakerId: string,
    language: string,
    onTranscript: TranscriptCallback,
  ): DeepgramHandle {
    const key = `${sessionId}:${speakerId}`;
    const apiKey = process.env.DEEPGRAM_API_KEY;

    if (!apiKey) {
      logger.warn('[SttService] DEEPGRAM_API_KEY not set, returning no-op handle');
      const noopHandle: DeepgramHandle = {
        sendAudio: () => {},
        stop: () => {},
      };
      return noopHandle;
    }

    // Close existing transcription for this speaker if any
    const existing = this.activeTranscriptions.get(key);
    if (existing) {
      existing.stop();
    }

    const lang = language || 'uk';
    const wsUrl = `wss://api.deepgram.com/v1/listen?language=${lang}&model=nova-2&punctuate=true&interim_results=true`;

    const dgWs = new WebSocket(wsUrl, {
      headers: {
        Authorization: `Token ${apiKey}`,
      },
    });

    const MAX_PENDING_BUFFERS = 20;
    let isOpen = false;
    const pendingBuffers: Buffer[] = [];

    dgWs.on('open', () => {
      isOpen = true;
      logger.info('[SttService] Deepgram WebSocket connected', { sessionId, speakerId, language: lang });

      // Send any buffered audio
      for (const buf of pendingBuffers) {
        dgWs.send(buf);
      }
      pendingBuffers.length = 0;
    });

    dgWs.on('message', async (data: Buffer | string) => {
      try {
        const result: DeepgramTranscriptResult = JSON.parse(data.toString());
        const transcript = result.channel?.alternatives?.[0]?.transcript;
        if (transcript && transcript.trim().length > 0) {
          const isFinal = result.is_final ?? false;
          const timestampMs = Date.now();

          // Invoke callback
          onTranscript(transcript, isFinal, timestampMs);

          // Save to database if final
          if (isFinal) {
            try {
              await this.videoCallService.saveTranscriptSegment(
                sessionId,
                speakerId,
                transcript,
                lang,
                true,
                timestampMs,
              );
            } catch (err: any) {
              logger.error('[SttService] Failed to save transcript segment', {
                sessionId,
                speakerId,
                error: err.message,
              });
            }
          }
        }
      } catch (err: any) {
        logger.error('[SttService] Failed to parse Deepgram message', {
          sessionId,
          error: err.message,
        });
      }
    });

    dgWs.on('error', (err) => {
      logger.error('[SttService] Deepgram WebSocket error', {
        sessionId,
        speakerId,
        error: err.message,
      });
    });

    dgWs.on('close', () => {
      isOpen = false;
      this.activeTranscriptions.delete(key);
      logger.info('[SttService] Deepgram WebSocket closed', { sessionId, speakerId });
    });

    const handle: DeepgramHandle = {
      sendAudio(audioBuffer: Buffer): void {
        if (isOpen && dgWs.readyState === WebSocket.OPEN) {
          dgWs.send(audioBuffer);
        } else if (!isOpen) {
          if (pendingBuffers.length >= MAX_PENDING_BUFFERS) {
            pendingBuffers.shift(); // drop oldest chunk
          }
          pendingBuffers.push(audioBuffer);
        }
      },
      stop(): void {
        isOpen = false;
        if (dgWs.readyState === WebSocket.OPEN || dgWs.readyState === WebSocket.CONNECTING) {
          // Send close message to Deepgram
          try {
            dgWs.send(JSON.stringify({ type: 'CloseStream' }));
          } catch {
            // ignore
          }
          dgWs.close();
        }
      },
    };

    this.activeTranscriptions.set(key, handle);
    return handle;
  }

  hasActiveTranscription(sessionId: string, speakerId: string): boolean {
    return this.activeTranscriptions.has(`${sessionId}:${speakerId}`);
  }

  getHandle(sessionId: string, speakerId: string): DeepgramHandle | undefined {
    return this.activeTranscriptions.get(`${sessionId}:${speakerId}`);
  }

  stopTranscription(sessionId: string, speakerId: string): void {
    const key = `${sessionId}:${speakerId}`;
    const handle = this.activeTranscriptions.get(key);
    if (handle) {
      handle.stop();
      this.activeTranscriptions.delete(key);
      logger.info('[SttService] Transcription stopped', { sessionId, speakerId });
    }
  }
}

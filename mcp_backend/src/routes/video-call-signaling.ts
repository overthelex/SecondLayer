import { IncomingMessage } from 'http';
import { Server as WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';
import type { IDatabase } from '../domain/ports/index.js';
import type { IConsultationMessageBus } from '../services/consultation-message-bus.js';
import type { VideoCallService } from '../services/video-call-service.js';
import type { SttService } from '../services/stt-service.js';
import type { Server as HttpServer } from 'http';

interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

async function verifyUserFromToken(
  token: string,
  db: IDatabase,
): Promise<AuthenticatedUser | null> {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;

    const decoded = jwt.verify(token, secret) as any;
    const userId = decoded?.id || decoded?.userId || decoded?.sub;
    if (!userId) return null;

    const result = await db.query(
      'SELECT id, email, name FROM users WHERE id = $1',
      [userId],
    );
    const user = result.rows[0];
    if (!user) return null;

    return { id: String(user.id), email: user.email, name: user.name };
  } catch {
    return null;
  }
}

interface SignalingMessage {
  type: string;
  [key: string]: any;
}

export function attachVideoCallSignaling(
  httpServer: HttpServer,
  db: IDatabase,
  videoCallService: VideoCallService,
  messageBus: IConsultationMessageBus,
  sttService?: SttService,
): void {
  const wss = new WebSocketServer({ noServer: true });

  // Track connected clients: consultationId -> userId -> WebSocket
  const rooms = new Map<string, Map<string, WebSocket>>();

  httpServer.on('upgrade', (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);

    // Only handle our path; let other upgrade handlers (e.g. terminal) handle theirs
    if (url.pathname !== '/api/ws/video-signaling') {
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const consultationId = url.searchParams.get('consultationId');

    if (!token) {
      ws.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
      ws.close(4001, 'No token');
      return;
    }

    if (!consultationId) {
      ws.send(JSON.stringify({ type: 'error', message: 'consultationId is required' }));
      ws.close(4002, 'No consultationId');
      return;
    }

    const user = await verifyUserFromToken(token, db);
    if (!user) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired token' }));
      ws.close(4003, 'Forbidden');
      return;
    }

    const hasAccess = await videoCallService.verifyCallAccess(consultationId, user.id);
    if (!hasAccess) {
      ws.send(JSON.stringify({ type: 'error', message: 'No access to this consultation' }));
      ws.close(4003, 'Forbidden');
      return;
    }

    // Add to room
    if (!rooms.has(consultationId)) {
      rooms.set(consultationId, new Map());
    }
    const room = rooms.get(consultationId)!;
    room.set(user.id, ws);

    logger.info('[VideoSignaling] User connected', {
      userId: user.id,
      consultationId,
    });

    ws.send(JSON.stringify({ type: 'connected', userId: user.id }));

    // Helper: send message to the other party in the room
    function sendToOther(msg: object): void {
      const room = rooms.get(consultationId!);
      if (!room) return;
      for (const [uid, peerWs] of room.entries()) {
        if (uid !== user!.id && peerWs.readyState === WebSocket.OPEN) {
          peerWs.send(JSON.stringify(msg));
        }
      }
    }

    ws.on('message', async (raw: Buffer | string) => {
      let msg: SignalingMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        return;
      }

      try {
        switch (msg.type) {
          case 'call-initiate': {
            const { callType, calleeId } = msg;
            if (!callType || !calleeId) {
              ws.send(JSON.stringify({ type: 'error', message: 'callType and calleeId required' }));
              return;
            }

            // Check for existing active session
            const existing = await videoCallService.getActiveSession(consultationId!);
            if (existing) {
              ws.send(JSON.stringify({ type: 'error', message: 'Active call already exists' }));
              return;
            }

            const session = await videoCallService.createSession(
              consultationId!,
              user!.id,
              calleeId,
              callType,
            );

            // Update status to ringing
            await videoCallService.updateSessionStatus(session.id, 'ringing');

            // Notify caller
            ws.send(JSON.stringify({
              type: 'call-created',
              session,
            }));

            // Notify callee via message bus (they may not be in the WS room yet)
            messageBus.publishUserEvent(calleeId, {
              type: 'new_message',
              consultationId: consultationId!,
              senderId: user!.id,
              senderName: user!.name,
              preview: callType === 'video' ? 'Incoming video call' : 'Incoming audio call',
            });

            // Also forward to callee if they're in the room
            const calleeWs = rooms.get(consultationId!)?.get(calleeId);
            if (calleeWs && calleeWs.readyState === WebSocket.OPEN) {
              calleeWs.send(JSON.stringify({
                type: 'incoming-call',
                session,
                callerName: user!.name,
              }));
            }
            break;
          }

          case 'call-offer': {
            const { sdp, sessionId, fingerprintSig } = msg;
            sendToOther({
              type: 'call-offer',
              sdp,
              sessionId,
              from: user!.id,
              fingerprintSig,
            });
            break;
          }

          case 'call-answer': {
            const { sdp, sessionId, fingerprintSig } = msg;
            sendToOther({
              type: 'call-answer',
              sdp,
              sessionId,
              from: user!.id,
              fingerprintSig,
            });
            break;
          }

          case 'ice-candidate': {
            const { candidate, sessionId } = msg;
            sendToOther({
              type: 'ice-candidate',
              candidate,
              sessionId,
              from: user!.id,
            });
            break;
          }

          case 'call-accept': {
            const { sessionId } = msg;
            if (!sessionId) return;

            await videoCallService.updateSessionStatus(sessionId, 'connected', {
              connected_at: new Date().toISOString(),
            });

            sendToOther({
              type: 'call-accepted',
              sessionId,
              by: user!.id,
            });
            break;
          }

          case 'call-reject': {
            const { sessionId, reason } = msg;
            if (!sessionId) return;

            await videoCallService.updateSessionStatus(sessionId, 'rejected', {
              ended_at: new Date().toISOString(),
              end_reason: reason || 'rejected',
            });

            sendToOther({
              type: 'call-rejected',
              sessionId,
              by: user!.id,
              reason,
            });
            break;
          }

          case 'call-hangup': {
            const { sessionId } = msg;
            if (!sessionId) return;

            await videoCallService.endSession(sessionId, 'hangup');

            sendToOther({
              type: 'call-ended',
              sessionId,
              by: user!.id,
              reason: 'hangup',
            });
            break;
          }

          case 'audio-data': {
            if (!sttService) break;

            const activeSession = await videoCallService.getActiveSession(consultationId!);
            if (!activeSession) break;

            const lang = (msg.language as string) || 'uk';

            // Lazily start transcription for this speaker
            if (!sttService.hasActiveTranscription(activeSession.id, user!.id)) {
              sttService.startTranscription(
                activeSession.id,
                user!.id,
                lang,
                (text: string, isFinal: boolean, timestampMs: number) => {
                  // Forward transcript to both parties
                  const transcriptMsg = {
                    type: 'transcription',
                    sessionId: activeSession.id,
                    speakerId: user!.id,
                    speakerName: user!.name,
                    segmentId: `${activeSession.id}-${user!.id}-${timestampMs}`,
                    text,
                    language: lang,
                    isFinal,
                    timestampMs,
                  };

                  // Send to caller
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(transcriptMsg));
                  }
                  // Send to other party
                  sendToOther(transcriptMsg);
                },
              );
            }

            // Decode base64 audio and forward to Deepgram
            try {
              const audioBuffer = Buffer.from(msg.audio as string, 'base64');
              const handle = sttService.getHandle(activeSession.id, user!.id);
              if (handle) {
                handle.sendAudio(audioBuffer);
              }
            } catch {
              // ignore decode errors
            }
            break;
          }

          case 'transcript': {
            const { sessionId, text, language, isFinal, timestampMs } = msg;
            if (!sessionId || !text) return;

            await videoCallService.saveTranscriptSegment(
              sessionId,
              user!.id,
              text,
              language || 'uk',
              isFinal ?? false,
              timestampMs ?? Date.now(),
            );

            // Forward transcript to the other party
            sendToOther({
              type: 'transcript',
              sessionId,
              speakerId: user!.id,
              speakerName: user!.name,
              text,
              language: language || 'uk',
              isFinal: isFinal ?? false,
              timestampMs: timestampMs ?? Date.now(),
            });
            break;
          }

          default:
            ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
        }
      } catch (err: any) {
        logger.error('[VideoSignaling] Error handling message', {
          type: msg.type,
          userId: user!.id,
          error: err.message,
        });
        ws.send(JSON.stringify({ type: 'error', message: 'Internal error' }));
      }
    });

    ws.on('close', async () => {
      logger.info('[VideoSignaling] User disconnected', {
        userId: user.id,
        consultationId,
      });

      // Remove from room
      const room = rooms.get(consultationId!);
      if (room) {
        room.delete(user.id);
        if (room.size === 0) {
          rooms.delete(consultationId!);
        }
      }

      // Stop any active STT transcription for this user
      try {
        const sessionForStt = await videoCallService.getActiveSession(consultationId!);
        if (sessionForStt && sttService) {
          sttService.stopTranscription(sessionForStt.id, user.id);
        }
      } catch {
        // ignore
      }

      // End any active session this user was in
      try {
        const activeSession = await videoCallService.getActiveSession(consultationId!);
        if (
          activeSession &&
          (activeSession.caller_id === user.id || activeSession.callee_id === user.id)
        ) {
          await videoCallService.endSession(activeSession.id, 'disconnect');

          // Notify the other party
          const otherUserId =
            activeSession.caller_id === user.id
              ? activeSession.callee_id
              : activeSession.caller_id;
          const otherWs = rooms.get(consultationId!)?.get(otherUserId);
          if (otherWs && otherWs.readyState === WebSocket.OPEN) {
            otherWs.send(
              JSON.stringify({
                type: 'call-ended',
                sessionId: activeSession.id,
                by: user.id,
                reason: 'disconnect',
              }),
            );
          }
        }
      } catch (err: any) {
        logger.error('[VideoSignaling] Error cleaning up on disconnect', {
          userId: user.id,
          error: err.message,
        });
      }
    });

    ws.on('error', (err) => {
      logger.error('[VideoSignaling] WebSocket error', {
        userId: user.id,
        consultationId,
        error: err.message,
      });
    });
  });

  logger.info('[VideoSignaling] WebSocket server attached at /api/ws/video-signaling');
}

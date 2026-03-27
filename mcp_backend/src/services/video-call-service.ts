import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type { IDatabase } from '../domain/ports/index.js';
import type { IConsultationMessageBus } from './consultation-message-bus.js';
import { logger } from '../utils/logger.js';

export interface VideoCallSession {
  id: string;
  consultation_id: string;
  caller_id: string;
  callee_id: string;
  call_type: 'video' | 'audio';
  status: 'pending' | 'ringing' | 'connected' | 'ended' | 'missed' | 'rejected';
  started_at: string;
  connected_at?: string;
  ended_at?: string;
  duration_seconds?: number;
  end_reason?: string;
  created_at: string;
}

export interface TranscriptSegment {
  id: string;
  session_id: string;
  speaker_id: string;
  text: string;
  language: string;
  is_final: boolean;
  timestamp_ms: number;
  created_at: string;
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export class VideoCallService {
  constructor(
    private db: IDatabase,
    private messageBus: IConsultationMessageBus,
  ) {}

  async createSession(
    consultationId: string,
    callerId: string,
    calleeId: string,
    callType: 'video' | 'audio',
  ): Promise<VideoCallSession> {
    const id = uuidv4();
    const result = await this.db.query(
      `INSERT INTO video_call_sessions (id, consultation_id, caller_id, callee_id, call_type, status, started_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
       RETURNING *`,
      [id, consultationId, callerId, calleeId, callType],
    );
    const session = result.rows[0] as VideoCallSession;
    logger.info('[VideoCallService] Session created', {
      sessionId: id,
      consultationId,
      callType,
    });
    return session;
  }

  async updateSessionStatus(
    sessionId: string,
    status: string,
    extras?: { connected_at?: string; ended_at?: string; duration_seconds?: number; end_reason?: string },
  ): Promise<VideoCallSession> {
    const setClauses: string[] = ['status = $2'];
    const params: any[] = [sessionId, status];
    let paramIndex = 3;

    if (extras?.connected_at) {
      setClauses.push(`connected_at = $${paramIndex}`);
      params.push(extras.connected_at);
      paramIndex++;
    }
    if (extras?.ended_at) {
      setClauses.push(`ended_at = $${paramIndex}`);
      params.push(extras.ended_at);
      paramIndex++;
    }
    if (extras?.duration_seconds !== undefined) {
      setClauses.push(`duration_seconds = $${paramIndex}`);
      params.push(extras.duration_seconds);
      paramIndex++;
    }
    if (extras?.end_reason) {
      setClauses.push(`end_reason = $${paramIndex}`);
      params.push(extras.end_reason);
      paramIndex++;
    }

    const result = await this.db.query(
      `UPDATE video_call_sessions SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      params,
    );
    return result.rows[0] as VideoCallSession;
  }

  async endSession(sessionId: string, endReason: string): Promise<VideoCallSession> {
    const session = await this.getSessionById(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const endedAt = new Date().toISOString();
    let durationSeconds: number | undefined;

    if (session.connected_at) {
      const connectedTime = new Date(session.connected_at).getTime();
      const endedTime = new Date(endedAt).getTime();
      durationSeconds = Math.round((endedTime - connectedTime) / 1000);
    }

    return this.updateSessionStatus(sessionId, 'ended', {
      ended_at: endedAt,
      duration_seconds: durationSeconds,
      end_reason: endReason,
    });
  }

  async getActiveSession(consultationId: string): Promise<VideoCallSession | null> {
    const result = await this.db.query(
      `SELECT * FROM video_call_sessions
       WHERE consultation_id = $1 AND status IN ('pending', 'ringing', 'connected')
       ORDER BY created_at DESC LIMIT 1`,
      [consultationId],
    );
    return (result.rows[0] as VideoCallSession) || null;
  }

  async getSessionById(sessionId: string): Promise<VideoCallSession | null> {
    const result = await this.db.query(
      'SELECT * FROM video_call_sessions WHERE id = $1',
      [sessionId],
    );
    return (result.rows[0] as VideoCallSession) || null;
  }

  async getCallHistory(consultationId: string, limit = 50): Promise<VideoCallSession[]> {
    const result = await this.db.query(
      `SELECT * FROM video_call_sessions
       WHERE consultation_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [consultationId, limit],
    );
    return result.rows as VideoCallSession[];
  }

  getIceServers(): IceServerConfig[] {
    const stunUrl = process.env.STUN_SERVER_URL || 'stun:stun.l.google.com:19302';
    const turnUrl = process.env.TURN_SERVER_URL;
    const turnSecret = process.env.TURN_SHARED_SECRET;

    const servers: IceServerConfig[] = [{ urls: stunUrl }];

    if (turnUrl && turnSecret) {
      // Generate time-limited TURN credentials (valid for 24 hours)
      const ttl = 86400;
      const timestamp = Math.floor(Date.now() / 1000) + ttl;
      const randomPart = crypto.randomBytes(8).toString('hex');
      const username = `${timestamp}:${randomPart}`;
      const credential = crypto
        .createHmac('sha1', turnSecret)
        .update(username)
        .digest('base64');

      servers.push({
        urls: turnUrl,
        username,
        credential,
      });
    }

    return servers;
  }

  async saveTranscriptSegment(
    sessionId: string,
    speakerId: string,
    text: string,
    language: string,
    isFinal: boolean,
    timestampMs: number,
  ): Promise<TranscriptSegment> {
    const id = uuidv4();
    const result = await this.db.query(
      `INSERT INTO call_transcripts (id, session_id, speaker_id, text, language, is_final, timestamp_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, sessionId, speakerId, text, language, isFinal, timestampMs],
    );
    return result.rows[0] as TranscriptSegment;
  }

  async getTranscript(sessionId: string): Promise<TranscriptSegment[]> {
    const result = await this.db.query(
      `SELECT * FROM call_transcripts
       WHERE session_id = $1
       ORDER BY timestamp_ms ASC`,
      [sessionId],
    );
    return result.rows as TranscriptSegment[];
  }

  async verifyCallAccess(consultationId: string, userId: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT id FROM consultations
       WHERE id = $1 AND (client_user_id = $2 OR attorney_user_id = $2)`,
      [consultationId, userId],
    );
    return result.rows.length > 0;
  }
}

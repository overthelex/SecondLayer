import { logger } from '../utils/logger.js';
import { MinioService } from './minio-service.js';

interface IDatabase {
  query(text: string, params?: any[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export interface SessionRecordingMeta {
  id: string;
  user_id: string;
  session_id: string;
  started_at: string;
  ended_at: string | null;
  chunk_count: number;
  event_count: number;
  total_size_bytes: number;
  user_agent: string | null;
  viewport: string | null;
  ip_address: string | null;
  // Joined from users table
  user_email?: string;
  user_name?: string;
}

export interface SessionChunkMeta {
  id: string;
  recording_id: string;
  chunk_index: number;
  minio_key: string;
  event_count: number;
  size_bytes: number;
  first_timestamp: number;
  last_timestamp: number;
}

export interface ServerLogEntry {
  id: number;
  session_id: string;
  user_id: string;
  timestamp: string;
  log_type: string;
  method: string | null;
  path: string | null;
  status_code: number | null;
  duration_ms: number | null;
  request_body: any;
  response_summary: any;
  error_message: string | null;
}

export class SessionReplayService {
  constructor(
    private db: IDatabase,
    private minio: MinioService
  ) {}

  /**
   * Create a new recording session
   */
  async createSession(
    userId: string,
    sessionId: string,
    userAgent?: string,
    viewport?: string,
    ip?: string
  ): Promise<SessionRecordingMeta> {
    const result = await this.db.query(
      `INSERT INTO session_recordings (user_id, session_id, user_agent, viewport, ip_address)
       VALUES ($1, $2, $3, $4, $5::inet)
       ON CONFLICT (session_id) DO UPDATE SET started_at = NOW()
       RETURNING *`,
      [userId, sessionId, userAgent || null, viewport || null, ip || null]
    );
    logger.info('[SessionReplay] Session created', { userId, sessionId });
    return result.rows[0];
  }

  /**
   * Store a chunk of rrweb events in MinIO
   */
  async storeChunk(
    userId: string,
    sessionId: string,
    chunkIndex: number,
    events: any[]
  ): Promise<SessionChunkMeta> {
    // Find recording
    const recording = await this.db.query(
      'SELECT id FROM session_recordings WHERE session_id = $1 AND user_id = $2',
      [sessionId, userId]
    );
    if (recording.rows.length === 0) {
      throw new Error(`Recording not found: ${sessionId}`);
    }
    const recordingId = recording.rows[0].id;

    // Serialize events and upload to MinIO
    const buffer = Buffer.from(JSON.stringify(events));
    const objectKey = `session-replay/${sessionId}/${chunkIndex}.json`;

    await this.minio.uploadBuffer(userId, objectKey, buffer, 'application/json');

    // Get timestamps from events
    const timestamps = events.map((e: any) => e.timestamp).filter(Boolean);
    const firstTimestamp = timestamps.length > 0 ? Math.min(...timestamps) : 0;
    const lastTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : 0;

    // Insert chunk metadata
    const result = await this.db.query(
      `INSERT INTO session_recording_chunks
       (recording_id, chunk_index, minio_key, event_count, size_bytes, first_timestamp, last_timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (recording_id, chunk_index) DO UPDATE SET
         minio_key = EXCLUDED.minio_key,
         event_count = EXCLUDED.event_count,
         size_bytes = EXCLUDED.size_bytes,
         first_timestamp = EXCLUDED.first_timestamp,
         last_timestamp = EXCLUDED.last_timestamp
       RETURNING *`,
      [recordingId, chunkIndex, objectKey, events.length, buffer.length, firstTimestamp, lastTimestamp]
    );

    // Update recording counters
    await this.db.query(
      `UPDATE session_recordings SET
         chunk_count = chunk_count + 1,
         event_count = event_count + $1,
         total_size_bytes = total_size_bytes + $2
       WHERE id = $3`,
      [events.length, buffer.length, recordingId]
    );

    logger.debug('[SessionReplay] Chunk stored', {
      sessionId, chunkIndex, eventCount: events.length, sizeBytes: buffer.length,
    });

    return result.rows[0];
  }

  /**
   * Mark session as ended
   */
  async endSession(sessionId: string): Promise<void> {
    await this.db.query(
      'UPDATE session_recordings SET ended_at = NOW() WHERE session_id = $1',
      [sessionId]
    );
    logger.info('[SessionReplay] Session ended', { sessionId });
  }

  /**
   * Log a server-side event correlated with a session
   */
  async logServerEvent(
    sessionId: string,
    userId: string,
    logType: string,
    data: {
      method?: string;
      path?: string;
      statusCode?: number;
      durationMs?: number;
      requestBody?: any;
      responseSummary?: any;
      errorMessage?: string;
    }
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO session_server_logs
       (session_id, user_id, log_type, method, path, status_code, duration_ms, request_body, response_summary, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        sessionId, userId, logType,
        data.method || null, data.path || null, data.statusCode || null,
        data.durationMs || null, data.requestBody || null,
        data.responseSummary || null, data.errorMessage || null,
      ]
    );
  }

  // ====== Admin methods ======

  /**
   * List all sessions (admin) with user info
   */
  async listSessions(filters: {
    userId?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ sessions: SessionRecordingMeta[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.userId) {
      conditions.push(`sr.user_id = $${paramIndex++}`);
      params.push(filters.userId);
    }
    if (filters.from) {
      conditions.push(`sr.started_at >= $${paramIndex++}`);
      params.push(filters.from);
    }
    if (filters.to) {
      conditions.push(`sr.started_at <= $${paramIndex++}`);
      params.push(filters.to);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const countResult = await this.db.query(
      `SELECT COUNT(*) as total FROM session_recordings sr ${where}`,
      params
    );

    const result = await this.db.query(
      `SELECT sr.*, u.email as user_email, u.name as user_name
       FROM session_recordings sr
       LEFT JOIN users u ON u.id = sr.user_id
       ${where}
       ORDER BY sr.started_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    return {
      sessions: result.rows,
      total: parseInt(countResult.rows[0].total, 10),
    };
  }

  /**
   * Get single session metadata
   */
  async getSession(sessionId: string): Promise<{
    recording: SessionRecordingMeta;
    chunks: SessionChunkMeta[];
  } | null> {
    const recordingResult = await this.db.query(
      `SELECT sr.*, u.email as user_email, u.name as user_name
       FROM session_recordings sr
       LEFT JOIN users u ON u.id = sr.user_id
       WHERE sr.session_id = $1`,
      [sessionId]
    );
    if (recordingResult.rows.length === 0) return null;

    const chunksResult = await this.db.query(
      `SELECT * FROM session_recording_chunks
       WHERE recording_id = $1
       ORDER BY chunk_index ASC`,
      [recordingResult.rows[0].id]
    );

    return {
      recording: recordingResult.rows[0],
      chunks: chunksResult.rows,
    };
  }

  /**
   * Get all events for a session (concatenated from all chunks)
   */
  async getSessionEvents(sessionId: string): Promise<any[]> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    const allEvents: any[] = [];
    for (const chunk of session.chunks) {
      const buffer = await this.minio.getFileBuffer(
        session.recording.user_id,
        chunk.minio_key
      );
      const events = JSON.parse(buffer.toString('utf-8'));
      allEvents.push(...events);
    }

    // Sort by timestamp
    allEvents.sort((a, b) => a.timestamp - b.timestamp);
    return allEvents;
  }

  /**
   * Get server logs correlated with a session
   */
  async getSessionLogs(sessionId: string): Promise<ServerLogEntry[]> {
    const result = await this.db.query(
      `SELECT * FROM session_server_logs
       WHERE session_id = $1
       ORDER BY timestamp ASC`,
      [sessionId]
    );
    return result.rows;
  }

  /**
   * Get server logs from cost_tracking correlated by user+time range
   */
  async getCorrelatedCostLogs(sessionId: string): Promise<any[]> {
    const recording = await this.db.query(
      'SELECT user_id, started_at, ended_at FROM session_recordings WHERE session_id = $1',
      [sessionId]
    );
    if (recording.rows.length === 0) return [];

    const { user_id, started_at, ended_at } = recording.rows[0];
    const endTime = ended_at || 'NOW()';

    const result = await this.db.query(
      `SELECT tool_name, user_query, execution_time_ms, status, total_cost_usd, created_at
       FROM cost_tracking
       WHERE user_id = $1 AND created_at >= $2 AND created_at <= $3
       ORDER BY created_at ASC`,
      [user_id, started_at, ended_at || new Date()]
    );
    return result.rows;
  }
}

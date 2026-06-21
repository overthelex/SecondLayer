import crypto from 'crypto';
import type { IDatabase } from '../domain/ports/index.js';
import { logger } from '../utils/logger.js';

export type ShareScope = 'conversation' | 'message';

/** One message frozen into a share snapshot. */
export interface SharedMessage {
  role: 'user' | 'assistant';
  content: string;
  decisions?: any[];
  citations?: any[];
  documents?: any[];
}

export interface ShareSnapshot {
  messages: SharedMessage[];
}

export interface CreateShareInput {
  scope: ShareScope;
  title?: string;
  snapshot: ShareSnapshot;
  conversationId?: string | null;
}

export interface ShareRecord {
  token: string;
  scope: ShareScope;
  title: string | null;
  snapshot: ShareSnapshot;
  shared_by_name: string | null;
  created_at: Date;
}

export interface ShareSummary {
  token: string;
  scope: ShareScope;
  title: string | null;
  view_count: number;
  created_at: Date;
}

// Guard against storing pathologically large snapshots.
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_MESSAGES = 200;

export class ShareService {
  constructor(private db: IDatabase) {}

  private generateToken(): string {
    // URL-safe, unguessable (128 bits of entropy).
    return crypto.randomBytes(16).toString('base64url');
  }

  async createShare(userId: string, input: CreateShareInput): Promise<{ token: string }> {
    const scope: ShareScope = input.scope === 'message' ? 'message' : 'conversation';

    const messages = Array.isArray(input.snapshot?.messages) ? input.snapshot.messages : [];
    if (messages.length === 0) {
      throw new Error('Nothing to share: snapshot has no messages');
    }
    if (messages.length > MAX_MESSAGES) {
      throw new Error('Too many messages to share');
    }

    const snapshot: ShareSnapshot = {
      messages: messages.map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: typeof m.content === 'string' ? m.content : '',
        decisions: Array.isArray(m.decisions) ? m.decisions : undefined,
        citations: Array.isArray(m.citations) ? m.citations : undefined,
        documents: Array.isArray(m.documents) ? m.documents : undefined,
      })),
    };

    const snapshotJson = JSON.stringify(snapshot);
    if (Buffer.byteLength(snapshotJson, 'utf8') > MAX_SNAPSHOT_BYTES) {
      throw new Error('Shared content is too large');
    }

    const title = (input.title || '').toString().slice(0, 300) || null;
    const token = this.generateToken();

    await this.db.query(
      `INSERT INTO conversation_shares (token, conversation_id, shared_by, scope, title, snapshot)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [token, input.conversationId || null, userId, scope, title, snapshotJson]
    );

    logger.info('[Shares] Created share', { userId, scope, token });
    return { token };
  }

  /** Fetch a share by token and increment its view counter. Returns null if missing/revoked. */
  async getShare(token: string): Promise<ShareRecord | null> {
    const result = await this.db.query<{
      token: string;
      scope: ShareScope;
      title: string | null;
      snapshot: ShareSnapshot;
      shared_by_name: string | null;
      created_at: Date;
    }>(
      `SELECT s.token, s.scope, s.title, s.snapshot, s.created_at, u.name AS shared_by_name
       FROM conversation_shares s
       LEFT JOIN users u ON u.id = s.shared_by
       WHERE s.token = $1 AND s.revoked_at IS NULL`,
      [token]
    );
    const row = result.rows[0];
    if (!row) return null;

    // Fire-and-forget view count bump.
    this.db.query(
      `UPDATE conversation_shares SET view_count = view_count + 1 WHERE token = $1`,
      [token]
    ).catch(() => {});

    return row;
  }

  async listShares(userId: string): Promise<ShareSummary[]> {
    const result = await this.db.query<ShareSummary>(
      `SELECT token, scope, title, view_count, created_at
       FROM conversation_shares
       WHERE shared_by = $1 AND revoked_at IS NULL
       ORDER BY created_at DESC
       LIMIT 200`,
      [userId]
    );
    return result.rows;
  }

  async revokeShare(userId: string, token: string): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE conversation_shares SET revoked_at = NOW()
       WHERE token = $1 AND shared_by = $2 AND revoked_at IS NULL
       RETURNING token`,
      [token, userId]
    );
    return result.rows.length > 0;
  }
}

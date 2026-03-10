import type { IDatabase } from '../domain/ports/index.js';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  client_id?: string;
  matter_id?: string;
  created_at: Date;
  updated_at: Date;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking_steps?: any[];
  decisions?: any[];
  citations?: any[];
  documents?: any[];
  tool_calls?: any[];
  cost_tracking_id?: string;
  cost_summary?: { total_cost_usd: number; tools_used: string[] } | null;
  created_at: Date;
}

export class ConversationService {
  constructor(private db: IDatabase) {}

  async createConversation(
    userId: string,
    title?: string,
    options?: { clientId?: string; matterId?: string; requestId?: string }
  ): Promise<Conversation> {
    const id = uuidv4();
    const result = await this.db.query(
      `INSERT INTO conversations (id, user_id, title, client_id, matter_id, request_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, userId, title || 'Нова розмова', options?.clientId || null, options?.matterId || null, options?.requestId || null]
    );
    return result.rows[0];
  }

  async updateRequestId(conversationId: string, requestId: string): Promise<void> {
    await this.db.query(
      'UPDATE conversations SET request_id = $1 WHERE id = $2',
      [requestId, conversationId]
    );
  }

  async listConversations(
    userId: string,
    options: { limit?: number; offset?: number; matterId?: string } = {}
  ): Promise<{ conversations: Conversation[]; total: number }> {
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const ownershipCondition = `(user_id = $1 OR (matter_id IS NOT NULL AND EXISTS (SELECT 1 FROM matter_team WHERE matter_id = conversations.matter_id AND user_id = $1 AND removed_at IS NULL)))`;
    const conditions = [ownershipCondition];
    const params: any[] = [userId];
    let paramIndex = 2;

    if (options.matterId) {
      conditions.push(`matter_id = $${paramIndex++}`);
      params.push(options.matterId);
    }

    const where = conditions.join(' AND ');

    const [result, countResult] = await Promise.all([
      this.db.query(
        `SELECT * FROM conversations
         WHERE ${where}
         ORDER BY updated_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      ),
      this.db.query(
        `SELECT COUNT(*) FROM conversations WHERE ${where}`,
        params
      ),
    ]);

    return {
      conversations: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
    };
  }

  async getConversation(conversationId: string, userId: string): Promise<Conversation | null> {
    const result = await this.db.query(
      `SELECT * FROM conversations WHERE id = $1
       AND (user_id = $2 OR (matter_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM matter_team WHERE matter_id = conversations.matter_id AND user_id = $2 AND removed_at IS NULL
       )))`,
      [conversationId, userId]
    );
    return result.rows[0] || null;
  }

  async addMessage(
    conversationId: string,
    userId: string,
    message: {
      role: 'user' | 'assistant';
      content: string;
      thinking_steps?: any[];
      decisions?: any[];
      citations?: any[];
      documents?: any[];
      tool_calls?: any[];
      cost_tracking_id?: string;
      cost_summary?: { total_cost_usd: number; tools_used: string[] } | null;
    }
  ): Promise<ConversationMessage | null> {
    // Verify ownership
    const conv = await this.getConversation(conversationId, userId);
    if (!conv) return null;

    const id = uuidv4();
    const result = await this.db.query(
      `INSERT INTO conversation_messages
         (id, conversation_id, role, content, thinking_steps, decisions, citations, documents, tool_calls, cost_tracking_id, cost_summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        id,
        conversationId,
        message.role,
        message.content,
        message.thinking_steps ? JSON.stringify(message.thinking_steps) : null,
        message.decisions ? JSON.stringify(message.decisions) : null,
        message.citations ? JSON.stringify(message.citations) : null,
        message.documents ? JSON.stringify(message.documents) : null,
        message.tool_calls ? JSON.stringify(message.tool_calls) : null,
        message.cost_tracking_id || null,
        message.cost_summary ? JSON.stringify(message.cost_summary) : null,
      ]
    );

    // Update conversation timestamp
    await this.db.query(
      `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
      [conversationId]
    );

    return result.rows[0];
  }

  async getMessages(
    conversationId: string,
    userId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<ConversationMessage[]> {
    // Verify ownership
    const conv = await this.getConversation(conversationId, userId);
    if (!conv) return [];

    const limit = options.limit || 100;
    const offset = options.offset || 0;

    const result = await this.db.query(
      `SELECT * FROM conversation_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT $2 OFFSET $3`,
      [conversationId, limit, offset]
    );
    return result.rows;
  }

  async updateTitle(conversationId: string, userId: string, title: string): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE conversations SET title = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING id`,
      [title, conversationId, userId]
    );
    return result.rows.length > 0;
  }

  async deleteConversation(conversationId: string, userId: string): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM conversations WHERE id = $1 AND user_id = $2 RETURNING id`,
      [conversationId, userId]
    );
    return result.rows.length > 0;
  }

  async deleteAllConversations(userId: string): Promise<number> {
    const result = await this.db.query(
      `DELETE FROM conversations WHERE user_id = $1`,
      [userId]
    );
    return result.rowCount || 0;
  }
}

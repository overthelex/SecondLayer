/**
 * Conversation Service - HTTP client for server-side chat persistence
 */

import { BaseService } from '../base/BaseService';

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking_steps?: any[];
  decisions?: any[];
  citations?: any[];
  tool_calls?: any[];
  cost_tracking_id?: string;
  created_at: string;
}

export interface ConversationWithMessages extends Conversation {
  messages: ConversationMessage[];
}

export class ConversationService extends BaseService {
  async create(title?: string): Promise<Conversation> {
    return this.request(() => this.client.post<Conversation>('/api/conversations', { title }));
  }

  async list(params?: { limit?: number; offset?: number }): Promise<{
    conversations: Conversation[];
    total: number;
  }> {
    return this.request(() => this.client.get('/api/conversations', { params }));
  }

  async get(id: string): Promise<ConversationWithMessages> {
    return this.request(() => this.client.get<ConversationWithMessages>(`/api/conversations/${id}`));
  }

  async rename(id: string, title: string): Promise<void> {
    return this.requestVoid(() => this.client.put(`/api/conversations/${id}`, { title }));
  }

  async delete(id: string): Promise<void> {
    return this.requestVoid(() => this.client.delete(`/api/conversations/${id}`));
  }

  async addMessage(
    conversationId: string,
    message: {
      role: 'user' | 'assistant';
      content: string;
      thinking_steps?: any[];
      decisions?: any[];
      citations?: any[];
      documents?: any[];
      tool_calls?: any[];
      cost_tracking_id?: string;
      cost_summary?: any;
    }
  ): Promise<ConversationMessage> {
    return this.request(() => this.client.post<ConversationMessage>(
      `/api/conversations/${conversationId}/messages`,
      message
    ));
  }

}

export const conversationService = new ConversationService();

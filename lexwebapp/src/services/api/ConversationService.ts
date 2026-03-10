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

export interface ConversationThinkingStep {
  tool?: string;
  result?: unknown;
}

export interface ConversationDecision {
  id?: string;
  number?: string;
  court?: string;
  date?: string;
  summary?: string;
  relevance?: number;
  status?: string;
  externalUrl?: string;
}

export interface ConversationCitation {
  text?: string;
  source?: string;
}

export interface ConversationToolCall {
  tool: string;
  params?: Record<string, unknown>;
  result?: unknown;
}

export interface ConversationCostSummary {
  tools_used?: string[];
  total_cost_usd?: number;
  charged_usd?: number;
  balance_usd?: number | null;
  response_id?: string;
}

export interface ConversationDocument {
  id: string;
  title: string;
  type: string;
  uploadedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  thinking_steps?: ConversationThinkingStep[];
  decisions?: ConversationDecision[];
  citations?: ConversationCitation[];
  tool_calls?: ConversationToolCall[];
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
      thinking_steps?: ConversationThinkingStep[];
      decisions?: ConversationDecision[];
      citations?: ConversationCitation[];
      documents?: ConversationDocument[];
      tool_calls?: ConversationToolCall[];
      cost_tracking_id?: string;
      cost_summary?: ConversationCostSummary;
    }
  ): Promise<ConversationMessage> {
    return this.request(() => this.client.post<ConversationMessage>(
      `/api/conversations/${conversationId}/messages`,
      message
    ));
  }

}

export const conversationService = new ConversationService();

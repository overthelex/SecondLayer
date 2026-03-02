/**
 * MCP Service
 * Service for calling all 43 MCP tools (sync + streaming)
 * Supports mcp_backend, mcp_rada, and mcp_openreyestr tools
 */

import { BaseService } from '../base/BaseService';
import { SSEClient } from './SSEClient';
import { getErrorMessage, isAbortError } from '../../utils/errors';
import { transformToolResultToMessage } from './mcp/response-transformers';
import type { Message } from '../../types/models';
import { StreamingCallbacks } from '../../types/api/sse';

export interface CitationWarning {
  case_number: string;
  status: 'explicitly_overruled' | 'limited';
  confidence: number;
  affecting_decisions: Array<{ doc_id: string; instance: string; court: string; date?: string; outcome: string; effect: string }>;
  message: string;
}

export interface ChatStreamCallbacks {
  onResponseId?: (data: { response_id: string }) => void;
  onPlan?: (data: { goal: string; steps: Array<{ id: number; tool: string; params: Record<string, any>; purpose: string; depends_on?: number[] }>; expected_iterations: number }) => void;
  onThinking?: (data: { step: number; tool: string; params: any; description?: string; cost_usd?: number }) => void;
  onToolResult?: (data: { tool: string; result: any; cost_usd?: number }) => void;
  onAnswerDelta?: (data: { text: string }) => void;
  onAnswer?: (data: { text: string; provider: string; model: string }) => void;
  onCitationWarning?: (data: CitationWarning) => void;
  onComplete?: (data: { iterations: number; elapsed_ms: number; tools_used?: string[]; total_cost_usd?: number; charged_usd?: number; response_id?: string; conversationId?: string }) => void;
  onCostSummary?: (data: { total_cost_usd: number; charged_usd: number; balance_usd: number | null }) => void;
  onBudgetEscalated?: (data: { reason: string; estimatedCost: { minUsd: number; maxUsd: number } }) => void;
  onError?: (data: { message: string }) => void;
}

export class MCPService extends BaseService {
  private readonly API_URL: string;
  private readonly API_KEY: string;
  private readonly sseClient: SSEClient;
  private readonly enableSSE: boolean;

  constructor() {
    super();
    const baseUrl = import.meta.env.VITE_API_URL || 'https://stage.legal.org.ua';
    this.API_URL = `${baseUrl}/api`;
    this.API_KEY =
      import.meta.env.VITE_API_KEY ||
      'REDACTED_SL_KEY_STAGE';
    this.enableSSE =
      import.meta.env.VITE_ENABLE_SSE_STREAMING !== 'false';
    this.sseClient = new SSEClient(this.API_URL, this.API_KEY);
  }

  private getAuthToken(): string {
    return localStorage.getItem('auth_token') || this.API_KEY;
  }

  // ============================================================================
  // Universal Tool Methods
  // ============================================================================

  async callTool(toolName: string, params: any): Promise<any> {
    try {
      const response = await fetch(`${this.API_URL}/tools/${toolName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.getAuthToken()}`,
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error: unknown) {
      console.error(`Tool ${toolName} error:`, error);
      throw error;
    }
  }

  async streamTool(
    toolName: string,
    params: any,
    callbacks: StreamingCallbacks
  ): Promise<AbortController> {
    if (!this.enableSSE) {
      try {
        const result = await this.callTool(toolName, params);
        callbacks.onComplete?.({ result });
        callbacks.onEnd?.();
      } catch (error: unknown) {
        callbacks.onError?.({ message: getErrorMessage(error), error });
      }
      return new AbortController();
    }

    return this.sseClient.streamToolWithRetry(toolName, params, callbacks, this.getAuthToken());
  }

  // ============================================================================
  // Chat Streaming
  // ============================================================================

  async requestPlan(
    query: string,
    budget: string = 'standard'
  ): Promise<{ plan: import('../../types/models/Message').ExecutionPlan | null; planSessionId: string | null }> {
    const response = await fetch(`${this.API_URL}/chat/plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.getAuthToken()}`,
      },
      body: JSON.stringify({ query, budget }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Plan request failed: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  async streamChat(
    query: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    callbacks: ChatStreamCallbacks,
    budget: string = 'standard',
    conversationId?: string,
    approvedPlan?: import('../../types/models/Message').ExecutionPlan,
    planSessionId?: string
  ): Promise<AbortController> {
    const controller = new AbortController();

    try {
      const response = await fetch(`${this.API_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.getAuthToken()}`,
        },
        body: JSON.stringify({ query, history, budget, conversationId, approvedPlan, planSessionId }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        callbacks.onError?.({ message: `API Error: ${response.status} - ${errorText}` });
        return controller;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        callbacks.onError?.({ message: 'No response body' });
        return controller;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      const processEvents = async () => {
        let currentEvent = '';
        let currentData = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith(':')) continue;

              if (line.startsWith('event: ')) {
                currentEvent = line.slice(7).trim();
              } else if (line.startsWith('data: ')) {
                currentData = line.slice(6);
              } else if (line === '' && currentEvent && currentData) {
                try {
                  const data = JSON.parse(currentData);
                  this.dispatchChatEvent(currentEvent, data, callbacks);
                } catch {
                  // skip malformed JSON
                }
                currentEvent = '';
                currentData = '';
              }
            }
          }
        } catch (err: unknown) {
          if (!isAbortError(err)) {
            callbacks.onError?.({ message: getErrorMessage(err) });
          }
        }
      };

      processEvents();
    } catch (err: unknown) {
      if (!isAbortError(err)) {
        callbacks.onError?.({ message: getErrorMessage(err) });
      }
    }

    return controller;
  }

  private dispatchChatEvent(event: string, data: any, callbacks: ChatStreamCallbacks) {
    switch (event) {
      case 'response_id': callbacks.onResponseId?.(data); break;
      case 'plan': callbacks.onPlan?.(data); break;
      case 'thinking': callbacks.onThinking?.(data); break;
      case 'tool_result': callbacks.onToolResult?.(data); break;
      case 'answer_delta': callbacks.onAnswerDelta?.(data); break;
      case 'answer': callbacks.onAnswer?.(data); break;
      case 'citation_warning': callbacks.onCitationWarning?.(data); break;
      case 'complete': callbacks.onComplete?.(data); break;
      case 'cost_summary': callbacks.onCostSummary?.(data); break;
      case 'budget_escalated': callbacks.onBudgetEscalated?.(data); break;
      case 'error': callbacks.onError?.(data); break;
    }
  }

  // ============================================================================
  // Response Parsing (delegates to extracted module)
  // ============================================================================

  transformToolResultToMessage(toolName: string, result: any): Message {
    return transformToolResultToMessage(toolName, result);
  }
}

// Export singleton instance
export const mcpService = new MCPService();

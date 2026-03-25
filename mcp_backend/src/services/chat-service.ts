// Proprietary implementation: @secondlayer/core (private repo)

export interface ChatRequest {
  query: string;
  conversationId?: string;
  userId?: string;
  budget?: string;
  history?: Array<{ role: string; content: string }>;
  requestId?: string;
  signal?: AbortSignal;
  approvedPlan?: unknown;
  planSessionId?: string;
  allowDeepEscalation?: boolean;
}

export interface ChatEvent {
  type: string;
  data: any;
}

export interface ChatPlanResult {
  plan: unknown;
  planSessionId: string;
}

export class ChatService {
  constructor(...args: any[]) {}

  async *chat(request: ChatRequest): AsyncGenerator<ChatEvent> {
    yield { type: 'complete', data: { answer: '', total_cost_usd: 0 } };
  }

  async generatePlanForReview(
    query: string,
    budget: string,
    userId?: string,
    requestId?: string
  ): Promise<ChatPlanResult | null> {
    return null;
  }

  setToolGroupMetricsCallback(callback: (groups: any) => void): void {}
}

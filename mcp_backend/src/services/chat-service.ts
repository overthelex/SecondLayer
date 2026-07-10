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
  internetEnabled?: boolean;
  /** A/B override for parallel-seed (CORE-36); forwarded to @secondlayer/core. */
  parallelSeedMin?: number;
}

export interface ChatEvent {
  type: string;
  data: any;
}

export interface ChatPlanResult {
  plan: unknown;
  planSessionId: string;
}

/** V3 telemetry (CORE-55) — one record per chat request, wired to Prometheus. */
export interface ChatTelemetry {
  queryType: string;
  groundingScore: number;
  signals: {
    fabricatedCases: number;
    fabricatedArticles: number;
    lowRelevance: number;
    subjectMismatch: number;
    ungroundedQuotes: number;
  };
  iterations: number;
  toolCalls: number;
  toolRepeatMax: number;
  capHits: { repeat: number; total: number };
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

  setChatTelemetryCallback(callback: (t: ChatTelemetry) => void): void {}
}

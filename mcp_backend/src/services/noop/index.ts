/**
 * NoOp implementations of @secondlayer/core-interfaces.
 *
 * These are used when @secondlayer/core (proprietary) is not installed.
 * Open deployments get full MCP tool access but no AI chat pipeline.
 */

import type {
  IChatService,
  IQueryPlanner,
  IIntentClassifier,
  ISemanticSectionizer,
  IHallucinationGuard,
  ICitationValidator,
  ILegalPatternStore,
  IShepardizationService,
  IEvidenceExtractor,
  IContextBuilder,
  IResultCompactor,
  IThinkingDescriptions,
  IBillingService,
  IPricingService,
  ISubscriptionService,
  ICreditService,
  IChatSearchCache,
  ChatRequest,
  ChatEvent,
  ChatPlanRequest,
  ChatPlan,
  QueryIntent,
  ChatIntentClassification,
  ToolDefinition,
  DocumentSection,
  ValidationResult,
  CitationLink,
  PrecedentStatus,
  LegalPattern,
  ShepardizationResult,
  ExtractedEvidence,
  SimpleCitation,
  BudgetLimits,
  BudgetKey,
  UserBilling,
  UserBalance,
  PriceCalculation,
  PricingConfig,
  PricingTier,
  CreditDeduction,
  CreditAddition,
  CoreServices,
} from '@secondlayer/core-interfaces';

// ============================================================
// Chat Pipeline — returns 501
// ============================================================

export class NoOpChatService implements IChatService {
  async *chat(_request: ChatRequest): AsyncIterable<ChatEvent> {
    yield {
      type: 'error',
      data: { message: 'Chat pipeline not available in open-source build. Install @secondlayer/core for full AI assistant.' },
    };
    yield { type: 'done', data: {} };
  }

  async generatePlanForReview(_request: ChatPlanRequest): Promise<ChatPlan> {
    return {
      query_type: 'unsupported',
      budget: 'quick',
      domains: [],
      tools: [],
      steps: [],
    };
  }
}

// ============================================================
// Query Planner — keyword-based fallback
// ============================================================

export class NoOpQueryPlanner implements IQueryPlanner {
  async classifyIntent(query: string, _budget?: BudgetKey): Promise<QueryIntent> {
    const q = query.toLowerCase();
    let domain = 'general';
    if (q.includes('суд') || q.includes('рішен') || q.includes('справ')) domain = 'court_cases';
    else if (q.includes('закон') || q.includes('стаття') || q.includes('кодекс')) domain = 'legislation';
    else if (q.includes('єдрпоу') || q.includes('компані') || q.includes('підприємств')) domain = 'registry';
    else if (q.includes('депутат') || q.includes('рада') || q.includes('законопроєкт')) domain = 'parliament';

    return { primary_domain: domain, query_type: 'case_lookup', confidence: 0.3 };
  }

  async generateOptimizedSearchQuery(userQuery: string): Promise<string> {
    return userQuery;
  }

  buildQueryParams(intent: QueryIntent): unknown {
    return { domain: intent.primary_domain };
  }

  selectEndpoints(intent: QueryIntent): string[] {
    return [intent.primary_domain];
  }
}

// ============================================================
// Intent Classifier — returns unsupported
// ============================================================

export class NoOpIntentClassifier implements IIntentClassifier {
  async classify(_query: string): Promise<ChatIntentClassification> {
    return {
      queryType: 'unsupported',
      domains: [],
      slots: {},
      confidence: 0,
      suggestedTools: [],
    };
  }

  async filterTools(_domains: string[]): Promise<ToolDefinition[]> {
    return [];
  }
}

// ============================================================
// Legal AI Quality — pass-through / no validation
// ============================================================

export class NoOpSectionizer implements ISemanticSectionizer {
  async extractSections(text: string): Promise<DocumentSection[]> {
    return [{ type: 'unknown', title: '', content: text, startIndex: 0, endIndex: text.length }];
  }
}

export class NoOpHallucinationGuard implements IHallucinationGuard {
  async validateResponse(): Promise<ValidationResult> {
    return { isValid: true, confidence: 0, unsupportedClaims: [] };
  }

  async verifyClaim(): Promise<boolean> {
    return true;
  }
}

export class NoOpCitationValidator implements ICitationValidator {
  async extractCitations(): Promise<CitationLink[]> {
    return [];
  }

  async validatePrecedentStatus(): Promise<PrecedentStatus> {
    return { status: 'unknown', confidence: 0, affectingDecisions: [] };
  }

  async buildCitationGraph(): Promise<unknown> {
    return {};
  }

  async saveCitations(): Promise<void> {}
}

export class NoOpPatternStore implements ILegalPatternStore {
  async extractPatterns(): Promise<LegalPattern | null> {
    return null;
  }

  async savePattern(): Promise<void> {}

  async findPatterns(): Promise<LegalPattern[]> {
    return [];
  }

  async matchPatterns(): Promise<LegalPattern[]> {
    return [];
  }
}

export class NoOpShepardizationService implements IShepardizationService {
  async analyze(identifier: string): Promise<ShepardizationResult> {
    return {
      case_number: identifier,
      status: 'unknown',
      confidence: 0,
      affecting_decisions: [],
      chain_length: 0,
      check_source: 'local',
      checked_at: new Date().toISOString(),
    };
  }

  async quickCheck(): Promise<ShepardizationResult | null> {
    return null;
  }

  async batchAnalyze(caseNumbers: string[]): Promise<ShepardizationResult[]> {
    return caseNumbers.map((cn) => ({
      case_number: cn,
      status: 'unknown' as const,
      confidence: 0,
      affecting_decisions: [],
      chain_length: 0,
      check_source: 'local' as const,
      checked_at: new Date().toISOString(),
    }));
  }
}

// ============================================================
// Evidence & Context — no-op
// ============================================================

export class NoOpEvidenceExtractor implements IEvidenceExtractor {
  extractFromToolResult(): ExtractedEvidence {
    return { decisions: [], citations: [], vault_documents: [] };
  }

  extractNormsFromAnswer(): SimpleCitation[] {
    return [];
  }

  extractAllEvidence(): ExtractedEvidence {
    return { decisions: [], citations: [], vault_documents: [] };
  }
}

export class NoOpContextBuilder implements IContextBuilder {
  async build(
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    query: string,
  ): Promise<Array<{ role: string; content: string }>> {
    const messages: Array<{ role: string; content: string }> = [];
    for (const h of history.slice(-4)) {
      messages.push({ role: h.role, content: h.content });
    }
    messages.push({ role: 'user', content: query });
    return messages;
  }
}

export class NoOpResultCompactor implements IResultCompactor {
  summarize(result: unknown): unknown {
    return result;
  }

  async ragCompact(
    _query: string,
    toolResults: Array<{ tool: string; content: string }>,
  ): Promise<Array<{ tool: string; content: string }>> {
    return toolResults;
  }
}

export class NoOpThinkingDescriptions implements IThinkingDescriptions {
  generate(toolName: string): string {
    return `Виконую ${toolName}...`;
  }
}

// ============================================================
// Billing — free tier only
// ============================================================

export class NoOpBillingService implements IBillingService {
  async getOrCreateUserBilling(userId: string): Promise<UserBilling> {
    return { userId, tier: 'free', balanceUsd: 0 };
  }

  async checkBalance(): Promise<UserBalance> {
    return { hasCredits: true, currentBalance: 999999, reason: 'Open source build — no billing' };
  }

  async charge(): Promise<void> {}
}

export class NoOpPricingService implements IPricingService {
  calculatePrice(costUsd: number): PriceCalculation {
    return { cost_usd: costUsd, markup_percentage: 0, markup_amount_usd: 0, price_usd: costUsd, tier: 'free' };
  }

  getTierConfig(tier: PricingTier): PricingConfig {
    return { tier, markup_percentage: 0, description: 'Open source', features: [] };
  }

  getAllTiers(): PricingConfig[] {
    return [this.getTierConfig('free')];
  }

  getRecommendedTier(): PricingTier {
    return 'free';
  }

  isValidTier(tier: string): boolean {
    return tier === 'free';
  }
}

export class NoOpSubscriptionService implements ISubscriptionService {
  async list(): Promise<{ subscriptions: unknown[]; total: number }> {
    return { subscriptions: [], total: 0 };
  }

  async get(): Promise<unknown | null> {
    return null;
  }

  async create(): Promise<unknown> {
    return {};
  }

  async cancel(): Promise<unknown | null> {
    return null;
  }

  async getUserSubscription(): Promise<unknown | null> {
    return null;
  }
}

export class NoOpCreditService implements ICreditService {
  async checkBalance(): Promise<UserBalance> {
    return { hasCredits: true, currentBalance: 999999, reason: 'Open source build' };
  }

  async deductCredits(): Promise<CreditDeduction> {
    return { success: true, newBalance: 999999, transactionId: null };
  }

  async addCredits(): Promise<CreditAddition> {
    return { success: true, newBalance: 999999, transactionId: 'noop' };
  }

  async getBalanceStatus(): Promise<unknown | null> {
    return null;
  }
}

export class NoOpChatSearchCache implements IChatSearchCache {
  async getCachedResult(): Promise<unknown | null> {
    return null;
  }

  async cacheResult(): Promise<void> {}

  async invalidate(): Promise<void> {}
}

// ============================================================
// Factory: create all NoOp services
// ============================================================

export function createNoOpCoreServices(): CoreServices {
  return {
    chatService: new NoOpChatService(),
    queryPlanner: new NoOpQueryPlanner(),
    intentClassifier: new NoOpIntentClassifier(),
    sectionizer: new NoOpSectionizer(),
    hallucinationGuard: new NoOpHallucinationGuard(),
    citationValidator: new NoOpCitationValidator(),
    patternStore: new NoOpPatternStore(),
    shepardizationService: new NoOpShepardizationService(),
    evidenceExtractor: new NoOpEvidenceExtractor(),
    contextBuilder: new NoOpContextBuilder(),
    resultCompactor: new NoOpResultCompactor(),
    thinkingDescriptions: new NoOpThinkingDescriptions(),
    billingService: new NoOpBillingService(),
    pricingService: new NoOpPricingService(),
    subscriptionService: new NoOpSubscriptionService(),
    creditService: new NoOpCreditService(),
    chatSearchCache: new NoOpChatSearchCache(),
  };
}

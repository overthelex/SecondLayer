// Proprietary implementation: @secondlayer/core (private repo)

/**
 * @secondlayer/core-interfaces
 *
 * TypeScript interfaces defining the boundary between open-source
 * infrastructure and the proprietary AI chat pipeline.
 *
 * These interfaces are implemented by @secondlayer/core (private)
 * and consumed by mcp_backend (public). The open repo provides
 * NoOp fallbacks when @secondlayer/core is not installed.
 */

export interface IChatService {
  chat(request: ChatRequest): AsyncIterable<ChatEvent>;
  generatePlanForReview(request: ChatPlanRequest): Promise<ChatPlan>;
}

export interface ChatRequest {
  query: string;
  conversationId?: string;
  userId?: string;
  budget?: BudgetKey;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  requestId?: string;
}

export interface ChatPlanRequest {
  query: string;
  conversationId?: string;
  userId?: string;
  budget?: BudgetKey;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface ChatPlan {
  query_type: QueryType;
  budget: BudgetKey;
  domains: string[];
  tools: string[];
  steps: Array<{ tool: string; params: Record<string, unknown>; reason: string }>;
  estimated_cost_usd?: number;
}

export interface ChatEvent {
  type: 'thinking' | 'text' | 'tool_call' | 'tool_result' | 'evidence' | 'plan' | 'error' | 'done' | 'cost';
  data: unknown;
}

export interface IQueryPlanner {
  classifyIntent(query: string, budget?: BudgetKey): Promise<QueryIntent>;
  generateOptimizedSearchQuery(userQuery: string, intent: QueryIntent, budget?: BudgetKey): Promise<string>;
  buildQueryParams(intent: QueryIntent, searchQuery?: string): unknown;
  selectEndpoints(intent: QueryIntent): string[];
}

export interface IIntentClassifier {
  classify(query: string, requestId?: string): Promise<ChatIntentClassification>;
  filterTools(domains: string[], slots?: Record<string, unknown>, queryType?: QueryType): Promise<ToolDefinition[]>;
}

export interface QueryIntent {
  primary_domain: string;
  sub_domain?: string;
  query_type: string;
  confidence: number;
  entities?: Record<string, unknown>;
}

export interface ChatIntentClassification {
  queryType: QueryType;
  domains: string[];
  slots: Record<string, unknown>;
  confidence: number;
  suggestedTools: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type QueryType =
  | 'case_lookup'
  | 'practice_analysis'
  | 'legislation_lookup'
  | 'legal_consultation'
  | 'registry_lookup'
  | 'parliament_query'
  | 'document_query'
  | 'calculation'
  | 'document_drafting'
  | 'comparative_analysis'
  | 'due_diligence'
  | 'institutional_analysis'
  | 'unsupported';

export type BudgetKey = 'quick' | 'standard' | 'deep';

export interface BudgetLimits {
  maxResultChars: number;
  maxContextChars: number;
  maxTokens: number;
  maxToolCalls: number;
  resolutionSlice: number;
}

export interface ISemanticSectionizer {
  extractSections(text: string, useLLM?: boolean): Promise<DocumentSection[]>;
}

export interface DocumentSection {
  type: SectionType;
  title: string;
  content: string;
  startIndex: number;
  endIndex: number;
  metadata?: Record<string, unknown>;
}

export type SectionType = 'article' | 'part' | 'chapter' | 'section' | 'paragraph' | 'preamble' | 'conclusion' | 'header' | 'unknown';

export interface IHallucinationGuard {
  validateResponse(response: unknown, sources: string[]): Promise<ValidationResult>;
  verifyClaim(claim: string, sources: string[]): Promise<boolean>;
}

export interface ValidationResult {
  isValid: boolean;
  confidence: number;
  unsupportedClaims: string[];
  suggestedCorrections?: string[];
}

export interface ICitationValidator {
  extractCitations(text: string, caseId: string): Promise<CitationLink[]>;
  validatePrecedentStatus(caseId: string, caseNumber?: string): Promise<PrecedentStatus>;
  buildCitationGraph(caseId: string, depth?: number): Promise<unknown>;
  saveCitations(citations: CitationLink[]): Promise<void>;
}

export interface CitationLink {
  sourceDocId: string;
  targetDocId: string;
  citationType: string;
  confidence: number;
}

export type PrecedentStatusType = 'active' | 'overruled' | 'modified' | 'questioned' | 'unknown';

export interface PrecedentStatus {
  status: PrecedentStatusType;
  confidence: number;
  affectingDecisions: AffectingDecision[];
}

export interface AffectingDecision {
  doc_id: string;
  instance: string;
  court: string;
  date?: string;
  outcome: string;
  effect: 'upheld' | 'modified' | 'overruled' | 'remanded' | 'closed';
}

export interface ILegalPatternStore {
  extractPatterns(caseIds: string[], intent: string): Promise<LegalPattern | null>;
  savePattern(pattern: LegalPattern): Promise<void>;
  findPatterns(intent: string, minConfidence?: number): Promise<LegalPattern[]>;
  matchPatterns(queryEmbedding: number[], intent: string): Promise<LegalPattern[]>;
}

export interface LegalPattern {
  id?: string;
  intent: string;
  description: string;
  confidence: number;
  caseIds: string[];
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

export interface IShepardizationService {
  analyze(identifier: string): Promise<ShepardizationResult>;
  quickCheck(caseNumber: string): Promise<ShepardizationResult | null>;
  batchAnalyze(caseNumbers: string[]): Promise<ShepardizationResult[]>;
}

export interface ShepardizationResult {
  case_number: string;
  target_doc_id?: string;
  status: PrecedentStatusType;
  confidence: number;
  affecting_decisions: AffectingDecision[];
  chain_length: number;
  check_source: 'redis' | 'pg' | 'zo_api' | 'local';
  checked_at: string;
}

export interface IEvidenceExtractor {
  extractFromToolResult(toolName: string, rawResult: unknown): ExtractedEvidence;
  extractNormsFromAnswer(answerText: string): SimpleCitation[];
  extractAllEvidence(
    thinkingSteps: Array<{ tool: string; params: unknown; result: unknown }>,
    answerText?: string
  ): ExtractedEvidence;
}

export interface ExtractedEvidence {
  decisions: Array<{ id: string; number: string; court: string; date: string; summary: string }>;
  citations: SimpleCitation[];
  vault_documents: Array<{ id: string; name: string; type: string }>;
}

export interface SimpleCitation {
  law: string;
  article: string;
  text?: string;
}

export interface IContextBuilder {
  build(
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    query: string,
    classifiedDomains?: string[],
    plan?: unknown,
    maxContextChars?: number,
    conversationId?: string,
    requestId?: string,
    queryType?: QueryType
  ): Promise<Array<{ role: string; content: string }>>;
}

export interface IResultCompactor {
  summarize(result: unknown, limits: BudgetLimits): unknown;
  ragCompact(
    query: string,
    toolResults: Array<{ tool: string; content: string }>,
    maxChars: number
  ): Promise<Array<{ tool: string; content: string }>>;
}

export interface IThinkingDescriptions {
  generate(toolName: string, params: Record<string, unknown>): string;
}

export type PricingTier = 'free' | 'startup' | 'business' | 'enterprise' | 'internal' | 'attorney';

export interface IBillingService {
  getOrCreateUserBilling(userId: string): Promise<UserBilling>;
  checkBalance(userId: string): Promise<UserBalance>;
  charge(userId: string, requestId: string, costUsd: number): Promise<void>;
}

export interface UserBilling {
  userId: string;
  tier: PricingTier;
  balanceUsd: number;
}

export interface UserBalance {
  hasCredits: boolean;
  currentBalance: number;
  reason: string;
}

export interface IPricingService {
  calculatePrice(costUsd: number, tier?: PricingTier): PriceCalculation;
  getTierConfig(tier: PricingTier): PricingConfig;
  getAllTiers(): PricingConfig[];
  getRecommendedTier(monthlySpendingUsd: number): PricingTier;
  isValidTier(tier: string): boolean;
}

export interface PricingConfig {
  tier: PricingTier;
  markup_percentage: number;
  description: string;
  features: string[];
  monthly_price_usd?: number;
  is_active?: boolean;
  display_name?: string;
}

export interface PriceCalculation {
  cost_usd: number;
  markup_percentage: number;
  markup_amount_usd: number;
  price_usd: number;
  tier: PricingTier;
}

export interface ISubscriptionService {
  list(filters?: Record<string, unknown>): Promise<{ subscriptions: unknown[]; total: number }>;
  get(id: string): Promise<unknown | null>;
  create(input: unknown): Promise<unknown>;
  cancel(id: string, reason: string): Promise<unknown | null>;
  getUserSubscription(userId: string): Promise<unknown | null>;
}

export interface ICreditService {
  checkBalance(userId: string, requiredCredits?: number): Promise<UserBalance>;
  deductCredits(userId: string, amount: number, toolName: string, costTrackingId?: string, description?: string): Promise<CreditDeduction>;
  addCredits(userId: string, amount: number, transactionType: string, source: string, sourceId?: string, description?: string): Promise<CreditAddition>;
  getBalanceStatus(userId: string): Promise<unknown | null>;
}

export interface CreditDeduction {
  success: boolean;
  newBalance: number;
  transactionId: string | null;
}

export interface CreditAddition {
  success: boolean;
  newBalance: number;
  transactionId: string;
}

export interface IChatSearchCache {
  getCachedResult(toolName: string, params: Record<string, unknown>): Promise<unknown | null>;
  cacheResult(toolName: string, params: Record<string, unknown>, result: unknown): Promise<void>;
  invalidate(conversationId: string): Promise<void>;
}

export interface CoreServices {
  chatService: IChatService;
  queryPlanner: IQueryPlanner;
  intentClassifier: IIntentClassifier;
  sectionizer: ISemanticSectionizer;
  hallucinationGuard: IHallucinationGuard;
  citationValidator: ICitationValidator;
  patternStore: ILegalPatternStore;
  shepardizationService: IShepardizationService;
  evidenceExtractor: IEvidenceExtractor;
  contextBuilder: IContextBuilder;
  resultCompactor: IResultCompactor;
  thinkingDescriptions: IThinkingDescriptions;
  billingService: IBillingService;
  pricingService: IPricingService;
  subscriptionService: ISubscriptionService;
  creditService: ICreditService;
  chatSearchCache: IChatSearchCache;
}

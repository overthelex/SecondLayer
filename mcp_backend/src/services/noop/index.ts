// Proprietary implementation: @secondlayer/core (private repo)

/**
 * NoOp (no-operation) implementations of core service interfaces.
 * Used as fallbacks when @secondlayer/core is not installed.
 */

export { SemanticSectionizer } from '../semantic-sectionizer.js';
export { LegalPatternStore } from '../legal-pattern-store.js';
export { CitationValidator } from '../citation-validator.js';
export { HallucinationGuard } from '../hallucination-guard.js';
export { QueryPlanner } from '../query-planner.js';
export { ShepardizationService } from '../shepardization-service.js';
export { ChatService } from '../chat-service.js';
export { ChatSearchCacheService } from '../chat-search-cache-service.js';
export { IntentClassifier } from '../chat-intent-classifier.js';
export { ChatContextBuilder } from '../chat-context-builder.js';
export { ResultCompactor } from '../chat-result-compactor.js';
export { extractFromToolResult, extractNormsFromAnswer, extractAllEvidence } from '../evidence-extractor.js';
export { generateThinkingDescription } from '../thinking-descriptions.js';
export { BillingService } from '../billing-service.js';
export { PricingService } from '../pricing-service.js';
export { SubscriptionService } from '../subscription-service.js';
export { CreditService } from '../credit-service.js';

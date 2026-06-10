// Proprietary implementation: @secondlayer/core (private repo)
// Core overlay: CORE-24..30 + core#31 — article verification fix (parse 'articles' field, was inert in prod)

/**
 * Core service loader.
 * Attempts to load @secondlayer/core (proprietary). If unavailable,
 * falls back to NoOp implementations from services/noop/.
 */

import { SemanticSectionizer } from '../services/semantic-sectionizer.js';
import { LegalPatternStore } from '../services/legal-pattern-store.js';
import { CitationValidator } from '../services/citation-validator.js';
import { HallucinationGuard } from '../services/hallucination-guard.js';
import { QueryPlanner } from '../services/query-planner.js';
import { ShepardizationService } from '../services/shepardization-service.js';
import { ChatService } from '../services/chat-service.js';
import { ChatSearchCacheService } from '../services/chat-search-cache-service.js';
import { BillingService } from '../services/billing-service.js';
import { PricingService } from '../services/pricing-service.js';
import { SubscriptionService } from '../services/subscription-service.js';
import { CreditService } from '../services/credit-service.js';
import { TokenBudgetAllocator } from '../services/token-budget-allocator.js';
import { IncrementalAllowSet } from '../services/incremental-allow-set.js';
import { ToolHealthTracker } from '../services/tool-health-tracker.js';
import { StepConstraintEnforcer } from '../services/step-constraints.js';

export {
  SemanticSectionizer,
  LegalPatternStore,
  CitationValidator,
  HallucinationGuard,
  QueryPlanner,
  ShepardizationService,
  ChatService,
  ChatSearchCacheService,
  BillingService,
  PricingService,
  SubscriptionService,
  CreditService,
  TokenBudgetAllocator,
  IncrementalAllowSet,
  ToolHealthTracker,
  StepConstraintEnforcer,
};

/**
 * core-loader tests
 *
 * core-loader.ts is a barrel re-export file. Tests verify that every symbol
 * named in its export list can be imported and is a constructor (function or
 * class) that can be instantiated (or at least referenced).
 *
 * Since the module simply re-exports from the service files, the key
 * behaviours under test are:
 *   1. All named exports exist and are non-null.
 *   2. All exported symbols are functions (constructors).
 *   3. Re-exported classes are the same references as those from the original
 *      service modules (no wrapping/aliasing).
 */

// ─── Import all symbols from core-loader ─────────────────────────────────────

import {
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
} from '../core-loader.js';

// ─── Import from original sources for identity checks ────────────────────────

import { SemanticSectionizer as SemanticSectionizerSrc } from '../../services/semantic-sectionizer.js';
import { LegalPatternStore as LegalPatternStoreSrc } from '../../services/legal-pattern-store.js';
import { CitationValidator as CitationValidatorSrc } from '../../services/citation-validator.js';
import { HallucinationGuard as HallucinationGuardSrc } from '../../services/hallucination-guard.js';
import { QueryPlanner as QueryPlannerSrc } from '../../services/query-planner.js';
import { ShepardizationService as ShepardizationServiceSrc } from '../../services/shepardization-service.js';
import { ChatService as ChatServiceSrc } from '../../services/chat-service.js';
import { ChatSearchCacheService as ChatSearchCacheServiceSrc } from '../../services/chat-search-cache-service.js';
import { BillingService as BillingServiceSrc } from '../../services/billing-service.js';
import { PricingService as PricingServiceSrc } from '../../services/pricing-service.js';
import { SubscriptionService as SubscriptionServiceSrc } from '../../services/subscription-service.js';
import { CreditService as CreditServiceSrc } from '../../services/credit-service.js';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('core-loader barrel exports', () => {

  // ── all exports are defined ───────────────────────────────────────────────

  describe('all named exports are defined', () => {
    it('exports SemanticSectionizer', () => {
      expect(SemanticSectionizer).toBeDefined();
    });

    it('exports LegalPatternStore', () => {
      expect(LegalPatternStore).toBeDefined();
    });

    it('exports CitationValidator', () => {
      expect(CitationValidator).toBeDefined();
    });

    it('exports HallucinationGuard', () => {
      expect(HallucinationGuard).toBeDefined();
    });

    it('exports QueryPlanner', () => {
      expect(QueryPlanner).toBeDefined();
    });

    it('exports ShepardizationService', () => {
      expect(ShepardizationService).toBeDefined();
    });

    it('exports ChatService', () => {
      expect(ChatService).toBeDefined();
    });

    it('exports ChatSearchCacheService', () => {
      expect(ChatSearchCacheService).toBeDefined();
    });

    it('exports BillingService', () => {
      expect(BillingService).toBeDefined();
    });

    it('exports PricingService', () => {
      expect(PricingService).toBeDefined();
    });

    it('exports SubscriptionService', () => {
      expect(SubscriptionService).toBeDefined();
    });

    it('exports CreditService', () => {
      expect(CreditService).toBeDefined();
    });
  });

  // ── all exports are constructor functions ─────────────────────────────────

  describe('all exports are constructor functions', () => {
    const exportedConstructors: [string, unknown][] = [
      ['SemanticSectionizer', SemanticSectionizer],
      ['LegalPatternStore', LegalPatternStore],
      ['CitationValidator', CitationValidator],
      ['HallucinationGuard', HallucinationGuard],
      ['QueryPlanner', QueryPlanner],
      ['ShepardizationService', ShepardizationService],
      ['ChatService', ChatService],
      ['ChatSearchCacheService', ChatSearchCacheService],
      ['BillingService', BillingService],
      ['PricingService', PricingService],
      ['SubscriptionService', SubscriptionService],
      ['CreditService', CreditService],
    ];

    exportedConstructors.forEach(([name, ctor]) => {
      it(`${name} is a function`, () => {
        expect(typeof ctor).toBe('function');
      });
    });
  });

  // ── re-exports are identical references (no wrapping) ─────────────────────

  describe('re-exports are the same references as original source modules', () => {
    it('SemanticSectionizer is the same as from services/semantic-sectionizer', () => {
      expect(SemanticSectionizer).toBe(SemanticSectionizerSrc);
    });

    it('LegalPatternStore is the same as from services/legal-pattern-store', () => {
      expect(LegalPatternStore).toBe(LegalPatternStoreSrc);
    });

    it('CitationValidator is the same as from services/citation-validator', () => {
      expect(CitationValidator).toBe(CitationValidatorSrc);
    });

    it('HallucinationGuard is the same as from services/hallucination-guard', () => {
      expect(HallucinationGuard).toBe(HallucinationGuardSrc);
    });

    it('QueryPlanner is the same as from services/query-planner', () => {
      expect(QueryPlanner).toBe(QueryPlannerSrc);
    });

    it('ShepardizationService is the same as from services/shepardization-service', () => {
      expect(ShepardizationService).toBe(ShepardizationServiceSrc);
    });

    it('ChatService is the same as from services/chat-service', () => {
      expect(ChatService).toBe(ChatServiceSrc);
    });

    it('ChatSearchCacheService is the same as from services/chat-search-cache-service', () => {
      expect(ChatSearchCacheService).toBe(ChatSearchCacheServiceSrc);
    });

    it('BillingService is the same as from services/billing-service', () => {
      expect(BillingService).toBe(BillingServiceSrc);
    });

    it('PricingService is the same as from services/pricing-service', () => {
      expect(PricingService).toBe(PricingServiceSrc);
    });

    it('SubscriptionService is the same as from services/subscription-service', () => {
      expect(SubscriptionService).toBe(SubscriptionServiceSrc);
    });

    it('CreditService is the same as from services/credit-service', () => {
      expect(CreditService).toBe(CreditServiceSrc);
    });
  });

  // ── total export count matches expected ───────────────────────────────────

  describe('export completeness', () => {
    it('exports exactly 12 symbols', async () => {
      const loaderModule = await import('../core-loader.js');
      // Filter out non-constructor / metadata keys
      const exportedNames = Object.keys(loaderModule).filter(
        (k) => typeof (loaderModule as any)[k] === 'function'
      );
      expect(exportedNames).toHaveLength(12);
    });

    it('export names match the expected list', async () => {
      const loaderModule = await import('../core-loader.js');
      const exportedNames = new Set(
        Object.keys(loaderModule).filter((k) => typeof (loaderModule as any)[k] === 'function')
      );
      const expected = [
        'SemanticSectionizer', 'LegalPatternStore', 'CitationValidator',
        'HallucinationGuard', 'QueryPlanner', 'ShepardizationService',
        'ChatService', 'ChatSearchCacheService', 'BillingService',
        'PricingService', 'SubscriptionService', 'CreditService',
      ];
      expected.forEach((name) => {
        expect(exportedNames).toContain(name);
      });
    });
  });
});

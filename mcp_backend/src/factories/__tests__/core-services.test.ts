/**
 * core-services factory tests
 *
 * Verifies that createBackendCoreServices() correctly instantiates and
 * wires together all backend services, returning a complete BackendCoreServices
 * object with every expected property.
 */

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('../../database/database.js', () => ({
  Database: jest.fn().mockImplementation(() => ({
    query: jest.fn(),
    getPool: jest.fn(),
    setMetricsCollector: jest.fn(),
  })),
}));

jest.mock('../../services/document-service.js', () => ({
  DocumentService: jest.fn().mockImplementation(() => ({
    getDocument: jest.fn(),
  })),
}));

jest.mock('../../infrastructure/adapters/llm-adapter.js', () => ({
  LLMAdapter: jest.fn().mockImplementation(() => ({
    complete: jest.fn(),
  })),
}));

jest.mock('../../utils/llm-client-manager.js', () => ({
  getLLMManager: jest.fn().mockReturnValue({
    complete: jest.fn(),
    setCostTracker: jest.fn(),
    setExternalApiMetrics: jest.fn(),
  }),
}));

jest.mock('../../services/query-planner.js', () => ({
  QueryPlanner: jest.fn().mockImplementation(() => ({
    plan: jest.fn(),
  })),
}));

jest.mock('../../services/semantic-sectionizer.js', () => ({
  SemanticSectionizer: jest.fn().mockImplementation(() => ({
    sectionize: jest.fn(),
  })),
}));

jest.mock('../../services/embedding-service.js', () => ({
  EmbeddingService: jest.fn().mockImplementation(() => ({
    embed: jest.fn(),
    setTokenUsageCallback: jest.fn(),
  })),
}));

jest.mock('../../adapters/edrsr-local-adapter.js', () => ({
  EdsrLocalAdapter: jest.fn().mockImplementation(() => ({
    search: jest.fn(),
    setCostTracker: jest.fn(),
    setExternalApiMetrics: jest.fn(),
  })),
}));

jest.mock('../../services/legal-pattern-store.js', () => ({
  LegalPatternStore: jest.fn().mockImplementation(() => ({
    store: jest.fn(),
  })),
}));

jest.mock('../../services/shepardization-service.js', () => ({
  ShepardizationService: jest.fn().mockImplementation(() => ({
    check: jest.fn(),
  })),
}));

jest.mock('../../services/citation-validator.js', () => ({
  CitationValidator: jest.fn().mockImplementation(() => ({
    validate: jest.fn(),
  })),
}));

jest.mock('../../services/hallucination-guard.js', () => ({
  HallucinationGuard: jest.fn().mockImplementation(() => ({
    guard: jest.fn(),
  })),
}));

jest.mock('../../services/legislation-service.js', () => ({
  LegislationService: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    getAdapter: jest.fn().mockReturnValue({
      setExternalApiMetrics: jest.fn(),
    }),
  })),
}));

jest.mock('../../api/legislation-tools.js', () => ({
  LegislationTools: jest.fn().mockImplementation(() => ({
    getTools: jest.fn().mockReturnValue([]),
    getLegislationService: jest.fn().mockReturnValue({
      getAdapter: jest.fn().mockReturnValue({
        setExternalApiMetrics: jest.fn(),
      }),
    }),
  })),
}));

jest.mock('../../services/reyestr-download-service.js', () => ({
  ReyestrDownloadService: jest.fn().mockImplementation(() => ({
    download: jest.fn(),
  })),
}));

jest.mock('../../services/import-task-service.js', () => ({
  ImportTaskService: jest.fn().mockImplementation(() => ({
    create: jest.fn(),
  })),
}));

jest.mock('../../api/mcp-query-api.js', () => ({
  MCPQueryAPI: jest.fn().mockImplementation(() => ({
    getTools: jest.fn().mockReturnValue([]),
  })),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { createBackendCoreServices } from '../core-services.js';
import { Database } from '../../database/database.js';
import { DocumentService } from '../../services/document-service.js';
import { QueryPlanner } from '../../services/query-planner.js';
import { SemanticSectionizer } from '../../services/semantic-sectionizer.js';
import { EmbeddingService } from '../../services/embedding-service.js';
import { EdsrLocalAdapter } from '../../adapters/edrsr-local-adapter.js';
import { LegalPatternStore } from '../../services/legal-pattern-store.js';
import { ShepardizationService } from '../../services/shepardization-service.js';
import { CitationValidator } from '../../services/citation-validator.js';
import { HallucinationGuard } from '../../services/hallucination-guard.js';
import { LegislationTools } from '../../api/legislation-tools.js';
import { LegislationService } from '../../services/legislation-service.js';
import { ReyestrDownloadService } from '../../services/reyestr-download-service.js';
import { ImportTaskService } from '../../services/import-task-service.js';
import { MCPQueryAPI } from '../../api/mcp-query-api.js';
import { LLMAdapter } from '../../infrastructure/adapters/llm-adapter.js';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createBackendCoreServices', () => {
  let services: ReturnType<typeof createBackendCoreServices>;

  beforeEach(() => {
    jest.clearAllMocks();
    services = createBackendCoreServices();
  });

  // ── return shape ──────────────────────────────────────────────────────────

  describe('return shape — all properties present', () => {
    const expectedKeys: string[] = [
      'db', 'documentService', 'queryPlanner', 'sectionizer', 'embeddingService',
      'zoAdapter', 'zoPracticeAdapter', 'zoSessionsAdapter', 'zoLegalActsAdapter',
      'zoECHRAdapter', 'patternStore', 'shepardizationService', 'citationValidator',
      'hallucinationGuard', 'legislationTools', 'reyestrDownloadService',
      'importTaskService', 'mcpAPI',
    ];

    expectedKeys.forEach((key) => {
      it(`returns property: ${key}`, () => {
        expect(services).toHaveProperty(key);
        expect((services as any)[key]).toBeDefined();
      });
    });
  });

  // ── constructor call counts ───────────────────────────────────────────────

  describe('constructor invocations', () => {
    it('constructs Database exactly once', () => {
      expect(Database).toHaveBeenCalledTimes(1);
    });

    it('constructs DocumentService exactly once', () => {
      expect(DocumentService).toHaveBeenCalledTimes(1);
    });

    it('constructs LLMAdapter exactly once', () => {
      expect(LLMAdapter).toHaveBeenCalledTimes(1);
    });

    it('constructs QueryPlanner exactly once', () => {
      expect(QueryPlanner).toHaveBeenCalledTimes(1);
    });

    it('constructs SemanticSectionizer exactly once', () => {
      expect(SemanticSectionizer).toHaveBeenCalledTimes(1);
    });

    it('constructs EmbeddingService exactly once', () => {
      expect(EmbeddingService).toHaveBeenCalledTimes(1);
    });

    it('constructs 5 EdsrLocalAdapter instances (zo, practice, sessions, legal-acts, ECHR)', () => {
      expect(EdsrLocalAdapter).toHaveBeenCalledTimes(5);
    });

    it('constructs LegalPatternStore exactly once', () => {
      expect(LegalPatternStore).toHaveBeenCalledTimes(1);
    });

    it('constructs ShepardizationService exactly once', () => {
      expect(ShepardizationService).toHaveBeenCalledTimes(1);
    });

    it('constructs CitationValidator exactly once', () => {
      expect(CitationValidator).toHaveBeenCalledTimes(1);
    });

    it('constructs HallucinationGuard exactly once', () => {
      expect(HallucinationGuard).toHaveBeenCalledTimes(1);
    });

    it('constructs LegislationService exactly once', () => {
      expect(LegislationService).toHaveBeenCalledTimes(1);
    });

    it('constructs LegislationTools exactly once', () => {
      expect(LegislationTools).toHaveBeenCalledTimes(1);
    });

    it('constructs ReyestrDownloadService exactly once', () => {
      expect(ReyestrDownloadService).toHaveBeenCalledTimes(1);
    });

    it('constructs ImportTaskService exactly once', () => {
      expect(ImportTaskService).toHaveBeenCalledTimes(1);
    });

    it('constructs MCPQueryAPI exactly once', () => {
      expect(MCPQueryAPI).toHaveBeenCalledTimes(1);
    });
  });

  // ── correct argument wiring ───────────────────────────────────────────────

  describe('dependency wiring', () => {
    it('passes a single arg (db) to DocumentService', () => {
      const [arg0] = (DocumentService as jest.Mock).mock.calls[0];
      expect(arg0).toHaveProperty('query');
      expect(arg0).toHaveProperty('getPool');
    });

    it('DocumentService receives the same db instance as returned in services.db', () => {
      const [arg0] = (DocumentService as jest.Mock).mock.calls[0];
      expect(arg0).toBe(services.db);
    });

    it('LegalPatternStore receives db as first argument', () => {
      const [arg0] = (LegalPatternStore as jest.Mock).mock.calls[0];
      expect(arg0).toBe(services.db);
    });

    it('LegalPatternStore receives embeddingService as second argument', () => {
      const [, arg1] = (LegalPatternStore as jest.Mock).mock.calls[0];
      expect(arg1).toBe(services.embeddingService);
    });

    it('ShepardizationService receives zoAdapter as first argument', () => {
      const [arg0] = (ShepardizationService as jest.Mock).mock.calls[0];
      expect(arg0).toBe(services.zoAdapter);
    });

    it('ShepardizationService receives db as second argument', () => {
      const [, arg1] = (ShepardizationService as jest.Mock).mock.calls[0];
      expect(arg1).toBe(services.db);
    });

    it('CitationValidator receives db as first argument', () => {
      const [arg0] = (CitationValidator as jest.Mock).mock.calls[0];
      expect(arg0).toBe(services.db);
    });

    it('CitationValidator receives shepardizationService as second argument', () => {
      const [, arg1] = (CitationValidator as jest.Mock).mock.calls[0];
      expect(arg1).toBe(services.shepardizationService);
    });

    it('HallucinationGuard receives db as first argument', () => {
      const [arg0] = (HallucinationGuard as jest.Mock).mock.calls[0];
      expect(arg0).toBe(services.db);
    });

    it('HallucinationGuard receives shepardizationService as second argument', () => {
      const [, arg1] = (HallucinationGuard as jest.Mock).mock.calls[0];
      expect(arg1).toBe(services.shepardizationService);
    });

    it('ImportTaskService receives db as first argument', () => {
      const [arg0] = (ImportTaskService as jest.Mock).mock.calls[0];
      expect(arg0).toBe(services.db);
    });

    it('ReyestrDownloadService receives db as first argument', () => {
      const [arg0] = (ReyestrDownloadService as jest.Mock).mock.calls[0];
      expect(arg0).toBe(services.db);
    });

    it('ReyestrDownloadService receives documentService as second argument', () => {
      const [, arg1] = (ReyestrDownloadService as jest.Mock).mock.calls[0];
      expect(arg1).toBe(services.documentService);
    });

    it('ReyestrDownloadService receives sectionizer as third argument', () => {
      const [,, arg2] = (ReyestrDownloadService as jest.Mock).mock.calls[0];
      expect(arg2).toBe(services.sectionizer);
    });

    it('ReyestrDownloadService receives embeddingService as fourth argument', () => {
      const [,,, arg3] = (ReyestrDownloadService as jest.Mock).mock.calls[0];
      expect(arg3).toBe(services.embeddingService);
    });

    it('MCPQueryAPI receives queryPlanner as first argument', () => {
      const [arg0] = (MCPQueryAPI as jest.Mock).mock.calls[0];
      expect(arg0).toBe(services.queryPlanner);
    });

    it('MCPQueryAPI receives zoAdapter as second argument', () => {
      const [, arg1] = (MCPQueryAPI as jest.Mock).mock.calls[0];
      expect(arg1).toBe(services.zoAdapter);
    });

    it('MCPQueryAPI receives zoPracticeAdapter as third argument', () => {
      const [,, arg2] = (MCPQueryAPI as jest.Mock).mock.calls[0];
      expect(arg2).toBe(services.zoPracticeAdapter);
    });

    it('MCPQueryAPI receives embeddingService as fourth argument', () => {
      const [,,, arg3] = (MCPQueryAPI as jest.Mock).mock.calls[0];
      expect(arg3).toBe(services.embeddingService);
    });

    it('MCPQueryAPI receives patternStore as fifth argument', () => {
      const args = (MCPQueryAPI as jest.Mock).mock.calls[0];
      expect(args[4]).toBe(services.patternStore);
    });

    it('MCPQueryAPI receives citationValidator as sixth argument', () => {
      const args = (MCPQueryAPI as jest.Mock).mock.calls[0];
      expect(args[5]).toBe(services.citationValidator);
    });

    it('MCPQueryAPI receives hallucinationGuard as seventh argument', () => {
      const args = (MCPQueryAPI as jest.Mock).mock.calls[0];
      expect(args[6]).toBe(services.hallucinationGuard);
    });

    it('MCPQueryAPI receives legislationTools as eighth argument', () => {
      const args = (MCPQueryAPI as jest.Mock).mock.calls[0];
      expect(args[7]).toBe(services.legislationTools);
    });
  });

  // ── multiple calls produce separate instances ─────────────────────────────

  describe('isolation between calls', () => {
    it('creates a new db instance on each call', () => {
      const services2 = createBackendCoreServices();
      expect(services2.db).not.toBe(services.db);
    });

    it('creates a new embeddingService on each call', () => {
      const services2 = createBackendCoreServices();
      expect(services2.embeddingService).not.toBe(services.embeddingService);
    });

    it('creates a new mcpAPI on each call', () => {
      const services2 = createBackendCoreServices();
      expect(services2.mcpAPI).not.toBe(services.mcpAPI);
    });
  });
});

/**
 * app-services factory tests
 *
 * Verifies that createAppServices() correctly instantiates and wires together
 * all application services, registers metrics callbacks, and configures auth.
 */

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('../../services/conversation-service.js', () => ({
  ConversationService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../services/conversation-evidence-service.js', () => ({
  ConversationEvidenceService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../services/gdpr-service.js', () => ({
  GdprService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../services/audit-service.js', () => ({
  AuditService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../services/matter-service.js', () => ({
  MatterService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../services/contract-service.js', () => ({
  ContractService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../services/conflict-check-service.js', () => ({
  ConflictCheckService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../services/legal-hold-service.js', () => ({
  LegalHoldService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../services/time-entry-service.js', () => ({
  TimeEntryService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../services/matter-invoice-service.js', () => ({
  MatterInvoiceService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../services/workflow-service.js', () => ({
  WorkflowService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../services/workflow-generator-service.js', () => ({
  WorkflowGeneratorService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../services/workflow-executor-service.js', () => ({
  WorkflowExecutorService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../services/chat-service.js', () => ({
  ChatService: jest.fn().mockImplementation(() => ({
    setToolGroupMetricsCallback: jest.fn(),
  })),
}));

jest.mock('../../services/chat-search-cache-service.js', () => ({
  ChatSearchCacheService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../services/config-service.js', () => ({
  ConfigService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../services/document-classification-service.js', () => ({
  DocumentClassificationService: jest.fn().mockImplementation(() => ({})),
}));

const mockStartWorker = jest.fn();
const mockSetMetricsCollector = jest.fn();
const mockSetProcessingDurationCallback = jest.fn();
const mockGetCpuAdaptiveManager = jest.fn().mockReturnValue(null);
const mockSetQueueService = jest.fn();

jest.mock('../../services/upload-queue-service.js', () => ({
  UploadQueueService: jest.fn().mockImplementation(() => ({
    startWorker: mockStartWorker,
    setMetricsCollector: mockSetMetricsCollector,
    setProcessingDurationCallback: mockSetProcessingDurationCallback,
    getCpuAdaptiveManager: mockGetCpuAdaptiveManager,
    setQueueService: mockSetQueueService,
  })),
}));

jest.mock('../../services/upload-recovery-service.js', () => ({
  UploadRecoveryService: jest.fn().mockImplementation(() => ({
    setQueueService: mockSetQueueService,
  })),
}));

const mockUpdatePgPool = jest.fn();
const mockUpdateUploadQueue = jest.fn();
const mockUpdateCpuAdaptive = jest.fn();

jest.mock('../../services/metrics-service.js', () => ({
  MetricsService: jest.fn().mockImplementation(() => ({
    updatePgPool: mockUpdatePgPool,
    updateUploadQueue: mockUpdateUploadQueue,
    updateCpuAdaptive: mockUpdateCpuAdaptive,
    uploadProcessingDuration: { observe: jest.fn() },
    costTrackingTotalUsd: { inc: jest.fn() },
    externalApiCallsTotal: { inc: jest.fn() },
    externalApiDuration: { observe: jest.fn() },
    chatToolGroupRequests: { inc: jest.fn() },
  })),
}));

jest.mock('../../services/attorney-profile-service.js', () => ({
  AttorneyProfileService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../services/consultation-service.js', () => ({
  ConsultationService: jest.fn().mockImplementation(() => ({
    setEmailService: jest.fn(),
  })),
}));

jest.mock('../../services/consultation-payment-service.js', () => ({
  ConsultationPaymentService: jest.fn().mockImplementation(() => ({
    setPayoutService: jest.fn(),
    setBillingService: jest.fn(),
    setAuditService: jest.fn(),
  })),
}));

jest.mock('../../services/attorney-payout-service.js', () => ({
  AttorneyPayoutService: jest.fn().mockImplementation(() => ({
    setAuditService: jest.fn(),
  })),
}));

jest.mock('../../services/oauth-service.js', () => ({
  OAuthService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../services/legislation-monitoring-service.js', () => ({
  LegislationMonitoringService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../api/mcp-sse-server.js', () => ({
  MCPSSEServer: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../services/banner-service.js', () => ({
  BannerService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../services/user-service.js', () => ({
  UserService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../services/webauthn-service.js', () => ({
  WebAuthnService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../middleware/matter-access.js', () => ({
  initializeMatterAccess: jest.fn(),
}));

jest.mock('../../controllers/auth.js', () => ({
  setAuthMinioService: jest.fn(),
  setAuthBannerService: jest.fn(),
  setAuthEmailService: jest.fn(),
  setAuthReferralService: jest.fn(),
  setAuthBillingService: jest.fn(),
}));

jest.mock('../../config/passport.js', () => ({
  setPassportBannerService: jest.fn(),
  configurePassport: jest.fn(),
}));

jest.mock('../../middleware/dual-auth.js', () => ({
  initializeDualAuth: jest.fn(),
  initializeWebAuthn: jest.fn(),
}));

const mockGetOpenAIManager = jest.fn().mockReturnValue({
  setCostTracker: jest.fn(),
});
jest.mock('../../utils/openai-client.js', () => ({
  getOpenAIManager: mockGetOpenAIManager,
}));

const mockGetLLMManager = jest.fn().mockReturnValue({
  setCostTracker: jest.fn(),
  setExternalApiMetrics: jest.fn(),
});
jest.mock('../../utils/llm-client-manager.js', () => ({
  getLLMManager: mockGetLLMManager,
}));

jest.mock('../../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { createAppServices } from '../app-services.js';
import { ConversationService } from '../../services/conversation-service.js';
import { ConversationEvidenceService } from '../../services/conversation-evidence-service.js';
import { GdprService } from '../../services/gdpr-service.js';
import { AuditService } from '../../services/audit-service.js';
import { MatterService } from '../../services/matter-service.js';
import { ContractService } from '../../services/contract-service.js';
import { ConflictCheckService } from '../../services/conflict-check-service.js';
import { LegalHoldService } from '../../services/legal-hold-service.js';
import { TimeEntryService } from '../../services/time-entry-service.js';
import { MatterInvoiceService } from '../../services/matter-invoice-service.js';
import { WorkflowService } from '../../services/workflow-service.js';
import { WorkflowGeneratorService } from '../../services/workflow-generator-service.js';
import { WorkflowExecutorService } from '../../services/workflow-executor-service.js';
import { ChatService } from '../../services/chat-service.js';
import { ChatSearchCacheService } from '../../services/chat-search-cache-service.js';
import { ConfigService } from '../../services/config-service.js';
import { DocumentClassificationService } from '../../services/document-classification-service.js';
import { UploadQueueService } from '../../services/upload-queue-service.js';
import { UploadRecoveryService } from '../../services/upload-recovery-service.js';
import { MetricsService } from '../../services/metrics-service.js';
import { AttorneyProfileService } from '../../services/attorney-profile-service.js';
import { ConsultationService } from '../../services/consultation-service.js';
import { ConsultationPaymentService } from '../../services/consultation-payment-service.js';
import { AttorneyPayoutService } from '../../services/attorney-payout-service.js';
import { OAuthService } from '../../services/oauth-service.js';
import { LegislationMonitoringService } from '../../services/legislation-monitoring-service.js';
import { MCPSSEServer } from '../../api/mcp-sse-server.js';
import { initializeMatterAccess } from '../../middleware/matter-access.js';
import { setAuthMinioService, setAuthBannerService } from '../../controllers/auth.js';
import { setPassportBannerService, configurePassport } from '../../config/passport.js';
import { initializeDualAuth, initializeWebAuthn } from '../../middleware/dual-auth.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCoreServices() {
  return {
    db: { query: jest.fn(), getPool: jest.fn(), setMetricsCollector: jest.fn() },
    documentService: { getDocument: jest.fn() },
    queryPlanner: { plan: jest.fn() },
    sectionizer: { sectionize: jest.fn() },
    embeddingService: { embed: jest.fn() },
    zoAdapter: {
      search: jest.fn(),
      setCostTracker: jest.fn(),
      setExternalApiMetrics: jest.fn(),
    },
    zoPracticeAdapter: {
      search: jest.fn(),
      setCostTracker: jest.fn(),
      setExternalApiMetrics: jest.fn(),
    },
    zoSessionsAdapter: { search: jest.fn(), setExternalApiMetrics: jest.fn() },
    zoLegalActsAdapter: { search: jest.fn() },
    zoECHRAdapter: { search: jest.fn() },
    patternStore: { store: jest.fn() },
    shepardizationService: { check: jest.fn() },
    citationValidator: { validate: jest.fn() },
    hallucinationGuard: { guard: jest.fn() },
    legislationTools: {
      getTools: jest.fn().mockReturnValue([]),
      getLegislationService: jest.fn().mockReturnValue({
        getAdapter: jest.fn().mockReturnValue({
          setExternalApiMetrics: jest.fn(),
        }),
      }),
    },
    reyestrDownloadService: { download: jest.fn() },
    importTaskService: { create: jest.fn() },
    mcpAPI: { getTools: jest.fn().mockReturnValue([]) },
  } as any;
}

function makeBilling() {
  return {
    costTracker: {
      record: jest.fn(),
      setMetricsCallback: jest.fn(),
    },
    billingService: {
      setAuditService: jest.fn(),
      getEmailPreferences: jest.fn().mockResolvedValue({}),
    },
    currencyService: {},
    pricingService: {},
    subscriptionService: {},
    invoiceService: {},
    emailService: {
      setPreferenceFetcher: jest.fn(),
      setReferralDataFetcher: jest.fn(),
    },
    referralService: {},
    apiKeyService: {},
    creditService: {},
    b2bInvoiceService: {},
    encryptionKeyService: {},
    userPreferencesService: {},
    prometheusService: {},
    monobankService: {
      setAuditService: jest.fn(),
    },
    metamaskService: {},
    binancePayService: {},
    nowpaymentsService: {},
  } as any;
}

function makeTools() {
  return {
    toolRegistry: {
      registerHandler: jest.fn(),
      getHandler: jest.fn(),
    },
    serviceProxy: {
      setExternalApiMetrics: jest.fn(),
    },
    documentParser: {},
    documentAnalysisTools: { getTools: jest.fn().mockReturnValue([]) },
    batchDocumentTools: { getTools: jest.fn().mockReturnValue([]) },
    uploadService: {},
    minioService: {},
    vaultTools: { getTools: jest.fn().mockReturnValue([]) },
    edsrFtsService: {},
    edsrVectorizer: undefined,
  } as any;
}

function makeLlmAdapter() {
  return { complete: jest.fn() } as any;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('createAppServices', () => {
  let coreServices: ReturnType<typeof makeCoreServices>;
  let billing: ReturnType<typeof makeBilling>;
  let tools: ReturnType<typeof makeTools>;
  let llmAdapter: ReturnType<typeof makeLlmAdapter>;
  let services: ReturnType<typeof createAppServices>;

  beforeEach(() => {
    jest.clearAllMocks();
    coreServices = makeCoreServices();
    billing = makeBilling();
    tools = makeTools();
    llmAdapter = makeLlmAdapter();
    services = createAppServices(coreServices, billing, tools, llmAdapter);
  });

  // ── return shape ──────────────────────────────────────────────────────────

  describe('return shape — all properties present', () => {
    const expectedKeys = [
      'conversationService', 'evidenceService', 'gdprService', 'auditService',
      'matterService', 'contractService', 'conflictCheckService', 'legalHoldService',
      'timeEntryService', 'matterInvoiceService', 'workflowService',
      'workflowGeneratorService', 'workflowExecutorService', 'chatService',
      'chatSearchCache', 'configService', 'classificationService',
      'uploadQueueService', 'uploadRecoveryService', 'metricsService',
      'attorneyProfileService', 'consultationService', 'consultationPaymentService',
      'attorneyPayoutService', 'oauthService', 'mcpSSEServer', 'llmAdapter',
      'legislationMonitoringService',
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
    it('constructs OAuthService once', () => {
      expect(OAuthService).toHaveBeenCalledTimes(1);
    });

    it('constructs ConversationService once', () => {
      expect(ConversationService).toHaveBeenCalledTimes(1);
    });

    it('constructs ConversationEvidenceService once', () => {
      expect(ConversationEvidenceService).toHaveBeenCalledTimes(1);
    });

    it('constructs GdprService once', () => {
      expect(GdprService).toHaveBeenCalledTimes(1);
    });

    it('constructs AuditService once', () => {
      expect(AuditService).toHaveBeenCalledTimes(1);
    });

    it('constructs MatterService once', () => {
      expect(MatterService).toHaveBeenCalledTimes(1);
    });

    it('constructs ContractService once', () => {
      expect(ContractService).toHaveBeenCalledTimes(1);
    });

    it('constructs ConflictCheckService once', () => {
      expect(ConflictCheckService).toHaveBeenCalledTimes(1);
    });

    it('constructs LegalHoldService once', () => {
      expect(LegalHoldService).toHaveBeenCalledTimes(1);
    });

    it('constructs TimeEntryService once', () => {
      expect(TimeEntryService).toHaveBeenCalledTimes(1);
    });

    it('constructs MatterInvoiceService once', () => {
      expect(MatterInvoiceService).toHaveBeenCalledTimes(1);
    });

    it('constructs WorkflowService once', () => {
      expect(WorkflowService).toHaveBeenCalledTimes(1);
    });

    it('constructs WorkflowGeneratorService once', () => {
      expect(WorkflowGeneratorService).toHaveBeenCalledTimes(1);
    });

    it('constructs WorkflowExecutorService once', () => {
      expect(WorkflowExecutorService).toHaveBeenCalledTimes(1);
    });

    it('constructs ChatSearchCacheService once', () => {
      expect(ChatSearchCacheService).toHaveBeenCalledTimes(1);
    });

    it('constructs ChatService once', () => {
      expect(ChatService).toHaveBeenCalledTimes(1);
    });

    it('constructs ConfigService once', () => {
      expect(ConfigService).toHaveBeenCalledTimes(1);
    });

    it('constructs DocumentClassificationService once', () => {
      expect(DocumentClassificationService).toHaveBeenCalledTimes(1);
    });

    it('constructs UploadQueueService once', () => {
      expect(UploadQueueService).toHaveBeenCalledTimes(1);
    });

    it('constructs UploadRecoveryService once', () => {
      expect(UploadRecoveryService).toHaveBeenCalledTimes(1);
    });

    it('constructs MetricsService once', () => {
      expect(MetricsService).toHaveBeenCalledTimes(1);
    });

    it('constructs AttorneyProfileService once', () => {
      expect(AttorneyProfileService).toHaveBeenCalledTimes(1);
    });

    it('constructs ConsultationService once', () => {
      expect(ConsultationService).toHaveBeenCalledTimes(1);
    });

    it('constructs ConsultationPaymentService once', () => {
      expect(ConsultationPaymentService).toHaveBeenCalledTimes(1);
    });

    it('constructs AttorneyPayoutService once', () => {
      expect(AttorneyPayoutService).toHaveBeenCalledTimes(1);
    });

    it('constructs MCPSSEServer once', () => {
      expect(MCPSSEServer).toHaveBeenCalledTimes(1);
    });

    it('constructs LegislationMonitoringService once', () => {
      expect(LegislationMonitoringService).toHaveBeenCalledTimes(1);
    });
  });

  // ── dependency wiring ─────────────────────────────────────────────────────

  describe('dependency wiring', () => {
    it('OAuthService receives db as first argument', () => {
      const [arg0] = (OAuthService as jest.Mock).mock.calls[0];
      expect(arg0).toBe(coreServices.db);
    });

    it('ConversationService receives db', () => {
      const [arg0] = (ConversationService as jest.Mock).mock.calls[0];
      expect(arg0).toBe(coreServices.db);
    });

    it('MatterService receives db and auditService', () => {
      const [arg0, arg1] = (MatterService as jest.Mock).mock.calls[0];
      expect(arg0).toBe(coreServices.db);
      const auditInstance = (AuditService as jest.Mock).mock.results[0].value;
      expect(arg1).toBe(auditInstance);
    });

    it('WorkflowExecutorService receives costTracker', () => {
      const args = (WorkflowExecutorService as jest.Mock).mock.calls[0];
      expect(args).toContain(billing.costTracker);
    });

    it('ChatSearchCacheService receives zoAdapter and documentService', () => {
      const [arg0, arg1] = (ChatSearchCacheService as jest.Mock).mock.calls[0];
      expect(arg0).toBe(coreServices.zoAdapter);
      expect(arg1).toBe(coreServices.documentService);
    });

    it('ChatService receives toolRegistry', () => {
      const args = (ChatService as jest.Mock).mock.calls[0];
      expect(args[0]).toBe(tools.toolRegistry);
    });

    it('ChatService receives costTracker', () => {
      const args = (ChatService as jest.Mock).mock.calls[0];
      expect(args).toContain(billing.costTracker);
    });

    it('DocumentClassificationService receives db, llmAdapter, costTracker', () => {
      const args = (DocumentClassificationService as jest.Mock).mock.calls[0];
      expect(args[0]).toBe(coreServices.db);
      expect(args).toContain(billing.costTracker);
    });

    it('MCPSSEServer receives toolRegistry', () => {
      const [arg0] = (MCPSSEServer as jest.Mock).mock.calls[0];
      expect(arg0).toBe(tools.toolRegistry);
    });

    it('MCPSSEServer receives costTracker', () => {
      const args = (MCPSSEServer as jest.Mock).mock.calls[0];
      expect(args).toContain(billing.costTracker);
    });

    it('MCPSSEServer receives creditService', () => {
      const args = (MCPSSEServer as jest.Mock).mock.calls[0];
      expect(args).toContain(billing.creditService);
    });
  });

  // ── upload queue service lifecycle ────────────────────────────────────────

  describe('upload queue service lifecycle', () => {
    it('calls startWorker on uploadQueueService', () => {
      expect(mockStartWorker).toHaveBeenCalledTimes(1);
    });

    it('calls setQueueService on uploadRecoveryService', () => {
      const recoveryInstance = (UploadRecoveryService as jest.Mock).mock.results[0].value;
      expect(recoveryInstance.setQueueService).toHaveBeenCalledTimes(1);
    });

    it('passes uploadQueueService to uploadRecoveryService.setQueueService', () => {
      const recoveryInstance = (UploadRecoveryService as jest.Mock).mock.results[0].value;
      const queueInstance = (UploadQueueService as jest.Mock).mock.results[0].value;
      expect(recoveryInstance.setQueueService).toHaveBeenCalledWith(queueInstance);
    });
  });

  // ── metrics wiring ────────────────────────────────────────────────────────

  describe('metrics service wiring', () => {
    it('sets metrics collector on db', () => {
      expect(coreServices.db.setMetricsCollector).toHaveBeenCalledWith(expect.any(Function));
    });

    it('sets metrics collector on uploadQueueService', () => {
      expect(mockSetMetricsCollector).toHaveBeenCalledWith(expect.any(Function));
    });

    it('sets processing duration callback on uploadQueueService', () => {
      expect(mockSetProcessingDurationCallback).toHaveBeenCalledWith(expect.any(Function));
    });

    it('sets metrics callback on costTracker', () => {
      expect(billing.costTracker.setMetricsCallback).toHaveBeenCalledWith(expect.any(Function));
    });

    it('sets tool group metrics callback on chatService', () => {
      const chatInstance = (ChatService as jest.Mock).mock.results[0].value;
      expect(chatInstance.setToolGroupMetricsCallback).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  // ── external API metrics wiring ───────────────────────────────────────────

  describe('external API metrics wiring', () => {
    it('calls setExternalApiMetrics on zoAdapter', () => {
      expect(coreServices.zoAdapter.setExternalApiMetrics).toHaveBeenCalledWith(expect.any(Function));
    });

    it('calls setExternalApiMetrics on zoPracticeAdapter', () => {
      expect(coreServices.zoPracticeAdapter.setExternalApiMetrics).toHaveBeenCalledWith(expect.any(Function));
    });

    it('calls setExternalApiMetrics on zoSessionsAdapter', () => {
      expect(coreServices.zoSessionsAdapter.setExternalApiMetrics).toHaveBeenCalledWith(expect.any(Function));
    });

    it('calls setExternalApiMetrics on serviceProxy', () => {
      expect(tools.serviceProxy.setExternalApiMetrics).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  // ── cost tracker wiring ───────────────────────────────────────────────────

  describe('cost tracker wiring', () => {
    it('calls setCostTracker on openAIManager', () => {
      const openaiManager = mockGetOpenAIManager();
      expect(openaiManager.setCostTracker).toHaveBeenCalledWith(billing.costTracker);
    });

    it('calls setCostTracker on LLMManager', () => {
      const llmManager = mockGetLLMManager();
      expect(llmManager.setCostTracker).toHaveBeenCalledWith(billing.costTracker);
    });

    it('calls setCostTracker on zoAdapter', () => {
      expect(coreServices.zoAdapter.setCostTracker).toHaveBeenCalledWith(billing.costTracker);
    });

    it('calls setCostTracker on zoPracticeAdapter', () => {
      expect(coreServices.zoPracticeAdapter.setCostTracker).toHaveBeenCalledWith(billing.costTracker);
    });
  });

  // ── authentication configuration ──────────────────────────────────────────

  describe('authentication configuration', () => {
    it('calls configurePassport with db', () => {
      expect(configurePassport).toHaveBeenCalledWith(coreServices.db);
    });

    it('calls initializeMatterAccess', () => {
      expect(initializeMatterAccess).toHaveBeenCalledTimes(1);
    });

    it('calls initializeDualAuth with userService and apiKeyService', () => {
      expect(initializeDualAuth).toHaveBeenCalledWith(
        expect.anything(),
        billing.apiKeyService
      );
    });

    it('calls initializeWebAuthn', () => {
      expect(initializeWebAuthn).toHaveBeenCalledTimes(1);
    });
  });

  // ── MinIO and Banner wiring ───────────────────────────────────────────────

  describe('MinIO and Banner service wiring', () => {
    it('calls setAuthMinioService with minioService', () => {
      expect(setAuthMinioService).toHaveBeenCalledWith(tools.minioService);
    });

    it('calls setAuthBannerService', () => {
      expect(setAuthBannerService).toHaveBeenCalledTimes(1);
    });

    it('calls setPassportBannerService', () => {
      expect(setPassportBannerService).toHaveBeenCalledTimes(1);
    });
  });

  // ── consultation payment service callbacks ────────────────────────────────

  describe('consultation payment service callback wiring', () => {
    it('calls setPayoutService on consultationPaymentService', () => {
      const cpsInstance = (ConsultationPaymentService as jest.Mock).mock.results[0].value;
      expect(cpsInstance.setPayoutService).toHaveBeenCalledTimes(1);
    });

    it('calls setBillingService on consultationPaymentService', () => {
      const cpsInstance = (ConsultationPaymentService as jest.Mock).mock.results[0].value;
      expect(cpsInstance.setBillingService).toHaveBeenCalledWith(billing.billingService);
    });

    it('calls setAuditService on consultationPaymentService', () => {
      const cpsInstance = (ConsultationPaymentService as jest.Mock).mock.results[0].value;
      expect(cpsInstance.setAuditService).toHaveBeenCalledTimes(1);
    });

    it('calls setAuditService on attorneyPayoutService', () => {
      const payoutInstance = (AttorneyPayoutService as jest.Mock).mock.results[0].value;
      expect(payoutInstance.setAuditService).toHaveBeenCalledTimes(1);
    });

    it('calls setEmailService on consultationService', () => {
      const csInstance = (ConsultationService as jest.Mock).mock.results[0].value;
      expect(csInstance.setEmailService).toHaveBeenCalledWith(billing.emailService);
    });
  });

  // ── billing audit wiring ──────────────────────────────────────────────────

  describe('billing audit wiring', () => {
    it('calls setAuditService on billingService', () => {
      expect(billing.billingService.setAuditService).toHaveBeenCalledTimes(1);
    });

    it('calls setAuditService on monobankService', () => {
      expect(billing.monobankService.setAuditService).toHaveBeenCalledTimes(1);
    });
  });

  // ── llmAdapter passthrough ────────────────────────────────────────────────

  describe('llmAdapter passthrough', () => {
    it('returns the same llmAdapter that was passed in', () => {
      expect(services.llmAdapter).toBe(llmAdapter);
    });
  });
});

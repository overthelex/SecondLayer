import { BackendCoreServices } from './core-services.js';
import { BillingServices } from './billing-services.js';
import { ToolServices } from './tool-services.js';
import { LLMAdapter } from '../infrastructure/adapters/llm-adapter.js';
import { ConversationService } from '../services/conversation-service.js';
import { ConversationEvidenceService } from '../services/conversation-evidence-service.js';
import { GdprService } from '../services/gdpr-service.js';
import { AuditService } from '../services/audit-service.js';
import { MatterService } from '../services/matter-service.js';
import { ContractService } from '../services/contract-service.js';
import { ConflictCheckService } from '../services/conflict-check-service.js';
import { LegalHoldService } from '../services/legal-hold-service.js';
import { TimeEntryService } from '../services/time-entry-service.js';
import { MatterInvoiceService } from '../services/matter-invoice-service.js';
import { WorkflowService } from '../services/workflow-service.js';
import { WorkflowGeneratorService } from '../services/workflow-generator-service.js';
import { WorkflowExecutorService } from '../services/workflow-executor-service.js';
import { ChatService } from '../services/chat-service.js';
import { ChatSearchCacheService } from '../services/chat-search-cache-service.js';
import { ConfigService } from '../services/config-service.js';
import { DocumentClassificationService } from '../services/document-classification-service.js';
import { UploadQueueService } from '../services/upload-queue-service.js';
import { UploadRecoveryService } from '../services/upload-recovery-service.js';
import { MetricsService } from '../services/metrics-service.js';
import { AttorneyProfileService } from '../services/attorney-profile-service.js';
import { ConsultationService } from '../services/consultation-service.js';
import { ConsultationPaymentService } from '../services/consultation-payment-service.js';
import { AttorneyPayoutService } from '../services/attorney-payout-service.js';
import { OAuthService } from '../services/oauth-service.js';
import { MCPSSEServer } from '../api/mcp-sse-server.js';
import { BannerService } from '../services/banner-service.js';
import { UserService } from '../services/user-service.js';
import { WebAuthnService } from '../services/webauthn-service.js';
import { initializeMatterAccess } from '../middleware/matter-access.js';
import { setAuthMinioService, setAuthBannerService } from '../controllers/auth.js';
import { setPassportBannerService, configurePassport } from '../config/passport.js';
import { initializeDualAuth, initializeWebAuthn } from '../middleware/dual-auth.js';
import { getOpenAIManager } from '../utils/openai-client.js';
import { getLLMManager } from '../utils/llm-client-manager.js';
import { logger } from '../utils/logger.js';

export interface AppServices {
  conversationService: ConversationService;
  evidenceService: ConversationEvidenceService;
  gdprService: GdprService;
  auditService: AuditService;
  matterService: MatterService;
  contractService: ContractService;
  conflictCheckService: ConflictCheckService;
  legalHoldService: LegalHoldService;
  timeEntryService: TimeEntryService;
  matterInvoiceService: MatterInvoiceService;
  workflowService: WorkflowService;
  workflowGeneratorService: WorkflowGeneratorService;
  workflowExecutorService: WorkflowExecutorService;
  chatService: ChatService;
  chatSearchCache: ChatSearchCacheService;
  configService: ConfigService;
  classificationService: DocumentClassificationService;
  uploadQueueService: UploadQueueService;
  uploadRecoveryService: UploadRecoveryService;
  metricsService: MetricsService;
  attorneyProfileService: AttorneyProfileService;
  consultationService: ConsultationService;
  consultationPaymentService: ConsultationPaymentService;
  attorneyPayoutService: AttorneyPayoutService;
  oauthService: OAuthService;
  mcpSSEServer: MCPSSEServer;
  llmAdapter: LLMAdapter;
}

export function createAppServices(
  coreServices: BackendCoreServices,
  billing: BillingServices,
  tools: ToolServices,
  llmAdapter: LLMAdapter
): AppServices {
  // OAuth 2.0 service for ChatGPT integration
  const oauthService = new OAuthService(coreServices.db);
  logger.info('OAuth 2.0 service initialized');

  // Conversation & GDPR
  const conversationService = new ConversationService(coreServices.db);
  const evidenceService = new ConversationEvidenceService(coreServices.db);
  const gdprService = new GdprService(coreServices.db, tools.minioService, coreServices.embeddingService);

  // Wire MinIO and Banner to auth controllers
  setAuthMinioService(tools.minioService);
  const bannerService = new BannerService(tools.minioService, coreServices.db);
  setAuthBannerService(bannerService);
  setPassportBannerService(bannerService);
  logger.info('Upload, MinIO, and Banner services initialized');
  logger.info('Conversation and GDPR services initialized');

  // Client-Matter segregation services
  const auditService = new AuditService(coreServices.db);
  const matterService = new MatterService(coreServices.db, auditService);
  const contractService = new ContractService(coreServices.db);
  const conflictCheckService = new ConflictCheckService(coreServices.db, auditService);
  const legalHoldService = new LegalHoldService(coreServices.db, auditService);
  initializeMatterAccess(matterService);
  logger.info('Client-Matter segregation and legal hold services initialized');

  // Time Tracking and Billing
  const timeEntryService = new TimeEntryService(coreServices.db, auditService);
  const matterInvoiceService = new MatterInvoiceService(coreServices.db, auditService);
  logger.info('Time tracking and billing services initialized');

  // Workflow services
  const workflowService = new WorkflowService(coreServices.db);
  const workflowGeneratorService = new WorkflowGeneratorService(tools.toolRegistry, llmAdapter);
  const workflowExecutorService = new WorkflowExecutorService(tools.toolRegistry, workflowService, billing.costTracker);
  logger.info('Workflow services initialized');

  // ChatService (agentic LLM loop) with search cache
  const chatSearchCache = new ChatSearchCacheService(
    coreServices.zoAdapter,
    coreServices.documentService
  );
  const chatService = new ChatService(
    tools.toolRegistry,
    coreServices.queryPlanner,
    billing.costTracker,
    llmAdapter,
    chatSearchCache,
    conversationService,
    coreServices.shepardizationService,
    coreServices.embeddingService,
    workflowGeneratorService,
    workflowService
  );
  logger.info('ChatService initialized with search cache, conversation persistence, shepardization, embedding, and workflows');

  // Config service
  const configService = new ConfigService(coreServices.db);

  // Document classification service
  const classificationService = new DocumentClassificationService(
    coreServices.db,
    llmAdapter,
    billing.costTracker
  );

  // BullMQ upload queue service
  const uploadQueueService = new UploadQueueService(
    tools.uploadService,
    tools.minioService,
    tools.vaultTools,
    coreServices.db,
    coreServices.documentService
  );
  uploadQueueService.startWorker();
  logger.info('BullMQ upload queue service initialized');

  // Prometheus metrics service + wiring
  const metricsService = new MetricsService();

  coreServices.db.setMetricsCollector((stats) => metricsService.updatePgPool(stats));
  uploadQueueService.setMetricsCollector((metrics) => metricsService.updateUploadQueue(metrics));
  uploadQueueService.setProcessingDurationCallback((durationSeconds, status) => {
    metricsService.uploadProcessingDuration.observe({ status }, durationSeconds);
  });
  billing.costTracker.setMetricsCallback((toolName, costUsd) => {
    metricsService.costTrackingTotalUsd.inc({ tool_name: toolName }, costUsd);
  });

  const cpuAdaptiveManager = uploadQueueService.getCpuAdaptiveManager();
  if (cpuAdaptiveManager) {
    cpuAdaptiveManager.setMetricsCallback((metrics) => metricsService.updateCpuAdaptive(metrics));
  }

  const externalApiMetricsCallback = (service: string, status: string, durationSec: number) => {
    metricsService.externalApiCallsTotal.inc({ service, status });
    if (durationSec > 0) {
      metricsService.externalApiDuration.observe({ service }, durationSec);
    }
  };
  coreServices.zoAdapter.setExternalApiMetrics(externalApiMetricsCallback);
  coreServices.zoPracticeAdapter.setExternalApiMetrics(externalApiMetricsCallback);
  coreServices.zoSessionsAdapter.setExternalApiMetrics(externalApiMetricsCallback);
  tools.serviceProxy.setExternalApiMetrics(externalApiMetricsCallback);
  getLLMManager().setExternalApiMetrics(externalApiMetricsCallback);
  coreServices.legislationTools.getLegislationService().getAdapter().setExternalApiMetrics(externalApiMetricsCallback);
  // Wire ChatService tool group metrics
  chatService.setToolGroupMetricsCallback((groups) => {
    metricsService.chatToolGroupRequests.inc({ groups });
  });

  logger.info('Prometheus metrics service initialized');

  // Upload recovery service (uses BullMQ for re-enqueuing)
  const uploadRecoveryService = new UploadRecoveryService(
    tools.uploadService,
    tools.minioService,
    tools.vaultTools,
    coreServices.db,
    coreServices.documentService
  );
  uploadRecoveryService.setQueueService(uploadQueueService);

  // Attorney Consultation services
  const attorneyProfileService = new AttorneyProfileService(coreServices.db);
  const consultationService = new ConsultationService(
    coreServices.db,
    matterService,
    auditService,
    attorneyProfileService
  );
  const attorneyPayoutService = new AttorneyPayoutService(coreServices.db);
  const consultationPaymentService = new ConsultationPaymentService(
    coreServices.db,
    consultationService,
    billing.monobankService
  );
  consultationPaymentService.setPayoutService(attorneyPayoutService);
  consultationPaymentService.setBillingService(billing.billingService);
  consultationPaymentService.setAuditService(auditService);
  attorneyPayoutService.setAuditService(auditService);
  consultationService.setEmailService(billing.emailService);
  logger.info('Attorney consultation services initialized (with payout tracking and email notifications)');

  // Wire audit service into billing and payment services
  billing.billingService.setAuditService(auditService);
  billing.monobankService.setAuditService(auditService);

  // Wire cost tracker to OpenAI manager and ZO adapters
  const openaiManager = getOpenAIManager();
  openaiManager.setCostTracker(billing.costTracker);
  coreServices.zoAdapter.setCostTracker(billing.costTracker);
  coreServices.zoPracticeAdapter.setCostTracker(billing.costTracker);
  logger.info('Cost tracking and billing initialized');

  // MCP SSE Server for ChatGPT integration
  const mcpSSEServer = new MCPSSEServer(
    tools.toolRegistry,
    billing.costTracker,
    billing.creditService
  );
  logger.info('MCP SSE Server initialized with Phase 2 billing support');

  // Authentication
  configurePassport(coreServices.db);
  const userService = new UserService(coreServices.db);
  const webAuthnService = new WebAuthnService(coreServices.db);
  initializeDualAuth(userService, billing.apiKeyService);
  initializeWebAuthn(webAuthnService);
  logger.info('Authentication configured (Google OAuth2 + dual auth + WebAuthn)');

  return {
    conversationService,
    evidenceService,
    gdprService,
    auditService,
    matterService,
    contractService,
    conflictCheckService,
    legalHoldService,
    timeEntryService,
    matterInvoiceService,
    workflowService,
    workflowGeneratorService,
    workflowExecutorService,
    chatService,
    chatSearchCache,
    configService,
    classificationService,
    uploadQueueService,
    uploadRecoveryService,
    metricsService,
    attorneyProfileService,
    consultationService,
    consultationPaymentService,
    attorneyPayoutService,
    oauthService,
    mcpSSEServer,
    llmAdapter,
  };
}

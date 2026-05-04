import { BackendCoreServices } from './core-services.js';
import { CostTracker } from '../services/cost-tracker.js';
import { DocumentParser } from '../services/document-parser.js';
import { DocumentAnalysisTools } from '../api/document-analysis-tools.js';
import { BatchDocumentTools } from '../api/batch-document-tools.js';
import { MetadataExtractor } from '../services/metadata-extractor.js';
import { ToolRegistry } from '../api/tool-registry.js';
import { ServiceProxy } from '../services/service-proxy.js';
import { RemoteServiceClient } from '../services/remote-service-client.js';
import { UploadService } from '../services/upload-service.js';
import { MinioService } from '../services/minio-service.js';
import { VaultTools } from '../api/vault-tools.js';
import { CourtDecisionTools } from '../api/tools/court-decision-tools.js';
import { ProceduralTools } from '../api/tools/procedural-tools.js';
import { LegalAdviceTools } from '../api/tools/legal-advice-tools.js';
import { DueDiligenceTools } from '../api/due-diligence-tools.js';
import { DueDiligenceService } from '../services/due-diligence-service.js';
import { CourtSessionTools } from '../api/tools/court-session-tools.js';
import { LegalActsTools } from '../api/tools/legal-acts-tools.js';
import { ECHRPracticeTools } from '../api/tools/echr-practice-tools.js';
import { EdsrSearchTools } from '../api/tools/edrsr-search-tools.js';
import { EdsrExtendedTools } from '../api/tools/edrsr-extended-tools.js';
import { EdsrSemanticTools } from '../api/tools/edrsr-semantic-tools.js';
import { EdsrHybridTools } from '../api/tools/edrsr-hybrid-tools.js';
import { EdsrFtsService } from '../services/edrsr-fts-service.js';
import { EdsrVectorizerService } from '../services/edrsr-vectorizer-service.js';
import { NextcloudService } from '../services/nextcloud-service.js';
import { NextcloudTools } from '../api/tools/nextcloud-tools.js';
import { CourtStatusTools } from '../api/tools/court-status-tools.js';
import { OpenDataTools } from '../api/tools/opendata-tools.js';
import { SpendingTools } from '../api/tools/spending-tools.js';
import { OpenDataRegistriesTools } from '../api/tools/opendata-registries-tools.js';
import { Tier1OpenDataTools } from '../api/tools/tier1-opendata-tools.js';
import { RegistrySearchTool } from '../api/tools/registry-search-tool.js';
import { LLMAdapter } from '../infrastructure/adapters/llm-adapter.js';
import { DecisionLayerTools } from '../api/tools/decision-layer-tools.js';
import { ImportTaskTools } from '../api/tools/import-task-tools.js';
import { logger } from '../utils/logger.js';
import path from 'path';

export interface ToolServices {
  toolRegistry: ToolRegistry;
  serviceProxy: ServiceProxy;
  documentParser: DocumentParser;
  documentAnalysisTools: DocumentAnalysisTools;
  batchDocumentTools: BatchDocumentTools;
  uploadService: UploadService;
  minioService: MinioService;
  vaultTools: VaultTools;
  edsrFtsService: EdsrFtsService;
  edsrVectorizer?: EdsrVectorizerService;
}

export function createToolServices(
  coreServices: BackendCoreServices,
  costTracker: CostTracker,
  llmAdapter: LLMAdapter
): ToolServices {
  // Document parser with Vision API credentials
  const visionKeyPath = process.env.VISION_CREDENTIALS_PATH ||
                       process.env.GOOGLE_APPLICATION_CREDENTIALS ||
                       path.resolve(process.cwd(), '../vision-ocr-credentials.json');
  const documentParser = new DocumentParser(visionKeyPath, llmAdapter);

  const documentAnalysisTools = new DocumentAnalysisTools(
    documentParser,
    coreServices.sectionizer,
    coreServices.patternStore,
    coreServices.citationValidator,
    coreServices.embeddingService,
    coreServices.documentService,
    llmAdapter
  );

  const batchDocumentTools = new BatchDocumentTools(
    documentParser,
    documentAnalysisTools
  );
  logger.info('Batch document processing tools initialized');

  // Unified Gateway components — single shared HTTP client for remote services
  const remoteClient = new RemoteServiceClient();
  const toolRegistry = new ToolRegistry(remoteClient);
  const serviceProxy = new ServiceProxy(costTracker, remoteClient);
  logger.info('Unified Gateway initialized (Tool Registry + Service Proxy)');

  // Register all tool handlers with the central registry
  toolRegistry.registerHandler(coreServices.legislationTools);
  toolRegistry.registerHandler(documentAnalysisTools);
  toolRegistry.registerHandler(batchDocumentTools);
  const ddService = new DueDiligenceService(
    coreServices.sectionizer,
    coreServices.patternStore,
    coreServices.citationValidator,
    coreServices.documentService,
    llmAdapter
  );
  toolRegistry.registerHandler(new DueDiligenceTools(ddService));
  toolRegistry.registerHandler(coreServices.mcpAPI);
  toolRegistry.registerHandler(new CourtDecisionTools(
    coreServices.zoAdapter,
    coreServices.zoPracticeAdapter,
    coreServices.sectionizer,
    coreServices.embeddingService,
    coreServices.patternStore,
    coreServices.db
  ));
  toolRegistry.registerHandler(new ProceduralTools(
    coreServices.zoAdapter,
    coreServices.zoPracticeAdapter,
    coreServices.sectionizer,
    coreServices.embeddingService,
    coreServices.patternStore,
    llmAdapter
  ));
  toolRegistry.registerHandler(new LegalAdviceTools(
    coreServices.queryPlanner,
    coreServices.zoAdapter,
    coreServices.zoPracticeAdapter,
    coreServices.sectionizer,
    coreServices.embeddingService,
    coreServices.patternStore,
    coreServices.citationValidator,
    coreServices.shepardizationService,
    llmAdapter,
    coreServices.db
  ));
  toolRegistry.registerHandler(new CourtSessionTools(
    coreServices.zoSessionsAdapter,
    coreServices.db
  ));
  toolRegistry.registerHandler(new LegalActsTools(coreServices.zoLegalActsAdapter));
  toolRegistry.registerHandler(new ECHRPracticeTools(coreServices.zoECHRAdapter));
  toolRegistry.registerHandler(new CourtStatusTools(coreServices.db));
  toolRegistry.registerHandler(new RegistrySearchTool(coreServices.db));
  // Bespoke tools with non-parametric query patterns
  toolRegistry.registerHandler(new OpenDataTools(coreServices.db));
  toolRegistry.registerHandler(new SpendingTools(coreServices.db));
  toolRegistry.registerHandler(new OpenDataRegistriesTools(coreServices.db));
  toolRegistry.registerHandler(new Tier1OpenDataTools(coreServices.db));
  toolRegistry.registerHandler(new EdsrSearchTools(coreServices.db));
  toolRegistry.registerHandler(new EdsrExtendedTools(coreServices.db));
  toolRegistry.registerHandler(new DecisionLayerTools(llmAdapter));

  // EDRSR FTS + semantic search + on-demand vectorization
  const edsrFtsService = new EdsrFtsService();
  let edsrVectorizer: EdsrVectorizerService | undefined;
  try {
    edsrVectorizer = new EdsrVectorizerService();
    edsrVectorizer.setTokenUsageCallback((tokens, model, task) => {
      costTracker.recordVoyageCall({ model, totalTokens: tokens, task }).catch((err) => {
        logger.warn('Failed to record Voyage cost', { error: err.message });
      });
    });
  } catch (err: any) {
    logger.warn('EdsrVectorizerService not available (VOYAGEAI_API_KEY missing?)', { error: err.message });
  }
  if (edsrVectorizer) {
    toolRegistry.registerHandler(new EdsrSemanticTools(coreServices.db, edsrFtsService, edsrVectorizer));
    toolRegistry.registerHandler(new EdsrHybridTools(coreServices.db, edsrFtsService, edsrVectorizer));
  }
  // Import task manager (multi-IP downloads)
  toolRegistry.registerHandler(new ImportTaskTools(coreServices.importTaskService));

  logger.info('Core tool handlers registered with ToolRegistry');

  // Nextcloud integration
  const nextcloudService = new NextcloudService();
  toolRegistry.registerHandler(new NextcloudTools(nextcloudService));
  logger.info('Nextcloud tools registered');

  // Upload and storage services
  const uploadService = new UploadService(coreServices.db);
  const minioService = new MinioService();
  const metadataExtractor = new MetadataExtractor(llmAdapter);
  const vaultTools = new VaultTools(
    documentParser,
    coreServices.sectionizer,
    coreServices.patternStore,
    coreServices.embeddingService,
    coreServices.documentService,
    metadataExtractor
  );
  vaultTools.setMinioService(minioService);
  toolRegistry.registerHandler(vaultTools);
  logger.info('Upload, MinIO, and Vault services initialized');

  return {
    toolRegistry,
    serviceProxy,
    documentParser,
    documentAnalysisTools,
    batchDocumentTools,
    uploadService,
    minioService,
    vaultTools,
    edsrFtsService,
    edsrVectorizer,
  };
}

import express, { Request, Response, Router } from 'express';
import { createServer } from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './utils/logger.js';
import { dualAuth, requireJWT, optionalJWT, AuthenticatedRequest as DualAuthRequest } from './middleware/dual-auth.js';
import authRouter from './routes/auth.js';
import { setAuthCache } from './controllers/auth.js';
import { setOidcCache } from './services/oidc-service.js';
import { createBackendCoreServices, BackendCoreServices } from './factories/core-services.js';
import { createToolServices, ToolServices } from './factories/tool-services.js';
import { createAppServices, AppServices } from './factories/app-services.js';
import { createRestAPIRouter } from './routes/rest-api.js';
import { createBillingInlineRoutes } from './routes/billing-inline-routes.js';
import { createChatInlineRoutes } from './routes/chat-inline-routes.js';
import { createMiscInlineRoutes } from './routes/misc-inline-routes.js';
import { createBalanceCheckMiddleware } from './middleware/balance-check.js';
import { createPaymentRouter, createWebhookRouter } from './routes/payment-routes.js';
import { createBillingRoutes } from './routes/billing-routes.js';
import { createAdminRoutes } from './routes/admin-routes.js';
import { createB2BInvoiceRoutes } from './routes/b2b-invoice-routes.js';
import { createBillingServices, BillingServices } from './factories/billing-services.js';
import { createEncryptionRoutes } from './routes/encryption-routes.js';
import { createWorkerHeartbeatRoute } from './routes/worker-heartbeat-routes.js';
import { createDecisionsRoutes } from './routes/decisions-routes.js';
import { createERAUProxyRoutes } from './routes/erau-proxy-routes.js';
import { ERAUCacheService } from './services/erau-cache-service.js';
import { attachTerminalWebSocket } from './routes/terminal-routes.js';
import { createTeamRoutes } from './routes/team-routes.js';
import { createTeamService } from './services/team-service.js';
import { createTestEmailRoute } from './routes/test-email-route.js';
import { requestContext } from './utils/openai-client.js';
import passport from 'passport';
import { createApiKeyRouter } from './routes/api-key-routes.js';
import { getRedisClient } from './utils/redis-client.js';
import { CacheAdapter } from './infrastructure/adapters/cache-adapter.js';
import { LLMAdapter } from './infrastructure/adapters/llm-adapter.js';
import { createTemplateRoutes } from './routes/template-routes.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createOAuthRouter } from './routes/oauth-routes.js';
// createHybridAuthMiddleware available from './middleware/oauth-auth.js' if needed
import { mcpDiscoveryRateLimit, healthCheckRateLimit, webhookRateLimit, chatRateLimit, globalApiRateLimit } from './middleware/rate-limit.js';
import { ServiceType } from './types/gateway.js';
import { createUploadRouter } from './routes/upload-routes.js';
import { createConversationRouter } from './routes/conversation-routes.js';
import { createGdprRouter } from './routes/gdpr-routes.js';
import { createBlogCommentsRouter } from './routes/blog-comments.js';
import { createMatterRoutes } from './routes/matter-routes.js';
import { createContractRoutes } from './routes/contract-routes.js';
import { getUploadProcessingMetrics } from './routes/upload-routes.js';
import { createTimeEntryRoutes } from './routes/time-entry-routes.js';
import { createInvoiceRoutes } from './routes/invoice-routes.js';
import { getLLMManager } from './utils/llm-client-manager.js';
import { setRateLimitCache } from './middleware/rate-limit.js';
import { setUploadRateLimitCache } from './middleware/upload-rate-limit.js';
import { createClassificationRoutes } from './routes/classification-routes.js';
import { createWorkflowRoutes } from './routes/workflow-routes.js';
import { createAttorneyRoutes } from './routes/attorney-routes.js';
import { createConsultationRoutes } from './routes/consultation-routes.js';
import { JudgesService } from './services/judges-service.js';
import { createJudgesRoutes } from './routes/judges-routes.js';
import { JudgeAnalyticsService } from './services/judge-analytics-service.js';
import { createJudgeAnalyticsRoutes } from './routes/judge-analytics-routes.js';
import { createReferralRoutes } from './routes/referral-routes.js';
import { sanitizeId, maskSensitive } from './utils/sanitize-log.js';
import rateLimit from 'express-rate-limit';

dotenv.config();

class HTTPMCPServer {
  private app: express.Application;
  private services: BackendCoreServices;
  private billing: BillingServices;
  private tools: ToolServices;
  private app_: AppServices;
  private mcpSseSessions: Map<string, SSEServerTransport> = new Map();

  constructor() {
    this.app = express();
    this.app.set('trust proxy', 1);

    // Initialize core services via factory
    this.services = createBackendCoreServices();

    // Create LLM adapter for dependency injection
    const llmAdapter = new LLMAdapter(getLLMManager());

    // Initialize billing, payment, and cost tracking services via factory
    this.billing = createBillingServices(this.services.db, this.services.embeddingService);

    // Initialize tool registry, service proxy, document tools, upload/minio/vault via factory
    this.tools = createToolServices(this.services, this.billing.costTracker, llmAdapter);

    // Initialize all application services via factory
    this.app_ = createAppServices(this.services, this.billing, this.tools, llmAdapter);

    // Setup middleware and routes AFTER services are initialized
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    // CORS - разрешаем запросы от клиентов
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://legal.org.ua,https://stage.legal.org.ua').split(',').map(o => o.trim());
    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (server-to-server, curl, mobile apps)
        if (!origin) return callback(null, true);
        // Allow configured origins
        if (allowedOrigins.includes(origin)) return callback(null, true);
        // Allow localhost in development
        if (origin.match(/^https?:\/\/localhost(:\d+)?$/)) return callback(null, true);
        callback(new Error(`CORS not allowed for origin: ${origin}`));
      },
      credentials: true,
      exposedHeaders: ['X-Upload-Queue-Depth', 'X-Upload-Throttle', 'Retry-After', 'X-Total-Count'],
    }));

    // Global rate limiter (express-rate-limit) — recognised by CodeQL as proper rate limiting.
    // Our custom Redis-backed limiters still apply per-route for finer control.
    // Upload routes are excluded — they have their own per-user Redis-backed limits
    // (upload-rate-limit.ts) and the global IP-based limit blocks bulk folder uploads
    // through Cloudflare (all requests arrive from the same CF edge IP).
    this.app.use(rateLimit({
      windowMs: 60 * 1000,
      max: 900,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too Many Requests', code: 'RATE_LIMIT_EXCEEDED' },
      skip: (req) => req.path.startsWith('/upload'),
    }));

    // Monobank webhooks need raw body BEFORE json parsing for signature verification
    // Mount webhook routes with raw body parser and rate limiting
    this.app.use(
      '/webhooks',
      webhookRateLimit as any,
      express.raw({ type: 'application/json', limit: '10mb' }),
      createWebhookRouter(this.billing.monobankService, this.billing.binancePayService, this.billing.nowpaymentsService, this.app_.consultationPaymentService)
    );

    // JSON parsing with UTF-8 support (for all other routes)
    this.app.use(express.json({
      limit: '10mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      }
    }));

    // URL-encoded form parsing (required for OAuth 2.0 token endpoint)
    this.app.use(express.urlencoded({
      extended: true,
      limit: '10mb'
    }));

    // Initialize Passport middleware
    this.app.use(passport.initialize() as any);

    // Prometheus HTTP metrics middleware
    this.app.use((req, res, next) => {
      const start = process.hrtime.bigint();
      res.on('finish', () => {
        const durationNs = Number(process.hrtime.bigint() - start);
        const durationSec = durationNs / 1e9;
        const route = this.app_.metricsService.normalizeRoute(req.route?.path || req.path);
        const labels = { method: req.method, route, status_code: String(res.statusCode) };
        this.app_.metricsService.httpRequestDuration.observe(labels, durationSec);
        this.app_.metricsService.httpRequestsTotal.inc(labels);
      });
      next();
    });

    // Request logging
    this.app.use((req, _res, next) => {
      logger.info('HTTP request', {
        method: req.method,
        path: req.path,
        ip: req.ip,
      });
      next();
    });
  }

  /**
   * Create versioned tool router (v1)
   * Mounted at /api/v1/tools (canonical) and /api/tools (backward compat)
   */
  private createToolRouter(): Router {
    const router = Router();
    const balanceCheckMiddleware = createBalanceCheckMiddleware(this.billing.billingService, this.billing.costTracker);

    // Inject apiVersion into all JSON responses from this router
    router.use((_req: Request, res: Response, next) => {
      const originalJson = res.json.bind(res);
      res.json = (body: any) => {
        if (body && typeof body === 'object' && !Array.isArray(body)) {
          body.apiVersion = 'v1';
        }
        return originalJson(body);
      };
      next();
    });

    // GET / — List available tools
    router.get('/', dualAuth as any, (async (_req: DualAuthRequest, res: Response) => {
      try {
        const gatewayEnabled = process.env.ENABLE_UNIFIED_GATEWAY === 'true';

        if (gatewayEnabled) {
          const allTools = await this.tools.toolRegistry.getAllTools(
            this.tools.toolRegistry.getLocalToolDefinitions(),
            process.env.RADA_MCP_URL,
            process.env.RADA_API_KEY,
            process.env.OPENREYESTR_MCP_URL,
            process.env.OPENREYESTR_API_KEY
          );

          const counts = this.tools.toolRegistry.getToolCounts();

          res.json({
            tools: allTools,
            count: allTools.length,
            gateway: {
              enabled: true,
              services: counts,
            },
          });
        } else {
          const tools = this.tools.toolRegistry.getLocalToolDefinitions();

          res.json({
            tools,
            count: tools.length,
            gateway: {
              enabled: false,
            },
          });
        }
      } catch (error: any) {
        logger.error('Error listing tools:', error);
        res.status(500).json({
          error: 'Internal server error',
          message: error.message,
        });
      }
    }) as any);

    // POST /batch — Batch tool calls (must be before /:toolName)
    router.post('/batch', dualAuth as any, balanceCheckMiddleware as any, (async (req: DualAuthRequest, res: Response): Promise<void> => {
      try {
        const { calls } = req.body;

        if (!Array.isArray(calls)) {
          res.status(400).json({
            error: 'Invalid request',
            message: 'Expected array of tool calls in "calls" field',
          });
          return;
        }

        const results = await Promise.all(
          calls.map(async (call: { name: string; arguments?: any }) => {
            try {
              const result = await this.tools.toolRegistry.executeTool(
                call.name,
                call.arguments || {}
              );
              if (result === null || result === undefined) {
                return {
                  tool: call.name,
                  success: false,
                  error: `No handler registered for tool: ${call.name}`,
                };
              }
              return {
                tool: call.name,
                success: true,
                result,
              };
            } catch (error: any) {
              return {
                tool: call.name,
                success: false,
                error: error.message,
              };
            }
          })
        );

        res.json({
          success: true,
          results,
        });
      } catch (error: any) {
        logger.error('Batch tool call error:', error);
        res.status(500).json({
          error: 'Batch execution failed',
          message: error.message,
        });
      }
    }) as any);

    // POST /:toolName/stream — Dedicated SSE streaming endpoint
    router.post('/:toolName/stream', dualAuth as any, balanceCheckMiddleware as any, (async (req: DualAuthRequest, res: Response) => {
      try {
        const toolName = Array.isArray(req.params.toolName) ? req.params.toolName[0] : req.params.toolName;
        if (!toolName) {
          return res.status(400).json({ error: 'Tool name is required' });
        }
        const args = req.body.arguments || req.body;

        logger.info('Streaming tool call request', {
          tool: toolName,
          clientKey: req.clientKey?.substring(0, 8) + '...',
        });

        await this.handleStreamingToolCall(req, res, toolName, args);
      } catch (error: any) {
        logger.error('Streaming tool call error:', error);
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Tool execution failed',
            message: error.message,
            tool: req.params.toolName,
          });
        }
      }
    }) as any);

    // POST /:toolName — Execute MCP tool (with SSE support and cost tracking)
    router.post('/:toolName', dualAuth as any, balanceCheckMiddleware as any, (async (req: DualAuthRequest, res: Response) => {
      const requestId = uuidv4();
      const startTime = Date.now();

      try {
        const toolName = Array.isArray(req.params.toolName) ? req.params.toolName[0] : req.params.toolName;
        if (!toolName) {
          return res.status(400).json({ error: 'Tool name is required' });
        }
        const args = req.body.arguments || req.body;
        const acceptHeader = req.headers.accept || '';

        logger.info('Tool call request', {
          requestId,
          tool: toolName,
          clientKey: req.clientKey?.substring(0, 8) + '...',
          streaming: acceptHeader.includes('text/event-stream'),
        });

        // 1. Check credits BEFORE execution (for API key users)
        if (req.authType === 'apikey' && req.user?.id) {
          try {
            const creditsRequired = await this.billing.creditService.calculateCreditsForTool(toolName, req.user.id);

            if (creditsRequired > 0) {
              const balance = await this.billing.creditService.checkBalance(req.user.id, creditsRequired);

              if (!balance.hasCredits) {
                logger.warn('[HTTP API] Insufficient credits, blocking request', {
                  userId: req.user.id,
                  tool: toolName,
                  creditsRequired,
                  currentBalance: balance.currentBalance,
                });

                return res.status(402).json({
                  error: 'Insufficient credits',
                  code: 'INSUFFICIENT_CREDITS',
                  currentBalance: balance.currentBalance,
                  creditsRequired,
                  message: 'Your credit balance is too low to perform this operation. Please purchase more credits.',
                });
              }

              logger.debug('[HTTP API] Credit check passed', {
                userId: req.user.id,
                tool: toolName,
                creditsRequired,
                currentBalance: balance.currentBalance,
              });
            }
          } catch (creditError: any) {
            logger.error('[HTTP API] Error checking credits', {
              userId: req.user.id,
              tool: toolName,
              error: creditError.message,
            });
            // On error, allow the request to proceed (fail open)
          }
        }

        // 2. Create tracking record (pending)
        await this.billing.costTracker.createTrackingRecord({
          requestId,
          toolName,
          clientKey: req.clientKey,
          userId: req.user?.id,
          userQuery: args.query || JSON.stringify(args),
          queryParams: args,
        });

        // 3. Estimate cost BEFORE execution
        const estimate = await this.billing.costTracker.estimateCost({
          toolName,
          queryLength: (args.query || '').length,
          reasoningBudget: args.reasoning_budget || 'standard',
        });

        logger.info('Cost estimate before execution', {
          requestId,
          toolName,
          estimate,
        });

        // 4. Route to appropriate service (GATEWAY LOGIC)
        const gatewayEnabled = process.env.ENABLE_UNIFIED_GATEWAY === 'true';
        const route = gatewayEnabled ? this.tools.toolRegistry.getRoute(toolName) : null;

        let result: any;

        if (gatewayEnabled && route && !route.local) {
          // PROXIED EXECUTION - call remote service (RADA or OpenReyestr)
          logger.info('[Gateway] Proxying to remote service', {
            requestId,
            tool: toolName,
            service: route.service,
            serviceName: route.serviceName,
          });

          // Check if client wants SSE streaming
          if (acceptHeader.includes('text/event-stream')) {
            return await this.handleStreamingProxyCall(
              req,
              res,
              route.service,
              route.serviceName,
              args,
              requestId
            );
          }

          // Regular JSON request to remote service
          const remoteResult = await this.tools.serviceProxy.callRemoteService({
            service: route.service,
            serviceName: route.serviceName,
            args,
            requestId,
          });

          result = remoteResult.result || remoteResult;

        } else {
          // LOCAL EXECUTION - backend tools
          logger.debug('[Gateway] Executing locally', {
            requestId,
            tool: toolName,
            gatewayEnabled,
            routeFound: !!route,
          });

          // Check if client wants SSE streaming
          if (acceptHeader.includes('text/event-stream')) {
            return this.handleStreamingToolCall(req, res, toolName, args);
          }

          // Execute in request context
          result = await requestContext.run(
            { requestId, task: toolName },
            async () => {
              const VAULT_TOOLS = new Set(['store_document', 'get_document', 'list_documents', 'semantic_search', 'list_folders', 'delete_document', 'update_document']);
              const httpToolArgs = VAULT_TOOLS.has(toolName) ? { ...args, userId: req.user?.id } : args;
              return await this.tools.toolRegistry.executeTool(toolName, httpToolArgs);
            }
          );
        }

        // 4.5. Guard: if executeTool returned null, the tool doesn't exist
        if (result === null || result === undefined) {
          res.status(404).json({
            success: false,
            error: 'Tool not found',
            message: `No handler registered for tool: ${toolName}`,
          });
          return;
        }

        // 5. Complete tracking and get breakdown
        const executionTime = Date.now() - startTime;
        const breakdown = await this.billing.costTracker.completeTrackingRecord({
          requestId,
          executionTimeMs: executionTime,
          status: 'completed',
        });

        logger.info('Request completed with cost tracking', {
          requestId,
          toolName,
          totalCostUsd: breakdown.totals.cost_usd.toFixed(6),
        });

        // 6. Deduct credits after successful execution (for API key users)
        if (req.authType === 'apikey' && req.user?.id) {
          try {
            const creditsRequired = await this.billing.creditService.calculateCreditsForTool(toolName, req.user.id);

            if (creditsRequired > 0) {
              const deduction = await this.billing.creditService.deductCredits(
                req.user.id,
                creditsRequired,
                toolName,
                requestId,
                `Tool execution: ${toolName}`
              );

              if (deduction.success) {
                logger.info('[HTTP API] Credits deducted', {
                  userId: req.user.id,
                  tool: toolName,
                  creditsDeducted: creditsRequired,
                  newBalance: deduction.newBalance,
                });
              } else {
                logger.error('[HTTP API] Failed to deduct credits after execution', {
                  userId: req.user.id,
                  tool: toolName,
                  creditsRequired,
                  message: 'Balance was sufficient before execution but deduction failed',
                });
              }
            }
          } catch (creditError: any) {
            logger.error('[HTTP API] Error deducting credits', {
              userId: req.user.id,
              tool: toolName,
              error: creditError.message,
            });
          }
        }

        // 7. Return result with cost tracking info
        res.json({
          success: true,
          tool: toolName,
          service: route?.service || 'backend',
          result,
          cost_tracking: {
            request_id: requestId,
            estimate_before: estimate,
            actual_cost: breakdown,
          },
        });
      } catch (error: any) {
        logger.error('Tool call error:', error);

        const executionTime = Date.now() - startTime;
        try {
          await this.billing.costTracker.completeTrackingRecord({
            requestId,
            executionTimeMs: executionTime,
            status: 'failed',
            errorMessage: error.message,
          });
        } catch (trackingError) {
          logger.error('Failed to record error in cost tracking:', trackingError);
        }

        res.status(500).json({
          error: 'Tool execution failed',
          message: error.message,
          tool: req.params.toolName,
          cost_tracking: {
            request_id: requestId,
          },
        });
      }
    }) as any);

    return router;
  }

  private setupRoutes() {
    // Prometheus metrics endpoint (no auth - internal Docker network only)
    this.app.get('/metrics', async (_req, res) => {
      try {
        const metrics = await this.app_.metricsService.getMetrics();
        res.set('Content-Type', this.app_.metricsService.getContentType());
        res.end(metrics);
      } catch (err: any) {
        res.status(500).end(err.message);
      }
    });

    // Liveness probe — process is alive (always 200)
    this.app.get('/health/live', (_req, res) => {
      res.json({ status: 'ok' });
    });

    // Readiness probe — DB is accessible (200/503)
    this.app.get('/health/ready', healthCheckRateLimit as any, async (_req, res) => {
      try {
        const start = Date.now();
        await this.services.db.query('SELECT 1');
        const latencyMs = Date.now() - start;
        res.json({ status: 'ok', latencyMs });
      } catch (err: any) {
        logger.warn('Healthcheck /ready failed', { error: err.message });
        res.status(503).json({ status: 'unavailable', error: err.message });
      }
    });

    // Full health check with dependency status (public - no auth, rate limited)
    this.app.get('/health', healthCheckRateLimit as any, async (_req, res) => {
      const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {};
      let degraded = false;

      // PostgreSQL
      try {
        const start = Date.now();
        await this.services.db.query('SELECT 1');
        checks.postgres = { ok: true, latencyMs: Date.now() - start };
      } catch (err: any) {
        checks.postgres = { ok: false, error: err.message };
        degraded = true;
      }

      // Redis
      try {
        const start = Date.now();
        const redis = await getRedisClient();
        if (redis) {
          await redis.ping();
          checks.redis = { ok: true, latencyMs: Date.now() - start };
        } else {
          checks.redis = { ok: false, error: 'not connected' };
          degraded = true;
        }
      } catch (err: any) {
        checks.redis = { ok: false, error: err.message };
        degraded = true;
      }

      // Qdrant
      try {
        const start = Date.now();
        const qdrantResult = await this.services.embeddingService.healthCheck();
        checks.qdrant = { ...qdrantResult, latencyMs: Date.now() - start };
        if (!qdrantResult.ok) degraded = true;
      } catch (err: any) {
        checks.qdrant = { ok: false, error: err.message };
        degraded = true;
      }

      // MinIO
      try {
        const start = Date.now();
        const minioResult = await this.tools.minioService.healthCheck();
        checks.minio = { ...minioResult, latencyMs: Date.now() - start };
        if (!minioResult.ok) degraded = true;
      } catch (err: any) {
        checks.minio = { ok: false, error: err.message };
        degraded = true;
      }

      const status = degraded ? 'degraded' : 'ok';

      if (degraded) {
        const failedChecks = Object.entries(checks)
          .filter(([, v]) => !v.ok)
          .map(([k, v]) => `${k}: ${v.error}`);
        logger.warn('Healthcheck degraded', { failedChecks });
      }

      res.status(degraded ? 503 : 200).json({
        status,
        service: 'secondlayer-mcp-http',
        uptime: Math.round(process.uptime()),
        memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
        checks,
      });
    });

    // OPTIONS handler for /sse - returns OAuth configuration
    // This allows ChatGPT to discover OAuth endpoints
    this.app.options('/sse', (req: Request, res: Response) => {
      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const baseUrl = process.env.PUBLIC_URL || `${proto}://${host}`;

      res.setHeader('MCP-Auth-Type', 'oauth2');
      res.setHeader('MCP-Auth-Authorization-Endpoint', `${baseUrl}/oauth/authorize`);
      res.setHeader('MCP-Auth-Token-Endpoint', `${baseUrl}/oauth/token`);
      res.setHeader('MCP-Auth-Scopes', 'mcp');
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      res.status(200).send();
    });

    // GET handler for /sse - returns OAuth configuration as JSON
    // ChatGPT may use this for discovery
    this.app.get('/sse', (req: Request, res: Response) => {
      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const baseUrl = process.env.PUBLIC_URL || `${proto}://${host}`;

      res.json({
        protocol: 'mcp',
        version: '1.0',
        auth: {
          type: 'oauth2',
          authorization_endpoint: `${baseUrl}/oauth/authorize`,
          token_endpoint: `${baseUrl}/oauth/token`,
          scopes: ['mcp'],
        },
        capabilities: {
          tools: true,
        },
      });
    });

    // OAuth 2.0 Authorization Server Metadata (RFC 8414)
    // ChatGPT checks this for OAuth discovery
    this.app.get('/sse/.well-known/oauth-authorization-server', (req: Request, res: Response) => {
      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const baseUrl = process.env.PUBLIC_URL || `${proto}://${host}`;

      res.json({
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/oauth/authorize`,
        token_endpoint: `${baseUrl}/oauth/token`,
        registration_endpoint: `${baseUrl}/oauth/register`,
        revocation_endpoint: `${baseUrl}/oauth/revoke`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
        scopes_supported: ['mcp', 'claudeai'],
        code_challenge_methods_supported: ['S256', 'plain'],
      });
    });

    // OpenID Connect Discovery (for compatibility)
    this.app.get('/sse/.well-known/openid-configuration', (req: Request, res: Response) => {
      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const baseUrl = process.env.PUBLIC_URL || `${proto}://${host}`;

      res.json({
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/oauth/authorize`,
        token_endpoint: `${baseUrl}/oauth/token`,
        registration_endpoint: `${baseUrl}/oauth/register`,
        revocation_endpoint: `${baseUrl}/oauth/revoke`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
        scopes_supported: ['mcp', 'claudeai'],
        code_challenge_methods_supported: ['S256', 'plain'],
      });
    });

    // MCP SSE endpoint for ChatGPT web integration (REQUIRED auth)
    // Endpoint: POST /sse
    // This implements the Model Context Protocol over Server-Sent Events
    // Reference: https://platform.openai.com/docs/mcp
    this.app.post('/sse', (async (req: DualAuthRequest, res: Response) => {
      try {
        // CRITICAL: Authentication is REQUIRED for usage tracking
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          logger.warn('[MCP SSE] Missing or invalid Authorization header');
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Authorization header with Bearer token is required',
            code: 'MISSING_AUTH',
          });
        }

        const token = authHeader.replace('Bearer ', '');
        let userId: string | undefined;
        let clientKey: string | undefined;

        // Authenticate (JWT, OAuth, or API key)
        try {
          if (token.includes('.')) {
            // JWT token - verify and extract userId
            const jwt = await import('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'change-this-secret-in-production') as any;
            userId = decoded.userId;
            logger.debug('[MCP SSE] Authenticated with JWT', { userId });
          } else if (token.startsWith('mcp_token_')) {
            // OAuth 2.0 access token - verify with OAuth service
            const tokenData = await this.app_.oauthService.verifyAccessToken(token);

            if (!tokenData) {
              logger.warn('[MCP SSE] Invalid OAuth token', {
                tokenPrefix: maskSensitive(token, 15),
              });
              return res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid or expired OAuth access token',
                code: 'INVALID_OAUTH_TOKEN',
              });
            }

            userId = tokenData.userId;
            clientKey = tokenData.clientId;
            logger.debug('[MCP SSE] Authenticated with OAuth token', {
              userId,
              clientId: tokenData.clientId,
              scope: tokenData.scope,
            });
          } else {
            // API key - validate and get user info
            clientKey = token;
            const keyInfo = await this.billing.apiKeyService.validateApiKey(token);

            if (!keyInfo) {
              logger.warn('[MCP SSE] Invalid API key', {
                keyPrefix: maskSensitive(token, 12),
              });
              return res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid API key',
                code: 'INVALID_API_KEY',
              });
            }

            // Valid API key - check rate limits
            const rateLimit = await this.billing.apiKeyService.checkRateLimit(token);

            if (!rateLimit.allowed) {
              logger.warn('[MCP SSE] Rate limit exceeded', {
                keyId: keyInfo.id,
                reason: rateLimit.reason,
              });
              return res.status(429).json({
                error: 'Rate limit exceeded',
                code: 'RATE_LIMIT_EXCEEDED',
                reason: rateLimit.reason,
                requestsToday: rateLimit.requestsToday,
                rateLimitPerDay: rateLimit.rateLimitPerDay,
              });
            }

            // Get userId from API key
            userId = keyInfo.userId;
            logger.debug('[MCP SSE] Authenticated with API key', {
              userId,
              keyId: keyInfo.id,
              userEmail: keyInfo.userEmail,
            });

            // Update API key usage (async, don't wait)
            this.billing.apiKeyService.updateUsage(token).catch((err) => {
              logger.error('[MCP SSE] Failed to update API key usage', { error: err.message });
            });
          }
        } catch (error) {
          // Auth failed - return 401
          logger.warn('[MCP SSE] Authentication failed', { error: (error as Error).message });
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Authentication failed: ' + (error as Error).message,
            code: 'AUTH_FAILED',
          });
        }

        // Authentication successful - set SSE headers and handle connection
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        // Pass userId and clientKey to SSE handler
        await this.app_.mcpSSEServer.handleSSEConnection(req, res, userId, clientKey);
      } catch (error: any) {
        logger.error('[MCP SSE] Connection error:', error);
        if (!res.headersSent) {
          res.status(500).json({
            error: 'MCP SSE connection failed',
            message: error.message,
          });
        }
      }
    }) as any);

    // Standard MCP SSE endpoint for MCP clients (Claude Desktop, Jan chat, etc.)
    // Endpoint: GET/POST /v1/sse (SSE stream + client messages)
    // This implements the standard Model Context Protocol over SSE Transport
    // Reference: https://spec.modelcontextprotocol.io/specification/transports/#server-sent-events

    // POST handler: route messages to existing SSE sessions
    this.app.post('/v1/sse', (async (req: DualAuthRequest, res: Response) => {
      const sessionId = req.query.sessionId as string;
      if (!sessionId) {
        return res.status(400).json({ error: 'Missing sessionId query parameter' });
      }

      const transport = this.mcpSseSessions.get(sessionId);
      if (!transport) {
        return res.status(404).json({ error: 'Session not found', sessionId });
      }

      await transport.handlePostMessage(req, res, req.body);
    }) as any);

    // GET handler: establish new SSE stream
    this.app.get('/v1/sse', (async (req: DualAuthRequest, res: Response) => {
      try {
        logger.info('[MCP v1/sse] New standard MCP SSE connection');

        // REQUIRED authentication for usage tracking
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          logger.warn('[MCP v1/sse] Missing or invalid Authorization header');
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Authorization header with Bearer token is required',
            code: 'MISSING_AUTH',
          });
        }

        const token = authHeader.replace('Bearer ', '');
        let userId: string | undefined;
        let clientKey: string | undefined;

        // Authenticate (JWT, OAuth access token, or API key)
        try {
          if (token.includes('.')) {
            // JWT token
            const jwt = await import('jsonwebtoken');
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'change-this-secret-in-production') as any;
            userId = decoded.userId;
            logger.debug('[MCP v1/sse] Authenticated with JWT', { userId });
          } else {
            // Try OAuth access token first, then API key
            const oauthToken = await this.app_.oauthService.verifyAccessToken(token);
            if (oauthToken) {
              userId = oauthToken.userId;
              logger.debug('[MCP v1/sse] Authenticated with OAuth token', { userId: sanitizeId(userId || ''), clientId: sanitizeId(oauthToken.clientId) });
            } else {
              // API key
              clientKey = token;
              const keyInfo = await this.billing.apiKeyService.validateApiKey(token);

              if (!keyInfo) {
                logger.warn('[MCP v1/sse] Invalid API key', {
                  keyPrefix: maskSensitive(token, 8),
                });
                return res.status(401).json({
                  error: 'Unauthorized',
                  message: 'Invalid API key',
                  code: 'INVALID_API_KEY',
                });
              }

              // Check rate limits
              const rateLimit = await this.billing.apiKeyService.checkRateLimit(token);

              if (!rateLimit.allowed) {
                logger.warn('[MCP v1/sse] Rate limit exceeded', {
                  keyId: keyInfo.id,
                  reason: rateLimit.reason,
                });
                return res.status(429).json({
                  error: 'Rate limit exceeded',
                  code: 'RATE_LIMIT_EXCEEDED',
                  reason: rateLimit.reason,
                });
              }

              userId = keyInfo.userId;
              logger.debug('[MCP v1/sse] Authenticated with API key', {
                userId,
                keyId: keyInfo.id,
              });

              // Update API key usage
              this.billing.apiKeyService.updateUsage(token).catch((err) => {
                logger.error('[MCP v1/sse] Failed to update API key usage', { error: err.message });
              });
            }
          }
        } catch (error) {
          // Auth failed - return 401
          logger.warn('[MCP v1/sse] Authentication failed', { error: (error as Error).message });
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'Authentication failed: ' + (error as Error).message,
            code: 'AUTH_FAILED',
          });
        }

        // Create MCP Server instance for this connection
        const mcpServer = new Server(
          {
            name: 'secondlayer-mcp',
            version: '1.0.0',
          },
          {
            capabilities: {
              tools: {},
            },
          }
        );

        // Setup tools/list handler
        mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
          return {
            tools: this.tools.toolRegistry.getLocalToolDefinitions(),
          };
        });

        // Setup tools/call handler with billing integration
        mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
          const toolName = request.params.name;
          const args = request.params.arguments || {};
          const requestId = `mcp-v1-${uuidv4()}`;
          const startTime = Date.now();

          try {
            logger.info('[MCP v1/sse] Tool call', {
              tool: toolName,
              userId: sanitizeId(userId || 'anonymous'),
            });

            // Phase 2 Billing: Check credits BEFORE execution
            if (userId && this.billing.creditService) {
              const creditsRequired = await this.billing.creditService.calculateCreditsForTool(toolName, userId);

              if (creditsRequired > 0) {
                const balance = await this.billing.creditService.checkBalance(userId, creditsRequired);

                if (!balance.hasCredits) {
                  logger.warn('[MCP v1/sse] Insufficient credits', {
                    userId: sanitizeId(userId),
                    tool: toolName,
                    creditsRequired,
                  });

                  return {
                    content: [
                      {
                        type: 'text',
                        text: `Error: Insufficient credits. Required: ${creditsRequired}, Current balance: ${balance.currentBalance}`,
                      },
                    ],
                    isError: true,
                  };
                }
              }
            }

            // Create cost tracking record
            await this.billing.costTracker.createTrackingRecord({
              requestId,
              toolName,
              clientKey,
              userId,
              userQuery: String(args.query || JSON.stringify(args)),
              queryParams: args,
            });

            // Execute tool in request context
            const result = await requestContext.run(
              { requestId, task: toolName },
              async () => {
                // Route to appropriate tool handler via centralized registry
                // Inject userId for all vault tools (user isolation)
                const VAULT_TOOLS = new Set(['store_document', 'get_document', 'list_documents', 'semantic_search', 'list_folders', 'delete_document', 'update_document']);
                const toolArgs = VAULT_TOOLS.has(toolName) ? { ...args, userId } : args;
                const registryResult = await this.tools.toolRegistry.executeTool(toolName, toolArgs);
                if (registryResult) {
                  return registryResult;
                }
                throw new Error(`Unknown tool: ${toolName}`);
              }
            );

            // Complete cost tracking
            const executionTime = Date.now() - startTime;
            await this.billing.costTracker.completeTrackingRecord({
              requestId,
              executionTimeMs: executionTime,
              status: 'completed',
            });

            // Phase 2 Billing: Deduct credits after successful execution
            if (userId && this.billing.creditService) {
              const creditsRequired = await this.billing.creditService.calculateCreditsForTool(toolName, userId);

              if (creditsRequired > 0) {
                const deduction = await this.billing.creditService.deductCredits(
                  userId,
                  creditsRequired,
                  toolName,
                  requestId,
                  `Tool execution: ${toolName}`
                );

                if (deduction.success) {
                  logger.info('[MCP v1/sse] Credits deducted', {
                    userId: sanitizeId(userId),
                    tool: toolName,
                    creditsDeducted: creditsRequired,
                    newBalance: deduction.newBalance,
                  });
                }
              }
            }

            // Return result in MCP format
            return {
              content: result.content || [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };

          } catch (error: any) {
            logger.error('[MCP v1/sse] Tool execution error', {
              tool: toolName,
              error: error.message,
            });

            // Record failure
            const executionTime = Date.now() - startTime;
            await this.billing.costTracker.completeTrackingRecord({
              requestId,
              executionTimeMs: executionTime,
              status: 'failed',
              errorMessage: error.message,
            });

            return {
              content: [
                {
                  type: 'text',
                  text: `Error: ${error.message}`,
                },
              ],
              isError: true,
            };
          }
        });

        // Create SSE transport
        const transport = new SSEServerTransport('/v1/sse', res);

        // Store session for POST message routing
        this.mcpSseSessions.set(transport.sessionId, transport);

        // Connect MCP server to transport
        await mcpServer.connect(transport);

        logger.info('[MCP v1/sse] Connection established', { sessionId: transport.sessionId });

        // Handle client disconnect
        req.on('close', () => {
          logger.info('[MCP v1/sse] Client disconnected', { sessionId: transport.sessionId });
          this.mcpSseSessions.delete(transport.sessionId);
          mcpServer.close();
        });

      } catch (error: any) {
        logger.error('[MCP v1/sse] Connection error:', error);
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Failed to establish MCP SSE connection',
            message: error.message,
          });
        }
      }
    }) as any);

    // MCP discovery endpoint (public - lists available tools, rate limited)
    // GET /mcp - Returns MCP server info and capabilities
    this.app.get('/mcp', mcpDiscoveryRateLimit as any, (_req: Request, res: Response) => {
      const tools = this.app_.mcpSSEServer.getAllTools();
      res.json({
        protocolVersion: '2024-11-05',
        serverInfo: {
          name: 'SecondLayer Legal MCP Server',
          version: '1.0.0',
          description: 'Ukrainian legal research and document analysis platform',
        },
        capabilities: {
          tools: {
            count: tools.length,
            listChanged: false,
          },
          prompts: {},
          resources: {},
        },
        endpoints: {
          sse: '/sse',
          'sse-standard': '/v1/sse',
          http: '/api/tools',
        },
        tools: tools.map(t => ({
          name: t.name,
          description: t.description,
        })),
      });
    });

    // Authentication routes (public - OAuth endpoints, optional JWT for /auth/me etc.)
    this.app.use('/auth', optionalJWT as any, authRouter);

    // Redirect /authorize to /oauth/authorize (for Claude.ai compatibility)
    this.app.get('/authorize', (req: Request, res: Response) => {
      const queryString = new URLSearchParams(req.query as any).toString();
      res.redirect(301, `/oauth/authorize?${queryString}`);
    });

    this.app.post('/authorize', (req: Request, res: Response) => {
      res.redirect(307, '/oauth/authorize');
    });

    // Redirect /token to /oauth/token (for Claude.ai compatibility)
    this.app.post('/token', (req: Request, res: Response) => {
      res.redirect(307, '/oauth/token');
    });

    // Root-level .well-known endpoints for OAuth discovery (Claude.ai compatibility)
    this.app.get('/.well-known/oauth-authorization-server', (req: Request, res: Response) => {
      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const baseUrl = process.env.PUBLIC_URL || `${proto}://${host}`;
      res.json({
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/oauth/authorize`,
        token_endpoint: `${baseUrl}/oauth/token`,
        registration_endpoint: `${baseUrl}/oauth/register`,
        revocation_endpoint: `${baseUrl}/oauth/revoke`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
        scopes_supported: ['mcp', 'claudeai'],
        code_challenge_methods_supported: ['S256', 'plain'],
      });
    });

    this.app.get('/.well-known/openid-configuration', (req: Request, res: Response) => {
      const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const baseUrl = process.env.PUBLIC_URL || `${proto}://${host}`;
      res.json({
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/oauth/authorize`,
        token_endpoint: `${baseUrl}/oauth/token`,
        registration_endpoint: `${baseUrl}/oauth/register`,
        revocation_endpoint: `${baseUrl}/oauth/revoke`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code'],
        token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
        scopes_supported: ['mcp', 'claudeai'],
        code_challenge_methods_supported: ['S256', 'plain'],
      });
    });

    // Redirect /register to /oauth/register (for MCP client compatibility)
    this.app.post('/register', (req: Request, res: Response) => {
      res.redirect(307, '/oauth/register');
    });

    // OAuth 2.0 routes for ChatGPT integration (public)
    this.app.use('/oauth', createOAuthRouter(this.app_.oauthService));
    logger.info('OAuth 2.0 routes registered at /oauth');

    // Global API rate limiter — baseline protection for all /api/ routes (120 req/min per IP).
    // More specific per-endpoint limiters (auth, chat, upload, etc.) still apply additionally.
    this.app.use('/api', globalApiRateLimit as any);

    // Document classification routes - must come before /api/documents generic REST route
    this.app.use('/api/documents/classify', requireJWT as any, createClassificationRoutes(this.app_.classificationService));

    // REST API for admin panel (CRUD operations) - require JWT (user login)
    this.app.use('/api/documents', requireJWT as any, createRestAPIRouter(this.services.db));
    this.app.use('/api/patterns', requireJWT as any, createRestAPIRouter(this.services.db));
    this.app.use('/api/queries', requireJWT as any, createRestAPIRouter(this.services.db));

    // User profile endpoint - require JWT
    this.app.use('/api/auth', requireJWT as any, authRouter);

    // Phase 2 Billing: API key management - require JWT (user login)
    this.app.use('/api/keys', requireJWT as any, createApiKeyRouter(this.billing.apiKeyService, this.billing.creditService));
    logger.info('API key management routes registered at /api/keys');

    // EULA endpoints - REMOVED: not needed
    // this.app.use('/api/eula', createEULARouter(this.services.db.getPool()));

    // Geo detection endpoint (public, no auth required)
    // Returns country/language/currency defaults based on Cloudflare headers
    this.app.get('/api/geo', (async (req: Request, res: Response) => {
      try {
        // Cloudflare adds CF-IPCountry header automatically for proxied domains
        const cfCountry = (req.headers['cf-ipcountry'] as string || '').toUpperCase();
        const acceptLang = req.headers['accept-language'] || '';

        // Determine country
        const country = cfCountry && cfCountry !== 'XX' && cfCountry !== 'T1'
          ? cfCountry
          : 'OTHER';

        // Determine language from country or Accept-Language
        let language = 'en';
        if (country === 'UA' || acceptLang.startsWith('uk')) {
          language = 'uk';
        }

        // Determine currency from country
        let currency = 'USD';
        if (country === 'UA') {
          currency = 'UAH';
        } else if (['DE', 'FR', 'NL', 'EE', 'AT', 'BE', 'ES', 'IT', 'PT', 'FI', 'IE', 'LU', 'SK', 'SI', 'LV', 'LT', 'MT', 'CY', 'GR', 'HR'].includes(country)) {
          currency = 'EUR';
        }

        res.json({ country, language, currency });
      } catch (error: any) {
        logger.error('[GeoAPI] Failed to detect geo', { error: error.message });
        res.json({ country: 'OTHER', language: 'uk', currency: 'UAH' });
      }
    }) as any);

    // Currency exchange rate endpoint (public, no auth required)
    this.app.get('/api/currency/rate', (async (_req: Request, res: Response) => {
      try {
        const rateInfo = await this.billing.currencyService.getUsdToUahRate();
        res.json(rateInfo);
      } catch (error: any) {
        logger.error('[CurrencyAPI] Failed to get exchange rate', { error: error.message });
        res.status(500).json({ error: 'Не вдалося отримати курс валют' });
      }
    }) as any);

    // Billing inline routes (balance, history, topup, settings, statistics, invoices)
    this.app.use('/api/billing', requireJWT as any, createBillingInlineRoutes({
      billingService: this.billing.billingService,
      costTracker: this.billing.costTracker,
      invoiceService: this.billing.invoiceService,
      currencyService: this.billing.currencyService,
      db: this.services.db,
    }));

    // Payment routes - require JWT (user login)
    // POST /api/billing/payment/monobank/create - Create Monobank invoice
    // POST /api/billing/payment/nowpayments/create - Create NOWPayments invoice
    // GET /api/billing/payment/monobank/:invoiceId/status - Check Monobank status
    // GET /api/billing/payment/:provider/:paymentId/status - Check payment status
    this.app.use('/api/billing/payment', requireJWT as any, createPaymentRouter(this.billing.monobankService, this.billing.metamaskService, this.billing.binancePayService, this.billing.nowpaymentsService, this.services.db));

    // Test email route - require JWT (user login)
    // POST /api/billing/test-email - Send test email
    this.app.use('/api/billing/test-email', requireJWT as any, createTestEmailRoute(this.billing.emailService));

    // Billing and user preferences routes
    // GET /api/billing/preferences - Get user request preferences
    // PUT /api/billing/preferences - Update user preferences
    // POST /api/billing/preferences/preset - Apply preset configuration
    // GET /api/billing/presets - Get all available presets
    // POST /api/billing/estimate-costs - Estimate costs for different presets
    // GET /api/billing/full-settings - Get combined billing and preferences
    // GET /api/billing/pricing-info - Get pricing tier information
    // POST /api/billing/estimate-price - Estimate price with user's tier
    this.app.use('/api/billing', requireJWT as any, createBillingRoutes(this.billing.billingService, this.billing.userPreferencesService, this.billing.pricingService));

    // B2B Invoice routes - bank transfer invoicing for legal entities
    this.app.use('/api/b2b-invoices', requireJWT as any, createB2BInvoiceRoutes(this.billing.b2bInvoiceService, this.billing.billingService, this.billing.subscriptionService, this.services.db));

    // Team management routes
    // GET /api/team/members - Get team members
    // POST /api/team/invite - Invite new member
    // PUT /api/team/members/:memberId - Update member role
    // DELETE /api/team/members/:memberId - Remove member
    // POST /api/team/members/:memberId/resend-invite - Resend invitation
    // GET /api/team/stats - Get team statistics
    const teamService = createTeamService(this.services.db);
    this.app.use('/api/team', requireJWT as any, createTeamRoutes(teamService));

    // Conversation routes - server-side chat persistence
    this.app.use('/api/conversations', requireJWT as any, createConversationRouter(this.app_.conversationService));
    logger.info('Conversation routes registered at /api/conversations');

    // Blog comments - GET is public, POST/DELETE require JWT (checked inside handler)
    this.app.use('/api/blog', optionalJWT as any, createBlogCommentsRouter(this.services.db.getPool()));
    logger.info('Blog comments routes registered at /api/blog/comments');

    // GDPR routes - data export and deletion
    this.app.use('/api/gdpr', requireJWT as any, createGdprRouter(this.app_.gdprService));
    logger.info('GDPR routes registered at /api/gdpr');

    // Upload routes - chunked file upload with MinIO storage
    // POST /api/upload/init - Create upload session
    // POST /api/upload/:uploadId/chunk - Upload chunk
    // POST /api/upload/:uploadId/complete - Assemble and process
    // GET /api/upload/:uploadId/status - Check status
    // DELETE /api/upload/:uploadId - Cancel
    // GET /api/upload/active - List active sessions
    this.app.use('/api/upload', requireJWT as any, createUploadRouter(
      this.tools.uploadService,
      this.tools.minioService,
      this.tools.vaultTools,
      this.services.db,
      this.app_.uploadQueueService,
      this.services.documentService
    ));
    logger.info('Upload routes registered at /api/upload');

    // Client-Matter segregation routes (matters, clients, legal holds, audit)
    this.app.use('/api/matters', requireJWT as any, createMatterRoutes(
      this.app_.matterService, this.app_.conflictCheckService, this.app_.legalHoldService, this.app_.auditService,
      this.services.db, this.app_.llmAdapter
    ));
    logger.info('Matter routes registered at /api/matters');

    // Contract acceptance routes
    this.app.use('/api/contracts', requireJWT as any, createContractRoutes(this.app_.contractService));
    logger.info('Contract routes registered at /api/contracts');

    // Referral system routes
    this.app.use('/api/referral', createReferralRoutes(this.billing.referralService));
    logger.info('Referral routes registered at /api/referral');

    // Judges routes - search judges from VKKS data
    const judgesService = new JudgesService(this.services.db, this.services.zoAdapter);
    this.app.use('/api/judges', requireJWT as any, createJudgesRoutes(judgesService));

    // Judge analytics routes - pre-computed metrics from EDRSR
    const judgeAnalyticsService = new JudgeAnalyticsService(this.services.db);
    this.app.use('/api/judge-analytics', requireJWT as any, createJudgeAnalyticsRoutes(judgeAnalyticsService));
    logger.info('Judge analytics routes registered at /api/judge-analytics');

    // Decisions routes - download court decision full texts from reyestr.court.gov.ua
    this.app.use('/api/decisions', requireJWT as any, createDecisionsRoutes(this.services.reyestrDownloadService));
    logger.info('Decisions routes registered at /api/decisions');

    // ERAU proxy - Ukrainian Bar Registry (public, no auth required)
    const erauCacheService = new ERAUCacheService(this.services.db);
    this.app.use('/api/erau', optionalJWT as any, createERAUProxyRoutes(erauCacheService, this.services.db));
    logger.info('ERAU proxy routes registered at /api/erau');

    // Worker heartbeat (uses dualAuth so EC2 workers can auth with SECONDARY_LAYER_KEYS)
    // MUST be before the catch-all /api workflow routes
    this.app.use('/api/workers', dualAuth as any, createWorkerHeartbeatRoute());
    logger.info('Worker heartbeat routes registered at /api/workers');

    // Workflow routes - workflow sets, workflow execution, cancellation
    // IMPORTANT: Use specific prefixes, NOT '/api' — a catch-all '/api' prefix with requireJWT
    // would block API key auth for all /api/* routes (including /api/tools with dualAuth)
    this.app.use('/api/workflow-sets', requireJWT as any, createWorkflowRoutes(this.app_.workflowService, this.app_.workflowExecutorService));
    this.app.use('/api/workflows', requireJWT as any, createWorkflowRoutes(this.app_.workflowService, this.app_.workflowExecutorService));
    logger.info('Workflow routes registered at /api/workflow-sets, /api/workflows');

    // Time tracking and billing routes
    this.app.use('/api/time', requireJWT as any, createTimeEntryRoutes(this.app_.timeEntryService));
    logger.info('Time tracking routes registered at /api/time');

    this.app.use('/api/invoicing', requireJWT as any, createInvoiceRoutes(this.app_.matterInvoiceService));
    logger.info('Invoicing routes registered at /api/invoicing');

    // Attorney routes - search is public (optionalJWT), profile management requires JWT
    this.app.use('/api/attorneys', optionalJWT as any, createAttorneyRoutes(this.app_.attorneyProfileService));
    logger.info('Attorney routes registered at /api/attorneys');

    // E2EE encryption key management routes - all require JWT
    this.app.use('/api/encryption', requireJWT as any, createEncryptionRoutes(this.billing.encryptionKeyService, this.services.db));
    logger.info('Encryption routes registered at /api/encryption');

    // Consultation routes - all require JWT
    this.app.use('/api/consultations', requireJWT as any, createConsultationRoutes(
      this.app_.consultationService, this.app_.consultationPaymentService
    ));
    logger.info('Consultation routes registered at /api/consultations');

    // Admin routes - require JWT + admin privileges
    // GET /api/admin/stats/overview - Dashboard statistics
    // GET /api/admin/stats/revenue-chart - Revenue chart data
    // GET /api/admin/stats/tier-distribution - User tier distribution
    // GET /api/admin/users - List all users
    // GET /api/admin/users/:userId - Get user details
    // PUT /api/admin/users/:userId/tier - Update user tier
    // POST /api/admin/users/:userId/adjust-balance - Adjust user balance
    // PUT /api/admin/users/:userId/limits - Update user limits
    // GET /api/admin/transactions - List all transactions
    // POST /api/admin/transactions/:transactionId/refund - Refund transaction
    // GET /api/admin/analytics/cohorts - Cohort analysis
    // GET /api/admin/analytics/usage - Usage analytics
    // GET /api/admin/api-keys - List API keys
    // GET /api/admin/settings - Get system settings
    this.app.use('/api/admin', requireJWT as any, createAdminRoutes(this.services.db, this.billing.billingService, this.billing.userPreferencesService, this.billing.prometheusService, this.billing.pricingService, this.billing.subscriptionService, this.app_.configService));

    // Upload metrics endpoint (admin)
    this.app.get('/api/admin/upload-metrics', requireJWT as any, (async (_req: DualAuthRequest, res: express.Response) => {
      try {
        const queueMetrics = await this.app_.uploadQueueService.getMetrics();
        const processingMetrics = getUploadProcessingMetrics();
        res.json({
          queue: queueMetrics,
          processing: processingMetrics,
        });
      } catch (error: any) {
        logger.error('[Admin] Upload metrics failed', { error: error.message });
        res.status(500).json({ error: error.message });
      }
    }) as any);

    // Template system routes - Dynamic template classification, matching, generation, and analytics
    // POST /api/templates/classify-question - Classify question intent
    // GET /api/templates/classify-question/stats - Classification statistics
    // GET /api/templates/match - Match question against existing templates
    // POST /api/templates/match/batch - Batch match multiple questions
    // POST /api/templates/generate - Generate new template from unmatched question
    // GET /api/templates/generation/:id/status - Check generation status
    // PUT /api/templates/generation/:id/approve - Approve generated template (admin)
    // PUT /api/templates/generation/:id/reject - Reject generated template (admin)
    // GET /api/templates/list - List all templates
    // GET /api/templates/:id - Get template details
    // PUT /api/templates/:id - Update template (admin)
    // DELETE /api/templates/:id - Deprecate template (admin)
    // GET /api/templates/recommendations/for-me - Personalized recommendations
    // GET /api/templates/trending - Trending templates
    // POST /api/templates/:id/feedback - Submit feedback
    // POST /api/templates/:id/rate - Rate template
    // GET /api/templates/:id/metrics - Get template metrics
    // GET /api/templates/analytics/dashboard - Analytics dashboard
    // POST /api/templates/metrics/aggregate - Aggregate metrics (admin)
    this.app.use('/api/templates', requireJWT as any, createTemplateRoutes(this.services.db));


    // ============ KMU RSS Proxy ============
    // GET /api/proxy/kmu-rss - Proxy KMU government news RSS feed via headless browser (bypasses Radware bot protection)
    this.app.get('/api/proxy/kmu-rss', requireJWT as any, (async (_req: DualAuthRequest, res: Response) => {
      const KMU_RSS_URL = 'https://www.kmu.gov.ua/api/rss';
      const CACHE_KEY = 'kmu_rss_cache';
      const CACHE_TTL = 1800; // 30 minutes
      try {
        // Try Redis cache first
        const redis = await getRedisClient();
        if (!redis) {
          return res.status(503).json({ error: 'Redis unavailable' });
        }
        const cached = await redis.get(CACHE_KEY);
        if (cached) {
          logger.info('[KMU RSS Proxy] Serving from cache');
          res.set('Content-Type', 'application/xml; charset=utf-8');
          res.set('Cache-Control', 'public, max-age=600');
          res.set('X-Cache', 'HIT');
          return res.send(cached);
        }

        // Fetch via headless browser to bypass bot protection
        logger.info('[KMU RSS Proxy] Cache miss, fetching via headless browser');
        const { chromium } = await import('playwright');
        const browser = await chromium.launch({
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });
        try {
          const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            ignoreHTTPSErrors: true,
          });
          const page = await context.newPage();

          // Intercept the RSS response to get raw body (browser wraps XML in HTML viewer)
          let rawXml = '';
          page.on('response', async (resp) => {
            if (resp.url().includes('/api/rss') && resp.status() === 200) {
              try {
                rawXml = await resp.text();
              } catch { /* ignore */ }
            }
          });

          await page.goto(KMU_RSS_URL, { waitUntil: 'networkidle', timeout: 30000 });
          await context.close();

          if (!rawXml || (!rawXml.includes('<rss') && !rawXml.includes('<channel>'))) {
            logger.warn('[KMU RSS Proxy] Response does not look like RSS', { bodySnippet: (rawXml || '').substring(0, 200) });
            return res.status(502).json({ error: 'KMU RSS returned non-RSS content' });
          }

          const xml = rawXml;

          // Cache in Redis
          await redis.setEx(CACHE_KEY, CACHE_TTL, xml);
          logger.info('[KMU RSS Proxy] Fetched and cached successfully');

          res.set('Content-Type', 'application/xml; charset=utf-8');
          res.set('Cache-Control', 'public, max-age=600');
          res.set('X-Cache', 'MISS');
          res.send(xml);
        } finally {
          await browser.close();
        }
      } catch (error: any) {
        logger.error('[KMU RSS Proxy] Error', { error: error.message });
        res.status(502).json({ error: 'Failed to fetch KMU RSS feed' });
      }
    }) as any);
    logger.info('KMU RSS Proxy endpoint registered at GET /api/proxy/kmu-rss');

    // Chat routes (plan review + AI chat with SSE streaming)
    this.app.use('/api/chat', requireJWT as any, createChatInlineRoutes({
      chatService: this.app_.chatService,
      billingService: this.billing.billingService,
      costTracker: this.billing.costTracker,
      db: this.services.db,
    }));
    logger.info('Chat routes registered at /api/chat');



    // MCP tool endpoints - versioned API (v1)
    // Mount at /api/v1/tools (canonical) and /api/tools (backward compat alias)
    const toolRouter = this.createToolRouter();
    this.app.use('/api/v1/tools', toolRouter);
    this.app.use('/api/tools', toolRouter);
    logger.info('Tool routes registered at /api/v1/tools and /api/tools (backward compat)');



    // Misc inline routes (documents, legislation, history, prompts, internal stats)
    this.app.use('/api', createMiscInlineRoutes({
      db: this.services.db,
      classificationService: this.app_.classificationService,
      vaultTools: this.tools.vaultTools,
      minioService: this.tools.minioService,
      legislationTools: this.services.legislationTools,
    }));

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not found',
        message: `Route ${req.method} ${req.path} not found`,
      });
    });

    // Error handler
    this.app.use((err: any, _req: Request, res: Response, _next: any) => {
      logger.error('Unhandled error:', err);
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred',
      });
    });
  }

  async initialize() {
    try {
      await this.services.db.connect();
      await this.services.embeddingService.initialize();
      await this.tools.documentParser.initialize();

      // Initialize Redis cache for services (optional)
      const redis = await getRedisClient();
      if (redis) {
        const cache = new CacheAdapter(redis);
        this.services.legislationTools.setRedisClient(cache);
        this.services.zoAdapter.setCachePort(cache);
        this.services.zoPracticeAdapter.setCachePort(cache);
        this.services.zoSessionsAdapter.setCachePort(cache);
        this.services.zoLegalActsAdapter.setCachePort(cache);
        this.services.zoECHRAdapter.setCachePort(cache);
        this.services.shepardizationService.setCachePort(cache);
        this.app_.chatSearchCache.setCachePort(cache);
        setAuthCache(cache);
        setOidcCache(cache);
        setRateLimitCache(cache);
        setUploadRateLimitCache(cache);
        logger.info('Redis connected - caching enabled for all services');
      } else {
        logger.info('Redis not available - services will work without caching');
      }

      // Cleanup expired upload sessions every hour
      setInterval(() => {
        this.tools.uploadService.cleanupExpired().catch((err) => {
          logger.error('Upload cleanup failed', { error: err.message });
        });
      }, 60 * 60 * 1000);

      // Cleanup stale pending/uploading sessions every 5 minutes
      setInterval(() => {
        this.tools.uploadService.cleanupStale(30).catch((err) => {
          logger.error('Upload stale cleanup failed', { error: err.message });
        });
      }, 5 * 60 * 1000);
      // Run once on startup too
      this.tools.uploadService.cleanupStale(30).catch((err) => {
        logger.error('Upload stale cleanup on startup failed', { error: err.message });
      });

      // Start upload recovery service (30s delay, then every 5 min)
      this.app_.uploadRecoveryService.start();
      logger.info('Upload recovery service started');

      logger.info('HTTP MCP Server services initialized');
    } catch (error) {
      logger.error('Failed to initialize server:', error);
      throw error;
    }
  }

  private async handleStreamingProxyCall(
    _req: DualAuthRequest,
    res: Response,
    service: ServiceType,
    serviceName: string,
    args: any,
    requestId: string
  ): Promise<void> {
    // Validate service is not backend
    if (service === 'backend') {
      throw new Error('Cannot proxy backend service');
    }
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      logger.info('[Gateway SSE] Proxying stream from remote service', {
        requestId,
        service,
        tool: serviceName,
      });

      // Get remote service stream
      const stream = await this.tools.serviceProxy.callRemoteService({
        service,
        serviceName,
        args,
        requestId,
        acceptHeader: 'text/event-stream',
      });

      // Forward SSE events from remote service to client
      stream.on('data', (chunk: Buffer) => {
        res.write(chunk);
      });

      stream.on('end', () => {
        logger.info('[Gateway SSE] Stream completed', { requestId, service });
        res.end();
      });

      stream.on('error', (error: Error) => {
        logger.error('[Gateway SSE] Stream error', {
          requestId,
          service,
          error: error.message,
        });
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify({ message: error.message })}\n\n`);
        res.end();
      });
    } catch (error: any) {
      logger.error('[Gateway SSE] Proxy failed', {
        requestId,
        service,
        error: error.message,
      });

      // Send error event
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ message: error.message })}\n\n`);
      res.end();
    }
  }

  private async handleStreamingToolCall(
    _req: DualAuthRequest,
    res: Response,
    toolName: string,
    args: any
  ): Promise<void> {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send initial connection event
    this.sendSSEEvent(res, {
      type: 'connected',
      data: { tool: toolName, timestamp: new Date().toISOString() },
      id: 'connection',
    });

    try {
      // Streaming support for different tools
      if (this.tools.toolRegistry.supportsStreaming(toolName)) {
        await this.tools.toolRegistry.executeToolStream(toolName, args, (event: any) => {
          this.sendSSEEvent(res, event);
        });
      } else if (toolName === 'batch_process_documents') {
        // Batch document processing with real-time progress
        await this.tools.batchDocumentTools.processBatch(args, (event) => {
          this.sendSSEEvent(res, event);
        });
      } else {
        // For other tools, stream the regular result
        const result = await this.tools.toolRegistry.executeTool(toolName, args);
        if (result === null || result === undefined) {
          this.sendSSEEvent(res, {
            type: 'error',
            data: { message: `No handler registered for tool: ${toolName}` },
            id: 'error',
          });
        } else {
          this.sendSSEEvent(res, {
            type: 'progress',
            data: { message: 'Processing...', progress: 0.5 },
            id: 'processing',
          });
          this.sendSSEEvent(res, {
            type: 'complete',
            data: result,
            id: 'final',
          });
        }
      }
    } catch (error: any) {
      this.sendSSEEvent(res, {
        type: 'error',
        data: {
          message: error.message,
          error: error.toString(),
        },
        id: 'error',
      });
    } finally {
      // Send end event and close connection
      this.sendSSEEvent(res, {
        type: 'end',
        data: { message: 'Stream completed' },
        id: 'end',
      });
      res.end();
    }
  }

  private sendSSEEvent(res: Response, event: {
    type: string;
    data: any;
    id?: string;
  }): void {
    try {
      if (event.id) {
        res.write(`id: ${event.id}\n`);
      }
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event.data)}\n\n`);
    } catch (error) {
      logger.error('Error sending SSE event:', error);
    }
  }

  async start() {
    await this.initialize();

    const port = parseInt(process.env.HTTP_PORT || '3000', 10);
    const host = process.env.HTTP_HOST || '0.0.0.0';

    const httpServer = createServer(this.app);

    // Attach admin terminal WebSocket
    attachTerminalWebSocket(httpServer, this.services.db);

    httpServer.listen(port, host, () => {
      logger.info(`HTTP MCP Server started on http://${host}:${port}`);
      logger.info('Available endpoints:');
      logger.info('  GET  /health - Health check');
      logger.info('  GET  /mcp - MCP server info and capabilities');
      logger.info('  POST /sse - MCP SSE endpoint for ChatGPT web');
      logger.info('  GET  /api/tools - List available tools');
      logger.info('  POST /api/tools/:toolName - Call a tool (JSON or SSE)');
      logger.info('  POST /api/tools/:toolName/stream - Stream tool execution (SSE)');
      logger.info('  POST /api/tools/batch - Batch tool calls');
      logger.info('  WS   /api/admin/terminal - Admin bash terminal');
      logger.info('');
      logger.info('ChatGPT Web Integration:');
      logger.info('  - MCP Server URL: https://mcp.legal.org.ua/sse');
      logger.info('  - Discovery: https://mcp.legal.org.ua/mcp');
      logger.info('  - Protocol: MCP over SSE (Model Context Protocol)');
      logger.info('');
      logger.info('SSE Streaming:');
      logger.info('  - Add Accept: text/event-stream header for streaming');
      logger.info('  - Or use /api/tools/:toolName/stream endpoint');
      logger.info('  - Tools with streaming support are auto-detected');
      logger.info('');
      logger.info('Authentication: Use Authorization header with Bearer token');
      logger.info('  Example: Authorization: Bearer <SECONDARY_LAYER_KEY>');
    });
  }
}

// Start server
const server = new HTTPMCPServer();
server.start().catch((error) => {
  logger.error('Failed to start HTTP server:', error);
  process.exit(1);
});

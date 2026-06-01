/**
 * MCP SSE Routes
 *
 * Express router factory for all MCP SSE endpoints:
 * - ChatGPT SSE integration (POST /sse)
 * - Standard MCP SSE transport (GET/POST /v1/sse)
 * - OAuth discovery & compatibility redirects
 * - MCP discovery endpoint (GET /mcp)
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest as DualAuthRequest } from '../middleware/dual-auth.js';
import { mcpDiscoveryRateLimit } from '../middleware/rate-limit.js';
import { logger } from '../utils/logger.js';
import { sanitizeId, maskSensitive } from '../utils/sanitize-log.js';
import { requestContext } from '../utils/openai-client.js';
import { MCPSSEServer } from '../api/mcp-sse-server.js';
import { ToolRegistry } from '../api/tool-registry.js';
import { OAuthService } from '../services/oauth-service.js';
import { ApiKeyService } from '../services/api-key-service.js';
import { CostTracker } from '../services/cost-tracker.js';
import { CreditService } from '../services/credit-service.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

export function createMCPSSERoutes(deps: {
  mcpSSEServer: MCPSSEServer;
  toolRegistry: ToolRegistry;
  oauthService: OAuthService;
  apiKeyService: ApiKeyService;
  costTracker: CostTracker;
  creditService: CreditService;
  mcpSseSessions: Map<string, SSEServerTransport>;
}): Router {
  const router = Router();

  // Helper: compute base URL from request headers
  // Use request host (not PUBLIC_URL) so mcp.legal.org.ua returns correct OAuth URLs
  function getBaseUrl(req: Request): string {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return `${proto}://${host}`;
  }

  // Helper: build standard OAuth metadata JSON
  function oauthMetadata(baseUrl: string) {
    return {
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
    };
  }

  // ========================= /sse endpoints =========================

  // OPTIONS /sse - Returns OAuth configuration headers
  router.options('/sse', (req: Request, res: Response) => {
    const baseUrl = getBaseUrl(req);

    res.setHeader('MCP-Auth-Type', 'oauth2');
    res.setHeader('MCP-Auth-Authorization-Endpoint', `${baseUrl}/oauth/authorize`);
    res.setHeader('MCP-Auth-Token-Endpoint', `${baseUrl}/oauth/token`);
    res.setHeader('MCP-Auth-Scopes', 'mcp');
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    res.status(200).send();
  });

  // GET /sse - Returns OAuth configuration as JSON
  // GET /sse - SSE keepalive stream for Streamable HTTP clients
  // ChatGPT authenticates via POST (Streamable HTTP), then opens GET /sse for server→client events.
  // This is just a notification channel — tools are served via POST /sse handler.
  router.get('/sse', (req: Request, res: Response) => {
    const baseUrl = getBaseUrl(req);
    const resourceMetadataUrl = `${baseUrl}/.well-known/oauth-protected-resource`;

    // If no auth AND no prior session context, return 401 to trigger OAuth
    const authHeader = req.headers.authorization;
    const mcpSessionId = req.headers['mcp-session-id'] as string;
    const userAgent = req.headers['user-agent'] || '';
    const isKnownMcpClient = userAgent.includes('openai-mcp') || userAgent.includes('ChatGPT');

    if (!authHeader?.startsWith('Bearer ') && !mcpSessionId && !isKnownMcpClient) {
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadataUrl}"`);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authorization required. Use OAuth 2.0 to obtain an access token.',
        code: 'MISSING_AUTH',
      });
    }

    // Open SSE keepalive stream
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Send keepalive pings
    const pingInterval = setInterval(() => {
      if (res.writableEnded) { clearInterval(pingInterval); return; }
      res.write(': ping\n\n');
    }, 30000);

    req.on('close', () => {
      clearInterval(pingInterval);
      logger.debug('[MCP SSE GET] Client disconnected');
    });
  });

  // GET /sse/.well-known/oauth-protected-resource - RFC 9728 Protected Resource Metadata
  // ChatGPT checks this FIRST to discover the OAuth authorization server
  router.get('/sse/.well-known/oauth-protected-resource', (req: Request, res: Response) => {
    const baseUrl = getBaseUrl(req);
    res.json({
      resource: `${baseUrl}/sse`,
      authorization_servers: [baseUrl],
      scopes_supported: ['mcp'],
      bearer_methods_supported: ['header'],
    });
  });

  // GET /sse/.well-known/oauth-authorization-server - RFC 8414 OAuth metadata
  router.get('/sse/.well-known/oauth-authorization-server', (req: Request, res: Response) => {
    res.json(oauthMetadata(getBaseUrl(req)));
  });

  // GET /sse/.well-known/openid-configuration - OpenID Connect Discovery
  router.get('/sse/.well-known/openid-configuration', (req: Request, res: Response) => {
    res.json(oauthMetadata(getBaseUrl(req)));
  });

  // POST /sse - Route MCP messages to existing SSE sessions (ChatGPT sends messages here)
  router.post('/sse', (async (req: DualAuthRequest, res: Response) => {
    // If sessionId present, route to existing SSE session (MCP protocol)
    const sessionId = req.query.sessionId as string;
    if (sessionId) {
      const transport = deps.mcpSseSessions.get(sessionId);
      if (!transport) {
        return res.status(404).json({ error: 'Session not found', sessionId });
      }
      return await transport.handlePostMessage(req, res, req.body);
    }

    // Legacy: no sessionId — fall back to old behavior (create SSE connection via POST)
    try {
      const baseUrl = getBaseUrl(req);
      const resourceMetadataUrl = `${baseUrl}/.well-known/oauth-protected-resource`;

      // CRITICAL: Authentication is REQUIRED for usage tracking
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('[MCP SSE] Missing or invalid Authorization header');
        res.setHeader(
          'WWW-Authenticate',
          `Bearer error="missing_token", error_description="Authorization required", resource_metadata="${resourceMetadataUrl}"`
        );
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
          const jwtSecret = process.env.JWT_SECRET;
          if (!jwtSecret) throw new Error('JWT_SECRET not configured');
          const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as any;
          userId = decoded.userId;
          logger.debug('[MCP SSE] Authenticated with JWT', { userId });
        } else if (token.startsWith('mcp_token_')) {
          // OAuth 2.0 access token - verify with OAuth service
          const tokenData = await deps.oauthService.verifyAccessToken(token);

          if (!tokenData) {
            logger.warn('[MCP SSE] Invalid OAuth token', {
              tokenPrefix: maskSensitive(token, 15),
            });
            res.setHeader(
              'WWW-Authenticate',
              `Bearer error="invalid_token", error_description="Invalid or expired OAuth access token", resource_metadata="${resourceMetadataUrl}"`
            );
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
          // API key - validate: try Phase 2 (DB) first, then legacy env keys
          clientKey = token;
          const keyInfo = await deps.apiKeyService.validateApiKey(token);

          if (keyInfo) {
            userId = keyInfo.userId;
          } else {
            // Fallback: check legacy SECONDARY_LAYER_KEYS
            const legacyKeys = (process.env.SECONDARY_LAYER_KEYS || '').split(',').map(k => k.trim()).filter(k => k.length > 0);
            if (!legacyKeys.includes(token)) {
              logger.warn('[MCP SSE POST] Invalid API key', {
                keyPrefix: maskSensitive(token, 12),
              });
              res.setHeader(
                'WWW-Authenticate',
                `Bearer error="invalid_token", error_description="Invalid API key", resource_metadata="${resourceMetadataUrl}"`
              );
              return res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid API key',
                code: 'INVALID_API_KEY',
              });
            }
            logger.debug('[MCP SSE POST] Authenticated with legacy API key');
          }

          // Update API key usage (async, don't wait)
          deps.apiKeyService.updateUsage(token).catch((err) => {
            logger.error('[MCP SSE] Failed to update API key usage', { error: err.message });
          });
        }
      } catch (error) {
        // Auth failed - return 401
        logger.warn('[MCP SSE] Authentication failed', { error: (error as Error).message });
        res.setHeader(
          'WWW-Authenticate',
          `Bearer error="invalid_token", error_description="Authentication failed", resource_metadata="${resourceMetadataUrl}"`
        );
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
      await deps.mcpSSEServer.handleSSEConnection(req, res, userId, clientKey);
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

  // ========================= /v1/sse endpoints =========================

  // POST /v1/sse - Route messages to existing SSE sessions
  router.post('/v1/sse', (async (req: DualAuthRequest, res: Response) => {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId query parameter' });
    }

    const transport = deps.mcpSseSessions.get(sessionId);
    if (!transport) {
      return res.status(404).json({ error: 'Session not found', sessionId });
    }

    await transport.handlePostMessage(req, res, req.body);
  }) as any);

  // GET /v1/sse - Establish new standard MCP SSE stream
  router.get('/v1/sse', (async (req: DualAuthRequest, res: Response) => {
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
          const jwtSecret = process.env.JWT_SECRET;
          if (!jwtSecret) throw new Error('JWT_SECRET not configured');
          const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as any;
          userId = String(decoded.userId);
          logger.debug('[MCP v1/sse] Authenticated with JWT', { userId: sanitizeId(userId) });
        } else {
          // Try OAuth access token first, then API key
          const oauthToken = await deps.oauthService.verifyAccessToken(token);
          if (oauthToken) {
            userId = String(oauthToken.userId);
            logger.debug('[MCP v1/sse] Authenticated with OAuth token', { userId: sanitizeId(userId), clientId: sanitizeId(String(oauthToken.clientId)) });
          } else {
            // API key
            clientKey = token;
            const keyInfo = await deps.apiKeyService.validateApiKey(token);

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
            const rateLimit = await deps.apiKeyService.checkRateLimit(token);

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
            deps.apiKeyService.updateUsage(token).catch((err) => {
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
          tools: deps.toolRegistry.getLocalToolDefinitions(),
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
          if (userId && deps.creditService) {
            const creditsRequired = await deps.creditService.calculateCreditsForTool(toolName, userId);

            if (creditsRequired > 0) {
              const balance = await deps.creditService.checkBalance(userId, creditsRequired);

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
          await deps.costTracker.createTrackingRecord({
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
              const vaultUserId = userId || process.env.DEFAULT_VAULT_USER_ID;
              const toolArgs = VAULT_TOOLS.has(toolName) ? { ...args, userId: vaultUserId } : args;
              const registryResult = await deps.toolRegistry.executeTool(toolName, toolArgs);
              if (registryResult) {
                return registryResult;
              }
              throw new Error(`Unknown tool: ${toolName}`);
            }
          );

          // Complete cost tracking
          const executionTime = Date.now() - startTime;
          await deps.costTracker.completeTrackingRecord({
            requestId,
            executionTimeMs: executionTime,
            status: 'completed',
          });

          // Phase 2 Billing: Deduct credits after successful execution
          if (userId && deps.creditService) {
            const creditsRequired = await deps.creditService.calculateCreditsForTool(toolName, userId);

            if (creditsRequired > 0) {
              const deduction = await deps.creditService.deductCredits(
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
          await deps.costTracker.completeTrackingRecord({
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
      deps.mcpSseSessions.set(transport.sessionId, transport);

      // Connect MCP server to transport
      await mcpServer.connect(transport);

      logger.info('[MCP v1/sse] Connection established', { sessionId: transport.sessionId });

      // Handle client disconnect
      req.on('close', () => {
        logger.info('[MCP v1/sse] Client disconnected', { sessionId: transport.sessionId });
        deps.mcpSseSessions.delete(transport.sessionId);
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

  // ========================= /mcp discovery =========================

  // GET /mcp - MCP discovery endpoint (public, rate limited)
  router.get('/mcp', mcpDiscoveryRateLimit as any, (_req: Request, res: Response) => {
    const tools = deps.mcpSSEServer.getAllTools();
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

  // ========================= OAuth compatibility redirects =========================

  // Redirect /authorize to /oauth/authorize (Claude.ai compatibility)
  router.get('/authorize', (req: Request, res: Response) => {
    const queryString = new URLSearchParams(req.query as any).toString();
    res.redirect(301, `/oauth/authorize?${queryString}`);
  });

  router.post('/authorize', (req: Request, res: Response) => {
    res.redirect(307, '/oauth/authorize');
  });

  // Redirect /token to /oauth/token (Claude.ai compatibility)
  router.post('/token', (req: Request, res: Response) => {
    res.redirect(307, '/oauth/token');
  });

  // Root-level .well-known endpoints for OAuth discovery (Claude.ai compatibility)
  router.get('/.well-known/oauth-authorization-server', (req: Request, res: Response) => {
    res.json(oauthMetadata(getBaseUrl(req)));
  });

  router.get('/.well-known/openid-configuration', (req: Request, res: Response) => {
    res.json(oauthMetadata(getBaseUrl(req)));
  });

  // RFC 9728 Protected Resource Metadata (root-level)
  router.get('/.well-known/oauth-protected-resource', (req: Request, res: Response) => {
    const baseUrl = getBaseUrl(req);
    res.json({
      resource: `${baseUrl}/sse`,
      authorization_servers: [baseUrl],
      scopes_supported: ['mcp'],
      bearer_methods_supported: ['header'],
    });
  });

  // RFC 9728 with resource path suffix (ChatGPT uses /.well-known/oauth-protected-resource/sse)
  router.get('/.well-known/oauth-protected-resource/sse', (req: Request, res: Response) => {
    const baseUrl = getBaseUrl(req);
    res.json({
      resource: `${baseUrl}/sse`,
      authorization_servers: [baseUrl],
      scopes_supported: ['mcp'],
      bearer_methods_supported: ['header'],
    });
  });

  // Redirect /register to /oauth/register (MCP client compatibility)
  router.post('/register', (req: Request, res: Response) => {
    res.redirect(307, '/oauth/register');
  });

  return router;
}

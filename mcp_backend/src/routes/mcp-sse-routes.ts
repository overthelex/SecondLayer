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
import { ToolRegistry, ToolDefinition } from '../api/tool-registry.js';
import { ChatService } from '../services/chat-service.js';
import { runWithABUser } from '../infrastructure/adapters/llm-adapter.js';
import { OAuthService } from '../services/oauth-service.js';
import { ApiKeyService } from '../services/api-key-service.js';
import { CostTracker } from '../services/cost-tracker.js';
import { CreditService } from '../services/credit-service.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema, isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

export function createMCPSSERoutes(deps: {
  mcpSSEServer: MCPSSEServer;
  toolRegistry: ToolRegistry;
  chatService: ChatService;
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

  // Active Streamable HTTP sessions (transport reused across POST/GET/DELETE by Mcp-Session-Id)
  const streamableSessions = new Map<string, StreamableHTTPServerTransport>();

  // Helper: authenticate a Bearer request (JWT / OAuth access token / API key).
  // On failure, writes the 401/429 response (with WWW-Authenticate for discovery) and returns null.
  // `resourceMetadataPath` is the RFC 9728 metadata path for THIS transport so OAuth clients
  // discover the resource whose URL matches their configured server URL.
  async function authenticateMcpBearer(
    req: DualAuthRequest,
    res: Response,
    logTag: string,
    resourceMetadataPath: string
  ): Promise<{ userId?: string; clientKey?: string } | null> {
    const baseUrl = getBaseUrl(req);
    const resourceMetadataUrl = `${baseUrl}${resourceMetadataPath}`;
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn(`${logTag} Missing or invalid Authorization header`);
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadataUrl}"`);
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authorization header with Bearer token is required',
        code: 'MISSING_AUTH',
      });
      return null;
    }

    const token = authHeader.replace('Bearer ', '');
    let userId: string | undefined;
    let clientKey: string | undefined;

    try {
      if (token.includes('.')) {
        // JWT token
        const jwt = await import('jsonwebtoken');
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) throw new Error('JWT_SECRET not configured');
        const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as any;
        userId = String(decoded.userId);
        logger.debug(`${logTag} Authenticated with JWT`, { userId: sanitizeId(userId) });
      } else {
        // OAuth access token first, then API key
        const oauthToken = await deps.oauthService.verifyAccessToken(token);
        if (oauthToken) {
          userId = String(oauthToken.userId);
          clientKey = oauthToken.clientId;
          logger.debug(`${logTag} Authenticated with OAuth token`);
        } else {
          clientKey = token;
          const keyInfo = await deps.apiKeyService.validateApiKey(token);
          if (!keyInfo) {
            logger.warn(`${logTag} Invalid API key`, { keyPrefix: maskSensitive(token, 8) });
            res.setHeader('WWW-Authenticate', `Bearer error="invalid_token", resource_metadata="${resourceMetadataUrl}"`);
            res.status(401).json({ error: 'Unauthorized', message: 'Invalid API key', code: 'INVALID_API_KEY' });
            return null;
          }
          const rateLimit = await deps.apiKeyService.checkRateLimit(token);
          if (!rateLimit.allowed) {
            logger.warn(`${logTag} Rate limit exceeded`, { keyId: keyInfo.id, reason: rateLimit.reason });
            res.status(429).json({ error: 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED', reason: rateLimit.reason });
            return null;
          }
          userId = keyInfo.userId;
          logger.debug(`${logTag} Authenticated with API key`, { userId, keyId: keyInfo.id });
          deps.apiKeyService.updateUsage(token).catch((err) => {
            logger.error(`${logTag} Failed to update API key usage`, { error: err.message });
          });
        }
      }
    } catch (error) {
      logger.warn(`${logTag} Authentication failed`, { error: (error as Error).message });
      res.setHeader('WWW-Authenticate', `Bearer error="invalid_token", resource_metadata="${resourceMetadataUrl}"`);
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication failed: ' + (error as Error).message,
        code: 'AUTH_FAILED',
      });
      return null;
    }

    return { userId, clientKey };
  }

  // Helper: build a fully-wired MCP Server (tools/list + tools/call with billing) for a user.
  // Shared by the classic SSE transport (/v1/sse) and the Streamable HTTP transport (/v1/mcp).
  function buildMcpServer(userId: string | undefined, clientKey: string | undefined): Server {
    const safeUserId = sanitizeId(userId || 'anonymous');
    const mcpServer = new Server(
      { name: 'secondlayer-mcp', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      // Expose local backend tools + unified-gateway proxied tools (rada_*, openreyestr_*).
      // Remote defs are fetched once and cached; executeTool() routes prefixed calls to the
      // proxy. Falls back to local-only if remote services are unreachable.
      try {
        return { tools: await deps.toolRegistry.getAllToolDefinitions() };
      } catch (err: any) {
        logger.warn('[MCP] getAllToolDefinitions failed, serving local tools only', { error: err.message });
        return { tools: deps.toolRegistry.getLocalToolDefinitions() };
      }
    });

    mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const args = request.params.arguments || {};
      const requestId = `mcp-v1-${uuidv4()}`;
      const startTime = Date.now();

      try {
        logger.info('[MCP] Tool call', { tool: toolName, userId: safeUserId });

        // Phase 2 Billing: Check credits BEFORE execution
        if (userId && deps.creditService) {
          const creditsRequired = await deps.creditService.calculateCreditsForTool(toolName, userId);
          if (creditsRequired > 0) {
            const balance = await deps.creditService.checkBalance(userId, creditsRequired);
            if (!balance.hasCredits) {
              logger.warn('[MCP] Insufficient credits', { userId: safeUserId, tool: toolName, creditsRequired });
              return {
                content: [{ type: 'text', text: `Error: Insufficient credits. Required: ${creditsRequired}, Current balance: ${balance.currentBalance}` }],
                isError: true,
              };
            }
          }
        }

        await deps.costTracker.createTrackingRecord({
          requestId,
          toolName,
          clientKey,
          userId,
          userQuery: String(args.query || JSON.stringify(args)),
          queryParams: args,
        });

        const result = await requestContext.run(
          { requestId, task: toolName },
          async () => {
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

        const executionTime = Date.now() - startTime;
        await deps.costTracker.completeTrackingRecord({ requestId, executionTimeMs: executionTime, status: 'completed' });

        if (userId && deps.creditService) {
          const creditsRequired = await deps.creditService.calculateCreditsForTool(toolName, userId);
          if (creditsRequired > 0) {
            const deduction = await deps.creditService.deductCredits(userId, creditsRequired, toolName, requestId, `Tool execution: ${toolName}`);
            if (deduction.success) {
              logger.info('[MCP] Credits deducted', { userId: safeUserId, tool: toolName, creditsDeducted: creditsRequired });
            }
          }
        }

        return {
          content: result.content || [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        logger.error('[MCP] Tool execution error', { tool: toolName, error: error.message });
        const executionTime = Date.now() - startTime;
        await deps.costTracker.completeTrackingRecord({ requestId, executionTimeMs: executionTime, status: 'failed', errorMessage: error.message });
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    });

    return mcpServer;
  }

  // ========================= MCP v2 (single orchestrating tool) =========================
  // v2 exposes ONE tool — `legal_chat` — instead of the ~112 low-level tools that v1
  // surfaces. The tool wraps the full ChatService (v3) pipeline: intent classification →
  // plan → curated tool execution → grounded synthesis. External MCP clients (Claude
  // Code/Desktop) ask a natural-language legal question and get a cited answer back,
  // mirroring what the web chat does, rather than choosing among 112 raw tools.

  const LEGAL_CHAT_TOOL: ToolDefinition = {
    name: 'legal_chat',
    description:
      'Ukrainian legal research assistant. Ask a legal question or describe a task in natural ' +
      'language (Ukrainian preferred; English accepted). It runs the full SecondLayer pipeline — ' +
      'planning and executing retrieval over court decisions (ЄДРСР), legislation, parliament and ' +
      'business registries — and returns a grounded answer with citations. Prefer this single tool ' +
      'over calling low-level search tools directly.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The legal question or task, in natural language (uk-UA preferred).',
        },
        budget: {
          type: 'string',
          enum: ['quick', 'standard', 'deep'],
          description: 'Depth/cost tradeoff. quick = cheap/fast, deep = exhaustive. Default: standard.',
        },
        internetEnabled: {
          type: 'boolean',
          description: 'Allow web sources in addition to internal legal data. Default: true.',
        },
      },
      required: ['query'],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  };

  // Build an MCP Server that exposes only `legal_chat`. Billing/cost-tracking is handled
  // inside the ChatService pipeline (keyed by requestId), so — unlike the per-tool v1 path —
  // we do not create tracking records or deduct credits here.
  function buildMcpServerV2(userId: string | undefined, _clientKey: string | undefined): Server {
    const safeUserId = sanitizeId(userId || 'anonymous');
    const mcpServer = new Server(
      { name: 'secondlayer-mcp', version: '2.0.0' },
      { capabilities: { tools: {} } }
    );

    mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [LEGAL_CHAT_TOOL] }));

    mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const args = request.params.arguments || {};
      const requestId = `mcp-v2-${uuidv4()}`;

      if (toolName !== 'legal_chat') {
        return {
          content: [{ type: 'text', text: `Error: unknown tool '${toolName}'. MCP v2 exposes only 'legal_chat'.` }],
          isError: true,
        };
      }

      const query = String(args.query || '').trim();
      if (!query) {
        return { content: [{ type: 'text', text: 'Error: "query" is required.' }], isError: true };
      }
      const budget = ['quick', 'standard', 'deep'].includes(String(args.budget))
        ? (String(args.budget) as 'quick' | 'standard' | 'deep')
        : 'standard';

      try {
        logger.info('[MCP v2] legal_chat call', { userId: safeUserId, requestId, budget });

        let answer = '';
        let totalCostUsd = 0;
        // Build the request as a variable (not an inline literal) so excess-property
        // checks don't fire against the proprietary ChatRequest type — same pattern as
        // chat-inline-routes.ts, which forwards `internetEnabled` the same way.
        const chatRequest = {
          query,
          budget,
          userId,
          requestId,
          internetEnabled: args.internetEnabled !== false,
        };
        await runWithABUser(userId || '', async () => {
          for await (const event of deps.chatService.chat(chatRequest)) {
            if (event.type === 'complete') {
              answer = event.data?.answer || answer;
              totalCostUsd = event.data?.total_cost_usd || totalCostUsd;
            }
          }
        });

        logger.info('[MCP v2] legal_chat done', { userId: safeUserId, requestId, costUsd: totalCostUsd });
        return { content: [{ type: 'text', text: answer || 'Не вдалося згенерувати відповідь.' }] };
      } catch (error: any) {
        logger.error('[MCP v2] legal_chat error', { requestId, error: error.message });
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }
    });

    return mcpServer;
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
      const auth = await authenticateMcpBearer(
        req,
        res,
        '[MCP v1/sse]',
        '/.well-known/oauth-protected-resource/api/v1/sse'
      );
      if (!auth) return; // response already sent

      const { userId, clientKey } = auth;

      // Build the MCP server (tools/list + tools/call with billing)
      const mcpServer = buildMcpServer(userId, clientKey);

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

  // ========================= /v1/mcp (Streamable HTTP) =========================
  // Modern MCP transport (replaces deprecated SSE). Publicly reached at /api/v1/mcp
  // (nginx rewrites /api/v1/mcp -> /v1/mcp). Claude Code `"type": "http"` connects here;
  // unlike the SSE transport it reliably attaches the OAuth bearer on every request.

  const MCP_RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource/api/v1/mcp';

  // POST /v1/mcp - JSON-RPC requests (initialize + tool calls). Stateful via Mcp-Session-Id.
  router.post('/v1/mcp', (async (req: DualAuthRequest, res: Response) => {
    try {
      // Deprecated in favour of /api/v2/mcp (single `legal_chat` tool). v1 still serves the
      // full ~112-tool surface for backward compatibility; advertise the successor to clients.
      res.setHeader('Deprecation', 'true');
      res.setHeader('Link', '</api/v2/mcp>; rel="successor-version"');

      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      // Reuse an existing session if present
      if (sessionId && streamableSessions.has(sessionId)) {
        const transport = streamableSessions.get(sessionId)!;
        return await transport.handleRequest(req, res, req.body);
      }

      // New session must begin with an `initialize` request
      if (sessionId || !isInitializeRequest(req.body)) {
        return res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: no valid session ID for non-initialize request' },
          id: null,
        });
      }

      // Authenticate the initialize request (token bound to this session for its lifetime)
      const auth = await authenticateMcpBearer(req, res, '[MCP v1/mcp]', MCP_RESOURCE_METADATA_PATH);
      if (!auth) return; // response already sent

      const { userId, clientKey } = auth;
      const mcpServer = buildMcpServer(userId, clientKey);

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => uuidv4(),
        onsessioninitialized: (sid: string) => {
          streamableSessions.set(sid, transport);
          logger.info('[MCP v1/mcp] Session initialized', { sessionId: sid });
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          streamableSessions.delete(transport.sessionId);
          logger.info('[MCP v1/mcp] Session closed', { sessionId: transport.sessionId });
        }
        mcpServer.close();
      };

      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error: any) {
      logger.error('[MCP v1/mcp] POST error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error', data: error.message },
          id: null,
        });
      }
    }
  }) as any);

  // GET /v1/mcp - server→client notification stream for an existing session
  router.get('/v1/mcp', (async (req: DualAuthRequest, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !streamableSessions.has(sessionId)) {
      const baseUrl = getBaseUrl(req);
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${baseUrl}${MCP_RESOURCE_METADATA_PATH}"`);
      return res.status(400).json({ error: 'Invalid or missing Mcp-Session-Id', code: 'INVALID_SESSION' });
    }
    const transport = streamableSessions.get(sessionId)!;
    await transport.handleRequest(req, res);
  }) as any);

  // DELETE /v1/mcp - explicit session termination
  router.delete('/v1/mcp', (async (req: DualAuthRequest, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !streamableSessions.has(sessionId)) {
      return res.status(400).json({ error: 'Invalid or missing Mcp-Session-Id', code: 'INVALID_SESSION' });
    }
    const transport = streamableSessions.get(sessionId)!;
    await transport.handleRequest(req, res);
  }) as any);

  // RFC 9728 protected-resource metadata for the Streamable HTTP transport.
  // `resource` MUST equal the public URL the client configures (/api/v1/mcp).
  const mcpResourceMetadata = (req: Request, res: Response) => {
    const baseUrl = getBaseUrl(req);
    res.json({
      resource: `${baseUrl}/api/v1/mcp`,
      authorization_servers: [baseUrl],
      scopes_supported: ['mcp'],
      bearer_methods_supported: ['header'],
    });
  };
  router.get('/.well-known/oauth-protected-resource/api/v1/mcp', mcpResourceMetadata);
  router.get('/.well-known/oauth-protected-resource/v1/mcp', mcpResourceMetadata);

  // ========================= /v2/mcp (Streamable HTTP, single tool) =========================
  // Canonical transport. Same OAuth/session mechanics as /v1/mcp, but the wired MCP server
  // exposes only `legal_chat` (see buildMcpServerV2). Publicly reached at /api/v2/mcp.
  const MCP_V2_RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource/api/v2/mcp';

  router.post('/v2/mcp', (async (req: DualAuthRequest, res: Response) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (sessionId && streamableSessions.has(sessionId)) {
        const transport = streamableSessions.get(sessionId)!;
        return await transport.handleRequest(req, res, req.body);
      }

      if (sessionId || !isInitializeRequest(req.body)) {
        return res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: no valid session ID for non-initialize request' },
          id: null,
        });
      }

      const auth = await authenticateMcpBearer(req, res, '[MCP v2/mcp]', MCP_V2_RESOURCE_METADATA_PATH);
      if (!auth) return; // response already sent

      const { userId, clientKey } = auth;
      const mcpServer = buildMcpServerV2(userId, clientKey);

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => uuidv4(),
        onsessioninitialized: (sid: string) => {
          streamableSessions.set(sid, transport);
          logger.info('[MCP v2/mcp] Session initialized', { sessionId: sid });
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          streamableSessions.delete(transport.sessionId);
          logger.info('[MCP v2/mcp] Session closed', { sessionId: transport.sessionId });
        }
        mcpServer.close();
      };

      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error: any) {
      logger.error('[MCP v2/mcp] POST error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error', data: error.message },
          id: null,
        });
      }
    }
  }) as any);

  router.get('/v2/mcp', (async (req: DualAuthRequest, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !streamableSessions.has(sessionId)) {
      const baseUrl = getBaseUrl(req);
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${baseUrl}${MCP_V2_RESOURCE_METADATA_PATH}"`);
      return res.status(400).json({ error: 'Invalid or missing Mcp-Session-Id', code: 'INVALID_SESSION' });
    }
    const transport = streamableSessions.get(sessionId)!;
    await transport.handleRequest(req, res);
  }) as any);

  router.delete('/v2/mcp', (async (req: DualAuthRequest, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !streamableSessions.has(sessionId)) {
      return res.status(400).json({ error: 'Invalid or missing Mcp-Session-Id', code: 'INVALID_SESSION' });
    }
    const transport = streamableSessions.get(sessionId)!;
    await transport.handleRequest(req, res);
  }) as any);

  // RFC 9728 protected-resource metadata for the v2 transport.
  const mcpV2ResourceMetadata = (req: Request, res: Response) => {
    const baseUrl = getBaseUrl(req);
    res.json({
      resource: `${baseUrl}/api/v2/mcp`,
      authorization_servers: [baseUrl],
      scopes_supported: ['mcp'],
      bearer_methods_supported: ['header'],
    });
  };
  router.get('/.well-known/oauth-protected-resource/api/v2/mcp', mcpV2ResourceMetadata);
  router.get('/.well-known/oauth-protected-resource/v2/mcp', mcpV2ResourceMetadata);

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
        'streamable-http-v1': '/api/v1/mcp',
        // Canonical: single `legal_chat` tool wrapping the full chat pipeline.
        'streamable-http-v2': '/api/v2/mcp',
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

  // RFC 9728 metadata for the standard MCP SSE transport (GET/POST /v1/sse).
  // Publicly this transport is reached at /api/v1/sse (nginx rewrites /api/v1/sse -> /v1/sse),
  // so the advertised `resource` MUST be the public /api/v1/sse URL to match the client's
  // configured server URL — otherwise the SDK rejects with "resource does not match expected".
  // Clients (e.g. Claude Code) probe the path-aware well-known for both /api/v1/sse and /v1/sse.
  const v1SseResourceMetadata = (req: Request, res: Response) => {
    const baseUrl = getBaseUrl(req);
    res.json({
      resource: `${baseUrl}/api/v1/sse`,
      authorization_servers: [baseUrl],
      scopes_supported: ['mcp'],
      bearer_methods_supported: ['header'],
    });
  };
  router.get('/.well-known/oauth-protected-resource/api/v1/sse', v1SseResourceMetadata);
  router.get('/.well-known/oauth-protected-resource/v1/sse', v1SseResourceMetadata);

  // Redirect /register to /oauth/register (MCP client compatibility)
  router.post('/register', (req: Request, res: Response) => {
    res.redirect(307, '/oauth/register');
  });

  return router;
}

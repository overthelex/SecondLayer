import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { dualAuth, AuthenticatedRequest as DualAuthRequest } from '../middleware/dual-auth.js';
import { createBalanceCheckMiddleware } from '../middleware/balance-check.js';
import { logger } from '../utils/logger.js';
import { requestContext } from '../utils/openai-client.js';
import { ToolRegistry } from '../api/tool-registry.js';
import { ServiceProxy } from '../services/service-proxy.js';
import { BillingService } from '../services/billing-service.js';
import { CostTracker } from '../services/cost-tracker.js';
import { CreditService } from '../services/credit-service.js';
import { BatchDocumentTools } from '../api/batch-document-tools.js';
import { ServiceType } from '../types/gateway.js';

function sendSSEEvent(res: Response, event: {
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

async function handleStreamingProxyCall(
  _req: DualAuthRequest,
  res: Response,
  service: ServiceType,
  serviceName: string,
  args: any,
  requestId: string,
  deps: {
    serviceProxy: ServiceProxy;
  }
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
    const stream = await deps.serviceProxy.callRemoteService({
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

async function handleStreamingToolCall(
  _req: DualAuthRequest,
  res: Response,
  toolName: string,
  args: any,
  deps: {
    toolRegistry: ToolRegistry;
    batchDocumentTools: BatchDocumentTools;
  }
): Promise<void> {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Send initial connection event
  sendSSEEvent(res, {
    type: 'connected',
    data: { tool: toolName, timestamp: new Date().toISOString() },
    id: 'connection',
  });

  try {
    // Streaming support for different tools
    if (deps.toolRegistry.supportsStreaming(toolName)) {
      await deps.toolRegistry.executeToolStream(toolName, args, (event: any) => {
        sendSSEEvent(res, event);
      });
    } else if (toolName === 'batch_process_documents') {
      // Batch document processing with real-time progress
      await deps.batchDocumentTools.processBatch(args, (event) => {
        sendSSEEvent(res, event);
      });
    } else {
      // For other tools, stream the regular result
      const result = await deps.toolRegistry.executeTool(toolName, args);
      if (result === null || result === undefined) {
        sendSSEEvent(res, {
          type: 'error',
          data: { message: `No handler registered for tool: ${toolName}` },
          id: 'error',
        });
      } else {
        sendSSEEvent(res, {
          type: 'progress',
          data: { message: 'Processing...', progress: 0.5 },
          id: 'processing',
        });
        sendSSEEvent(res, {
          type: 'complete',
          data: result,
          id: 'final',
        });
      }
    }
  } catch (error: any) {
    sendSSEEvent(res, {
      type: 'error',
      data: {
        message: error.message,
        error: error.toString(),
      },
      id: 'error',
    });
  } finally {
    // Send end event and close connection
    sendSSEEvent(res, {
      type: 'end',
      data: { message: 'Stream completed' },
      id: 'end',
    });
    res.end();
  }
}

export function createToolExecutionRoutes(deps: {
  toolRegistry: ToolRegistry;
  serviceProxy: ServiceProxy;
  billingService: BillingService;
  costTracker: CostTracker;
  creditService: CreditService;
  batchDocumentTools: BatchDocumentTools;
}): Router {
  const router = Router();
  const balanceCheckMiddleware = createBalanceCheckMiddleware(deps.billingService, deps.costTracker);

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
        const allTools = await deps.toolRegistry.getAllTools(
          deps.toolRegistry.getLocalToolDefinitions(),
          process.env.RADA_MCP_URL,
          process.env.RADA_API_KEY,
          process.env.OPENREYESTR_MCP_URL,
          process.env.OPENREYESTR_API_KEY
        );

        const counts = deps.toolRegistry.getToolCounts();

        res.json({
          tools: allTools,
          count: allTools.length,
          gateway: {
            enabled: true,
            services: counts,
          },
        });
      } else {
        const tools = deps.toolRegistry.getLocalToolDefinitions();

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
            const result = await deps.toolRegistry.executeTool(
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

      await handleStreamingToolCall(req, res, toolName, args, {
        toolRegistry: deps.toolRegistry,
        batchDocumentTools: deps.batchDocumentTools,
      });
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
          const creditsRequired = await deps.creditService.calculateCreditsForTool(toolName, req.user.id);

          if (creditsRequired > 0) {
            const balance = await deps.creditService.checkBalance(req.user.id, creditsRequired);

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
      await deps.costTracker.createTrackingRecord({
        requestId,
        toolName,
        clientKey: req.clientKey,
        userId: req.user?.id,
        userQuery: args.query || JSON.stringify(args),
        queryParams: args,
      });

      // 3. Estimate cost BEFORE execution
      const estimate = await deps.costTracker.estimateCost({
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
      const route = gatewayEnabled ? deps.toolRegistry.getRoute(toolName) : null;

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
          return await handleStreamingProxyCall(
            req,
            res,
            route.service,
            route.serviceName,
            args,
            requestId,
            { serviceProxy: deps.serviceProxy }
          );
        }

        // Regular JSON request to remote service
        const remoteResult = await deps.serviceProxy.callRemoteService({
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
          return handleStreamingToolCall(req, res, toolName, args, {
            toolRegistry: deps.toolRegistry,
            batchDocumentTools: deps.batchDocumentTools,
          });
        }

        // Execute in request context
        result = await requestContext.run(
          { requestId, task: toolName },
          async () => {
            const VAULT_TOOLS = new Set(['store_document', 'get_document', 'list_documents', 'semantic_search', 'list_folders', 'delete_document', 'update_document']);
            const vaultUserId = req.user?.id || process.env.DEFAULT_VAULT_USER_ID;
            const httpToolArgs = VAULT_TOOLS.has(toolName) ? { ...args, userId: vaultUserId } : args;
            return await deps.toolRegistry.executeTool(toolName, httpToolArgs);
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
      const breakdown = await deps.costTracker.completeTrackingRecord({
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
          const creditsRequired = await deps.creditService.calculateCreditsForTool(toolName, req.user.id);

          if (creditsRequired > 0) {
            const deduction = await deps.creditService.deductCredits(
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
        await deps.costTracker.completeTrackingRecord({
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

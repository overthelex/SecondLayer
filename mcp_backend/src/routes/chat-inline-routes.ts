/**
 * Chat Inline Routes
 * Extracted from http-server.ts — chat plan review and SSE streaming chat endpoints
 */

import { Router, Response } from 'express';
import { AuthenticatedRequest as DualAuthRequest } from '../middleware/dual-auth.js';
import { chatRateLimit } from '../middleware/rate-limit.js';
import { logger } from '../utils/logger.js';
import { ChatService } from '../services/chat-service.js';
import { BillingService } from '../services/billing-service.js';
import { CostTracker } from '../services/cost-tracker.js';
import { Database } from '../database/database.js';
import { v4 as uuidv4 } from 'uuid';

export function createChatInlineRoutes(deps: {
  chatService: ChatService;
  billingService: BillingService;
  costTracker: CostTracker;
  db: Database;
}): Router {
  const router = Router();

  // POST /plan - Returns execution plan for user review before running
  router.post('/plan', chatRateLimit as any, (async (req: DualAuthRequest, res: Response) => {
    const userId = req.user?.id;
    const requestId = `plan-${uuidv4()}`;

    try {
      const { query, budget, internetEnabled } = req.body;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'query is required' });
      }

      const result = await deps.chatService.generatePlanForReview(
        query,
        budget || 'standard',
        userId,
        requestId,
        internetEnabled !== false
      );

      if (!result) {
        return res.json({ plan: null, planSessionId: null, message: 'Simple query — no plan needed' });
      }

      res.json({
        plan: result.plan,
        planSessionId: result.planSessionId,
      });
    } catch (error: any) {
      logger.error('[ChatPlan] Endpoint error', { error: error.message, requestId });
      res.status(500).json({ error: 'Plan generation failed', message: error.message });
    }
  }) as any);

  // POST / - Main chat endpoint with SSE streaming
  router.post('/', chatRateLimit as any, (async (req: DualAuthRequest, res: Response) => {
    const userId = req.user?.id;
    const requestId = `chat-${uuidv4()}`;

    try {
      const { query, history, budget, conversationId, approvedPlan, planSessionId, allowDeepEscalation, internetEnabled } = req.body;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'query is required' });
      }

      // Set SSE headers EARLY — before balance check — so client gets first byte faster
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // Emit response_id as the very first SSE event for request traceability
      res.write(`event: response_id\n`);
      res.write(`data: ${JSON.stringify({ response_id: requestId })}\n\n`);

      // Pre-flight balance check — use BillingService (USD-based)
      // Now runs AFTER SSE is established; failures sent as SSE error events
      if (userId) {
        const billing = await deps.billingService.getOrCreateUserBilling(userId);
        if (billing.billing_enabled) {
          let estimatedCostUsd: number;

          // If an approved plan with step-level cost estimates is available, use that
          if (approvedPlan?.steps?.length > 0) {
            const stepsCost = approvedPlan.steps.reduce(
              (sum: number, s: any) => sum + (s.estimatedCost || 0),
              0
            );
            const overheadCost = approvedPlan.overheadCost || 0;
            estimatedCostUsd = stepsCost + overheadCost;
          } else {
            const estimatedCost = await deps.costTracker.estimateCost({
              toolName: 'ai_chat',
              queryLength: JSON.stringify(req.body).length,
              reasoningBudget: (budget || 'standard') as 'quick' | 'standard' | 'deep',
            });
            estimatedCostUsd = estimatedCost.total_estimated_cost_usd;
          }

          const balanceCheck = await deps.billingService.checkBalance(userId, estimatedCostUsd);
          if (!balanceCheck.hasBalance) {
            res.write(`event: error\n`);
            res.write(`data: ${JSON.stringify({
              error: 'Insufficient balance',
              message: `Недостатньо коштів на балансі. Поточний баланс: $${balanceCheck.currentBalance.toFixed(2)}. Поповніть баланс для продовження роботи.`,
              code: 'INSUFFICIENT_BALANCE',
              required_usd: estimatedCostUsd,
              current_balance_usd: balanceCheck.currentBalance,
            })}\n\n`);
            res.end();
            return;
          }
        }
      }

      // Abort controller for cancellation propagation
      const abortController = new AbortController();

      // Absolute wall-clock timeout to prevent runaway agentic loops
      const timeoutMs = (budget === 'deep') ? 180_000 : 90_000;
      const requestTimeout = setTimeout(() => {
        logger.warn('[ChatService] Request timed out', { requestId, timeoutMs, budget });
        abortController.abort();
      }, timeoutMs);

      // SSE heartbeat to prevent proxy timeouts during long tool calls
      const heartbeat = setInterval(() => {
        if (!res.writableEnded) res.write(': heartbeat\n\n');
      }, 15000);

      req.on('close', () => {
        clearTimeout(requestTimeout);
        clearInterval(heartbeat);
        abortController.abort();
      });

      let chatCompleted = false;
      let chatTotalCostUsd = 0;
      const chatRequest = {
        query,
        history,
        budget: (budget || 'standard') as 'quick' | 'standard' | 'deep',
        conversationId,
        userId,
        requestId,
        signal: abortController.signal,
        approvedPlan,
        planSessionId,
        allowDeepEscalation: !!allowDeepEscalation,
        internetEnabled: internetEnabled !== false,
      };
      try {
        for await (const event of deps.chatService.chat(chatRequest)) {
          if (abortController.signal.aborted) break;

          if (event.type === 'complete') {
            chatCompleted = true;
            chatTotalCostUsd = event.data?.total_cost_usd || 0;
            event.data.response_id = requestId;
            // Include auto-created conversationId so the client can track it
            if (chatRequest.conversationId && chatRequest.conversationId !== conversationId) {
              event.data.conversationId = chatRequest.conversationId;
            }
          }

          res.write(`event: ${event.type}\n`);
          res.write(`data: ${JSON.stringify(event.data)}\n\n`);
        }

        // If aborted (timeout) and no answer was sent, emit an error event
        // so the frontend knows to reset streaming state
        if (abortController.signal.aborted && !chatCompleted && !res.writableEnded) {
          logger.warn('[ChatService] Sending timeout error to client', { requestId });
          res.write(`event: error\n`);
          res.write(`data: ${JSON.stringify({ message: 'Час очікування вичерпано. Спробуйте уточнити запит.' })}\n\n`);
        }
      } finally {
        clearTimeout(requestTimeout);
        clearInterval(heartbeat);
      }

      // Emit cost_summary SSE event — billing was already handled by CostTracker.onTrackingComplete()
      if (chatCompleted && userId && chatTotalCostUsd > 0 && !res.writableEnded) {
        try {
          const [summary, trackingRow] = await Promise.all([
            deps.billingService.getBillingSummary(userId),
            // chargeUser() already updated total_cost_usd to the marked-up amount
            deps.db.query(
              'SELECT total_cost_usd, markup_percentage FROM cost_tracking WHERE request_id = $1',
              [requestId]
            ),
          ]);
          const chargedUsd = trackingRow.rows[0]?.total_cost_usd
            ? parseFloat(trackingRow.rows[0].total_cost_usd)
            : chatTotalCostUsd;
          const costSummaryFull = {
            total_cost_usd: chatTotalCostUsd,
            charged_usd: chargedUsd,
            balance_usd: summary?.balance_usd ?? 0,
            response_id: requestId,
          };
          res.write(`event: cost_summary\n`);
          res.write(`data: ${JSON.stringify({
            ...costSummaryFull,
            markup_percentage: trackingRow.rows[0]?.markup_percentage ?? 0,
          })}\n\n`);

          // Persist charged_usd back to conversation_messages so reload shows correct cost
          if (conversationId) {
            deps.db.query(
              `UPDATE conversation_messages SET cost_summary = $1
               WHERE id = (
                 SELECT id FROM conversation_messages
                 WHERE conversation_id = $2 AND role = 'assistant'
                 ORDER BY created_at DESC LIMIT 1
               )`,
              [JSON.stringify(costSummaryFull), conversationId]
            ).catch(e => logger.warn('[ChatService] Failed to persist charged_usd', { error: e.message }));
          }
        } catch (e: any) {
          logger.warn('[ChatService] Failed to emit cost_summary', { error: e.message, requestId });
        }
      }

      if (!res.writableEnded) {
        res.end();
      }
    } catch (error: any) {
      logger.error('[ChatService] Endpoint error', { error: error.message, requestId });
      if (!res.headersSent) {
        res.status(500).json({ error: 'Chat failed', message: error.message });
      } else if (!res.writableEnded) {
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify({ message: error.message })}\n\n`);
        res.end();
      }
    }
  }) as any);

  return router;
}

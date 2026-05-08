import { RequestHandler } from 'express';
import { logger } from '../lib/logger';
import { upsertSession, upsertArtifact, contentHash } from '../schema/queries';

function simpleTokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function extractConversationId(req: any): string {
  return req.headers['x-conversation-id']
    || `${req.user?.id || 'anon'}_${Math.floor(Date.now() / (5 * 60 * 1000))}`;
}

export function rlhfSignalsMiddleware(): RequestHandler {
  return async (req, res, next) => {
    try {
      const conversationId = extractConversationId(req);
      const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

      const sessionId = await upsertSession({
        source: 'mcp_call',
        external_ref: conversationId,
        surface_tags: [],
        created_at: new Date(),
        terminal_at: null,
        terminal_action: null,
        thread_position: null,
        capture_mode: 'live',
        consent_status: 'pending',
        metadata: {
          tool: req.params.toolName,
          path: req.path,
        },
      });

      await upsertArtifact({
        session_id: sessionId,
        role: 'prompt',
        sequence_index: 0,
        content_raw: body,
        content_redacted: null,
        content_hash: contentHash(body),
        token_count: simpleTokenize(body).length,
        timestamp: new Date(),
        metadata: { tool: req.params.toolName },
      });

      const originalSend = res.send.bind(res);
      res.send = ((responseBody: any) => {
        const responseStr = typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody);
        upsertArtifact({
          session_id: sessionId,
          role: 'llm_output',
          sequence_index: 1,
          content_raw: responseStr,
          content_redacted: null,
          content_hash: contentHash(responseStr),
          token_count: simpleTokenize(responseStr).length,
          timestamp: new Date(),
          metadata: {},
        }).catch(err => logger.error('Failed to record response artifact', { error: err.message }));
        return originalSend(responseBody);
      }) as typeof res.send;
    } catch (err) {
      logger.error('RLHF middleware error (non-blocking)', { error: (err as Error).message });
    }

    next();
  };
}

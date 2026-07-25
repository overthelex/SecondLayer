/**
 * SSE Message Parser
 * Pure functions for parsing and dispatching Server-Sent Events
 */

import type {
  SSEEvent,
  SSEEventType,
  SSEProgressEvent,
  SSECompleteEvent,
  SSEErrorEvent,
  StreamingCallbacks,
} from '../../../types/api/sse';

/**
 * Parse SSE message format
 * Format: event: <type>\ndata: <json>\n\n
 */
export function parseSSEMessage(message: string): SSEEvent | null {
  const lines = message.split('\n');
  let event: SSEEventType = 'progress';
  let data: SSEEvent['data'] = null;
  let id: string | undefined;

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.substring(6).trim() as SSEEventType;
    } else if (line.startsWith('data:')) {
      const dataStr = line.substring(5).trim();
      try {
        data = JSON.parse(dataStr);
      } catch (error) {
        // If not JSON, use as plain string
        data = dataStr;
      }
    } else if (line.startsWith('id:')) {
      id = line.substring(3).trim();
    }
  }

  if (data === null) {
    return null;
  }

  return { id, event, data };
}

/**
 * Handle different SSE event types by dispatching to the appropriate callback
 */
export function handleSSEEvent(event: SSEEvent, handlers: StreamingCallbacks): void {
  switch (event.event) {
    case 'connected':
      handlers.onConnected?.(event.data);
      break;

    case 'progress':
      handlers.onProgress?.(event.data as SSEProgressEvent);
      break;

    case 'complete':
      handlers.onComplete?.(event.data as SSECompleteEvent);
      break;

    case 'error':
      handlers.onError?.(event.data as SSEErrorEvent);
      break;

    case 'end':
      handlers.onEnd?.();
      break;

    default:
      console.warn('Unknown SSE event type:', event.event);
  }
}

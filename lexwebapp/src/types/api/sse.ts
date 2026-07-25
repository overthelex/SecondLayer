/**
 * SSE (Server-Sent Events) Types
 * Types for real-time streaming communication with MCP backend
 */

export interface SSEEvent {
  id?: string;
  event: SSEEventType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SSE data can be parsed JSON of any shape, or a plain string fallback
  data: any;
}

export type SSEEventType = 'connected' | 'progress' | 'complete' | 'error' | 'end';

export interface SSEConnectedEvent {
  message?: string;
  [key: string]: unknown;
}

export interface SSEProgressEvent {
  step: number;
  action: string;
  message: string;
  progress: number; // 0.0 to 1.0
  result?: Record<string, unknown>;
  current?: number;
  total?: number;
}

export interface SSECompleteEvent {
  summary?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tool results are dynamic JSON
  result?: Record<string, any>;
  [key: string]: unknown; // Different tools return different structures
}

export interface SSEErrorEvent {
  message: string;
  error?: unknown;
  code?: string;
}

export interface StreamingCallbacks {
  onConnected?: (data: SSEConnectedEvent) => void;
  onProgress?: (data: SSEProgressEvent) => void;
  onComplete?: (data: SSECompleteEvent) => void;
  onError?: (data: SSEErrorEvent) => void;
  onEnd?: () => void;
}

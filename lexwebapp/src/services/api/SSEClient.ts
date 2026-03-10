/**
 * SSE Client Service
 * Universal client for Server-Sent Events streaming from MCP backend
 * Uses Fetch API + ReadableStream for better control than EventSource
 */

import {
  StreamingCallbacks,
} from '../../types/api/sse';
import { getErrorMessage, isAbortError } from '../../utils/errors';
import { parseSSEMessage, handleSSEEvent } from './sse/parseSSEMessage';
import { calculateRetryDelay } from './sse/RetryStrategy';

export class SSEClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly maxRetries: number = 3;

  constructor(apiUrl: string, apiKey: string) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
  }

  /**
   * Stream a tool execution with SSE
   * @param toolName - Name of the MCP tool to execute
   * @param params - Parameters for the tool
   * @param handlers - Callback handlers for different SSE events
   * @returns AbortController to cancel the stream
   */
  async streamTool(
    toolName: string,
    params: any,
    handlers: StreamingCallbacks,
    authToken?: string
  ): Promise<AbortController> {
    const controller = new AbortController();
    const url = `${this.apiUrl}/tools/${toolName}/stream`;
    const token = authToken || this.apiKey;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `SSE stream failed: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      // Process the stream
      this.processStream(response.body, handlers, controller);
    } catch (error: unknown) {
      if (isAbortError(error)) {
        console.log('Stream cancelled by user');
      } else {
        console.error('SSE stream error:', error);
        handlers.onError?.({
          message: getErrorMessage(error),
          error,
        });
      }
    }

    return controller;
  }

  /**
   * Process the SSE stream
   */
  private async processStream(
    body: ReadableStream<Uint8Array>,
    handlers: StreamingCallbacks,
    _controller: AbortController
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          handlers.onEnd?.();
          break;
        }

        // Decode the chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || ''; // Keep incomplete message in buffer

        for (const message of messages) {
          if (message.trim() === '') continue;

          try {
            const event = parseSSEMessage(message);
            if (event) {
              handleSSEEvent(event, handlers);
            }
          } catch (error) {
            console.error('Failed to parse SSE message:', error, message);
          }
        }
      }
    } catch (error: unknown) {
      if (isAbortError(error)) {
        console.log('Stream reading cancelled');
      } else {
        console.error('Stream reading error:', error);
        handlers.onError?.({
          message: 'Stream reading failed',
          error,
        });
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Stream with automatic retry on failure
   */
  async streamToolWithRetry(
    toolName: string,
    params: any,
    handlers: StreamingCallbacks,
    authToken?: string,
    retryCount: number = 0
  ): Promise<AbortController> {
    try {
      return await this.streamTool(toolName, params, {
        ...handlers,
        onError: (error) => {
          // Retry on error if under max retries
          if (retryCount < this.maxRetries) {
            console.log(`Retrying stream (${retryCount + 1}/${this.maxRetries})...`);
            setTimeout(() => {
              this.streamToolWithRetry(toolName, params, handlers, authToken, retryCount + 1);
            }, calculateRetryDelay(retryCount, 1000));
          } else {
            handlers.onError?.(error);
          }
        },
      }, authToken);
    } catch (error: unknown) {
      if (retryCount < this.maxRetries) {
        console.log(`Retrying stream (${retryCount + 1}/${this.maxRetries})...`);
        await new Promise((resolve) =>
          setTimeout(resolve, calculateRetryDelay(retryCount, 1000))
        );
        return this.streamToolWithRetry(toolName, params, handlers, authToken, retryCount + 1);
      }
      throw error;
    }
  }
}

/**
 * RemoteServiceClient - Shared HTTP client for communicating with remote MCP services (RADA, OpenReyestr).
 *
 * Consolidates the duplicate axios instances and env-var reading that previously
 * lived in both ServiceProxy and ToolRegistry.
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { logger } from '../utils/logger.js';
import { ServiceType } from '../types/gateway.js';

export interface RemoteServiceConfig {
  baseUrl: string;
  apiKey: string;
}

export interface CallRemoteToolParams {
  service: ServiceType;
  toolName: string;
  args: any;
  requestId?: string;
  acceptHeader?: string;
}

export interface FetchedToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
}

export class RemoteServiceClient {
  private axiosClient: AxiosInstance;
  private metricsCallback: ((service: string, status: string, durationSec: number) => void) | null = null;

  constructor() {
    this.axiosClient = axios.create({
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get service configuration from environment variables.
   */
  getServiceConfig(service: ServiceType): RemoteServiceConfig {
    const configs: Record<ServiceType, RemoteServiceConfig> = {
      backend: {
        baseUrl: '',
        apiKey: '',
      },
      rada: {
        baseUrl: process.env.RADA_MCP_URL || 'http://rada-mcp-app-stage:3001',
        apiKey: process.env.RADA_API_KEY || '',
      },
      openreyestr: {
        baseUrl: process.env.OPENREYESTR_MCP_URL || 'http://app-openreyestr-stage:3005',
        apiKey: process.env.OPENREYESTR_API_KEY || '',
      },
    };

    return configs[service] || { baseUrl: '', apiKey: '' };
  }

  /**
   * Call a tool on a remote MCP service via HTTP POST.
   *
   * Supports both JSON responses and SSE streaming (when acceptHeader
   * includes 'text/event-stream', the raw stream is returned).
   */
  async callRemoteTool(params: CallRemoteToolParams): Promise<AxiosResponse['data']> {
    const { service, toolName, args, requestId, acceptHeader } = params;

    const config = this.getServiceConfig(service);

    if (!config.baseUrl || !config.apiKey) {
      throw new Error(`Service ${service} is not configured (missing URL or API key)`);
    }

    const url = `${config.baseUrl}/api/tools/${toolName}`;
    const isStreaming = !!acceptHeader?.includes('event-stream');

    logger.info('[RemoteServiceClient] Calling remote service', {
      service,
      tool: toolName,
      url,
      requestId,
      streaming: isStreaming,
    });

    const callStart = Date.now();
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: acceptHeader || 'application/json',
      };
      if (requestId) {
        headers['X-Parent-Request-ID'] = requestId;
      }

      const response: AxiosResponse = await this.axiosClient.post(
        url,
        { arguments: args },
        {
          headers,
          responseType: isStreaming ? 'stream' : 'json',
        }
      );

      const callDuration = (Date.now() - callStart) / 1000;
      this.metricsCallback?.(service, 'success', callDuration);

      logger.info('[RemoteServiceClient] Remote call successful', {
        service,
        tool: toolName,
        requestId,
        statusCode: response.status,
      });

      return response.data;
    } catch (error: any) {
      const callDuration = (Date.now() - callStart) / 1000;
      this.metricsCallback?.(service, 'error', callDuration);

      logger.error('[RemoteServiceClient] Remote call failed', {
        service,
        tool: toolName,
        requestId,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });

      throw new Error(
        `Remote service call failed (${service}/${toolName}): ${error.message}`
      );
    }
  }

  /**
   * Fetch tool definitions from a remote service via GET /api/tools.
   */
  async fetchRemoteToolDefinitions(
    serviceUrl: string,
    apiKey: string
  ): Promise<FetchedToolDefinition[]> {
    try {
      const response = await this.axiosClient.get(`${serviceUrl}/api/tools`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 5000,
      });
      return response.data.tools || [];
    } catch (err: any) {
      logger.warn('[RemoteServiceClient] Failed to fetch remote tool definitions', {
        serviceUrl,
        error: err.message,
      });
      return [];
    }
  }

  /**
   * Set optional metrics callback for external API call tracking.
   */
  setMetricsCallback(callback: (service: string, status: string, durationSec: number) => void): void {
    this.metricsCallback = callback;
  }

  /**
   * Check if a remote service is configured and available.
   */
  isServiceAvailable(service: ServiceType): boolean {
    if (service === 'backend') return true;
    const config = this.getServiceConfig(service);
    return !!(config.baseUrl && config.apiKey);
  }
}

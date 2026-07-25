/**
 * Service Proxy - HTTP client for proxying requests to remote MCP services (RADA, OpenReyestr)
 *
 * Delegates HTTP transport to RemoteServiceClient; retains cost-tracking integration.
 */

import { logger } from '../utils/logger.js';
import { CostTracker } from './cost-tracker.js';
import { ServiceType } from '../types/gateway.js';
import { RemoteServiceClient } from './remote-service-client.js';

export { RemoteServiceConfig } from './remote-service-client.js';

export interface ServiceProxyConfig {
  baseUrl: string;
  apiKey: string;
}

export class ServiceProxy {
  constructor(
    private costTracker: CostTracker,
    private remoteClient: RemoteServiceClient
  ) {}

  /**
   * Call a remote MCP service (RADA or OpenReyestr)
   */
  async callRemoteService(params: {
    service: ServiceType;
    serviceName: string; // Without prefix
    args: any;
    requestId: string;
    acceptHeader?: string; // For SSE support
  }): Promise<any> {
    const { service, serviceName, args, requestId, acceptHeader } = params;

    const responseData = await this.remoteClient.callRemoteTool({
      service,
      toolName: serviceName,
      args,
      requestId,
      acceptHeader,
    });

    // For streaming responses, return the raw stream (no cost extraction)
    if (acceptHeader?.includes('event-stream')) {
      return responseData;
    }

    // Extract cost tracking from response
    if (responseData?.cost_tracking?.actual_cost) {
      await this.recordRemoteServiceCost({
        requestId,
        service,
        toolName: serviceName,
        costData: responseData.cost_tracking.actual_cost,
      });
    }

    return responseData;
  }

  /**
   * Record cost from remote service call
   */
  private async recordRemoteServiceCost(params: {
    requestId: string;
    service: ServiceType;
    toolName: string;
    costData: any;
  }): Promise<void> {
    const { requestId, service, toolName, costData } = params;

    // Only record costs for remote services (not backend)
    if (service === 'backend') {
      return;
    }

    try {
      // Extract total cost from remote service's cost breakdown
      const totalCostUsd =
        costData.totals?.cost_usd ||
        costData.total_cost_usd ||
        0;

      if (totalCostUsd > 0) {
        await this.costTracker.recordRemoteServiceCall({
          requestId,
          service: service as 'rada' | 'openreyestr', // Safe cast since we checked above
          toolName,
          costUsd: totalCostUsd,
          details: costData,
        });

        logger.debug('[ServiceProxy] Remote service cost recorded', {
          requestId,
          service,
          tool: toolName,
          costUsd: totalCostUsd.toFixed(6),
        });
      }
    } catch (error: any) {
      logger.error('[ServiceProxy] Failed to record remote service cost', {
        requestId,
        service,
        toolName,
        error: error.message,
      });
      // Don't throw - cost tracking failure should not break the request
    }
  }

  setExternalApiMetrics(callback: (service: string, status: string, durationSec: number) => void) {
    this.remoteClient.setMetricsCallback(callback);
  }

  /**
   * Check if a service is configured and available
   */
  isServiceAvailable(service: ServiceType): boolean {
    return this.remoteClient.isServiceAvailable(service);
  }

  /**
   * Get list of available services
   */
  getAvailableServices(): ServiceType[] {
    const services: ServiceType[] = ['backend'];

    if (this.isServiceAvailable('rada')) {
      services.push('rada');
    }

    if (this.isServiceAvailable('openreyestr')) {
      services.push('openreyestr');
    }

    return services;
  }
}

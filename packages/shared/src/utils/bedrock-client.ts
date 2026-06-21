import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { logger } from './logger';
import { ModelSelector } from './model-selector';
import { requestContext, CostTrackerInterface } from './openai-client';

const FALLBACK_REGIONS = (process.env.BEDROCK_FALLBACK_REGIONS || 'us-east-1,us-west-2').split(',').map(r => r.trim()).filter(Boolean);

// Tier-based region pinning (opt-in). When set, "quick"-tier calls (intent
// classification, plan generation, replan, context summarization, etc.) are
// routed to a separate region than the standard/deep main loop. This isolates
// the many small Haiku calls from the heavy Sonnet/Opus quota on the primary
// region, removing the reactive-throttle penalty under load. Unset → no change.
const QUICK_REGION = (process.env.BEDROCK_QUICK_REGION || '').trim() || null;

function swapRegionPrefix(model: string, targetRegion: string): string {
  const regionPrefix = targetRegion.startsWith('us-') ? 'us' : targetRegion.startsWith('ap-') ? 'ap' : 'eu';
  return model.replace(/^(eu|us|ap)\./, `${regionPrefix}.`);
}

function isThrottlingError(err: any): boolean {
  const name = err?.name || err?.__type || '';
  const message = (err?.message || '').toLowerCase();
  return name === 'ThrottlingException'
    || name === 'TooManyRequestsException'
    || name === 'ServiceUnavailableException'
    || message.includes('throttl')
    || message.includes('rate exceeded')
    || message.includes('too many requests')
    || err?.['$metadata']?.httpStatusCode === 429;
}

export class BedrockClientManager {
  private client: BedrockRuntimeClient | null = null;
  private primaryRegion: string = process.env.AWS_REGION || 'eu-central-1';
  private fallbackClients: Array<{ region: string; client: BedrockRuntimeClient }> = [];
  private costTracker: CostTrackerInterface | null = null;

  constructor() {
    const region = this.primaryRegion;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (accessKeyId && secretAccessKey) {
      const creds = { accessKeyId, secretAccessKey };
      this.client = new BedrockRuntimeClient({ region, credentials: creds });

      // Ensure the quick-tier region also has a client even if it's not in the
      // throttle fallback list, so tier pinning has something to route to.
      const regions = new Set([...FALLBACK_REGIONS, ...(QUICK_REGION ? [QUICK_REGION] : [])]);
      for (const fbRegion of regions) {
        if (fbRegion !== region) {
          this.fallbackClients.push({
            region: fbRegion,
            client: new BedrockRuntimeClient({ region: fbRegion, credentials: creds }),
          });
        }
      }

      logger.info('Bedrock client manager initialized', {
        region,
        fallbackRegions: this.fallbackClients.map(c => c.region),
        quickRegion: QUICK_REGION,
      });
    } else {
      logger.warn('AWS credentials not configured - Bedrock provider will be unavailable');
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  getClient(): BedrockRuntimeClient {
    if (!this.client) {
      throw new Error('Bedrock client not configured - missing AWS credentials');
    }
    return this.client;
  }

  getFallbackClients(): Array<{ region: string; client: BedrockRuntimeClient }> {
    return this.fallbackClients;
  }

  /** All region clients (primary first, then fallbacks). */
  private allClients(): Array<{ region: string; client: BedrockRuntimeClient }> {
    return [{ region: this.primaryRegion, client: this.getClient() }, ...this.fallbackClients];
  }

  /**
   * Pick the region client for a given resource tier. "quick"-tier calls route
   * to BEDROCK_QUICK_REGION when configured (and a client exists for it);
   * everything else stays on the primary region. Falls back to primary if the
   * configured quick region has no client.
   */
  getClientForTier(tier: string): { region: string; client: BedrockRuntimeClient } {
    if (tier === 'quick' && QUICK_REGION && QUICK_REGION !== this.primaryRegion) {
      const pinned = this.fallbackClients.find(c => c.region === QUICK_REGION);
      if (pinned) return pinned;
    }
    return { region: this.primaryRegion, client: this.getClient() };
  }

  /** Failover targets for throttling, excluding the region already tried. */
  getFailoverClients(excludeRegion: string): Array<{ region: string; client: BedrockRuntimeClient }> {
    return this.allClients().filter(c => c.region !== excludeRegion);
  }

  setCostTracker(tracker: CostTrackerInterface) {
    this.costTracker = tracker;
    logger.debug('Cost tracker attached to Bedrock client manager');
  }

  async generateEmbedding(text: string, opts: { model?: string; dimensions?: number } = {}): Promise<{ embedding: number[]; inputTokens: number }> {
    const client = this.getClient();
    const model = opts.model || process.env.BEDROCK_EMBEDDING_MODEL || 'amazon.titan-embed-text-v2:0';
    const dimensions = opts.dimensions || 1024;
    const command = new InvokeModelCommand({
      modelId: model,
      contentType: 'application/json',
      accept: 'application/json',
      body: new TextEncoder().encode(JSON.stringify({
        inputText: text.substring(0, 8000),
        dimensions,
        normalize: true,
      })),
    });
    const response = await client.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.body));
    return { embedding: result.embedding, inputTokens: result.inputTextTokenCount ?? 0 };
  }

  async trackUsage(model: string, inputTokens: number, outputTokens: number): Promise<void> {
    const context = requestContext.getStore();
    if (!context || !this.costTracker) return;

    try {
      const totalTokens = inputTokens + outputTokens;
      const costUsd = ModelSelector.estimateCostAccurate(model, inputTokens, outputTokens);

      await this.costTracker.recordOpenAICall({
        requestId: context.requestId,
        model,
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens,
        costUsd,
        task: context.task,
      });

      logger.debug('Tracked Bedrock usage', {
        model,
        inputTokens,
        outputTokens,
        costUsd: `$${costUsd.toFixed(6)}`,
      });
    } catch (error) {
      logger.error('Failed to track Bedrock usage:', error);
    }
  }
}

export { isThrottlingError, swapRegionPrefix };

let bedrockManager: BedrockClientManager | null = null;

export function getBedrockManager(): BedrockClientManager {
  if (!bedrockManager) {
    bedrockManager = new BedrockClientManager();
  }
  return bedrockManager;
}

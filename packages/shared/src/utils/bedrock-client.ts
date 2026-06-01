import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { logger } from './logger';
import { ModelSelector } from './model-selector';
import { requestContext, CostTrackerInterface } from './openai-client';

const FALLBACK_REGIONS = (process.env.BEDROCK_FALLBACK_REGIONS || 'us-east-1,us-west-2').split(',').map(r => r.trim()).filter(Boolean);

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
  private fallbackClients: Array<{ region: string; client: BedrockRuntimeClient }> = [];
  private costTracker: CostTrackerInterface | null = null;

  constructor() {
    const region = process.env.AWS_REGION || 'eu-central-1';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (accessKeyId && secretAccessKey) {
      const creds = { accessKeyId, secretAccessKey };
      this.client = new BedrockRuntimeClient({ region, credentials: creds });

      for (const fbRegion of FALLBACK_REGIONS) {
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

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { logger } from './logger';
import { ModelSelector } from './model-selector';
import { requestContext, CostTrackerInterface } from './openai-client';

export class BedrockClientManager {
  private client: BedrockRuntimeClient | null = null;
  private costTracker: CostTrackerInterface | null = null;

  constructor() {
    const region = process.env.AWS_REGION || 'eu-central-1';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (accessKeyId && secretAccessKey) {
      this.client = new BedrockRuntimeClient({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
      logger.info('Bedrock client manager initialized', { region });
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

let bedrockManager: BedrockClientManager | null = null;

export function getBedrockManager(): BedrockClientManager {
  if (!bedrockManager) {
    bedrockManager = new BedrockClientManager();
  }
  return bedrockManager;
}

/**
 * VoyageAI embedding client using native fetch (Node 20+).
 * Default model: voyage-3.5 (supports Ukrainian and other languages).
 */

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const MAX_RETRIES = 3;
const BATCH_SIZE = 50; // VoyageAI supports up to 128, use 50 to match existing pattern

interface VoyageEmbeddingResponse {
  object: string;
  data: Array<{ object: string; embedding: number[]; index: number }>;
  model: string;
  usage: { total_tokens: number };
}

export interface VoyageBatchResult {
  embeddings: number[][];
  totalTokens: number;
  model: string;
}

export class VoyageAIClient {
  private apiKeys: string[];
  private keyIndex = 0;

  constructor(apiKey: string, ...extraKeys: string[]) {
    if (!apiKey) {
      throw new Error('VOYAGEAI_API_KEY is required');
    }
    this.apiKeys = [apiKey, ...extraKeys.filter(Boolean)];
  }

  /** Round-robin key selection for rate-limit distribution. */
  private nextKey(): string {
    const key = this.apiKeys[this.keyIndex % this.apiKeys.length];
    this.keyIndex++;
    return key;
  }

  async generateEmbedding(text: string, model: string = 'voyage-3.5'): Promise<number[]> {
    const result = await this.generateEmbeddingsBatchWithUsage([text], model);
    return result.embeddings[0];
  }

  async generateEmbeddingsBatch(texts: string[], model: string = 'voyage-3.5'): Promise<number[][]> {
    const result = await this.generateEmbeddingsBatchWithUsage(texts, model);
    return result.embeddings;
  }

  async generateEmbeddingsBatchWithUsage(texts: string[], model: string = 'voyage-3.5'): Promise<VoyageBatchResult> {
    const allEmbeddings: number[][] = [];
    let totalTokens = 0;

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const { embeddings, tokens } = await this._embedBatchWithRetry(batch, model);
      allEmbeddings.push(...embeddings);
      totalTokens += tokens;
    }

    return { embeddings: allEmbeddings, totalTokens, model };
  }

  private async _embedBatchWithRetry(texts: string[], model: string): Promise<{ embeddings: number[][], tokens: number }> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await this._embedBatch(texts, model);
      } catch (err: any) {
        lastError = err;

        if (err.status === 429) {
          // Rate limited — rotate key and exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        // Non-retryable error
        throw err;
      }
    }

    throw lastError ?? new Error('VoyageAI: max retries exceeded');
  }

  private async _embedBatch(texts: string[], model: string): Promise<{ embeddings: number[][], tokens: number }> {
    const response = await fetch(VOYAGE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.nextKey()}`,
      },
      body: JSON.stringify({ input: texts, model }),
    });

    if (!response.ok) {
      const body = await response.text();
      const err: any = new Error(`VoyageAI API error ${response.status}: ${body}`);
      err.status = response.status;
      throw err;
    }

    const data = (await response.json()) as VoyageEmbeddingResponse;
    // Sort by index to ensure order is preserved
    const embeddings = data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    return { embeddings, tokens: data.usage?.total_tokens ?? 0 };
  }
}

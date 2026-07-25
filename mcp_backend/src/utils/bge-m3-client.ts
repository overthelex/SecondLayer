/**
 * BGE-M3 embedding client for HuggingFace Text Embeddings Inference (TEI).
 * Uses the OpenAI-compatible /v1/embeddings endpoint.
 * Drop-in replacement for VoyageAIClient in the EDRSR vectorizer.
 */

import { logger } from './logger.js';

const MAX_RETRIES = 3;
const BATCH_SIZE = 64;

interface TEIEmbeddingResponse {
  object: string;
  data: Array<{ object: string; embedding: number[]; index: number }>;
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

export interface EmbeddingBatchResult {
  embeddings: number[][];
  totalTokens: number;
  model: string;
}

export class BgeM3Client {
  private baseUrl: string;
  private model = 'BAAI/bge-m3';

  constructor(baseUrl: string) {
    if (!baseUrl) {
      throw new Error('BGE_M3_URL is required for BgeM3Client');
    }
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const result = await this.generateEmbeddingsBatch([text]);
    return result[0];
  }

  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    const result = await this.generateEmbeddingsBatchWithUsage(texts);
    return result.embeddings;
  }

  async generateEmbeddingsBatchWithUsage(texts: string[]): Promise<EmbeddingBatchResult> {
    const allEmbeddings: number[][] = [];
    let totalTokens = 0;

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const { embeddings, tokens } = await this._embedBatchWithRetry(batch);
      allEmbeddings.push(...embeddings);
      totalTokens += tokens;
    }

    return { embeddings: allEmbeddings, totalTokens, model: this.model };
  }

  private async _embedBatchWithRetry(texts: string[]): Promise<{ embeddings: number[][]; tokens: number }> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await this._embedBatch(texts);
      } catch (err: any) {
        lastError = err;
        if (err.status === 429 || err.status === 503) {
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn(`[BgeM3Client] ${err.status} on attempt ${attempt + 1}, retrying in ${delay}ms`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }

    throw lastError ?? new Error('BgeM3Client: max retries exceeded');
  }

  private async _embedBatch(texts: string[]): Promise<{ embeddings: number[][]; tokens: number }> {
    const response = await fetch(`${this.baseUrl}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: texts, model: this.model }),
    });

    if (!response.ok) {
      const body = await response.text();
      const err: any = new Error(`BGE-M3 TEI error ${response.status}: ${body}`);
      err.status = response.status;
      throw err;
    }

    const data = (await response.json()) as TEIEmbeddingResponse;
    const embeddings = data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    return { embeddings, tokens: data.usage?.total_tokens ?? 0 };
  }
}

/**
 * Domain port barrel export.
 *
 * Re-exports every port interface and its associated domain types.
 */

// Database
export type {
  IDatabase,
  ITransactionClient,
  IQueryResult,
} from './database.js';

// Embedding / vector search
export type {
  IEmbeddingPort,
  SimilarityFilter,
  VectorSearchResult,
  RawVectorSearchResult,
  TokenUsageCallback,
} from './embedding.js';

// LLM
export type {
  ILLMPort,
  LLMMessage,
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  LLMToolCall,
  LLMToolDefinition,
  LLMUsage,
  ICostTracker,
} from './llm.js';
export type { LLMProvider, BudgetLevel } from './llm.js';

// Cache
export type { ICachePort } from './cache.js';

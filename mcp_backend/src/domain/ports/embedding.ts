/**
 * Embedding / vector-search port interface.
 *
 * Domain-owned abstraction over EmbeddingService + Qdrant.
 */

import type { EmbeddingChunk, SectionType, PrecedentStatusType } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Filter passed to similarity search
// ---------------------------------------------------------------------------

export interface SimilarityFilter {
  section_type?: SectionType;
  date_from?: string;
  date_to?: string;
  court?: string;
  chamber?: string | string[];
  dispute_category?: string;
  outcome?: string;
  deviation_flag?: boolean | null;
  precedent_status?: PrecedentStatusType;
  case_number?: string;
  matter_id?: string;
}

// ---------------------------------------------------------------------------
// Typed result from vector similarity search
// ---------------------------------------------------------------------------

export interface VectorSearchResult {
  id: string;
  score: number;
  text: string;
  doc_id: string;
  section_type: SectionType;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Raw vector search result (from searchVectors)
// ---------------------------------------------------------------------------

export interface RawVectorSearchResult {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Token-usage callback shape
// ---------------------------------------------------------------------------

export type TokenUsageCallback = (
  tokens: number,
  model: string,
  task: string,
) => void;

// ---------------------------------------------------------------------------
// Port interface
// ---------------------------------------------------------------------------

export interface IEmbeddingPort {
  /** Generate a single embedding vector for the given text. */
  generateEmbedding(text: string, task?: string): Promise<number[]>;

  /** Generate embeddings for multiple texts in one batch call. */
  generateEmbeddingsBatch(texts: string[], task?: string): Promise<number[][]>;

  /** Split text into chunks suitable for embedding. */
  splitIntoChunks(text: string): string[];

  /** Store an embedding chunk in the vector database; returns the vector id. */
  storeChunk(chunk: EmbeddingChunk): Promise<string>;

  /** Search for similar vectors with optional metadata filters. */
  searchSimilar(
    queryEmbedding: number[],
    filters?: SimilarityFilter,
    limit?: number,
  ): Promise<any[]>;

  /** Low-level vector search with arbitrary Qdrant-style filter. */
  searchVectors(
    queryEmbedding: number[],
    limit?: number,
    filter?: Record<string, unknown>,
  ): Promise<any[]>;

  /** Upsert a single vector with its payload. */
  upsertVector(
    vectorId: string,
    embedding: number[],
    payload: Record<string, unknown>,
  ): Promise<void>;

  /** Delete all vectors belonging to a document. */
  deleteByDocId(docId: string): Promise<void>;

  /** Check vector-database connectivity. */
  healthCheck(): Promise<{ ok: boolean; error?: string }>;

  /** Create collection / ensure schema exists. */
  initialize(): Promise<void>;

  /** Register a callback for tracking token usage. */
  setTokenUsageCallback(cb: TokenUsageCallback | undefined): void;

  // ─── Vault collection (private attorney documents, separate from legislation) ───

  /** Ensure the vault_documents collection exists with payload indexes. */
  ensureVaultCollection(): Promise<void>;

  /** Store a chunk in the vault collection. */
  storeVaultChunk(chunk: import('../../types/index.js').EmbeddingChunk): Promise<string>;

  /** Search vault collection with optional filters. */
  searchVaultSimilar(
    queryEmbedding: number[],
    filters?: { doc_id?: string; matter_id?: string; user_id?: string; section_type?: SectionType },
    limit?: number,
  ): Promise<any[]>;

  /** Delete all vault vectors for a document. */
  deleteVaultByDocId(docId: string): Promise<void>;
}

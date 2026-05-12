import { QdrantClient } from '@qdrant/js-client-rest';
import { logger } from '../utils/logger.js';
import { EmbeddingService } from './embedding-service.js';

const QDRANT_COLLECTIONS = {
  domain: 'wm_domain',
  workflow: 'wm_workflow',
  practitioner: 'wm_practitioner',
} as const;

const EMBEDDING_DIMENSION = 1024;
const DEFAULT_TOP_K = 5;
const MIN_SCORE = 0.35;

type Layer = 'principle' | 'pattern' | 'practitioner';

export interface WorkflowMemoryQueryOpts {
  query: string;
  layers?: Layer[];
  tags?: string[];
  topK?: number;
  minScore?: number;
  sessionId?: string;
}

export interface MemoryHit {
  layer: Layer;
  id: number;
  title: string;
  body: string;
  score: number;
  tags: string[];
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowMemoryQueryResult {
  hits: MemoryHit[];
  queryTokens: number;
  layers_searched: Layer[];
}

export interface PrincipleInput {
  principleKey: string;
  title: string;
  body: string;
  source?: string;
  sourceRef?: string;
  tags?: string[];
  confidence?: number;
}

export interface PatternInput {
  patternType: string;
  description: string;
  patternData?: Record<string, unknown>;
  sessionIds?: string[];
  tags?: string[];
}

export interface PractitionerInput {
  knowledgeType: string;
  title: string;
  body: string;
  sessionId?: string;
  commitRange?: string;
  filesTouched?: string[];
  toolsUsed?: string[];
  tags?: string[];
}

export class WorkflowMemoryService {
  private qdrant: QdrantClient;
  private initialized = false;

  constructor(
    private db: { query: (sql: string, params?: any[]) => Promise<any> },
    private embeddingService: EmbeddingService,
  ) {
    const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
    const qdrantApiKey = process.env.QDRANT_API_KEY;
    this.qdrant = new QdrantClient({ url: qdrantUrl, ...(qdrantApiKey && { apiKey: qdrantApiKey }) });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const collections = await this.qdrant.getCollections();
    const existing = new Set(collections.collections.map(c => c.name));

    for (const name of Object.values(QDRANT_COLLECTIONS)) {
      if (!existing.has(name)) {
        await this.qdrant.createCollection(name, {
          vectors: { size: EMBEDDING_DIMENSION, distance: 'Cosine' },
        });
        logger.info(`Created Qdrant collection: ${name}`);
      }
    }

    this.initialized = true;
    logger.info('WorkflowMemoryService initialized');
  }

  async query(opts: WorkflowMemoryQueryOpts): Promise<WorkflowMemoryQueryResult> {
    await this.initialize();

    const layers = opts.layers ?? ['principle', 'pattern', 'practitioner'];
    const topK = opts.topK ?? DEFAULT_TOP_K;
    const minScore = opts.minScore ?? MIN_SCORE;

    const embedding = await this.embeddingService.generateEmbedding(opts.query, 'wm_query');

    const allHits: MemoryHit[] = [];

    const searches = layers.map(async (layer) => {
      const collectionName = this.collectionForLayer(layer);

      const filter = opts.tags?.length
        ? { must: [{ key: 'tags', match: { any: opts.tags } }] }
        : undefined;

      const results = await this.qdrant.search(collectionName, {
        vector: embedding,
        limit: topK,
        score_threshold: minScore,
        with_payload: true,
        filter,
      });

      for (const r of results) {
        const p = r.payload as Record<string, any>;
        allHits.push({
          layer,
          id: p.pg_id ?? 0,
          title: p.title ?? '',
          body: p.body ?? '',
          score: r.score,
          tags: p.tags ?? [],
          source: p.source,
          metadata: p.metadata,
        });
      }
    });

    await Promise.all(searches);

    allHits.sort((a, b) => b.score - a.score);
    const trimmed = allHits.slice(0, topK);

    if (opts.sessionId) {
      await this.logRetrieval(opts.sessionId, opts.query, trimmed);
    }

    return {
      hits: trimmed,
      queryTokens: 0,
      layers_searched: layers,
    };
  }

  // ── Ingestion ──────────────────────────────────────────────

  async ingestPrinciple(input: PrincipleInput): Promise<number> {
    await this.initialize();

    const res = await this.db.query(
      `INSERT INTO workflow_memory_principles
         (principle_key, title, body, source, source_ref, tags, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (principle_key) DO UPDATE SET
         title = EXCLUDED.title, body = EXCLUDED.body,
         source = EXCLUDED.source, source_ref = EXCLUDED.source_ref,
         tags = EXCLUDED.tags, confidence = EXCLUDED.confidence,
         updated_at = NOW()
       RETURNING id`,
      [input.principleKey, input.title, input.body, input.source ?? null,
       input.sourceRef ?? null, input.tags ?? [], input.confidence ?? 1.0],
    );
    const pgId: number = res.rows[0].id;

    const text = `${input.title}\n${input.body}`;
    const embedding = await this.embeddingService.generateEmbedding(text, 'wm_ingest_principle');
    await this.qdrant.upsert(QDRANT_COLLECTIONS.domain, {
      points: [{
        id: pgId,
        vector: embedding,
        payload: { pg_id: pgId, title: input.title, body: input.body, source: input.source, tags: input.tags ?? [] },
      }],
    });

    return pgId;
  }

  async ingestPattern(input: PatternInput): Promise<number> {
    await this.initialize();

    const res = await this.db.query(
      `INSERT INTO workflow_memory_patterns
         (pattern_type, description, pattern_data, session_ids, tags)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [input.patternType, input.description, JSON.stringify(input.patternData ?? {}),
       input.sessionIds ?? [], input.tags ?? []],
    );
    const pgId: number = res.rows[0].id;

    const embedding = await this.embeddingService.generateEmbedding(input.description, 'wm_ingest_pattern');
    await this.qdrant.upsert(QDRANT_COLLECTIONS.workflow, {
      points: [{
        id: pgId,
        vector: embedding,
        payload: { pg_id: pgId, title: input.patternType, body: input.description,
                   tags: input.tags ?? [], metadata: input.patternData },
      }],
    });

    return pgId;
  }

  async ingestPractitioner(input: PractitionerInput): Promise<number> {
    await this.initialize();

    const res = await this.db.query(
      `INSERT INTO workflow_memory_practitioner
         (knowledge_type, title, body, session_id, commit_range, files_touched, tools_used, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [input.knowledgeType, input.title, input.body, input.sessionId ?? null,
       input.commitRange ?? null, input.filesTouched ?? [], input.toolsUsed ?? [], input.tags ?? []],
    );
    const pgId: number = res.rows[0].id;

    const text = `${input.title}\n${input.body}`;
    const embedding = await this.embeddingService.generateEmbedding(text, 'wm_ingest_practitioner');
    await this.qdrant.upsert(QDRANT_COLLECTIONS.practitioner, {
      points: [{
        id: pgId,
        vector: embedding,
        payload: { pg_id: pgId, title: input.title, body: input.body,
                   tags: input.tags ?? [], metadata: { knowledgeType: input.knowledgeType } },
      }],
    });

    return pgId;
  }

  // ── Retrieval log ──────────────────────────────────────────

  private async logRetrieval(sessionId: string, queryText: string, hits: MemoryHit[]): Promise<void> {
    const byLayer = new Map<Layer, { ids: number[]; scores: number[] }>();
    for (const h of hits) {
      if (!byLayer.has(h.layer)) byLayer.set(h.layer, { ids: [], scores: [] });
      const entry = byLayer.get(h.layer)!;
      entry.ids.push(h.id);
      entry.scores.push(h.score);
    }

    for (const [layer, { ids, scores }] of byLayer) {
      await this.db.query(
        `INSERT INTO workflow_memory_retrievals (session_id, query_text, layer, result_ids, scores)
         VALUES ($1, $2, $3, $4, $5)`,
        [sessionId, queryText, layer, ids, scores],
      );
    }
  }

  // ── Stats ──────────────────────────────────────────────────

  async getStats(): Promise<Record<string, number>> {
    const [principles, patterns, practitioner, retrievals] = await Promise.all([
      this.db.query('SELECT COUNT(*) AS cnt FROM workflow_memory_principles'),
      this.db.query('SELECT COUNT(*) AS cnt FROM workflow_memory_patterns'),
      this.db.query('SELECT COUNT(*) AS cnt FROM workflow_memory_practitioner'),
      this.db.query('SELECT COUNT(*) AS cnt FROM workflow_memory_retrievals'),
    ]);
    return {
      principles: Number(principles.rows[0].cnt),
      patterns: Number(patterns.rows[0].cnt),
      practitioner: Number(practitioner.rows[0].cnt),
      retrievals: Number(retrievals.rows[0].cnt),
    };
  }

  private collectionForLayer(layer: Layer): string {
    switch (layer) {
      case 'principle': return QDRANT_COLLECTIONS.domain;
      case 'pattern': return QDRANT_COLLECTIONS.workflow;
      case 'practitioner': return QDRANT_COLLECTIONS.practitioner;
    }
  }
}

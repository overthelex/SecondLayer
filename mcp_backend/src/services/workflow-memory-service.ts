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

export interface ReconciliationResult {
  reconciliationId: number;
  retrievedCount: number;
  relevantCount: number;
  missedCount: number;
  spuriousCount: number;
  precision: number | null;
  recall: number | null;
  candidates: Array<{ id: number; title: string; reason: string }>;
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

  // ── Reconciliation (Phase 1.4) ─────────────────────────────

  async reconcileSession(opts: {
    sessionId: string;
    commitRange?: string;
    filesTouched: string[];
    toolsUsed?: string[];
    promptsCount?: number;
  }): Promise<ReconciliationResult> {
    await this.initialize();

    // 1. Get what was retrieved during this session
    const retrievalRows = await this.db.query(
      `SELECT DISTINCT UNNEST(result_ids) AS pid FROM workflow_memory_retrievals WHERE session_id = $1`,
      [opts.sessionId],
    );
    const retrievedIds = new Set<number>(retrievalRows.rows.map((r: any) => r.pid));

    // 2. Find principles relevant to files touched — match by tags inferred from paths
    const fileTags = this.inferTagsFromPaths(opts.filesTouched);
    let relevantIds = new Set<number>();

    if (fileTags.length > 0) {
      const tagRes = await this.db.query(
        `SELECT id FROM workflow_memory_principles WHERE tags && $1`,
        [fileTags],
      );
      relevantIds = new Set<number>(tagRes.rows.map((r: any) => r.id));
    }

    // Also check keyword overlap: principles whose body mentions touched file paths
    if (opts.filesTouched.length > 0) {
      const pathFragments = opts.filesTouched
        .map(f => f.split('/').pop()?.replace(/\.[^.]+$/, ''))
        .filter(Boolean)
        .slice(0, 20);

      if (pathFragments.length > 0) {
        const pattern = pathFragments.join('|');
        const keywordRes = await this.db.query(
          `SELECT id FROM workflow_memory_principles WHERE body ~* $1 LIMIT 50`,
          [pattern],
        );
        for (const r of keywordRes.rows) relevantIds.add(r.id);
      }
    }

    // 3. Compute precision / recall / misses
    const intersection = new Set([...retrievedIds].filter(id => relevantIds.has(id)));
    const missedIds = new Set([...relevantIds].filter(id => !retrievedIds.has(id)));
    const spuriousIds = new Set([...retrievedIds].filter(id => !relevantIds.has(id)));

    const precision = retrievedIds.size > 0 ? intersection.size / retrievedIds.size : null;
    const recall = relevantIds.size > 0 ? intersection.size / relevantIds.size : null;

    // 4. Mark retrieval rows as useful/not-useful
    if (retrievedIds.size > 0) {
      const usefulIds = [...intersection];
      const notUsefulIds = [...spuriousIds];

      if (usefulIds.length > 0) {
        await this.db.query(
          `UPDATE workflow_memory_retrievals SET was_useful = true
           WHERE session_id = $1 AND result_ids && $2`,
          [opts.sessionId, usefulIds],
        );
      }
      if (notUsefulIds.length > 0) {
        await this.db.query(
          `UPDATE workflow_memory_retrievals SET was_useful = false
           WHERE session_id = $1 AND NOT (result_ids && $2)`,
          [opts.sessionId, usefulIds.length > 0 ? usefulIds : [0]],
        );
      }
    }

    // 5. Build candidate principles from missed principles (for review)
    const candidates: Array<{ id: number; title: string; reason: string }> = [];
    if (missedIds.size > 0) {
      const missedRes = await this.db.query(
        `SELECT id, title, tags FROM workflow_memory_principles WHERE id = ANY($1)`,
        [[...missedIds]],
      );
      for (const r of missedRes.rows) {
        candidates.push({
          id: r.id,
          title: r.title,
          reason: `Relevant to files touched but not retrieved (tags: ${(r.tags || []).join(', ')})`,
        });
      }
    }

    // 6. Store reconciliation record
    const res = await this.db.query(
      `INSERT INTO workflow_memory_reconciliations
         (session_id, commit_range, files_touched, tools_used, prompts_count,
          retrieved_ids, relevant_ids, missed_ids, spurious_ids,
          precision, recall, candidate_principles, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'completed')
       RETURNING id`,
      [
        opts.sessionId, opts.commitRange ?? null,
        opts.filesTouched, opts.toolsUsed ?? [],
        opts.promptsCount ?? 0,
        [...retrievedIds], [...relevantIds], [...missedIds], [...spuriousIds],
        precision, recall,
        JSON.stringify(candidates),
      ],
    );

    return {
      reconciliationId: res.rows[0].id,
      retrievedCount: retrievedIds.size,
      relevantCount: relevantIds.size,
      missedCount: missedIds.size,
      spuriousCount: spuriousIds.size,
      precision,
      recall,
      candidates,
    };
  }

  private inferTagsFromPaths(files: string[]): string[] {
    const tags = new Set<string>();
    for (const f of files) {
      if (f.includes('deployment/') || f.includes('docker') || f.includes('Dockerfile')) tags.add('deployment').add('docker');
      if (f.includes('ci-') || f.includes('.github/')) tags.add('ci-cd');
      if (f.includes('nginx')) tags.add('deployment');
      if (f.includes('migration')) tags.add('infrastructure');
      if (f.includes('mcp_backend/')) tags.add('architecture');
      if (f.includes('mcp_rada/')) tags.add('architecture');
      if (f.includes('lexwebapp/')) tags.add('frontend');
      if (f.includes('.test.') || f.includes('__tests__')) tags.add('testing');
      if (f.includes('package.json') || f.includes('tsconfig')) tags.add('typescript');
      if (f.includes('auth') || f.includes('oauth') || f.includes('diia')) tags.add('auth');
      if (f.includes('billing') || f.includes('monobank') || f.includes('payment')) tags.add('billing');
      if (f.includes('git') || f.includes('.github')) tags.add('git');
      if (f.includes('script')) tags.add('workflow');
    }
    return [...tags];
  }

  // ── Stats ──────────────────────────────────────────────────

  async getStats(): Promise<Record<string, number>> {
    const [principles, patterns, practitioner, retrievals, reconciliations] = await Promise.all([
      this.db.query('SELECT COUNT(*) AS cnt FROM workflow_memory_principles'),
      this.db.query('SELECT COUNT(*) AS cnt FROM workflow_memory_patterns'),
      this.db.query('SELECT COUNT(*) AS cnt FROM workflow_memory_practitioner'),
      this.db.query('SELECT COUNT(*) AS cnt FROM workflow_memory_retrievals'),
      this.db.query('SELECT COUNT(*) AS cnt FROM workflow_memory_reconciliations').catch(() => ({ rows: [{ cnt: 0 }] })),
    ]);
    return {
      principles: Number(principles.rows[0].cnt),
      patterns: Number(patterns.rows[0].cnt),
      practitioner: Number(practitioner.rows[0].cnt),
      retrievals: Number(retrievals.rows[0].cnt),
      reconciliations: Number(reconciliations.rows[0].cnt),
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

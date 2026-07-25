import crypto from 'crypto';
import { logger } from '../utils/logger.js';

type BudgetLevel = 'quick' | 'standard' | 'deep';

export interface ABVariant {
  name: string;
  model?: string;
  weight: number;
  [key: string]: any;
}

export interface ABExperimentConfig {
  variants: ABVariant[];
}

export interface ABExperiment {
  id: string;
  name: string;
  description: string | null;
  experiment_type: string;
  status: string;
  config: ABExperimentConfig;
  target_budget: BudgetLevel | null;
  traffic_pct: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  started_at: Date | null;
  ended_at: Date | null;
}

export interface ABVariantResult {
  variant_name: string;
  user_count: number;
  event_count: number;
  avg_cost_usd: number | null;
  total_cost_usd: number | null;
  avg_latency_ms: number | null;
  avg_tokens: number | null;
  error_count: number;
}

export interface ABModelOverride {
  model: string;
  experimentId: string;
  variant: string;
}

interface DB {
  query: (sql: string, params?: any[]) => Promise<any>;
}

export class ABTestingService {
  private experimentCache = new Map<string, { exp: ABExperiment; ts: number }>();
  private assignmentCache = new Map<string, { variant: string; ts: number }>();
  private activeByBudgetCache: { experiments: ABExperiment[]; ts: number } | null = null;
  private readonly CACHE_TTL_MS = 60_000;

  constructor(private db: DB) {}

  async createExperiment(params: {
    name: string;
    description?: string;
    experiment_type?: string;
    config: ABExperimentConfig;
    target_budget?: BudgetLevel;
    traffic_pct?: number;
    created_by?: string;
  }): Promise<ABExperiment> {
    const id = `ab_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const res = await this.db.query(
      `INSERT INTO ab_experiments (id, name, description, experiment_type, config, target_budget, traffic_pct, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        id,
        params.name,
        params.description ?? null,
        params.experiment_type ?? 'model',
        JSON.stringify(params.config),
        params.target_budget ?? null,
        params.traffic_pct ?? 100,
        params.created_by ?? null,
      ],
    );
    this.invalidateCache();
    return this.rowToExperiment(res.rows[0]);
  }

  async getExperiment(id: string): Promise<ABExperiment | null> {
    const cached = this.experimentCache.get(id);
    if (cached && Date.now() - cached.ts < this.CACHE_TTL_MS) return cached.exp;

    const res = await this.db.query('SELECT * FROM ab_experiments WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;
    const exp = this.rowToExperiment(res.rows[0]);
    this.experimentCache.set(id, { exp, ts: Date.now() });
    return exp;
  }

  async listExperiments(status?: string): Promise<ABExperiment[]> {
    const sql = status
      ? 'SELECT * FROM ab_experiments WHERE status = $1 ORDER BY created_at DESC'
      : 'SELECT * FROM ab_experiments ORDER BY created_at DESC';
    const res = await this.db.query(sql, status ? [status] : []);
    return res.rows.map((r: any) => this.rowToExperiment(r));
  }

  async updateExperimentStatus(id: string, status: 'running' | 'paused' | 'completed'): Promise<ABExperiment | null> {
    const timeField = status === 'running' ? 'started_at' : status === 'completed' ? 'ended_at' : null;
    const sql = timeField
      ? `UPDATE ab_experiments SET status = $2, ${timeField} = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`
      : `UPDATE ab_experiments SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`;
    const res = await this.db.query(sql, [id, status]);
    this.invalidateCache();
    if (res.rows.length === 0) return null;
    return this.rowToExperiment(res.rows[0]);
  }

  async getOrAssignVariant(experimentId: string, userId: string): Promise<string | null> {
    const cacheKey = `${experimentId}:${userId}`;
    const cached = this.assignmentCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < this.CACHE_TTL_MS) return cached.variant;

    const existing = await this.db.query(
      'SELECT variant_name FROM ab_assignments WHERE experiment_id = $1 AND user_id = $2',
      [experimentId, userId],
    );
    if (existing.rows.length > 0) {
      const v = existing.rows[0].variant_name;
      this.assignmentCache.set(cacheKey, { variant: v, ts: Date.now() });
      return v;
    }

    const experiment = await this.getExperiment(experimentId);
    if (!experiment || experiment.status !== 'running') return null;

    const variant = this.pickVariant(experiment.config.variants, experimentId, userId);

    await this.db.query(
      `INSERT INTO ab_assignments (experiment_id, user_id, variant_name)
       VALUES ($1, $2, $3) ON CONFLICT (experiment_id, user_id) DO NOTHING`,
      [experimentId, userId, variant],
    );

    this.assignmentCache.set(cacheKey, { variant, ts: Date.now() });
    return variant;
  }

  async resolveModelForUser(userId: string, budget: BudgetLevel): Promise<ABModelOverride | null> {
    const experiments = await this.getActiveExperimentsForBudget(budget);
    if (experiments.length === 0) return null;

    const experiment = experiments[0];

    if (!this.isUserEnrolled(experiment, userId)) return null;

    const variant = await this.getOrAssignVariant(experiment.id, userId);
    if (!variant) return null;

    const variantConfig = experiment.config.variants.find(v => v.name === variant);
    if (!variantConfig?.model) return null;

    return {
      model: variantConfig.model,
      experimentId: experiment.id,
      variant,
    };
  }

  async trackEvent(params: {
    experimentId: string;
    userId: string;
    variantName: string;
    eventType: string;
    eventData?: Record<string, any>;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO ab_events (experiment_id, user_id, variant_name, event_type, event_data)
       VALUES ($1, $2, $3, $4, $5)`,
      [params.experimentId, params.userId, params.variantName, params.eventType, JSON.stringify(params.eventData ?? {})],
    ).catch(err => {
      logger.warn('Failed to track A/B event', { error: err.message, experimentId: params.experimentId });
    });
  }

  async getExperimentResults(experimentId: string): Promise<ABVariantResult[]> {
    const res = await this.db.query(
      `SELECT
         e.variant_name,
         COUNT(DISTINCT e.user_id) AS user_count,
         COUNT(*) AS event_count,
         AVG((e.event_data->>'cost_usd')::numeric) AS avg_cost_usd,
         SUM((e.event_data->>'cost_usd')::numeric) AS total_cost_usd,
         AVG((e.event_data->>'latency_ms')::numeric) AS avg_latency_ms,
         AVG((e.event_data->>'tokens')::numeric) AS avg_tokens,
         COUNT(*) FILTER (WHERE e.event_type = 'error') AS error_count
       FROM ab_events e
       WHERE e.experiment_id = $1
       GROUP BY e.variant_name
       ORDER BY e.variant_name`,
      [experimentId],
    );

    return res.rows.map((r: Record<string, any>) => ({
      variant_name: r.variant_name,
      user_count: Number(r.user_count),
      event_count: Number(r.event_count),
      avg_cost_usd: r.avg_cost_usd !== null ? Number(r.avg_cost_usd) : null,
      total_cost_usd: r.total_cost_usd !== null ? Number(r.total_cost_usd) : null,
      avg_latency_ms: r.avg_latency_ms !== null ? Number(r.avg_latency_ms) : null,
      avg_tokens: r.avg_tokens !== null ? Number(r.avg_tokens) : null,
      error_count: Number(r.error_count),
    }));
  }

  private async getActiveExperimentsForBudget(budget: BudgetLevel): Promise<ABExperiment[]> {
    if (this.activeByBudgetCache && Date.now() - this.activeByBudgetCache.ts < this.CACHE_TTL_MS) {
      return this.activeByBudgetCache.experiments.filter(
        e => e.target_budget === null || e.target_budget === budget,
      );
    }

    const res = await this.db.query(
      `SELECT * FROM ab_experiments WHERE status = 'running' AND experiment_type = 'model' ORDER BY created_at DESC`,
    );
    const experiments = res.rows.map((r: any) => this.rowToExperiment(r));
    this.activeByBudgetCache = { experiments, ts: Date.now() };

    return experiments.filter((e: ABExperiment) => e.target_budget === null || e.target_budget === budget);
  }

  private pickVariant(variants: ABVariant[], experimentId: string, userId: string): string {
    const hash = crypto.createHash('sha256').update(experimentId + userId).digest();
    const bucket = hash.readUInt32BE(0) % 10000;

    const totalWeight = variants.reduce((s, v) => s + v.weight, 0);
    let cumulative = 0;
    for (const v of variants) {
      cumulative += (v.weight / totalWeight) * 10000;
      if (bucket < cumulative) return v.name;
    }
    return variants[variants.length - 1].name;
  }

  private isUserEnrolled(experiment: ABExperiment, userId: string): boolean {
    if (experiment.traffic_pct >= 100) return true;
    const hash = crypto.createHash('sha256').update('enroll:' + experiment.id + userId).digest();
    const bucket = hash.readUInt32BE(0) % 100;
    return bucket < experiment.traffic_pct;
  }

  private invalidateCache(): void {
    this.experimentCache.clear();
    this.assignmentCache.clear();
    this.activeByBudgetCache = null;
  }

  private rowToExperiment(row: any): ABExperiment {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      experiment_type: row.experiment_type,
      status: row.status,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
      target_budget: row.target_budget,
      traffic_pct: row.traffic_pct,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
      started_at: row.started_at,
      ended_at: row.ended_at,
    };
  }
}

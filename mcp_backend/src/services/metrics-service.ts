import client, { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { logger } from '../utils/logger.js';

/**
 * Prometheus metrics service for mcp_backend.
 * Collects default Node.js metrics, HTTP request metrics, PG pool stats,
 * BullMQ upload queue metrics, external API call metrics, and cost tracking.
 */
export class MetricsService {
  private registry: Registry;

  // HTTP metrics
  readonly httpRequestDuration: Histogram;
  readonly httpRequestsTotal: Counter;

  // PG pool metrics
  readonly pgPoolConnections: Gauge;

  // Upload / BullMQ metrics
  readonly bullmqJobs: Gauge;
  readonly uploadQueueDepth: Gauge;
  readonly uploadProcessingActive: Gauge;
  readonly uploadProcessingDuration: Histogram;

  // External API metrics
  readonly externalApiCallsTotal: Counter;
  readonly externalApiDuration: Histogram;

  // CPU adaptive concurrency metrics
  readonly cpuAdaptiveConcurrency: Gauge;
  readonly cpuLoadAverage: Gauge;
  readonly cpuCoresAvailable: Gauge;

  // Cost metrics
  readonly costTrackingTotalUsd: Counter;

  // SSE connection metrics
  readonly sseActiveConnections: Gauge;

  // EDRSR cache metrics
  readonly edsrCacheOps: Counter;

  // Vectorizer worker metrics
  readonly edsrVectorizerDocsProcessed: Counter;
  readonly edsrVectorizerErrors: Counter;
  readonly edsrVectorizerStatus: Gauge;

  // Consultation message bus metrics
  readonly consultationBusMessages: Counter;

  // Chat tool grouping metrics
  readonly chatToolGroupRequests: Counter;
  // V3 chat telemetry (CORE-55)
  readonly chatGroundingScore: Histogram;
  readonly chatGroundingSignals: Counter;
  readonly chatAgenticIterations: Histogram;
  readonly chatToolCallsPerRequest: Histogram;
  readonly chatToolRepeatMax: Histogram;
  readonly chatCapHits: Counter;
  readonly chatCapHitRequests: Counter;

  // Backend Redis client health
  readonly backendRedisClientUp: Gauge;
  readonly redisCommandErrors: Counter;

  constructor() {
    this.registry = new Registry();

    // Default Node.js metrics (CPU, memory, GC, event loop lag)
    // Note: prom-client already prefixes these with "nodejs_" (e.g. nodejs_heap_size_used_bytes),
    // so we must NOT add an extra prefix to avoid double-prefixing (nodejs_nodejs_*).
    collectDefaultMetrics({ register: this.registry });

    // --- HTTP ---
    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'] as const,
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'] as const,
      registers: [this.registry],
    });

    // --- PG Pool ---
    this.pgPoolConnections = new Gauge({
      name: 'pg_pool_connections',
      help: 'PostgreSQL connection pool status',
      labelNames: ['state'] as const,
      registers: [this.registry],
    });

    // --- BullMQ / Upload ---
    this.bullmqJobs = new Gauge({
      name: 'bullmq_jobs',
      help: 'BullMQ job counts by status',
      labelNames: ['status'] as const,
      registers: [this.registry],
    });

    this.uploadQueueDepth = new Gauge({
      name: 'upload_queue_depth',
      help: 'Current upload queue depth (waiting + active)',
      registers: [this.registry],
    });

    this.uploadProcessingActive = new Gauge({
      name: 'upload_processing_active',
      help: 'Number of actively processing uploads',
      registers: [this.registry],
    });

    this.uploadProcessingDuration = new Histogram({
      name: 'upload_processing_duration_seconds',
      help: 'Upload file processing duration in seconds',
      labelNames: ['status'] as const,
      buckets: [1, 5, 10, 30, 60, 120, 300],
      registers: [this.registry],
    });

    // --- External API ---
    this.externalApiCallsTotal = new Counter({
      name: 'external_api_calls_total',
      help: 'Total external API calls',
      labelNames: ['service', 'status'] as const,
      registers: [this.registry],
    });

    this.externalApiDuration = new Histogram({
      name: 'external_api_duration_seconds',
      help: 'External API call duration in seconds',
      labelNames: ['service'] as const,
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    // --- CPU Adaptive Concurrency ---
    this.cpuAdaptiveConcurrency = new Gauge({
      name: 'cpu_adaptive_concurrency',
      help: 'Current BullMQ worker concurrency setting',
      registers: [this.registry],
    });

    this.cpuLoadAverage = new Gauge({
      name: 'cpu_load_average',
      help: '1-minute CPU load average',
      registers: [this.registry],
    });

    this.cpuCoresAvailable = new Gauge({
      name: 'cpu_cores_available',
      help: 'Total CPU cores available',
      registers: [this.registry],
    });

    // --- Cost ---
    this.costTrackingTotalUsd = new Counter({
      name: 'cost_tracking_total_usd',
      help: 'Total cost tracked in USD',
      labelNames: ['tool_name'] as const,
      registers: [this.registry],
    });

    // --- SSE Connections ---
    this.sseActiveConnections = new Gauge({
      name: 'sse_active_connections',
      help: 'Active SSE connections by type',
      labelNames: ['type'] as const, // 'user_stream' | 'message_stream'
      registers: [this.registry],
    });

    // --- EDRSR Cache ---
    this.edsrCacheOps = new Counter({
      name: 'edrsr_cache_operations_total',
      help: 'EDRSR cache operations',
      labelNames: ['operation', 'result'] as const, // operation: fulltext|metadata|fts, result: hit|miss
      registers: [this.registry],
    });

    // --- Vectorizer Worker ---
    this.edsrVectorizerDocsProcessed = new Counter({
      name: 'edrsr_vectorizer_docs_processed_total',
      help: 'Documents processed by EDRSR pre-vectorizer',
      registers: [this.registry],
    });

    this.edsrVectorizerErrors = new Counter({
      name: 'edrsr_vectorizer_errors_total',
      help: 'EDRSR pre-vectorizer batch errors',
      registers: [this.registry],
    });

    this.edsrVectorizerStatus = new Gauge({
      name: 'edrsr_vectorizer_status',
      help: 'EDRSR pre-vectorizer status (1=running, 0=stopped, -1=paused)',
      registers: [this.registry],
    });

    // --- Consultation Message Bus ---
    this.consultationBusMessages = new Counter({
      name: 'consultation_bus_messages_total',
      help: 'Messages published via consultation message bus',
      labelNames: ['channel'] as const, // msg|status|consultation_status|typing|user_event
      registers: [this.registry],
    });

    // --- Chat Tool Grouping ---
    this.chatToolGroupRequests = new Counter({
      name: 'chat_tool_group_requests_total',
      help: 'LLM requests for additional tool groups via meta-tool',
      labelNames: ['groups'] as const,
      registers: [this.registry],
    });

    // V3 chat telemetry (CORE-55) — grounding quality + tool-thrashing per request.
    this.chatGroundingScore = new Histogram({
      name: 'chat_grounding_score',
      help: 'Per-request composite grounding score (0-100; lower = more fabricated/ungrounded citations)',
      labelNames: ['query_type'] as const,
      buckets: [0, 25, 50, 70, 85, 95, 100],
      registers: [this.registry],
    });
    this.chatGroundingSignals = new Counter({
      name: 'chat_grounding_signals_total',
      help: 'Count of grounding violations by signal type (fabricated_cases, fabricated_articles, low_relevance, subject_mismatch, ungrounded_quotes)',
      labelNames: ['signal_type'] as const,
      registers: [this.registry],
    });
    this.chatAgenticIterations = new Histogram({
      name: 'chat_agentic_iterations',
      help: 'Agentic-loop iterations per chat request (high = thrashing)',
      labelNames: ['query_type'] as const,
      buckets: [1, 2, 3, 5, 8, 12, 16, 25],
      registers: [this.registry],
    });
    this.chatToolCallsPerRequest = new Histogram({
      name: 'chat_tool_calls_per_request',
      help: 'Total tool calls executed per chat request',
      labelNames: ['query_type'] as const,
      buckets: [0, 1, 2, 3, 5, 8, 12, 20, 25, 30],
      registers: [this.registry],
    });
    this.chatToolRepeatMax = new Histogram({
      name: 'chat_tool_repeat_max',
      help: 'Max calls to a single tool in one request (repeats with varying params = thrashing)',
      labelNames: ['query_type'] as const,
      buckets: [1, 2, 3, 4, 6, 8, 12],
      registers: [this.registry],
    });
    this.chatCapHits = new Counter({
      name: 'chat_cap_hits_total',
      help: 'Safety-cap hits per request (kind: repeat = per-tool repeat cap, total = total tool-call cap)',
      labelNames: ['kind'] as const,
      registers: [this.registry],
    });
    this.chatCapHitRequests = new Counter({
      name: 'chat_cap_hit_requests_total',
      help: 'Requests that hit at least one safety cap, counted once per request (kind: repeat, total, any). Divide by chat_tool_calls_per_request_count for the share of truncated requests.',
      labelNames: ['kind'] as const,
      registers: [this.registry],
    });

    // --- Backend Redis client health ---
    // backendRedisClientUp: named distinctly from the redis_exporter's `redis_up` (server-side)
    // — this tracks the backend's OWN client connection. redisCommandErrors: rate of failed cache
    // ops; a sustained rate flags a stuck/half-open client even while the gauge still reads 1.
    this.backendRedisClientUp = new Gauge({
      name: 'backend_redis_client_up',
      help: 'Backend Redis client connection state (1=ready, 0=down/reconnecting)',
      registers: [this.registry],
    });
    this.redisCommandErrors = new Counter({
      name: 'redis_command_errors_total',
      help: 'Backend Redis cache command failures (timeout or connection error) by operation',
      labelNames: ['operation'] as const, // GET|SET|SETEX|DEL|INCR|PING
      registers: [this.registry],
    });

    // Pre-initialize external API counters so Prometheus always has these series
    // (counters don't appear until first .inc() otherwise)
    for (const svc of ['openai', 'anthropic', 'rada', 'diia']) {
      this.externalApiCallsTotal.inc({ service: svc, status: 'success' }, 0);
    }
    // Pre-initialize so the alert expression has a series before the first error/connect.
    this.redisCommandErrors.inc({ operation: 'GET' }, 0);
    this.backendRedisClientUp.set(0);
    // Pre-initialize cap-hit counters so the "share of truncated requests"
    // ratio resolves to 0 (not "no data") before the first cap fires.
    for (const kind of ['repeat', 'total']) {
      this.chatCapHits.inc({ kind }, 0);
    }
    for (const kind of ['repeat', 'total', 'any']) {
      this.chatCapHitRequests.inc({ kind }, 0);
    }

    logger.info('[Metrics] MetricsService initialized');
  }

  /**
   * Normalize route for Prometheus labels to prevent high cardinality.
   * /api/tools/search_court_decisions → /api/tools/:toolName
   * /api/upload/abc-123/chunk → /api/upload/:uploadId/chunk
   * UUIDs → :uuid
   */
  normalizeRoute(path: string): string {
    return path
      // UUID pattern
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':uuid')
      // Tool name after /api/tools/
      .replace(/\/api\/tools\/([^/]+)/, '/api/tools/:toolName')
      // Upload ID after /api/upload/
      .replace(/\/api\/upload\/([^/]+)/, '/api/upload/:uploadId')
      // Matter/client IDs
      .replace(/\/api\/matters\/([^/]+)/, '/api/matters/:id')
      // Admin user IDs
      .replace(/\/api\/admin\/users\/([^/]+)/, '/api/admin/users/:userId')
      // Conversation IDs
      .replace(/\/api\/conversations\/([^/]+)/, '/api/conversations/:id')
      // Template IDs
      .replace(/\/api\/templates\/([^/]+)/, '/api/templates/:id')
      // Invoice numbers
      .replace(/\/api\/billing\/invoices\/([^/]+)/, '/api/billing/invoices/:invoiceNumber')
      // Generic numeric IDs at end of path
      .replace(/\/\d+$/, '/:id');
  }

  /**
   * Update PG pool gauges from pool stats callback.
   */
  updatePgPool(stats: { total: number; idle: number; waiting: number }): void {
    this.pgPoolConnections.set({ state: 'active' }, stats.total - stats.idle);
    this.pgPoolConnections.set({ state: 'idle' }, stats.idle);
    this.pgPoolConnections.set({ state: 'waiting' }, stats.waiting);
  }

  /**
   * Update BullMQ job gauges from queue metrics.
   */
  updateUploadQueue(metrics: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }): void {
    this.bullmqJobs.set({ status: 'waiting' }, metrics.waiting);
    this.bullmqJobs.set({ status: 'active' }, metrics.active);
    this.bullmqJobs.set({ status: 'completed' }, metrics.completed);
    this.bullmqJobs.set({ status: 'failed' }, metrics.failed);
    this.bullmqJobs.set({ status: 'delayed' }, metrics.delayed);
    this.uploadQueueDepth.set(metrics.waiting + metrics.active);
    this.uploadProcessingActive.set(metrics.active);
  }

  /**
   * Update CPU adaptive concurrency gauges.
   */
  updateCpuAdaptive(metrics: { concurrency: number; loadAverage: number; cpuCores: number }): void {
    this.cpuAdaptiveConcurrency.set(metrics.concurrency);
    this.cpuLoadAverage.set(metrics.loadAverage);
    this.cpuCoresAvailable.set(metrics.cpuCores);
  }

  /**
   * Returns Prometheus text format metrics string.
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Returns the content type for Prometheus metrics.
   */
  getContentType(): string {
    return this.registry.contentType;
  }
}

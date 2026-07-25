export interface BulkScrapeJob {
  job_id: string;
  phase: string;
  status: string;
  total_docs: number;
  processed_docs: number;
  failed_docs: number;
  skipped_docs: number;
  metadata: Record<string, any> | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface BulkScrapeStats {
  total_court_docs: number;
  with_full_text: number;
  without_full_text: number;
  with_sections: number;
  completion_pct: string;
}

export interface CourtBreakdown {
  court_name: string;
  total: number;
  has_text: number;
  pending: number;
}

export interface JusticeKindBreakdown {
  justice_kind: string;
  total: number;
  has_text: number;
  pending: number;
}

export interface AwsPipelineStats {
  sqs_pending: number;
  sqs_in_flight: number;
  sqs_dlq: number;
  s3_downloaded: number;
  active: boolean;
}

export interface WorkerStats {
  worker_id: string;
  worker_id_short: string;
  ip: string | null;
  uptime_s: number;
  received: number;
  downloaded: number;
  uploaded: number;
  errors: number;
  captchas: number;
  rate_limited: number;
  rate_docs_per_s: number;
  last_seen_s: number;
  online: boolean;
  region: string | null;
  proxy_type: 'datacenter' | 'residential';
  status: 'idle' | 'scraping' | 'blocked' | 'error' | 'starting';
}

export interface BulkScrapeStatusResponse {
  jobs: BulkScrapeJob[];
  stats: BulkScrapeStats | null;
  aws_pipeline?: AwsPipelineStats | null;
  workers?: WorkerStats[];
  court_breakdown?: CourtBreakdown[];
  justice_kind_breakdown?: JusticeKindBreakdown[];
  message?: string;
}

export interface InfraHealthCheck {
  ok: boolean;
  error?: string;
}

export interface InfraHealthResponse {
  postgres: InfraHealthCheck;
  redis: InfraHealthCheck;
  qdrant: InfraHealthCheck;
  minio: InfraHealthCheck;
  scrapeWorker: {
    in_flight: number;
    pending: number;
    max_concurrent: number;
  };
}

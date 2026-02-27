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

export interface BulkScrapeStatusResponse {
  jobs: BulkScrapeJob[];
  stats: BulkScrapeStats | null;
  court_breakdown?: CourtBreakdown[];
  justice_kind_breakdown?: JusticeKindBreakdown[];
  message?: string;
}

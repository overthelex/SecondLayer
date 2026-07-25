export interface TableInfo {
  id: string;
  name: string;
  rows: number;
  source: string;
  sourceUrl: string;
  updateFrequency: string;
  lastUpdate: string | null;
  lastBatchCount?: number;
}

export interface CourtDocInfo {
  id: string;
  title: string;
  date: string | null;
  court: string | null;
  case_number: string | null;
  dispute_category: string | null;
  loaded_at: string;
}

export interface CourtCategory {
  code: string;
  name: string;
  total: number;
  recent: number;
  earliest_date: string | null;
  latest_date: string | null;
  last_loaded_at: string | null;
  documents: CourtDocInfo[];
}

export interface CourtDocsData {
  total_court_docs: number;
  recent_court_docs: number;
  days: number;
  categories: CourtCategory[];
}

export interface CompletenessResult {
  checked_at: string;
  runs_today: number;
  max_runs_per_day: number;
  summary: {
    total_documents: number;
    with_plaintext: number;
    with_html: number;
    with_only_html: number;
    with_both: number;
    missing_both: number;
    completeness_pct: number;
  };
  by_justice_kind: Array<{
    justice_kind: string;
    justice_kind_code: string;
    total: number;
    has_plaintext: number;
    has_html: number;
    has_only_html: number;
    has_both: number;
    missing_both: number;
    completeness_pct: number;
  }>;
}

export interface ScraperJob {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'stopped';
  justice_kind: string;
  justice_kind_id: string;
  doc_form: string;
  date_from: string;
  max_docs: number;
  concurrency: number;
  proxy?: string;
  pages_processed: number;
  downloaded: number;
  saved_to_db: number;
  skipped: number;
  errors: number;
  started_at: string;
  completed_at?: string;
  current_logs: string[];
}

export interface CoverageMapData {
  cells: Record<string, Record<string, number>>;
  periods: string[];
  justice_kinds: string[];
  kind_labels: Record<string, string>;
}

export interface BackfillJob {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'stopped';
  justice_kind_code: string | null;
  total: number;
  processed: number;
  scraped: number;
  errors: number;
  error_details: string[];
  started_at: string;
  completed_at?: string;
  current_logs?: string[];
  concurrency?: number;
  proxy?: string;
  completeness?: {
    summary: {
      total_documents: number;
      with_plaintext: number;
      with_html: number;
      with_only_html: number;
      with_both: number;
      missing_both: number;
      completeness_pct: number;
    };
    by_justice_kind: Array<{
      justice_kind: string;
      justice_kind_code: string;
      total: number;
      has_plaintext: number;
      has_html: number;
      has_only_html: number;
      has_both: number;
      missing_both: number;
      completeness_pct: number;
    }>;
  };
}

export interface SectionState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export interface BackendData {
  tables: TableInfo[];
  dbSizeMb: number;
}

export interface ServiceData {
  service: string;
  tables: Record<string, { rows: number; source: string; sourceUrl: string; updateFrequency: string; lastUpdate: string | null; lastBatchCount?: number }>;
  dbSizeMb: number;
  recentImports?: any[];
  error?: string;
}

export interface ImportSample {
  source: string;
  source_name: string;
  count: number;
  last_import: string;
    records: Array<{
    id: string;
    title?: string;
    court?: string;
    case_number?: string;
    category?: string;
    justice_kind?: string;
    date?: string;
    type?: string;
    rada_id?: string;
    status?: string;
    effective_date?: string;
    document_section_id?: string;
    vector_id?: string;
    document_title?: string;
    user_email?: string;
    user_name?: string;
    name?: string;
    domain?: string;
    created_at: string;
    updated_at?: string;
  }>;
}

export interface ImportSamplesData {
  hours: number;
  samples: ImportSample[];
  summary: {
    court_decisions: number;
    legislation: number;
    embeddings: number;
    user_uploads: number;
  };
  timestamp: string;
}

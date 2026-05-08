export interface EditWithTimestamps {
  edit_id: string;
  session_id: string;
  from_artifact_id: string;
  to_artifact_id: string;
  edit_distance_norm: number;
  semantic_change_class: string;
  edit_seconds: number | null;
  t_from: Date;
  t_to: Date;
  token_count_from: number | null;
  token_count_to: number | null;
}

export interface ActivityScoreRow {
  id: number;
  window_start: Date;
  window_end: Date;
  wm_class: string;
  score_label: string;
  key_presses: number;
  mouse_distance: number;
  clicks: number;
  scroll: number;
  mic_active: boolean | null;
  window_title: string;
}

export interface WindowSessionRow {
  id: number;
  started_at: Date;
  ended_at: Date | null;
  wm_class: string;
  window_title: string;
  pid: number | null;
}

export type WindowCategory = 'code_editing' | 'research' | 'communication' | 'documentation' | 'unrelated';

export interface ProcessFeatures {
  active_seconds: number;
  passive_seconds: number;
  idle_seconds: number;
  total_key_presses: number;
  total_mouse_distance: number;
  total_clicks: number;
  idle_gap_count: number;
  idle_gap_total_seconds: number;
  apps_touched: number;
  research_switches: number;
  voice_context: boolean;
  window_dwell_entropy: number;
  window_category_seconds: Record<WindowCategory, number>;
}

export interface EngagementRow extends ProcessFeatures {
  edit_id: string;
  session_id: string;
  t_from: Date;
  t_to: Date;
  query_window_start: Date;
  query_window_end: Date;
  process_data_available: boolean;
  xsistant_rows_matched: number;
}

export interface LinkerOptions {
  batchSize: number;
  dryRun: boolean;
  exportJsonl: boolean;
}

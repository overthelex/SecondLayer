import { BaseService } from '../base/BaseService';

export interface JudgeAnalyticsRecord {
  id: number;
  judge_name: string;
  court_code: number | null;
  court_name: string | null;
  instance_code: number | null;
  instance_name: string | null;
  dossier_number: string | null;
  total_decisions: number;
  unique_cases: number;
  cases_appealed: number;
  appeal_rate: number;
  decisions_by_year: Record<string, number>;
  decisions_by_form: Record<string, number>;
  decisions_by_justice_kind: Record<string, number>;
  top_categories: Array<{ code: number; name: string; count: number }>;
  appeal_outcomes: {
    upheld: number;
    overturned: number;
    modified: number;
    unknown: number;
    analyzed: number;
  };
  vkksu_data: Record<string, unknown>;
  peer_rank_in_court: number | null;
  peer_total_in_court: number | null;
  court_avg_decisions: number | null;
  period_start: string;
  period_end: string;
  computed_at: string;
}

export interface JudgeAnalyticsListResult {
  judges: JudgeAnalyticsRecord[];
  total: number;
}

export interface JudgeAnalyticsFilters {
  search?: string;
  court_name?: string;
  instance_code?: number;
  justice_kind?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface PeerJudge {
  id: number;
  judge_name: string;
  total_decisions: number;
  appeal_rate: number;
  cases_appealed: number;
  appeal_outcomes: JudgeAnalyticsRecord['appeal_outcomes'];
  vkksu_data: Record<string, unknown>;
  peer_rank_in_court: number | null;
}

export interface PeersResult {
  peers: PeerJudge[];
  court_name: string | null;
  total_in_court: number;
}

export class JudgeAnalyticsService extends BaseService {
  async getAnalyticsList(params?: JudgeAnalyticsFilters): Promise<JudgeAnalyticsListResult> {
    return this.request(() =>
      this.client.get<JudgeAnalyticsListResult>('/api/judge-analytics', { params })
    );
  }

  async getAnalyticsDetail(identifier: string): Promise<JudgeAnalyticsRecord> {
    return this.request(() =>
      this.client.get<JudgeAnalyticsRecord>(`/api/judge-analytics/${encodeURIComponent(identifier)}`)
    );
  }

  async getAnalyticsPeers(identifier: string): Promise<PeersResult> {
    return this.request(() =>
      this.client.get<PeersResult>(`/api/judge-analytics/${encodeURIComponent(identifier)}/peers`)
    );
  }
}

export const judgeAnalyticsService = new JudgeAnalyticsService();

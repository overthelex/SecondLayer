import { BaseService } from '../base/BaseService';

export interface Judge {
  id: number;
  dossier_number: string | null;
  full_name: string;
  gender: string | null;
  court_name: string | null;
  first_seen: string | null;
  last_seen: string | null;
  snapshot_count: number;
}

export interface JudgesListResponse {
  judges: Judge[];
  total: number;
}

export interface JudgesSearchParams {
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CourtHistoryEntry {
  court_name: string;
  first_seen: string;
  last_seen: string;
  snapshot_count: number;
}

export interface JusticeKindStat {
  id: number;
  name: string;
  count: number;
}

export interface JudgmentFormStat {
  id: number;
  name: string;
  count: number;
}

export interface YearActivity {
  year: number;
  count: number;
}

export interface RecentDecision {
  id: number;
  case_number: string | null;
  adjudication_date: string | null;
  court_name: string | null;
  justice_kind: string | null;
  doc_type: string | null;
  snippet: string | null;
}

export interface JudgeStats {
  total_decisions: number;
  by_justice_kind: JusticeKindStat[];
  by_judgment_form: JudgmentFormStat[];
  year_activity: YearActivity[];
  recent_decisions: RecentDecision[];
}

export interface JudgeProfile {
  basic: Judge;
  court_history: CourtHistoryEntry[];
  zo_id: number | null;
  stats: JudgeStats | null;
}

export class JudgesService extends BaseService {
  async getJudges(params?: JudgesSearchParams): Promise<JudgesListResponse> {
    return this.request(() => this.client.get<JudgesListResponse>('/api/judges', { params }));
  }

  async getJudgeByDossier(dossierNumber: string): Promise<Judge> {
    return this.request(() => this.client.get<Judge>(`/api/judges/${dossierNumber}`));
  }

  async getJudgeProfile(identifier: string): Promise<JudgeProfile> {
    return this.request(() => this.client.get<JudgeProfile>(`/api/judges/${encodeURIComponent(identifier)}/profile`));
  }
}

export const judgesService = new JudgesService();

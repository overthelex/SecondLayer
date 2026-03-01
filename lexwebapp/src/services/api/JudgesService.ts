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

export class JudgesService extends BaseService {
  async getJudges(params?: JudgesSearchParams): Promise<JudgesListResponse> {
    try {
      const response = await this.client.get<JudgesListResponse>('/api/judges', { params });
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getJudgeByDossier(dossierNumber: string): Promise<Judge> {
    try {
      const response = await this.client.get<Judge>(`/api/judges/${dossierNumber}`);
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }
}

export const judgesService = new JudgesService();

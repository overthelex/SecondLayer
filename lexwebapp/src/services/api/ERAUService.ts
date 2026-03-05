import { BaseService } from '../base/BaseService';

export interface ERAULawyer {
  id: number;
  surname: string;
  firstname: string;
  middlename: string;
  racalc: string;
  certnum: string;
  certat: string;
  certcalc: string;
}

export interface ERAUProfile {
  id: string;
  fullName: string;
  council: string | null;
  certificate: {
    number: string | null;
    date: string | null;
    issuedBy: string | null;
    decisionNumber: string | null;
    decisionDate: string | null;
  };
  experience: string | null;
  contacts: {
    address: string | null;
    phone: string | null;
    email: string | null;
  };
  practiceForm: {
    type: string | null;
    address: string | null;
    phone: string | null;
  };
  qualification: Array<{ year: string; status: string }>;
}

export interface SearchHistoryEntry {
  id: string;
  query: string;
  result_count: number;
  created_at: string;
}

export class ERAUService extends BaseService {
  async searchLawyers(surname: string): Promise<ERAULawyer[]> {
    try {
      const response = await this.client.get<ERAULawyer[]>('/api/erau/search', {
        params: { surname },
      });
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getProfile(id: string): Promise<ERAUProfile> {
    try {
      const response = await this.client.get<ERAUProfile>(`/api/erau/profile/${id}`);
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getSearchHistory(limit = 20): Promise<SearchHistoryEntry[]> {
    try {
      const response = await this.client.get<SearchHistoryEntry[]>('/api/erau/search-history', {
        params: { limit },
      });
      return response.data;
    } catch {
      return [];
    }
  }

  async saveSearchHistory(query: string, resultCount: number): Promise<void> {
    try {
      await this.client.post('/api/erau/search-history', { query, resultCount });
    } catch {
      // silent — history is non-critical
    }
  }

  async deleteSearchHistoryEntry(id: string): Promise<void> {
    try {
      await this.client.delete(`/api/erau/search-history/${id}`);
    } catch {
      // silent
    }
  }

  async clearSearchHistory(): Promise<void> {
    try {
      await this.client.delete('/api/erau/search-history');
    } catch {
      // silent
    }
  }
}

export const erauService = new ERAUService();

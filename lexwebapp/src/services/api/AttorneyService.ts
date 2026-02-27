import { BaseService } from '../base/BaseService';

export interface AttorneyProfile {
  id: string;
  user_id: string;
  organization_id?: string;
  bar_license_number?: string;
  bar_admission_date?: string;
  years_experience?: number;
  education?: string;
  specializations: string[];
  court_types: string[];
  region?: string;
  city?: string;
  serves_remotely: boolean;
  languages: string[];
  consultation_fee_uah?: number;
  hourly_rate_uah?: number;
  representation_fee_uah?: number;
  free_initial_consultation: boolean;
  bio?: string;
  photo_url?: string;
  total_consultations: number;
  average_rating: number;
  rating_count: number;
  is_available: boolean;
  is_public: boolean;
  user_name?: string;
  user_email?: string;
  organization_name?: string;
  org_type?: string;
  created_at: string;
  updated_at: string;
}

export interface AttorneySearchParams {
  specialization?: string;
  region?: string;
  city?: string;
  courtType?: string;
  language?: string;
  minRating?: number;
  maxFee?: number;
  minFee?: number;
  freeConsultation?: boolean;
  servesRemotely?: boolean;
  sortBy?: string;
  limit?: number;
  offset?: number;
}

export interface AttorneySearchResponse {
  attorneys: AttorneyProfile[];
  total: number;
}

export interface AttorneyReview {
  id: string;
  consultation_id: string;
  reviewer_user_id: string;
  attorney_user_id: string;
  rating: number;
  review_text?: string;
  communication_rating?: number;
  knowledge_rating?: number;
  professionalism_rating?: number;
  value_rating?: number;
  reviewer_name?: string;
  created_at: string;
}

export class AttorneyService extends BaseService {
  async searchAttorneys(params?: AttorneySearchParams): Promise<AttorneySearchResponse> {
    try {
      const response = await this.client.get<AttorneySearchResponse>('/api/attorneys', { params });
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getAttorney(id: string): Promise<AttorneyProfile> {
    try {
      const response = await this.client.get<AttorneyProfile>(`/api/attorneys/${id}`);
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getAttorneyReviews(id: string, params?: { limit?: number; offset?: number }): Promise<{ reviews: AttorneyReview[]; total: number }> {
    try {
      const response = await this.client.get(`/api/attorneys/${id}/reviews`, { params });
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getMyProfile(): Promise<AttorneyProfile> {
    try {
      const response = await this.client.get<AttorneyProfile>('/api/attorneys/profile/me');
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async createProfile(data: Partial<AttorneyProfile>): Promise<AttorneyProfile> {
    try {
      const response = await this.client.post<AttorneyProfile>('/api/attorneys/profile', data);
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateProfile(data: Partial<AttorneyProfile>): Promise<AttorneyProfile> {
    try {
      const response = await this.client.put<AttorneyProfile>('/api/attorneys/profile', data);
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }
}

export const attorneyService = new AttorneyService();

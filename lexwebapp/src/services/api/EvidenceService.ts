/**
 * Evidence Service — API client for right panel evidence tabs + EDRSR direct access
 */

import { BaseService } from '../base/BaseService';
import type { Decision, Citation } from '../../types/models/Message';

export interface EdsrFulltextResponse {
  doc_id: number;
  cause_num: string;
  judge: string;
  court_code: number;
  court_name: string | null;
  justice_kind: number;
  judgment_code: number;
  judgment_form: string | null;
  adjudication_date: string;
  receipt_date: string;
  full_text: string | null;
  external_url: string;
}

export interface EdsrSearchParams {
  cause_num?: string;
  judge?: string;
  court_code?: number;
  court_name?: string;
  justice_kind?: number;
  judgment_code?: number;
  date_from?: string;
  date_to?: string;
  instance_code?: number;
  limit?: number;
  offset?: number;
}

export interface EdsrSearchResponse {
  results: EdsrFulltextResponse[];
  total: number;
  limit: number;
  offset: number;
}

class EvidenceServiceClass extends BaseService {
  // ── Evidence tabs (per conversation) ──────────────────────

  async getDecisions(conversationId: string): Promise<Decision[]> {
    try {
      const { data } = await this.client.get(`/api/conversations/${conversationId}/decisions`);
      return data.decisions || [];
    } catch (error) {
      console.warn('[EvidenceService] getDecisions failed:', error);
      return [];
    }
  }

  async getCourtDocuments(conversationId: string): Promise<Decision[]> {
    try {
      const { data } = await this.client.get(`/api/conversations/${conversationId}/court-documents`);
      return data.documents || [];
    } catch (error) {
      console.warn('[EvidenceService] getCourtDocuments failed:', error);
      return [];
    }
  }

  async getRegulations(conversationId: string): Promise<Citation[]> {
    try {
      const { data } = await this.client.get(`/api/conversations/${conversationId}/regulations`);
      return data.regulations || [];
    } catch (error) {
      console.warn('[EvidenceService] getRegulations failed:', error);
      return [];
    }
  }

  // ── EDRSR direct access ───────────────────────────────────

  async getEdsrFulltext(docId: string | number): Promise<EdsrFulltextResponse | null> {
    try {
      const { data } = await this.client.get(`/api/edrsr/${docId}/fulltext`);
      return data;
    } catch (error) {
      console.warn('[EvidenceService] getEdsrFulltext failed:', error);
      return null;
    }
  }

  async searchEdrsr(params: EdsrSearchParams): Promise<EdsrSearchResponse> {
    try {
      const { data } = await this.client.post('/api/edrsr/search', params);
      return data;
    } catch (error) {
      console.warn('[EvidenceService] searchEdrsr failed:', error);
      return { results: [], total: 0, limit: params.limit || 20, offset: params.offset || 0 };
    }
  }
}

export const EvidenceService = new EvidenceServiceClass();

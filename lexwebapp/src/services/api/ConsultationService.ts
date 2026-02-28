import { BaseService } from '../base/BaseService';

export interface Consultation {
  id: string;
  client_user_id: string;
  attorney_user_id: string;
  matter_id?: string;
  consultation_type: string;
  status: string;
  request_title: string;
  request_description?: string;
  urgency: string;
  share_documents: boolean;
  share_conversations: boolean;
  document_ids: string[];
  conversation_ids: string[];
  agreed_fee_uah?: number;
  fee_type: string;
  estimated_hours?: number;
  preferred_datetime?: string;
  scheduled_datetime?: string;
  completion_summary?: string;
  decline_reason?: string;
  cancel_reason?: string;
  client_name?: string;
  attorney_name?: string;
  matter_name?: string;
  created_at: string;
  accepted_at?: string;
  paid_at?: string;
  started_at?: string;
  completed_at?: string;
  cancelled_at?: string;
  declined_at?: string;
  updated_at: string;
}

export interface ConsultationMessage {
  id: string;
  consultation_id: string;
  sender_id: string;
  content: string;
  message_type: string;
  read_at?: string;
  created_at: string;
  sender_name?: string;
}

export interface ConsultationPayment {
  id: string;
  consultation_id: string;
  amount_uah: number;
  platform_fee_uah: number;
  attorney_payout_uah: number;
  status: string;
  payment_provider: string;
  created_at: string;
}

export interface CreateConsultationRequest {
  attorneyUserId: string;
  matterId?: string;
  consultationType?: string;
  requestTitle: string;
  requestDescription?: string;
  urgency?: string;
  shareDocuments?: boolean;
  shareConversations?: boolean;
  documentIds?: string[];
  conversationIds?: string[];
  agreedFeeUah?: number;
  feeType?: string;
  estimatedHours?: number;
  preferredDatetime?: string;
}

export interface SubmitReviewRequest {
  rating: number;
  reviewText?: string;
  communicationRating?: number;
  knowledgeRating?: number;
  professionalismRating?: number;
  valueRating?: number;
}

export class ConsultationService extends BaseService {
  async createConsultation(data: CreateConsultationRequest): Promise<Consultation> {
    try {
      const response = await this.client.post<Consultation>('/api/consultations', data);
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async listConsultations(params?: { role?: string; status?: string; limit?: number; offset?: number }): Promise<{ consultations: Consultation[]; total: number }> {
    try {
      const response = await this.client.get('/api/consultations', { params });
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getConsultation(id: string): Promise<Consultation> {
    try {
      const response = await this.client.get<Consultation>(`/api/consultations/${id}`);
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async acceptConsultation(id: string, agreedFee?: number): Promise<Consultation> {
    try {
      const response = await this.client.put<Consultation>(`/api/consultations/${id}/accept`, { agreedFee });
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async declineConsultation(id: string, reason?: string): Promise<Consultation> {
    try {
      const response = await this.client.put<Consultation>(`/api/consultations/${id}/decline`, { reason });
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async startConsultation(id: string): Promise<Consultation> {
    try {
      const response = await this.client.put<Consultation>(`/api/consultations/${id}/start`);
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async completeConsultation(id: string, summary?: string): Promise<Consultation> {
    try {
      const response = await this.client.put<Consultation>(`/api/consultations/${id}/complete`, { summary });
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async cancelConsultation(id: string, reason?: string): Promise<Consultation> {
    try {
      const response = await this.client.put<Consultation>(`/api/consultations/${id}/cancel`, { reason });
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async initiatePayment(id: string): Promise<{ paymentUrl: string; paymentId: string }> {
    try {
      const response = await this.client.post(`/api/consultations/${id}/pay`);
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getPaymentStatus(id: string): Promise<ConsultationPayment> {
    try {
      const response = await this.client.get<ConsultationPayment>(`/api/consultations/${id}/payment`);
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getMessages(id: string, params?: { limit?: number; offset?: number }): Promise<{ messages: ConsultationMessage[]; total: number }> {
    try {
      const response = await this.client.get(`/api/consultations/${id}/messages`, { params });
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async sendMessage(id: string, content: string, messageType?: string): Promise<ConsultationMessage> {
    try {
      const response = await this.client.post<ConsultationMessage>(`/api/consultations/${id}/messages`, { content, messageType });
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getUnreadCount(id: string): Promise<{ count: number }> {
    try {
      const response = await this.client.get<{ count: number }>(`/api/consultations/${id}/messages/unread-count`);
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  connectMessageStream(id: string): EventSource {
    const token = localStorage.getItem('auth_token');
    const baseURL = this.client.defaults.baseURL || '';
    const url = `${baseURL}/api/consultations/${id}/messages/stream`;

    // EventSource doesn't support custom headers, so we pass token as query param
    // However, our SSE endpoint uses the same JWT middleware via cookie/header
    // We'll use a polyfill approach with fetch-based EventSource
    const eventSource = new EventSource(`${url}?token=${encodeURIComponent(token || '')}`);
    return eventSource;
  }

  async submitReview(id: string, data: SubmitReviewRequest): Promise<any> {
    try {
      const response = await this.client.post(`/api/consultations/${id}/review`, data);
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getUnseenPending(): Promise<{ consultations: Consultation[]; count: number }> {
    try {
      const response = await this.client.get('/api/consultations/pending-unseen');
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async markViewed(ids: string[]): Promise<void> {
    try {
      await this.client.put('/api/consultations/mark-viewed', { ids });
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getMyClients(): Promise<{ clients: AttorneyClient[] }> {
    try {
      const response = await this.client.get('/api/consultations/my-clients');
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }
}

export interface AttorneyClient {
  client_user_id: string;
  client_name: string;
  client_email: string;
  client_picture?: string;
  total_consultations: number;
  active_consultations: number;
  last_consultation_at: string;
}

export const consultationService = new ConsultationService();

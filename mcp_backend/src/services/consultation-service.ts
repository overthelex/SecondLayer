import type { IDatabase } from '../domain/ports/index.js';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from './audit-service.js';
import { MatterService } from './matter-service.js';
import { AttorneyProfileService } from './attorney-profile-service.js';

export interface Consultation {
  id: string;
  client_user_id: string;
  attorney_user_id: string;
  matter_id?: string;
  consultation_type: 'consultation' | 'representation' | 'document_review';
  status: 'pending' | 'accepted' | 'paid' | 'in_progress' | 'completed' | 'cancelled' | 'declined' | 'disputed';
  request_title: string;
  request_description?: string;
  urgency: 'low' | 'normal' | 'high' | 'urgent';
  share_documents: boolean;
  share_conversations: boolean;
  document_ids: string[];
  conversation_ids: string[];
  agreed_fee_uah?: number;
  fee_type: 'fixed' | 'hourly' | 'free';
  estimated_hours?: number;
  preferred_datetime?: Date;
  scheduled_datetime?: Date;
  completion_summary?: string;
  decline_reason?: string;
  cancel_reason?: string;
  created_at: Date;
  accepted_at?: Date;
  paid_at?: Date;
  started_at?: Date;
  completed_at?: Date;
  cancelled_at?: Date;
  declined_at?: Date;
  updated_at: Date;
  // Joined
  client_name?: string;
  attorney_name?: string;
  matter_name?: string;
}

export interface ConsultationMessage {
  id: string;
  consultation_id: string;
  sender_id: string;
  content: string;
  message_type: 'text' | 'system' | 'file';
  read_at?: Date;
  created_at: Date;
  sender_name?: string;
}

export interface CreateConsultationData {
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

export class ConsultationService {
  constructor(
    private db: IDatabase,
    private matterService: MatterService,
    private auditService: AuditService,
    private attorneyProfileService: AttorneyProfileService
  ) {}

  async createConsultation(clientUserId: string, data: CreateConsultationData): Promise<Consultation> {
    const id = uuidv4();

    const result = await this.db.query(
      `INSERT INTO consultations (
        id, client_user_id, attorney_user_id, matter_id,
        consultation_type, request_title, request_description, urgency,
        share_documents, share_conversations, document_ids, conversation_ids,
        agreed_fee_uah, fee_type, estimated_hours, preferred_datetime
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *`,
      [
        id, clientUserId, data.attorneyUserId, data.matterId || null,
        data.consultationType || 'consultation',
        data.requestTitle, data.requestDescription || null,
        data.urgency || 'normal',
        data.shareDocuments ?? false, data.shareConversations ?? false,
        data.documentIds || [], data.conversationIds || [],
        data.agreedFeeUah || null, data.feeType || 'fixed',
        data.estimatedHours || null, data.preferredDatetime || null,
      ]
    );

    await this.auditService.log({
      userId: clientUserId,
      action: 'consultation.created',
      resourceType: 'consultation',
      resourceId: id,
      details: { attorneyUserId: data.attorneyUserId, type: data.consultationType },
    });

    logger.info('Consultation created', { id, clientUserId, attorneyUserId: data.attorneyUserId });
    return result.rows[0];
  }

  async getConsultation(id: string, userId: string): Promise<Consultation | null> {
    const result = await this.db.query(
      `SELECT c.*,
              cu.name as client_name,
              au.name as attorney_name,
              m.matter_name
       FROM consultations c
       JOIN users cu ON cu.id = c.client_user_id
       JOIN users au ON au.id = c.attorney_user_id
       LEFT JOIN matters m ON m.id = c.matter_id
       WHERE c.id = $1 AND (c.client_user_id = $2 OR c.attorney_user_id = $2)`,
      [id, userId]
    );
    return result.rows[0] || null;
  }

  async listConsultations(
    userId: string,
    options: { role?: 'client' | 'attorney'; status?: string; limit?: number; offset?: number } = {}
  ): Promise<{ consultations: Consultation[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (options.role === 'client') {
      conditions.push(`c.client_user_id = $${idx++}`);
      params.push(userId);
    } else if (options.role === 'attorney') {
      conditions.push(`c.attorney_user_id = $${idx++}`);
      params.push(userId);
    } else {
      conditions.push(`(c.client_user_id = $${idx} OR c.attorney_user_id = $${idx})`);
      params.push(userId);
      idx++;
    }

    if (options.status) {
      conditions.push(`c.status = $${idx++}`);
      params.push(options.status);
    }

    const where = conditions.join(' AND ');
    const limit = Math.min(options.limit || 20, 100);
    const offset = options.offset || 0;

    const [result, countResult] = await Promise.all([
      this.db.query(
        `SELECT c.*,
                cu.name as client_name,
                au.name as attorney_name,
                m.matter_name
         FROM consultations c
         JOIN users cu ON cu.id = c.client_user_id
         JOIN users au ON au.id = c.attorney_user_id
         LEFT JOIN matters m ON m.id = c.matter_id
         WHERE ${where}
         ORDER BY c.updated_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      ),
      this.db.query(
        `SELECT COUNT(*) FROM consultations c WHERE ${where}`,
        params
      ),
    ]);

    return {
      consultations: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
    };
  }

  async acceptConsultation(id: string, attorneyUserId: string, agreedFee?: number): Promise<Consultation> {
    const consultation = await this.requireConsultation(id, attorneyUserId, 'attorney');
    if (consultation.status !== 'pending') {
      throw new Error(`Cannot accept consultation in status: ${consultation.status}`);
    }

    const setClauses = ['status = $$accepted$$', 'accepted_at = NOW()'];
    const params: any[] = [id];
    let idx = 2;

    if (agreedFee !== undefined) {
      setClauses.push(`agreed_fee_uah = $${idx++}`);
      params.push(agreedFee);
    }

    const result = await this.db.query(
      `UPDATE consultations SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );

    await this.auditService.log({
      userId: attorneyUserId,
      action: 'consultation.accepted',
      resourceType: 'consultation',
      resourceId: id,
      details: { agreedFee },
    });

    return result.rows[0];
  }

  async declineConsultation(id: string, attorneyUserId: string, reason?: string): Promise<Consultation> {
    const consultation = await this.requireConsultation(id, attorneyUserId, 'attorney');
    if (consultation.status !== 'pending') {
      throw new Error(`Cannot decline consultation in status: ${consultation.status}`);
    }

    const result = await this.db.query(
      `UPDATE consultations SET status = 'declined', declined_at = NOW(), decline_reason = $2 WHERE id = $1 RETURNING *`,
      [id, reason || null]
    );

    await this.auditService.log({
      userId: attorneyUserId,
      action: 'consultation.declined',
      resourceType: 'consultation',
      resourceId: id,
      details: { reason },
    });

    return result.rows[0];
  }

  async markPaid(id: string, paymentId: string): Promise<Consultation> {
    const result = await this.db.query(
      `UPDATE consultations SET status = 'paid', paid_at = NOW() WHERE id = $1 AND status = 'accepted' RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new Error('Consultation not found or not in accepted status');
    }

    const consultation = result.rows[0];

    // Grant attorney access to matter
    if (consultation.matter_id) {
      try {
        await this.matterService.addTeamMember(
          consultation.matter_id,
          consultation.attorney_user_id,
          'consultant',
          'read-only',
          consultation.client_user_id
        );
        logger.info('Attorney granted matter access', {
          consultationId: id,
          matterId: consultation.matter_id,
          attorneyId: consultation.attorney_user_id,
        });
      } catch (err: any) {
        logger.warn('Failed to grant matter access (may already exist)', { error: err.message });
      }
    }

    await this.auditService.log({
      userId: consultation.client_user_id,
      action: 'consultation.paid',
      resourceType: 'consultation',
      resourceId: id,
      details: { paymentId, matterId: consultation.matter_id },
    });

    return consultation;
  }

  async startConsultation(id: string, attorneyUserId: string): Promise<Consultation> {
    const consultation = await this.requireConsultation(id, attorneyUserId, 'attorney');
    if (consultation.status !== 'paid') {
      throw new Error(`Cannot start consultation in status: ${consultation.status}`);
    }

    const result = await this.db.query(
      `UPDATE consultations SET status = 'in_progress', started_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );

    await this.auditService.log({
      userId: attorneyUserId,
      action: 'consultation.started',
      resourceType: 'consultation',
      resourceId: id,
    });

    return result.rows[0];
  }

  async completeConsultation(id: string, attorneyUserId: string, summary?: string): Promise<Consultation> {
    const consultation = await this.requireConsultation(id, attorneyUserId, 'attorney');
    if (consultation.status !== 'in_progress') {
      throw new Error(`Cannot complete consultation in status: ${consultation.status}`);
    }

    const result = await this.db.query(
      `UPDATE consultations SET status = 'completed', completed_at = NOW(), completion_summary = $2 WHERE id = $1 RETURNING *`,
      [id, summary || null]
    );

    // Revoke attorney access from matter
    if (consultation.matter_id) {
      try {
        await this.matterService.removeTeamMember(
          consultation.matter_id,
          consultation.attorney_user_id,
          consultation.client_user_id
        );
        logger.info('Attorney matter access revoked', {
          consultationId: id,
          matterId: consultation.matter_id,
        });
      } catch (err: any) {
        logger.warn('Failed to revoke matter access', { error: err.message });
      }
    }

    await this.auditService.log({
      userId: attorneyUserId,
      action: 'consultation.completed',
      resourceType: 'consultation',
      resourceId: id,
    });

    return result.rows[0];
  }

  async cancelConsultation(id: string, userId: string, reason?: string): Promise<Consultation> {
    const consultation = await this.requireConsultation(id, userId);
    const allowedStatuses = ['pending', 'accepted', 'paid', 'in_progress'];
    if (!allowedStatuses.includes(consultation.status)) {
      throw new Error(`Cannot cancel consultation in status: ${consultation.status}`);
    }

    const result = await this.db.query(
      `UPDATE consultations SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = $2 WHERE id = $1 RETURNING *`,
      [id, reason || null]
    );

    // Revoke access if granted
    if (consultation.matter_id && ['paid', 'in_progress'].includes(consultation.status)) {
      try {
        await this.matterService.removeTeamMember(
          consultation.matter_id,
          consultation.attorney_user_id,
          userId
        );
      } catch (_err) {
        // Ignore — may not exist
      }
    }

    await this.auditService.log({
      userId,
      action: 'consultation.cancelled',
      resourceType: 'consultation',
      resourceId: id,
      details: { reason, previousStatus: consultation.status },
    });

    return result.rows[0];
  }

  // ─── Messaging ─────────────────────────────────────────

  async sendMessage(consultationId: string, senderId: string, content: string, messageType?: string): Promise<ConsultationMessage> {
    // Verify sender is a party to this consultation
    await this.requireConsultation(consultationId, senderId);

    const id = uuidv4();
    const result = await this.db.query(
      `INSERT INTO consultation_messages (id, consultation_id, sender_id, content, message_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, consultationId, senderId, content, messageType || 'text']
    );
    return result.rows[0];
  }

  async getMessages(
    consultationId: string,
    userId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<{ messages: ConsultationMessage[]; total: number }> {
    await this.requireConsultation(consultationId, userId);

    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const [result, countResult] = await Promise.all([
      this.db.query(
        `SELECT cm.*, u.name as sender_name
         FROM consultation_messages cm
         JOIN users u ON u.id = cm.sender_id
         WHERE cm.consultation_id = $1
         ORDER BY cm.created_at ASC
         LIMIT $2 OFFSET $3`,
        [consultationId, limit, offset]
      ),
      this.db.query(
        `SELECT COUNT(*) FROM consultation_messages WHERE consultation_id = $1`,
        [consultationId]
      ),
    ]);

    // Mark messages as read
    await this.db.query(
      `UPDATE consultation_messages SET read_at = NOW()
       WHERE consultation_id = $1 AND sender_id != $2 AND read_at IS NULL`,
      [consultationId, userId]
    );

    return {
      messages: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
    };
  }

  // ─── Reviews ───────────────────────────────────────────

  async submitReview(
    consultationId: string,
    userId: string,
    data: {
      rating: number;
      reviewText?: string;
      communicationRating?: number;
      knowledgeRating?: number;
      professionalismRating?: number;
      valueRating?: number;
    }
  ): Promise<any> {
    const consultation = await this.requireConsultation(consultationId, userId, 'client');
    if (consultation.status !== 'completed') {
      throw new Error('Can only review completed consultations');
    }

    const id = uuidv4();
    const result = await this.db.query(
      `INSERT INTO consultation_reviews (
        id, consultation_id, reviewer_user_id, attorney_user_id,
        rating, review_text,
        communication_rating, knowledge_rating, professionalism_rating, value_rating
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *`,
      [
        id, consultationId, userId, consultation.attorney_user_id,
        data.rating, data.reviewText || null,
        data.communicationRating || null, data.knowledgeRating || null,
        data.professionalismRating || null, data.valueRating || null,
      ]
    );

    // Update attorney stats
    await this.attorneyProfileService.updateStats(consultation.attorney_user_id);

    await this.auditService.log({
      userId,
      action: 'consultation.reviewed',
      resourceType: 'consultation',
      resourceId: consultationId,
      details: { rating: data.rating },
    });

    return result.rows[0];
  }

  // ─── Helpers ───────────────────────────────────────────

  private async requireConsultation(id: string, userId: string, requiredRole?: 'client' | 'attorney'): Promise<Consultation> {
    const result = await this.db.query(
      `SELECT * FROM consultations WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new Error('Consultation not found');
    }

    const c = result.rows[0] as Consultation;

    if (requiredRole === 'client' && c.client_user_id !== userId) {
      throw new Error('Not authorized: not the client');
    }
    if (requiredRole === 'attorney' && c.attorney_user_id !== userId) {
      throw new Error('Not authorized: not the attorney');
    }
    if (!requiredRole && c.client_user_id !== userId && c.attorney_user_id !== userId) {
      throw new Error('Not authorized: not a party to this consultation');
    }

    return c;
  }
}

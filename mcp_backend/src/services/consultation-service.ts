import type { IDatabase } from '../domain/ports/index.js';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from './audit-service.js';
import { MatterService } from './matter-service.js';
import { AttorneyProfileService } from './attorney-profile-service.js';
import { consultationMessageBus } from './consultation-message-bus.js';
import type { EmailService } from './email-service.js';

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
  status: 'sent' | 'delivered' | 'read';
  read_at?: Date;
  delivered_at?: Date;
  created_at: Date;
  sender_name?: string;
  attachment_url?: string;
  attachment_name?: string;
  attachment_type?: string;
  attachment_size?: number;
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
  private emailService?: EmailService;

  constructor(
    private db: IDatabase,
    private matterService: MatterService,
    private auditService: AuditService,
    private attorneyProfileService: AttorneyProfileService
  ) {}

  setEmailService(emailService: EmailService): void {
    this.emailService = emailService;
  }

  /** Helper to fetch user email + name for notifications */
  private async getUserInfo(userId: string): Promise<{ name: string; email: string } | null> {
    const result = await this.db.query('SELECT name, email FROM users WHERE id = $1', [userId]);
    return result.rows[0] || null;
  }

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

    // Email notification to attorney
    if (this.emailService) {
      this.getUserInfo(data.attorneyUserId).then(attorney => {
        if (!attorney) return;
        this.getUserInfo(clientUserId).then(client => {
          if (!client) return;
          this.emailService!.sendConsultationRequestEmail({
            email: attorney.email,
            attorneyName: attorney.name,
            clientName: client.name,
            requestTitle: data.requestTitle,
            consultationId: id,
          }).catch(() => {});
        }).catch(() => {});
      }).catch(() => {});
    }

    // Emit real-time status event
    const enriched = await this.getConsultation(id, clientUserId) || result.rows[0];
    consultationMessageBus.publishConsultationStatus(enriched);

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

    // Email notification to client
    if (this.emailService) {
      const fee = agreedFee ?? consultation.agreed_fee_uah ?? 0;
      Promise.all([this.getUserInfo(consultation.client_user_id), this.getUserInfo(attorneyUserId)])
        .then(([client, attorney]) => {
          if (client && attorney) {
            this.emailService!.sendConsultationAcceptedEmail({
              email: client.email,
              clientName: client.name,
              attorneyName: attorney.name,
              requestTitle: consultation.request_title,
              agreedFeeUah: fee,
              consultationId: id,
            }).catch(() => {});
          }
        }).catch(() => {});
    }

    const enriched = await this.getConsultation(id, attorneyUserId) || result.rows[0];
    consultationMessageBus.publishConsultationStatus(enriched);

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

    // Email notification to client
    if (this.emailService) {
      Promise.all([this.getUserInfo(consultation.client_user_id), this.getUserInfo(attorneyUserId)])
        .then(([client, attorney]) => {
          if (client && attorney) {
            this.emailService!.sendConsultationDeclinedEmail({
              email: client.email,
              clientName: client.name,
              attorneyName: attorney.name,
              requestTitle: consultation.request_title,
              reason,
              consultationId: id,
            }).catch(() => {});
          }
        }).catch(() => {});
    }

    const enriched = await this.getConsultation(id, attorneyUserId) || result.rows[0];
    consultationMessageBus.publishConsultationStatus(enriched);

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

    // Email notification to both parties
    if (this.emailService) {
      Promise.all([this.getUserInfo(consultation.client_user_id), this.getUserInfo(consultation.attorney_user_id)])
        .then(([client, attorney]) => {
          if (!client || !attorney) return;
          const amount = consultation.agreed_fee_uah || 0;
          const title = consultation.request_title || 'Консультація';
          // Client email
          this.emailService!.sendConsultationPaidEmail({
            email: client.email, recipientName: client.name, otherPartyName: attorney.name,
            requestTitle: title, amountUah: amount, consultationId: id, isAttorney: false,
          }).catch(() => {});
          // Attorney email
          this.emailService!.sendConsultationPaidEmail({
            email: attorney.email, recipientName: attorney.name, otherPartyName: client.name,
            requestTitle: title, amountUah: amount, consultationId: id, isAttorney: true,
          }).catch(() => {});
        }).catch(() => {});
    }

    // Re-fetch with JOINs for enriched data
    const enriched = await this.getConsultationById(id) || consultation;
    consultationMessageBus.publishConsultationStatus(enriched);

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

    const enriched = await this.getConsultation(id, attorneyUserId) || result.rows[0];
    consultationMessageBus.publishConsultationStatus(enriched);

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

    // Revoke E2EE document key access for shared encrypted documents
    if (consultation.document_ids?.length > 0) {
      try {
        await this.db.query(
          `UPDATE document_keys SET revoked_at = NOW()
           WHERE user_id = $1 AND document_id = ANY($2) AND revoked_at IS NULL`,
          [consultation.attorney_user_id, consultation.document_ids]
        );
        logger.info('Attorney E2EE document key access revoked', {
          consultationId: id,
          attorneyUserId: consultation.attorney_user_id,
          documentCount: consultation.document_ids.length,
        });
      } catch (err: any) {
        logger.warn('Failed to revoke E2EE document keys', { error: err.message });
      }
    }

    await this.auditService.log({
      userId: attorneyUserId,
      action: 'consultation.completed',
      resourceType: 'consultation',
      resourceId: id,
    });

    // Email notification to client
    if (this.emailService) {
      Promise.all([this.getUserInfo(consultation.client_user_id), this.getUserInfo(attorneyUserId)])
        .then(([client, attorney]) => {
          if (client && attorney) {
            this.emailService!.sendConsultationCompletedEmail({
              email: client.email,
              clientName: client.name,
              attorneyName: attorney.name,
              requestTitle: consultation.request_title,
              consultationId: id,
            }).catch(() => {});
          }
        }).catch(() => {});
    }

    const enriched = await this.getConsultation(id, attorneyUserId) || result.rows[0];
    consultationMessageBus.publishConsultationStatus(enriched);

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

    // Revoke E2EE document key access for shared encrypted documents
    if (consultation.document_ids?.length > 0) {
      try {
        await this.db.query(
          `UPDATE document_keys SET revoked_at = NOW()
           WHERE user_id = $1 AND document_id = ANY($2) AND revoked_at IS NULL`,
          [consultation.attorney_user_id, consultation.document_ids]
        );
      } catch (_err) {
        // Non-critical — keys may not exist
      }
    }

    await this.auditService.log({
      userId,
      action: 'consultation.cancelled',
      resourceType: 'consultation',
      resourceId: id,
      details: { reason, previousStatus: consultation.status },
    });

    // Email notification to the other party
    if (this.emailService) {
      const recipientId = consultation.client_user_id === userId
        ? consultation.attorney_user_id
        : consultation.client_user_id;
      Promise.all([this.getUserInfo(recipientId), this.getUserInfo(userId)])
        .then(([recipient, canceller]) => {
          if (recipient && canceller) {
            this.emailService!.sendConsultationCancelledEmail({
              email: recipient.email,
              recipientName: recipient.name,
              cancelledByName: canceller.name,
              requestTitle: consultation.request_title,
              reason,
              consultationId: id,
            }).catch(() => {});
          }
        }).catch(() => {});
    }

    const enriched = await this.getConsultationById(id) || result.rows[0];
    consultationMessageBus.publishConsultationStatus(enriched);

    return result.rows[0];
  }

  // ─── Unseen / Viewed ─────────────────────────────────────

  async getUnseenPending(attorneyUserId: string): Promise<{ consultations: Consultation[]; count: number }> {
    const result = await this.db.query(
      `SELECT c.*,
              cu.name as client_name,
              au.name as attorney_name,
              m.matter_name
       FROM consultations c
       JOIN users cu ON cu.id = c.client_user_id
       JOIN users au ON au.id = c.attorney_user_id
       LEFT JOIN matters m ON m.id = c.matter_id
       WHERE c.attorney_user_id = $1 AND c.status = 'pending' AND c.viewed_at IS NULL
       ORDER BY c.created_at DESC`,
      [attorneyUserId]
    );
    return { consultations: result.rows, count: result.rows.length };
  }

  async markViewed(ids: string[], attorneyUserId: string): Promise<void> {
    if (ids.length === 0) return;
    await this.db.query(
      `UPDATE consultations SET viewed_at = NOW() WHERE id = ANY($1) AND attorney_user_id = $2`,
      [ids, attorneyUserId]
    );
  }

  async getAttorneyClients(attorneyUserId: string): Promise<any[]> {
    const result = await this.db.query(
      `SELECT
         c.client_user_id,
         cu.name as client_name,
         cu.email as client_email,
         cu.picture as client_picture,
         COUNT(*) as total_consultations,
         COUNT(*) FILTER (WHERE c.status IN ('pending','accepted','paid','in_progress')) as active_consultations,
         MAX(c.created_at) as last_consultation_at
       FROM consultations c
       JOIN users cu ON cu.id = c.client_user_id
       WHERE c.attorney_user_id = $1 AND c.status NOT IN ('declined','cancelled')
       GROUP BY c.client_user_id, cu.name, cu.email, cu.picture
       ORDER BY MAX(c.created_at) DESC`,
      [attorneyUserId]
    );
    return result.rows;
  }

  // ─── Messaging ─────────────────────────────────────────

  async sendMessage(
    consultationId: string,
    senderId: string,
    content: string,
    messageType?: string,
    attachment?: { url: string; name: string; type: string; size: number }
  ): Promise<ConsultationMessage> {
    // Verify sender is a party to this consultation
    const consultation = await this.requireConsultation(consultationId, senderId);

    const id = uuidv4();
    const result = await this.db.query(
      `INSERT INTO consultation_messages (id, consultation_id, sender_id, content, message_type, attachment_url, attachment_name, attachment_type, attachment_size)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        id, consultationId, senderId, content, messageType || (attachment ? 'file' : 'text'),
        attachment?.url || null, attachment?.name || null, attachment?.type || null, attachment?.size || null,
      ]
    );

    // Fetch sender name for the published message
    const userResult = await this.db.query(`SELECT name FROM users WHERE id = $1`, [senderId]);
    const message: ConsultationMessage = {
      ...result.rows[0],
      sender_name: userResult.rows[0]?.name || 'Unknown',
    };

    consultationMessageBus.publish(consultationId, message);

    // Emit user-level new_message event for the other party (for global unread badge)
    const recipientId = consultation.client_user_id === senderId
      ? consultation.attorney_user_id
      : consultation.client_user_id;
    consultationMessageBus.publishUserEvent(recipientId, {
      type: 'new_message',
      consultationId,
      senderId,
      senderName: message.sender_name,
      preview: content.substring(0, 100),
    });

    return message;
  }

  async markMessagesDelivered(consultationId: string, userId: string): Promise<string[]> {
    const result = await this.db.query(
      `UPDATE consultation_messages
       SET status = 'delivered', delivered_at = NOW()
       WHERE consultation_id = $1 AND sender_id != $2 AND status = 'sent'
       RETURNING id`,
      [consultationId, userId]
    );
    const ids = result.rows.map((r: any) => r.id);
    if (ids.length > 0) {
      consultationMessageBus.publishStatus(consultationId, ids, 'delivered');
    }
    return ids;
  }

  async markMessagesRead(consultationId: string, userId: string): Promise<string[]> {
    await this.requireConsultation(consultationId, userId);

    const result = await this.db.query(
      `UPDATE consultation_messages
       SET status = 'read', read_at = NOW()
       WHERE consultation_id = $1 AND sender_id != $2 AND status != 'read'
       RETURNING id`,
      [consultationId, userId]
    );
    const ids = result.rows.map((r: any) => r.id);
    if (ids.length > 0) {
      consultationMessageBus.publishStatus(consultationId, ids, 'read');
    }
    return ids;
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

    // Mark messages as read (fix: also set status to 'read')
    const readResult = await this.db.query(
      `UPDATE consultation_messages SET status = 'read', read_at = NOW()
       WHERE consultation_id = $1 AND sender_id != $2 AND status != 'read'
       RETURNING id`,
      [consultationId, userId]
    );
    if (readResult.rows.length > 0) {
      const readIds = readResult.rows.map((r: any) => r.id);
      consultationMessageBus.publishStatus(consultationId, readIds, 'read');
    }

    return {
      messages: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
    };
  }

  async getUnreadCount(consultationId: string, userId: string): Promise<number> {
    await this.requireConsultation(consultationId, userId);
    const result = await this.db.query(
      `SELECT COUNT(*) FROM consultation_messages
       WHERE consultation_id = $1 AND sender_id != $2 AND status != 'read'`,
      [consultationId, userId]
    );
    return parseInt(result.rows[0].count, 10);
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

  // ─── Disputes ────────────────────────────────────────────

  /**
   * Raise a dispute on a consultation (client or attorney).
   * Allowed from 'in_progress' or 'completed' (within 7 days of completion).
   */
  async raiseDispute(
    consultationId: string,
    userId: string,
    reason: string
  ): Promise<{ consultation: Consultation; dispute: any }> {
    const consultation = await this.requireConsultation(consultationId, userId);

    const allowedStatuses = ['in_progress', 'completed'];
    if (!allowedStatuses.includes(consultation.status)) {
      throw new Error(`Cannot raise dispute for consultation in status: ${consultation.status}`);
    }

    // For completed consultations, enforce 7-day window
    if (consultation.status === 'completed' && consultation.completed_at) {
      const daysSinceCompleted = (Date.now() - new Date(consultation.completed_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceCompleted > 7) {
        throw new Error('Dispute window expired: must be raised within 7 days of completion');
      }
    }

    // Transition consultation to disputed
    const consultationResult = await this.db.query(
      `UPDATE consultations
       SET status = 'disputed', dispute_reason = $2, dispute_raised_by = $3, dispute_raised_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [consultationId, reason, userId]
    );

    // Create dispute record
    const disputeId = uuidv4();
    const disputeResult = await this.db.query(
      `INSERT INTO consultation_disputes (id, consultation_id, raised_by, reason)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [disputeId, consultationId, userId, reason]
    );

    await this.auditService.log({
      userId,
      action: 'consultation.disputed',
      resourceType: 'consultation',
      resourceId: consultationId,
      details: { disputeId, reason },
    });

    const enriched = await this.getConsultationById(consultationId) || consultationResult.rows[0];
    consultationMessageBus.publishConsultationStatus(enriched);

    // Email notification to the other party
    if (this.emailService) {
      const recipientId = consultation.client_user_id === userId
        ? consultation.attorney_user_id
        : consultation.client_user_id;
      Promise.all([this.getUserInfo(recipientId), this.getUserInfo(userId)])
        .then(([recipient, raiser]) => {
          if (recipient && raiser) {
            this.emailService!.sendConsultationDisputeEmail({
              email: recipient.email,
              recipientName: recipient.name,
              raisedByName: raiser.name,
              requestTitle: consultation.request_title,
              reason,
              consultationId,
            }).catch(() => {});
          }
        }).catch(() => {});
    }

    logger.info('Dispute raised', { consultationId, disputeId, userId });

    return {
      consultation: consultationResult.rows[0],
      dispute: disputeResult.rows[0],
    };
  }

  /**
   * Get dispute details for a consultation
   */
  async getDispute(consultationId: string, userId: string): Promise<any> {
    await this.requireConsultation(consultationId, userId);

    const result = await this.db.query(
      `SELECT cd.*, u.name as raised_by_name,
              ru.name as resolved_by_name
       FROM consultation_disputes cd
       JOIN users u ON u.id = cd.raised_by
       LEFT JOIN users ru ON ru.id = cd.resolved_by
       WHERE cd.consultation_id = $1
       ORDER BY cd.created_at DESC LIMIT 1`,
      [consultationId]
    );
    return result.rows[0] || null;
  }

  /**
   * List all open disputes (admin)
   */
  async listOpenDisputes(): Promise<any[]> {
    const result = await this.db.query(
      `SELECT cd.*,
              u.name as raised_by_name,
              c.request_title,
              cu.name as client_name, cu.email as client_email,
              au.name as attorney_name, au.email as attorney_email
       FROM consultation_disputes cd
       JOIN consultations c ON c.id = cd.consultation_id
       JOIN users u ON u.id = cd.raised_by
       JOIN users cu ON cu.id = c.client_user_id
       JOIN users au ON au.id = c.attorney_user_id
       WHERE cd.status IN ('open', 'under_review')
       ORDER BY cd.created_at ASC`
    );
    return result.rows;
  }

  /**
   * Resolve a dispute (admin)
   */
  async resolveDispute(
    disputeId: string,
    adminUserId: string,
    resolution: 'refund_full' | 'refund_partial' | 'dismissed',
    notes?: string
  ): Promise<any> {
    const disputeResult = await this.db.query(
      `UPDATE consultation_disputes
       SET status = 'resolved', resolution = $2, resolution_notes = $3,
           resolved_by = $4, resolved_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status IN ('open', 'under_review')
       RETURNING *`,
      [disputeId, resolution, notes || null, adminUserId]
    );

    if (disputeResult.rows.length === 0) {
      throw new Error('Dispute not found or already resolved');
    }

    const dispute = disputeResult.rows[0];

    // Update consultation status based on resolution
    const newStatus = resolution === 'dismissed' ? 'completed' : 'cancelled';
    await this.db.query(
      `UPDATE consultations SET status = $2 WHERE id = $1`,
      [dispute.consultation_id, newStatus]
    );

    await this.auditService.log({
      userId: adminUserId,
      action: 'consultation.dispute_resolved',
      resourceType: 'consultation',
      resourceId: dispute.consultation_id,
      details: { disputeId, resolution, notes },
    });

    const enriched = await this.getConsultationById(dispute.consultation_id);
    if (enriched) consultationMessageBus.publishConsultationStatus(enriched);

    logger.info('Dispute resolved', { disputeId, resolution, consultationId: dispute.consultation_id });

    return dispute;
  }

  // ─── Internal helpers ──────────────────────────────────

  /** Fetch consultation with JOINs (no auth check — internal use only for events) */
  private async getConsultationById(id: string): Promise<Consultation | null> {
    const result = await this.db.query(
      `SELECT c.*,
              cu.name as client_name,
              au.name as attorney_name,
              m.matter_name
       FROM consultations c
       JOIN users cu ON cu.id = c.client_user_id
       JOIN users au ON au.id = c.attorney_user_id
       LEFT JOIN matters m ON m.id = c.matter_id
       WHERE c.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  // ─── Global unread count ──────────────────────────────

  async getGlobalUnreadCount(userId: string): Promise<number> {
    const result = await this.db.query(
      `SELECT COUNT(*) FROM consultation_messages cm
       JOIN consultations c ON c.id = cm.consultation_id
       WHERE cm.sender_id != $1 AND cm.status != 'read'
         AND (c.client_user_id = $1 OR c.attorney_user_id = $1)`,
      [userId]
    );
    return parseInt(result.rows[0].count, 10);
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

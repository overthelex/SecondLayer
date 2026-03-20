import { EventEmitter } from 'events';
import type { ConsultationMessage } from './consultation-service.js';

type MessageCallback = (message: ConsultationMessage) => void;
type StatusCallback = (payload: { messageIds: string[]; status: string }) => void;

export interface ConsultationStatusEvent {
  type: 'consultation_status';
  consultation: any;
}

export interface NewMessageEvent {
  type: 'new_message';
  consultationId: string;
  senderId: string;
  senderName?: string;
  preview: string;
}

export interface TypingEvent {
  type: 'typing';
  consultationId: string;
  userId: string;
  userName?: string;
}

export type UserEvent = ConsultationStatusEvent | NewMessageEvent | TypingEvent;
type UserEventCallback = (event: UserEvent) => void;

class ConsultationMessageBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(1000);
  }

  subscribe(consultationId: string, callback: MessageCallback): () => void {
    const event = `msg:${consultationId}`;
    this.emitter.on(event, callback);
    return () => {
      this.emitter.off(event, callback);
    };
  }

  subscribeStatus(consultationId: string, callback: StatusCallback): () => void {
    const event = `status:${consultationId}`;
    this.emitter.on(event, callback);
    return () => {
      this.emitter.off(event, callback);
    };
  }

  subscribeConsultationStatus(consultationId: string, callback: (consultation: any) => void): () => void {
    const event = `consultation_status:${consultationId}`;
    this.emitter.on(event, callback);
    return () => {
      this.emitter.off(event, callback);
    };
  }

  subscribeUser(userId: string, callback: UserEventCallback): () => void {
    const event = `user_event:${userId}`;
    this.emitter.on(event, callback);
    return () => {
      this.emitter.off(event, callback);
    };
  }

  publish(consultationId: string, message: ConsultationMessage): void {
    this.emitter.emit(`msg:${consultationId}`, message);
  }

  publishStatus(consultationId: string, messageIds: string[], status: string): void {
    this.emitter.emit(`status:${consultationId}`, { messageIds, status });
  }

  publishConsultationStatus(consultation: any): void {
    // Emit on per-consultation channel (for detail page SSE)
    this.emitter.emit(`consultation_status:${consultation.id}`, consultation);
    // Emit on user channels (for global user SSE)
    if (consultation.client_user_id) {
      this.publishUserEvent(consultation.client_user_id, {
        type: 'consultation_status',
        consultation,
      });
    }
    if (consultation.attorney_user_id) {
      this.publishUserEvent(consultation.attorney_user_id, {
        type: 'consultation_status',
        consultation,
      });
    }
  }

  publishUserEvent(userId: string, event: UserEvent): void {
    this.emitter.emit(`user_event:${userId}`, event);
  }

  publishTyping(consultationId: string, userId: string, userName?: string): void {
    this.emitter.emit(`typing:${consultationId}`, { consultationId, userId, userName });
  }

  subscribeTyping(consultationId: string, callback: (data: { consultationId: string; userId: string; userName?: string }) => void): () => void {
    const event = `typing:${consultationId}`;
    this.emitter.on(event, callback);
    return () => {
      this.emitter.off(event, callback);
    };
  }
}

export const consultationMessageBus = new ConsultationMessageBus();

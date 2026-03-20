import { EventEmitter } from 'events';
import type { ConsultationMessage } from './consultation-service.js';
import { logger } from '../utils/logger.js';

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

// ── Interface ─────────────────────────────────────────────────────────────────

export interface IConsultationMessageBus {
  subscribe(consultationId: string, callback: MessageCallback): () => void;
  subscribeStatus(consultationId: string, callback: StatusCallback): () => void;
  subscribeConsultationStatus(consultationId: string, callback: (consultation: any) => void): () => void;
  subscribeUser(userId: string, callback: UserEventCallback): () => void;
  subscribeTyping(consultationId: string, callback: (data: { consultationId: string; userId: string; userName?: string }) => void): () => void;

  publish(consultationId: string, message: ConsultationMessage): void;
  publishStatus(consultationId: string, messageIds: string[], status: string): void;
  publishConsultationStatus(consultation: any): void;
  publishUserEvent(userId: string, event: UserEvent): void;
  publishTyping(consultationId: string, userId: string, userName?: string): void;

  shutdown?(): Promise<void>;
}

// ── EventEmitter Implementation (in-memory fallback) ──────────────────────────

export class LocalConsultationMessageBus implements IConsultationMessageBus {
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
    this.emitter.emit(`consultation_status:${consultation.id}`, consultation);
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

// ── Factory ───────────────────────────────────────────────────────────────────

let _bus: IConsultationMessageBus | null = null;

/**
 * Create or return the singleton consultation message bus.
 * If REDIS_URL is set, attempts to create a Redis-backed bus;
 * falls back to in-memory EventEmitter on failure or if Redis is unavailable.
 */
export async function createConsultationMessageBus(): Promise<IConsultationMessageBus> {
  if (_bus) return _bus;

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const { RedisConsultationMessageBus } = await import('./redis-consultation-message-bus.js');
      const redisBus = new RedisConsultationMessageBus(redisUrl);
      await redisBus.connect();
      _bus = redisBus;
      logger.info('[ConsultationMessageBus] Using Redis Pub/Sub implementation');
      return _bus;
    } catch (err: any) {
      logger.warn('[ConsultationMessageBus] Redis Pub/Sub failed, falling back to in-memory EventEmitter', {
        error: err.message,
      });
    }
  }

  _bus = new LocalConsultationMessageBus();
  logger.info('[ConsultationMessageBus] Using in-memory EventEmitter implementation');
  return _bus;
}

/**
 * Get the current message bus instance (sync).
 * Returns a LocalConsultationMessageBus if not yet initialized.
 */
export function getConsultationMessageBus(): IConsultationMessageBus {
  if (!_bus) {
    _bus = new LocalConsultationMessageBus();
  }
  return _bus;
}

/**
 * @deprecated Use getConsultationMessageBus() instead. Kept for backward compatibility.
 */
export const consultationMessageBus = new LocalConsultationMessageBus();

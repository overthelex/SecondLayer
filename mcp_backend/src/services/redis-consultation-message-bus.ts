/**
 * RedisConsultationMessageBus — Redis Pub/Sub backed message bus for consultations.
 *
 * Uses two Redis clients (Redis requires separate connections for pub/sub):
 *   - subscriber: dedicated to SUBSCRIBE/PSUBSCRIBE
 *   - publisher: used for PUBLISH
 *
 * Channel naming:
 *   sl:msg:{consultationId}          — individual message delivery
 *   sl:status:{consultationId}       — message status updates (sent/delivered/read)
 *   sl:cstatus:{consultationId}      — consultation state changes
 *   sl:user:{userId}                 — global user-level events
 *   sl:typing:{consultationId}       — typing indicators
 *
 * All payloads are JSON-serialized for cross-process compatibility.
 */

import { createClient, type RedisClientType } from 'redis';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import type { ConsultationMessage } from './consultation-service.js';
import type {
  IConsultationMessageBus,
  UserEvent,
} from './consultation-message-bus.js';

// Channel prefix
const P = 'sl:';

type MessageCallback = (message: ConsultationMessage) => void;
type StatusCallback = (payload: { messageIds: string[]; status: string }) => void;
type UserEventCallback = (event: UserEvent) => void;

export class RedisConsultationMessageBus implements IConsultationMessageBus {
  private publisher: RedisClientType;
  private subscriber: RedisClientType;
  /** Local emitter bridges Redis messages → per-callback dispatch */
  private localEmitter = new EventEmitter();
  /** Track channel → subscription count for subscribe/unsubscribe lifecycle */
  private channelRefs = new Map<string, number>();
  private connected = false;

  constructor(private redisUrl: string) {
    this.publisher = createClient({ url: redisUrl }) as RedisClientType;
    this.subscriber = createClient({ url: redisUrl }) as RedisClientType;
    this.localEmitter.setMaxListeners(1000);

    this.publisher.on('error', (err) => logger.error('[RedisMessageBus] Publisher error:', err));
    this.subscriber.on('error', (err) => logger.error('[RedisMessageBus] Subscriber error:', err));
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    await Promise.all([
      this.publisher.connect(),
      this.subscriber.connect(),
    ]);
    this.connected = true;
    logger.info('[RedisMessageBus] Connected (publisher + subscriber)');
  }

  async shutdown(): Promise<void> {
    if (!this.connected) return;
    this.connected = false;
    try {
      await this.subscriber.quit();
      await this.publisher.quit();
    } catch (err: any) {
      logger.warn('[RedisMessageBus] Shutdown error:', err.message);
    }
    logger.info('[RedisMessageBus] Disconnected');
  }

  // ── Subscribe helpers ────────────────────────────────────────────────────

  private async addChannelSubscription(channel: string): Promise<void> {
    const refs = this.channelRefs.get(channel) || 0;
    this.channelRefs.set(channel, refs + 1);

    if (refs === 0) {
      // First subscriber for this channel — subscribe in Redis
      await this.subscriber.subscribe(channel, (message) => {
        try {
          const parsed = JSON.parse(message);
          this.localEmitter.emit(channel, parsed);
        } catch (err) {
          logger.warn('[RedisMessageBus] Failed to parse message on channel', { channel, error: (err as Error).message });
        }
      });
    }
  }

  private async removeChannelSubscription(channel: string): Promise<void> {
    const refs = (this.channelRefs.get(channel) || 1) - 1;
    if (refs <= 0) {
      this.channelRefs.delete(channel);
      try {
        await this.subscriber.unsubscribe(channel);
      } catch {
        // Non-critical — connection may already be closed
      }
    } else {
      this.channelRefs.set(channel, refs);
    }
  }

  private subscribeChannel<T>(channel: string, callback: (data: T) => void): () => void {
    this.localEmitter.on(channel, callback);
    this.addChannelSubscription(channel).catch((err) => {
      logger.warn('[RedisMessageBus] Failed to subscribe to channel', { channel, error: err.message });
    });

    return () => {
      this.localEmitter.off(channel, callback);
      this.removeChannelSubscription(channel).catch(() => {});
    };
  }

  private publishChannel(channel: string, data: any): void {
    if (!this.connected) return;
    const payload = JSON.stringify(data);
    this.publisher.publish(channel, payload).catch((err) => {
      logger.warn('[RedisMessageBus] Publish failed', { channel, error: err.message });
    });
  }

  // ── IConsultationMessageBus implementation ───────────────────────────────

  subscribe(consultationId: string, callback: MessageCallback): () => void {
    return this.subscribeChannel<ConsultationMessage>(`${P}msg:${consultationId}`, callback);
  }

  subscribeStatus(consultationId: string, callback: StatusCallback): () => void {
    return this.subscribeChannel<{ messageIds: string[]; status: string }>(`${P}status:${consultationId}`, callback);
  }

  subscribeConsultationStatus(consultationId: string, callback: (consultation: any) => void): () => void {
    return this.subscribeChannel<any>(`${P}cstatus:${consultationId}`, callback);
  }

  subscribeUser(userId: string, callback: UserEventCallback): () => void {
    return this.subscribeChannel<UserEvent>(`${P}user:${userId}`, callback);
  }

  subscribeTyping(consultationId: string, callback: (data: { consultationId: string; userId: string; userName?: string }) => void): () => void {
    return this.subscribeChannel<{ consultationId: string; userId: string; userName?: string }>(`${P}typing:${consultationId}`, callback);
  }

  publish(consultationId: string, message: ConsultationMessage): void {
    this.publishChannel(`${P}msg:${consultationId}`, message);
  }

  publishStatus(consultationId: string, messageIds: string[], status: string): void {
    this.publishChannel(`${P}status:${consultationId}`, { messageIds, status });
  }

  publishConsultationStatus(consultation: any): void {
    // Emit on per-consultation channel
    this.publishChannel(`${P}cstatus:${consultation.id}`, consultation);
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
    this.publishChannel(`${P}user:${userId}`, event);
  }

  publishTyping(consultationId: string, userId: string, userName?: string): void {
    this.publishChannel(`${P}typing:${consultationId}`, { consultationId, userId, userName });
  }
}

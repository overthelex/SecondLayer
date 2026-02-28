import { EventEmitter } from 'events';
import type { ConsultationMessage } from './consultation-service.js';

type MessageCallback = (message: ConsultationMessage) => void;

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

  publish(consultationId: string, message: ConsultationMessage): void {
    this.emitter.emit(`msg:${consultationId}`, message);
  }
}

export const consultationMessageBus = new ConsultationMessageBus();

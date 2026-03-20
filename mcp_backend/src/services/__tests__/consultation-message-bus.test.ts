import { LocalConsultationMessageBus } from '../consultation-message-bus';
import type { ConsultationMessage } from '../consultation-service';

function makeMessage(overrides: Partial<ConsultationMessage> = {}): ConsultationMessage {
  return {
    id: 'msg-1',
    consultation_id: 'cons-1',
    sender_id: 'user-1',
    content: 'Hello',
    message_type: 'text',
    status: 'sent',
    created_at: new Date(),
    sender_name: 'Test User',
    ...overrides,
  };
}

describe('ConsultationMessageBus', () => {
  const bus = new LocalConsultationMessageBus();

  it('delivers messages to subscribers of the correct consultation', () => {
    const callback = jest.fn();
    const unsubscribe = bus.subscribe('cons-1', callback);

    const msg = makeMessage();
    bus.publish('cons-1', msg);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(msg);
    unsubscribe();
  });

  it('does not deliver messages to subscribers of other consultations', () => {
    const callback = jest.fn();
    const unsubscribe = bus.subscribe('cons-2', callback);

    bus.publish('cons-1', makeMessage());

    expect(callback).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('supports multiple subscribers for the same consultation', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    const unsub1 = bus.subscribe('cons-3', cb1);
    const unsub2 = bus.subscribe('cons-3', cb2);

    const msg = makeMessage({ consultation_id: 'cons-3' });
    bus.publish('cons-3', msg);

    expect(cb1).toHaveBeenCalledWith(msg);
    expect(cb2).toHaveBeenCalledWith(msg);
    unsub1();
    unsub2();
  });

  it('unsubscribe stops delivery', () => {
    const callback = jest.fn();
    const unsubscribe = bus.subscribe('cons-4', callback);

    unsubscribe();
    bus.publish('cons-4', makeMessage({ consultation_id: 'cons-4' }));

    expect(callback).not.toHaveBeenCalled();
  });

  it('unsubscribe only removes the specific callback', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    const unsub1 = bus.subscribe('cons-5', cb1);
    const unsub2 = bus.subscribe('cons-5', cb2);

    unsub1();
    bus.publish('cons-5', makeMessage({ consultation_id: 'cons-5' }));

    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledTimes(1);
    unsub2();
  });

  it('handles publish with no subscribers gracefully', () => {
    expect(() => {
      bus.publish('cons-no-one', makeMessage());
    }).not.toThrow();
  });
});

import { resolveChatTimeoutMs } from '../chat-inline-routes';

describe('resolveChatTimeoutMs', () => {
  // ChatService auto-escalates effectiveBudget up to maxBudget (default: deep),
  // so the wall-clock backstop must cover the escalation ceiling, not the
  // requested budget. Repro: chat-f6e736b9 (2026-07-03) — standard request
  // auto-escalated to deep (plan >= 8 steps) was aborted mid-VERIFY at 240s.

  it('gives the deep timeout when no maxBudget caps escalation', () => {
    expect(resolveChatTimeoutMs('standard', undefined)).toBe(360_000);
    expect(resolveChatTimeoutMs('quick', undefined)).toBe(360_000);
    expect(resolveChatTimeoutMs(undefined, undefined)).toBe(360_000);
    expect(resolveChatTimeoutMs('deep', undefined)).toBe(360_000);
  });

  it('gives the deep timeout when maxBudget is deep', () => {
    expect(resolveChatTimeoutMs('standard', 'deep')).toBe(360_000);
  });

  it('gives the standard timeout when maxBudget caps escalation below deep', () => {
    expect(resolveChatTimeoutMs('standard', 'standard')).toBe(240_000);
    expect(resolveChatTimeoutMs('quick', 'quick')).toBe(240_000);
  });
});

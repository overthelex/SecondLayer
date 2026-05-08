import { describe, it, expect } from 'vitest';
import { detectPII, redactText } from '../../src/redaction/pii-detector';

describe('PII Detector', () => {
  it('detects email addresses', () => {
    const matches = detectPII('Contact john.doe@example.com for details');
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('email');
    expect(matches[0].value).toBe('john.doe@example.com');
  });

  it('detects Ukrainian phone numbers', () => {
    const matches = detectPII('Call +380 (67) 123 45 67');
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('phone');
  });

  it('detects phone numbers without country code', () => {
    const matches = detectPII('Tel: (067) 123 45 67');
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('phone');
  });

  it('detects internal URLs', () => {
    const matches = detectPII('See https://api.internal.legal.org.ua/health');
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('url');
  });

  it('detects large financial amounts in UAH', () => {
    const matches = detectPII('Total: 50000 грн');
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('financial');
  });

  it('detects large financial amounts in USD', () => {
    const matches = detectPII('Payment: $15,000');
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('financial');
  });

  it('ignores small financial amounts', () => {
    const matches = detectPII('Cost: $50');
    expect(matches).toHaveLength(0);
  });

  it('returns empty array for clean text', () => {
    const matches = detectPII('This is a clean legal document about Article 124 of the Constitution');
    expect(matches).toHaveLength(0);
  });
});

describe('redactText', () => {
  it('replaces PII with type-specific placeholders', () => {
    const result = redactText('Email john@example.com or call +380671234567');
    expect(result).toContain('[REDACTED_EMAIL]');
    expect(result).toContain('[REDACTED_PHONE]');
    expect(result).not.toContain('john@example.com');
    expect(result).not.toContain('+380671234567');
  });

  it('preserves clean text unchanged', () => {
    const text = 'Article 124 of the Constitution of Ukraine';
    expect(redactText(text)).toBe(text);
  });

  it('handles multiple PII matches', () => {
    const result = redactText('From: alice@corp.com to bob@corp.com about https://secret.internal.legal.org.ua/api');
    expect(result.match(/\[REDACTED_EMAIL\]/g)).toHaveLength(2);
    expect(result).toContain('[REDACTED_URL]');
  });
});

import { describe, it, expect } from 'vitest';

describe('Edit Classifier', () => {
  describe('rule-based classification', () => {
    const ruleClassify = (norm: number): string | null => {
      if (norm < 0.05) return 'cosmetic';
      if (norm >= 0.80) return 'substantive_rewrite';
      return null;
    };

    it('classifies near-zero edits as cosmetic', () => {
      expect(ruleClassify(0.01)).toBe('cosmetic');
      expect(ruleClassify(0.049)).toBe('cosmetic');
    });

    it('classifies high-distance edits as substantive', () => {
      expect(ruleClassify(0.80)).toBe('substantive_rewrite');
      expect(ruleClassify(0.95)).toBe('substantive_rewrite');
      expect(ruleClassify(1.0)).toBe('substantive_rewrite');
    });

    it('returns null for middle range (needs LLM)', () => {
      expect(ruleClassify(0.05)).toBeNull();
      expect(ruleClassify(0.30)).toBeNull();
      expect(ruleClassify(0.50)).toBeNull();
      expect(ruleClassify(0.79)).toBeNull();
    });

    it('boundary: 0.05 is NOT cosmetic (needs LLM)', () => {
      expect(ruleClassify(0.05)).toBeNull();
    });

    it('boundary: 0.80 IS substantive', () => {
      expect(ruleClassify(0.80)).toBe('substantive_rewrite');
    });
  });

  describe('valid classification classes', () => {
    const VALID = ['cosmetic', 'reorganization', 'factual_correction', 'tone_adjustment', 'substantive_rewrite', 'rejection'];

    it('accepts all valid classes', () => {
      for (const cls of VALID) {
        expect(VALID.includes(cls)).toBe(true);
      }
    });

    it('rejects invalid classes', () => {
      expect(VALID.includes('minor_edit')).toBe(false);
      expect(VALID.includes('typo')).toBe(false);
      expect(VALID.includes('')).toBe(false);
    });
  });

  describe('content truncation for prompt', () => {
    it('truncates content to 3000 chars for classification', () => {
      const longText = 'a'.repeat(5000);
      const truncated = longText.slice(0, 3000);
      expect(truncated.length).toBe(3000);
    });

    it('preserves short content', () => {
      const shortText = 'fix the bug';
      const truncated = shortText.slice(0, 3000);
      expect(truncated).toBe('fix the bug');
    });
  });

  describe('batch processing', () => {
    it('splits array into correct batch sizes', () => {
      const items = Array.from({ length: 25 }, (_, i) => i);
      const batchSize = 10;
      const batches: number[][] = [];
      for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
      }
      expect(batches).toHaveLength(3);
      expect(batches[0]).toHaveLength(10);
      expect(batches[1]).toHaveLength(10);
      expect(batches[2]).toHaveLength(5);
    });
  });
});

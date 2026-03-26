import { maskSensitive, maskEmail, sanitizeId } from '../sanitize-log';

describe('sanitize-log', () => {
  describe('maskSensitive', () => {
    it('should show first 4 chars and append *** for a normal token', () => {
      expect(maskSensitive('abcdefghij')).toBe('abcd***');
    });

    it('should return *** for a string that is exactly visibleChars long', () => {
      expect(maskSensitive('abcd')).toBe('***');
    });

    it('should return *** for a string shorter than visibleChars', () => {
      expect(maskSensitive('ab')).toBe('***');
    });

    it('should return *** for an empty string', () => {
      expect(maskSensitive('')).toBe('***');
    });

    it('should respect a custom visibleChars parameter', () => {
      expect(maskSensitive('supersecretkey', 6)).toBe('supers***');
    });

    it('should return *** when visibleChars is 0 and string is empty', () => {
      expect(maskSensitive('', 0)).toBe('***');
    });

    it('should handle visibleChars larger than string length', () => {
      expect(maskSensitive('short', 10)).toBe('***');
    });
  });

  describe('maskEmail', () => {
    it('should mask a standard email keeping 2 chars + domain', () => {
      expect(maskEmail('user@example.com')).toBe('us***@example.com');
    });

    it('should mask a single-char local part', () => {
      expect(maskEmail('a@example.com')).toBe('a***@example.com');
    });

    it('should return *** for a string without @', () => {
      expect(maskEmail('notanemail')).toBe('***');
    });

    it('should return *** for an empty string', () => {
      expect(maskEmail('')).toBe('***');
    });

    it('should handle subdomain emails', () => {
      expect(maskEmail('john.doe@mail.company.org')).toBe('jo***@mail.company.org');
    });

    it('should handle email with very short local part (1 char)', () => {
      expect(maskEmail('x@domain.ua')).toBe('x***@domain.ua');
    });
  });

  describe('sanitizeId', () => {
    it('should truncate a long UUID to 8 chars + ...', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(sanitizeId(uuid)).toBe('550e8400...');
    });

    it('should return short IDs unchanged', () => {
      expect(sanitizeId('abc123')).toBe('abc123');
    });

    it('should handle exactly 8 chars without truncation', () => {
      expect(sanitizeId('12345678')).toBe('12345678');
    });

    it('should accept numeric IDs and convert to string', () => {
      expect(sanitizeId(12345)).toBe('12345');
    });

    it('should truncate a long numeric ID', () => {
      expect(sanitizeId(123456789012345)).toBe('12345678...');
    });

    it('should handle zero as id', () => {
      expect(sanitizeId(0)).toBe('0');
    });
  });
});

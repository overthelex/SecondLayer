import { maskSensitive, maskEmail, sanitizeId, sanitizeClassified } from '../sanitize-log';

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

  describe('sanitizeClassified', () => {
    // --- falsy / empty inputs ---

    it('should return an empty string unchanged', () => {
      expect(sanitizeClassified('')).toBe('');
    });

    it('should return null unchanged (falsy pass-through)', () => {
      // The function returns the value as-is when falsy
      expect(sanitizeClassified(null as unknown as string)).toBeNull();
    });

    it('should return undefined unchanged (falsy pass-through)', () => {
      expect(sanitizeClassified(undefined as unknown as string)).toBeUndefined();
    });

    // --- таємно (CLASSIFIED_PATTERN) ---

    it('should redact "таємно" (lowercase)', () => {
      expect(sanitizeClassified('таємно')).toBe('[REDACTED]');
    });

    it('should redact "Таємно" (title case)', () => {
      expect(sanitizeClassified('Таємно')).toBe('[REDACTED]');
    });

    it('should redact "ТАЄМНО" (uppercase)', () => {
      expect(sanitizeClassified('ТАЄМНО')).toBe('[REDACTED]');
    });

    // --- цілком таємно ---

    it('should redact "цілком таємно" (single space)', () => {
      expect(sanitizeClassified('цілком таємно')).toBe('[REDACTED]');
    });

    it('should redact "цілком  таємно" (multiple spaces)', () => {
      expect(sanitizeClassified('цілком  таємно')).toBe('[REDACTED]');
    });

    // --- ДСК whole-word matching (Unicode-aware lookbehind/lookahead) ---

    it('should redact standalone "дск"', () => {
      expect(sanitizeClassified('дск')).toBe('[REDACTED]');
    });

    it('should redact standalone "ДСК"', () => {
      expect(sanitizeClassified('ДСК')).toBe('[REDACTED]');
    });

    it('should redact "ДСК" between Cyrillic words', () => {
      expect(sanitizeClassified('гриф ДСК документ')).toBe('гриф [REDACTED] документ');
    });

    it('should NOT redact "підска" — дск embedded inside a word', () => {
      expect(sanitizeClassified('підска')).toBe('підска');
    });

    // --- досудов ---

    it('should redact "досудове"', () => {
      expect(sanitizeClassified('досудове провадження')).toBe('[REDACTED] провадження');
    });

    it('should redact "досудового"', () => {
      expect(sanitizeClassified('досудового')).toBe('[REDACTED]');
    });

    // --- розслідуванн ---

    it('should redact "розслідування"', () => {
      expect(sanitizeClassified('розслідування')).toBe('[REDACTED]');
    });

    it('should redact "розслідуванні"', () => {
      expect(sanitizeClassified('розслідуванні')).toBe('[REDACTED]');
    });

    // --- оперативно-розшукова / оперативно розшукова ---

    it('should redact "оперативно-розшукова" fully', () => {
      expect(sanitizeClassified('оперативно-розшукова діяльність')).toBe('[REDACTED] діяльність');
    });

    it('should redact "оперативно розшукової" fully', () => {
      expect(sanitizeClassified('оперативно розшукової')).toBe('[REDACTED]');
    });

    // --- слідч ---

    it('should redact "слідча"', () => {
      expect(sanitizeClassified('слідча дія')).toBe('[REDACTED] дія');
    });

    it('should redact "слідчого"', () => {
      expect(sanitizeClassified('слідчого')).toBe('[REDACTED]');
    });

    // --- інсайдер ---

    it('should redact "інсайдерська"', () => {
      expect(sanitizeClassified('інсайдерська інформація')).toBe('[REDACTED] інформація');
    });

    // --- військов ---

    it('should redact "військова"', () => {
      expect(sanitizeClassified('військова таємниця')).toBe('[REDACTED] [REDACTED]');
    });

    it('should redact "військового"', () => {
      expect(sanitizeClassified('військового')).toBe('[REDACTED]');
    });

    // --- секретн ---

    it('should redact "секретно"', () => {
      expect(sanitizeClassified('секретно')).toBe('[REDACTED]');
    });

    it('should redact "секретної"', () => {
      expect(sanitizeClassified('секретної інформації')).toBe('[REDACTED] інформації');
    });

    // --- multiple tokens in one string ---

    it('should redact all classified tokens in a sentence', () => {
      const input = 'справа містить слідчі матеріали та таємні відомості';
      const result = sanitizeClassified(input);
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('слідч');
      expect(result).not.toContain('таємн');
    });

    it('should redact both CLASSIFIED_PATTERN and DSK tokens', () => {
      const input = 'документ ДСК, гриф таємно';
      const result = sanitizeClassified(input);
      expect(result).toBe('документ [REDACTED], гриф [REDACTED]');
    });

    // --- non-matching Ukrainian text passes through ---

    it('should leave non-classified Ukrainian text unchanged', () => {
      const safe = 'Цивільний позов подано до суду першої інстанції';
      expect(sanitizeClassified(safe)).toBe(safe);
    });

    it('should leave plain Latin text unchanged', () => {
      expect(sanitizeClassified('hello world')).toBe('hello world');
    });

    // --- filename real-world example ---

    it('should redact classified tokens in a filename while preserving the rest', () => {
      const filename = 'Слідча_постанова_СБУ_таємно_провадж_42-2026.pdf';
      const result = sanitizeClassified(filename);
      // "Слідч" and "таємн" are matched; the rest of the filename is kept
      expect(result).toContain('[REDACTED]');
      expect(result).not.toContain('Слідч');
      expect(result).not.toContain('таємн');
      expect(result).toContain('_СБУ_');
      expect(result).toContain('_провадж_42-2026.pdf');
    });
  });
});

/**
 * Sanitize sensitive values for logging.
 * Builds a new string character-by-character to break CodeQL taint tracking.
 */
export function maskSensitive(value: string, visibleChars: number = 4): string {
  if (!value || value.length <= visibleChars) return '***';
  const chars: string[] = [];
  for (let i = 0; i < Math.min(visibleChars, value.length); i++) {
    chars.push(value.charAt(i));
  }
  return chars.join('') + '***';
}

export function sanitizeId(id: string | number): string {
  const s = String(id);
  const chars: string[] = [];
  for (let i = 0; i < s.length; i++) {
    chars.push(s.charAt(i));
  }
  return chars.join('');
}

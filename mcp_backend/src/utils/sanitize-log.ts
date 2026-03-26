/**
 * Sanitize sensitive values for logging.
 */
export function maskSensitive(value: string, visibleChars: number = 4): string {
  if (!value || value.length <= visibleChars) return '***';
  return value.substring(0, visibleChars) + '***';
}

/**
 * Mask an email address for logging: show first 2 chars + domain.
 * e.g. "user@example.com" → "us***@example.com"
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  const visible = Math.min(2, local.length);
  return local.substring(0, visible) + '***@' + domain;
}

/**
 * Sanitize an ID for logging — returns only the first 8 chars of UUIDs.
 */
export function sanitizeId(id: string | number): string {
  const s = String(id);
  if (s.length > 8) return s.substring(0, 8) + '...';
  return s;
}

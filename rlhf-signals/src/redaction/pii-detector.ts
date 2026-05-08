import fs from 'fs';
import { config } from '../lib/config';

export interface PIIMatch {
  type: 'email' | 'phone' | 'name' | 'url' | 'financial';
  value: string;
  start: number;
  end: number;
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+?38)?\s*\(?\d{2,3}\)?\s*[-\s]?\d{3}\s*[-\s]?\d{2}\s*[-\s]?\d{2}/g;
const INTERNAL_URL_RE = /https?:\/\/[^\s]*\.internal\.legal\.org\.ua[^\s]*/g;
const FINANCIAL_RE = /(?:USD|UAH|EUR|грн|₴|\$|€)\s*\d[\d,.\s]*|\d[\d,.\s]*\s*(?:USD|UAH|EUR|грн|₴|\$|€)/gi;

let whitelist: string[] = [];

function loadWhitelist(): string[] {
  if (whitelist.length > 0) return whitelist;
  try {
    const data = JSON.parse(fs.readFileSync(config.redactionWhitelistFile, 'utf-8'));
    whitelist = data.emails || [];
    return whitelist;
  } catch {
    return [];
  }
}

export function detectPII(text: string): PIIMatch[] {
  const matches: PIIMatch[] = [];
  const whitelistedEmails = loadWhitelist();

  let m: RegExpExecArray | null;

  EMAIL_RE.lastIndex = 0;
  while ((m = EMAIL_RE.exec(text)) !== null) {
    if (!whitelistedEmails.includes(m[0].toLowerCase())) {
      matches.push({ type: 'email', value: m[0], start: m.index, end: m.index + m[0].length });
    }
  }

  PHONE_RE.lastIndex = 0;
  while ((m = PHONE_RE.exec(text)) !== null) {
    matches.push({ type: 'phone', value: m[0], start: m.index, end: m.index + m[0].length });
  }

  INTERNAL_URL_RE.lastIndex = 0;
  while ((m = INTERNAL_URL_RE.exec(text)) !== null) {
    matches.push({ type: 'url', value: m[0], start: m.index, end: m.index + m[0].length });
  }

  FINANCIAL_RE.lastIndex = 0;
  while ((m = FINANCIAL_RE.exec(text)) !== null) {
    const numericPart = m[0].replace(/[^\d.,]/g, '');
    const amount = parseFloat(numericPart.replace(/,/g, ''));
    if (amount >= 10000) {
      matches.push({ type: 'financial', value: m[0], start: m.index, end: m.index + m[0].length });
    }
  }

  return matches.sort((a, b) => a.start - b.start);
}

export function redactText(text: string): string {
  const matches = detectPII(text);
  if (matches.length === 0) return text;

  let result = '';
  let lastEnd = 0;

  for (const match of matches) {
    result += text.slice(lastEnd, match.start);
    result += `[REDACTED_${match.type.toUpperCase()}]`;
    lastEnd = match.end;
  }

  result += text.slice(lastEnd);
  return result;
}

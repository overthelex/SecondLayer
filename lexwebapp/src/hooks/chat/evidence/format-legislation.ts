/**
 * Converts flat legislation text into structured markdown.
 *
 * Raw text from the backend arrives as a single string without line breaks.
 * This function detects numbered points, section/chapter headers, and
 * article titles, inserting markdown structure so ReactMarkdown can
 * render them properly.
 */

export function formatLegislationText(raw: string): string {
  if (!raw || typeof raw !== 'string') return raw;

  // If the text already contains markdown headings or multiple newlines, skip formatting
  if (/^#{1,3}\s/m.test(raw) || /\n\n/.test(raw)) return raw;

  let text = raw;

  // --- Structural headers ---
  // "Розділ II ЗАГАЛЬНІ ПОЛОЖЕННЯ..." → newline + bold header
  text = text.replace(
    /\s*(Розділ\s+[IVXLCDM\d]+(?:\s+[А-ЯІЇЄҐ][А-ЯІЇЄҐ\s,'—–-]+)?)/g,
    '\n\n---\n\n### $1',
  );

  // "Глава 52 ПОНЯТТЯ ТА УМОВИ..." → newline + bold header
  text = text.replace(
    /\s*(Глава\s+\d+[А-Яа-яіїєґ\-]*(?:\s+[А-ЯІЇЄҐ][А-ЯІЇЄҐ\s,'—–-]+)?)/g,
    '\n\n#### $1',
  );

  // "Частина перша/друга/..." or "Частина 1/2/..."
  text = text.replace(
    /\s*(Частина\s+(?:перша|друга|третя|четверта|п'ята|шоста|сьома|восьма|дев'ята|десята|\d+))/gi,
    '\n\n**$1**\n\n',
  );

  // --- Numbered points ---
  // "1. Боржник..." → newline before number (but not "1." inside a sentence)
  // Match point numbers at the start or after a sentence-ending punctuation
  text = text.replace(/([.;])\s+(\d{1,3})\.\s/g, '$1\n\n$2. ');
  // Handle the very first numbered point if it follows the article title
  text = text.replace(/^([^.]+?)\s+(1\.\s)/m, '$1\n\n$2');

  // --- Sub-points with parenthesized numbers: 1) 2) 3) ---
  text = text.replace(/([.;])\s+(\d{1,3})\)\s/g, '$1\n\n$2) ');

  // --- Clean up multiple blank lines ---
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

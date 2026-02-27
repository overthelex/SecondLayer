/**
 * Lightweight EML (RFC 822) parser for displaying email content in the browser.
 * Handles multipart MIME, encoded headers, quoted-printable, and base64 text parts.
 */

interface ParsedEmail {
  subject: string;
  from: string;
  to: string;
  date: string;
  textBody: string;
  htmlBody: string;
  attachments: string[];
}

/**
 * Decode RFC 2047 encoded words (=?charset?encoding?text?=)
 */
function decodeEncodedWords(str: string): string {
  return str.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_match, _charset, encoding, text) => {
    if (encoding.toUpperCase() === 'B') {
      try {
        return atob(text);
      } catch {
        return text;
      }
    }
    if (encoding.toUpperCase() === 'Q') {
      return text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_: string, hex: string) =>
        String.fromCharCode(parseInt(hex, 16))
      );
    }
    return text;
  });
}

/**
 * Decode quoted-printable encoded text
 */
function decodeQuotedPrintable(text: string): string {
  return text
    .replace(/=\r?\n/g, '') // soft line breaks
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Decode base64 text to UTF-8 string
 */
function decodeBase64(text: string): string {
  try {
    const cleaned = text.replace(/\s/g, '');
    const bytes = atob(cleaned);
    // Try to decode as UTF-8
    const uint8 = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      uint8[i] = bytes.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(uint8);
  } catch {
    return text;
  }
}

/**
 * Extract a header value, handling multi-line folded headers
 */
function extractHeader(headers: string, name: string): string {
  const regex = new RegExp(`^${name}:\\s*(.+(?:\\r?\\n[ \\t].+)*)`, 'mi');
  const match = headers.match(regex);
  if (!match) return '';
  // Unfold continuation lines
  const raw = match[1].replace(/\r?\n[ \t]+/g, ' ').trim();
  return decodeEncodedWords(raw);
}

/**
 * Parse a single MIME part and return its content if it's text
 */
function parseMimePart(part: string): { contentType: string; encoding: string; content: string } | null {
  const headerEnd = part.search(/\r?\n\r?\n/);
  if (headerEnd < 0) return null;

  const headers = part.substring(0, headerEnd);
  const body = part.substring(headerEnd).replace(/^\r?\n\r?\n/, '');

  const ctMatch = headers.match(/Content-Type:\s*([^;\r\n]+)/i);
  const contentType = ctMatch ? ctMatch[1].trim().toLowerCase() : 'text/plain';

  const encMatch = headers.match(/Content-Transfer-Encoding:\s*(\S+)/i);
  const encoding = encMatch ? encMatch[1].trim().toLowerCase() : '7bit';

  let content = body;
  if (encoding === 'base64') {
    content = decodeBase64(body);
  } else if (encoding === 'quoted-printable') {
    content = decodeQuotedPrintable(body);
  }

  return { contentType, encoding, content };
}

/**
 * Strip HTML tags and decode entities, preserving line breaks
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Check if content looks like a raw EML/MIME email.
 * Detects both raw EML and partially-parsed EML (where headers were decoded
 * but MIME boundaries remain).
 */
export function isRawEml(content: string): boolean {
  if (!content || content.length < 20) return false;
  const first1000 = content.substring(0, 1000);
  // Check for typical email headers at the start (English or already-decoded Ukrainian)
  const hasHeaders = /^(From|Subject|Date|MIME-Version|Content-Type|Received|Message-ID|Return-Path|Тема|Від|Кому):\s/mi.test(first1000);
  // Check for MIME boundary markers anywhere in the content
  const hasMimeBoundary = /boundary=/i.test(first1000) ||
    /Content-Type:\s*multipart/i.test(first1000) ||
    /^--[a-zA-Z0-9]+/m.test(first1000);
  // Also detect if content has raw MIME part headers
  const hasMimePartHeaders = /Content-Type:\s*(text\/plain|text\/html|image\/|application\/)/mi.test(first1000) ||
    /Content-Transfer-Encoding:\s*(base64|quoted-printable)/mi.test(first1000);
  return hasHeaders && (hasMimeBoundary || hasMimePartHeaders);
}

/**
 * Parse raw EML content and extract readable email text
 */
export function parseEmlContent(raw: string): ParsedEmail {
  const result: ParsedEmail = {
    subject: '',
    from: '',
    to: '',
    date: '',
    textBody: '',
    htmlBody: '',
    attachments: [],
  };

  // Split headers from body
  const splitMatch = raw.match(/\r?\n\r?\n/);
  if (!splitMatch || splitMatch.index === undefined) {
    return { ...result, textBody: raw };
  }

  const headerSection = raw.substring(0, splitMatch.index);
  const bodySection = raw.substring(splitMatch.index + splitMatch[0].length);

  // Extract headers
  result.subject = extractHeader(headerSection, 'Subject');
  result.from = extractHeader(headerSection, 'From');
  result.to = extractHeader(headerSection, 'To');
  result.date = extractHeader(headerSection, 'Date');

  // Check content type for multipart
  const contentTypeHeader = extractHeader(headerSection, 'Content-Type');
  const encodingHeader = extractHeader(headerSection, 'Content-Transfer-Encoding').toLowerCase();

  // Try to find boundary from Content-Type header, or detect it from body
  const isMultipart = contentTypeHeader.toLowerCase().includes('multipart') ||
    /Content-Type:\s*multipart/i.test(bodySection) ||
    /^--[0-9a-f]{20,}/m.test(bodySection);

  if (isMultipart) {
    // Extract boundary from header, body content-type, or detect from first boundary marker
    const boundaryMatch = contentTypeHeader.match(/boundary="?([^";\s]+)"?/i) ||
                          headerSection.match(/boundary="?([^";\s]+)"?/i) ||
                          bodySection.match(/boundary="?([^";\s]+)"?/i) ||
                          bodySection.match(/^--([0-9a-f]{20,})/m);
    if (boundaryMatch) {
      const boundary = boundaryMatch[1];
      const parts = bodySection.split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?`));

      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;

        // Check if this part itself is multipart (nested)
        if (/Content-Type:\s*multipart/i.test(trimmed)) {
          const nestedResult = parseEmlContent(`Content-Type: ${trimmed.match(/Content-Type:\s*([^\r\n]+)/i)?.[1] || ''}\n\n${trimmed.substring(trimmed.search(/\r?\n\r?\n/) + 2)}`);
          if (nestedResult.textBody && !result.textBody) result.textBody = nestedResult.textBody;
          if (nestedResult.htmlBody && !result.htmlBody) result.htmlBody = nestedResult.htmlBody;
          continue;
        }

        const parsed = parseMimePart(trimmed);
        if (!parsed) continue;

        if (parsed.contentType.startsWith('text/plain') && !result.textBody) {
          result.textBody = parsed.content;
        } else if (parsed.contentType.startsWith('text/html') && !result.htmlBody) {
          result.htmlBody = parsed.content;
        } else if (/Content-Disposition:\s*attachment/i.test(trimmed)) {
          const nameMatch = trimmed.match(/filename="?([^";\r\n]+)"?/i);
          if (nameMatch) {
            result.attachments.push(decodeEncodedWords(nameMatch[1].trim()));
          }
        }
      }
    }
  } else if (contentTypeHeader.toLowerCase().includes('text/html')) {
    let content = bodySection;
    if (encodingHeader === 'base64') content = decodeBase64(bodySection);
    else if (encodingHeader === 'quoted-printable') content = decodeQuotedPrintable(bodySection);
    result.htmlBody = content;
  } else {
    // Plain text or unknown
    let content = bodySection;
    if (encodingHeader === 'base64') content = decodeBase64(bodySection);
    else if (encodingHeader === 'quoted-printable') content = decodeQuotedPrintable(bodySection);
    result.textBody = content;
  }

  return result;
}

/**
 * Format parsed email into readable markdown text
 */
export function formatEmlAsMarkdown(parsed: ParsedEmail): string {
  const lines: string[] = [];

  if (parsed.subject) lines.push(`**Тема:** ${parsed.subject}`);
  if (parsed.from) lines.push(`**Від:** ${parsed.from}`);
  if (parsed.to) lines.push(`**Кому:** ${parsed.to}`);
  if (parsed.date) lines.push(`**Дата:** ${parsed.date}`);

  if (lines.length > 0) lines.push('', '---', '');

  // Prefer text body, fall back to stripped HTML
  const body = parsed.textBody?.trim() || (parsed.htmlBody ? stripHtml(parsed.htmlBody) : '');
  if (body) {
    lines.push(body);
  }

  if (parsed.attachments.length > 0) {
    lines.push('', '---', '', `**Вкладення (${parsed.attachments.length}):**`);
    for (const att of parsed.attachments) {
      lines.push(`- ${att}`);
    }
  }

  return lines.join('\n');
}

/**
 * Process raw content: if it's EML, parse and format it; otherwise return as-is
 */
export function processEmlContent(content: string): string {
  if (!isRawEml(content)) return content;
  const parsed = parseEmlContent(content);
  return formatEmlAsMarkdown(parsed);
}

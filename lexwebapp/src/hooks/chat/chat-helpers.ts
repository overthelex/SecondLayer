/**
 * Chat helper utilities — context building and norm extraction.
 */

import type { Citation } from '../../types/models/Message';

/**
 * Build a contextual query that includes prior conversation history.
 * Prepends last N user-assistant exchanges so the LLM has conversational memory.
 */
export function buildContextualQuery(
  query: string,
  messages: Array<{ role: string; content: string }>,
  maxTurns = 3
): string {
  const pairs: Array<{ user: string; assistant: string }> = [];
  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i];
    const next = messages[i + 1];
    if (msg.role === 'user' && next?.role === 'assistant' && next.content) {
      pairs.push({
        user: msg.content.slice(0, 500),
        assistant: next.content.slice(0, 500),
      });
      i++;
    }
  }

  if (pairs.length === 0) return query;

  const recentPairs = pairs.slice(-maxTurns);
  const context = recentPairs
    .map((p) => `Користувач: ${p.user}\nАсистент: ${p.assistant}`)
    .join('\n\n');

  return `Контекст попередньої розмови:\n${context}\n\nПоточне запитання: ${query}`;
}

/**
 * Extract law article references from the AI answer text.
 * Matches patterns like "ст. 509 ЦКУ", "ч. 1 ст. 626 ЦК", "стаття 509 Цивільного кодексу України",
 * "ст. 124 Конституції України", "статтями 1046-1053 ЦКУ".
 */
export function extractNormsFromAnswer(answerText: string): Citation[] {
  const norms: Citation[] = [];
  const seen = new Set<string>();

  const CODES = '(?:ЦКУ|ГКУ|КПК|ЦПК|ГПК|КАС|ПКУ|СКУ|ККУ|КЗпП|ЗКУ|МКУ|ЦК|ГК|ПК|ЗК|МК)';
  const FULL_LAW = '(?:[А-ЯҐЄІЇа-яґєії]+ого\\s+[Кк]одексу(?:\\s+України)?|[Зз]акону\\s+України(?:\\s+[«""][^»""]{1,80}[»""])?|[Кк]онституції\\s+України|[Кк]онвенції[^,;.]{0,50})';
  const ST = 'ст(?:атт[а-яіїєґ]*)?';

  const re = new RegExp(
    '(?:(?:п\\.?\\s*\\d+[,\\s]+)?(?:ч\\.?\\s*\\d+[,\\s]+))?' +
    ST + '\\.?\\s*\\d+(?:[\\u2013\\u2014,\\-]\\s*\\d+)*\\s+(?:' + CODES + '|' + FULL_LAW + ')(?:\\s+України)?' +
    '|' + ST + '\\.?\\s*\\d+\\s+Конституц[іи][їи]\\s+України',
    'gi'
  );

  const sentences = answerText.split(/\n|(?<=[.;!?])\s+/);
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(trimmed)) !== null) {
      const ref = match[0].trim();
      const key = ref.toLowerCase().replace(/\s+/g, ' ');
      if (!seen.has(key)) {
        seen.add(key);
        norms.push({ text: trimmed, source: ref });
      }
    }
  }
  return norms;
}

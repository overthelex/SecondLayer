/**
 * Dispositive (резолютивна частина) extraction + coarse outcome classification.
 *
 * Shared by:
 *  - edrsr_get_decision_dispositive (edrsr-extended-tools.ts) — user-facing extraction
 *  - compare_practice_pro_contra (procedural-tools.ts) — anchors pro/contra stance to the
 *    operative part of the decision instead of a topically-similar snippet, which only
 *    restates the norm and led the classifier to invert outcomes.
 *
 * The marker list is the single source of truth — keep both call sites importing from here.
 */

export const DISPOSITIVE_MARKERS = [
  'ВИРІШИВ:',
  'УХВАЛИВ:',
  'ПОСТАНОВИВ:',
  'ВИРОК',
  'В И Р І Ш И В',
  'У Х В А Л И В',
  'П О С Т А Н О В И В',
  'в и р і ш и в',
  'у х в а л и в',
  'п о с т а н о в и в',
];

export const DISPOSITIVE_MAX_CHARS = 8000;
export const DISPOSITIVE_FALLBACK_TAIL_CHARS = 4000;

export interface ExtractedDispositive {
  dispositive: string;
  /** Which marker matched, or null when the tail-fallback was used. */
  marker: string | null;
  /** Char offset of the marker in the full text, or null on fallback. */
  marker_position: number | null;
  /** true when no marker was found and the document tail was returned instead. */
  is_fallback: boolean;
}

/**
 * Extract the operative part of a decision from its full text by locating the earliest
 * dispositive marker. Falls back to the document tail (where the operative part almost always
 * sits) when no marker is present.
 */
export function extractDispositiveFromText(
  fullText: string,
  maxChars: number = DISPOSITIVE_MAX_CHARS,
  tailChars: number = DISPOSITIVE_FALLBACK_TAIL_CHARS,
): ExtractedDispositive {
  const text = fullText || '';
  if (!text) {
    return { dispositive: '', marker: null, marker_position: null, is_fallback: false };
  }

  let bestPos = -1;
  let bestMarker: string | null = null;
  for (const marker of DISPOSITIVE_MARKERS) {
    const pos = text.indexOf(marker);
    if (pos >= 0 && (bestPos === -1 || pos < bestPos)) {
      bestPos = pos;
      bestMarker = marker;
    }
  }

  if (bestPos >= 0) {
    return {
      dispositive: text.slice(bestPos, bestPos + maxChars),
      marker: bestMarker,
      marker_position: bestPos,
      is_fallback: false,
    };
  }

  const tailStart = Math.max(0, text.length - tailChars);
  return {
    dispositive: text.slice(tailStart),
    marker: null,
    marker_position: null,
    is_fallback: true,
  };
}

/**
 * Coarse outcome of a decision, derived from its dispositive. Intentionally conservative:
 * cassation/appeal operative parts speak in terms of the *appeal* ("касаційну скаргу
 * залишити без задоволення"), so the claim-level result is often not recoverable by keywords
 * alone. This label is metadata/transparency — the authoritative pro/contra stance is decided
 * by the LLM, which is given the full dispositive text and can reason about who appealed.
 */
export type DecisionOutcome =
  | 'granted'      // позов/скаргу задоволено
  | 'denied'       // у задоволенні відмовлено / залишено без задоволення
  | 'partial'      // задоволено частково
  | 'remanded'     // направлено на новий розгляд
  | 'quashed'      // рішення скасовано (без прямого нового рішення)
  | 'procedural'   // ухвала процесуального характеру (повернення/закриття тощо)
  | 'unknown';

export function classifyOutcome(dispositive: string): DecisionOutcome {
  const t = (dispositive || '').toLowerCase().replace(/\s+/g, ' ');
  if (!t) return 'unknown';

  // Order matters: more specific patterns first.
  if (/задовольнити частково|задоволено частково|частково задовольнити/.test(t)) return 'partial';
  if (/направити (справу )?(на новий розгляд|для нового розгляду)|передати (справу )?на новий (касаційний )?розгляд/.test(t)) {
    return 'remanded';
  }
  if (/(повернути|повертається).*(колегії суддів|скаргу|заяву|справу)|(справу|скаргу|заяву).*(повернути|повертається)|закрити (касаційне |апеляційне )?провадження|залишити (позов|заяву|скаргу) без розгляду/.test(t)) {
    return 'procedural';
  }
  if (/у задоволенні (позову|позовних вимог|заяви|скарги).{0,40}(відмов)|відмовити (повністю )?у задоволенні|залишити без задоволення/.test(t)) {
    return 'denied';
  }
  if (/(позов|позовні вимоги|заяву|скаргу).{0,60}задовольнити|задовольнити (позов|позовні вимоги|заяву|скаргу)/.test(t)) {
    return 'granted';
  }
  if (/скасувати|скасовано/.test(t)) return 'quashed';
  return 'unknown';
}

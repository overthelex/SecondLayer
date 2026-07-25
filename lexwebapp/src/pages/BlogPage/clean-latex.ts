const re = (literal: string) => new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');

export function cleanLatex(raw: string): string {
  let s = raw;
  s = s.replace(/^% .*\n/gm, '');
  s = s.replace(/^\[(?:nosep|leftmargin[^\]]*|label[^\]]*)\]\n/gm, '');
  s = s.replace(re('"='), '-');
  s = s.replace(/\s*\((?:[a-z]+\d{4}[a-z]*(?:,\s*[a-z]+\d{4}[a-z]*)*)\)/g, '');
  s = s.replace(
    /(?<![a-zA-Z])([a-z]+)(20[12]\d)([a-z]*)\b/g,
    (match, author: string) => {
      const common =
        /^(push|pull|text|code|time|long|last|cross|task|self|zero|full|half|best|meta|auto|para|post|over|left|item|mono|main|type|mini|data|deep|comp|base|test|next|prev|open|send|real|like|info|cost|core|drop|flat|true|dual|down|case|fine|from|mark|back|well|used|less|also|into|just|then|much|each|more|some|here|when|with|what|only|will|been|have|does|made|most|them|than|this|that|line|file|such|very|good|make|work|first|total|upper|lower|model|input|state|point|right|block|multi|large|batch|index|level|class|store|query|token|about|after|being|every|still|above|while|their|where|these|other|shall|should|could|would|which)$/i;
      if (common.test(author)) return match;
      return '';
    },
  );
  s = s.replace(re('{\\sim}'), '~');
  s = s.replace(re('\\longrightarrow'), '→');
  s = s.replace(re('\\leq'), '≤');
  s = s.replace(re('\\geq'), '≥');
  s = s.replace(re('\\ll'), '≪');
  s = s.replace(re('\\to'), '→');
  s = s.replace(re('\\alpha'), 'α');
  s = s.replace(re('\\cdot'), '·');
  s = s.replace(re('\\sigma'), 'σ');
  s = s.replace(re('\\times'), '×');
  s = s.replace(re('\\approx'), '≈');
  s = s.replace(/\\mathrm\{([^}]+)\}/g, '$1');
  s = s.replace(/\\text\{([^}]+)\}/g, '$1');
  s = s.replace(re('\\bigl('), '(');
  s = s.replace(re('\\bigr)'), ')');
  s = s.replace(/f_\{\\text\{([^}]+)\}\}/g, 'f_$1');
  s = s.replace(re('<<'), '«');
  s = s.replace(re('>>'), '»');
  s = s.replace(re('{,}'), ',');
  s = s.replace(re('{=}'), '=');
  s = s.replace(/N\{=\*\*(\d+)/g, 'N=$1');
  s = s.replace(re('R^2'), 'R²');
  s = s.replace(/\\\[[\s\S]*?\\\]/g, (m) => {
    const inner = m.slice(2, -2).trim().replace(/\s+/g, ' ');
    return `\n\n*${inner}*\n\n`;
  });
  s = s.replace(/\\foreignlanguage\{[^}]+\}\{([^}]+)\}/g, '$1');
  s = s.replace(/^ - \[([^\]]+)\.?\]/gm, ' - **$1.**');
  s = s.replace(/ сесії\)\.\}/g, ' сесій).**');
  s = s.replace(/ сесій\)\.\}/g, ' сесій).**');
  s = s.replace(/\n{4,}/g, '\n\n\n');
  // Em dashes → space-surrounded en dash
  s = s.replace(/—/g, ' – ');
  s = s.replace(/  +/g, ' ');
  return s;
}

import React, { useContext, createContext } from 'react';

// Context to pass list type (ul/ol) down to li without prop drilling
export const ListTypeContext = createContext<'ul' | 'ol'>('ul');

// Defined outside Message to avoid remounting on each render (react-markdown rule)
export function MdLi({ children }: { children?: React.ReactNode }) {
  const listType = useContext(ListTypeContext);
  // Ordered list: rely on CSS list-decimal + marker coloring from parent ol
  if (listType === 'ol') {
    return (
      <li className="leading-[1.7] text-claude-text pl-1">{children}</li>
    );
  }
  // Unordered list: custom dot bullet via flex
  return (
    <li className="flex gap-2.5 leading-[1.7] text-claude-text list-none">
      <span className="flex-shrink-0 mt-[10px] w-[6px] h-[6px] rounded-full bg-claude-accent/65 select-none" aria-hidden />
      <span className="flex-1">{children}</span>
    </li>
  );
}

/**
 * Highlight legal code references in text
 */
export function highlightLegalCodes(text: string): React.ReactNode {
  const parts = text.split(/((?:ЦКУ|ГКУ|КПК|ЦПК|ГПК|КАС|ПКУ|СКУ|ККУ|КЗпП)\s+(?:ст\.|статт[яі])\s*\d+)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (/^(?:ЦКУ|ГКУ|КПК|ЦПК|ГПК|КАС|ПКУ|СКУ|ККУ|КЗпП)/.test(part)) {
      return <span key={i} className="font-semibold text-claude-text">{part}</span>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

/**
 * Detect if content is raw JSON that the LLM echoed instead of synthesizing.
 */
export function isRawJsonContent(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed?.content && Array.isArray(parsed.content)) return true;
    if (parsed?.source_case || parsed?.similar_cases || parsed?.results) return true;
    if (parsed?.legislation || parsed?.articles) return true;
    if (parsed?.entities || parsed?.bills || parsed?.deputies) return true;
    if (parsed?.deadlines || parsed?.checklist || parsed?.risk_score != null) return true;
    if (parsed?.beneficiaries || parsed?.votings || parsed?.findings) return true;
    if (trimmed.length > 500) return true;
    return false;
  } catch {
    return false;
  }
}

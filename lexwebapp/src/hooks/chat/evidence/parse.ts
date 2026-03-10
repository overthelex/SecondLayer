/**
 * Parse raw MCP tool result content — handles content array and plain objects.
 */

/** Content block within an MCP result envelope. */
interface ContentBlock {
  type?: string;
  text?: string;
}

/** Loosely-typed tool result from the backend. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolResult = Record<string, any>;

export function parseToolResultContent(result: unknown): ToolResult | null {
  if (!result) return null;
  try {
    const r = result as ToolResult;
    if (r.content && Array.isArray(r.content)) {
      const textBlock = r.content.find((b: ContentBlock) => b.type === 'text');
      if (textBlock?.text) {
        return JSON.parse(textBlock.text);
      }
    }
    return typeof result === 'string' ? JSON.parse(result) : r;
  } catch {
    return result as ToolResult;
  }
}

/**
 * Classify court document type from available fields.
 * Used to split decisions into "Рішення" tab vs "Документи" tab.
 */
export function classifyDocumentType(item: ToolResult): string {
  const form = item?.judgment_form || item?.form_name || item?.judgment_form_name
    || item?.document_type || '';
  const formLower = String(form).toLowerCase();
  if (formLower.includes('постанова')) return 'Постанова';
  if (formLower.includes('рішення')) return 'Рішення';
  if (formLower.includes('ухвала')) return 'Ухвала';
  if (formLower.includes('вирок')) return 'Вирок';
  if (formLower.includes('окрема думка')) return 'Окрема думка';
  if (formLower.includes('окрема')) return 'Окрема ухвала';

  const text = [item?.title, item?.resolution, item?.summary, item?.snippet]
    .filter(Boolean).join(' ');
  if (/Постанова\b/i.test(text)) return 'Постанова';
  if (/\bРішення\b/i.test(text)) return 'Рішення';
  if (/\bУхвала\b/i.test(text)) return 'Ухвала';
  if (/\bВирок\b/i.test(text)) return 'Вирок';
  if (/Окрема думка/i.test(text)) return 'Окрема думка';

  return '';
}

export const courtDocUrl = (docId: string | number | undefined) =>
  docId ? `https://reyestr.court.gov.ua/Review/${docId}` : undefined;

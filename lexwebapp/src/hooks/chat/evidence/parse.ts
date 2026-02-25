/**
 * Parse raw MCP tool result content — handles content array and plain objects.
 */
export function parseToolResultContent(result: any): any {
  if (!result) return null;
  try {
    if (result.content && Array.isArray(result.content)) {
      const textBlock = result.content.find((b: any) => b.type === 'text');
      if (textBlock?.text) {
        return JSON.parse(textBlock.text);
      }
    }
    return typeof result === 'string' ? JSON.parse(result) : result;
  } catch {
    return result;
  }
}

/**
 * Classify court document type from available fields.
 * Used to split decisions into "Рішення" tab vs "Документи" tab.
 */
export function classifyDocumentType(item: any): string {
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

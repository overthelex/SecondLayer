/**
 * MCP result formatters — convert tool results to human-readable strings
 */

export function formatSearchResults(response: any): string {
  if (response.cases && Array.isArray(response.cases)) {
    return `Знайдено справ: ${response.total || response.cases.length}\n\n${response.cases
      .map(
        (c: any, i: number) =>
          `${i + 1}. ${c.case_number || c.number || 'N/A'}\n   Суд: ${c.court || 'N/A'}\n   Дата: ${c.date || 'N/A'}\n   ${c.summary || c.category || ''}`
      )
      .join('\n\n')}`;
  }

  if (response.precedents && Array.isArray(response.precedents)) {
    return `Знайдено прецедентів: ${response.total || response.precedents.length}\n\n${response.precedents
      .map(
        (p: any, i: number) =>
          `${i + 1}. ${p.case_number}\n   Схожість: ${Math.round(p.similarity * 100)}%\n   ${p.summary}`
      )
      .join('\n\n')}`;
  }

  if (response.legislation && Array.isArray(response.legislation)) {
    return `Знайдено законів: ${response.legislation.length}\n\n${response.legislation
      .map((l: any, i: number) => `${i + 1}. ${l.title}\n   Тип: ${l.type}`)
      .join('\n\n')}`;
  }

  return JSON.stringify(response, null, 2);
}

export function formatDocumentResults(response: any): string {
  if (response.text) {
    return response.text;
  }

  if (response.sections && Array.isArray(response.sections)) {
    return response.sections
      .map((s: any) => `## ${s.name}\n\n${s.content}`)
      .join('\n\n---\n\n');
  }

  if (response.documents && Array.isArray(response.documents)) {
    return response.documents
      .map((d: any) => `### Документ: ${d.document_id}\n\n${d.text}`)
      .join('\n\n---\n\n');
  }

  return JSON.stringify(response, null, 2);
}

export function formatLegislationResults(response: any): string {
  if (response.text) {
    return `# ${response.legislation_id} - Стаття ${response.article_number}\n\n${response.text}${response.context ? `\n\n---\n\n${response.context}` : ''}`;
  }

  if (response.content) {
    return `# ${response.legislation_id} - ${response.section_name}\n\n${response.content}`;
  }

  if (response.articles && Array.isArray(response.articles)) {
    return response.articles
      .map(
        (a: any) =>
          `## Стаття ${a.article_number}\n\n${a.text || a.content}`
      )
      .join('\n\n---\n\n');
  }

  return JSON.stringify(response, null, 2);
}

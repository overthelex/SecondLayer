/**
 * Tool Utilities - Shared helper functions for MCP tool handlers
 *
 * Extracted from MCPQueryAPI to enable reuse across domain tool handlers.
 * Pure functions have no dependencies; impure functions accept dependencies as parameters.
 */

import { SectionType } from '../types/index.js';
import type { EdsrFtsService, EdsrFtsFilters } from '../services/edrsr-fts-service.js';
import { logger } from '../utils/logger.js';
import axios from 'axios';

// ========================= Pure Functions =========================

/**
 * Parse JSON from LLM response, stripping markdown fences if present.
 * Handles: ```json {...} ```, ```{...}```, or raw JSON.
 */
export function parseLLMJson<T = any>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;

  let cleaned = text.trim();

  // Strip markdown code fences anywhere in text (not just anchored to start/end).
  // Handles: ```json\n{...}\n```, ```\n{...}\n```, and fences with surrounding text.
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Try direct parse first
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fallback: extract first JSON object/array
    const jsonMatch = cleaned.match(/[\[{][\s\S]*[\]}]/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // give up
      }
    }
  }

  return fallback;
}

/**
 * Extract source strings from mixed sources array (strings, objects with id/url/title).
 */
export function extractSourceStrings(sources: any): string[] {
  if (!Array.isArray(sources)) return [];
  const out: string[] = [];
  for (const s of sources) {
    if (!s) continue;
    if (typeof s === 'string') {
      out.push(s);
      continue;
    }
    if (typeof s === 'object') {
      if (typeof s.id === 'string') out.push(s.id);
      if (typeof s.source_id === 'string') out.push(s.source_id);
      if (typeof s.url === 'string') out.push(s.url);
      if (typeof s.title === 'string') out.push(s.title);
    }
  }
  return Array.from(new Set(out.filter((x) => String(x).trim().length > 0)));
}

/**
 * Extract case number from Ukrainian court decision text.
 */
export function extractCaseNumberFromText(text: string): string | null {
  const t = String(text || '').trim();
  if (!t) return null;
  const m = t.match(/Справа\s*№\s*([0-9A-Za-zА-Яа-яІіЇїЄє\/-]+)/i);
  if (m && m[1]) return m[1].trim();
  const m2 = t.match(/у\s*справ[іи]\s*№\s*([0-9A-Za-zА-Яа-яІіЇїЄє\/-]+)/i);
  if (m2 && m2[1]) return m2[1].trim();
  return null;
}

/**
 * Parse time_range parameter into date_from/date_to strings.
 */
export function parseTimeRangeToDates(timeRange: any): { date_from?: string; date_to?: string; warning?: string } {
  if (!timeRange) return {};
  if (typeof timeRange === 'object' && (timeRange.from || timeRange.to)) {
    const from = typeof timeRange.from === 'string' ? timeRange.from.slice(0, 10) : undefined;
    const to = typeof timeRange.to === 'string' ? timeRange.to.slice(0, 10) : undefined;
    return { date_from: from, date_to: to };
  }
  if (typeof timeRange === 'string') {
    const s = timeRange.trim().toLowerCase();
    const m = s.match(/last\s+(\d+)\s+years?/);
    if (m) {
      const years = Math.max(0, Number(m[1]));
      const d = new Date();
      d.setFullYear(d.getFullYear() - years);
      return { date_from: d.toISOString().slice(0, 10) };
    }
    const m2 = s.match(/last\s+(\d+)\s+months?/);
    if (m2) {
      const months = Math.max(0, Number(m2[1]));
      const d = new Date();
      d.setMonth(d.getMonth() - months);
      return { date_from: d.toISOString().slice(0, 10) };
    }
    return { warning: 'Unsupported time_range string format. Use {from,to} or "last N years".' };
  }
  return { warning: 'Unsupported time_range format. Use {from,to} or "last N years".' };
}

/**
 * Map procedure code string to normalized short form.
 */
export function mapProcedureCodeToShort(code: any): 'cpc' | 'gpc' | 'cac' | 'crpc' | null {
  const v = String(code || '').trim().toLowerCase();
  if (v === 'cpc') return 'cpc';
  if (v === 'gpc' || v === 'epc') return 'gpc';
  if (v === 'cac') return 'cac';
  if (v === 'crpc') return 'crpc';
  return null;
}

/**
 * Add days to a YYYY-MM-DD date string.
 */
export function addDaysYMD(ymd: string, days: number): string {
  const d = new Date(ymd);
  if (Number.isNaN(d.getTime())) {
    throw new Error('event_date must be a valid date string (YYYY-MM-DD)');
  }
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Extract text snippets around query matches in a full text.
 */
export function extractSnippets(fullText: string, query: string, limit: number): string[] {
  const q = query.trim();
  if (!fullText || !q) return [];

  const hay = fullText;
  const needle = q.toLowerCase();
  const lower = hay.toLowerCase();

  const snippets: string[] = [];
  let fromIndex = 0;
  const window = 320;
  while (snippets.length < limit) {
    const idx = lower.indexOf(needle, fromIndex);
    if (idx < 0) break;

    const start = Math.max(0, idx - Math.floor(window / 2));
    const end = Math.min(hay.length, idx + needle.length + Math.floor(window / 2));
    const raw = hay.slice(start, end).replace(/\s+/g, ' ').trim();
    const prefix = start > 0 ? '…' : '';
    const suffix = end < hay.length ? '…' : '';
    snippets.push(`${prefix}${raw}${suffix}`);
    fromIndex = idx + needle.length;
  }
  return snippets;
}

/**
 * Generate case number variations (short/long year, with/without suffix).
 */
export function generateCaseNumberVariations(caseNumber: string): string[] {
  const variations = new Set<string>();
  variations.add(caseNumber);

  // Standard format: 123/456/22-ц
  const match = caseNumber.match(/^(\d+\/\d+\/)(\d{2,4})(-[а-яіїєґА-ЯІЇЄҐ])?$/);
  if (match) {
    const prefix = match[1];
    const year = match[2];
    const suffix = match[3] || '';

    const [shortYear, longYear] = expandYear(year);

    variations.add(`${prefix}${shortYear}${suffix}`);
    variations.add(`${prefix}${longYear}${suffix}`);

    if (suffix) {
      variations.add(`${prefix}${shortYear}`);
      variations.add(`${prefix}${longYear}`);
    }
  }

  // Pre-2017 VSU format: 5-15кс12 → also try 5-15/12, 5-15/2012
  const vsuMatch = caseNumber.match(/^(\d+-\d+)[а-яіїєґА-ЯІЇЄҐ]+(\d{2,4})$/);
  if (vsuMatch) {
    const numPart = vsuMatch[1];
    const year = vsuMatch[2];
    const [shortYear, longYear] = expandYear(year);

    variations.add(`${numPart}/${shortYear}`);
    variations.add(`${numPart}/${longYear}`);
  }

  return Array.from(variations);
}

function expandYear(year: string): [string, string] {
  if (year.length === 2) {
    const yearNum = parseInt(year, 10);
    return [year, yearNum < 50 ? `20${year}` : `19${year}`];
  }
  if (year.length === 4) {
    return [year.slice(-2), year];
  }
  return [year, year];
}

/**
 * Translate OpenReyestr entity type code to Ukrainian label.
 */
export function translateEntityType(type: string): string {
  const map: Record<string, string> = {
    'UO': 'Юридична особа',
    'FOP': 'Фізична особа-підприємець',
    'FSU': 'Громадське формування',
  };
  return map[type] || type;
}

/**
 * Format business entities response for display.
 */
export function formatBusinessEntitiesResponse(data: any, args: any): string {
  const entities = Array.isArray(data) ? data : [];

  let text = `# Результати пошуку суб'єктів господарювання\n\n`;
  text += `**Запит:** ${args.query || args.edrpou || 'всі'}\n`;
  text += `**Знайдено:** ${entities.length}\n\n`;

  entities.forEach((entity: any, idx: number) => {
    text += `## ${idx + 1}. ${entity.name || entity.short_name}\n\n`;
    text += `- **ЄДРПОУ:** ${entity.edrpou || 'н/д'}\n`;
    text += `- **Номер запису:** ${entity.record}\n`;
    text += `- **Тип:** ${translateEntityType(entity.entity_type)}\n`;
    text += `- **Статус:** ${entity.stan || 'н/д'}\n`;
    if (entity.opf) text += `- **ОПФ:** ${entity.opf}\n`;
    text += `\n`;
  });

  return text;
}

/**
 * Build Supreme Court search hints string based on intent.
 *
 * NOTE: ZakonOnline sph04 search mode treats all terms as AND conditions.
 * Appending chamber names (КЦС, КГС, etc.) to the search text causes 0 results
 * because documents rarely contain ALL chamber names simultaneously.
 * Use `buildSupremeCourtWhereFilter()` for API-level court filtering instead.
 */
export function buildSupremeCourtHints(_intent?: any): string {
  // Disabled: text-based hints break sph04 AND-mode search.
  // SC filtering now uses where[instance_code] API filter.
  return '';
}

/**
 * Map procedure code to ZakonOnline justice_kind filter value.
 * justice_kind: 1=цивільне, 2=кримінальне, 3=господарське, 4=адміністративне
 */
export function mapProcedureCodeToJusticeKind(code: string | null): number | null {
  const map: Record<string, number> = {
    cpc: 1,   // цивільне судочинство
    crpc: 2,  // кримінальне судочинство
    gpc: 3,   // господарське судочинство
    cac: 4,   // адміністративне судочинство
  };
  return code ? (map[code] ?? null) : null;
}

/**
 * Build where-filter conditions for court instance filtering.
 * instance_code: 1=cassation (ВС), 2=appellate, 3=first instance
 */
export function buildSupremeCourtWhereFilter(courtLevel: string): any[] {
  if (courtLevel === 'SC' || courtLevel === 'GrandChamber') {
    return [{ field: 'instance_code', operator: '=', value: 1 }];
  }
  if (courtLevel === 'AC') {
    return [{ field: 'instance_code', operator: '=', value: 2 }];
  }
  if (courtLevel === 'FC') {
    return [{ field: 'instance_code', operator: '=', value: 3 }];
  }
  return [];
}

/** Court instance cascade order: SC → appellate → first instance */
const INSTANCE_CASCADE = [
  { level: 'SC', code: 1, label: 'Верховний Суд' },
  { level: 'AC', code: 2, label: 'апеляційні суди' },
  { level: 'FC', code: 3, label: 'суди першої інстанції' },
] as const;

/**
 * Cascading court search: try SC first, if empty — appellate, if empty — first instance.
 * Returns results + which instance level actually matched.
 */
export async function searchWithInstanceCascade(
  searchFn: (whereFilters: any[]) => Promise<{ data: any[] }>,
  baseWhereFilters: any[],
): Promise<{ data: any[]; instanceLevel: string; instanceLabel: string }> {
  for (const inst of INSTANCE_CASCADE) {
    const filters = [
      ...baseWhereFilters,
      { field: 'instance_code', operator: '=', value: inst.code },
    ];
    const result = await searchFn(filters);
    if (result.data.length > 0) {
      return { data: result.data, instanceLevel: inst.level, instanceLabel: inst.label };
    }
  }
  return { data: [], instanceLevel: 'none', instanceLabel: '' };
}

/**
 * Pick section types for answer based on intent classification.
 */
export function pickSectionTypesForAnswer(intent: any): SectionType[] {
  const focus = intent?.slots?.section_focus;
  if (Array.isArray(focus) && focus.length > 0) {
    return focus as SectionType[];
  }
  if (Array.isArray(intent?.sections) && intent.sections.length > 0) {
    return intent.sections as SectionType[];
  }
  return [SectionType.COURT_REASONING, SectionType.DECISION, SectionType.LAW_REFERENCES];
}

/**
 * Safely parse JSON from a tool result's content[0].text.
 */
export function safeParseJsonFromToolResult(result: any): any {
  try {
    const text = result?.content?.[0]?.text;
    if (typeof text !== 'string' || text.trim().length === 0) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Parse OpenReyestr response to extract data from result.content[0].text.
 */
export function parseOpenReyestrResponse(response: any): any {
  try {
    const text = response?.result?.content?.[0]?.text;
    return typeof text === 'string' ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

// ========================= Functions with Dependencies =========================

/**
 * Call a RADA MCP tool via HTTP API.
 */
export async function callRadaTool(toolName: string, args: any): Promise<any> {
  const baseUrl = String(process.env.RADA_MCP_URL || '').trim();
  const apiKey = String(process.env.RADA_API_KEY || '').trim();

  if (!baseUrl) {
    throw new Error('RADA_MCP_URL is not configured');
  }
  if (!apiKey) {
    throw new Error('RADA_API_KEY is not configured');
  }

  const url = `${baseUrl.replace(/\/$/, '')}/api/tools/${encodeURIComponent(toolName)}`;

  const resp = await axios.post(
    url,
    { arguments: args },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    }
  );

  return resp.data;
}

/**
 * Call an OpenReyestr MCP tool via HTTP API.
 */
export async function callOpenReyestrTool(toolName: string, args: any): Promise<any> {
  const baseUrl = String(process.env.OPENREYESTR_MCP_URL || '').trim();
  const apiKey = String(process.env.OPENREYESTR_API_KEY || '').trim();

  if (!baseUrl) {
    throw new Error('OPENREYESTR_MCP_URL is not configured');
  }
  if (!apiKey) {
    throw new Error('OPENREYESTR_API_KEY is not configured');
  }

  const url = `${baseUrl.replace(/\/$/, '')}/api/tools/${encodeURIComponent(toolName)}`;

  const resp = await axios.post(
    url,
    { arguments: args },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    }
  );

  return resp.data;
}

/**
 * Count results for a query via EDRSR FTS. Returns the FTS total estimate (the service
 * caps the exact count for speed) plus the first page for right-panel display. Replaces
 * the old ZakonOnline pagination loop, which routed through a now-deleted dead stub.
 */
export async function countAllResults(
  ftsService: EdsrFtsService,
  db: any,
  query: string,
  filters: EdsrFtsFilters = {}
): Promise<{
  total_count: number;
  pages_fetched: number;
  time_taken_ms: number;
  cost_estimate_usd: number;
  first_results: any[];
}> {
  const startTime = Date.now();
  const resp = await ftsService.searchFulltext(query, db, filters, 50, 0);
  const firstResults = resp.results.map((r) => ({
    doc_id: r.doc_id,
    cause_num: r.cause_num,
    judge: r.judge,
    court_code: r.court_code,
    adjudication_date: r.adjudication_date,
    url: `https://reyestr.court.gov.ua/Review/${r.doc_id}`,
  }));

  return {
    total_count: resp.total,
    pages_fetched: 1,
    time_taken_ms: Date.now() - startTime,
    cost_estimate_usd: 0,
    first_results: firstResults,
  };
}

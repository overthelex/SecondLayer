/**
 * query-ir/parse.ts — single validation entry point for LLM/user output.
 *
 * Replaces the scattered manual validation:
 *   - mcp_backend query-reformulator.ts:75-87 (regex + typeof + fallback)
 *   - secondlayer-core query-planner.ts sanitizeIntent()/normalizeCourtLevel()
 *   - secondlayer-core chat-intent-classifier.ts typeof checks
 *
 * Contract: NEVER throws. Callers degrade gracefully on { ok: false } (e.g.
 * fall back to plain FTS/semantic search or general_search) and log issues
 * for observability of prompt regressions.
 */
import { z, type ZodType, type ZodIssue } from 'zod';
import { CourtSearchIR, IntentIR, PlannerSlots } from './slots';

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ZodIssue[] };

/** Pull the first JSON object out of an LLM string response. */
export function extractJsonObject(raw: string): unknown | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

/** Generic strict-parse wrapper. */
export function parseWith<T>(schema: ZodType<T>, raw: unknown): ParseResult<T> {
  const r = schema.safeParse(raw);
  return r.success
    ? { ok: true, value: r.data }
    : { ok: false, issues: r.error.issues };
}

/** Validate a court/EDRSR search IR (object OR raw LLM string). */
export function parseCourtSearchIR(raw: unknown): ParseResult<CourtSearchIR> {
  const obj = typeof raw === 'string' ? extractJsonObject(raw) : raw;
  if (obj === null) return { ok: false, issues: [] };
  return parseWith(CourtSearchIR, obj);
}

/** Validate full planner/classifier intent IR (object OR raw LLM string). */
export function parseIntentIR(raw: unknown): ParseResult<IntentIR> {
  const obj = typeof raw === 'string' ? extractJsonObject(raw) : raw;
  if (obj === null) return { ok: false, issues: [] };
  return parseWith(IntentIR, obj);
}

/**
 * Validate the chat QueryPlanner slot bag (Ukrainian convention). Run this
 * AFTER the planner's alias-normalization so canonical values reach the
 * strictObject; unknown slots are dropped (injection guard). Returns ok:false
 * (never throws) so the planner can keep its normalized slots and just log.
 */
export function parsePlannerSlots(raw: unknown): ParseResult<PlannerSlots> {
  const obj = typeof raw === 'string' ? extractJsonObject(raw) : raw;
  if (obj === null) return { ok: false, issues: [] };
  return parseWith(PlannerSlots, obj);
}

// re-exported for callers that want the literal type name `z` available
export { z };

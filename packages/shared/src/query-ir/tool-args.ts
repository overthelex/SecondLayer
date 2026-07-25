/**
 * query-ir/tool-args.ts — canonical Zod schemas for LLM tool-call arguments.
 *
 * The V3 chat pipeline lets the model self-select tools and emit their
 * arguments directly (there is no classifier/planner slot layer in V3). These
 * schemas validate those raw model-produced arguments at the tool-execution
 * boundary: enum/date/range violations and unknown (injected/unsupported)
 * fields are rejected with a clean error the model can act on — so the model
 * never believes an unsupported filter was applied. The SQL layer is already
 * parameterized via buildWhere(); this is the upstream defense-in-depth +
 * correctness guard.
 *
 * Numerics are coerced (model occasionally emits "2" for 2) so well-formed but
 * loosely-typed calls are not needlessly rejected; booleans are NOT coerced
 * (z.coerce.boolean("false") === true is a footgun).
 */
import { z } from 'zod';
import { PartyRole } from './enums';

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

/** Valid EDRSR judgment-form codes (Вирок/Постанова/Рішення/Ухвала/…). */
const JUDGMENT_CODES = [1, 2, 3, 5, 6, 7, 10] as const;

const MILITARY_PRESETS = [
  'awol', 'desertion', 'insubordination', 'disobedience', 'draft_evasion',
  'self_harm', 'negligence', 'abuse_of_power', 'looting', 'all_military',
] as const;

const KUPAP_PRESETS = [
  'traffic_dui', 'traffic_accident', 'domestic_violence', 'hooliganism',
  'drugs_alcohol', 'admin_oversight', 'child_neglect', 'petty_theft',
  'border_crossing', 'quarantine', 'tax_violations', 'no_license', 'all_kupap',
] as const;

/**
 * Arguments for the `search_court_decisions` (EDRSR unified search) tool.
 * `.strict()` → unknown keys fail validation (injection guard + prevents the
 * model from silently relying on unsupported filters); invalid enum/date/range
 * values fail too, so the caller can surface a clean error to the model.
 */
export const EdsrSearchArgs = z.object({
  mode: z.enum(['structured', 'exact', 'fulltext', 'hybrid', 'semantic']),
  query: z.string().max(2000).optional(),
  party_name: z.string().max(200).optional(),
  party_role: PartyRole.optional(),
  cause_num: z.string().max(64).optional(),
  judge: z.string().max(200).optional(),
  court_code: z.coerce.number().int().positive().optional(),
  court_name: z.string().max(200).optional(),
  justice_kind: z.coerce.number().int().min(1).max(5).optional(),
  judgment_code: z.coerce
    .number()
    .int()
    .refine((v) => (JUDGMENT_CODES as readonly number[]).includes(v), {
      message: 'invalid judgment_code (allowed: 1,2,3,5,6,7,10)',
    })
    .optional(),
  category_code: z.coerce.number().int().positive().optional(),
  date_from: ISO_DATE.optional(),
  date_to: ISO_DATE.optional(),
  instance_code: z.coerce.number().int().min(1).max(3).optional(),
  court_level: z.enum(['all', 'SC', 'GrandChamber']).optional(),
  military_preset: z.enum(MILITARY_PRESETS).optional(),
  kupap_preset: z.enum(KUPAP_PRESETS).optional(),
  include_fulltext: z.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  oversample: z.coerce.number().int().min(1).max(5).optional(),
  rrf_k: z.coerce.number().int().positive().optional(),
}).strict();
export type EdsrSearchArgs = z.infer<typeof EdsrSearchArgs>;

import type { ParseResult } from './parse';
import { parseWith } from './parse';

/**
 * Validate raw `search_court_decisions` arguments. Never throws — returns
 * { ok:false, issues } on invalid enum/date/range so the handler can reject
 * with a clean, model-actionable message. Unknown fields are stripped.
 */
export function parseEdsrSearchArgs(raw: unknown): ParseResult<EdsrSearchArgs> {
  return parseWith(EdsrSearchArgs, raw);
}

/**
 * query-ir/slots.ts — canonical slot-IR for safe query generation.
 *
 * The single intermediate representation that sits between the LLM
 * (reformulator / planner / intent-classifier) and the query-builder.
 * Every value is constrained by the whitelists in ./enums; z.strictObject
 * DROPS any field the LLM invents — this is the injection guard that lets us
 * trust the IR downstream without re-checking each field.
 *
 * Downstream consumers (keep slot names stable):
 *   - mcp_backend buildWhere(FieldDef[], ir)         → SQL / tsquery
 *   - secondlayer-core filterTools(domains, slots)   → reads edrpou,
 *       case_number, registry_tool_hint to inject tools
 */
import { z } from 'zod';
import {
  ProcedureCode,
  ProcedureCodeUA,
  DesiredOutput,
  CourtLevel,
  PartyRole,
  JudgmentCode,
  JusticeKind,
  SectionType,
  QueryType,
} from './enums';

/** YYYY-MM-DD (kept as a regex to stay zod-v4-API-agnostic). */
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

/** Monetary claim flags (mirror of money_terms in the planner). */
export const MoneyTerms = z.strictObject({
  penalty: z.boolean().optional(),
  inflation: z.boolean().optional(),
  three_percent: z.boolean().optional(),
  legal_fees: z.boolean().optional(),
});
export type MoneyTerms = z.infer<typeof MoneyTerms>;

/**
 * CourtSearchIR — canonical EDRSR/court search slots.
 * Unifies EdsrFtsFilters (mcp_backend) + planner slots into one schema.
 */
export const CourtSearchIR = z.strictObject({
  // free-text query variants (produced by the reformulator)
  query_semantic: z.string().min(3).max(2000).optional(),
  query_fts: z.string().min(2).max(2000).optional(),

  // structured filters (all whitelisted)
  procedure_code: ProcedureCode.optional(),
  court_level: CourtLevel.optional(),
  justice_kind: JusticeKind.optional(),
  judgment_code: JudgmentCode.optional(),
  category_code: z.number().int().positive().optional(),
  court_code: z.number().int().positive().optional(),
  instance_code: z.number().int().positive().optional(),

  judge: z.string().max(200).optional(),
  date_from: IsoDate.optional(),
  date_to: IsoDate.optional(),

  party_name: z.string().max(200).optional(),
  party_role: PartyRole.optional(),

  section_focus: z.array(SectionType).max(9).optional(),
  money_terms: MoneyTerms.optional(),

  // preset resolves to a hardcoded category_code[] in the backend preset
  // registry (KUPAP_PRESETS / MILITARY_PRESETS) AFTER validation.
  preset: z.string().max(64).optional(),
});
export type CourtSearchIR = z.infer<typeof CourtSearchIR>;

/**
 * ClassifierSlots — entity slots the chat layer extracts and filterTools()
 * consumes. Kept separate from CourtSearchIR because these drive tool
 * selection, not the SQL WHERE clause. Slot NAMES must not change.
 */
export const ClassifierSlots = z.strictObject({
  edrpou: z.string().regex(/^\d{8,10}$/).optional(),
  case_number: z.string().max(64).optional(),
  law_reference: z.string().max(200).optional(),
  registry_tool_hint: z.string().max(64).optional(),
});
export type ClassifierSlots = z.infer<typeof ClassifierSlots>;

/**
 * PlannerSlots — canonical model of the chat QueryPlanner slot bag
 * (secondlayer-core query-planner.ts). DISTINCT from CourtSearchIR: this uses
 * the Ukrainian procedure-code convention and carries planner-only fields
 * (case_category, law_article, desired_output). Validate the planner's slots
 * AFTER its alias-normalization step (normalizeCourtLevel etc.) — z.strictObject
 * then drops any unknown slot the LLM invented.
 */
export const PlannerSlots = z.strictObject({
  procedure_code: ProcedureCodeUA.optional(),
  court_level: CourtLevel.optional(),
  case_category: z.string().max(200).optional(),
  law_article: z.string().max(200).optional(),
  section_focus: z.array(SectionType).max(9).optional(),
  money_terms: MoneyTerms.optional(),
  desired_output: DesiredOutput.optional(),
});
export type PlannerSlots = z.infer<typeof PlannerSlots>;

/**
 * IntentIR — full output of the planner/intent-classifier.
 * Wraps the query type + domains + both slot bags.
 */
export const IntentIR = z.strictObject({
  query_type: QueryType,
  confidence: z.number().min(0).max(1).default(0.7),
  domains: z.array(z.string()).default(['court']),
  keywords: z.string().optional(),
  search: CourtSearchIR.optional(),
  slots: ClassifierSlots.optional(),
});
export type IntentIR = z.infer<typeof IntentIR>;

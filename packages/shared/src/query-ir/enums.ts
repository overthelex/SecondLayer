/**
 * query-ir/enums.ts — canonical whitelists for safe query generation.
 *
 * Single source of truth for every constrained value a query slot may take.
 * Declared as Zod enums so the SAME definition enforces constraints at runtime
 * (validating LLM/user output) and at compile time (via z.infer).
 *
 * Migrate the scattered duplicates here and re-export, then delete the originals:
 *   - mcp_backend/src/types/index.ts            (CourtLevel, ProcedureCode union)
 *   - mcp_backend/src/api/tool-utils.ts         (mapProcedureCodeToJusticeKind)
 *   - mcp_backend/src/services/edrsr-fts-service.ts (PartyRole)
 *   - secondlayer-core chat-system-prompt.ts    (VALID_QUERY_TYPES Set)
 */
import { z } from 'zod';

/** Procedure code → maps to justice_kind 1..4 (see PROCEDURE_TO_JUSTICE_KIND). */
export const ProcedureCode = z.enum(['cpc', 'crpc', 'gpc', 'cac']);
export type ProcedureCode = z.infer<typeof ProcedureCode>;

/** Court instance level (normalized; aliases resolved before validation). */
export const CourtLevel = z.enum([
  'first_instance',
  'appeal',
  'cassation',
  'SC',
  'GrandChamber',
]);
export type CourtLevel = z.infer<typeof CourtLevel>;

/** Party role for FTS party-name anchoring. */
export const PartyRole = z.enum(['plaintiff', 'defendant', 'any']);
export type PartyRole = z.infer<typeof PartyRole>;

/** EDRSR judgment_code whitelist: 1=Вирок 2=Постанова 3=Рішення 5=Ухвала
 *  6=Окрема ухвала 7=Додаткове рішення 10=Окрема думка. */
export const JudgmentCode = z.enum(['1', '2', '3', '5', '6', '7', '10']);
export type JudgmentCode = z.infer<typeof JudgmentCode>;

/** justice_kind: 1=цивільне 2=кримінальне 3=господарське 4=адмін 5=адмін-правопорушення. */
export const JusticeKind = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export type JusticeKind = z.infer<typeof JusticeKind>;

/** Document section markers (mirror of SectionType in semantic-sectionizer). */
export const SectionType = z.enum([
  'HEADER',
  'FACTS',
  'CLAIMS',
  'PROCEDURAL_HISTORY',
  'LAW_REFERENCES',
  'MOTIVES',
  'COURT_REASONING',
  'DECISION',
  'AMOUNTS',
]);
export type SectionType = z.infer<typeof SectionType>;

/** Chat query type (replaces VALID_QUERY_TYPES Set in secondlayer-core). */
export const QueryType = z.enum([
  'case_lookup',
  'practice_analysis',
  'legislation_lookup',
  'legal_consultation',
  'registry_lookup',
  'parliament_query',
  'document_query',
  'calculation',
  'document_drafting',
  'comparative_analysis',
  'due_diligence',
  'institutional_analysis',
  'osint_investigation',
  'unsupported',
]);
export type QueryType = z.infer<typeof QueryType>;

/** Procedure code → justice_kind. Replaces mapProcedureCodeToJusticeKind. */
export const PROCEDURE_TO_JUSTICE_KIND: Record<ProcedureCode, JusticeKind> = {
  cpc: 1,
  crpc: 2,
  gpc: 3,
  cac: 4,
};

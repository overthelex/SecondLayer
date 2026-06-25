/**
 * @secondlayer/shared/query-ir — safe query generation layer.
 *
 * slot-IR (Zod) + whitelist + (downstream) query-builder. The deterministic,
 * DB-free pattern that replaces SHACL-style validation for input queries.
 *
 * Pipeline:
 *   LLM (reformulate/plan) → JSON
 *     → parseCourtSearchIR / parseIntentIR   [Zod .strictObject, enum whitelist]
 *     → CourtSearchIR / IntentIR             [canonical slot-IR]
 *     → resolvePresets() (backend)           [preset → category_code[]]
 *     → buildWhere(FieldDef[], ir) (backend) [parameterized $N, no interpolation]
 *     → SQL / tsquery / Qdrant filter
 *
 * See Plane LEXAI-1771 (this module + builder) and CORE-50 (wire into core).
 */
export * from './enums';
export * from './slots';
export * from './parse';
export * from './field-def';
export * from './build-where';
export * from './tool-args';

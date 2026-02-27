/**
 * Shared constants for the chat pipeline modules.
 */

/** Budget-aware limits: deep analysis needs much more context */
export const BUDGET_LIMITS = {
  quick:    { maxResultChars: 6000,   maxContextChars: 48_000,  maxTokens: 4096,  maxToolCalls: 5,  resolutionSlice: 120 },
  standard: { maxResultChars: 8000,   maxContextChars: 64_000,  maxTokens: 8192,  maxToolCalls: 7,  resolutionSlice: 300 },
  deep:     { maxResultChars: 40_000, maxContextChars: 100_000, maxTokens: 16384, maxToolCalls: 20, resolutionSlice: 800 },
} as const;

export type BudgetKey = keyof typeof BUDGET_LIMITS;
export type BudgetLimits = typeof BUDGET_LIMITS[BudgetKey];

/** Regex to match Ukrainian case numbers (e.g. 922/123/24) */
export const CASE_NUMBER_REGEX = /\d+\/\d+\/\d{2,4}/g;

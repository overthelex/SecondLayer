import { useMemo } from 'react';
import { Target, Play } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ExecutionPlan, PlanStep } from '../types/models/Message';
import { getToolLabel } from '../hooks/chat/tool-labels';
import { useCurrencyRate } from '../hooks/useCurrencyRate';

interface PlanReviewDisplayProps {
  plan: ExecutionPlan;
  onConfirm: (approvedPlan: ExecutionPlan) => void;
  onSkip: () => void;
  isLoading?: boolean;
}

/** Fallback cost estimates (USD) per single tool call at standard tier. */
const FALLBACK_COST: Record<string, number> = {
  search_legal_precedents:         0.05,
  search_supreme_court_practice:   0.05,
  find_similar_fact_pattern_cases: 0.04,
  compare_practice_pro_contra:     0.05,
  search_legislation:              0.03,
  find_relevant_law_articles:      0.03,
  search_procedural_norms:         0.03,
  get_court_decision:              0.04,
  get_case_documents_chain:        0.05,
  get_legislation_article:         0.02,
  get_legislation_structure:       0.01,
  load_full_texts:                 0.06,
  semantic_search:                 0.03,
  list_documents:                  0.01,
  count_cases_by_party:            0.02,
};
const FALLBACK_DEFAULT = 0.04;
const FALLBACK_OVERHEAD = 0.14;

const FALLBACK_TYPICAL_CALLS: Record<string, number> = {
  get_court_decision:    4,
  load_full_texts:       2,
  get_legislation_article: 2,
};
const DEFAULT_CALLS = 1;

function getStepCalls(step: PlanStep): number {
  return step.estimatedCalls ?? FALLBACK_TYPICAL_CALLS[step.tool] ?? DEFAULT_CALLS;
}

function getStepCost(step: PlanStep): number {
  if (step.estimatedCost != null) return step.estimatedCost;
  const cost = FALLBACK_COST[step.tool] || FALLBACK_DEFAULT;
  return cost * getStepCalls(step);
}

export function PlanReviewDisplay({ plan, onConfirm, onSkip, isLoading }: PlanReviewDisplayProps) {
  const { formatUah } = useCurrencyRate();

  const handleConfirm = () => {
    onConfirm(plan);
  };

  const overheadCost = plan.overheadCost ?? FALLBACK_OVERHEAD;
  const totalCost = useMemo(() => overheadCost + plan.steps.reduce((sum, s) => sum + getStepCost(s), 0), [plan.steps, overheadCost]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="my-3 border border-zinc-200/80 rounded-lg overflow-hidden bg-white max-h-[70vh] flex flex-col shadow-sm"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200/60 bg-zinc-50">
        <div className="flex items-start gap-2.5">
          <div className="p-1 bg-zinc-900 rounded flex-shrink-0 mt-0.5">
            <Target size={11} className="text-white" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <span className="text-[12.5px] text-zinc-900 font-medium leading-snug block">
              {plan.goal}
            </span>
            <p className="text-[10.5px] text-zinc-400 mt-0.5 font-medium">
              {plan.steps.length} кроків · ~{formatUah(totalCost)}
            </p>
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="px-4 py-2 space-y-0.5 overflow-y-auto flex-1 min-h-0 divide-y divide-zinc-100">
        {plan.steps.map((step) => (
          <div
            key={step.id}
            className="flex items-center gap-2.5 py-2.5"
          >
            <span className="text-[10px] text-zinc-300 font-mono w-4 flex-shrink-0 text-right tabular-nums">
              {step.id}
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-[12.5px] text-zinc-800 leading-snug">
                {step.purpose}
              </span>
              <span className="text-[10px] text-zinc-400 ml-1.5 font-medium">
                {getToolLabel(step.tool)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-zinc-200/60 bg-zinc-50/70 flex-shrink-0">
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onSkip}
            disabled={isLoading}
            className="text-[11px] text-zinc-400 hover:text-zinc-700 transition-colors font-medium px-2 py-1"
          >
            Пропустити
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-900 text-white rounded-md text-[11.5px] font-semibold hover:bg-zinc-800 transition-colors duration-150 disabled:opacity-50"
          >
            <Play size={10} strokeWidth={2.5} />
            Виконати
          </button>
        </div>
      </div>
    </motion.div>
  );
}

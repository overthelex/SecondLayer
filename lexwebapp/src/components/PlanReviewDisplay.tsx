import { useState, useMemo } from 'react';
import { Target, Zap, Search, Play } from 'lucide-react';
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

/** Tools that support depth differentiation (search tools with configurable limits) */
const DEPTH_CAPABLE_TOOLS = new Set([
  'search_legal_precedents',
  'search_supreme_court_practice',
  'find_similar_fact_pattern_cases',
  'compare_practice_pro_contra',
  'search_legislation',
  'find_relevant_law_articles',
  'search_procedural_norms',
]);

/** Fallback cost estimates (USD) per single tool call at each budget tier.
 *  standard → Sonnet 4.6, deep → Opus 4.6 (5x more expensive).
 *  Calibrated from production cost_tracking data. */
const FALLBACK_COST: Record<string, { standard: number; deep: number }> = {
  search_legal_precedents:         { standard: 0.05, deep: 0.40 },
  search_supreme_court_practice:   { standard: 0.05, deep: 0.40 },
  find_similar_fact_pattern_cases: { standard: 0.04, deep: 0.30 },
  compare_practice_pro_contra:     { standard: 0.05, deep: 0.40 },
  search_legislation:              { standard: 0.03, deep: 0.25 },
  find_relevant_law_articles:      { standard: 0.03, deep: 0.25 },
  search_procedural_norms:         { standard: 0.03, deep: 0.25 },
  get_court_decision:              { standard: 0.04, deep: 0.30 },
  get_case_documents_chain:        { standard: 0.05, deep: 0.35 },
  get_legislation_article:         { standard: 0.02, deep: 0.15 },
  get_legislation_structure:       { standard: 0.01, deep: 0.10 },
  load_full_texts:                 { standard: 0.06, deep: 0.50 },
  semantic_search:                 { standard: 0.03, deep: 0.25 },
  list_documents:                  { standard: 0.01, deep: 0.10 },
  count_cases_by_party:            { standard: 0.02, deep: 0.15 },
};
const FALLBACK_DEFAULT = { standard: 0.04, deep: 0.30 };
const FALLBACK_OVERHEAD: Record<string, number> = { standard: 0.14, deep: 0.70 };

/** Typical number of tool invocations per plan step (must match backend TYPICAL_CALLS) */
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
  const depth = step.depth || 'standard';
  if (step.estimatedCost != null) return step.estimatedCost;
  // Fallback: per-call cost × typical calls
  const costs = FALLBACK_COST[step.tool] || FALLBACK_DEFAULT;
  const calls = getStepCalls(step);
  return costs[depth] * calls;
}

export function PlanReviewDisplay({ plan, onConfirm, onSkip, isLoading }: PlanReviewDisplayProps) {
  const { formatUah } = useCurrencyRate();
  const [steps, setSteps] = useState<PlanStep[]>(
    // Use recommendedDepth from backend (LLM-chosen) as the default
    plan.steps.map(s => ({
      ...s,
      depth: s.recommendedDepth || s.depth || 'standard',
    }))
  );

  // Recalculate all step costs based on effective budget tier.
  // Any deep step OR 5+ steps → all iterations use Opus (deep tier).
  const recalcSteps = (newSteps: PlanStep[]): PlanStep[] => {
    const hasDeep = newSteps.some(s => s.depth === 'deep');
    const tier: 'standard' | 'deep' = (hasDeep || newSteps.length >= 5) ? 'deep' : 'standard';
    return newSteps.map(s => {
      const costs = FALLBACK_COST[s.tool] || FALLBACK_DEFAULT;
      const calls = getStepCalls(s);
      return { ...s, estimatedCost: costs[tier] * calls };
    });
  };

  const toggleDepth = (stepId: number) => {
    setSteps(prev => {
      const toggled = prev.map(s =>
        s.id === stepId ? { ...s, depth: (s.depth === 'deep' ? 'standard' : 'deep') as 'standard' | 'deep' } : s
      );
      return recalcSteps(toggled);
    });
  };

  const setAllDeep = () => {
    setSteps(prev => recalcSteps(prev.map(s =>
      DEPTH_CAPABLE_TOOLS.has(s.tool) ? { ...s, depth: 'deep' as const } : s
    )));
  };

  const setAllStandard = () => {
    setSteps(prev => recalcSteps(prev.map(s => ({ ...s, depth: 'standard' as const }))));
  };

  const handleConfirm = () => {
    onConfirm({ ...plan, steps });
  };

  const deepCount = steps.filter(s => s.depth === 'deep').length;
  // Effective tier determines overhead + per-step costs
  const effectiveTier: 'standard' | 'deep' = (deepCount > 0 || steps.length >= 5) ? 'deep' : 'standard';
  const overheadCost = plan.overheadCost ?? (FALLBACK_OVERHEAD[effectiveTier] || FALLBACK_OVERHEAD.standard);
  const totalCost = useMemo(() => overheadCost + steps.reduce((sum, s) => sum + getStepCost(s), 0), [steps, overheadCost]);

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
              Оберіть глибину аналізу для кожного кроку
            </p>
          </div>
        </div>
      </div>

      {/* Steps — scrollable on mobile when many steps */}
      <div className="px-4 py-2 space-y-0.5 overflow-y-auto flex-1 min-h-0 divide-y divide-zinc-100">
        {steps.map((step) => {
          const isDepthCapable = DEPTH_CAPABLE_TOOLS.has(step.tool);
          const isDeep = step.depth === 'deep';
          const cost = getStepCost(step);
          const calls = getStepCalls(step);
          const isRecommended = step.recommendedDepth && step.depth === step.recommendedDepth;

          return (
            <div
              key={step.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-3 py-2.5"
            >
              <div className="flex items-start gap-2.5 flex-1 min-w-0">
                <span className="text-[10px] text-zinc-300 font-mono mt-0.5 w-4 flex-shrink-0 text-right tabular-nums">
                  {step.id}
                </span>
                <div className="min-w-0">
                  <span className="text-[12.5px] text-zinc-800 leading-snug">
                    {step.purpose}
                  </span>
                  <span className="text-[10px] text-zinc-400 ml-1.5 font-medium">
                    {getToolLabel(step.tool)}
                  </span>
                </div>
              </div>

              {/* Cost + Depth toggle */}
              <div className="flex items-center gap-2 flex-shrink-0 pl-6 sm:pl-0">
                <span className="text-[10px] text-zinc-400 font-mono tabular-nums w-[56px] text-right" title={calls > 1 ? `~${calls} викликів` : undefined}>
                  {formatUah(cost)}{calls > 1 && <span className="text-zinc-300 ml-0.5">×{calls}</span>}
                </span>

                {isDepthCapable ? (
                  <button
                    onClick={() => toggleDepth(step.id)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold tracking-tight transition-all duration-150 min-w-[100px] justify-center border ${
                      isDeep
                        ? 'bg-zinc-900 text-white border-zinc-900 hover:bg-zinc-800'
                        : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300 hover:text-zinc-900'
                    } ${isRecommended ? 'ring-1 ring-offset-1 ring-zinc-400' : ''}`}
                  >
                    {isDeep ? (
                      <>
                        <Search size={9} strokeWidth={2.5} />
                        Глибокий
                      </>
                    ) : (
                      <>
                        <Zap size={9} strokeWidth={2.5} />
                        Стандартний
                      </>
                    )}
                  </button>
                ) : (
                  <span className="text-[10px] text-zinc-300 min-w-[100px] text-center px-2 font-medium">
                    фіксований
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer: bulk actions + total cost + confirm */}
      <div className="px-4 py-3 border-t border-zinc-200/60 bg-zinc-50/70 flex-shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={setAllDeep}
              className="text-[10.5px] text-zinc-500 hover:text-zinc-900 transition-colors font-medium"
            >
              Усі глибокі
            </button>
            <span className="text-zinc-300 text-xs">·</span>
            <button
              onClick={setAllStandard}
              className="text-[10.5px] text-zinc-500 hover:text-zinc-900 transition-colors font-medium"
            >
              Стандартні
            </button>
            {deepCount > 0 && (
              <span className="text-[10px] text-zinc-500 bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 rounded font-medium">
                {deepCount} глибоких
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-zinc-500 font-mono tabular-nums font-medium">
              ~{formatUah(totalCost)}
            </span>
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
              {isLoading ? 'Запуск...' : 'Почати аналіз'}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

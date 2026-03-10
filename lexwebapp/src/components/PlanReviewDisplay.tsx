import { useState, useMemo } from 'react';
import { Target, Zap, Search, Play } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ExecutionPlan, PlanStep } from '../types/models/Message';
import { getToolLabel } from '../hooks/chat/tool-labels';

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

/** Fallback cost estimates when backend doesn't provide them (USD) */
const FALLBACK_COST: Record<string, { standard: number; deep: number }> = {
  search_legal_precedents:         { standard: 0.008, deep: 0.025 },
  search_supreme_court_practice:   { standard: 0.008, deep: 0.025 },
  find_similar_fact_pattern_cases: { standard: 0.005, deep: 0.015 },
  compare_practice_pro_contra:     { standard: 0.008, deep: 0.025 },
  search_legislation:              { standard: 0.004, deep: 0.012 },
  find_relevant_law_articles:      { standard: 0.004, deep: 0.010 },
  search_procedural_norms:         { standard: 0.004, deep: 0.010 },
  get_court_decision:              { standard: 0.005, deep: 0.005 },
  get_case_documents_chain:        { standard: 0.010, deep: 0.010 },
  get_legislation_article:         { standard: 0.003, deep: 0.003 },
  get_legislation_structure:       { standard: 0.002, deep: 0.002 },
  load_full_texts:                 { standard: 0.008, deep: 0.008 },
  semantic_search:                 { standard: 0.004, deep: 0.004 },
  list_documents:                  { standard: 0.002, deep: 0.002 },
  count_cases_by_party:            { standard: 0.003, deep: 0.003 },
};
const FALLBACK_DEFAULT = { standard: 0.004, deep: 0.004 };

function getStepCost(step: PlanStep): number {
  const depth = step.depth || 'standard';
  if (step.estimatedCost != null) return step.estimatedCost;
  const costs = FALLBACK_COST[step.tool] || FALLBACK_DEFAULT;
  return costs[depth];
}

function formatCost(usd: number): string {
  if (usd < 0.001) return '<$0.001';
  return `$${usd.toFixed(3)}`;
}

export function PlanReviewDisplay({ plan, onConfirm, onSkip, isLoading }: PlanReviewDisplayProps) {
  const [steps, setSteps] = useState<PlanStep[]>(
    // Use recommendedDepth from backend (LLM-chosen) as the default
    plan.steps.map(s => ({
      ...s,
      depth: s.recommendedDepth || s.depth || 'standard',
    }))
  );

  const toggleDepth = (stepId: number) => {
    setSteps(prev =>
      prev.map(s => {
        if (s.id !== stepId) return s;
        const newDepth = s.depth === 'deep' ? 'standard' : 'deep';
        // Recalculate cost when depth changes
        const costs = FALLBACK_COST[s.tool] || FALLBACK_DEFAULT;
        return { ...s, depth: newDepth, estimatedCost: costs[newDepth] };
      })
    );
  };

  const setAllDeep = () => {
    setSteps(prev => prev.map(s => {
      if (!DEPTH_CAPABLE_TOOLS.has(s.tool)) return s;
      const costs = FALLBACK_COST[s.tool] || FALLBACK_DEFAULT;
      return { ...s, depth: 'deep', estimatedCost: costs.deep };
    }));
  };

  const setAllStandard = () => {
    setSteps(prev => prev.map(s => {
      const costs = FALLBACK_COST[s.tool] || FALLBACK_DEFAULT;
      return { ...s, depth: 'standard', estimatedCost: costs.standard };
    }));
  };

  const handleConfirm = () => {
    onConfirm({ ...plan, steps });
  };

  const deepCount = steps.filter(s => s.depth === 'deep').length;
  const totalCost = useMemo(() => steps.reduce((sum, s) => sum + getStepCost(s), 0), [steps]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="my-3 border border-claude-border rounded-lg overflow-hidden bg-white"
    >
      {/* Header */}
      <div className="p-3 border-b border-claude-border/30 bg-claude-bg/30">
        <div className="flex items-center gap-2">
          <Target size={14} className="text-claude-text flex-shrink-0" strokeWidth={2} />
          <span className="text-[13px] text-claude-text font-medium">
            {plan.goal}
          </span>
        </div>
        <p className="text-[11px] text-claude-subtext mt-1">
          Оберіть глибину аналізу для кожного кроку
        </p>
      </div>

      {/* Steps */}
      <div className="p-3 space-y-2">
        {steps.map((step) => {
          const isDepthCapable = DEPTH_CAPABLE_TOOLS.has(step.tool);
          const isDeep = step.depth === 'deep';
          const cost = getStepCost(step);
          const isRecommended = step.recommendedDepth && step.depth === step.recommendedDepth;

          return (
            <div
              key={step.id}
              className="flex items-center justify-between gap-3 py-1.5"
            >
              <div className="flex items-start gap-2 flex-1 min-w-0">
                <span className="text-[11px] text-claude-subtext/60 font-mono mt-0.5 w-4 flex-shrink-0 text-right">
                  {step.id}
                </span>
                <div className="min-w-0">
                  <span className="text-[13px] text-claude-text leading-relaxed">
                    {step.purpose}
                  </span>
                  <span className="text-[11px] text-claude-subtext/60 ml-1.5">
                    {getToolLabel(step.tool)}
                  </span>
                </div>
              </div>

              {/* Cost + Depth toggle */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[10px] text-claude-subtext/50 font-mono tabular-nums w-[50px] text-right">
                  {formatCost(cost)}
                </span>

                {isDepthCapable ? (
                  <button
                    onClick={() => toggleDepth(step.id)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors min-w-[105px] justify-center ${
                      isDeep
                        ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    } ${isRecommended ? 'ring-1 ring-offset-1 ring-blue-300' : ''}`}
                  >
                    {isDeep ? (
                      <>
                        <Search size={10} strokeWidth={2.5} />
                        Глибокий
                      </>
                    ) : (
                      <>
                        <Zap size={10} strokeWidth={2.5} />
                        Стандартний
                      </>
                    )}
                  </button>
                ) : (
                  <span className="text-[11px] text-claude-subtext/40 min-w-[105px] text-center px-2">
                    фіксований
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer: bulk actions + total cost + confirm */}
      <div className="p-3 border-t border-claude-border/30 bg-claude-bg/20 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={setAllDeep}
            className="text-[11px] text-claude-subtext hover:text-claude-text transition-colors"
          >
            Усі глибокі
          </button>
          <span className="text-[11px] text-claude-subtext/30">|</span>
          <button
            onClick={setAllStandard}
            className="text-[11px] text-claude-subtext hover:text-claude-text transition-colors"
          >
            Усі стандартні
          </button>
          {deepCount > 0 && (
            <span className="text-[11px] text-amber-600 ml-1">
              ({deepCount} глибоких)
            </span>
          )}
          <span className="text-[11px] text-claude-subtext/30 ml-1">|</span>
          <span className="text-[11px] text-claude-subtext font-mono tabular-nums">
            ~{formatCost(totalCost)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onSkip}
            disabled={isLoading}
            className="text-[11px] text-claude-subtext hover:text-claude-text transition-colors px-2 py-1"
          >
            Пропустити
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-claude-text text-white rounded-md text-[12px] font-medium hover:bg-claude-text/90 transition-colors disabled:opacity-50"
          >
            <Play size={11} strokeWidth={2.5} />
            {isLoading ? 'Запуск...' : 'Почати аналіз'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

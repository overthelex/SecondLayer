import { useState } from 'react';
import { Target, Zap, Search, Play } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ExecutionPlan, PlanStep } from '../types/models/Message';

interface PlanReviewDisplayProps {
  plan: ExecutionPlan;
  onConfirm: (approvedPlan: ExecutionPlan) => void;
  onSkip: () => void;
  isLoading?: boolean;
}

const TOOL_LABELS: Record<string, string> = {
  search_legal_precedents: 'Пошук прецедентів',
  search_supreme_court_practice: 'Практика ВС',
  get_court_decision: 'Отримання рішення',
  get_case_documents_chain: 'Ланцюг документів',
  find_similar_fact_pattern_cases: 'Схожі справи',
  compare_practice_pro_contra: 'Аналіз за і проти',
  load_full_texts: 'Повні тексти рішень',
  search_legislation: 'Пошук законодавства',
  get_legislation_article: 'Стаття закону',
  get_legislation_articles: 'Статті закону',
  get_legislation_section: 'Розділ закону',
  find_relevant_law_articles: 'Релевантні статті',
  search_procedural_norms: 'Процесуальні норми',
  semantic_search: 'Семантичний пошук',
  openreyestr_search_entities: 'Пошук юросіб',
  openreyestr_get_entity_details: 'Деталі юрособи',
  openreyestr_get_by_edrpou: 'Пошук за ЄДРПОУ',
  rada_search_parliament_bills: 'Законопроекти Ради',
  rada_get_deputy_info: 'Інфо про депутата',
};

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

function getToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] || toolName;
}

export function PlanReviewDisplay({ plan, onConfirm, onSkip, isLoading }: PlanReviewDisplayProps) {
  const [steps, setSteps] = useState<PlanStep[]>(
    plan.steps.map(s => ({ ...s, depth: s.depth || 'standard' }))
  );

  const toggleDepth = (stepId: number) => {
    setSteps(prev =>
      prev.map(s =>
        s.id === stepId
          ? { ...s, depth: s.depth === 'deep' ? 'standard' : 'deep' }
          : s
      )
    );
  };

  const setAllDeep = () => {
    setSteps(prev => prev.map(s => ({
      ...s,
      depth: DEPTH_CAPABLE_TOOLS.has(s.tool) ? 'deep' : s.depth,
    })));
  };

  const setAllStandard = () => {
    setSteps(prev => prev.map(s => ({ ...s, depth: 'standard' })));
  };

  const handleConfirm = () => {
    onConfirm({ ...plan, steps });
  };

  const deepCount = steps.filter(s => s.depth === 'deep').length;

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

              {/* Depth toggle */}
              {isDepthCapable ? (
                <button
                  onClick={() => toggleDepth(step.id)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors flex-shrink-0 ${
                    isDeep
                      ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
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
                <span className="text-[11px] text-claude-subtext/40 flex-shrink-0 px-2">
                  фіксований
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer: bulk actions + confirm */}
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

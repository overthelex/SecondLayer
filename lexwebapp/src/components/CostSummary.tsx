import { useState, useCallback } from 'react';
import { ChevronDown, Coins, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CostSummary as CostSummaryType } from '../types/models/Message';
import { getToolLabel } from '../hooks/chat/tool-labels';
import { useCurrencyRate } from '../hooks/useCurrencyRate';
import { useMiscT } from '../i18n/misc-i18n';
import { ShareControl } from './ShareControl';

interface CostSummaryProps {
  data: CostSummaryType;
}

export function CostSummary({ data }: CostSummaryProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const { formatUah } = useCurrencyRate();
  const { t } = useMiscT();

  const copyRequestId = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!data.response_id) return;
    navigator.clipboard.writeText(data.response_id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [data.response_id]);

  const displayCostUsd = data.charged_usd != null && Number(data.charged_usd) > 0
    ? Number(data.charged_usd)
    : Number(data.total_cost_usd) > 0
      ? Number(data.total_cost_usd)
      : 0;

  return (
    <div className="mt-3">
      <div className="flex items-center gap-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[12px] text-claude-subtext hover:text-claude-text transition-colors"
      >
        <Coins size={12} strokeWidth={2} />
        <span>
          {displayCostUsd > 0
            ? formatUah(displayCostUsd)
            : '0.00 \u20B4'}
        </span>
        {data.response_id && (
          <button
            onClick={copyRequestId}
            className="inline-flex items-center gap-1 text-claude-subtext/60 font-mono hover:text-claude-text transition-colors"
            title={t('copyRequestId')}
          >
            {data.response_id}
            {copied ? <Check size={10} strokeWidth={2} /> : <Copy size={10} strokeWidth={2} />}
          </button>
        )}
        <ChevronDown
          size={12}
          className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
          strokeWidth={2}
        />
      </button>

        <ShareControl responseId={data.response_id} />
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 px-3 py-2.5 rounded-lg border border-claude-border/50 bg-claude-bg/40 text-[12px] text-claude-subtext space-y-1.5">
              {/* Tools used */}
              {data.tools_used && data.tools_used.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  <span className="font-medium text-claude-text">{t('tools')}</span>
                  {data.tools_used.map((tool) => (
                    <span
                      key={tool}
                      className="px-1.5 py-0.5 rounded bg-claude-subtext/8 text-[11px]"
                    >
                      {getToolLabel(tool)}
                    </span>
                  ))}
                </div>
              )}

              {/* Search-leg breakdown (FTS vs Qdrant) */}
              {data.search_stats &&
                (data.search_stats.fts > 0 ||
                  data.search_stats.qdrant > 0 ||
                  (data.search_stats.structured ?? 0) > 0) && (
                <div className="pt-0.5">
                  <span className="font-medium text-claude-text">{t('searchBreakdown')}</span>
                  <table className="mt-1 w-full max-w-[280px] text-[11px]">
                    <thead>
                      <tr className="text-claude-subtext/70">
                        <th className="text-left font-normal pb-0.5">{t('searchKind')}</th>
                        <th className="text-right font-normal pb-0.5">{t('searchCount')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.search_stats.fts > 0 && (
                        <tr className="border-t border-claude-border/30">
                          <td className="py-0.5">{t('searchFts')}</td>
                          <td className="py-0.5 text-right tabular-nums">{data.search_stats.fts}</td>
                        </tr>
                      )}
                      {data.search_stats.qdrant > 0 && (
                        <tr className="border-t border-claude-border/30">
                          <td className="py-0.5">{t('searchQdrant')}</td>
                          <td className="py-0.5 text-right tabular-nums">{data.search_stats.qdrant}</td>
                        </tr>
                      )}
                      {(data.search_stats.structured ?? 0) > 0 && (
                        <tr className="border-t border-claude-border/30">
                          <td className="py-0.5">{t('searchStructured')}</td>
                          <td className="py-0.5 text-right tabular-nums">{data.search_stats.structured}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Cost breakdown */}
              <div className="flex items-center gap-3 flex-wrap">
                {Number(data.total_cost_usd) > 0 && (
                  <span>{t('llmCost')} {formatUah(Number(data.total_cost_usd))}</span>
                )}
                {data.charged_usd != null && Number(data.charged_usd) > 0 && (
                  <span>{t('charged')} {formatUah(Number(data.charged_usd))}</span>
                )}
                {data.balance_usd != null && (
                  <span>{t('balance')} {formatUah(Number(data.balance_usd))}</span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

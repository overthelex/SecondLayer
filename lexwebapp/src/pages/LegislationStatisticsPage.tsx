import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Activity } from
'lucide-react';
interface LegislationStatisticsPageProps {
  onBack?: () => void;
}
export function LegislationStatisticsPage({
  onBack
}: LegislationStatisticsPageProps) {
  const [_period, _setPeriod] = useState('2024');
  const [_convocation, _setConvocation] = useState('ix');
  const [_showComparison, _setShowComparison] = useState(false);
  const [_comparisonMetric, _setComparisonMetric] = useState('approved');
  return (
    <div className="flex-1 h-full overflow-y-auto bg-claude-bg p-4 md:p-8 lg:p-12 pb-32">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <motion.div
          initial={{
            opacity: 0,
            y: 20
          }}
          animate={{
            opacity: 1,
            y: 0
          }}
          transition={{
            duration: 0.5,
            ease: [0.22, 1, 0.36, 1]
          }}>

          <div className="flex items-center gap-4 mb-6">
            {onBack &&
            <button
              onClick={onBack}
              className="p-2 hover:bg-white rounded-lg transition-colors border border-claude-border">

                <ArrowLeft size={20} className="text-claude-text" />
              </button>
            }
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <Activity size={32} className="text-claude-accent" />
                <h1 className="text-3xl md:text-4xl font-sans text-claude-text font-medium tracking-tight">
                  Статистика законодавчої діяльності
                </h1>
              </div>
              <p className="text-claude-subtext font-sans text-sm">
                Аналіз ефективності прийняття законів
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>);

}
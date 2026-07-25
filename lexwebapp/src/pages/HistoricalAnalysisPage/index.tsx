import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ScrollText,
  BookOpen,
  BarChart3,
  RefreshCw,
  Clock,
} from 'lucide-react';
import type { HistoricalAnalysisPageProps, TabId } from './types';
import { TimelineTab } from './TimelineTab';
import { StatisticsTab } from './StatisticsTab';
import { ComparisonTab } from './ComparisonTab';
import { ArticleTab } from './ArticleTab';

const tabs = [
  { id: 'timeline' as TabId, label: 'Timeline', icon: Clock },
  { id: 'statistics' as TabId, label: 'Статистика', icon: BarChart3 },
  { id: 'comparison' as TabId, label: 'Порівняння', icon: RefreshCw },
  { id: 'article' as TabId, label: 'Історія статті', icon: ScrollText },
];

export function HistoricalAnalysisPage({ onBack }: HistoricalAnalysisPageProps) {
  const [_searchQuery, _setSearchQuery] = useState('');
  const [selectedLaw] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('timeline');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [comparisonA, setComparisonA] = useState('33');
  const [comparisonB, setComparisonB] = useState('1');
  const [displayMode, setDisplayMode] = useState<'side-by-side' | 'unified'>(
    'side-by-side'
  );
  const [showAdded, setShowAdded] = useState(true);
  const [showDeleted, setShowDeleted] = useState(true);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [expandedVersions, setExpandedVersions] = useState<number[]>([7]);

  const toggleVersion = (version: number) => {
    setExpandedVersions((prev) =>
      prev.includes(version)
        ? prev.filter((v) => v !== version)
        : [...prev, version]
    );
  };

  if (selectedLaw) {
    return (
      <div className="flex-1 h-full overflow-y-auto bg-claude-bg p-4 md:p-8 lg:p-12 pb-32">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-4 mb-6">
              {onBack && (
                <button
                  onClick={onBack}
                  className="p-2 hover:bg-white rounded-lg transition-colors border border-claude-border"
                >
                  <ArrowLeft size={20} className="text-claude-text" />
                </button>
              )}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <ScrollText size={32} className="text-claude-accent" />
                  <h1 className="text-2xl md:text-3xl font-sans text-claude-text font-medium">
                    Історія редакцій: Конституція України
                  </h1>
                </div>
                <p className="text-sm text-claude-subtext font-sans">
                  254к/96-ВР від 28.06.1996
                </p>
              </div>
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-2xl border border-claude-border shadow-sm overflow-hidden mb-6">
              <div className="flex border-b border-claude-border overflow-x-auto">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium font-sans transition-colors relative whitespace-nowrap ${
                        activeTab === tab.id
                          ? 'text-claude-accent bg-claude-accent/5'
                          : 'text-claude-subtext hover:text-claude-text hover:bg-claude-bg'
                      }`}
                    >
                      <Icon size={16} />
                      {tab.label}
                      {activeTab === tab.id && (
                        <motion.div
                          layoutId="activeHistoricalTab"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-claude-accent"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="p-6">
                <AnimatePresence mode="wait">
                  {activeTab === 'timeline' && (
                    <TimelineTab
                      periodFilter={periodFilter}
                      setPeriodFilter={setPeriodFilter}
                      typeFilter={typeFilter}
                      setTypeFilter={setTypeFilter}
                    />
                  )}

                  {activeTab === 'statistics' && <StatisticsTab />}

                  {activeTab === 'comparison' && (
                    <ComparisonTab
                      comparisonA={comparisonA}
                      setComparisonA={setComparisonA}
                      comparisonB={comparisonB}
                      setComparisonB={setComparisonB}
                      displayMode={displayMode}
                      setDisplayMode={setDisplayMode}
                      showAdded={showAdded}
                      setShowAdded={setShowAdded}
                      showDeleted={showDeleted}
                      setShowDeleted={setShowDeleted}
                      showUnchanged={showUnchanged}
                      setShowUnchanged={setShowUnchanged}
                    />
                  )}

                  {activeTab === 'article' && (
                    <ArticleTab
                      expandedVersions={expandedVersions}
                      toggleVersion={toggleVersion}
                    />
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full overflow-y-auto bg-claude-bg p-4 md:p-8 lg:p-12 pb-32">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex items-center gap-4 mb-6">
            {onBack && (
              <button
                onClick={onBack}
                className="p-2 hover:bg-white rounded-lg transition-colors border border-claude-border"
              >
                <ArrowLeft size={20} className="text-claude-text" />
              </button>
            )}
            <div>
              <div className="flex items-center gap-3 mb-2">
                <BookOpen size={32} className="text-claude-accent" />
                <h1 className="text-3xl md:text-4xl font-sans text-claude-text font-medium tracking-tight">
                  Історичний аналіз законодавства України
                </h1>
              </div>
              <p className="text-claude-subtext font-sans text-sm">
                Відстеження еволюції законів та кодексів
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

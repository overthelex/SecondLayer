import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, ArrowLeft, Download } from 'lucide-react';
import { GeneralTab } from './GeneralTab';
import { FactionsTab } from './FactionsTab';
import { RegionsTab } from './RegionsTab';
import { HistoryTab } from './HistoryTab';

interface BillDetailViewProps {
  onBack: () => void;
}

const tabs = [
  { id: 'general', label: 'Загальне', icon: '\u{1F4CA}' },
  { id: 'factions', label: 'По фракціям', icon: '\u{1F465}' },
  { id: 'regions', label: 'По регіонах', icon: '\u{1F4CD}' },
  { id: 'history', label: 'Історія', icon: '\u{23F1}\uFE0F' },
] as const;

type TabId = (typeof tabs)[number]['id'];

export function BillDetailView({ onBack }: BillDetailViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>('general');

  return (
    <div className="flex-1 h-full overflow-y-auto bg-claude-bg p-4 md:p-8 lg:p-12 pb-32">
      <div className="max-w-7xl mx-auto space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="p-2 hover:bg-white rounded-lg transition-colors border border-claude-border"
              >
                <ArrowLeft size={20} className="text-claude-text" />
              </button>
              <div>
                <h1 className="text-2xl md:text-3xl font-sans text-claude-text font-medium mb-1">
                  Законопроект №8234-IX "Про Державний бюджет України"
                </h1>
                <p className="text-sm text-claude-subtext font-sans">
                  Голосування від 15.12.2025, 14:35
                </p>
              </div>
            </div>
          </div>

          {/* Result Badge */}
          <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-4 mb-6">
            <div className="flex items-center gap-3">
              <CheckCircle size={32} className="text-green-600" />
              <div>
                <p className="text-xl font-serif font-bold text-green-700">
                  ПРИЙНЯТО
                </p>
                <p className="text-sm text-green-600 font-sans">
                  301 голос за, необхідно 226
                </p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-2xl border border-claude-border shadow-sm overflow-hidden mb-6">
            <div className="flex border-b border-claude-border overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium font-sans transition-colors relative whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'text-claude-accent bg-claude-accent/5'
                      : 'text-claude-subtext hover:text-claude-text hover:bg-claude-bg'
                  }`}
                >
                  <span>{tab.icon}</span>
                  {tab.label}
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="activeVotingTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-claude-accent"
                    />
                  )}
                </button>
              ))}
            </div>

            <div className="p-6">
              <AnimatePresence mode="wait">
                {activeTab === 'general' && <GeneralTab />}
                {activeTab === 'factions' && <FactionsTab />}
                {activeTab === 'regions' && <RegionsTab />}
                {activeTab === 'history' && <HistoryTab />}
              </AnimatePresence>
            </div>
          </div>

          {/* Export Button */}
          <button className="flex items-center gap-2 px-4 py-2 bg-claude-accent text-white rounded-xl text-sm font-medium font-sans hover:bg-[#C66345] transition-colors shadow-sm">
            <Download size={16} />
            Експорт
          </button>
        </motion.div>
      </div>
    </div>
  );
}

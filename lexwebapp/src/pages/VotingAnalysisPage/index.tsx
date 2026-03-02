import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Vote } from 'lucide-react';
import type { VotingAnalysisPageProps } from './types';
import { BillDetailView } from './BillDetailView';
import { VotingSearch } from './VotingSearch';

export function VotingAnalysisPage({ onBack }: VotingAnalysisPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBill, setSelectedBill] = useState(false);
  const [votingType, setVotingType] = useState('all');
  const [resultFilter, setResultFilter] = useState('all');

  if (selectedBill) {
    return <BillDetailView onBack={() => setSelectedBill(false)} />;
  }

  return (
    <div className="flex-1 h-full overflow-y-auto bg-claude-bg p-4 md:p-8 lg:p-12 pb-32">
      <div className="max-w-6xl mx-auto space-y-6">
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
                <Vote size={32} className="text-claude-accent" />
                <h1 className="text-3xl md:text-4xl font-sans text-claude-text font-medium tracking-tight">
                  Аналіз голосувань
                </h1>
              </div>
              <p className="text-claude-subtext font-sans text-sm">
                Детальний аналіз голосувань по важливих законопроектах
              </p>
            </div>
          </div>

          <VotingSearch
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            votingType={votingType}
            onVotingTypeChange={setVotingType}
            resultFilter={resultFilter}
            onResultFilterChange={setResultFilter}
            onSelectBill={() => setSelectedBill(true)}
          />
        </motion.div>
      </div>
    </div>
  );
}

import { Fragment } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { votingHistory } from './types';

export function HistoryTab() {
  return (
    <motion.div
      key="history"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6"
    >
      <div className="text-center mb-6">
        <p className="text-sm text-claude-subtext font-sans mb-4">
          Законопроект №8234-IX пройшов 4 голосування
        </p>
        <div className="flex items-center justify-center gap-2">
          {votingHistory.map((vote, index) => (
            <Fragment key={vote.id}>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: index * 0.1 }}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold font-sans ${
                  vote.result === 'approved'
                    ? 'bg-green-500 text-white'
                    : 'bg-red-500 text-white'
                }`}
              >
                {vote.id}
              </motion.div>
              {index < votingHistory.length - 1 && (
                <div className="w-12 h-0.5 bg-claude-border"></div>
              )}
            </Fragment>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {votingHistory.map((vote, index) => (
          <motion.div
            key={vote.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white rounded-xl border border-claude-border p-4"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                {vote.result === 'approved' ? (
                  <CheckCircle size={24} className="text-green-600" />
                ) : (
                  <XCircle size={24} className="text-red-600" />
                )}
                <div>
                  <h4 className="text-base font-serif font-medium text-claude-text">
                    {vote.type}
                  </h4>
                  <p className="text-sm text-claude-subtext font-sans">
                    {vote.date}
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-3">
              <div className="text-center p-2 bg-green-50 rounded">
                <p className="text-xs text-green-700 font-sans">За</p>
                <p className="text-lg font-serif font-bold text-green-700">
                  {vote.for}
                </p>
              </div>
              <div className="text-center p-2 bg-red-50 rounded">
                <p className="text-xs text-red-700 font-sans">Проти</p>
                <p className="text-lg font-serif font-bold text-red-700">
                  {vote.against}
                </p>
              </div>
              <div className="text-center p-2 bg-amber-50 rounded">
                <p className="text-xs text-amber-700 font-sans">Утрим.</p>
                <p className="text-lg font-serif font-bold text-amber-700">
                  {vote.abstain}
                </p>
              </div>
              <div className="text-center p-2 bg-gray-50 rounded">
                <p className="text-xs text-gray-700 font-sans">Не гол.</p>
                <p className="text-lg font-serif font-bold text-gray-700">
                  {vote.notVoted}
                </p>
              </div>
            </div>
            {vote.result === 'rejected' && (
              <div className="flex items-center gap-2 p-2 bg-red-50 rounded text-sm text-red-700 font-sans">
                <AlertCircle size={16} />
                Не набрано необхідної кількості
              </div>
            )}
            <div className="flex gap-2 mt-3">
              <button className="px-3 py-1.5 text-xs font-medium font-sans text-claude-text bg-claude-bg hover:bg-claude-border rounded-lg transition-colors">
                Деталі
              </button>
              <button className="px-3 py-1.5 text-xs font-medium font-sans text-claude-text bg-claude-bg hover:bg-claude-border rounded-lg transition-colors">
                Порівняти
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
        <h4 className="text-sm font-medium text-blue-900 font-sans mb-2">
          Депутати, які змінили позицію
        </h4>
        <p className="text-sm text-blue-800 font-sans mb-3">
          3 спроба → 4 спроба: 67 депутатів
        </p>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 text-xs font-medium font-sans text-blue-700 bg-white hover:bg-blue-100 rounded-lg transition-colors">
            Показати список
          </button>
          <button className="px-3 py-1.5 text-xs font-medium font-sans text-blue-700 bg-white hover:bg-blue-100 rounded-lg transition-colors">
            Аналіз причин
          </button>
        </div>
      </div>
    </motion.div>
  );
}

import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, TrendingUp } from 'lucide-react';
import { votingResult } from './types';

export function GeneralTab() {
  const [deputySearch, setDeputySearch] = useState('');

  const total =
    votingResult.for +
    votingResult.against +
    votingResult.abstain +
    votingResult.notVoted;
  const forPercentage = Math.round((votingResult.for / total) * 100);
  const againstPercentage = Math.round((votingResult.against / total) * 100);
  const abstainPercentage = Math.round((votingResult.abstain / total) * 100);
  const notVotedPercentage = Math.round((votingResult.notVoted / total) * 100);

  return (
    <motion.div
      key="general"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6"
    >
      {/* Gauge Visualization */}
      <div className="flex flex-col items-center">
        <div className="relative w-full max-w-md h-48 mb-6">
          <svg viewBox="0 0 200 120" className="w-full h-full">
            {/* Background arc */}
            <path
              d="M 20 100 A 80 80 0 0 1 180 100"
              fill="none"
              stroke="#E5E5E0"
              strokeWidth="20"
              strokeLinecap="round"
            />
            {/* For arc */}
            <motion.path
              initial={{ pathLength: 0 }}
              animate={{ pathLength: forPercentage / 100 }}
              transition={{ duration: 1, ease: 'easeOut' }}
              d="M 20 100 A 80 80 0 0 1 180 100"
              fill="none"
              stroke="#22c55e"
              strokeWidth="20"
              strokeLinecap="round"
            />
            <text
              x="100"
              y="90"
              textAnchor="middle"
              className="text-3xl font-serif font-bold fill-claude-text"
            >
              {votingResult.for}
            </text>
            <text
              x="100"
              y="110"
              textAnchor="middle"
              className="text-xs fill-claude-subtext font-sans"
            >
              голосів ЗА
            </text>
          </svg>
        </div>

        {/* Results Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
          <div className="p-4 bg-green-50 rounded-xl border border-green-200">
            <p className="text-xs text-green-700 font-sans mb-1">ЗА</p>
            <p className="text-2xl font-serif font-bold text-green-700">
              {votingResult.for}
            </p>
            <p className="text-xs text-green-600 font-sans">{forPercentage}%</p>
          </div>
          <div className="p-4 bg-red-50 rounded-xl border border-red-200">
            <p className="text-xs text-red-700 font-sans mb-1">ПРОТИ</p>
            <p className="text-2xl font-serif font-bold text-red-700">
              {votingResult.against}
            </p>
            <p className="text-xs text-red-600 font-sans">{againstPercentage}%</p>
          </div>
          <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
            <p className="text-xs text-amber-700 font-sans mb-1">УТРИМАЛИСЯ</p>
            <p className="text-2xl font-serif font-bold text-amber-700">
              {votingResult.abstain}
            </p>
            <p className="text-xs text-amber-600 font-sans">{abstainPercentage}%</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
            <p className="text-xs text-gray-700 font-sans mb-1">НЕ ГОЛОСУВАЛИ</p>
            <p className="text-2xl font-serif font-bold text-gray-700">
              {votingResult.notVoted}
            </p>
            <p className="text-xs text-gray-600 font-sans">{notVotedPercentage}%</p>
          </div>
        </div>
      </div>

      {/* Quorum Info */}
      <div className="flex items-center justify-between p-4 bg-claude-bg rounded-xl border border-claude-border">
        <div>
          <p className="text-sm text-claude-subtext font-sans mb-1">
            Присутні:{' '}
            <span className="font-medium text-claude-text">
              435 / 450 депутатів (97%)
            </span>
          </p>
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-green-600" />
            <p className="text-sm font-medium text-green-600 font-sans">
              Кворум забезпечено
            </p>
          </div>
        </div>
      </div>

      {/* Interesting Facts */}
      <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
        <h4 className="text-sm font-medium text-blue-900 font-sans mb-3 flex items-center gap-2">
          <TrendingUp size={16} />
          Цікаві факти
        </h4>
        <ul className="space-y-2 text-sm text-blue-800 font-sans">
          <li>
            • Найвища дисципліна: "Європейська солідарність" (98%)
          </li>
          <li>• Найнижча дисципліна: Позафракційні (32%)</li>
          <li>• "Переходів" (голос проти лінії фракції): 23</li>
        </ul>
      </div>

      {/* Deputy Search */}
      <div>
        <label className="block text-sm font-medium text-claude-text font-sans mb-2">
          Пошук голосу конкретного депутата
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={deputySearch}
            onChange={(e) => setDeputySearch(e.target.value)}
            placeholder="Введіть ПІБ депутата..."
            className="flex-1 px-4 py-2.5 bg-white border border-claude-border rounded-lg text-claude-text placeholder-claude-subtext/50 focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent transition-all font-sans"
          />
          <button className="px-4 py-2.5 bg-claude-accent text-white rounded-lg font-medium hover:bg-[#C66345] transition-colors font-sans">
            Знайти
          </button>
        </div>
      </div>
    </motion.div>
  );
}

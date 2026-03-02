import { motion } from 'framer-motion';
import { TrendingUp, PieChart as PieChartIcon, Download, Printer } from 'lucide-react';
import { yearlyChanges, topSections, changeTypes } from './types';

const maxChanges = Math.max(...yearlyChanges.map((y) => y.count));

export function StatisticsTab() {
  return (
    <motion.div
      key="statistics"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6"
    >
      {/* Yearly Changes Chart */}
      <div className="bg-white rounded-2xl border border-claude-border shadow-sm p-6">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp size={20} className="text-claude-accent" />
          <h3 className="text-lg font-sans text-claude-text font-medium">
            Динаміка змін за роками
          </h3>
        </div>
        <div className="h-64 flex items-end gap-4 px-4 mb-4">
          {yearlyChanges.map((data, index) => (
            <div
              key={data.year}
              className="flex-1 flex flex-col items-center gap-2"
            >
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${(data.count / maxChanges) * 100}%` }}
                transition={{ duration: 0.5, delay: index * 0.05 }}
                className="w-full bg-claude-accent rounded-t hover:bg-[#C66345] transition-colors cursor-pointer relative group"
              >
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-claude-text text-white px-2 py-1 rounded text-xs font-sans opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {data.count} змін
                </div>
              </motion.div>
              <span className="text-xs text-claude-subtext font-sans">
                {data.year}
              </span>
            </div>
          ))}
        </div>
        <p className="text-sm text-claude-subtext font-sans text-center">
          Пік змін: 2004 рік (47 статей)
        </p>
      </div>

      {/* Top Sections */}
      <div className="bg-white rounded-2xl border border-claude-border shadow-sm p-6">
        <h3 className="text-lg font-sans text-claude-text font-medium mb-4">
          🎯 Найчастіше змінювані розділи
        </h3>
        <div className="space-y-3">
          {topSections.map((section, index) => (
            <motion.div
              key={section.name}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex items-center justify-between p-3 bg-claude-bg rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-claude-accent text-white flex items-center justify-center text-xs font-bold font-sans">
                  {index + 1}
                </div>
                <span className="text-sm text-claude-text font-sans">
                  {section.name}
                </span>
              </div>
              <span className="text-sm font-medium text-claude-accent font-sans">
                {section.changes} змін
              </span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Change Types */}
      <div className="bg-white rounded-2xl border border-claude-border shadow-sm p-6">
        <div className="flex items-center gap-2 mb-6">
          <PieChartIcon size={20} className="text-claude-accent" />
          <h3 className="text-lg font-sans text-claude-text font-medium">
            Типи змін
          </h3>
        </div>
        <div className="space-y-3">
          {changeTypes.map((type, index) => (
            <motion.div
              key={type.type}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-3 flex-1">
                <div
                  className={`w-4 h-4 rounded bg-gradient-to-br ${type.color}`}
                ></div>
                <span className="text-sm text-claude-text font-sans">
                  {type.type}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-32 h-2 bg-claude-bg rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${type.percentage}%` }}
                    transition={{ duration: 0.8, delay: index * 0.05 }}
                    className={`h-full bg-gradient-to-r ${type.color}`}
                  />
                </div>
                <span className="text-sm font-medium text-claude-text font-sans w-12 text-right">
                  {type.percentage}%
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Frequency Stats */}
      <div className="bg-white rounded-2xl border border-claude-border shadow-sm p-6">
        <h3 className="text-lg font-sans text-claude-text font-medium mb-4">
          ⏱️ Середня частота змін
        </h3>
        <div className="space-y-2 text-sm font-sans">
          <p className="text-claude-text">
            • 1996-2004:{' '}
            <span className="font-medium">1 зміна на 2.7 років</span>
          </p>
          <p className="text-claude-text">
            • 2004-2010:{' '}
            <span className="font-medium">1 зміна на 1.2 року</span>
          </p>
          <p className="text-claude-text">
            • 2010-2020:{' '}
            <span className="font-medium">1 зміна на 0.8 років</span>
          </p>
        </div>
      </div>

      {/* Export Buttons */}
      <div className="flex gap-3">
        <button className="flex items-center gap-2 px-4 py-2 bg-claude-accent text-white rounded-xl text-sm font-medium font-sans hover:bg-[#C66345] transition-colors shadow-sm">
          <Download size={16} />
          Експорт звіту
        </button>
        <button className="flex items-center gap-2 px-4 py-2 bg-white border border-claude-border text-claude-text rounded-xl text-sm font-medium font-sans hover:bg-claude-bg transition-colors">
          <Printer size={16} />
          Друк
        </button>
      </div>
    </motion.div>
  );
}

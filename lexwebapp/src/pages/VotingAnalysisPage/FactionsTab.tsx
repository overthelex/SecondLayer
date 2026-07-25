import { motion } from 'framer-motion';
import { factionVoting } from './types';

export function FactionsTab() {
  return (
    <motion.div
      key="factions"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6"
    >
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-claude-bg border-b border-claude-border">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-claude-subtext uppercase tracking-wider font-sans">
                Фракція
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-claude-subtext uppercase tracking-wider font-sans">
                За
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-claude-subtext uppercase tracking-wider font-sans">
                Проти
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-claude-subtext uppercase tracking-wider font-sans">
                Утрим.
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-claude-subtext uppercase tracking-wider font-sans">
                Не гол.
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-claude-border">
            {factionVoting.map((faction, index) => (
              <motion.tr
                key={faction.name}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="hover:bg-claude-bg transition-colors"
              >
                <td className="px-4 py-3 text-sm font-medium text-claude-text font-sans">
                  {faction.name}
                </td>
                <td className="px-4 py-3 text-sm text-center text-green-600 font-sans font-medium">
                  {faction.for}
                </td>
                <td className="px-4 py-3 text-sm text-center text-red-600 font-sans font-medium">
                  {faction.against}
                </td>
                <td className="px-4 py-3 text-sm text-center text-amber-600 font-sans font-medium">
                  {faction.abstain}
                </td>
                <td className="px-4 py-3 text-sm text-center text-gray-600 font-sans font-medium">
                  {faction.notVoted}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Stacked Bar Chart */}
      <div>
        <h4 className="text-sm font-medium text-claude-text font-sans mb-4">
          Візуалізація по фракціям
        </h4>
        <div className="space-y-3">
          {factionVoting.map((faction, index) => {
            const forPct = (faction.for / faction.total) * 100;
            const againstPct = (faction.against / faction.total) * 100;
            const abstainPct = (faction.abstain / faction.total) * 100;
            const notVotedPct = (faction.notVoted / faction.total) * 100;
            return (
              <div key={faction.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-claude-text font-sans">
                    {faction.name}
                  </span>
                  <span className="text-xs text-claude-subtext font-sans">
                    {faction.total} депутатів
                  </span>
                </div>
                <div className="h-8 bg-gray-100 rounded-lg overflow-hidden flex">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${forPct}%` }}
                    transition={{ duration: 0.8, delay: index * 0.05 }}
                    className="bg-green-500 hover:bg-green-600 transition-colors cursor-pointer relative group"
                  >
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-white font-sans font-medium opacity-0 group-hover:opacity-100">
                      {faction.for}
                    </div>
                  </motion.div>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${againstPct}%` }}
                    transition={{ duration: 0.8, delay: index * 0.05 + 0.1 }}
                    className="bg-red-500 hover:bg-red-600 transition-colors cursor-pointer relative group"
                  >
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-white font-sans font-medium opacity-0 group-hover:opacity-100">
                      {faction.against}
                    </div>
                  </motion.div>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${abstainPct}%` }}
                    transition={{ duration: 0.8, delay: index * 0.05 + 0.2 }}
                    className="bg-amber-500 hover:bg-amber-600 transition-colors cursor-pointer relative group"
                  >
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-white font-sans font-medium opacity-0 group-hover:opacity-100">
                      {faction.abstain}
                    </div>
                  </motion.div>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${notVotedPct}%` }}
                    transition={{ duration: 0.8, delay: index * 0.05 + 0.3 }}
                    className="bg-gray-400 hover:bg-gray-500 transition-colors cursor-pointer relative group"
                  >
                    <div className="absolute inset-0 flex items-center justify-center text-xs text-white font-sans font-medium opacity-0 group-hover:opacity-100">
                      {faction.notVoted}
                    </div>
                  </motion.div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-claude-border">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500 rounded"></div>
            <span className="text-xs text-claude-subtext font-sans">За</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded"></div>
            <span className="text-xs text-claude-subtext font-sans">Проти</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-amber-500 rounded"></div>
            <span className="text-xs text-claude-subtext font-sans">Утрималися</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-400 rounded"></div>
            <span className="text-xs text-claude-subtext font-sans">Не голосували</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

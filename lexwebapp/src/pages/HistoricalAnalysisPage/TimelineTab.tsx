import { motion } from 'framer-motion';
import { Download, Eye } from 'lucide-react';
import { revisions } from './types';

interface TimelineTabProps {
  periodFilter: string;
  setPeriodFilter: (value: string) => void;
  typeFilter: string;
  setTypeFilter: (value: string) => void;
}

export function TimelineTab({
  periodFilter,
  setPeriodFilter,
  typeFilter,
  setTypeFilter,
}: TimelineTabProps) {
  return (
    <motion.div
      key="timeline"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6"
    >
      {/* Stats */}
      <div className="flex items-center justify-between p-4 bg-claude-bg rounded-xl border border-claude-border">
        <div>
          <p className="text-sm text-claude-subtext font-sans mb-1">
            Всього редакцій:{' '}
            <span className="font-medium text-claude-text">33</span>{' '}
            (з 1996 по 2020 рік)
          </p>
          <p className="text-sm text-claude-subtext font-sans">
            Остання зміна:{' '}
            <span className="font-medium text-claude-text">01.01.2020</span>{' '}
            (підстава: 27-IX)
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-claude-text font-sans mb-2">
            Період
          </label>
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            className="w-full px-4 py-2.5 bg-white border border-claude-border rounded-lg text-claude-text focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent transition-all font-sans"
          >
            <option value="all">Весь час</option>
            <option value="recent">Останні 5 років</option>
            <option value="decade">Остання декада</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-claude-text font-sans mb-2">
            Тип змін
          </label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full px-4 py-2.5 bg-white border border-claude-border rounded-lg text-claude-text focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent transition-all font-sans"
          >
            <option value="all">Усі зміни</option>
            <option value="major">Значні зміни</option>
            <option value="editorial">Редакційні</option>
          </select>
        </div>
      </div>

      {/* Timeline Visualization */}
      <div className="bg-claude-bg rounded-xl border border-claude-border p-6">
        <h3 className="text-sm font-medium text-claude-text font-sans mb-4">
          Timeline (інтерактивний)
        </h3>
        <div className="relative h-24 mb-8">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-claude-border"></div>
          {[1996, 2000, 2004, 2010, 2014, 2020].map((year, index) => (
            <motion.div
              key={year}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className="absolute top-1/2 -translate-y-1/2 group cursor-pointer"
              style={{ left: `${(index / 5) * 100}%` }}
            >
              <div className="w-4 h-4 bg-claude-accent rounded-full border-2 border-white shadow-lg"></div>
              <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2">
                <p className="text-xs text-claude-subtext font-sans whitespace-nowrap">
                  {year}
                </p>
              </div>
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="bg-claude-text text-white px-3 py-2 rounded-lg text-xs font-sans whitespace-nowrap shadow-xl">
                  <p className="font-medium">
                    Редакція від {year === 1996 ? '28.06' : '01.01'}.{year}
                  </p>
                  <p className="text-white/80">
                    Підстава:{' '}
                    {year === 1996
                      ? 'Оригінал'
                      : `${Math.floor(Math.random() * 9000) + 1000}-${['IV', 'VII', 'VIII', 'IX'][Math.floor(Math.random() * 4)]}`}
                  </p>
                  <p className="text-white/80">
                    Змінено:{' '}
                    {year === 2004
                      ? 47
                      : Math.floor(Math.random() * 20)}{' '}
                    статей
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Revisions Table */}
      <div className="bg-white rounded-2xl border border-claude-border shadow-sm overflow-hidden">
        <div className="p-6 border-b border-claude-border">
          <h3 className="text-lg font-sans text-claude-text font-medium">
            Список редакцій
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-claude-bg border-b border-claude-border">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-claude-subtext uppercase tracking-wider font-sans">
                  №
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-claude-subtext uppercase tracking-wider font-sans">
                  Дата
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-claude-subtext uppercase tracking-wider font-sans">
                  Підстава
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-claude-subtext uppercase tracking-wider font-sans">
                  Зміни
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-claude-subtext uppercase tracking-wider font-sans">
                  Дії
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-claude-border">
              {revisions.map((revision, index) => (
                <motion.tr
                  key={revision.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="hover:bg-claude-bg transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-claude-text font-sans">
                    {revision.id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-claude-text font-sans">
                    {revision.date}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-claude-text font-sans">
                    {revision.basis}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-claude-subtext font-sans">
                    {revision.changes}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-1.5 text-claude-subtext hover:text-claude-text hover:bg-claude-bg rounded transition-colors">
                        <Eye size={16} />
                      </button>
                      <button className="p-1.5 text-claude-subtext hover:text-claude-text hover:bg-claude-bg rounded transition-colors">
                        <Download size={16} />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
}

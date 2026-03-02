import { motion } from 'framer-motion';
import { MapPin } from 'lucide-react';
import { regionalData } from './types';

export function RegionsTab() {
  return (
    <motion.div
      key="regions"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6"
    >
      <div className="bg-claude-bg rounded-xl border border-claude-border p-6">
        <div className="flex items-center gap-2 mb-4">
          <MapPin size={20} className="text-claude-accent" />
          <h4 className="text-sm font-medium text-claude-text font-sans">
            Карта голосувань по регіонах
          </h4>
        </div>
        <div className="aspect-video bg-white rounded-lg border border-claude-border flex items-center justify-center">
          <p className="text-claude-subtext font-sans text-sm">
            Інтерактивна карта України
          </p>
        </div>
        <div className="flex items-center justify-center gap-4 mt-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500 rounded"></div>
            <span className="text-xs text-claude-subtext font-sans">
              80-100% "За"
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-amber-500 rounded"></div>
            <span className="text-xs text-claude-subtext font-sans">
              50-80% "За"
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-orange-500 rounded"></div>
            <span className="text-xs text-claude-subtext font-sans">
              20-50% "За"
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded"></div>
            <span className="text-xs text-claude-subtext font-sans">
              0-20% "За"
            </span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-claude-bg border-b border-claude-border">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-claude-subtext uppercase tracking-wider font-sans">
                Область
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-claude-subtext uppercase tracking-wider font-sans">
                Депутатів
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
                % "За"
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-claude-border">
            {regionalData.map((region, index) => (
              <motion.tr
                key={region.region}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="hover:bg-claude-bg transition-colors"
              >
                <td className="px-4 py-3 text-sm font-medium text-claude-text font-sans">
                  {region.region}
                </td>
                <td className="px-4 py-3 text-sm text-center text-claude-text font-sans">
                  {region.deputies}
                </td>
                <td className="px-4 py-3 text-sm text-center text-green-600 font-sans font-medium">
                  {region.for}
                </td>
                <td className="px-4 py-3 text-sm text-center text-red-600 font-sans font-medium">
                  {region.against}
                </td>
                <td className="px-4 py-3 text-sm text-center text-amber-600 font-sans font-medium">
                  {region.abstain}
                </td>
                <td className="px-4 py-3 text-sm text-center font-sans">
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded font-medium ${
                      region.percentage >= 80
                        ? 'bg-green-100 text-green-700'
                        : region.percentage >= 50
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {region.percentage}%
                  </span>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

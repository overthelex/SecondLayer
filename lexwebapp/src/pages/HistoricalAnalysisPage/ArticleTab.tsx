import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { articleVersions } from './types';

interface ArticleTabProps {
  expandedVersions: number[];
  toggleVersion: (version: number) => void;
}

export function ArticleTab({ expandedVersions, toggleVersion }: ArticleTabProps) {
  return (
    <motion.div
      key="article"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6"
    >
      <div className="bg-claude-bg rounded-xl border border-claude-border p-4">
        <p className="text-sm text-claude-subtext font-sans">
          Ця стаття змінювалася{' '}
          <span className="font-medium text-claude-text">7 разів</span>{' '}
          з 1996 по 2020 рік
        </p>
      </div>

      {/* Article Timeline */}
      <div className="bg-white rounded-2xl border border-claude-border shadow-sm p-6">
        <div className="relative h-16 mb-8">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-claude-border"></div>
          {[1996, 2004, 2006, 2010, 2014, 2016, 2019, 2020].map(
            (year, index) => (
              <div
                key={year}
                className="absolute top-1/2 -translate-y-1/2"
                style={{ left: `${(index / 7) * 100}%` }}
              >
                <div className="w-3 h-3 bg-claude-accent rounded-full border-2 border-white"></div>
                <p className="absolute top-full mt-2 left-1/2 -translate-x-1/2 text-xs text-claude-subtext font-sans whitespace-nowrap">
                  {year}
                </p>
              </div>
            )
          )}
        </div>
      </div>

      {/* Version List */}
      <div className="space-y-4">
        {articleVersions.map((version) => (
          <div
            key={version.version}
            className="bg-white rounded-2xl border border-claude-border shadow-sm overflow-hidden"
          >
            <button
              onClick={() => toggleVersion(version.version)}
              className="w-full p-6 text-left hover:bg-claude-bg transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-base font-serif font-medium text-claude-text mb-1">
                    Версія {version.version}{' '}
                    {version.version === 7 && '(поточна)'}: від{' '}
                    {version.date}
                  </h4>
                  <p className="text-sm text-claude-subtext font-sans">
                    Підстава: {version.basis} • Зміни:{' '}
                    {version.changes}
                  </p>
                </div>
                {expandedVersions.includes(version.version) ? (
                  <ChevronUp size={20} className="text-claude-subtext" />
                ) : (
                  <ChevronDown size={20} className="text-claude-subtext" />
                )}
              </div>
            </button>
            <AnimatePresence>
              {expandedVersions.includes(version.version) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-6 pt-0 border-t border-claude-border">
                    <pre className="text-sm text-claude-text font-sans whitespace-pre-wrap bg-claude-bg p-4 rounded-lg">
                      {version.text}
                    </pre>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button className="px-4 py-2 bg-claude-accent text-white rounded-xl text-sm font-medium font-sans hover:bg-[#C66345] transition-colors shadow-sm">
          Показати всі версії
        </button>
        <button className="px-4 py-2 bg-white border border-claude-border text-claude-text rounded-xl text-sm font-medium font-sans hover:bg-claude-bg transition-colors">
          🔄 Порівняти версії
        </button>
      </div>
    </motion.div>
  );
}

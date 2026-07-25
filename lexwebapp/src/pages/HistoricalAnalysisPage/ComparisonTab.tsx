import { motion } from 'framer-motion';

interface ComparisonTabProps {
  comparisonA: string;
  setComparisonA: (value: string) => void;
  comparisonB: string;
  setComparisonB: (value: string) => void;
  displayMode: 'side-by-side' | 'unified';
  setDisplayMode: (value: 'side-by-side' | 'unified') => void;
  showAdded: boolean;
  setShowAdded: (value: boolean) => void;
  showDeleted: boolean;
  setShowDeleted: (value: boolean) => void;
  showUnchanged: boolean;
  setShowUnchanged: (value: boolean) => void;
}

export function ComparisonTab({
  comparisonA,
  setComparisonA,
  comparisonB,
  setComparisonB,
  displayMode,
  setDisplayMode,
  showAdded,
  setShowAdded,
  showDeleted,
  setShowDeleted,
  showUnchanged,
  setShowUnchanged,
}: ComparisonTabProps) {
  return (
    <motion.div
      key="comparison"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6"
    >
      {/* Comparison Controls */}
      <div className="bg-claude-bg rounded-xl border border-claude-border p-6 space-y-4">
        <h3 className="text-base font-sans text-claude-text font-medium mb-4">
          Оберіть редакції для порівняння
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-claude-text font-sans mb-2">
              Редакція А
            </label>
            <select
              value={comparisonA}
              onChange={(e) => setComparisonA(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-claude-border rounded-lg text-claude-text focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent transition-all font-sans"
            >
              <option value="33">01.01.2020 (№33)</option>
              <option value="32">03.09.2019 (№32)</option>
              <option value="31">07.02.2019 (№31)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-claude-text font-sans mb-2">
              Редакція Б
            </label>
            <select
              value={comparisonB}
              onChange={(e) => setComparisonB(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-claude-border rounded-lg text-claude-text focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent transition-all font-sans"
            >
              <option value="1">28.06.1996 (Оригінал)</option>
              <option value="30">21.02.2014 (№30)</option>
            </select>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-claude-text font-sans mb-2">
              Режим відображення
            </p>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  id="display-side-by-side"
                  name="displayMode"
                  type="radio"
                  value="side-by-side"
                  checked={displayMode === 'side-by-side'}
                  onChange={() => setDisplayMode('side-by-side')}
                  className="w-4 h-4 text-claude-accent focus:ring-claude-accent"
                />
                <span className="text-sm text-claude-text font-sans">
                  Side-by-side
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  id="display-unified"
                  name="displayMode"
                  type="radio"
                  value="unified"
                  checked={displayMode === 'unified'}
                  onChange={() => setDisplayMode('unified')}
                  className="w-4 h-4 text-claude-accent focus:ring-claude-accent"
                />
                <span className="text-sm text-claude-text font-sans">
                  Unified
                </span>
              </label>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-claude-text font-sans mb-2">
              Показати
            </p>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  id="show-added"
                  name="showAdded"
                  type="checkbox"
                  checked={showAdded}
                  onChange={(e) => setShowAdded(e.target.checked)}
                  className="w-4 h-4 rounded border-claude-border text-claude-accent focus:ring-claude-accent"
                />
                <span className="text-sm text-claude-text font-sans">
                  Додане
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  id="show-deleted"
                  name="showDeleted"
                  type="checkbox"
                  checked={showDeleted}
                  onChange={(e) => setShowDeleted(e.target.checked)}
                  className="w-4 h-4 rounded border-claude-border text-claude-accent focus:ring-claude-accent"
                />
                <span className="text-sm text-claude-text font-sans">
                  Видалене
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  id="show-unchanged"
                  name="showUnchanged"
                  type="checkbox"
                  checked={showUnchanged}
                  onChange={(e) => setShowUnchanged(e.target.checked)}
                  className="w-4 h-4 rounded border-claude-border text-claude-accent focus:ring-claude-accent"
                />
                <span className="text-sm text-claude-text font-sans">
                  Без змін
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Comparison Stats */}
      <div className="bg-white rounded-2xl border border-claude-border shadow-sm p-6">
        <h3 className="text-lg font-sans text-claude-text font-medium mb-4">
          Загальна статистика
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-claude-bg rounded-xl">
            <p className="text-xs text-claude-subtext font-sans mb-1">
              Змінено статей
            </p>
            <p className="text-2xl font-serif font-bold text-claude-text">
              89{' '}
              <span className="text-sm text-claude-subtext">/ 161</span>
            </p>
            <p className="text-xs text-claude-subtext font-sans">(55%)</p>
          </div>
          <div className="p-4 bg-green-50 rounded-xl border border-green-200">
            <p className="text-xs text-green-700 font-sans mb-1">Додано</p>
            <p className="text-2xl font-serif font-bold text-green-700">12</p>
          </div>
          <div className="p-4 bg-red-50 rounded-xl border border-red-200">
            <p className="text-xs text-red-700 font-sans mb-1">Виключено</p>
            <p className="text-2xl font-serif font-bold text-red-700">3</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
            <p className="text-xs text-gray-700 font-sans mb-1">Без змін</p>
            <p className="text-2xl font-serif font-bold text-gray-700">60</p>
            <p className="text-xs text-gray-600 font-sans">(37%)</p>
          </div>
        </div>
      </div>

      {/* Side-by-side Comparison */}
      {displayMode === 'side-by-side' && (
        <div className="bg-white rounded-2xl border border-claude-border shadow-sm overflow-hidden">
          <div className="grid grid-cols-2 divide-x divide-claude-border">
            <div className="p-6">
              <h4 className="text-sm font-medium text-claude-text font-sans mb-4">
                01.01.2020 (Редакція)
              </h4>
              <div className="space-y-4 text-sm font-sans">
                <div className="p-3 bg-green-50 border-l-4 border-green-500 rounded">
                  <p className="text-green-900">
                    Стаття 1. Україна є суверенна і незалежна
                    демократична, соціальна, правова держава.
                  </p>
                </div>
                <div className="p-3 bg-amber-50 border-l-4 border-amber-500 rounded">
                  <p className="text-amber-900">
                    Стаття 5. Носієм суверенітету і єдиним
                    джерелом влади в Україні є народ. Народ
                    здійснює владу безпосередньо і через органи
                    державної влади та органи місцевого
                    самоврядування.
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6">
              <h4 className="text-sm font-medium text-claude-text font-sans mb-4">
                28.06.1996 (Оригінал)
              </h4>
              <div className="space-y-4 text-sm font-sans">
                <div className="p-3 bg-gray-50 border-l-4 border-gray-300 rounded">
                  <p className="text-gray-700">
                    Стаття 1. Україна є суверенна і незалежна,
                    демократична, соціальна, правова держава.
                  </p>
                </div>
                <div className="p-3 bg-gray-50 border-l-4 border-gray-300 rounded">
                  <p className="text-gray-700">
                    Стаття 5. Носієм суверенітету і єдиним
                    джерелом влади в Україні є народ. Народ
                    здійснює владу безпосередньо і через органи
                    державної влади та органи місцевого
                    самоврядування.
                  </p>
                  <p className="text-gray-700 mt-2">
                    Право визначати і змінювати конституційний
                    лад в Україні належить виключно народу і не
                    може бути узурповане державою.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="p-4 bg-claude-bg border-t border-claude-border flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs font-sans">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded"></div>
                <span className="text-claude-subtext">Додано</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded"></div>
                <span className="text-claude-subtext">Видалено</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-amber-500 rounded"></div>
                <span className="text-claude-subtext">Змінено</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1.5 text-xs font-medium font-sans text-claude-text hover:bg-white rounded-lg transition-colors">
                ▲ Попередня зміна
              </button>
              <button className="px-3 py-1.5 text-xs font-medium font-sans text-claude-text hover:bg-white rounded-lg transition-colors">
                ▼ Наступна зміна
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

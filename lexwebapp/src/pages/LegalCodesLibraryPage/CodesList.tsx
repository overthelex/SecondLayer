import { motion } from 'framer-motion';
import {
  Search,
  Download,
  ArrowLeft,
  Loader2,
  Library,
  ScrollText,
  Building2,
  Folder,
  X,
} from 'lucide-react';
import { mainCodes, proceduralCodes, categories } from './types';
import type { SearchResult } from './types';

interface CodesListProps {
  onBack?: () => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  globalSearchResults: SearchResult[];
  setGlobalSearchResults: (results: SearchResult[]) => void;
  globalSearchLoading: boolean;
  globalSearchTotal: number;
  setGlobalSearchTotal: (total: number) => void;
  showAllCategories: boolean;
  setShowAllCategories: (show: boolean) => void;
  handleGlobalSearch: (query?: string) => void;
  handlePopularQuery: (query: string) => void;
  handleDownloadCode: (codeNumber: string, codeName: string) => void;
  handleCategorySearch: (category: string) => void;
  setSelectedCode: (code: string) => void;
  fetchArticle: (articleNumber: string) => void;
}

export function CodesList({
  onBack,
  searchQuery,
  setSearchQuery,
  globalSearchResults,
  setGlobalSearchResults,
  globalSearchLoading,
  globalSearchTotal,
  setGlobalSearchTotal,
  showAllCategories,
  setShowAllCategories,
  handleGlobalSearch,
  handlePopularQuery,
  handleDownloadCode,
  handleCategorySearch,
  setSelectedCode,
  fetchArticle,
}: CodesListProps) {
  return (
    <div className="flex-1 h-full overflow-y-auto bg-claude-bg p-4 md:p-8 lg:p-12 pb-32">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
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
                <Library size={32} className="text-claude-accent" />
                <h1 className="text-3xl md:text-4xl font-sans text-claude-text font-medium tracking-tight">
                  Бібліотека кодексів і законів України
                </h1>
              </div>
              <p className="text-claude-subtext font-sans text-sm">
                Швидкий доступ до нормативно-правових актів
              </p>
            </div>
          </div>

          {/* Quick Search */}
          <div className="bg-white rounded-2xl border border-claude-border shadow-sm p-6 mb-6">
            <label className="block text-sm font-medium text-claude-text font-sans mb-3 flex items-center gap-2">
              <Search size={16} />
              Швидкий пошук
            </label>
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1 group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-claude-subtext group-focus-within:text-claude-accent transition-colors" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleGlobalSearch()}
                  placeholder="Введіть назву кодексу або закону..."
                  className="block w-full pl-11 pr-4 py-3 bg-white border border-claude-border rounded-xl text-claude-text placeholder-claude-subtext/50 focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent transition-all shadow-sm font-sans"
                />
              </div>
              <button
                onClick={() => handleGlobalSearch()}
                disabled={globalSearchLoading || !searchQuery.trim()}
                className="px-6 py-3 bg-claude-accent text-white rounded-xl font-medium hover:bg-[#C66345] transition-colors shadow-sm font-sans disabled:opacity-50 flex items-center gap-2"
              >
                {globalSearchLoading && <Loader2 size={16} className="animate-spin" />}
                Пошук
              </button>
            </div>
            <div className="flex items-center gap-2 text-sm text-claude-subtext font-sans">
              <span>Популярні запити:</span>
              {['конституція', 'цпк', 'цк', 'кк', 'зку'].map((q) => (
                <button
                  key={q}
                  onClick={() => handlePopularQuery(q)}
                  className="text-claude-accent hover:text-[#C66345] font-medium"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Global Search Results */}
          {globalSearchResults.length > 0 && (
            <div className="bg-white rounded-2xl border border-claude-border shadow-sm p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-sans text-claude-text font-medium flex items-center gap-2">
                  <Search size={20} />
                  Результати пошуку ({globalSearchTotal})
                </h3>
                <button
                  onClick={() => { setGlobalSearchResults([]); setGlobalSearchTotal(0); setSearchQuery(''); }}
                  className="p-1.5 text-claude-subtext hover:text-claude-text transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {globalSearchResults.map((result, index) => (
                  <div
                    key={index}
                    className="p-3 bg-claude-bg rounded-lg border border-claude-border hover:border-claude-accent/30 transition-colors"
                  >
                    <p className="text-sm font-medium text-claude-text font-sans mb-1">
                      Ст. {result.article_number}. {result.title}
                    </p>
                    <p className="text-sm text-claude-subtext font-sans mb-2 line-clamp-2">
                      {result.full_text}
                    </p>
                    <button
                      onClick={() => {
                        setSelectedCode(result.rada_id);
                        setTimeout(() => fetchArticle(result.article_number), 500);
                      }}
                      className="text-xs text-claude-accent hover:text-[#C66345] font-sans font-medium"
                    >
                      Перейти до статті &rarr;
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!globalSearchLoading && searchQuery && globalSearchResults.length === 0 && globalSearchTotal === 0 && (
            <div className="bg-white rounded-2xl border border-claude-border shadow-sm p-6 mb-6 text-center">
              <p className="text-sm text-claude-subtext font-sans">Нічого не знайдено за запитом «{searchQuery}»</p>
            </div>
          )}

          {/* Main Codes */}
          <div className="mb-6">
            <h2 className="text-xl font-sans text-claude-text font-medium mb-4 flex items-center gap-2">
              <Library size={24} />
              Основні кодекси
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mainCodes.map((code, index) => (
                <motion.div
                  key={code.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white rounded-2xl border border-claude-border shadow-sm p-6 hover:shadow-md hover:border-claude-accent/30 transition-all"
                >
                  <div className="text-4xl mb-3">{code.icon}</div>
                  <h3 className="text-base font-sans font-medium text-claude-text mb-1">
                    {code.name}
                  </h3>
                  <p className="text-sm text-claude-subtext font-sans mb-4">
                    {code.number}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedCode(code.id)}
                      className="flex-1 px-3 py-2 bg-claude-accent text-white rounded-lg text-sm font-medium hover:bg-[#C66345] transition-colors font-sans"
                    >
                      Відкрити
                    </button>
                    <button
                      onClick={() => handleDownloadCode(code.number, code.name)}
                      className="p-2 text-claude-subtext hover:text-claude-text hover:bg-claude-bg rounded-lg transition-colors"
                      title="Завантажити зміст"
                    >
                      <Download size={18} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Procedural Codes */}
          <div className="bg-white rounded-2xl border border-claude-border shadow-sm p-6 mb-6">
            <h2 className="text-lg font-sans text-claude-text font-medium mb-4 flex items-center gap-2">
              <ScrollText size={20} />
              Процесуальні кодекси
            </h2>
            <div className="space-y-2">
              {proceduralCodes.map((code, index) => (
                <motion.div
                  key={code.number}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center justify-between p-3 bg-claude-bg rounded-lg hover:bg-claude-border transition-colors"
                >
                  <span className="text-sm font-sans text-claude-text">
                    • {code.name}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedCode(code.number)}
                      className="px-3 py-1.5 text-sm font-medium font-sans text-claude-text hover:text-claude-accent transition-colors"
                    >
                      Відкрити
                    </button>
                    <button
                      onClick={() => handleDownloadCode(code.number, code.name)}
                      className="p-1.5 text-claude-subtext hover:text-claude-text transition-colors"
                      title="Завантажити зміст"
                    >
                      <Download size={16} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Constitutional Acts */}
          <div className="bg-white rounded-2xl border border-claude-border shadow-sm p-6 mb-6">
            <h2 className="text-lg font-sans text-claude-text font-medium mb-4 flex items-center gap-2">
              <Building2 size={20} />
              Конституційні акти
            </h2>
            <div className="flex items-center justify-between p-3 bg-claude-bg rounded-lg">
              <span className="text-sm font-sans text-claude-text">
                • Конституція України (254к/96-ВР)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedCode('254к/96-вр')}
                  className="px-3 py-1.5 text-sm font-medium font-sans text-claude-text hover:text-claude-accent transition-colors"
                >
                  Відкрити
                </button>
                <button
                  onClick={() => handleDownloadCode('254к/96-вр', 'Конституція_України')}
                  className="p-1.5 text-claude-subtext hover:text-claude-text transition-colors"
                  title="Завантажити зміст"
                >
                  <Download size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Categories */}
          <div className="bg-white rounded-2xl border border-claude-border shadow-sm p-6">
            <h2 className="text-lg font-sans text-claude-text font-medium mb-4 flex items-center gap-2">
              <Folder size={20} />
              Категорії законів
            </h2>
            <div className="flex flex-wrap gap-2">
              {(showAllCategories ? categories : categories.slice(0, 7)).map((category, index) => (
                <motion.button
                  key={category}
                  onClick={() => handleCategorySearch(category)}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.03 }}
                  className="px-4 py-2 bg-claude-bg hover:bg-claude-accent hover:text-white border border-claude-border hover:border-claude-accent rounded-xl text-sm font-medium font-sans transition-all"
                >
                  {category}
                </motion.button>
              ))}
              {!showAllCategories && (
                <button
                  onClick={() => setShowAllCategories(true)}
                  className="px-4 py-2 bg-claude-bg hover:bg-claude-border border border-claude-border rounded-xl text-sm font-medium font-sans text-claude-subtext hover:text-claude-text transition-all"
                >
                  Показати всі ({categories.length})
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2 } from 'lucide-react';
import type { SearchResult } from './types';
import { useLegalT } from '../../i18n/legal-i18n';

interface SearchPanelProps {
  showSearch: boolean;
  documentSearch: string;
  setDocumentSearch: (value: string) => void;
  handleSearch: () => void;
  searchLoading: boolean;
  searchResults: SearchResult[];
  setSearchResults: (results: SearchResult[]) => void;
  searchTotal: number;
  fetchArticle: (articleNumber: string) => void;
  setShowSearch: (show: boolean) => void;
}

export function SearchPanel({
  showSearch,
  documentSearch,
  setDocumentSearch,
  handleSearch,
  searchLoading,
  searchResults,
  setSearchResults,
  searchTotal,
  fetchArticle,
  setShowSearch,
}: SearchPanelProps) {
  const { t } = useLegalT();
  return (
    <AnimatePresence>
      {showSearch && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="bg-white border-b border-claude-border overflow-hidden"
        >
          <div className="max-w-7xl mx-auto p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={documentSearch}
                  onChange={(e) => setDocumentSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder={t.searchInDocument}
                  className="w-full px-4 py-2 bg-white border border-claude-border rounded-lg text-claude-text placeholder-claude-subtext/50 focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent transition-all font-sans"
                  autoFocus
                />
                {documentSearch && (
                  <button
                    onClick={() => {
                      setDocumentSearch('');
                      setSearchResults([]);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-claude-subtext hover:text-claude-text"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <button
                onClick={handleSearch}
                disabled={searchLoading || !documentSearch.trim()}
                className="px-4 py-2 bg-claude-accent text-white rounded-lg font-medium hover:bg-[#C66345] transition-colors font-sans disabled:opacity-50 flex items-center gap-2"
              >
                {searchLoading && <Loader2 size={16} className="animate-spin" />}
                {t.search}
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-claude-subtext font-sans">
                    {t.foundResults}: {searchTotal} {t.results}
                  </span>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {searchResults.map((result, index) => (
                    <div
                      key={index}
                      className="p-3 bg-claude-bg rounded-lg border border-claude-border"
                    >
                      <p className="text-sm font-medium text-claude-text font-sans mb-1">
                        Ст. {result.article_number}. {result.title}
                      </p>
                      <p className="text-sm text-claude-subtext font-sans mb-2 line-clamp-2">
                        {result.full_text}
                      </p>
                      <button
                        onClick={() => {
                          fetchArticle(result.article_number);
                          setShowSearch(false);
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

            {!searchLoading && documentSearch && searchResults.length === 0 && searchTotal === 0 && (
              <p className="text-sm text-claude-subtext font-sans">
                Нічого не знайдено
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

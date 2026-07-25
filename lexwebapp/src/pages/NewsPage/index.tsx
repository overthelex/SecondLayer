import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, ExternalLink, RefreshCw, AlertCircle, Calendar, Sparkles } from 'lucide-react';
import { KmuArticleModal } from './KmuArticleModal';
import { useMiscT } from '../../i18n/misc-i18n';

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

function parseRSS(xml: string): NewsItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const items = doc.querySelectorAll('item');
  const result: NewsItem[] = [];

  items.forEach((item) => {
    result.push({
      title: item.querySelector('title')?.textContent || '',
      link: item.querySelector('link')?.textContent || '',
      pubDate: item.querySelector('pubDate')?.textContent || '',
      description: item.querySelector('description')?.textContent || '',
    });
  });

  return result;
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('uk-UA', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

// Strip HTML tags using regex — safe because we only display as textContent via React
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').trim();
}

export function NewsPage() {
  const { t } = useMiscT();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<NewsItem | null>(null);

  const fetchNews = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/proxy/kmu-rss', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const xml = await response.text();
      const items = parseRSS(xml);
      setNews(items);
    } catch {
      setError(t('newsLoadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
  }, []);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-sm text-claude-subtext mt-1">
              {t('newsSubtitle')}
            </p>
          </div>
          <button
            onClick={fetchNews}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-claude-text bg-white border border-claude-border rounded-lg hover:bg-claude-bg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {t('refresh')}
          </button>
        </div>

        {/* Loading */}
        {loading && news.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-claude-accent" />
            <span className="ml-3 text-claude-subtext">{t('loadingNews')}</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        {/* News List */}
        {!loading && !error && news.length === 0 && (
          <div className="text-center py-20 text-claude-subtext">
            {t('noNewsFound')}
          </div>
        )}

        <div className="space-y-4">
          {news.map((item, index) => (
            <motion.div
              key={item.link || index}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03, duration: 0.3 }}
              onClick={() => setSelectedItem(item)}
              className="block p-5 bg-white border border-claude-border rounded-xl hover:border-claude-accent/30 hover:shadow-sm transition-all group cursor-pointer"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-[15px] font-semibold text-claude-text group-hover:text-claude-accent transition-colors leading-snug">
                    {item.title}
                  </h3>
                  {item.description && (
                    <p className="mt-2 text-[13px] text-claude-subtext leading-relaxed line-clamp-3">
                      {stripHtml(item.description)}
                    </p>
                  )}
                  {item.pubDate && (
                    <div className="flex items-center gap-1.5 mt-3 text-xs text-claude-subtext/70">
                      <Calendar size={12} />
                      {formatDate(item.pubDate)}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0 mt-1">
                  <Sparkles size={14} className="text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <ExternalLink size={16} className="text-claude-subtext/40 group-hover:text-claude-accent transition-colors" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Source Attribution */}
        {news.length > 0 && (
          <div className="mt-8 pb-6 text-center text-xs text-claude-subtext/60">
            {t('source')}{' '}
            <a
              href="https://www.kmu.gov.ua"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-claude-accent transition-colors"
            >
              kmu.gov.ua
            </a>
          </div>
        )}
      </div>

      {/* Article Modal */}
      <AnimatePresence>
        {selectedItem && (
          <KmuArticleModal
            url={selectedItem.link}
            title={selectedItem.title}
            onClose={() => setSelectedItem(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

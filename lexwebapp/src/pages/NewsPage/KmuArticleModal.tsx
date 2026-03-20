import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X, Loader2, ExternalLink, Sparkles, AlertCircle } from 'lucide-react';

interface KmuArticleModalProps {
  url: string;
  title: string;
  onClose: () => void;
}

interface ArticleData {
  title: string;
  content: string;
  analysis: string;
}

export function KmuArticleModal({ url, title, onClose }: KmuArticleModalProps) {
  const [data, setData] = useState<ArticleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchArticle = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem('auth_token');
        const params = new URLSearchParams({ url, title });
        const response = await fetch(`/api/news/article?${params}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${response.status}`);
        }
        const result = await response.json();
        setData(result);
      } catch (err: any) {
        setError(err.message || 'Не вдалося завантажити статтю');
      } finally {
        setLoading(false);
      }
    };

    fetchArticle();
  }, [url, title]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="max-w-3xl mx-auto my-8 sm:my-12 bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-claude-border px-6 sm:px-8 py-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-claude-text truncate pr-4 max-w-[80%]">
            {title}
          </h2>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-claude-bg text-claude-subtext hover:text-claude-text transition-colors"
              title="Відкрити оригінал"
            >
              <ExternalLink size={16} />
            </a>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-claude-bg text-claude-subtext hover:text-claude-text transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 sm:px-8 py-6 sm:py-8">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 size={28} className="animate-spin text-claude-accent" />
              <p className="text-sm text-claude-subtext">Завантаження та аналіз статті...</p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          {data && !loading && (
            <>
              {/* Article content */}
              <div className="prose prose-sm sm:prose max-w-none
                prose-headings:font-serif prose-headings:text-claude-text
                prose-h2:text-xl prose-h2:mt-6 prose-h2:mb-3
                prose-h3:text-lg prose-h3:mt-4 prose-h3:mb-2
                prose-p:text-claude-text prose-p:font-sans prose-p:leading-relaxed
                prose-li:text-claude-text prose-li:font-sans
                prose-strong:text-claude-text
                prose-blockquote:border-claude-accent prose-blockquote:bg-claude-accent/5 prose-blockquote:rounded-r-xl
              ">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {data.content}
                </ReactMarkdown>
              </div>

              {/* AI Analysis */}
              {data.analysis && (
                <div className="mt-8 p-5 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles size={18} className="text-amber-600" />
                    <h3 className="text-sm font-semibold text-amber-800">
                      AI-аналіз
                    </h3>
                  </div>
                  <div className="prose prose-sm max-w-none
                    prose-p:text-amber-900/80 prose-p:font-sans prose-p:leading-relaxed prose-p:my-2
                    prose-strong:text-amber-900
                    prose-li:text-amber-900/80
                  ">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {data.analysis}
                    </ReactMarkdown>
                  </div>
                </div>
              )}

              {/* Source link */}
              <div className="mt-6 pt-4 border-t border-claude-border text-center">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-claude-subtext hover:text-claude-accent transition-colors"
                >
                  <ExternalLink size={12} />
                  Джерело: kmu.gov.ua
                </a>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

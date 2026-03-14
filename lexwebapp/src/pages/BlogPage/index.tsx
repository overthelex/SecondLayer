import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Cpu,
  Scale,
} from 'lucide-react';
import { articles, type Article } from './articles';
import { enTranslations } from './articles-en';
import { ruTranslations } from './articles-ru';
import { ArticleModal } from './ArticleModal';
import { useLocaleStore } from '../../stores/localeStore';
import { getBlogUI, getLocalizedArticles } from './blog-i18n';

const translationMaps = { en: enTranslations, ru: ruTranslations };

export function BlogPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [filter, setFilter] = useState<'all' | 'tech' | 'legal'>('all');
  const language = useLocaleStore((s) => s.language);
  const ui = getBlogUI(language);
  const localizedArticles = useMemo(
    () => getLocalizedArticles(articles, language, translationMaps),
    [language]
  );

  // Auto-open article from ?article= query param (used after login redirect)
  useEffect(() => {
    const articleId = searchParams.get('article');
    if (articleId && !selectedArticle) {
      const found = localizedArticles.find((a) => a.id === articleId);
      if (found) {
        setSelectedArticle(found);
        searchParams.delete('article');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [searchParams, localizedArticles]);

  const sorted = [...localizedArticles].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const filtered = filter === 'all' ? sorted : sorted.filter(a => a.category === filter);

  return (
    <div className="min-h-screen bg-claude-bg">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-claude-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/login')}
              className="flex items-center gap-2 text-claude-subtext hover:text-claude-text transition-colors font-sans text-sm"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">LEX AI</span>
            </button>
            <div className="h-5 w-px bg-claude-border" />
            <div className="flex items-center gap-2">
              <BookOpen size={18} className="text-claude-accent" />
              <span className="font-sans font-medium text-claude-text text-sm">Blog</span>
            </div>
          </div>
          <a
            href="/login"
            className="px-4 py-2 bg-claude-accent text-white rounded-xl text-sm font-medium font-sans hover:bg-[#C66345] transition-colors"
          >
            {ui.tryLexAi}
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-b from-white to-claude-bg border-b border-claude-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl sm:text-4xl font-serif text-claude-text mb-4"
          >
            LEX AI Blog
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-claude-subtext font-sans max-w-2xl mx-auto"
          >
            {ui.heroSubtitle}
          </motion.p>

          {/* Filter tabs */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex justify-center gap-2 mt-8"
          >
            {([
              { key: 'all', label: ui.all, count: localizedArticles.length },
              { key: 'tech', label: ui.tech, count: localizedArticles.filter(a => a.category === 'tech').length },
              { key: 'legal', label: ui.forLawyers, count: localizedArticles.filter(a => a.category === 'legal').length },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`px-4 py-2 rounded-xl text-sm font-sans font-medium transition-all ${
                  filter === tab.key
                    ? 'bg-claude-accent text-white shadow-sm'
                    : 'bg-white text-claude-subtext hover:text-claude-text border border-claude-border'
                }`}
              >
                {tab.label}
                <span className={`ml-1.5 text-xs ${filter === tab.key ? 'text-white/70' : 'text-claude-subtext/50'}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Article Cards */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="grid gap-5">
          {filtered.map((article, i) => (
            <motion.article
              key={article.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-white rounded-2xl border border-claude-border overflow-hidden hover:shadow-lg hover:border-claude-accent/30 transition-all cursor-pointer group"
              onClick={() => setSelectedArticle(article)}
            >
              <div className="relative w-full h-52 sm:h-60 overflow-hidden">
                <div className={`absolute inset-0 ${article.category === 'tech' ? 'bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-700' : 'bg-gradient-to-br from-claude-accent via-amber-600 to-orange-700'}`} />
                <img
                  src={`/blog-banners/${article.id}.png`}
                  alt={article.title}
                  className="relative w-full h-full object-cover object-top"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
              <div className="p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                  article.category === 'tech'
                    ? 'bg-blue-50 text-blue-600'
                    : 'bg-claude-accent/10 text-claude-accent'
                }`}>
                  {article.category === 'tech' ? <Cpu size={20} /> : <Scale size={20} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] font-bold tracking-wider uppercase font-sans px-2 py-0.5 rounded-full ${
                      article.category === 'tech'
                        ? 'bg-blue-50 text-blue-600'
                        : 'bg-claude-accent/10 text-claude-accent'
                    }`}>
                      {article.category === 'tech' ? 'TECH' : 'LEGAL'}
                    </span>
                    <span className="text-xs text-claude-subtext/60 font-sans">{article.readTime}</span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-serif text-claude-text mb-3 group-hover:text-claude-accent transition-colors">
                    {article.title}
                  </h2>
                  <p className="text-sm text-claude-subtext font-sans leading-relaxed line-clamp-3">
                    {article.punchline}
                  </p>
                  <div className="flex items-center gap-2 mt-4 flex-wrap">
                    {article.tags.map(tag => (
                      <span
                        key={tag}
                        className="text-[11px] px-2 py-0.5 rounded-full bg-claude-bg text-claude-subtext font-sans"
                      >
                        #{tag}
                      </span>
                    ))}
                    <div className="flex-1" />
                    <span className="text-sm text-claude-accent font-sans font-medium flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {ui.read} <ChevronRight size={14} />
                    </span>
                  </div>
                </div>
              </div>
              </div>
            </motion.article>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-claude-border bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/Image.jpg" alt="Lex" className="h-8 w-auto" />
            <span className="text-sm text-claude-subtext font-sans">{ui.footerDescription}</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-claude-subtext font-sans">
            <a href="/login" className="hover:text-claude-accent transition-colors">{ui.login}</a>
            <span className="text-claude-border">|</span>
            <a href="/ua/data-sources" className="hover:text-claude-accent transition-colors">{ui.dataSources}</a>
          </div>
        </div>
      </footer>

      {/* Article Modal */}
      <AnimatePresence>
        {selectedArticle && (
          <ArticleModal
            article={selectedArticle}
            onClose={() => setSelectedArticle(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

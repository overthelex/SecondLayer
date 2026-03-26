import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowLeft,
  Newspaper,
  X,
  Calendar,
  Globe,
  Rocket,
  Handshake,
  ChevronRight,
  Linkedin,
  Twitter,
  Facebook,
  Link2,
  Check,
} from 'lucide-react';
import { newsArticles, type NewsArticle } from './articles';

const categoryConfig = {
  expansion: { label: 'Експансія', labelGe: 'გაფართოება', icon: Globe, color: 'bg-emerald-50 text-emerald-700' },
  product: { label: 'Продукт', labelGe: 'პროდუქტი', icon: Rocket, color: 'bg-blue-50 text-blue-600' },
  partnership: { label: 'Партнерство', labelGe: 'პარტნიორობა', icon: Handshake, color: 'bg-purple-50 text-purple-600' },
};

function formatDate(dateStr: string, lang: 'ua' | 'ge'): string {
  const locale = lang === 'ge' ? 'ka-GE' : 'uk-UA';
  return new Date(dateStr).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function ArticleModal({ article, onClose }: { article: NewsArticle; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const cat = categoryConfig[article.category];

  const getUrl = () => `${window.location.origin}/lex-news?article=${article.id}`;

  const shareOnLinkedIn = () => {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(getUrl())}`, '_blank');
  };
  const shareOnX = () => {
    window.open(`https://x.com/intent/tweet?url=${encodeURIComponent(getUrl())}&text=${encodeURIComponent(article.title)}`, '_blank');
  };
  const shareOnFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(getUrl())}`, '_blank');
  };
  const copyLink = () => {
    navigator.clipboard.writeText(getUrl());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-claude-border px-6 sm:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`text-[10px] font-bold tracking-wider uppercase font-sans px-2 py-0.5 rounded-full ${cat.color}`}>
              {article.lang === 'ge' ? cat.labelGe : cat.label}
            </span>
            <span className="text-xs text-claude-subtext font-sans">{article.readTime}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-claude-bg text-claude-subtext font-sans uppercase">
              {article.lang === 'ge' ? 'GE' : 'UA'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={shareOnLinkedIn} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#0A66C2] bg-[#0A66C2]/10 hover:bg-[#0A66C2]/20 transition-colors">
              <Linkedin size={15} />
            </button>
            <button onClick={shareOnX} className="w-8 h-8 flex items-center justify-center rounded-lg text-claude-text bg-claude-bg hover:bg-claude-border transition-colors">
              <Twitter size={15} />
            </button>
            <button onClick={shareOnFacebook} className="w-8 h-8 flex items-center justify-center rounded-lg text-[#1877F2] bg-[#1877F2]/10 hover:bg-[#1877F2]/20 transition-colors">
              <Facebook size={15} />
            </button>
            <button onClick={copyLink} className="w-8 h-8 flex items-center justify-center rounded-lg text-claude-subtext bg-claude-bg hover:bg-claude-border transition-colors">
              {copied ? <Check size={15} className="text-green-600" /> : <Link2 size={15} />}
            </button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-claude-bg text-claude-subtext hover:text-claude-text transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="relative w-full h-48 sm:h-60 overflow-hidden bg-gradient-to-br from-emerald-600 via-teal-500 to-cyan-700">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-white/90 px-8">
              <Globe size={48} className="mx-auto mb-4 opacity-80" />
              <p className="text-lg font-serif font-medium">LEX Global Expansion</p>
            </div>
          </div>
        </div>

        <div className="px-6 sm:px-8 py-6 sm:py-8">
          <div className="prose prose-sm sm:prose max-w-none
            prose-headings:font-serif prose-headings:text-claude-text
            prose-h1:text-2xl sm:prose-h1:text-3xl prose-h1:mb-6
            prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4
            prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3
            prose-p:text-claude-text prose-p:font-sans prose-p:leading-relaxed
            prose-li:text-claude-text prose-li:font-sans
            prose-strong:text-claude-text
            prose-code:text-claude-accent prose-code:bg-claude-accent/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-none prose-code:after:content-none
            prose-pre:bg-gray-900 prose-pre:rounded-xl prose-pre:text-gray-100
            [&_pre_code]:text-gray-100 [&_pre_code]:bg-transparent [&_pre_code]:p-0
            prose-blockquote:border-claude-accent prose-blockquote:bg-claude-accent/5 prose-blockquote:rounded-r-xl
            prose-a:text-claude-accent prose-a:no-underline hover:prose-a:underline
            prose-table:font-sans
            prose-th:bg-claude-bg prose-th:text-claude-text prose-th:font-medium prose-th:text-sm prose-th:px-4 prose-th:py-2.5
            prose-td:text-sm prose-td:px-4 prose-td:py-2.5 prose-td:border-claude-border
            prose-hr:border-claude-border
          ">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {article.content}
            </ReactMarkdown>
          </div>

          <div className="flex flex-wrap gap-2 mt-8 pt-6 border-t border-claude-border">
            {article.tags.map(tag => (
              <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-claude-bg text-claude-subtext font-sans">
                #{tag}
              </span>
            ))}
          </div>

          <div className="mt-6 p-4 bg-claude-bg rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-claude-subtext font-sans">
              {article.lang === 'ge' ? 'გააზიარეთ ეს სტატია' : 'Поділитися цією статтею'}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={shareOnLinkedIn} className="flex items-center gap-2 px-4 py-2.5 bg-[#0A66C2] text-white rounded-xl text-sm font-sans font-medium hover:bg-[#004182] transition-colors">
                <Linkedin size={16} /> LinkedIn
              </button>
              <button onClick={shareOnX} className="flex items-center gap-2 px-4 py-2.5 bg-claude-text text-white rounded-xl text-sm font-sans font-medium hover:bg-black transition-colors">
                <Twitter size={16} /> X
              </button>
              <button onClick={shareOnFacebook} className="flex items-center gap-2 px-4 py-2.5 bg-[#1877F2] text-white rounded-xl text-sm font-sans font-medium hover:bg-[#0D65D9] transition-colors">
                <Facebook size={16} /> Facebook
              </button>
              <button onClick={copyLink} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-claude-border text-claude-text rounded-xl text-sm font-sans font-medium hover:bg-claude-bg transition-colors">
                {copied ? <Check size={16} className="text-green-600" /> : <Link2 size={16} />}
                {copied ? 'Copied' : 'Link'}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function LexNewsPage() {
  const navigate = useNavigate();
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);
  const [langFilter, setLangFilter] = useState<'all' | 'ua' | 'ge'>('all');

  const sorted = [...newsArticles].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const filtered = langFilter === 'all' ? sorted : sorted.filter(a => a.lang === langFilter);

  // Group articles by date
  const grouped = filtered.reduce<Record<string, NewsArticle[]>>((acc, article) => {
    const key = article.publishedAt;
    if (!acc[key]) acc[key] = [];
    acc[key].push(article);
    return acc;
  }, {});

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
              <Newspaper size={18} className="text-claude-accent" />
              <span className="font-sans font-medium text-claude-text text-sm">News</span>
            </div>
          </div>
          <a
            href="/login"
            className="px-4 py-2 bg-claude-accent text-white rounded-xl text-sm font-medium font-sans hover:bg-[#C66345] transition-colors"
          >
            Try LEX AI
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
            LEX News
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-claude-subtext font-sans max-w-2xl mx-auto"
          >
            Новини платформи LEX AI — розширення, нові ринки та продуктові оновлення
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex justify-center gap-2 mt-8"
          >
            {([
              { key: 'all' as const, label: 'Усі', count: sorted.length },
              { key: 'ua' as const, label: 'UA', count: sorted.filter(a => a.lang === 'ua').length },
              { key: 'ge' as const, label: 'GE', count: sorted.filter(a => a.lang === 'ge').length },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setLangFilter(tab.key)}
                className={`px-4 py-2 rounded-xl text-sm font-sans font-medium transition-all ${
                  langFilter === tab.key
                    ? 'bg-claude-accent text-white shadow-sm'
                    : 'bg-white text-claude-subtext hover:text-claude-text border border-claude-border'
                }`}
              >
                {tab.label}
                <span className={`ml-1.5 text-xs ${langFilter === tab.key ? 'text-white/70' : 'text-claude-subtext/50'}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Articles */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {Object.entries(grouped).map(([date, articles]) => (
          <div key={date} className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={14} className="text-claude-subtext" />
              <span className="text-sm font-sans font-medium text-claude-subtext">
                {formatDate(date, 'ua')}
              </span>
            </div>
            <div className="grid gap-5">
              {articles.map((article, i) => {
                const cat = categoryConfig[article.category];
                const Icon = cat.icon;
                return (
                  <motion.article
                    key={article.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-white rounded-2xl border border-claude-border overflow-hidden hover:shadow-lg hover:border-claude-accent/30 transition-all cursor-pointer group"
                    onClick={() => setSelectedArticle(article)}
                  >
                    <div className="p-6 sm:p-8">
                      <div className="flex items-start gap-4">
                        <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${cat.color}`}>
                          <Icon size={20} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`text-[10px] font-bold tracking-wider uppercase font-sans px-2 py-0.5 rounded-full ${cat.color}`}>
                              {article.lang === 'ge' ? cat.labelGe : cat.label}
                            </span>
                            <span className="text-xs text-claude-subtext/60 font-sans">{article.readTime}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-claude-bg text-claude-subtext font-sans uppercase">
                              {article.lang === 'ge' ? 'GE' : 'UA'}
                            </span>
                          </div>
                          <h2 className="text-lg sm:text-xl font-serif text-claude-text mb-3 group-hover:text-claude-accent transition-colors">
                            {article.title}
                          </h2>
                          <p className="text-sm text-claude-subtext font-sans leading-relaxed line-clamp-3">
                            {article.summary}
                          </p>
                          <div className="flex items-center gap-2 mt-4 flex-wrap">
                            {article.tags.map(tag => (
                              <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full bg-claude-bg text-claude-subtext font-sans">
                                #{tag}
                              </span>
                            ))}
                            <div className="flex-1" />
                            <span className="text-sm text-claude-accent font-sans font-medium flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {article.lang === 'ge' ? 'წაკითხვა' : 'Читати'} <ChevronRight size={14} />
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {/* Footer */}
      <footer className="border-t border-claude-border bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/Image.jpg" alt="Lex" className="h-8 w-auto" />
            <span className="text-sm text-claude-subtext font-sans">LEX AI — юридичні технології на основі штучного інтелекту</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-claude-subtext font-sans">
            <a href="/login" className="hover:text-claude-accent transition-colors">Увійти</a>
            <span className="text-claude-border">|</span>
            <a href="/blog" className="hover:text-claude-accent transition-colors">Blog</a>
            <span className="text-claude-border">|</span>
            <a href="/ua/data-sources" className="hover:text-claude-accent transition-colors">Джерела даних</a>
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

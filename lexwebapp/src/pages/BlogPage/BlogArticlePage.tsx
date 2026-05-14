import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowLeft,
  Linkedin,
  Link2,
  Check,
  Facebook,
  Twitter,
  FileText,
  X,
  Download,
  FileCode,
} from 'lucide-react';
import { articles } from './articles';
import { enTranslations } from './articles-en';
import { ruTranslations } from './articles-ru';
import AttractorBanner from '../../components/AttractorBanner';
import { CommentSection } from './CommentSection';
import { PaperReader } from './PaperReader';
import { useLocaleStore } from '../../stores/localeStore';
import { getBlogUI, getLocalizedArticles } from './blog-i18n';

const translationMaps = { en: enTranslations, ru: ruTranslations };

// ─── Reading progress bar ────────────────────────────────────────────────────

function ReadingProgressBar({ color }: { color: string }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const update = () => {
      const el = document.documentElement;
      const scrolled = el.scrollTop;
      const total = el.scrollHeight - el.clientHeight;
      setProgress(total > 0 ? (scrolled / total) * 100 : 0);
    };
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 h-0.5"
      style={{ background: 'transparent' }}
    >
      <div
        className="h-full transition-all duration-100"
        style={{ width: `${progress}%`, background: color }}
      />
    </div>
  );
}

// ─── PDF modal ───────────────────────────────────────────────────────────────

function PdfModal({
  pdfUrl,
  texUrl,
  title,
  onClose,
}: {
  pdfUrl: string;
  texUrl?: string;
  title: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'rgba(0,0,0,0.85)' }}
    >
      {/* Modal toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-purple-200 shrink-0">
        <p className="text-sm font-sans text-gray-700 truncate max-w-xs sm:max-w-lg">{title}</p>
        <div className="flex items-center gap-2">
          <a
            href={pdfUrl}
            download
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-sans font-medium hover:bg-purple-700 transition-colors"
          >
            <Download size={14} />
            PDF
          </a>
          {texUrl && (
            <a
              href={texUrl}
              download
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-purple-300 text-purple-700 rounded-lg text-sm font-sans font-medium hover:bg-purple-50 transition-colors"
            >
              <FileCode size={14} />
              LaTeX
            </a>
          )}
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors ml-1"
            title="Закрити"
          >
            <X size={18} />
          </button>
        </div>
      </div>
      {/* PaperReader fills the rest */}
      <div className="flex-1 overflow-auto bg-gray-100">
        <PaperReader pdfUrl={pdfUrl} texUrl={texUrl} title={title} />
      </div>
    </div>
  );
}

// ─── Floating PDF pill ────────────────────────────────────────────────────────

function FloatingPdfPill({ onOpen }: { onOpen: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(window.scrollY > 320);
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  return (
    <button
      onClick={onOpen}
      aria-label="Відкрити PDF"
      className={`
        fixed bottom-6 right-6 z-40
        flex items-center gap-2
        px-4 py-2.5
        bg-purple-600 text-white
        rounded-full shadow-lg
        text-sm font-sans font-medium
        hover:bg-purple-700
        transition-all duration-200
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}
      `}
    >
      <FileText size={15} />
      PDF
    </button>
  );
}

// ─── Category helpers ────────────────────────────────────────────────────────

function categoryLabel(cat: string) {
  if (cat === 'tech') return 'TECH';
  if (cat === 'academic') return 'ACADEMIC';
  return 'LEGAL';
}

function categoryBadgeClass(cat: string) {
  if (cat === 'tech') return 'bg-blue-50 text-blue-600';
  if (cat === 'academic') return 'bg-purple-50 text-purple-600';
  return 'bg-claude-accent/10 text-claude-accent';
}

function progressBarColor(cat: string) {
  if (cat === 'tech') return '#2563eb';
  if (cat === 'academic') return '#9333ea';
  return 'var(--claude-accent, #059669)';
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BlogArticlePage() {
  const { slug, lang } = useParams<{ slug: string; lang?: string }>();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const language = useLocaleStore((s) => s.language);
  const setLanguage = useLocaleStore((s) => s.setLanguage);
  const articleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (lang && ['en', 'ru', 'es'].includes(lang) && lang !== language) {
      setLanguage(lang as 'en' | 'ru' | 'es');
    }
  }, [lang, language, setLanguage]);

  const effectiveLang = (lang && ['en', 'ru', 'es', 'uk'].includes(lang))
    ? lang as 'en' | 'ru' | 'es' | 'uk'
    : 'en';
  const ui = getBlogUI(effectiveLang);
  const localizedArticles = useMemo(
    () => getLocalizedArticles(articles, effectiveLang, translationMaps),
    [effectiveLang]
  );

  useEffect(() => {
    if (slug && ['en', 'uk', 'ru', 'es'].includes(slug) && !lang) {
      if (slug !== 'en') setLanguage(slug as 'en' | 'ru' | 'es');
      navigate(slug === 'en' ? '/blog' : `/blog?lang=${slug}`, { replace: true });
    }
  }, [slug, lang, setLanguage, navigate]);

  const article = localizedArticles.find((a) => a.id === slug);

  useEffect(() => {
    if (!article && slug && !['en', 'ru', 'es'].includes(slug)) {
      navigate('/blog', { replace: true });
      return;
    }
    if (!article) return;
    document.title = article.title + ' | LEX Blog';

    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', article.punchline);
    } else {
      const meta = document.createElement('meta');
      meta.name = 'description';
      meta.content = article.punchline;
      document.head.appendChild(meta);
    }

    return () => {
      document.title = 'LEX AI';
    };
  }, [article, navigate]);

  const openPdfModal = useCallback(() => setPdfModalOpen(true), []);
  const closePdfModal = useCallback(() => setPdfModalOpen(false), []);

  if (!article) return null;

  const isAcademic = article.category === 'academic';
  const hasPdf = isAcademic && !!article.pdfUrl;

  const getArticleUrl = () => `${window.location.origin}/blog/${article.id}`;

  const shareOnLinkedIn = () => {
    const url = encodeURIComponent(getArticleUrl());
    const text = encodeURIComponent(`${article.punchline}\n\n#LegalTech #AI #LEXai`);
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}&text=${text}`, '_blank');
  };

  const shareOnX = () => {
    const url = encodeURIComponent(getArticleUrl());
    const text = encodeURIComponent(`${article.title}\n\n#LegalTech #AI`);
    window.open(`https://x.com/intent/tweet?url=${url}&text=${text}`, '_blank');
  };

  const shareOnFacebook = () => {
    const url = encodeURIComponent(getArticleUrl());
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
  };

  const copyLink = () => {
    navigator.clipboard.writeText(getArticleUrl());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const barColor = progressBarColor(article.category);

  return (
    <div className="min-h-screen bg-claude-bg">
      <ReadingProgressBar color={barColor} />

      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-claude-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/blog')}
              className="flex items-center gap-2 text-claude-subtext hover:text-claude-text transition-colors font-sans text-sm"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Blog</span>
            </button>
            <div className="h-5 w-px bg-claude-border" />
            <div className="flex items-center gap-3">
              <span className={`text-[10px] font-bold tracking-wider uppercase font-sans px-2 py-0.5 rounded-full ${categoryBadgeClass(article.category)}`}>
                {categoryLabel(article.category)}
              </span>
              <span className="text-xs text-claude-subtext font-sans">{article.readTime}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick PDF button in header — only for academic */}
            {hasPdf && (
              <button
                onClick={openPdfModal}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-sans font-medium hover:bg-purple-700 transition-colors mr-1"
              >
                <FileText size={13} />
                PDF
              </button>
            )}
            <button
              onClick={shareOnLinkedIn}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-[#0A66C2] bg-[#0A66C2]/10 hover:bg-[#0A66C2]/20 transition-colors"
              title={ui.shareLinkedIn}
            >
              <Linkedin size={15} />
            </button>
            <button
              onClick={shareOnX}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-claude-text bg-claude-bg hover:bg-claude-border transition-colors"
              title={ui.shareX}
            >
              <Twitter size={15} />
            </button>
            <button
              onClick={shareOnFacebook}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-[#1877F2] bg-[#1877F2]/10 hover:bg-[#1877F2]/20 transition-colors"
              title={ui.shareFacebook}
            >
              <Facebook size={15} />
            </button>
            <button
              onClick={copyLink}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-claude-subtext bg-claude-bg hover:bg-claude-border transition-colors"
              title={ui.copyLink}
            >
              {copied ? <Check size={15} className="text-green-600" /> : <Link2 size={15} />}
            </button>
          </div>
        </div>
      </header>

      {/* ── Banner ── */}
      <div className="relative w-full max-w-3xl mx-auto">
        <div className="relative w-full h-60 sm:h-76 overflow-hidden">
          <AttractorBanner seed={article.id} className="absolute inset-0" animate />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10 pointer-events-none" />
          <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-8 pointer-events-none">
            <p className="text-[10px] sm:text-xs font-bold tracking-[0.2em] uppercase text-emerald-400 font-mono mb-2">
              {article.tags.slice(0, 3).join(' / ')}
            </p>
            <h3 className="text-xl sm:text-3xl font-bold text-white font-mono leading-tight">
              {article.title.split(':')[0]}
            </h3>
          </div>
        </div>
      </div>

      {/* ── Article body ── */}
      <div className="max-w-3xl mx-auto bg-white min-h-[60vh]">

        {/* Title + punchline block */}
        <div className="px-6 sm:px-12 pt-10 pb-2">
          <h1 className="text-2xl sm:text-[1.75rem] font-serif font-bold text-gray-900 leading-tight tracking-tight">
            {article.title}
          </h1>
          <p className="mt-4 text-lg sm:text-xl text-gray-500 font-sans leading-relaxed font-light">
            {article.punchline}
          </p>

          {/* ── PDF call-to-action — shown immediately after punchline for academic ── */}
          {hasPdf && (
            <div className="mt-7 mb-2 flex flex-wrap items-center gap-3 p-5 rounded-2xl bg-purple-50 border border-purple-100">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-sans font-semibold text-purple-900">
                  Доступно у форматі PDF
                </p>
                <p className="text-xs text-purple-600/80 font-sans mt-0.5 leading-snug">
                  Відкрийте повний текст дослідження з навігацією та масштабуванням
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={openPdfModal}
                  className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-sans font-medium hover:bg-purple-700 transition-colors shadow-sm"
                >
                  <FileText size={15} />
                  Читати PDF
                </button>
                <a
                  href={article.pdfUrl}
                  download
                  className="flex items-center gap-2 px-4 py-2.5 bg-white border border-purple-200 text-purple-700 rounded-xl text-sm font-sans font-medium hover:bg-purple-50 transition-colors"
                >
                  <Download size={15} />
                  Завантажити
                </a>
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="mt-8 mb-0 border-t border-gray-100" />
        </div>

        {/* Markdown content */}
        <div
          ref={articleRef}
          className="px-6 sm:px-12 py-8 article-body"
        >
          {/*
            Medium-quality typography via inline style overrides.
            We use a dedicated wrapper class and Tailwind prose
            with custom overrides applied below via <style>.
          */}
          <div className="prose max-w-none
            prose-headings:font-serif prose-headings:text-gray-900 prose-headings:tracking-tight
            prose-h1:text-2xl prose-h1:font-bold prose-h1:mt-10 prose-h1:mb-5
            prose-h2:text-xl prose-h2:font-bold prose-h2:mt-10 prose-h2:mb-4
            prose-h3:text-lg prose-h3:font-semibold prose-h3:mt-8 prose-h3:mb-3
            prose-p:text-gray-800 prose-p:font-sans prose-p:leading-[1.8] prose-p:text-[1.0625rem]
            prose-li:text-gray-800 prose-li:font-sans prose-li:leading-[1.75] prose-li:text-[1.0625rem]
            prose-ul:my-5 prose-ol:my-5
            prose-strong:text-gray-900 prose-strong:font-semibold
            prose-em:text-gray-600
            prose-code:text-purple-700 prose-code:bg-purple-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[0.875em] prose-code:font-normal prose-code:before:content-none prose-code:after:content-none
            prose-pre:bg-gray-950 prose-pre:rounded-xl prose-pre:text-gray-100 prose-pre:my-8 prose-pre:text-sm prose-pre:leading-relaxed
            [&_pre_code]:text-gray-100 [&_pre_code]:bg-transparent [&_pre_code]:p-0
            prose-blockquote:not-italic prose-blockquote:border-l-4 prose-blockquote:border-purple-400 prose-blockquote:bg-purple-50/60 prose-blockquote:rounded-r-xl prose-blockquote:py-3 prose-blockquote:px-5 prose-blockquote:my-8
            [&_blockquote_p]:text-gray-700 [&_blockquote_p]:text-lg [&_blockquote_p]:leading-[1.7] [&_blockquote_p]:my-0 [&_blockquote_p]:font-light
            prose-a:text-purple-600 prose-a:font-medium prose-a:no-underline hover:prose-a:underline
            prose-img:rounded-xl prose-img:shadow-md prose-img:my-8
            prose-table:font-sans prose-table:text-sm
            prose-th:bg-gray-50 prose-th:text-gray-700 prose-th:font-semibold prose-th:px-4 prose-th:py-3
            prose-td:text-gray-700 prose-td:px-4 prose-td:py-3 prose-td:border-gray-200
            prose-hr:border-gray-200 prose-hr:my-10
            [&>p:first-of-type::first-letter]:text-5xl [&>p:first-of-type::first-letter]:font-serif [&>p:first-of-type::first-letter]:font-bold [&>p:first-of-type::first-letter]:text-gray-900 [&>p:first-of-type::first-letter]:float-left [&>p:first-of-type::first-letter]:mr-2 [&>p:first-of-type::first-letter]:mt-1 [&>p:first-of-type::first-letter]:leading-none
          ">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {article.content}
            </ReactMarkdown>
          </div>
        </div>

        {/* ── Tags ── */}
        <div className="px-6 sm:px-12 pb-6">
          <div className="flex flex-wrap gap-2 pt-6 border-t border-gray-100">
            {article.tags.map(tag => (
              <span
                key={tag}
                className="text-xs px-3 py-1.5 rounded-full bg-gray-50 text-gray-500 font-sans border border-gray-100 hover:bg-gray-100 transition-colors"
              >
                #{tag}
              </span>
            ))}
          </div>
        </div>

        {/* ── Share footer ── */}
        <div className="px-6 sm:px-12 pb-10">
          <div className="p-5 bg-gray-50 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 border border-gray-100">
            <p className="text-sm text-claude-subtext font-sans">
              {ui.shareArticle}
            </p>
            <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-end">
              <button
                onClick={shareOnLinkedIn}
                className="flex items-center gap-2 px-4 py-2 bg-[#0A66C2] text-white rounded-xl text-sm font-sans font-medium hover:bg-[#004182] transition-colors"
              >
                <Linkedin size={15} />
                LinkedIn
              </button>
              <button
                onClick={shareOnX}
                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-sans font-medium hover:bg-black transition-colors"
              >
                <Twitter size={15} />
                X
              </button>
              <button
                onClick={shareOnFacebook}
                className="flex items-center gap-2 px-4 py-2 bg-[#1877F2] text-white rounded-xl text-sm font-sans font-medium hover:bg-[#0D65D9] transition-colors"
              >
                <Facebook size={15} />
                Facebook
              </button>
              <button
                onClick={copyLink}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-sans font-medium hover:bg-gray-50 transition-colors"
              >
                {copied ? <Check size={15} className="text-green-600" /> : <Link2 size={15} />}
                {copied ? ui.copied : ui.copyLink}
              </button>
            </div>
          </div>
        </div>

        {/* ── Comments ── */}
        <div className="px-6 sm:px-12 pb-16">
          <CommentSection articleId={article.id} />
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="border-t border-claude-border bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/Image.jpg" alt="Lex" className="h-8 w-auto" />
            <span className="text-sm text-claude-subtext font-sans">{ui.footerDescription}</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-claude-subtext font-sans">
            <a href="/login" className="hover:text-claude-accent transition-colors">{ui.login}</a>
            <span className="text-claude-border">|</span>
            <a href="/blog" className="hover:text-claude-accent transition-colors">Blog</a>
          </div>
        </div>
      </footer>

      {/* ── Floating PDF pill (appears on scroll, academic only) ── */}
      {hasPdf && <FloatingPdfPill onOpen={openPdfModal} />}

      {/* ── PDF modal ── */}
      {hasPdf && pdfModalOpen && (
        <PdfModal
          pdfUrl={article.pdfUrl!}
          texUrl={article.texUrl}
          title={article.title}
          onClose={closePdfModal}
        />
      )}
    </div>
  );
}

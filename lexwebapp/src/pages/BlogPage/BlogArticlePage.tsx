import { useState, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import { articles } from './articles';
import { enTranslations } from './articles-en';
import { ruTranslations } from './articles-ru';
import AttractorBanner from '../../components/AttractorBanner';
import { CommentSection } from './CommentSection';
import { useLocaleStore } from '../../stores/localeStore';
import { getBlogUI, getLocalizedArticles } from './blog-i18n';

const translationMaps = { en: enTranslations, ru: ruTranslations };

export function BlogArticlePage() {
  const { slug, lang } = useParams<{ slug: string; lang?: string }>();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const language = useLocaleStore((s) => s.language);
  const setLanguage = useLocaleStore((s) => s.setLanguage);

  useEffect(() => {
    if (lang && ['en', 'ru', 'es'].includes(lang) && lang !== language) {
      setLanguage(lang as 'en' | 'ru' | 'es');
    }
  }, [lang, language, setLanguage]);

  const effectiveLang = (lang && ['en', 'ru', 'es', 'uk'].includes(lang)) ? lang as 'en' | 'ru' | 'es' | 'uk' : 'en';
  const ui = getBlogUI(effectiveLang);
  const localizedArticles = useMemo(
    () => getLocalizedArticles(articles, effectiveLang, translationMaps),
    [effectiveLang]
  );

  // Handle /blog/uk, /blog/ru — slug is actually a language code, show blog index
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

    // Set meta description
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

  if (!article) {
    return null;
  }

  const getArticleUrl = () =>
    `${window.location.origin}/blog/${article.id}`;

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

  return (
    <div className="min-h-screen bg-claude-bg">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-claude-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
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
              <span className={`text-[10px] font-bold tracking-wider uppercase font-sans px-2 py-0.5 rounded-full ${
                article.category === 'tech'
                  ? 'bg-blue-50 text-blue-600'
                  : 'bg-claude-accent/10 text-claude-accent'
              }`}>
                {article.category === 'tech' ? 'TECH' : 'LEGAL'}
              </span>
              <span className="text-xs text-claude-subtext font-sans">{article.readTime}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
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

      {/* Banner */}
      <div className="relative w-full max-w-3xl mx-auto">
        <div className="relative w-full h-60 sm:h-76 overflow-hidden">
          <AttractorBanner seed={article.id} className="absolute inset-0" animate />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
        </div>
      </div>

      {/* Article content */}
      <div className="max-w-3xl mx-auto px-6 sm:px-8 py-6 sm:py-8 bg-white min-h-[60vh]">
        <div className="prose prose-sm sm:prose max-w-none
          prose-headings:font-serif prose-headings:text-claude-text
          prose-h1:text-2xl sm:prose-h1:text-3xl prose-h1:mb-6
          prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4
          prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3
          prose-p:text-claude-text prose-p:font-sans prose-p:leading-relaxed
          prose-li:text-claude-text prose-li:font-sans
          prose-strong:text-claude-text
          prose-em:text-claude-subtext
          prose-code:text-claude-accent prose-code:bg-claude-accent/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-normal prose-code:before:content-none prose-code:after:content-none
          prose-pre:bg-gray-900 prose-pre:rounded-xl prose-pre:text-gray-100
          [&_pre_code]:text-gray-100 [&_pre_code]:bg-transparent [&_pre_code]:p-0
          prose-blockquote:border-claude-accent prose-blockquote:bg-claude-accent/5 prose-blockquote:rounded-r-xl prose-blockquote:py-1
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

        {/* Tags */}
        <div className="flex flex-wrap gap-2 mt-8 pt-6 border-t border-claude-border">
          {article.tags.map(tag => (
            <span
              key={tag}
              className="text-xs px-2.5 py-1 rounded-full bg-claude-bg text-claude-subtext font-sans"
            >
              #{tag}
            </span>
          ))}
        </div>

        {/* Share footer */}
        <div className="mt-6 p-4 bg-claude-bg rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-claude-subtext font-sans">
            {ui.shareArticle}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={shareOnLinkedIn}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#0A66C2] text-white rounded-xl text-sm font-sans font-medium hover:bg-[#004182] transition-colors"
            >
              <Linkedin size={16} />
              LinkedIn
            </button>
            <button
              onClick={shareOnX}
              className="flex items-center gap-2 px-4 py-2.5 bg-claude-text text-white rounded-xl text-sm font-sans font-medium hover:bg-black transition-colors"
            >
              <Twitter size={16} />
              X
            </button>
            <button
              onClick={shareOnFacebook}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#1877F2] text-white rounded-xl text-sm font-sans font-medium hover:bg-[#0D65D9] transition-colors"
            >
              <Facebook size={16} />
              Facebook
            </button>
            <button
              onClick={copyLink}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-claude-border text-claude-text rounded-xl text-sm font-sans font-medium hover:bg-claude-bg transition-colors"
            >
              {copied ? <Check size={16} className="text-green-600" /> : <Link2 size={16} />}
              {copied ? ui.copied : ui.copyLink}
            </button>
          </div>
        </div>

        {/* Comments */}
        <CommentSection articleId={article.id} />
      </div>

      {/* Footer */}
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
    </div>
  );
}

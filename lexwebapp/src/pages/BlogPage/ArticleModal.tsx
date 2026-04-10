import { useState } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Linkedin,
  Link2,
  Check,
  X,
  Facebook,
  Twitter,
} from 'lucide-react';
import type { Article } from './articles';
import { CommentSection } from './CommentSection';
import { useLocaleStore } from '../../stores/localeStore';
import { getBlogUI } from './blog-i18n';

interface ArticleModalProps {
  article: Article;
  onClose: () => void;
}

export function ArticleModal({ article, onClose }: ArticleModalProps) {
  const [copied, setCopied] = useState(false);
  const language = useLocaleStore((s) => s.language);
  const ui = getBlogUI(language);

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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="max-w-3xl mx-auto my-8 sm:my-12 bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Modal header */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-claude-border px-6 sm:px-8 py-4 flex items-center justify-between">
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
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); shareOnLinkedIn(); }}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-[#0A66C2] bg-[#0A66C2]/10 hover:bg-[#0A66C2]/20 transition-colors"
              title={ui.shareLinkedIn}
            >
              <Linkedin size={15} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); shareOnX(); }}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-claude-text bg-claude-bg hover:bg-claude-border transition-colors"
              title={ui.shareX}
            >
              <Twitter size={15} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); shareOnFacebook(); }}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-[#1877F2] bg-[#1877F2]/10 hover:bg-[#1877F2]/20 transition-colors"
              title={ui.shareFacebook}
            >
              <Facebook size={15} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); copyLink(); }}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-claude-subtext bg-claude-bg hover:bg-claude-border transition-colors"
              title={ui.copyLink}
            >
              {copied ? <Check size={15} className="text-green-600" /> : <Link2 size={15} />}
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-claude-bg text-claude-subtext hover:text-claude-text transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Banner */}
        <div className="relative w-full h-60 sm:h-76 overflow-hidden">
          <div className={`absolute inset-0 ${article.category === 'tech' ? 'bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-700' : 'bg-gradient-to-br from-claude-accent via-amber-600 to-orange-700'}`} />
          <img
            src={`/blog-banners/${article.id}.png`}
            alt={article.title}
            width={1200}
            height={630}
            loading="lazy"
            className="relative w-full h-full object-cover object-top"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>

        {/* Modal content */}
        <div className="px-6 sm:px-8 py-6 sm:py-8">
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
      </motion.div>
    </motion.div>
  );
}

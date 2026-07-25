import { motion, AnimatePresence } from 'framer-motion';
import {
  Copy,
  Link as LinkIcon,
  MessageSquare,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Library,
} from 'lucide-react';
import type { ArticleData, TOCArticleEntry } from './types';
import { useLegalT } from '../../i18n/legal-i18n';

interface ArticleViewerProps {
  loadingArticle: boolean;
  loadingStructure: boolean;
  currentArticle: ArticleData | null;
  currentArticleIndex: number;
  allArticles: TOCArticleEntry[];
  prevArticle: TOCArticleEntry | null;
  nextArticle: TOCArticleEntry | null;
  showComment: boolean;
  setShowComment: (show: boolean) => void;
  commentText: string;
  fetchArticle: (articleNumber: string) => void;
  handleCopy: () => void;
  handleCopyLink: () => void;
  handleSaveComment: (text: string) => void;
}

export function ArticleViewer({
  loadingArticle,
  loadingStructure,
  currentArticle,
  currentArticleIndex,
  allArticles,
  prevArticle,
  nextArticle,
  showComment,
  setShowComment,
  commentText,
  fetchArticle,
  handleCopy,
  handleCopyLink,
  handleSaveComment,
}: ArticleViewerProps) {
  const { t } = useLegalT();
  return (
    <div className="flex-1 overflow-y-auto p-8 bg-claude-bg">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl border border-claude-border shadow-sm p-8">
        {/* Loading state */}
        {loadingArticle && (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={32} className="animate-spin text-claude-accent" />
          </div>
        )}

        {/* No article selected yet */}
        {!loadingArticle && !currentArticle && (
          <div className="text-center py-24">
            <Library size={48} className="mx-auto text-claude-subtext/30 mb-4" />
            <p className="text-claude-subtext font-sans">
              {loadingStructure
                ? t.loadingStructureShort
                : t.selectArticle}
            </p>
          </div>
        )}

        {/* Article content */}
        {!loadingArticle && currentArticle && (
          <>
            <h2 className="text-2xl font-serif font-bold text-claude-text mb-6">
              {t.articleLabel} {currentArticle.article_number}. {currentArticle.title}
            </h2>

            <div className="text-base text-claude-text font-sans leading-relaxed whitespace-pre-wrap">
              {currentArticle.full_text}
            </div>

            {/* Prev/Next navigation */}
            <div className="mt-8 pt-4 border-t border-claude-border flex items-center justify-between">
              <button
                onClick={() => prevArticle && fetchArticle(prevArticle.article_number)}
                disabled={!prevArticle}
                className="flex items-center gap-2 px-3 py-2 text-sm font-sans text-claude-text hover:bg-claude-bg rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
                {prevArticle
                  ? `${t.articlesAbbr} ${prevArticle.article_number}`
                  : t.previous}
              </button>
              <span className="text-xs text-claude-subtext font-sans">
                {currentArticleIndex + 1} / {allArticles.length}
              </span>
              <button
                onClick={() => nextArticle && fetchArticle(nextArticle.article_number)}
                disabled={!nextArticle}
                className="flex items-center gap-2 px-3 py-2 text-sm font-sans text-claude-text hover:bg-claude-bg rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {nextArticle
                  ? `${t.articlesAbbr} ${nextArticle.article_number}`
                  : t.next}
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Action buttons */}
            <div className="mt-4 pt-4 border-t border-claude-border flex items-center gap-3">
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 px-4 py-2 bg-claude-bg hover:bg-claude-border text-claude-text rounded-lg text-sm font-medium font-sans transition-colors"
              >
                <Copy size={16} />
                {t.copy}
              </button>
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-2 px-4 py-2 bg-claude-bg hover:bg-claude-border text-claude-text rounded-lg text-sm font-medium font-sans transition-colors"
              >
                <LinkIcon size={16} />
                {t.link}
              </button>
              <button
                onClick={() => setShowComment(!showComment)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium font-sans transition-colors ${
                  showComment || commentText
                    ? 'bg-claude-accent/10 text-claude-accent'
                    : 'bg-claude-bg hover:bg-claude-border text-claude-text'
                }`}
              >
                <MessageSquare size={16} />
                {t.comment}
              </button>
            </div>

            {/* Comment area */}
            <AnimatePresence>
              {showComment && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-4">
                    <textarea
                      value={commentText}
                      onChange={(e) => handleSaveComment(e.target.value)}
                      placeholder={t.addNoteToArticle}
                      className="w-full px-4 py-3 bg-claude-bg border border-claude-border rounded-lg text-sm font-sans text-claude-text placeholder-claude-subtext/50 focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent resize-y min-h-[80px]"
                      rows={3}
                    />
                    <p className="text-xs text-claude-subtext font-sans mt-1">
                      {t.noteAutoSaved}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Send,
  Trash2,
  LogIn,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { blogService, type BlogComment } from '../../services/blog-service';
import { useLocaleStore } from '../../stores/localeStore';
import { getBlogUI } from './blog-i18n';

interface CommentSectionProps {
  articleId: string;
}

export function CommentSection({ articleId }: CommentSectionProps) {
  const { user, isAuthenticated } = useAuth();
  const language = useLocaleStore((s) => s.language);
  const ui = getBlogUI(language);
  const [comments, setComments] = useState<BlogComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const loadComments = useCallback(async (id: string) => {
    setCommentsLoading(true);
    try {
      const data = await blogService.getComments(id);
      setComments(data);
    } catch {
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadComments(articleId);
    setCommentText('');
  }, [articleId, loadComments]);

  const handleSubmitComment = async () => {
    if (!commentText.trim() || commentSubmitting) return;
    setCommentSubmitting(true);
    try {
      const newComment = await blogService.postComment(articleId, commentText.trim());
      setComments(prev => [newComment, ...prev]);
      setCommentText('');
    } catch {
      // handled silently
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    try {
      await blogService.deleteComment(commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch {
      // handled silently
    }
  };

  return (
    <div className="mt-8 pt-6 border-t border-claude-border">
      <div className="flex items-center gap-2 mb-6">
        <MessageSquare size={18} className="text-claude-accent" />
        <h3 className="text-base font-sans font-medium text-claude-text">
          {ui.comments} {comments.length > 0 && <span className="text-claude-subtext font-normal">({comments.length})</span>}
        </h3>
      </div>

      {/* Comment input */}
      {isAuthenticated ? (
        <div className="flex gap-3 mb-6">
          <div className="flex-shrink-0 w-9 h-9 rounded-full bg-claude-accent/10 flex items-center justify-center overflow-hidden">
            {user?.picture ? (
              <img src={user.picture} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm font-medium text-claude-accent">{(user?.name || user?.email || '?')[0].toUpperCase()}</span>
            )}
          </div>
          <div className="flex-1 flex gap-2">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmitComment()}
              placeholder={ui.writeComment}
              maxLength={2000}
              className="flex-1 px-4 py-2.5 bg-white border border-claude-border rounded-xl text-sm text-claude-text placeholder-claude-subtext/50 focus:outline-none focus:ring-2 focus:ring-claude-accent/20 focus:border-claude-accent transition-all font-sans"
            />
            <button
              onClick={handleSubmitComment}
              disabled={!commentText.trim() || commentSubmitting}
              className="px-3 py-2.5 bg-claude-accent text-white rounded-xl hover:bg-[#C66345] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      ) : (
        <a
          href={`/login?returnUrl=${encodeURIComponent('/blog?article=' + articleId)}`}
          className="flex items-center justify-center gap-2 mb-6 px-4 py-3 bg-claude-bg border border-claude-border rounded-xl text-sm text-claude-subtext hover:text-claude-text hover:border-claude-accent/30 transition-all font-sans"
        >
          <LogIn size={16} />
          {ui.loginToComment}
        </a>
      )}

      {/* Comments list */}
      {commentsLoading ? (
        <div className="text-center py-6 text-sm text-claude-subtext font-sans">{ui.loading}</div>
      ) : comments.length === 0 ? (
        <div className="text-center py-6 text-sm text-claude-subtext font-sans">
          {ui.noComments}
        </div>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-3 group">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-claude-accent/10 flex items-center justify-center overflow-hidden">
                {comment.user_picture ? (
                  <img src={comment.user_picture} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs font-medium text-claude-accent">
                    {(comment.user_name || '?')[0].toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-claude-text font-sans">
                    {comment.user_name || ui.anonymous}
                  </span>
                  <span className="text-xs text-claude-subtext/60 font-sans">
                    {new Date(comment.created_at).toLocaleDateString(language === 'uk' ? 'uk-UA' : language === 'ru' ? 'ru-RU' : 'en-US', {
                      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                  {isAuthenticated && user?.id === comment.user_id && (
                    <button
                      onClick={() => handleDeleteComment(comment.id)}
                      className="opacity-0 group-hover:opacity-100 text-claude-subtext/40 hover:text-red-500 transition-all ml-auto"
                      title={ui.delete}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <p className="text-sm text-claude-text font-sans mt-1 leading-relaxed">{comment.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

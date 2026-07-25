import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2, AlertCircle, Eye, ArrowLeft, ExternalLink } from 'lucide-react';
import { api } from '../../utils/api-client';
import { useMiscT } from '../../i18n/misc-i18n';
import { MarkdownContent } from '../../components/message/MarkdownContent';
import { LexLogo3D } from '../../components/LexLogo3D';
import type { Decision } from '../../types/models/Message';

interface SharedMessage {
  role: 'user' | 'assistant';
  content: string;
  decisions?: Decision[];
  citations?: Array<{ text?: string; source?: string }>;
}

interface ShareRecord {
  token: string;
  scope: 'conversation' | 'message';
  title: string | null;
  snapshot: { messages: SharedMessage[] };
  shared_by_name: string | null;
  created_at: string;
}

const noop = () => {};

export function SharedConversationPage() {
  const { token } = useParams<{ token: string }>();
  const { t } = useMiscT();
  const [loading, setLoading] = useState(true);
  const [share, setShare] = useState<ShareRecord | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    api.shares
      .get(token)
      .then((res) => {
        if (cancelled) return;
        setShare(res.data as ShareRecord);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-claude-bg">
        <div className="flex items-center gap-2 text-claude-subtext">
          <Loader2 size={18} className="animate-spin" strokeWidth={2} />
          {t('sharedLoading')}
        </div>
      </div>
    );
  }

  if (notFound || !share) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-claude-bg px-4 text-center">
        <AlertCircle size={32} className="text-claude-subtext" strokeWidth={1.5} />
        <p className="text-claude-text">{t('sharedNotFound')}</p>
        <Link to="/chat" className="text-[13px] text-claude-accent hover:underline">
          {t('sharedBackToChat')}
        </Link>
      </div>
    );
  }

  const messages = share.snapshot?.messages ?? [];

  return (
    <div className="min-h-screen bg-claude-bg">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-claude-border bg-claude-bg/90 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-3 flex items-center gap-3">
          <div className="w-7 h-7 rounded-md overflow-hidden flex items-center justify-center bg-zinc-900 flex-shrink-0">
            <LexLogo3D size={28} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium text-claude-text truncate">
              {share.title || t('sharedTitle')}
            </div>
            {share.shared_by_name && (
              <div className="text-[11px] text-claude-subtext truncate">
                {t('sharedBy')}: {share.shared_by_name}
              </div>
            )}
          </div>
          <span className="flex items-center gap-1 text-[11px] text-claude-subtext border border-claude-border rounded-full px-2 py-0.5 flex-shrink-0">
            <Eye size={11} strokeWidth={2} />
            {t('sharedReadOnly')}
          </span>
          <Link
            to="/chat"
            className="flex items-center gap-1 text-[12px] text-claude-subtext hover:text-claude-text transition-colors flex-shrink-0"
          >
            <ArrowLeft size={13} strokeWidth={2} />
            <span className="hidden sm:inline">{t('sharedBackToChat')}</span>
          </Link>
        </div>
      </div>

      {/* Messages */}
      <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 space-y-6">
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl bg-claude-sidebar px-4 py-2.5 text-[14px] text-claude-text whitespace-pre-wrap">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={i} className="space-y-3">
              <div className="prose-claude">
                <MarkdownContent content={m.content} openDocByRef={noop} />
              </div>
              {m.decisions && m.decisions.length > 0 && (
                <div className="space-y-1.5">
                  {m.decisions.map((d, di) => (
                    <div
                      key={di}
                      className="flex items-start gap-2 px-3 py-2 rounded-lg border border-claude-border/60 bg-claude-bg text-[12px]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-claude-text truncate">{d.number}</div>
                        <div className="text-claude-subtext truncate">
                          {[d.court, d.date].filter(Boolean).join(' • ')}
                        </div>
                      </div>
                      {d.externalUrl && (
                        <a
                          href={d.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-claude-subtext hover:text-claude-text flex-shrink-0"
                        >
                          <ExternalLink size={13} strokeWidth={2} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}

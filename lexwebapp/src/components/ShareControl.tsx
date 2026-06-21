import { useState, useCallback } from 'react';
import { Share2, Check, Copy, MessageSquare, MessagesSquare, Loader2, AlertCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useChatStore } from '../stores';
import { api } from '../utils/api-client';
import { useMiscT } from '../i18n/misc-i18n';
import type { Message } from '../types/models/Message';
import type { ShareScope, SharedMessage } from '../utils/api/shares';

interface ShareControlProps {
  /** response_id of the assistant message this control belongs to (for single-response scope). */
  responseId?: string;
}

export function ShareControl({ responseId }: ShareControlProps) {
  const { t } = useMiscT();
  const messages = useChatStore((s) => s.messages);
  const conversationId = useChatStore((s) => s.conversationId);

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  const reset = useCallback(() => {
    setOpen(false);
    setShareUrl(null);
    setCopied(false);
    setError(false);
    setCreating(false);
  }, []);

  const toShared = (m: Message): SharedMessage => ({
    role: m.role,
    content: m.content,
    decisions: m.decisions,
    citations: m.citations,
    documents: m.documents,
  });

  const buildSnapshot = (scope: ShareScope): SharedMessage[] => {
    const meaningful = (m: Message) =>
      !!m.content || !!m.decisions?.length || !!m.citations?.length || !!m.documents?.length;

    if (scope === 'conversation') {
      return messages.filter(meaningful).map(toShared);
    }

    // Single response: this assistant message + the question that preceded it.
    let idx = responseId
      ? messages.findIndex((m) => m.costSummary?.response_id === responseId)
      : -1;
    if (idx === -1) {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') { idx = i; break; }
      }
    }
    if (idx === -1) return [];

    const out: Message[] = [];
    const prev = messages[idx - 1];
    if (prev && prev.role === 'user') out.push(prev);
    out.push(messages[idx]);
    return out.map(toShared);
  };

  const titleFrom = (snap: SharedMessage[]): string => {
    const firstUser = snap.find((m) => m.role === 'user');
    const text = firstUser?.content || snap[0]?.content || '';
    return text.replace(/\s+/g, ' ').trim().slice(0, 80);
  };

  const handleShare = useCallback(
    async (scope: ShareScope) => {
      const snapshotMessages = buildSnapshot(scope);
      if (snapshotMessages.length === 0) {
        setError(true);
        return;
      }
      setCreating(true);
      setError(false);
      try {
        const res = await api.shares.create({
          scope,
          title: titleFrom(snapshotMessages),
          snapshot: { messages: snapshotMessages },
          conversationId,
        });
        const url = `${window.location.origin}/shared/${res.data.token}`;
        setShareUrl(url);
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
        } catch {
          /* clipboard may be blocked — link is still shown */
        }
      } catch {
        setError(true);
      } finally {
        setCreating(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, conversationId, responseId]
  );

  const copy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }, [shareUrl]);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => (open ? reset() : setOpen(true))}
        className="flex items-center gap-1 text-[12px] text-claude-subtext hover:text-claude-text transition-colors"
      >
        <Share2 size={12} strokeWidth={2} />
        <span>{t('share')}</span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* click-away backdrop */}
            <div className="fixed inset-0 z-10" onClick={reset} />
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 top-full mt-1.5 z-20 w-72 rounded-xl border border-claude-border bg-claude-bg shadow-xl p-1.5"
            >
              {!shareUrl ? (
                <div className="space-y-0.5">
                  <div className="px-2 py-1.5 text-[11px] font-medium text-claude-subtext uppercase tracking-wide">
                    {t('shareWhatTitle')}
                  </div>

                  <button
                    onClick={() => handleShare('conversation')}
                    disabled={creating}
                    className="w-full flex items-start gap-2.5 px-2 py-2 rounded-lg text-left hover:bg-claude-sidebar transition-colors disabled:opacity-50"
                  >
                    <MessagesSquare size={15} strokeWidth={2} className="mt-0.5 text-claude-subtext flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[13px] text-claude-text">{t('shareWholeConversation')}</div>
                      <div className="text-[11px] text-claude-subtext">{t('shareWholeConversationHint')}</div>
                    </div>
                  </button>

                  <button
                    onClick={() => handleShare('message')}
                    disabled={creating}
                    className="w-full flex items-start gap-2.5 px-2 py-2 rounded-lg text-left hover:bg-claude-sidebar transition-colors disabled:opacity-50"
                  >
                    <MessageSquare size={15} strokeWidth={2} className="mt-0.5 text-claude-subtext flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[13px] text-claude-text">{t('shareThisResponse')}</div>
                      <div className="text-[11px] text-claude-subtext">{t('shareThisResponseHint')}</div>
                    </div>
                  </button>

                  {creating && (
                    <div className="flex items-center gap-2 px-2 py-1.5 text-[12px] text-claude-subtext">
                      <Loader2 size={13} className="animate-spin" strokeWidth={2} />
                      {t('shareCreating')}
                    </div>
                  )}
                  {error && (
                    <div className="flex items-center gap-2 px-2 py-1.5 text-[12px] text-red-500">
                      <AlertCircle size={13} strokeWidth={2} />
                      {t('shareFailed')}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-1.5 space-y-2">
                  <div className="flex items-center gap-1.5 text-[12px] font-medium text-claude-text">
                    <Check size={13} strokeWidth={2.5} className="text-emerald-500" />
                    {t('shareLinkReady')}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      readOnly
                      value={shareUrl}
                      onFocus={(e) => e.currentTarget.select()}
                      className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-claude-border bg-claude-sidebar text-[12px] font-mono text-claude-text"
                    />
                    <button
                      onClick={copy}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-md bg-claude-text text-claude-bg text-[12px] hover:opacity-90 transition-opacity flex-shrink-0"
                    >
                      {copied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={2} />}
                      {copied ? t('shareCopied') : t('shareCopyLink')}
                    </button>
                  </div>
                  <div className="text-[11px] text-claude-subtext">{t('shareLinkHint')}</div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, MessageSquare, Loader2, Paperclip, FileText, Download, FolderDown, X, Check, CheckCheck, Image as ImageIcon, Lock, LockOpen, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { consultationService } from '../../services';
import { uploadService } from '../../services/api/UploadService';
import { useConsultationStore } from '../../stores/consultationStore';
import { useConsultationE2ee } from '../../hooks/useConsultationE2ee';
import { ConsultationE2eeStatus } from '../encryption/ConsultationE2eeStatus';
import type { ConsultationMessage } from '../../services/api/ConsultationService';

interface ConsultationChatTabProps {
  consultationId: string | null;
  clientUserId?: string;
  attorneyUserId?: string;
  onUnreadCountChange: (count: number) => void;
  disabled?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function isImageType(type?: string): boolean {
  return !!type && type.startsWith('image/');
}

function MessageStatus({ message, isMine }: { message: ConsultationMessage; isMine: boolean }) {
  if (!isMine) return null;

  const status = message.status || 'sent';

  if (status === 'read') {
    return <CheckCheck size={12} className="text-blue-400 inline-block ml-1" />;
  }
  if (status === 'delivered') {
    return <CheckCheck size={12} className="text-white/50 inline-block ml-1" />;
  }
  // sent
  return <Check size={12} className="text-white/50 inline-block ml-1" />;
}

function AttachmentDisplay({ message, consultationId, isMine }: { message: ConsultationMessage; consultationId?: string; isMine?: boolean }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!message.attachment_url) return null;

  const isImage = isImageType(message.attachment_type);
  const attachmentUrl = message.attachment_url;

  const handleSaveToVault = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!consultationId || saving || saved) return;
    setSaving(true);
    try {
      const res = await consultationService.saveAttachmentToVault(consultationId, message.id);
      if (res.documentId) {
        setSaved(true);
      }
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  const saveButton = !isMine && consultationId && (
    <button
      onClick={handleSaveToVault}
      disabled={saving || saved}
      className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity disabled:opacity-30"
      title={saved ? 'Збережено' : 'Зберегти до моїх документів'}
    >
      {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} className="text-green-500" /> : <FolderDown size={14} />}
    </button>
  );

  if (isImage) {
    return (
      <div className="mt-1.5 rounded-lg overflow-hidden max-w-[240px]">
        <a href={attachmentUrl} target="_blank" rel="noopener noreferrer">
          <img
            src={attachmentUrl}
            alt={message.attachment_name || 'Зображення'}
            className="max-w-full h-auto rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
            loading="lazy"
          />
        </a>
        <div className="flex items-center justify-between mt-0.5">
          {message.attachment_name && (
            <p className="text-[10px] opacity-60 truncate">{message.attachment_name}</p>
          )}
          {saveButton}
        </div>
      </div>
    );
  }

  // Non-image file
  return (
    <div className="mt-1.5 flex items-center gap-2 p-2 rounded-lg bg-black/10 max-w-[240px]">
      <a
        href={attachmentUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 min-w-0 flex-1 hover:opacity-80 transition-opacity"
      >
        <FileText size={16} className="flex-shrink-0 opacity-70" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium truncate">{message.attachment_name || 'Файл'}</p>
          {message.attachment_size && (
            <p className="text-[10px] opacity-60">{formatFileSize(message.attachment_size)}</p>
          )}
        </div>
        <Download size={14} className="flex-shrink-0 opacity-50" />
      </a>
      {saveButton}
    </div>
  );
}

export function ConsultationChatTab({ consultationId, clientUserId, attorneyUserId, onUnreadCountChange, disabled }: ConsultationChatTabProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ConsultationMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef<number>(0);

  // E2EE hook
  const e2ee = useConsultationE2ee(
    consultationId ?? undefined,
    clientUserId,
    attorneyUserId,
    user?.id
  );
  const e2eeReady = e2ee.status === 'ready';

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Decrypt an encrypted message in-place (returns a copy with plaintext content)
  const decryptMessageIfNeeded = useCallback(async (msg: ConsultationMessage): Promise<ConsultationMessage> => {
    if (!msg.is_encrypted || !e2eeReady || msg.msg_counter === undefined) return msg;
    try {
      const plaintext = await e2ee.decryptMessage(msg.content, msg.msg_counter, msg.key_version);
      return { ...msg, content: plaintext };
    } catch {
      return { ...msg, content: '[Не вдалося розшифрувати]' };
    }
  }, [e2ee, e2eeReady]);

  // Load initial messages
  useEffect(() => {
    if (!consultationId) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    consultationService.getMessages(consultationId, { limit: 100 }).then(async (result) => {
      if (!cancelled) {
        // Decrypt encrypted messages if E2EE is ready
        const decrypted = e2eeReady
          ? await Promise.all(result.messages.map(decryptMessageIfNeeded))
          : result.messages;
        setMessages(decrypted);
        setIsLoading(false);
        onUnreadCountChange(0);
        setTimeout(scrollToBottom, 100);
      }
    }).catch(() => {
      if (!cancelled) setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [consultationId, onUnreadCountChange, scrollToBottom, e2eeReady, decryptMessageIfNeeded]);

  // Connect SSE stream
  useEffect(() => {
    if (!consultationId) return;

    const es = consultationService.connectMessageStream(consultationId);
    eventSourceRef.current = es;

    es.addEventListener('message', (event) => {
      (async () => {
        try {
          let message: ConsultationMessage = JSON.parse(event.data);

          // Decrypt if encrypted and E2EE is ready
          if (message.is_encrypted && e2eeReady && message.msg_counter !== undefined) {
            try {
              const plaintext = await e2ee.decryptMessage(message.content, message.msg_counter, message.key_version);
              message = { ...message, content: plaintext };
            } catch {
              message = { ...message, content: '[Не вдалося розшифрувати]' };
            }
          }

          setMessages((prev) => {
            // Already have this exact message by server ID
            if (prev.some((m) => m.id === message.id)) return prev;
            // Replace optimistic message if it matches (same sender)
            const optimisticIdx = prev.findIndex(
              (m) => m.id.startsWith('optimistic-') && m.sender_id === message.sender_id
            );
            if (optimisticIdx >= 0) {
              const updated = [...prev];
              updated[optimisticIdx] = message;
              return updated;
            }
            return [...prev, message];
          });
          onUnreadCountChange(0);
          setTimeout(scrollToBottom, 100);

          // Mark as read if the message is from the other party
          if (message.sender_id !== user?.id && consultationId) {
            consultationService.markMessagesRead(consultationId).catch(() => {});
          }
        } catch {
          // ignore parse errors
        }
      })();
    });

    // Handle message status updates
    es.addEventListener('message_status', (event) => {
      try {
        const { messageIds, status } = JSON.parse(event.data);
        setMessages((prev) =>
          prev.map((m) =>
            messageIds.includes(m.id) ? { ...m, status } : m
          )
        );
      } catch {
        // ignore
      }
    });

    // Handle typing indicators
    es.addEventListener('typing', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.userId !== user?.id) {
          setTypingUser(data.userName || 'Співрозмовник');
          // Clear after 4s (sender sends every 3s while typing)
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setTypingUser(null), 4000);
        }
      } catch {}
    });

    // Handle consultation status changes
    es.addEventListener('consultation_status', (event) => {
      try {
        const updated = JSON.parse(event.data);
        // Dispatch with full consultation data for other components
        window.dispatchEvent(new CustomEvent('consultation-updated', { detail: updated }));
      } catch {
        window.dispatchEvent(new CustomEvent('consultation-updated'));
      }
    });

    es.onerror = () => {
      // EventSource will auto-reconnect
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [consultationId, onUnreadCountChange, scrollToBottom, user?.id, e2eeReady, e2ee]);

  // Polling fallback: SSE through Cloudflare is unreliable, poll every 30s
  useEffect(() => {
    if (!consultationId) return;
    const poll = setInterval(() => {
      consultationService.getMessages(consultationId, { limit: 100 }).then((result) => {
        setMessages(prev => {
          // Keep only unresolved optimistic messages (no matching server message yet)
          const pendingOptimistic = prev.filter(m =>
            m.id.startsWith('optimistic-') &&
            !result.messages.some(sm => sm.sender_id === m.sender_id && sm.content === m.content)
          );
          const merged = [...result.messages, ...pendingOptimistic];
          if (merged.length !== prev.length) setTimeout(scrollToBottom, 100);
          return merged;
        });
      }).catch(() => {});
    }, 30000);
    return () => clearInterval(poll);
  }, [consultationId, scrollToBottom]);

  // Mark messages as read when chat becomes visible
  useEffect(() => {
    if (consultationId && messages.length > 0) {
      consultationService.markMessagesRead(consultationId)
        .then(() => {
          // Re-fetch global unread to get accurate count
          consultationService.getGlobalUnreadCount()
            .then(r => useConsultationStore.getState().setGlobalUnreadCount(r.count))
            .catch(() => {});
        })
        .catch(() => {});
    }
  }, [consultationId, messages.length]);

  const uploadFile = async (file: File): Promise<{ url: string; name: string; type: string; size: number } | null> => {
    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Init upload
      const initResult = await uploadService.initUpload({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        docType: 'other',
        metadata: { source: 'consultation_chat' },
      });

      const chunkSize = initResult.chunkSize;
      const totalChunks = initResult.totalChunks;

      // Upload chunks
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        await uploadService.uploadChunk(initResult.uploadId, i, chunk, (loaded, total) => {
          const chunkFraction = total > 0 ? loaded / total : 1;
          const overallProgress = ((i + chunkFraction) / totalChunks) * 100;
          setUploadProgress(Math.round(overallProgress));
        });
      }

      // Complete upload
      await uploadService.completeUpload(initResult.uploadId);
      setUploadProgress(100);

      // Build the download URL
      const downloadUrl = `/api/documents/${initResult.uploadId}/download`;

      return {
        url: downloadUrl,
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
      };
    } catch (err) {
      console.error('File upload failed:', err);
      return null;
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleSend = async () => {
    if (!consultationId || isSending || isUploading) return;
    if (!input.trim() && !pendingFile) return;

    const content = input.trim();
    const file = pendingFile;
    setInput('');
    setPendingFile(null);
    setIsSending(true);

    // Optimistic append (text only, no attachment preview for optimistic)
    const optimistic: ConsultationMessage = {
      id: `optimistic-${Date.now()}`,
      consultation_id: consultationId,
      sender_id: user?.id || '',
      content: content || (file ? file.name : ''),
      message_type: file ? 'file' : 'text',
      status: 'sent',
      created_at: new Date().toISOString(),
      sender_name: user?.name || '',
    };
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(scrollToBottom, 50);

    try {
      let attachment: { url: string; name: string; type: string; size: number } | undefined;
      if (file) {
        const uploaded = await uploadFile(file);
        if (!uploaded) {
          // Upload failed — remove optimistic
          setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
          setInput(content);
          setIsSending(false);
          return;
        }
        attachment = uploaded;
      }

      // Encrypt content if E2EE is ready
      let finalContent = content || (file?.name || '');
      let e2eePayload: { isEncrypted: boolean; msgCounter?: number; keyVersion?: number } | undefined;

      if (e2eeReady && finalContent) {
        try {
          const encrypted = await e2ee.encryptMessage(finalContent);
          finalContent = encrypted.ciphertext;
          e2eePayload = {
            isEncrypted: true,
            msgCounter: encrypted.counter,
            keyVersion: encrypted.keyVersion,
          };
        } catch (err) {
          console.error('E2EE encryption failed, sending plaintext:', err);
        }
      }

      const sent = await consultationService.sendMessage(
        consultationId,
        finalContent,
        undefined,
        attachment,
        e2eePayload
      );
      // Replace optimistic with real message (SSE may have already replaced it)
      setMessages((prev) => {
        const hasReal = prev.some((m) => m.id === sent.id);
        if (hasReal) {
          // SSE already delivered — just remove leftover optimistic if any
          return prev.filter((m) => m.id !== optimistic.id);
        }
        return prev.map((m) => m.id === optimistic.id ? sent : m);
      });
    } catch {
      // Remove optimistic on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(content);
    } finally {
      setIsSending(false);
    }
  };

  const sendTypingIndicator = useCallback(() => {
    if (!consultationId) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current > 3000) {
      lastTypingSentRef.current = now;
      consultationService.sendTyping(consultationId);
    }
  }, [consultationId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPendingFile(file);
    }
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (!consultationId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-claude-subtext p-6 text-center">
        <MessageSquare size={32} strokeWidth={1.5} className="mb-3 opacity-40" />
        <p className="text-sm">Оберіть консультацію для чату</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-claude-subtext" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* E2EE status indicator */}
      {e2ee.status !== 'locked' && (
        <div className={`flex items-center justify-between px-3 py-1.5 text-[10px] border-b border-claude-border/30 ${
          e2eeReady ? 'text-green-600 bg-green-50/50' :
          e2ee.status === 'establishing' ? 'text-yellow-600 bg-yellow-50/50' :
          e2ee.status === 'no_peer_encryption' ? 'text-orange-500 bg-orange-50/50' :
          'text-red-500 bg-red-50/50'
        }`}>
          <div className="flex items-center gap-1.5">
            {e2eeReady ? (
              <><Lock size={10} /> Наскрізне шифрування активне</>
            ) : e2ee.status === 'establishing' ? (
              <><Loader2 size={10} className="animate-spin" /> Встановлення шифрування...</>
            ) : e2ee.status === 'no_peer_encryption' ? (
              <><LockOpen size={10} /> Співрозмовник не налаштував шифрування</>
            ) : e2ee.status === 'error' ? (
              <><ShieldAlert size={10} /> {e2ee.error || 'Помилка шифрування'}</>
            ) : null}
          </div>
          {e2eeReady && (
            <ConsultationE2eeStatus
              isEstablished={true}
              peerId={user?.id === clientUserId ? attorneyUserId : clientUserId}
            />
          )}
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-claude-subtext text-center">
            <MessageSquare size={28} strokeWidth={1.5} className="mb-2 opacity-40" />
            <p className="text-xs">Повідомлень поки немає</p>
            <p className="text-[10px] mt-1 opacity-60">Напишіть перше повідомлення</p>
          </div>
        )}

        {messages.map((msg) => {
          const isMine = msg.sender_id === user?.id;
          return (
            <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-xl px-3 py-2 ${
                isMine
                  ? 'bg-claude-accent text-white rounded-br-sm'
                  : 'bg-claude-user text-claude-text rounded-bl-sm'
              }`}>
                {!isMine && (
                  <p className="text-[10px] font-medium text-claude-accent mb-0.5">
                    {msg.sender_name}
                  </p>
                )}
                {msg.content && (
                  <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                )}
                <AttachmentDisplay message={msg} consultationId={consultationId ?? undefined} isMine={isMine} />
                <div className={`flex items-center justify-end gap-0.5 mt-1 ${isMine ? 'text-white/60' : 'text-claude-subtext'}`}>
                  <span className="text-[9px]">
                    {new Date(msg.created_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <MessageStatus message={msg} isMine={isMine} />
                </div>
              </div>
            </div>
          );
        })}
        {typingUser && (
          <div className="flex justify-start">
            <div className="bg-claude-user text-claude-subtext rounded-xl rounded-bl-sm px-3 py-2">
              <p className="text-[11px] italic">{typingUser} пише...</p>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Pending file preview */}
      {pendingFile && (
        <div className="px-3 py-2 border-t border-claude-border/30 bg-claude-bg/50">
          <div className="flex items-center gap-2 text-xs text-claude-text">
            {isImageType(pendingFile.type) ? (
              <ImageIcon size={14} className="text-claude-accent flex-shrink-0" />
            ) : (
              <FileText size={14} className="text-claude-accent flex-shrink-0" />
            )}
            <span className="truncate flex-1">{pendingFile.name}</span>
            <span className="text-claude-subtext flex-shrink-0">{formatFileSize(pendingFile.size)}</span>
            <button onClick={() => setPendingFile(null)} className="p-0.5 hover:bg-claude-subtext/10 rounded">
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Upload progress */}
      {isUploading && (
        <div className="px-3 py-1.5 border-t border-claude-border/30">
          <div className="flex items-center gap-2 text-xs text-claude-subtext">
            <Loader2 size={12} className="animate-spin" />
            <span>Завантаження... {uploadProgress}%</span>
          </div>
          <div className="mt-1 h-1 bg-claude-border/30 rounded-full overflow-hidden">
            <div className="h-full bg-claude-accent rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      {/* Input bar */}
      {!disabled ? (
        <div className="border-t border-claude-border/50 p-2">
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,.pdf,.doc,.docx,.txt,.xls,.xlsx,.csv,.rtf"
              onChange={handleFileSelect}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isSending || isUploading}
              className="flex-shrink-0 p-2 rounded-lg text-claude-subtext hover:text-claude-text hover:bg-claude-subtext/10 disabled:opacity-40 transition-colors"
              title="Прикріпити файл"
            >
              <Paperclip size={16} />
            </button>
            <textarea
              value={input}
              onChange={(e) => { setInput(e.target.value); sendTypingIndicator(); }}
              onKeyDown={handleKeyDown}
              placeholder="Написати повідомлення..."
              rows={1}
              className="flex-1 resize-none rounded-lg border border-claude-border/50 px-3 py-2 text-[13px] placeholder:text-claude-subtext/50 focus:outline-none focus:ring-1 focus:ring-claude-accent focus:border-claude-accent max-h-24 overflow-y-auto bg-white min-h-[36px]"
            />
            <button
              onClick={handleSend}
              disabled={(!input.trim() && !pendingFile) || isSending || isUploading}
              className="flex-shrink-0 p-2 rounded-lg bg-claude-accent text-white disabled:opacity-40 hover:bg-opacity-90 transition-colors"
            >
              {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      ) : (
        <div className="border-t border-claude-border/50 p-3 text-center">
          <p className="text-[11px] text-claude-subtext">Чат завершено</p>
        </div>
      )}
    </div>
  );
}

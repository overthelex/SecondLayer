import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, MessageSquare, Loader2, Paperclip, FileText, Download, X, Check, CheckCheck, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { consultationService } from '../../services';
import { uploadService } from '../../services/api/UploadService';
import { useConsultationStore } from '../../stores/consultationStore';
import type { ConsultationMessage } from '../../services/api/ConsultationService';

interface ConsultationChatTabProps {
  consultationId: string | null;
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

function AttachmentDisplay({ message }: { message: ConsultationMessage }) {
  if (!message.attachment_url) return null;

  const isImage = isImageType(message.attachment_type);
  const attachmentUrl = message.attachment_url;

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
        {message.attachment_name && (
          <p className="text-[10px] opacity-60 mt-0.5 truncate">{message.attachment_name}</p>
        )}
      </div>
    );
  }

  // Non-image file
  return (
    <a
      href={attachmentUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1.5 flex items-center gap-2 p-2 rounded-lg bg-black/10 hover:bg-black/15 transition-colors max-w-[240px]"
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
  );
}

export function ConsultationChatTab({ consultationId, onUnreadCountChange, disabled }: ConsultationChatTabProps) {
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

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Load initial messages
  useEffect(() => {
    if (!consultationId) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    consultationService.getMessages(consultationId, { limit: 100 }).then((result) => {
      if (!cancelled) {
        setMessages(result.messages);
        setIsLoading(false);
        onUnreadCountChange(0);
        setTimeout(scrollToBottom, 100);
      }
    }).catch(() => {
      if (!cancelled) setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [consultationId, onUnreadCountChange, scrollToBottom]);

  // Connect SSE stream
  useEffect(() => {
    if (!consultationId) return;

    const es = consultationService.connectMessageStream(consultationId);
    eventSourceRef.current = es;

    es.addEventListener('message', (event) => {
      try {
        const message: ConsultationMessage = JSON.parse(event.data);
        setMessages((prev) => {
          // Avoid duplicates (optimistic send)
          if (prev.some((m) => m.id === message.id)) return prev;
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
  }, [consultationId, onUnreadCountChange, scrollToBottom, user?.id]);

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

      const sent = await consultationService.sendMessage(
        consultationId,
        content || (file?.name || ''),
        undefined,
        attachment
      );
      // Replace optimistic with real message
      setMessages((prev) => prev.map((m) => m.id === optimistic.id ? sent : m));
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
                <AttachmentDisplay message={msg} />
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

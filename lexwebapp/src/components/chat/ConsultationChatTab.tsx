import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, MessageSquare, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { consultationService } from '../../services';
import type { ConsultationMessage } from '../../services/api/ConsultationService';

interface ConsultationChatTabProps {
  consultationId: string | null;
  onUnreadCountChange: (count: number) => void;
}

export function ConsultationChatTab({ consultationId, onUnreadCountChange }: ConsultationChatTabProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ConsultationMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

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
        onUnreadCountChange(0); // Messages are now read
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
      } catch {
        // ignore parse errors
      }
    });

    es.onerror = () => {
      // EventSource will auto-reconnect
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [consultationId, onUnreadCountChange, scrollToBottom]);

  const handleSend = async () => {
    if (!consultationId || !input.trim() || isSending) return;

    const content = input.trim();
    setInput('');
    setIsSending(true);

    // Optimistic append
    const optimistic: ConsultationMessage = {
      id: `optimistic-${Date.now()}`,
      consultation_id: consultationId,
      sender_id: user?.id || '',
      content,
      message_type: 'text',
      created_at: new Date().toISOString(),
      sender_name: user?.name || '',
    };
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(scrollToBottom, 50);

    try {
      const sent = await consultationService.sendMessage(consultationId, content);
      // Replace optimistic with real message
      setMessages((prev) => prev.map((m) => m.id === optimistic.id ? sent : m));
    } catch {
      // Remove optimistic on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(content); // restore input
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
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
                  ? 'bg-indigo-600 text-white rounded-br-sm'
                  : 'bg-gray-100 text-claude-text rounded-bl-sm'
              }`}>
                {!isMine && (
                  <p className="text-[10px] font-medium text-indigo-600 mb-0.5">
                    {msg.sender_name}
                  </p>
                )}
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                <p className={`text-[9px] mt-1 ${isMine ? 'text-indigo-200' : 'text-claude-subtext'}`}>
                  {new Date(msg.created_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="border-t border-claude-border/50 p-2">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Написати повідомлення..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-claude-border/50 px-3 py-2 text-[13px] placeholder:text-claude-subtext/50 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 max-h-24 overflow-y-auto bg-white"
            style={{ minHeight: '36px' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className="flex-shrink-0 p-2 rounded-lg bg-indigo-600 text-white disabled:opacity-40 hover:bg-indigo-700 transition-colors"
          >
            {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}

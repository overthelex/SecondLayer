import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Copy, Pencil, Check, X } from 'lucide-react';
import showToast from '../../utils/toast';

interface UserMessageProps {
  content: string;
  onEdit?: (newContent: string) => void;
}

export function UserMessage({ content, onEdit }: UserMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [isEditing]);

  const handleEditSave = useCallback(() => {
    const trimmed = editDraft.trim();
    if (trimmed && trimmed !== content) {
      onEdit?.(trimmed);
    }
    setIsEditing(false);
  }, [editDraft, content, onEdit]);

  const handleEditCancel = useCallback(() => {
    setEditDraft(content);
    setIsEditing(false);
  }, [content]);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleEditSave();
    }
    if (e.key === 'Escape') {
      handleEditCancel();
    }
  }, [handleEditSave, handleEditCancel]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      showToast.success('Скопійовано');
    }).catch(() => {
      showToast.error('Не вдалося скопіювати');
    });
  }, [content]);

  if (isEditing) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <div className="w-full max-w-[85%]">
          <textarea
            ref={textareaRef}
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            onKeyDown={handleEditKeyDown}
            rows={Math.min(10, editDraft.split('\n').length + 1)}
            className="w-full bg-claude-bg/80 border border-claude-text/30 rounded-2xl px-4 py-3 text-[15px] text-claude-text leading-relaxed resize-none focus:outline-none focus:border-claude-text/60 shadow-sm"
          />
          <div className="flex items-center justify-end gap-2 mt-1.5">
            <span className="text-[11px] text-claude-subtext">⌘↵ зберегти · Esc скасувати</span>
            <button
              onClick={handleEditCancel}
              className="flex items-center gap-1 px-2.5 py-1 text-[12px] text-claude-subtext hover:text-claude-text border border-claude-border rounded-lg transition-colors"
            >
              <X size={11} strokeWidth={2} /> Скасувати
            </button>
            <button
              onClick={handleEditSave}
              className="flex items-center gap-1 px-2.5 py-1 text-[12px] text-claude-text border border-claude-border bg-claude-bg rounded-lg hover:bg-claude-subtext/10 transition-colors"
            >
              <Check size={11} strokeWidth={2.5} /> Надіслати
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="max-w-[85%] bg-claude-bg/60 backdrop-blur-sm border border-claude-border/50 rounded-2xl px-4 py-3 shadow-sm">
        <p className="font-sans text-[15px] text-claude-text leading-relaxed whitespace-pre-wrap">
          {content}
        </p>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button
          onClick={handleCopy}
          className="p-1.5 text-claude-subtext hover:text-claude-text hover:bg-claude-subtext/8 rounded-md transition-all duration-200"
          title="Копіювати"
        >
          <Copy size={12} strokeWidth={2} />
        </button>
        {onEdit && (
          <button
            onClick={() => { setEditDraft(content); setIsEditing(true); }}
            className="p-1.5 text-claude-subtext hover:text-claude-text hover:bg-claude-subtext/8 rounded-md transition-all duration-200"
            title="Редагувати"
          >
            <Pencil size={12} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}

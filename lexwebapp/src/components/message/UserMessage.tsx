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
      <div className="flex flex-col items-end gap-2">
        <div className="w-full max-w-[82%]">
          <textarea
            ref={textareaRef}
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            onKeyDown={handleEditKeyDown}
            rows={Math.min(10, editDraft.split('\n').length + 1)}
            className="w-full bg-white border border-zinc-300 rounded-2xl px-4 py-3 text-[14px] text-zinc-900 leading-[1.65] resize-none focus:outline-none focus:ring-1 focus:ring-zinc-400 focus:border-zinc-400 shadow-sm transition-shadow duration-150"
          />
          <div className="flex items-center justify-end gap-2 mt-2">
            <span className="text-[11px] text-zinc-400 font-mono">⌘↵ зберегти · Esc скасувати</span>
            <button
              onClick={handleEditCancel}
              className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium text-zinc-500 hover:text-zinc-700 border border-zinc-200 hover:border-zinc-300 rounded-lg transition-colors duration-150"
            >
              <X size={11} strokeWidth={2} /> Скасувати
            </button>
            <button
              onClick={handleEditSave}
              className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-medium bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 transition-colors duration-150"
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
      <div className="max-w-[82%] bg-zinc-900 text-white rounded-2xl rounded-br-sm px-4 py-3 shadow-sm">
        <p className="font-sans text-[14px] leading-[1.65] whitespace-pre-wrap">
          {content}
        </p>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pr-0.5">
        <button
          onClick={handleCopy}
          className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-md transition-colors duration-150"
          title="Копіювати"
        >
          <Copy size={11} strokeWidth={2} />
        </button>
        {onEdit && (
          <button
            onClick={() => { setEditDraft(content); setIsEditing(true); }}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-md transition-colors duration-150"
            title="Редагувати"
          >
            <Pencil size={11} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}

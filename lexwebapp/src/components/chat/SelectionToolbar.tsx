import { useEffect, useState, useCallback, useRef } from 'react';
import { MessageSquareQuote, Quote } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '../../stores';

interface SelectionState {
  text: string;
  rect: DOMRect;
}

/**
 * Floating toolbar that appears when user selects text in assistant messages.
 * Two actions: "Запитати Лекс" (quote into input) and "Цитувати" (copy quote).
 */
export function SelectionToolbar() {
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const setDraftInput = useChatStore(s => s.setDraftInput);

  const handleMouseUp = useCallback(() => {
    // Small delay to let browser finalize selection
    requestAnimationFrame(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setSelection(null);
        return;
      }

      // Check if selection is within an assistant message
      const range = sel.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const messageEl = (container instanceof Element ? container : container.parentElement)
        ?.closest('[data-role="assistant"]');

      if (!messageEl) {
        setSelection(null);
        return;
      }

      const rect = range.getBoundingClientRect();
      setSelection({ text: sel.toString().trim(), rect });
    });
  }, []);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    // Dismiss toolbar when clicking outside it
    if (toolbarRef.current && toolbarRef.current.contains(e.target as Node)) return;
    setSelection(null);
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [handleMouseUp, handleMouseDown]);

  const handleAsk = useCallback(() => {
    if (!selection) return;
    setDraftInput(`> ${selection.text}\n\n`);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    // Focus input
    setTimeout(() => {
      document.getElementById('chat-message-input')?.focus();
    }, 0);
  }, [selection, setDraftInput]);

  const handleCopy = useCallback(() => {
    if (!selection) return;
    navigator.clipboard.writeText(selection.text);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }, [selection]);

  // Calculate position: above the selection, centered
  const getStyle = (): React.CSSProperties => {
    if (!selection) return {};
    const { rect } = selection;
    const toolbarWidth = 240;
    let left = rect.left + rect.width / 2 - toolbarWidth / 2;
    // Keep within viewport
    left = Math.max(8, Math.min(left, window.innerWidth - toolbarWidth - 8));
    return {
      position: 'fixed',
      top: rect.top - 44,
      left,
      zIndex: 9999,
    };
  };

  return (
    <AnimatePresence>
      {selection && (
        <motion.div
          ref={toolbarRef}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.15 }}
          style={getStyle()}
          className="flex items-center gap-0.5 px-1.5 py-1 bg-zinc-900 rounded-lg shadow-lg"
        >
          <button
            onClick={handleAsk}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium text-zinc-100 hover:bg-zinc-700 rounded-md transition-colors duration-100"
          >
            <MessageSquareQuote size={13} strokeWidth={2} />
            <span>Запитати Лекс</span>
          </button>
          <div className="w-px h-4 bg-zinc-700" />
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium text-zinc-100 hover:bg-zinc-700 rounded-md transition-colors duration-100"
          >
            <Quote size={13} strokeWidth={2} />
            <span>Цитувати</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

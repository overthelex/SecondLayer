import React from 'react';
import { Loader2, Check, Save } from 'lucide-react';
import { ImageViewer } from '../ImageViewer';
import type { DocumentViewerItem } from './types';

interface ImageOcrViewerProps {
  item: DocumentViewerItem;
  onSaveOcrText?: (documentId: string, text: string) => Promise<void>;
}

export function ImageOcrViewer({ item, onSaveOcrText }: ImageOcrViewerProps) {
  const [editedOcrText, setEditedOcrText] = React.useState('');
  const [ocrSaving, setOcrSaving] = React.useState(false);
  const [ocrSaved, setOcrSaved] = React.useState(false);

  const ocrTextareaRef = React.useRef<HTMLTextAreaElement>(null);

  // ZoomFollow: scroll textarea to match visible image range
  const handleVisibleRangeChange = React.useCallback((top: number, _bottom: number) => {
    const textarea = ocrTextareaRef.current;
    if (!textarea) return;
    const scrollTarget = top * (textarea.scrollHeight - textarea.clientHeight);
    textarea.scrollTo({ top: scrollTarget, behavior: 'smooth' });
  }, []);

  // Sync edited text when item changes
  React.useEffect(() => {
    if (item.ocrText !== undefined) {
      setEditedOcrText(item.ocrText);
      setOcrSaved(false);
    }
  }, [item.ocrText]);

  const handleSaveOcr = async () => {
    if (!item.documentId || !onSaveOcrText) return;
    setOcrSaving(true);
    try {
      await onSaveOcrText(item.documentId, editedOcrText);
      setOcrSaved(true);
      setTimeout(() => setOcrSaved(false), 2000);
    } finally {
      setOcrSaving(false);
    }
  };

  return (
    <div className="flex gap-4 h-full">
      {/* Left: Image preview with zoom/crop/follow */}
      <div className="flex-1 min-w-0">
        <ImageViewer
          src={item.previewUrl!}
          alt={item.title}
          onVisibleRangeChange={handleVisibleRangeChange}
        />
      </div>
      {/* Right: Editable OCR text */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-claude-subtext uppercase tracking-wide">
            Розпізнаний текст
          </span>
          {onSaveOcrText && item.documentId && (
            <button
              onClick={handleSaveOcr}
              disabled={ocrSaving || editedOcrText === item.ocrText}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all disabled:opacity-40 bg-claude-text text-white hover:bg-claude-text/90 disabled:hover:bg-claude-text"
            >
              {ocrSaving ? (
                <Loader2 size={12} className="animate-spin" />
              ) : ocrSaved ? (
                <Check size={12} />
              ) : (
                <Save size={12} />
              )}
              {ocrSaved ? 'Збережено' : 'Зберегти'}
            </button>
          )}
        </div>
        <textarea
          ref={ocrTextareaRef}
          value={editedOcrText}
          onChange={(e) => setEditedOcrText(e.target.value)}
          className="flex-1 w-full p-3 border border-claude-border rounded-lg text-sm text-claude-text font-mono resize-none focus:outline-none focus:border-claude-subtext/40 transition-colors leading-relaxed"
          placeholder="Текст не розпізнано"
        />
      </div>
    </div>
  );
}

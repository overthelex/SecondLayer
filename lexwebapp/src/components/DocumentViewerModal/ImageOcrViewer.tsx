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
    <div className="flex gap-5 h-full">
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
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.1em]">
            Розпізнаний текст
          </span>
          {onSaveOcrText && item.documentId && (
            <button
              onClick={handleSaveOcr}
              disabled={ocrSaving || editedOcrText === item.ocrText}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-md transition-all duration-150 disabled:opacity-40 bg-zinc-900 text-white hover:bg-zinc-800 border border-zinc-900"
            >
              {ocrSaving ? (
                <Loader2 size={11} className="animate-spin" />
              ) : ocrSaved ? (
                <Check size={11} />
              ) : (
                <Save size={11} />
              )}
              {ocrSaved ? 'Збережено' : 'Зберегти'}
            </button>
          )}
        </div>
        <textarea
          ref={ocrTextareaRef}
          value={editedOcrText}
          onChange={(e) => setEditedOcrText(e.target.value)}
          className="flex-1 w-full px-3.5 py-3 border border-zinc-200 rounded-lg text-[12.5px] text-zinc-700 font-mono resize-none focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 transition-all duration-150 leading-relaxed bg-white"
          placeholder="Текст не розпізнано"
        />
      </div>
    </div>
  );
}

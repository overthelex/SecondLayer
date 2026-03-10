import { Loader2, AlertTriangle } from 'lucide-react';
import type { DocumentViewerItem } from './types';
import { ImageOcrViewer } from './ImageOcrViewer';
import { ImageOnlyViewer, PdfViewer, VideoViewer } from './MediaViewer';
import { MarkdownViewer } from './MarkdownViewer';

interface ContentRendererProps {
  item: DocumentViewerItem;
  isLoading?: boolean;
  errorMessage?: string | null;
  onSaveOcrText?: (documentId: string, text: string) => Promise<void>;
}

export function ContentRenderer({ item, isLoading, errorMessage, onSaveOcrText }: ContentRendererProps) {
  const isImageWithOcr = item.previewUrl && item.mimeType?.startsWith('image/') && item.ocrText !== undefined;

  return (
    <>
      {errorMessage && (
        <div className="flex items-start gap-3 p-3 mb-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[13px]">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" strokeWidth={2} />
          <span>{errorMessage}</span>
        </div>
      )}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 text-claude-subtext">
          <Loader2 size={28} className="animate-spin mb-3" strokeWidth={2} />
          <p className="text-[13px]">Завантаження...</p>
        </div>
      ) : isImageWithOcr ? (
        <ImageOcrViewer item={item} onSaveOcrText={onSaveOcrText} />
      ) : item.previewUrl && item.mimeType?.startsWith('image/') ? (
        <ImageOnlyViewer item={item} />
      ) : item.previewUrl && item.mimeType === 'application/pdf' ? (
        <PdfViewer item={item} />
      ) : item.previewUrl && item.mimeType?.startsWith('video/') ? (
        <VideoViewer item={item} />
      ) : (
        <MarkdownViewer content={item.content} />
      )}
    </>
  );
}

import { ImageViewer } from '../ImageViewer';
import type { DocumentViewerItem } from './types';

interface MediaViewerProps {
  item: DocumentViewerItem;
}

export function ImageOnlyViewer({ item }: MediaViewerProps) {
  return (
    <div className="h-[70vh]">
      <ImageViewer
        src={item.previewUrl!}
        alt={item.title}
      />
    </div>
  );
}

export function PdfViewer({ item }: MediaViewerProps) {
  return (
    <iframe
      src={item.previewUrl!}
      className="w-full h-[70vh] rounded-lg border border-claude-border"
      title={item.title}
    />
  );
}

export function VideoViewer({ item }: MediaViewerProps) {
  return (
    <div className="flex items-center justify-center">
      <video
        src={item.previewUrl!}
        controls
        className="max-w-full max-h-[70vh] rounded-lg"
      />
    </div>
  );
}

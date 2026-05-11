import { useState, useCallback, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  FileCode,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PaperReaderProps {
  pdfUrl: string;
  texUrl?: string;
  title: string;
}

export function PaperReader({ pdfUrl, texUrl, title }: PaperReaderProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setCurrentPage(1);
  }, []);

  const goToPage = useCallback((page: number) => {
    setCurrentPage((prev) => Math.max(1, Math.min(page, numPages || prev)));
  }, [numPages]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCurrentPage((p) => Math.max(1, p - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setCurrentPage((p) => Math.min(numPages, p + 1));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setCurrentPage(1);
      } else if (e.key === 'End') {
        e.preventDefault();
        setCurrentPage(numPages);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [numPages]);

  const zoomIn = () => setScale((s) => Math.min(s + 0.2, 2.5));
  const zoomOut = () => setScale((s) => Math.max(s - 0.2, 0.5));
  const resetZoom = () => setScale(1.0);

  const pageWidth = containerWidth > 0 ? Math.min(containerWidth - 32, 900) * scale : undefined;

  return (
    <div className="mt-8 rounded-2xl border border-purple-200 bg-white overflow-hidden">
      {/* Toolbar */}
      <div className="sticky top-16 z-10 bg-white border-b border-purple-200 px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Page navigation */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => goToPage(1)}
              disabled={currentPage <= 1}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-purple-50 text-purple-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title="First page"
            >
              <ChevronsLeft size={16} />
            </button>
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-purple-50 text-purple-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title="Previous page"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex items-center gap-1.5 px-2">
              <input
                type="number"
                min={1}
                max={numPages}
                value={currentPage}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) goToPage(val);
                }}
                className="w-12 h-8 text-center text-sm font-mono border border-purple-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent"
              />
              <span className="text-sm text-claude-subtext font-sans">/ {numPages}</span>
            </div>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= numPages}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-purple-50 text-purple-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title="Next page"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => goToPage(numPages)}
              disabled={currentPage >= numPages}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-purple-50 text-purple-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              title="Last page"
            >
              <ChevronsRight size={16} />
            </button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={zoomOut}
              disabled={scale <= 0.5}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-purple-50 text-purple-600 disabled:opacity-30 transition-colors"
              title="Zoom out"
            >
              <ZoomOut size={16} />
            </button>
            <button
              onClick={resetZoom}
              className="h-8 px-2 text-xs font-mono text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
              title="Reset zoom"
            >
              {Math.round(scale * 100)}%
            </button>
            <button
              onClick={zoomIn}
              disabled={scale >= 2.5}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-purple-50 text-purple-600 disabled:opacity-30 transition-colors"
              title="Zoom in"
            >
              <ZoomIn size={16} />
            </button>
            <button
              onClick={() => window.open(pdfUrl, '_blank')}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-purple-50 text-purple-600 transition-colors"
              title="Open in full screen"
            >
              <Maximize2 size={16} />
            </button>
          </div>

          {/* Download buttons */}
          <div className="flex items-center gap-2">
            <a
              href={pdfUrl}
              download
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-sans font-medium hover:bg-purple-700 transition-colors"
            >
              <Download size={14} />
              PDF
            </a>
            {texUrl && (
              <a
                href={texUrl}
                download
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-purple-300 text-purple-700 rounded-lg text-sm font-sans font-medium hover:bg-purple-50 transition-colors"
              >
                <FileCode size={14} />
                LaTeX
              </a>
            )}
          </div>
        </div>
      </div>

      {/* PDF page */}
      <div
        ref={containerRef}
        className="flex justify-center bg-gray-100 min-h-[60vh] overflow-x-auto py-6"
      >
        <Document
          file={pdfUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="flex items-center justify-center py-32">
              <div className="animate-pulse text-sm text-claude-subtext font-sans">
                Loading paper...
              </div>
            </div>
          }
          error={
            <div className="flex flex-col items-center justify-center py-32 gap-3">
              <p className="text-sm text-claude-subtext font-sans">Failed to load PDF</p>
              <a
                href={pdfUrl}
                download
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-sans font-medium hover:bg-purple-700 transition-colors"
              >
                <Download size={16} />
                Download instead
              </a>
            </div>
          }
          className="[&_.react-pdf__Document]:flex [&_.react-pdf__Document]:justify-center"
        >
          <Page
            pageNumber={currentPage}
            width={pageWidth}
            className="shadow-lg rounded-lg overflow-hidden"
            renderTextLayer={true}
            renderAnnotationLayer={true}
          />
        </Document>
      </div>

      {/* Bottom navigation for mobile */}
      <div className="border-t border-purple-200 bg-white px-4 py-3 flex items-center justify-between sm:hidden">
        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1}
          className="flex items-center gap-1 px-3 py-2 text-sm font-sans text-purple-600 disabled:opacity-30 transition-colors"
        >
          <ChevronLeft size={16} /> Prev
        </button>
        <span className="text-sm font-mono text-claude-subtext">
          {currentPage} / {numPages}
        </span>
        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage >= numPages}
          className="flex items-center gap-1 px-3 py-2 text-sm font-sans text-purple-600 disabled:opacity-30 transition-colors"
        >
          Next <ChevronRight size={16} />
        </button>
      </div>

      {/* Paper title bar */}
      <div className="border-t border-purple-100 bg-purple-50/50 px-4 py-2">
        <p className="text-xs text-purple-600/70 font-sans truncate">{title}</p>
      </div>
    </div>
  );
}

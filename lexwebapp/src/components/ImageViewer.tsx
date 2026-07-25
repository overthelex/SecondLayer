import React, { useRef, useState, useCallback, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, RotateCw, Crop, ScanEye, Move } from 'lucide-react';

interface ImageViewerProps {
  src: string;
  alt: string;
  /** Callback with normalized vertical range [0..1, 0..1] visible in the viewport */
  onVisibleRangeChange?: (top: number, bottom: number) => void;
}

type Mode = 'zoom' | 'crop';

const MIN_SCALE = 1;
const MAX_SCALE = 8;
const ZOOM_STEP = 1.4;
const LONG_PRESS_MS = 200;

export function ImageViewer({ src, alt, onVisibleRangeChange }: ImageViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Transform state
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);

  // Mode state
  const [mode, setMode] = useState<Mode>('zoom');
  const [followEnabled, setFollowEnabled] = useState(false);

  // Pan state
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didPan = useRef(false);

  // Crop state
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
  const [cropEnd, setCropEnd] = useState<{ x: number; y: number } | null>(null);
  const [isCropping, setIsCropping] = useState(false);

  // --- Zoom helpers ---
  const clampTranslate = useCallback((tx: number, ty: number, s: number) => {
    if (s <= 1) return { x: 0, y: 0 };
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img) return { x: tx, y: ty };

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    // Displayed image size
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;
    // Base size (scale=1) — object-contain
    const baseScale = Math.min(cw / naturalW, ch / naturalH);
    const baseW = naturalW * baseScale;
    const baseH = naturalH * baseScale;
    const scaledW = baseW * s;
    const scaledH = baseH * s;

    const maxTx = Math.max(0, (scaledW - cw) / 2);
    const maxTy = Math.max(0, (scaledH - ch) / 2);

    return {
      x: Math.max(-maxTx, Math.min(maxTx, tx)),
      y: Math.max(-maxTy, Math.min(maxTy, ty)),
    };
  }, []);

  const applyZoom = useCallback((newScale: number, originX?: number, originY?: number) => {
    const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
    setScale(prev => {
      const container = containerRef.current;
      if (container && originX !== undefined && originY !== undefined) {
        // Zoom towards the pointer position
        const rect = container.getBoundingClientRect();
        const cx = originX - rect.left - rect.width / 2;
        const cy = originY - rect.top - rect.height / 2;
        setTranslate(t => {
          const factor = clamped / prev;
          const nx = cx - factor * (cx - t.x);
          const ny = cy - factor * (cy - t.y);
          return clampTranslate(nx, ny, clamped);
        });
      } else {
        setTranslate(t => clampTranslate(t.x * (clamped / prev), t.y * (clamped / prev), clamped));
      }
      return clamped;
    });
  }, [clampTranslate]);

  const zoomIn = useCallback((originX?: number, originY?: number) => {
    applyZoom(scale * ZOOM_STEP, originX, originY);
  }, [scale, applyZoom]);

  const zoomOut = useCallback((originX?: number, originY?: number) => {
    applyZoom(scale / ZOOM_STEP, originX, originY);
  }, [scale, applyZoom]);

  const resetZoom = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    setRotation(0);
  }, []);

  // --- Visible range reporting for ZoomFollow ---
  useEffect(() => {
    if (!followEnabled || !onVisibleRangeChange) return;

    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img) return;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const naturalH = img.naturalHeight;
    const naturalW = img.naturalWidth;
    if (!naturalH || !naturalW) return;

    const baseScale = Math.min(cw / naturalW, ch / naturalH);
    const baseH = naturalH * baseScale;
    const scaledH = baseH * scale;

    // Image top relative to container center
    const imgTop = (ch - scaledH) / 2 + translate.y;

    // Visible portion of the image
    const visibleTop = Math.max(0, -imgTop);
    const visibleBottom = Math.min(scaledH, ch - imgTop);

    const top = Math.max(0, Math.min(1, visibleTop / scaledH));
    const bottom = Math.max(0, Math.min(1, visibleBottom / scaledH));

    onVisibleRangeChange(top, bottom);
  }, [scale, translate, followEnabled, onVisibleRangeChange]);

  // --- Keyboard shortcuts ---
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      // Ctrl+ / Ctrl- zoom
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoomIn();
      } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        zoomOut();
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        resetZoom();
      }

      // "c" to confirm crop
      if (e.key === 'c' && !e.ctrlKey && !e.metaKey && mode === 'crop' && cropStart && cropEnd) {
        e.preventDefault();
        applyCrop();
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [zoomIn, zoomOut, resetZoom, mode, cropStart, cropEnd]);

  // --- Mouse wheel zoom ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        applyZoom(scale * 1.15, e.clientX, e.clientY);
      } else {
        applyZoom(scale / 1.15, e.clientX, e.clientY);
      }
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [scale, applyZoom]);

  // --- Mouse handlers for zoom mode ---
  const handleMouseDown = (e: React.MouseEvent) => {
    if (mode !== 'zoom') return;
    if (e.button !== 0) return;
    didPan.current = false;
    // Start long-press timer for panning
    longPressTimer.current = setTimeout(() => {
      setIsPanning(true);
      didPan.current = true;
      panStart.current = { x: e.clientX, y: e.clientY, tx: translate.x, ty: translate.y };
    }, LONG_PRESS_MS);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (mode === 'zoom' && isPanning) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setTranslate(clampTranslate(panStart.current.tx + dx, panStart.current.ty + dy, scale));
    }
    if (mode === 'crop' && isCropping) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setCropEnd({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (mode === 'zoom') {
      if (isPanning) {
        setIsPanning(false);
      } else if (!didPan.current) {
        // Single click = zoom in at point
        zoomIn(e.clientX, e.clientY);
      }
    }
    if (mode === 'crop' && isCropping) {
      setIsCropping(false);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (mode === 'zoom') {
      e.preventDefault();
      if (scale > 1) {
        resetZoom();
      } else {
        zoomIn(e.clientX, e.clientY);
      }
    }
  };

  // --- Crop mouse handlers ---
  const handleCropMouseDown = (e: React.MouseEvent) => {
    if (mode !== 'crop') return;
    if (e.button !== 0) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setCropStart(pos);
    setCropEnd(pos);
    setIsCropping(true);
  };

  const applyCrop = useCallback(() => {
    if (!cropStart || !cropEnd || !imgRef.current || !containerRef.current) return;

    const container = containerRef.current;
    const img = imgRef.current;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const naturalW = img.naturalWidth;
    const naturalH = img.naturalHeight;
    const baseScale = Math.min(cw / naturalW, ch / naturalH);

    // Image position in container
    const imgDisplayW = naturalW * baseScale * scale;
    const imgDisplayH = naturalH * baseScale * scale;
    const imgLeft = (cw - imgDisplayW) / 2 + translate.x;
    const imgTop = (ch - imgDisplayH) / 2 + translate.y;

    // Crop rect in container coords
    const rx = Math.min(cropStart.x, cropEnd.x);
    const ry = Math.min(cropStart.y, cropEnd.y);
    const rw = Math.abs(cropEnd.x - cropStart.x);
    const rh = Math.abs(cropEnd.y - cropStart.y);

    if (rw < 5 || rh < 5) {
      setCropStart(null);
      setCropEnd(null);
      return;
    }

    // Convert to natural image coords
    const sx = ((rx - imgLeft) / imgDisplayW) * naturalW;
    const sy = ((ry - imgTop) / imgDisplayH) * naturalH;
    const sw = (rw / imgDisplayW) * naturalW;
    const sh = (rh / imgDisplayH) * naturalH;

    // Clamp to image bounds
    const csx = Math.max(0, Math.min(naturalW, sx));
    const csy = Math.max(0, Math.min(naturalH, sy));
    const csw = Math.min(sw, naturalW - csx);
    const csh = Math.min(sh, naturalH - csy);

    if (csw < 1 || csh < 1) {
      setCropStart(null);
      setCropEnd(null);
      return;
    }

    // Crop via canvas
    const canvas = document.createElement('canvas');
    canvas.width = csw;
    canvas.height = csh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, csx, csy, csw, csh, 0, 0, csw, csh);

    // Replace the image src with the cropped version
    const dataUrl = canvas.toDataURL('image/png');
    img.src = dataUrl;

    // Reset view state
    setCropStart(null);
    setCropEnd(null);
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    setRotation(0);
    setMode('zoom');
  }, [cropStart, cropEnd, scale, translate]);

  // Crop rectangle coordinates
  const cropRect = cropStart && cropEnd ? {
    left: Math.min(cropStart.x, cropEnd.x),
    top: Math.min(cropStart.y, cropEnd.y),
    width: Math.abs(cropEnd.x - cropStart.x),
    height: Math.abs(cropEnd.y - cropStart.y),
  } : null;

  const cursorStyle = mode === 'crop'
    ? 'crosshair'
    : isPanning
    ? 'grabbing'
    : scale > 1
    ? 'grab'
    : 'zoom-in';

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 mb-2 px-1">
        <button
          onClick={() => zoomIn()}
          className="p-1.5 rounded-md text-claude-subtext hover:text-claude-text hover:bg-claude-bg transition-all"
          title="Збільшити (Ctrl+)"
        >
          <ZoomIn size={16} strokeWidth={2} />
        </button>
        <button
          onClick={() => zoomOut()}
          className="p-1.5 rounded-md text-claude-subtext hover:text-claude-text hover:bg-claude-bg transition-all"
          title="Зменшити (Ctrl-)"
        >
          <ZoomOut size={16} strokeWidth={2} />
        </button>
        <button
          onClick={resetZoom}
          className="p-1.5 rounded-md text-claude-subtext hover:text-claude-text hover:bg-claude-bg transition-all"
          title="Скинути масштаб (Ctrl+0)"
        >
          <RotateCcw size={16} strokeWidth={2} />
        </button>

        <div className="w-px h-4 bg-claude-border mx-1" />

        <button
          onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
          className="p-1.5 rounded-md text-claude-subtext hover:text-claude-text hover:bg-claude-bg transition-all"
          title="Повернути проти годинникової"
        >
          <RotateCcw size={16} strokeWidth={2} />
        </button>
        <button
          onClick={() => setRotation((r) => (r + 90) % 360)}
          className="p-1.5 rounded-md text-claude-subtext hover:text-claude-text hover:bg-claude-bg transition-all"
          title="Повернути за годинниковою"
        >
          <RotateCw size={16} strokeWidth={2} />
        </button>

        <div className="w-px h-4 bg-claude-border mx-1" />

        <span className="text-[11px] text-claude-subtext tabular-nums min-w-[3ch] text-center">
          {Math.round(scale * 100)}%
        </span>

        <div className="w-px h-4 bg-claude-border mx-1" />

        <button
          onClick={() => { setMode(mode === 'crop' ? 'zoom' : 'crop'); setCropStart(null); setCropEnd(null); }}
          className={`p-1.5 rounded-md transition-all ${mode === 'crop' ? 'bg-claude-text text-white' : 'text-claude-subtext hover:text-claude-text hover:bg-claude-bg'}`}
          title="Обрізати (виділіть область, натисніть C)"
        >
          <Crop size={16} strokeWidth={2} />
        </button>

        {onVisibleRangeChange && (
          <>
            <div className="w-px h-4 bg-claude-border mx-1" />
            <button
              onClick={() => setFollowEnabled(!followEnabled)}
              className={`p-1.5 rounded-md transition-all ${followEnabled ? 'bg-claude-text text-white' : 'text-claude-subtext hover:text-claude-text hover:bg-claude-bg'}`}
              title="Слідкування за зумом"
            >
              <ScanEye size={16} strokeWidth={2} />
            </button>
          </>
        )}

        {isPanning && (
          <>
            <div className="w-px h-4 bg-claude-border mx-1" />
            <Move size={14} className="text-claude-subtext" />
          </>
        )}
      </div>

      {/* Image container */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 relative bg-claude-bg/50 rounded-lg overflow-hidden select-none"
        style={{ cursor: cursorStyle }}
        onMouseDown={mode === 'crop' ? handleCropMouseDown : handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onMouseLeave={() => {
          if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
          if (isPanning) setIsPanning(false);
          if (isCropping) setIsCropping(false);
        }}
      >
        <div
          className="w-full h-full flex items-center justify-center"
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale}) rotate(${rotation}deg)`,
            transformOrigin: 'center center',
            transition: isPanning || isCropping ? 'none' : 'transform 0.2s ease-out',
          }}
        >
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            className="max-w-full max-h-full object-contain"
            draggable={false}
          />
        </div>

        {/* Crop overlay */}
        {mode === 'crop' && cropRect && cropRect.width > 2 && cropRect.height > 2 && (
          <>
            {/* Dimmed overlay with cutout */}
            <div className="absolute inset-0 pointer-events-none">
              <svg className="w-full h-full">
                <defs>
                  <mask id="crop-mask">
                    <rect width="100%" height="100%" fill="white" />
                    <rect
                      x={cropRect.left}
                      y={cropRect.top}
                      width={cropRect.width}
                      height={cropRect.height}
                      fill="black"
                    />
                  </mask>
                </defs>
                <rect width="100%" height="100%" fill="rgba(0,0,0,0.4)" mask="url(#crop-mask)" />
              </svg>
            </div>
            {/* Selection border */}
            <div
              className="absolute border-2 border-white shadow-lg pointer-events-none"
              style={{
                left: cropRect.left,
                top: cropRect.top,
                width: cropRect.width,
                height: cropRect.height,
              }}
            >
              {/* Corner handles */}
              {[
                { top: -3, left: -3 },
                { top: -3, right: -3 },
                { bottom: -3, left: -3 },
                { bottom: -3, right: -3 },
              ].map((pos, i) => (
                <div
                  key={i}
                  className="absolute w-2 h-2 bg-white border border-claude-border shadow-sm"
                  style={pos as React.CSSProperties}
                />
              ))}
            </div>
            {/* Hint */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-black/70 text-white text-xs rounded-full pointer-events-none">
              Натисніть <kbd className="px-1.5 py-0.5 bg-white/20 rounded text-[11px] font-mono">C</kbd> щоб обрізати
            </div>
          </>
        )}
      </div>
    </div>
  );
}

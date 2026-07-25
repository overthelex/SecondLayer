import { useEffect, useRef, useState } from 'react';

const BANNER_WIDTH = 800;
const BANNER_HEIGHT = 200;
const MIN_RADIUS = 4;
const MAX_RADIUS = 18;
const GRID_STEP = 12;

function seededRandom(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function generatePalette(baseHue: number, rand: () => number): string[] {
  const colors: string[] = [];
  for (let i = 0; i < 15; i++) {
    const h = (baseHue + (rand() - 0.5) * 30) % 360;
    const s = 45 + rand() * 30;
    const l = 35 + rand() * 25;
    colors.push(`hsl(${h.toFixed(0)}, ${s.toFixed(0)}%, ${l.toFixed(0)}%)`);
  }
  return colors;
}

function getUserPalettes(rand: () => number): { bg: string[]; text: string[] } {
  const bgHue = rand() * 360;
  const textHue = (bgHue + 120 + rand() * 120) % 360;
  return {
    bg: generatePalette(bgHue, rand),
    text: generatePalette(textHue, rand),
  };
}

function createTextMask(name: string, width: number, height: number): boolean[][] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const displayName = name.length > 20 ? name.substring(0, 20) : name;
  const fontSize = Math.min(72, Math.max(36, Math.floor(600 / Math.max(displayName.length, 1))));

  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'white';
  ctx.font = `bold ${fontSize}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(displayName, width / 2, height / 2);

  const imageData = ctx.getImageData(0, 0, width, height);
  const mask: boolean[][] = [];
  for (let y = 0; y < height; y++) {
    mask[y] = [];
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      mask[y][x] = imageData.data[idx] > 128;
    }
  }
  return mask;
}

function generateCircles(seed: string, name: string): string {
  const rand = seededRandom(hashString(seed));
  const { bg: bgPalette, text: textPalette } = getUserPalettes(rand);
  const textMask = createTextMask(name, BANNER_WIDTH, BANNER_HEIGHT);

  const circles: string[] = [];

  for (let gy = MIN_RADIUS; gy < BANNER_HEIGHT - MIN_RADIUS; gy += GRID_STEP) {
    for (let gx = MIN_RADIUS; gx < BANNER_WIDTH - MIN_RADIUS; gx += GRID_STEP) {
      const x = gx + (rand() - 0.5) * GRID_STEP * 0.8;
      const y = gy + (rand() - 0.5) * GRID_STEP * 0.8;
      const r = MIN_RADIUS + rand() * (MAX_RADIUS - MIN_RADIUS);

      const mx = Math.round(Math.min(Math.max(x, 0), BANNER_WIDTH - 1));
      const my = Math.round(Math.min(Math.max(y, 0), BANNER_HEIGHT - 1));
      const isText = textMask[my]?.[mx] ?? false;

      const palette = isText ? textPalette : bgPalette;
      const color = palette[Math.floor(rand() * palette.length)];
      const opacity = 0.7 + rand() * 0.3;

      circles.push(
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" opacity="${opacity.toFixed(2)}"/>`
      );
    }
  }

  return `<svg width="${BANNER_WIDTH}" height="${BANNER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${BANNER_WIDTH}" height="${BANNER_HEIGHT}" fill="#1a1a2e"/>
  ${circles.join('\n  ')}
</svg>`;
}

interface IshiharaBannerProps {
  seed: string;
  name: string;
  className?: string;
}

export function IshiharaBanner({ seed, name, className = '' }: IshiharaBannerProps) {
  const [svgDataUrl, setSvgDataUrl] = useState<string | null>(null);
  const generatedRef = useRef<string | null>(null);

  useEffect(() => {
    const key = `${seed}:${name}`;
    if (generatedRef.current === key) return;
    generatedRef.current = key;

    const svg = generateCircles(seed, name);
    const encoded = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
    setSvgDataUrl(encoded);
  }, [seed, name]);

  if (!svgDataUrl) {
    return <div className={`bg-gradient-to-r from-claude-accent/10 to-claude-bg ${className}`} />;
  }

  return (
    <img
      src={svgDataUrl}
      alt=""
      className={`object-cover ${className}`}
    />
  );
}

import { useEffect, useRef, useCallback, useState } from 'react';

// ─── Seeded PRNG (mulberry32) ──────────────────────────────────────────────────

function hashString(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}

function seededRandom(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Color interpolation ───────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function sampleGradient(rgbs: [number, number, number][], t: number): [number, number, number] {
  const ct = Math.max(0, Math.min(1, t));
  const seg = ct * (rgbs.length - 1);
  const i = Math.floor(seg);
  const f = seg - i;
  const c1 = rgbs[Math.min(i, rgbs.length - 1)];
  const c2 = rgbs[Math.min(i + 1, rgbs.length - 1)];
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * f),
    Math.round(c1[1] + (c2[1] - c1[1]) * f),
    Math.round(c1[2] + (c2[2] - c1[2]) * f),
  ];
}

// ─── Attractor types ───────────────────────────────────────────────────────────

interface Point3D { x: number; y: number; z: number }
type AttractorFn = (p: Point3D, dt: number, params: number[]) => Point3D;

const lorenz: AttractorFn = (p, dt, [sigma, rho, beta]) => ({
  x: p.x + sigma * (p.y - p.x) * dt,
  y: p.y + (p.x * (rho - p.z) - p.y) * dt,
  z: p.z + (p.x * p.y - beta * p.z) * dt,
});

const rossler: AttractorFn = (p, dt, [a, b, c]) => ({
  x: p.x + (-p.y - p.z) * dt,
  y: p.y + (p.x + a * p.y) * dt,
  z: p.z + (b + p.z * (p.x - c)) * dt,
});

const aizawa: AttractorFn = (p, dt, [a, b, c, d, e, f]) => ({
  x: p.x + ((p.z - b) * p.x - d * p.y) * dt,
  y: p.y + (d * p.x + (p.z - b) * p.y) * dt,
  z: p.z + (c + a * p.z - p.z ** 3 / 3 - (p.x ** 2 + p.y ** 2) * (1 + e * p.z) + f * p.z * p.x ** 3) * dt,
});

const thomas: AttractorFn = (p, dt, [b]) => ({
  x: p.x + (Math.sin(p.y) - b * p.x) * dt,
  y: p.y + (Math.sin(p.z) - b * p.y) * dt,
  z: p.z + (Math.sin(p.x) - b * p.z) * dt,
});

const halvorsen: AttractorFn = (p, dt, [a]) => ({
  x: p.x + (-a * p.x - 4 * p.y - 4 * p.z - p.y ** 2) * dt,
  y: p.y + (-a * p.y - 4 * p.z - 4 * p.x - p.z ** 2) * dt,
  z: p.z + (-a * p.z - 4 * p.x - 4 * p.y - p.x ** 2) * dt,
});

const ATTRACTORS = [
  { fn: lorenz, params: [10, 28, 8 / 3], init: { x: 0.1, y: 0, z: 0 }, dt: 0.005, scale: 6 },
  { fn: rossler, params: [0.2, 0.2, 5.7], init: { x: 0.1, y: 0, z: 0 }, dt: 0.02, scale: 3.5 },
  { fn: aizawa, params: [0.95, 0.7, 0.6, 3.5, 0.25, 0.1], init: { x: 0.1, y: 0, z: 0 }, dt: 0.01, scale: 2.8 },
  { fn: thomas, params: [0.208186], init: { x: 1, y: 0, z: 0 }, dt: 0.05, scale: 1.5 },
  { fn: halvorsen, params: [1.89], init: { x: -1.48, y: -1.51, z: 2.04 }, dt: 0.003, scale: 1.8 },
];

// ─── 12-stop palettes ──────────────────────────────────────────────────────────

const PALETTES = [
  { bg: '#504545', colors: ['#2d0808', '#4a0e0e', '#722020', '#8b1a1a', '#b83030', '#c0392b', '#e74c3c', '#ff6b6b', '#ff9a76', '#ffbe88', '#ffd93d', '#fff3b0'] },
  { bg: '#3e5060', colors: ['#071e2e', '#0c2d48', '#0f3f5e', '#145374', '#0d7d78', '#0d9488', '#14b8a6', '#2dd4bf', '#67e8f9', '#a5f3fc', '#bae6fd', '#e0f2fe'] },
  { bg: '#483f5a', colors: ['#1a0840', '#2e1065', '#3b1990', '#5b21b6', '#6d30d0', '#7c3aed', '#a78bfa', '#c084fc', '#d8b4fe', '#e879f9', '#f0abfc', '#fce7f3'] },
  { bg: '#3e5448', colors: ['#021a0b', '#052e16', '#0b4a24', '#166534', '#1a8a44', '#22c55e', '#4ade80', '#6ee7a0', '#86efac', '#a7f3d0', '#d9f99d', '#fef9c3'] },
  { bg: '#504a38', colors: ['#2a1500', '#451a03', '#6b3000', '#92400e', '#b45309', '#d97706', '#f59e0b', '#fbbf24', '#fcd34d', '#fde68a', '#fef3c7', '#fffbeb'] },
];

const PALETTE_RGBS = PALETTES.map(p => p.colors.map(hexToRgb));

// ─── Projection (inlined for typed-array path) ────────────────────────────────

function projectToArrays(
  points: Float32Array, // x,y,z,t interleaved
  count: number,
  out: Float32Array,    // px,py,depth,t interleaved
  w: number, h: number, scale: number,
  rotY: number, rotX: number,
): { minD: number; maxD: number } {
  const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
  const fov = 180;
  const hw = w / 2, hh = h / 2;
  let minD = Infinity, maxD = -Infinity;

  for (let i = 0; i < count; i++) {
    const off = i * 4;
    const px = points[off], py = points[off + 1], pz = points[off + 2];

    // Rotate Y
    const rx = px * cosY - pz * sinY;
    const rz = px * sinY + pz * cosY;
    // Rotate X
    const ry = py * cosX - rz * sinX;
    const depth = py * sinX + rz * cosX;

    const d = depth * scale + fov;
    const ps = fov / (d > 50 ? d : 50);

    out[off] = hw + rx * scale * ps;
    out[off + 1] = hh + ry * scale * ps;
    out[off + 2] = d;
    out[off + 3] = points[off + 3];

    if (d < minD) minD = d;
    if (d > maxD) maxD = d;
  }

  return { minD, maxD };
}

// ─── Generate points (typed arrays) ───────────────────────────────────────────

function generatePoints(seed: string) {
  const rand = seededRandom(hashString(seed));
  const attractorIdx = Math.floor(rand() * ATTRACTORS.length);
  const paletteIdx = Math.floor(rand() * PALETTES.length);
  const attractor = ATTRACTORS[attractorIdx];
  const palette = PALETTES[paletteIdx];
  const rgbs = PALETTE_RGBS[paletteIdx];
  const baseRotY = rand() * Math.PI * 2;
  const baseRotX = rand() * 0.6 - 0.3;

  const ITERATIONS = 60000;
  let p = { ...attractor.init };
  for (let i = 0; i < 500; i++) p = attractor.fn(p, attractor.dt, attractor.params);

  // Store as interleaved Float32Array: [x,y,z,t, x,y,z,t, ...]
  const points = new Float32Array(ITERATIONS * 4);
  for (let i = 0; i < ITERATIONS; i++) {
    p = attractor.fn(p, attractor.dt, attractor.params);
    const off = i * 4;
    points[off] = p.x;
    points[off + 1] = p.y;
    points[off + 2] = p.z;
    points[off + 3] = i / ITERATIONS;
  }

  // Auto-scale: compute a scale factor so the attractor fills ~85% of the canvas
  const testSc = attractor.scale * 20;
  const projected = new Float32Array(ITERATIONS * 4);
  projectToArrays(points, ITERATIONS, projected, 1920, 960, testSc, baseRotY, baseRotX);

  let pxMinX = Infinity, pxMaxX = -Infinity;
  let pxMinY = Infinity, pxMaxY = -Infinity;
  for (let i = 0; i < ITERATIONS; i++) {
    const off = i * 4;
    const sx = projected[off], sy = projected[off + 1];
    if (sx < pxMinX) pxMinX = sx; if (sx > pxMaxX) pxMaxX = sx;
    if (sy < pxMinY) pxMinY = sy; if (sy > pxMaxY) pxMaxY = sy;
  }
  const pxWidth = pxMaxX - pxMinX || 1;
  const pxHeight = pxMaxY - pxMinY || 1;
  const targetFill = 1.6;
  const fitScaleX = (1920 * targetFill) / pxWidth;
  const fitScaleY = (960 * targetFill) / pxHeight;
  const autoScale = Math.min(fitScaleX, fitScaleY) * testSc;

  return { points, count: ITERATIONS, attractor, palette, rgbs, baseRotY, baseRotX, autoScale };
}

// ─── Sort helper: radix sort on depth (much faster than Array.sort for 60k) ──

function radixSortByDepth(
  projected: Float32Array, count: number,
  indices: Uint16Array,
): void {
  // Bucket sort into 256 buckets by depth
  const BUCKETS = 256;
  const bucketCounts = new Uint32Array(BUCKETS);
  const depthKeys = new Uint8Array(count);

  // Find depth range
  let minD = Infinity, maxD = -Infinity;
  for (let i = 0; i < count; i++) {
    const d = projected[i * 4 + 2];
    if (d < minD) minD = d;
    if (d > maxD) maxD = d;
  }
  const range = maxD - minD || 1;

  // Assign bucket keys
  for (let i = 0; i < count; i++) {
    const key = Math.min(255, ((projected[i * 4 + 2] - minD) / range * 255) | 0);
    depthKeys[i] = key;
    bucketCounts[key]++;
  }

  // Prefix sum
  const offsets = new Uint32Array(BUCKETS);
  for (let i = 1; i < BUCKETS; i++) offsets[i] = offsets[i - 1] + bucketCounts[i - 1];

  // Scatter
  const tempIndices = new Uint16Array(count);
  for (let i = 0; i < count; i++) {
    tempIndices[offsets[depthKeys[i]]++] = i;
  }

  tempIndices.forEach((v, i) => { indices[i] = v; });
}

// ─── Draw frame ────────────────────────────────────────────────────────────────

function drawFrame(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  data: ReturnType<typeof generatePoints>,
  rotDelta: number,
  animPhase: number,
  brightness: number,
  projected: Float32Array,
  sortIndices: Uint16Array,
) {
  const { points, count, palette, rgbs, baseRotY, baseRotX, autoScale } = data;
  const sc = autoScale;

  const rotY = baseRotY + rotDelta;
  const rotX = baseRotX + rotDelta * 0.3;

  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, w, h);

  // Project all points
  const { minD, maxD } = projectToArrays(points, count, projected, w, h, sc, rotY, rotX);
  const zRange = maxD - minD || 1;

  // Sort by depth using radix sort
  radixSortByDepth(projected, count, sortIndices);

  // Draw points — use fillRect for small points, arc only for glow
  for (let si = 0; si < count; si++) {
    const idx = sortIndices[si];
    const off = idx * 4;
    const px = projected[off], py = projected[off + 1];
    const pz = projected[off + 2], t = projected[off + 3];
    const zn = (pz - minD) / zRange;

    const colorT = (zn * 0.4 + t * 0.4 + animPhase * 0.8) % 1.0;
    const [r, g, b] = sampleGradient(rgbs, colorT);

    const size = 0.25 + zn * 1.3 + brightness * zn * 0.5;
    const alpha = Math.min(1, 0.08 + zn * 0.5 + brightness * 0.35);

    // Large glow halo on near points
    if (zn > 0.65 && brightness > 0.15) {
      const gr = size * (3 + brightness * 2.5);
      ctx.beginPath();
      ctx.arc(px, py, gr, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha * 0.05 * brightness})`;
      ctx.fill();
    }

    // Medium glow
    if (zn > 0.4 && brightness > 0.3) {
      ctx.beginPath();
      ctx.arc(px, py, size * 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha * 0.08})`;
      ctx.fill();
    }

    // Core — fillRect for small points (much faster than arc)
    if (size < 1.2) {
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.fillRect(px - size, py - size, size * 2, size * 2);
    } else {
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.fill();
    }
  }

  // Vignette
  const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, w * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(0.7, 'rgba(0,0,0,0.12)');
  vig.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  // Bottom fade for title
  const bf = ctx.createLinearGradient(0, h * 0.45, 0, h);
  bf.addColorStop(0, 'rgba(0,0,0,0)');
  bf.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = bf;
  ctx.fillRect(0, 0, w, h);
}

// ─── Static frame cache ───────────────────────────────────────────────────────

const staticCache = new Map<string, ImageBitmap>();

// ─── Component ─────────────────────────────────────────────────────────────────

interface AttractorBannerProps {
  seed: string;
  width?: number;
  height?: number;
  className?: string;
  animate?: boolean;
}

export default function AttractorBanner({
  seed, width = 1920, height = 960, className, animate = false,
}: AttractorBannerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<ReturnType<typeof generatePoints> | null>(null);
  const animRef = useRef<number>(0);
  const animatingRef = useRef(false);
  const projectedRef = useRef<Float32Array | null>(null);
  const sortIndicesRef = useRef<Uint16Array | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const renderedRef = useRef(false);

  // IntersectionObserver: only render when visible
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { rootMargin: '200px' },
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const render = useCallback((rotDelta: number, animPhase: number, brightness: number) => {
    const canvas = canvasRef.current;
    const data = dataRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = width * dpr;
    const ch = height * dpr;
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Allocate typed arrays once
    if (!projectedRef.current || projectedRef.current.length !== data.count * 4) {
      projectedRef.current = new Float32Array(data.count * 4);
      sortIndicesRef.current = new Uint16Array(data.count);
    }

    drawFrame(ctx, width, height, data, rotDelta, animPhase, brightness,
      projectedRef.current!, sortIndicesRef.current!);
  }, [width, height]);

  // Render static frame (from cache or fresh)
  const renderStatic = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = width * dpr;
    const ch = height * dpr;
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }

    const cached = staticCache.get(seed);
    if (cached) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(cached, 0, 0);
      return;
    }

    // Generate and render fresh
    dataRef.current = generatePoints(seed);
    render(0, 0, 0.05);

    // Cache the result as ImageBitmap
    createImageBitmap(canvas).then(bmp => {
      staticCache.set(seed, bmp);
    });
  }, [seed, width, height, render]);

  // Trigger render when visible OR immediately if animate requested
  useEffect(() => {
    if (renderedRef.current) return;
    if (!isVisible && !animate) return;
    renderedRef.current = true;
    renderStatic();
    if (animate) startAnimation(); // eslint-disable-line
  }, [isVisible, animate]);

  const startAnimation = useCallback(() => {
    if (animatingRef.current) return;
    // Ensure data is generated for animation
    if (!dataRef.current) {
      dataRef.current = generatePoints(seed);
    }
    animatingRef.current = true;

    const duration = 2200;
    const start = performance.now();
    const maxRot = Math.PI * 0.083;

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);

      const ease = progress < 0.5
        ? 4 * progress ** 3
        : 1 - (-2 * progress + 2) ** 3 / 2;

      const rotDelta = Math.sin(ease * Math.PI) * maxRot;
      const animPhase = ease * 0.7;
      const brightness = Math.sin(progress * Math.PI) * 0.85;

      render(rotDelta, animPhase, 0.05 + brightness);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        render(0, 0.7, 0.05);
        animatingRef.current = false;
      }
    };

    animRef.current = requestAnimationFrame(tick);
  }, [render, seed]);

  useEffect(() => {
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, []);

  const handleMouseEnter = useCallback(() => {
    startAnimation();
  }, [startAnimation]);

  return (
    <canvas
      ref={canvasRef}
      onMouseEnter={handleMouseEnter}
      className={className}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
}

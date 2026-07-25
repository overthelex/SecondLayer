import { useRef, useEffect } from 'react';

const PATH_L = 'M2647 7105 c-170 -50 -322 -140 -454 -268 -182 -176 -310 -434 -327 -657 -3 -36 -8 -628 -11 -1316 -6 -1333 -5 -1394 41 -1574 89 -353 424 -690 784 -789 41 -12 121 -25 179 -31 106 -9 2806 -22 2854 -13 26 5 62 -49 -554 829 l-78 112 -948 7 c-881 7 -952 9 -1008 26 -159 49 -286 185 -330 354 -13 52 -15 259 -15 1702 l0 1643 -27 -1 c-16 0 -63 -11 -106 -24z';
const PATH_X1 = 'M3340 6983 c56 -82 146 -211 200 -288 54 -77 136 -194 182 -260 47 -66 149 -212 228 -325 79 -113 173 -248 210 -300 36 -52 106 -151 155 -220 49 -69 170 -240 268 -380 242 -344 333 -473 534 -755 93 -132 241 -341 328 -465 87 -124 215 -306 285 -405 128 -181 169 -239 453 -640 86 -121 198 -280 249 -352 l93 -133 593 0 c325 0 592 3 592 6 0 5 -94 139 -380 544 -92 129 -243 343 -337 475 -93 132 -217 308 -275 390 -100 144 -208 296 -528 745 -81 113 -245 345 -365 515 -295 419 -386 548 -540 765 -72 102 -176 248 -230 325 -54 77 -124 176 -155 220 -31 44 -121 172 -200 285 -79 113 -174 249 -212 303 l-69 97 -590 0 -590 0 101 -147z';
const PATH_X2 = 'M6489 7013 c-45 -65 -120 -174 -167 -243 -92 -135 -341 -496 -484 -702 -48 -70 -88 -130 -88 -133 0 -2 87 -130 193 -282 106 -153 241 -346 299 -430 l105 -151 89 131 c193 284 264 389 380 557 66 96 174 254 239 350 65 96 151 222 190 280 39 58 138 204 220 325 82 121 173 256 203 300 30 44 58 88 63 98 9 16 -21 17 -575 17 l-584 0 -83 -117z';
const GROUP_TRANSFORM = 'translate(0,960) scale(0.1,-0.1)';
const DEPTH = 2;
const HALF = DEPTH / 2;
const EDGE_COLOR = '#1E2838';
const FACE_L_COLOR = '#1E2838';
const FACE_X_COLOR = '#5C7C9E';
const NUM_SLICES = 8;
const STEP = DEPTH / (NUM_SLICES + 1);

const NS = 'http://www.w3.org/2000/svg';

function buildSvg(c1: string, c2: string): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 960 960');
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('transform', GROUP_TRANSFORM);
  g.setAttribute('stroke', 'none');
  for (const [fill, d] of [[c1, PATH_L], [c2, PATH_X1], [c2, PATH_X2]]) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('fill', fill);
    path.setAttribute('d', d);
    g.appendChild(path);
  }
  svg.appendChild(g);
  return svg;
}

function buildLayer(z: number, className: string, c1: string, c2: string): HTMLDivElement {
  const div = document.createElement('div');
  div.className = className;
  div.style.transform = `translateZ(${z}px)`;
  div.appendChild(buildSvg(c1, c2));
  return div;
}

interface LexLogo3DProps {
  spinning?: boolean;
  size?: number;
}

export function LexLogo3D({ spinning = false, size = 32 }: LexLogo3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const builtRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || builtRef.current) return;
    builtRef.current = true;

    el.appendChild(buildLayer(-HALF, 'logo3d-face', FACE_L_COLOR, FACE_X_COLOR));
    for (let i = 1; i <= NUM_SLICES; i++) {
      el.appendChild(buildLayer(-HALF + i * STEP, 'logo3d-slice', EDGE_COLOR, EDGE_COLOR));
    }
    el.appendChild(buildLayer(HALF, 'logo3d-face', FACE_L_COLOR, FACE_X_COLOR));
  }, []);

  return (
    <div
      className="logo3d-scene"
      style={{ width: size, height: size }}
    >
      <div
        ref={containerRef}
        className={`logo3d-root ${spinning ? 'logo3d-spinning' : ''}`}
      />
    </div>
  );
}

#!/usr/bin/env python3
"""Generate English, light-background blog banners for cross-posting to dev.to.

The production banners (lexwebapp/public/blog-banners/<id>.png) are Ukrainian on a
dark background and are used by the live blog. For the English dev.to mirror we
render a separate, consistent LIGHT set into lexwebapp/public/blog-banners-en/<id>.png
so the originals stay untouched.

Content (English title / punchline / tags per tech article) comes from a JSON
dump produced from articles.ts + articles-en.ts (see README / dump step).

Design: 1200x627, light gradient background, subtle fractal art on the right
faded to the left for text legibility, English title (auto-wrapped) + short
punchline + tag pills + LEX AI branding. All critical text kept in the top ~55%.

Usage:
  python3 generate-en-banners.py <meta.json> [--only <id>] [--limit N]
"""

import sys
import json
import os
import hashlib
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

WIDTH, HEIGHT = 1200, 627
OUT_DIR = os.path.join(
    os.path.dirname(__file__), "..", "..", "lexwebapp", "public", "blog-banners-en"
)

# macOS system fonts (Latin-only English banners)
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"

SCHEME = {
    "bg_top": (250, 251, 253),
    "bg_bottom": (235, 238, 245),
    "accent": (233, 106, 39),        # brand orange
    "title": (26, 30, 52),           # deep navy
    "title_accent": (40, 78, 180),   # blue
    "gray": (99, 106, 124),
    "fractal_blue": (150, 168, 208),
    "fractal_orange": (228, 172, 132),
    "tag_bg": (255, 255, 255),
    "tag_border": (206, 212, 226),
    "tag_text": (74, 82, 104),
    "bar": (40, 78, 180),
    "category_label": "TECHNOLOGY",
}

# Transliterate the few Cyrillic tags that appear in the tech set.
TAG_FIX = {"ЄДРСР": "EDRSR", "РАДА": "RADA", "ДРС": "DRS"}

# --- Fractal generators (from generate-6-banners-v2.py) ---

def _julia(w, h, c_real, c_imag, xr, yr, max_iter=260):
    x = np.linspace(xr[0], xr[1], w); y = np.linspace(yr[0], yr[1], h)
    X, Y = np.meshgrid(x, y); Z = X + 1j * Y; c = complex(c_real, c_imag)
    out = np.zeros(Z.shape); mask = np.ones(Z.shape, dtype=bool)
    for i in range(max_iter):
        Z[mask] = Z[mask] ** 2 + c
        esc = np.abs(Z) > 4; ne = esc & mask
        out[ne] = i + 1 - np.log2(np.log2(np.abs(Z[ne]) + 1e-10)); mask[esc] = False
    out[out == 0] = max_iter; return out / max_iter


def _mandelbrot(w, h, cx, cy, span, max_iter=260):
    a = w / h
    x = np.linspace(cx - span * a / 2, cx + span * a / 2, w)
    y = np.linspace(cy - span / 2, cy + span / 2, h)
    X, Y = np.meshgrid(x, y); C = X + 1j * Y
    Z = np.zeros_like(C); out = np.zeros(C.shape); mask = np.ones(C.shape, dtype=bool)
    for i in range(max_iter):
        Z[mask] = Z[mask] ** 2 + C[mask]
        esc = np.abs(Z) > 4; ne = esc & mask
        out[ne] = i + 1 - np.log2(np.log2(np.abs(Z[ne]) + 1e-10)); mask[esc] = False
    out[out == 0] = max_iter; return out / max_iter


def _burning_ship(w, h, cx, cy, span, max_iter=260):
    a = w / h
    x = np.linspace(cx - span * a / 2, cx + span * a / 2, w)
    y = np.linspace(cy - span / 2, cy + span / 2, h)
    X, Y = np.meshgrid(x, y); Zr = np.zeros_like(X); Zi = np.zeros_like(Y)
    out = np.zeros(X.shape); mask = np.ones(X.shape, dtype=bool)
    for i in range(max_iter):
        zr = Zr[mask] ** 2 - Zi[mask] ** 2 + X[mask]
        zi = 2 * np.abs(Zr[mask] * Zi[mask]) + Y[mask]
        Zr[mask] = zr; Zi[mask] = zi
        r2 = Zr ** 2 + Zi ** 2; esc = r2 > 4; ne = esc & mask
        out[ne] = i + 1 - np.log2(np.log2(r2[ne] + 1e-10)); mask[esc] = False
    out[out == 0] = max_iter; return out / max_iter


def _tricorn(w, h, cx, cy, span, max_iter=260):
    a = w / h
    x = np.linspace(cx - span * a / 2, cx + span * a / 2, w)
    y = np.linspace(cy - span / 2, cy + span / 2, h)
    X, Y = np.meshgrid(x, y); C = X + 1j * Y
    Z = np.zeros_like(C); out = np.zeros(C.shape); mask = np.ones(C.shape, dtype=bool)
    for i in range(max_iter):
        Z[mask] = np.conj(Z[mask]) ** 2 + C[mask]
        esc = np.abs(Z) > 4; ne = esc & mask
        out[ne] = i + 1 - np.log2(np.log2(np.abs(Z[ne]) + 1e-10)); mask[esc] = False
    out[out == 0] = max_iter; return out / max_iter


# Varied fractal presets — pick two different ones per banner (memory guidance).
PRESETS = [
    ("julia", dict(c_real=-0.8, c_imag=0.156, xr=(-1.4, 1.4), yr=(-0.9, 0.9))),
    ("mandelbrot", dict(cx=-0.745, cy=0.186, span=0.09)),
    ("burning_ship", dict(cx=-1.762, cy=-0.028, span=0.15)),
    ("tricorn", dict(cx=-0.3, cy=0.0, span=3.0)),
    ("julia", dict(c_real=-0.7269, c_imag=0.1889, xr=(-1.3, 1.3), yr=(-0.85, 0.85))),
    ("mandelbrot", dict(cx=-0.16, cy=1.035, span=0.06)),
    ("julia", dict(c_real=-0.4, c_imag=0.6, xr=(-1.5, 1.5), yr=(-1.0, 1.0))),
    ("burning_ship", dict(cx=-1.755, cy=-0.02, span=0.06)),
]


def _render(kind, p, w, h, mi):
    if kind == "julia":
        return _julia(w, h, p["c_real"], p["c_imag"], p["xr"], p["yr"], mi)
    if kind == "mandelbrot":
        return _mandelbrot(w, h, p["cx"], p["cy"], p["span"], mi)
    if kind == "burning_ship":
        return _burning_ship(w, h, p["cx"], p["cy"], p["span"], mi)
    return _tricorn(w, h, p["cx"], p["cy"], p["span"], mi)


def _feather(h, w, mx, my):
    """2D smoothstep window: 1 in the center, → 0 over mx/my px at each edge.

    Multiplied into a fractal layer's alpha so its bounding rectangle dissolves
    into the background instead of leaving a visible seam.
    """
    rx = np.clip(np.arange(w) / mx, 0, 1)
    fx = np.minimum(rx, rx[::-1])
    ry = np.clip(np.arange(h) / my, 0, 1)
    fy = np.minimum(ry, ry[::-1])
    m = np.outer(fy, fx)
    return m * m * (3 - 2 * m)  # smoothstep


def _presets_for(id_):
    """Deterministically pick two different fractal presets from the id."""
    hnum = int(hashlib.md5(id_.encode()).hexdigest(), 16)
    a = PRESETS[hnum % len(PRESETS)]
    b = PRESETS[(hnum // 7) % len(PRESETS)]
    if b[0] == a[0]:
        b = PRESETS[(hnum // 7 + 1) % len(PRESETS)]
    return a, b


# --- Text helpers ---

def wrap(draw, text, font, max_w):
    words, lines, cur = text.split(), [], ""
    for w_ in words:
        trial = (cur + " " + w_).strip()
        if draw.textlength(trial, font=font) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w_
    if cur:
        lines.append(cur)
    return lines


def short_punchline(text, limit=118):
    """First sentence, capped to a banner-friendly length."""
    first = text.split(". ")[0].strip().rstrip(".")
    if len(first) <= limit:
        return first + "."
    cut = first[:limit].rsplit(" ", 1)[0]
    return cut + "…"


def clean_tags(tags):
    out = []
    for t in tags:
        t = TAG_FIX.get(t, t)
        if all(ord(c) < 0x400 for c in t):  # Latin/ASCII only
            out.append(t)
    return out[:5]


# --- Banner ---

def create_banner(meta):
    s = SCHEME
    id_ = meta["id"]

    # Vertical gradient background
    bg = Image.new("RGB", (WIDTH, HEIGHT))
    top, bot = s["bg_top"], s["bg_bottom"]
    grad = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
    for ch in range(3):
        col = np.linspace(top[ch], bot[ch], HEIGHT).astype(np.uint8)
        grad[:, :, ch] = col[:, None]
    img = Image.fromarray(grad, "RGB").convert("RGBA")

    (k1, p1), (k2, p2) = _presets_for(id_)

    # Primary fractal — right half, subtle on light bg
    fw, fh = 900, HEIGHT
    d1 = _render(k1, p1, fw, fh, 300)
    arr = np.zeros((fh, fw, 4), dtype=np.uint8)
    fc = s["fractal_blue"]
    for ch in range(3):
        arr[:, :, ch] = (fc[ch] * (1 - d1) + bot[ch] * d1).astype(np.uint8)
    edge = np.abs(d1 - 0.5) * 2
    arr[:, :, 3] = ((1 - edge) * 150 + 12).clip(0, 255).astype(np.uint8)
    f1 = Image.fromarray(arr, "RGBA").filter(ImageFilter.GaussianBlur(0.5))
    img.alpha_composite(f1, (300, 0))

    # Secondary fractal — warm, overlapping, lighter
    d2 = _render(k2, p2, 700, 500, 220)
    arr2 = np.zeros((500, 700, 4), dtype=np.uint8)
    fc2 = s["fractal_orange"]
    for ch in range(3):
        arr2[:, :, ch] = (fc2[ch] * (1 - d2) + bot[ch] * d2).astype(np.uint8)
    edge2 = np.abs(d2 - 0.5) * 2
    a2 = (1 - edge2) * 95 + 8
    a2 = a2 * _feather(500, 700, 170, 130)  # dissolve the layer's rectangle edges
    arr2[:, :, 3] = a2.clip(0, 255).astype(np.uint8)
    f2 = Image.fromarray(arr2, "RGBA").filter(ImageFilter.GaussianBlur(0.6))
    img.alpha_composite(f2, (520, 90))

    # Left fade so title stays crisp
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for x in range(560):
        a = int(235 * (1 - x / 560) ** 0.6)
        od.line([(x, 0), (x, HEIGHT)], fill=(*top, a))
    img.alpha_composite(overlay)

    img = img.convert("RGB")
    draw = ImageDraw.Draw(img)

    f_cat = ImageFont.truetype(FONT_BOLD, 14)
    f_sub = ImageFont.truetype(FONT_REGULAR, 19)
    f_tag = ImageFont.truetype(FONT_REGULAR, 14)
    f_lex = ImageFont.truetype(FONT_BOLD, 18)
    f_lex_sm = ImageFont.truetype(FONT_REGULAR, 12)

    LEFT = 60

    # Accent bar top-right
    draw.rectangle([1000, 42, 1150, 48], fill=s["accent"])

    # Category dot + label
    draw.ellipse([LEFT, 46, LEFT + 11, 57], fill=s["accent"])
    draw.text((LEFT + 18, 44), s["category_label"], fill=s["accent"], font=f_cat)

    # Title — pick largest size that fits in <=3 lines within max width
    max_w = 700
    for size, lh in ((48, 56), (42, 50), (37, 45)):
        f_title = ImageFont.truetype(FONT_BOLD, size)
        lines = wrap(draw, meta["title"], f_title, max_w)
        if len(lines) <= 3:
            break
    lines = lines[:3]

    y = 78
    for i, line in enumerate(lines):
        color = s["title_accent"] if i == 0 else s["title"]
        draw.text((LEFT, y), line, fill=color, font=f_title)
        y += lh

    # Punchline (short) under title, wrapped to 2 lines
    y += 12
    for line in wrap(draw, short_punchline(meta["punchline"]), f_sub, 620)[:2]:
        draw.text((LEFT, y), line, fill=s["gray"], font=f_sub)
        y += 27

    # Tag pills bottom-left
    tx, ty = LEFT, 560
    for tag in clean_tags(meta["tags"]):
        bb = draw.textbbox((0, 0), tag, font=f_tag)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        px, py = 14, 7
        x1, y1 = tx + tw + px * 2, ty + th + py * 2
        draw.rounded_rectangle([tx, ty, x1, y1], radius=(th + py * 2) // 2,
                               fill=s["tag_bg"], outline=s["tag_border"], width=1)
        draw.text((tx + px, ty + py - 1), tag, fill=s["tag_text"], font=f_tag)
        tx = x1 + 10

    # LEX AI branding bottom-right
    lx, ly = 1078, 562
    draw.text((lx, ly), "LEX", fill=s["accent"], font=f_lex)
    lw = draw.textbbox((0, 0), "LEX", font=f_lex)[2]
    draw.text((lx + lw + 4, ly), "AI", fill=s["title"], font=f_lex)
    draw.text((lx - 1, ly + 23), "legal.org.ua", fill=s["gray"], font=f_lex_sm)

    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.abspath(os.path.join(OUT_DIR, f"{id_}.png"))
    img.save(path, "PNG", optimize=True)
    print(f"  {id_}.png ({os.path.getsize(path)//1024} KB)")
    return path


def main():
    if len(sys.argv) < 2:
        print("usage: generate-en-banners.py <meta.json> [--only <id>] [--limit N]")
        sys.exit(1)
    meta = json.load(open(sys.argv[1]))
    only = sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None
    if only:
        meta = [m for m in meta if m["id"] == only]
    if limit:
        meta = meta[:limit]
    print(f"Generating {len(meta)} English light banner(s) -> {os.path.abspath(OUT_DIR)}")
    for m in meta:
        create_banner(m)
    print("Done.")


if __name__ == "__main__":
    main()

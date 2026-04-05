#!/usr/bin/env python3
"""Regenerate 6 most recent blog banners.

Fixes:
- All text (title + punchline) fits in top 55% of the banner so nothing gets
  clipped on the blog listing page (h-52 sm:h-60 container).
- Fractals are more contrasting and use varied types (Julia, Mandelbrot, Burning Ship).
- Fractals don't compete with the main title — strong on right, faded on left.

Usage: python3 generate-6-banners-v2.py [banner_index]
"""

import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

WIDTH, HEIGHT = 1200, 627

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

# --- Color schemes with stronger fractal colors ---

LEGAL_SCHEME = {
    "bg": (245, 240, 232),
    "accent": (220, 80, 40),
    "title": (80, 40, 10),
    "title_accent": (160, 60, 20),
    "gray": (130, 120, 110),
    "fractal1": (165, 130, 85),     # strong warm gold
    "fractal2": (150, 115, 70),     # deeper warm gold
    "tag_bg": (255, 255, 255),
    "tag_border": (215, 205, 190),
    "tag_text": (100, 80, 60),
    "dark_bar": (80, 40, 10),
    "category_label": "LEGAL",
}

TECH_SCHEME = {
    "bg": (238, 240, 248),
    "accent": (50, 80, 200),
    "title": (30, 25, 80),
    "title_accent": (60, 50, 160),
    "gray": (110, 115, 130),
    "fractal1": (120, 135, 190),    # strong blue
    "fractal2": (105, 120, 175),    # deeper blue
    "tag_bg": (255, 255, 255),
    "tag_border": (195, 200, 220),
    "tag_text": (70, 75, 100),
    "dark_bar": (30, 25, 80),
    "category_label": "TECHNOLOGY",
}

# --- Fractal generators ---

def generate_julia(width, height, c_real, c_imag, x_range, y_range, max_iter=300):
    """Classic Julia set."""
    x = np.linspace(x_range[0], x_range[1], width)
    y = np.linspace(y_range[0], y_range[1], height)
    X, Y = np.meshgrid(x, y)
    Z = X + 1j * Y
    c = complex(c_real, c_imag)

    output = np.zeros(Z.shape, dtype=np.float64)
    mask = np.ones(Z.shape, dtype=bool)

    for i in range(max_iter):
        Z[mask] = Z[mask] ** 2 + c
        escaped = np.abs(Z) > 4
        newly_escaped = escaped & mask
        output[newly_escaped] = i + 1 - np.log2(np.log2(np.abs(Z[newly_escaped]) + 1e-10))
        mask[escaped] = False

    output[output == 0] = max_iter
    return output / max_iter


def generate_mandelbrot(width, height, cx, cy, span, max_iter=300):
    """Mandelbrot set centered on (cx, cy) with given span."""
    aspect = width / height
    x = np.linspace(cx - span * aspect / 2, cx + span * aspect / 2, width)
    y = np.linspace(cy - span / 2, cy + span / 2, height)
    X, Y = np.meshgrid(x, y)
    C = X + 1j * Y

    Z = np.zeros_like(C)
    output = np.zeros(C.shape, dtype=np.float64)
    mask = np.ones(C.shape, dtype=bool)

    for i in range(max_iter):
        Z[mask] = Z[mask] ** 2 + C[mask]
        escaped = np.abs(Z) > 4
        newly_escaped = escaped & mask
        output[newly_escaped] = i + 1 - np.log2(np.log2(np.abs(Z[newly_escaped]) + 1e-10))
        mask[escaped] = False

    output[output == 0] = max_iter
    return output / max_iter


def generate_burning_ship(width, height, cx, cy, span, max_iter=300):
    """Burning Ship fractal — distinctive flame-like patterns."""
    aspect = width / height
    x = np.linspace(cx - span * aspect / 2, cx + span * aspect / 2, width)
    y = np.linspace(cy - span / 2, cy + span / 2, height)
    X, Y = np.meshgrid(x, y)

    Zr = np.zeros_like(X)
    Zi = np.zeros_like(Y)
    output = np.zeros(X.shape, dtype=np.float64)
    mask = np.ones(X.shape, dtype=bool)

    for i in range(max_iter):
        Zr_new = Zr[mask] ** 2 - Zi[mask] ** 2 + X[mask]
        Zi_new = 2 * np.abs(Zr[mask] * Zi[mask]) + Y[mask]
        Zr[mask] = Zr_new
        Zi[mask] = Zi_new
        r2 = Zr ** 2 + Zi ** 2
        escaped = r2 > 4
        newly_escaped = escaped & mask
        output[newly_escaped] = i + 1 - np.log2(np.log2(r2[newly_escaped] + 1e-10))
        mask[escaped] = False

    output[output == 0] = max_iter
    return output / max_iter


def generate_tricorn(width, height, cx, cy, span, max_iter=300):
    """Tricorn (Mandelbar) — uses conjugate, produces Buddha-head shapes."""
    aspect = width / height
    x = np.linspace(cx - span * aspect / 2, cx + span * aspect / 2, width)
    y = np.linspace(cy - span / 2, cy + span / 2, height)
    X, Y = np.meshgrid(x, y)
    C = X + 1j * Y

    Z = np.zeros_like(C)
    output = np.zeros(C.shape, dtype=np.float64)
    mask = np.ones(C.shape, dtype=bool)

    for i in range(max_iter):
        Z[mask] = np.conj(Z[mask]) ** 2 + C[mask]
        escaped = np.abs(Z) > 4
        newly_escaped = escaped & mask
        output[newly_escaped] = i + 1 - np.log2(np.log2(np.abs(Z[newly_escaped]) + 1e-10))
        mask[escaped] = False

    output[output == 0] = max_iter
    return output / max_iter


# --- Banner configs ---

BANNERS = [
    {
        "id": "distributed-monolith",
        "title_lines": [
            "Distributed Monolith:",
            "коли мікросервіси —",
            "це моноліт",
        ],
        "punchline": "3 сервіси, 1 PostgreSQL, спільний Redis — і ілюзія незалежності.",
        "category": "tech",
        "tags": ["Architecture", "Microservices", "Monolith", "DevOps"],
        "fractal_type": "burning_ship",
        "fractal_params": {"cx": -1.762, "cy": -0.028, "span": 0.15},
        "fractal2_type": "julia",
        "fractal2_params": {"c_real": -0.8, "c_imag": 0.156,
                            "x_range": (-1.4, 1.4), "y_range": (-0.9, 0.9)},
    },
    {
        "id": "ai-safety-open-registries",
        "title_lines": [
            "Безпека AI-моделей",
            "на відкритих реєстрах:",
            "закони Азімова",
        ],
        "punchline": "Як забезпечити, щоб модель з доступом до 50M+ записів не стала інструментом тиску.",
        "category": "legal",
        "tags": ["AI Safety", "Asimov Laws", "Ethics", "GCP"],
        "fractal_type": "mandelbrot",
        "fractal_params": {"cx": -0.745, "cy": 0.186, "span": 0.08},
        "fractal2_type": "julia",
        "fractal2_params": {"c_real": -0.4, "c_imag": 0.6,
                            "x_range": (-1.5, 1.5), "y_range": (-1.0, 1.0)},
    },
    {
        "id": "rlhf-longtail-problem",
        "title_lines": [
            "Проблема Long Tail",
            "при RLHF-навчанні",
            "юридичної моделі",
        ],
        "punchline": "5 категорій покривають 90% корпусу ЄДРСР. Як Long Tail руйнує RLHF.",
        "category": "tech",
        "tags": ["RLHF", "Long Tail", "ML Training", "Fairness"],
        "fractal_type": "tricorn",
        "fractal_params": {"cx": -0.3, "cy": 0.0, "span": 3.0},
        "fractal2_type": "julia",
        "fractal2_params": {"c_real": -0.7269, "c_imag": 0.1889,
                            "x_range": (-1.3, 1.3), "y_range": (-0.85, 0.85)},
    },
    {
        "id": "constitutional-rlhf",
        "title_lines": [
            "Конституція України",
            "як reward signal:",
            "конституційне RLHF",
        ],
        "punchline": "Статті 3, 28, 32, 62 Конституції стають reward-функціями при RLHF-навчанні.",
        "category": "legal",
        "tags": ["Constitutional AI", "RLHF", "Reward Model", "GCP"],
        "fractal_type": "julia",
        "fractal_params": {"c_real": -0.75, "c_imag": 0.11,
                           "x_range": (-1.6, 1.6), "y_range": (-1.05, 1.05)},
        "fractal2_type": "mandelbrot",
        "fractal2_params": {"cx": -1.25, "cy": 0.02, "span": 0.15},
    },
    {
        "id": "ai-experimental-court",
        "title_lines": [
            "Експериментальний",
            "AI-суд:",
            "моделювання процесів",
        ],
        "punchline": "Три окремі моделі — суддя, прокурор, адвокат — з інформаційною ізоляцією.",
        "category": "tech",
        "tags": ["AI Court", "Adversarial", "Simulation", "GCP"],
        "fractal_type": "julia",
        "fractal_params": {"c_real": -0.8, "c_imag": 0.156,
                           "x_range": (-1.4, 1.4), "y_range": (-0.9, 0.9)},
        "fractal2_type": "burning_ship",
        "fractal2_params": {"cx": -1.755, "cy": -0.02, "span": 0.06},
    },
    {
        "id": "legaltech-llm-constitution",
        "title_lines": [
            "Конституція",
            "LegalTech LLM:",
            "звід правил",
        ],
        "punchline": "30 статей, 9 розділів, відкрита ліцензія — галузевий стандарт для LegalTech моделей.",
        "category": "legal",
        "tags": ["Constitution", "LegalTech", "AI Safety", "Ethics"],
        "fractal_type": "mandelbrot",
        "fractal_params": {"cx": -0.16, "cy": 1.035, "span": 0.06},
        "fractal2_type": "julia",
        "fractal2_params": {"c_real": -0.7, "c_imag": 0.27015,
                            "x_range": (-1.5, 1.5), "y_range": (-1.0, 1.0)},
    },
]


def render_fractal_layer(fractal_type, params, width, height, max_iter=350):
    """Dispatch to the right fractal generator."""
    if fractal_type == "julia":
        return generate_julia(width, height,
                              params["c_real"], params["c_imag"],
                              params["x_range"], params["y_range"],
                              max_iter)
    elif fractal_type == "mandelbrot":
        return generate_mandelbrot(width, height,
                                   params["cx"], params["cy"],
                                   params["span"], max_iter)
    elif fractal_type == "burning_ship":
        return generate_burning_ship(width, height,
                                      params["cx"], params["cy"],
                                      params["span"], max_iter)
    elif fractal_type == "tricorn":
        return generate_tricorn(width, height,
                                params["cx"], params["cy"],
                                params["span"], max_iter)
    raise ValueError(f"Unknown fractal type: {fractal_type}")


def create_banner(config):
    scheme = LEGAL_SCHEME if config["category"] == "legal" else TECH_SCHEME
    bg = scheme["bg"]

    img = Image.new("RGB", (WIDTH, HEIGHT), bg)

    # --- Primary fractal layer (right half, x=300..1200) ---
    frac_w, frac_h = 900, HEIGHT
    fractal_data = render_fractal_layer(
        config["fractal_type"], config["fractal_params"],
        frac_w, frac_h, max_iter=350
    )

    fractal_img = Image.new("RGBA", (frac_w, frac_h), (0, 0, 0, 0))
    fractal_arr = np.array(fractal_img)
    fc = scheme["fractal1"]
    for ch in range(3):
        fractal_arr[:, :, ch] = (fc[ch] * (1 - fractal_data) + bg[ch] * fractal_data).astype(np.uint8)

    # Strong alpha — edge detection for crisp fractal boundaries
    edge_factor = np.abs(fractal_data - 0.5) * 2
    alpha = ((1 - edge_factor) * 255 + 30).clip(0, 255).astype(np.uint8)
    fractal_arr[:, :, 3] = alpha
    fractal_img = Image.fromarray(fractal_arr, "RGBA")
    fractal_img = fractal_img.filter(ImageFilter.GaussianBlur(radius=0.5))

    img_rgba = img.convert("RGBA")
    img_rgba.paste(fractal_img, (300, 0), fractal_img)

    # --- Secondary fractal layer (overlapping, different type) ---
    frac2_data = render_fractal_layer(
        config["fractal2_type"], config["fractal2_params"],
        700, 500, max_iter=250
    )
    frac2_img = Image.new("RGBA", (700, 500), (0, 0, 0, 0))
    frac2_arr = np.array(frac2_img)
    fc2 = scheme["fractal2"]
    for ch in range(3):
        frac2_arr[:, :, ch] = (fc2[ch] * (1 - frac2_data) + bg[ch] * frac2_data).astype(np.uint8)
    edge2 = np.abs(frac2_data - 0.5) * 2
    frac2_arr[:, :, 3] = ((1 - edge2) * 200 + 20).clip(0, 255).astype(np.uint8)
    frac2_img = Image.fromarray(frac2_arr, "RGBA")
    frac2_img = frac2_img.filter(ImageFilter.GaussianBlur(radius=0.4))
    img_rgba.paste(frac2_img, (500, 80), frac2_img)

    # --- Composite ---
    bg_layer = Image.new("RGBA", (WIDTH, HEIGHT), (*bg, 255))
    final_rgba = Image.alpha_composite(bg_layer, img_rgba)
    img = final_rgba.convert("RGB")

    # --- Left gradient overlay for text readability ---
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    for x in range(500):
        alpha_val = int(230 * (1 - x / 500) ** 0.5)
        overlay_draw.line([(x, 0), (x, HEIGHT)], fill=(*bg, alpha_val))
    img_rgba2 = img.convert("RGBA")
    img_rgba2 = Image.alpha_composite(img_rgba2, overlay)
    img = img_rgba2.convert("RGB")
    draw = ImageDraw.Draw(img)

    # --- Fonts ---
    font_category = ImageFont.truetype(FONT_BOLD, 13)
    font_title = ImageFont.truetype(FONT_BOLD, 48)  # slightly smaller for safe fit
    font_subtitle = ImageFont.truetype(FONT_REGULAR, 16)
    font_tag = ImageFont.truetype(FONT_REGULAR, 14)
    font_lex_bold = ImageFont.truetype(FONT_BOLD, 17)
    font_lex_small = ImageFont.truetype(FONT_REGULAR, 12)

    LEFT = 45

    # --- Top-right dark bar ---
    draw.rectangle([990, 40, 1155, 47], fill=scheme["dark_bar"])

    # --- Category dot + label (y=44) ---
    draw.ellipse([LEFT, 48, LEFT + 10, 58], fill=scheme["accent"])
    draw.text((LEFT + 16, 44), scheme["category_label"], fill=scheme["accent"], font=font_category)

    # --- Title (starts y=68, line height 56px) ---
    # Total for 3 lines: 68 + 3*56 = 236.
    y_pos = 68
    for i, line in enumerate(config["title_lines"]):
        color = scheme["title_accent"] if i == 0 else scheme["title"]
        draw.text((LEFT, y_pos), line, fill=color, font=font_title)
        y_pos += 56

    # --- Punchline (y ~ 248) — safely within top 55% (345px) ---
    draw.text((LEFT, y_pos + 10), config["punchline"], fill=scheme["gray"], font=font_subtitle)

    # --- Tags at bottom (visible in modal, clipped in listing — that's OK) ---
    tag_x = LEFT
    tag_y = 565
    for tag in config["tags"]:
        bbox = draw.textbbox((0, 0), tag, font=font_tag)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        pad_x, pad_y = 14, 7
        r = (th + pad_y * 2) // 2
        x0, y0 = tag_x, tag_y
        x1, y1 = tag_x + tw + pad_x * 2, tag_y + th + pad_y * 2
        draw.rounded_rectangle([x0, y0, x1, y1], radius=r,
                               fill=scheme["tag_bg"], outline=scheme["tag_border"], width=1)
        draw.text((tag_x + pad_x, tag_y + pad_y - 1), tag, fill=scheme["tag_text"], font=font_tag)
        tag_x = x1 + 10

    # --- LEX AI branding ---
    lex_x = 1080
    lex_y = 568
    draw.text((lex_x, lex_y), "LEX", fill=scheme["accent"], font=font_lex_bold)
    lex_w = draw.textbbox((0, 0), "LEX", font=font_lex_bold)[2]
    draw.text((lex_x + lex_w + 4, lex_y), "AI", fill=scheme["title"], font=font_lex_bold)
    draw.text((lex_x - 2, lex_y + 22), "legal.org.ua", fill=scheme["gray"], font=font_lex_small)

    # --- Save ---
    output_path = f"/home/vovkes/SecondLayer/lexwebapp/public/blog-banners/{config['id']}.png"
    img.save(output_path, "PNG", optimize=True)
    import os
    size_kb = os.path.getsize(output_path) // 1024
    print(f"  Saved: {output_path} ({size_kb} KB)")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        idx = int(sys.argv[1])
        print(f"Generating {BANNERS[idx]['id']}...")
        create_banner(BANNERS[idx])
    else:
        for banner in BANNERS:
            print(f"Generating {banner['id']}...")
            create_banner(banner)
        print(f"\nDone! All {len(BANNERS)} banners regenerated.")

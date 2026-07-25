#!/usr/bin/env python3
"""Regenerate court-practice-analysis-march-2026 banner.

Dark theme with proper text layout (title in top 55%, contrasting fractals).
"""

import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

WIDTH, HEIGHT = 1200, 627

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

# Dark legal scheme
SCHEME = {
    "bg": (28, 32, 42),
    "accent": (220, 160, 60),         # warm gold accent
    "title": (240, 238, 230),         # near-white
    "title_accent": (255, 200, 90),   # bright gold for first line
    "gray": (160, 165, 175),
    "fractal1": (55, 65, 90),         # subtle blue-gray fractal
    "fractal2": (45, 55, 80),         # deeper secondary
    "tag_bg": (50, 55, 68),
    "tag_border": (80, 85, 100),
    "tag_text": (180, 185, 195),
    "dark_bar": (220, 160, 60),
    "category_label": "LEGAL",
}


def generate_julia(width, height, c_real, c_imag, x_range, y_range, max_iter=300):
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


def create_banner():
    bg = SCHEME["bg"]
    img = Image.new("RGB", (WIDTH, HEIGHT), bg)

    # --- Primary fractal (Julia, right half) ---
    frac_w, frac_h = 900, HEIGHT
    fractal_data = generate_julia(frac_w, frac_h, -0.75, 0.11,
                                  (-1.6, 1.6), (-1.05, 1.05), max_iter=350)

    fractal_img = Image.new("RGBA", (frac_w, frac_h), (0, 0, 0, 0))
    fractal_arr = np.array(fractal_img)
    fc = SCHEME["fractal1"]
    for ch in range(3):
        fractal_arr[:, :, ch] = (fc[ch] * (1 - fractal_data) + bg[ch] * fractal_data).astype(np.uint8)

    edge_factor = np.abs(fractal_data - 0.5) * 2
    alpha = ((1 - edge_factor) * 255 + 30).clip(0, 255).astype(np.uint8)
    fractal_arr[:, :, 3] = alpha
    fractal_img = Image.fromarray(fractal_arr, "RGBA")
    fractal_img = fractal_img.filter(ImageFilter.GaussianBlur(radius=0.5))

    img_rgba = img.convert("RGBA")
    img_rgba.paste(fractal_img, (300, 0), fractal_img)

    # --- Secondary fractal (Mandelbrot seahorse valley) ---
    frac2_data = generate_mandelbrot(700, 500, -0.745, 0.186, 0.08, max_iter=250)
    frac2_img = Image.new("RGBA", (700, 500), (0, 0, 0, 0))
    frac2_arr = np.array(frac2_img)
    fc2 = SCHEME["fractal2"]
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
    font_title = ImageFont.truetype(FONT_BOLD, 48)
    font_subtitle = ImageFont.truetype(FONT_REGULAR, 16)
    font_tag = ImageFont.truetype(FONT_REGULAR, 14)
    font_lex_bold = ImageFont.truetype(FONT_BOLD, 17)
    font_lex_small = ImageFont.truetype(FONT_REGULAR, 12)

    LEFT = 45

    # --- Top-right gold bar ---
    draw.rectangle([990, 40, 1155, 47], fill=SCHEME["dark_bar"])

    # --- Category dot + label ---
    draw.ellipse([LEFT, 48, LEFT + 10, 58], fill=SCHEME["accent"])
    draw.text((LEFT + 16, 44), SCHEME["category_label"], fill=SCHEME["accent"], font=font_category)

    # --- Title (y=68, line height 56px) ---
    title_lines = [
        "Аналіз судової практики",
        "ВП ВС за березень 2026:",
        "що не враховано",
    ]
    y_pos = 68
    for i, line in enumerate(title_lines):
        color = SCHEME["title_accent"] if i == 0 else SCHEME["title"]
        draw.text((LEFT, y_pos), line, fill=color, font=font_title)
        y_pos += 56

    # --- Punchline ---
    punchline = "ТЦК, земельне право, газ, прокурор — 5 справ, які варто знати."
    draw.text((LEFT, y_pos + 10), punchline, fill=SCHEME["gray"], font=font_subtitle)

    # --- Tags at bottom ---
    tags = ["Судова практика", "Велика Палата ВС", "ТЦК", "Земельне право"]
    tag_x = LEFT
    tag_y = 565
    for tag in tags:
        bbox = draw.textbbox((0, 0), tag, font=font_tag)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        pad_x, pad_y = 14, 7
        r = (th + pad_y * 2) // 2
        x0, y0 = tag_x, tag_y
        x1, y1 = tag_x + tw + pad_x * 2, tag_y + th + pad_y * 2
        draw.rounded_rectangle([x0, y0, x1, y1], radius=r,
                               fill=SCHEME["tag_bg"], outline=SCHEME["tag_border"], width=1)
        draw.text((tag_x + pad_x, tag_y + pad_y - 1), tag, fill=SCHEME["tag_text"], font=font_tag)
        tag_x = x1 + 10

    # --- LEX AI branding ---
    lex_x = 1080
    lex_y = 568
    draw.text((lex_x, lex_y), "LEX", fill=SCHEME["accent"], font=font_lex_bold)
    lex_w = draw.textbbox((0, 0), "LEX", font=font_lex_bold)[2]
    draw.text((lex_x + lex_w + 4, lex_y), "AI", fill=SCHEME["title"], font=font_lex_bold)
    draw.text((lex_x - 2, lex_y + 22), "legal.org.ua", fill=SCHEME["gray"], font=font_lex_small)

    # --- Save ---
    output_path = "/home/vovkes/SecondLayer/lexwebapp/public/blog-banners/court-practice-analysis-march-2026.png"
    img.save(output_path, "PNG", optimize=True)
    size_kb = os.path.getsize(output_path) // 1024
    print(f"Saved: {output_path} ({size_kb} KB)")


if __name__ == "__main__":
    create_banner()

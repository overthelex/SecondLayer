#!/usr/bin/env python3
"""Generate 5 blog banners in the erb-nbu-due-diligence / distributed-monolith reference style.

Each banner has:
- Light background
- Julia set fractal visible but muted in background (right side)
- Title prominent on left foreground
- Category dot + label
- Subtitle/punchline
- Tags as pills at bottom
- LEX AI branding bottom-right
"""

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

WIDTH, HEIGHT = 1200, 627

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

# Color schemes
LEGAL_SCHEME = {
    "bg": (245, 240, 232),        # warm cream
    "accent": (220, 80, 40),      # orange-red
    "title": (80, 40, 10),        # dark warm brown
    "title_first": (160, 60, 20), # brighter warm for first line
    "gray": (130, 120, 110),
    "fractal1": (210, 185, 155),  # warm gold fractal
    "fractal2": (195, 170, 140),
    "tag_bg": (255, 255, 255),
    "tag_border": (215, 205, 190),
    "tag_text": (100, 80, 60),
    "dark_bar": (80, 40, 10),
    "category_label": "LEGAL",
}

TECH_SCHEME = {
    "bg": (238, 240, 248),        # cool blue-gray
    "accent": (50, 80, 200),      # blue
    "title": (30, 25, 80),        # dark indigo
    "title_first": (60, 50, 160), # brighter indigo first line
    "gray": (110, 115, 130),
    "fractal1": (170, 175, 210),  # blue-purple fractal
    "fractal2": (155, 160, 200),
    "tag_bg": (255, 255, 255),
    "tag_border": (195, 200, 220),
    "tag_text": (70, 75, 100),
    "dark_bar": (30, 25, 80),
    "category_label": "TECHNOLOGY",
}

# Banner configs: id, title lines, punchline, category, tags, julia params
BANNERS = [
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
        "julia_c": (-0.7, 0.27015),
        "julia_range": ((-1.5, 1.5), (-1.0, 1.0)),
        "julia_c2": (-0.4, 0.6),
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
        "julia_c": (-0.8, 0.156),
        "julia_range": ((-1.4, 1.4), (-0.9, 0.9)),
        "julia_c2": (0.285, 0.01),
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
        "julia_c": (-0.75, 0.11),
        "julia_range": ((-1.6, 1.6), (-1.05, 1.05)),
        "julia_c2": (-0.1, 0.651),
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
        "julia_c": (0.285, 0.01),
        "julia_range": ((-1.3, 1.3), (-0.85, 0.85)),
        "julia_c2": (-0.7269, 0.1889),
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
        "julia_c": (-0.835, -0.2321),
        "julia_range": ((-1.5, 1.5), (-1.0, 1.0)),
        "julia_c2": (-0.4, 0.6),
    },
]


def generate_julia_fractal(width, height, c_real, c_imag, x_range, y_range, max_iter=300):
    """Generate a Julia set fractal as a 2D numpy array."""
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
    output = output / max_iter
    return output


def create_banner(config):
    scheme = LEGAL_SCHEME if config["category"] == "legal" else TECH_SCHEME
    bg = scheme["bg"]

    img = Image.new("RGB", (WIDTH, HEIGHT), bg)

    # --- Fractal layer 1 (large, right side) ---
    frac_w, frac_h = 900, 627
    c1 = config["julia_c"]
    r1 = config["julia_range"]
    fractal_data = generate_julia_fractal(frac_w, frac_h, c1[0], c1[1], r1[0], r1[1], max_iter=250)

    fractal_img = Image.new("RGBA", (frac_w, frac_h), (0, 0, 0, 0))
    fractal_arr = np.array(fractal_img)
    fc = scheme["fractal1"]
    for ch in range(3):
        fractal_arr[:, :, ch] = (fc[ch] * (1 - fractal_data) + bg[ch] * fractal_data).astype(np.uint8)

    edge_factor = np.abs(fractal_data - 0.5) * 2
    alpha = ((1 - edge_factor) * 160 + 20).clip(0, 255).astype(np.uint8)
    fractal_arr[:, :, 3] = alpha
    fractal_img = Image.fromarray(fractal_arr, "RGBA")
    fractal_img = fractal_img.filter(ImageFilter.GaussianBlur(radius=0.8))

    img_rgba = img.convert("RGBA")
    img_rgba.paste(fractal_img, (350, 0), fractal_img)

    # --- Fractal layer 2 (smaller, overlapping) ---
    c2 = config["julia_c2"]
    frac2_data = generate_julia_fractal(600, 400, c2[0], c2[1], (-1.2, 1.2), (-0.8, 0.8), max_iter=200)
    frac2_img = Image.new("RGBA", (600, 400), (0, 0, 0, 0))
    frac2_arr = np.array(frac2_img)
    fc2 = scheme["fractal2"]
    for ch in range(3):
        frac2_arr[:, :, ch] = (fc2[ch] * (1 - frac2_data) + bg[ch] * frac2_data).astype(np.uint8)
    edge2 = np.abs(frac2_data - 0.5) * 2
    frac2_arr[:, :, 3] = ((1 - edge2) * 110 + 10).clip(0, 255).astype(np.uint8)
    frac2_img = Image.fromarray(frac2_arr, "RGBA")
    frac2_img = frac2_img.filter(ImageFilter.GaussianBlur(radius=0.5))
    img_rgba.paste(frac2_img, (600, 250), frac2_img)

    # --- Composite onto bg ---
    bg_layer = Image.new("RGBA", (WIDTH, HEIGHT), (*bg, 255))
    final_rgba = Image.alpha_composite(bg_layer, img_rgba)
    img = final_rgba.convert("RGB")

    # --- White gradient overlay on left for text readability ---
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    for x in range(700):
        alpha_val = int(220 * (1 - x / 700) ** 0.6)
        overlay_draw.line([(x, 0), (x, HEIGHT)], fill=(*bg, alpha_val))
    img_rgba2 = img.convert("RGBA")
    img_rgba2 = Image.alpha_composite(img_rgba2, overlay)
    img = img_rgba2.convert("RGB")
    draw = ImageDraw.Draw(img)

    # --- Fonts ---
    font_category = ImageFont.truetype(FONT_BOLD, 14)
    font_title = ImageFont.truetype(FONT_BOLD, 48)
    font_subtitle = ImageFont.truetype(FONT_REGULAR, 17)
    font_tag = ImageFont.truetype(FONT_REGULAR, 15)
    font_lex_bold = ImageFont.truetype(FONT_BOLD, 18)
    font_lex_small = ImageFont.truetype(FONT_REGULAR, 13)

    accent = scheme["accent"]

    # --- Top-right dark bar ---
    draw.rectangle([980, 45, 1140, 52], fill=scheme["dark_bar"])

    # --- Category dot + label ---
    draw.ellipse([60, 58, 72, 70], fill=accent)
    draw.text((80, 53), scheme["category_label"], fill=accent, font=font_category)

    # --- Title lines ---
    y_pos = 90
    for i, line in enumerate(config["title_lines"]):
        color = scheme["title_first"] if i == 0 else scheme["title"]
        draw.text((60, y_pos), line, fill=color, font=font_title)
        y_pos += 58

    # --- Punchline ---
    draw.text((60, y_pos + 15), config["punchline"], fill=scheme["gray"], font=font_subtitle)

    # --- Tags ---
    tag_x = 60
    tag_y = 560
    for tag in config["tags"]:
        bbox = draw.textbbox((0, 0), tag, font=font_tag)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        pad_x, pad_y = 16, 8
        r = (th + pad_y * 2) // 2
        x0, y0 = tag_x, tag_y
        x1, y1 = tag_x + tw + pad_x * 2, tag_y + th + pad_y * 2
        draw.rounded_rectangle([x0, y0, x1, y1], radius=r,
                               fill=scheme["tag_bg"], outline=scheme["tag_border"], width=1)
        draw.text((tag_x + pad_x, tag_y + pad_y - 1), tag, fill=scheme["tag_text"], font=font_tag)
        tag_x = x1 + 12

    # --- LEX AI branding ---
    lex_x = 1070
    lex_y = 570
    draw.text((lex_x, lex_y), "LEX", fill=accent, font=font_lex_bold)
    lex_w = draw.textbbox((0, 0), "LEX", font=font_lex_bold)[2]
    draw.text((lex_x + lex_w + 4, lex_y), "AI", fill=scheme["title"], font=font_lex_bold)
    draw.text((lex_x - 2, lex_y + 24), "legal.org.ua", fill=scheme["gray"], font=font_lex_small)

    # --- Save ---
    output_path = f"/home/vovkes/SecondLayer/lexwebapp/public/blog-banners/{config['id']}.png"
    img.save(output_path, "PNG", optimize=True)
    print(f"Saved: {output_path} ({img.size[0]}x{img.size[1]})")


if __name__ == "__main__":
    for banner in BANNERS:
        print(f"Generating {banner['id']}...")
        create_banner(banner)
    print("\nDone! All 5 banners generated.")

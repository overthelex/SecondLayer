#!/usr/bin/env python3
"""Generate fractal blog banner for Opus + RAG vs Fine-tuned LLM article."""

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

WIDTH, HEIGHT = 1200, 627
BG_COLOR = (235, 242, 250)  # light blue-gray
FRACTAL_COLOR_1 = (60, 130, 200)  # blue (Opus/RAG side)
FRACTAL_COLOR_2 = (200, 80, 60)  # warm red (fine-tuning side)
TITLE_COLOR = (20, 50, 100)  # dark navy
ACCENT_COLOR = (45, 120, 200)  # bright blue
ORANGE_COLOR = (220, 80, 40)
GRAY_COLOR = (100, 110, 130)
TAG_BG = (255, 255, 255)
TAG_BORDER = (180, 195, 220)
TAG_TEXT = (60, 75, 110)
DARK_BAR = (20, 45, 90)

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


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


def create_banner():
    img = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)

    # First fractal — blue tones, neural-network-like pattern (RAG side)
    frac_w, frac_h = 900, 627
    fractal_data = generate_julia_fractal(
        frac_w, frac_h,
        c_real=-0.8, c_imag=0.156,
        x_range=(-1.5, 1.5),
        y_range=(-1.0, 1.0),
        max_iter=280
    )

    fractal_img = Image.new("RGBA", (frac_w, frac_h), (0, 0, 0, 0))
    fractal_arr = np.array(fractal_img)

    for ch, base_val, frac_val in [(0, BG_COLOR[0], FRACTAL_COLOR_1[0]),
                                     (1, BG_COLOR[1], FRACTAL_COLOR_1[1]),
                                     (2, BG_COLOR[2], FRACTAL_COLOR_1[2])]:
        fractal_arr[:, :, ch] = (frac_val * (1 - fractal_data) + base_val * fractal_data).astype(np.uint8)

    edge_factor = np.abs(fractal_data - 0.5) * 2
    alpha = ((1 - edge_factor) * 150 + 15).clip(0, 255).astype(np.uint8)
    fractal_arr[:, :, 3] = alpha

    fractal_img = Image.fromarray(fractal_arr, "RGBA")
    fractal_img = fractal_img.filter(ImageFilter.GaussianBlur(radius=0.8))

    img_rgba = img.convert("RGBA")
    img_rgba.paste(fractal_img, (350, 0), fractal_img)

    # Second fractal — warm red tones, different shape (fine-tuning side)
    frac2_data = generate_julia_fractal(
        650, 450,
        c_real=0.285, c_imag=0.01,
        x_range=(-1.3, 1.3),
        y_range=(-0.9, 0.9),
        max_iter=220
    )
    frac2_img = Image.new("RGBA", (650, 450), (0, 0, 0, 0))
    frac2_arr = np.array(frac2_img)
    for ch, frac_val in [(0, FRACTAL_COLOR_2[0]), (1, FRACTAL_COLOR_2[1]), (2, FRACTAL_COLOR_2[2])]:
        frac2_arr[:, :, ch] = (frac_val * (1 - frac2_data) + BG_COLOR[ch] * frac2_data).astype(np.uint8)
    edge2 = np.abs(frac2_data - 0.5) * 2
    frac2_arr[:, :, 3] = ((1 - edge2) * 90 + 10).clip(0, 255).astype(np.uint8)
    frac2_img = Image.fromarray(frac2_arr, "RGBA")
    frac2_img = frac2_img.filter(ImageFilter.GaussianBlur(radius=0.6))
    img_rgba.paste(frac2_img, (550, 200), frac2_img)

    # Composite onto background
    bg_layer = Image.new("RGBA", (WIDTH, HEIGHT), (*BG_COLOR, 255))
    final_rgba = Image.alpha_composite(bg_layer, img_rgba)
    img = final_rgba.convert("RGB")

    draw = ImageDraw.Draw(img)

    # Left side overlay for text readability
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    for x in range(720):
        alpha_val = int(230 * (1 - x / 720) ** 0.6)
        overlay_draw.line([(x, 0), (x, HEIGHT)], fill=(*BG_COLOR, alpha_val))
    img_rgba2 = img.convert("RGBA")
    img_rgba2 = Image.alpha_composite(img_rgba2, overlay)
    img = img_rgba2.convert("RGB")
    draw = ImageDraw.Draw(img)

    # Fonts
    font_cat = ImageFont.truetype(FONT_BOLD, 14)
    font_title = ImageFont.truetype(FONT_BOLD, 46)
    font_subtitle = ImageFont.truetype(FONT_REGULAR, 17)
    font_tag = ImageFont.truetype(FONT_REGULAR, 15)
    font_lex_bold = ImageFont.truetype(FONT_BOLD, 18)
    font_lex = ImageFont.truetype(FONT_REGULAR, 13)

    # Top-right dark bar
    draw.rectangle([980, 45, 1140, 52], fill=DARK_BAR)

    # Category label
    draw.ellipse([60, 58, 72, 70], fill=ACCENT_COLOR)
    draw.text((80, 53), "LLM / LEGAL AI", fill=ACCENT_COLOR, font=font_cat)

    # Title — text in top 55%
    title_lines = ["Opus + RAG", "vs Fine-tuned LLM:", "два шляхи до", "юридичного AI"]
    y_pos = 88
    for i, line in enumerate(title_lines):
        color = ACCENT_COLOR if i == 0 else TITLE_COLOR
        draw.text((60, y_pos), line, fill=color, font=font_title)
        y_pos += 55

    # Subtitle
    draw.text((60, y_pos + 12),
              "Harvey + OpenAI vs LEX + Claude Opus. $100M vs $10K.",
              fill=GRAY_COLOR, font=font_subtitle)

    # Tags
    tags = ["LLM", "Fine-tuning", "RAG", "Harvey AI", "Claude Opus"]
    tag_x = 60
    tag_y = 560
    for tag in tags:
        bbox = draw.textbbox((0, 0), tag, font=font_tag)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        pad_x, pad_y = 16, 8
        r = (th + pad_y * 2) // 2
        x0, y0 = tag_x, tag_y
        x1, y1 = tag_x + tw + pad_x * 2, tag_y + th + pad_y * 2
        draw.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=TAG_BG, outline=TAG_BORDER, width=1)
        draw.text((tag_x + pad_x, tag_y + pad_y - 1), tag, fill=TAG_TEXT, font=font_tag)
        tag_x = x1 + 10

    # Bottom-right: LEX AI branding
    lex_x = 1070
    lex_y = 570
    draw.text((lex_x, lex_y), "LEX", fill=ORANGE_COLOR, font=font_lex_bold)
    lex_w = draw.textbbox((0, 0), "LEX", font=font_lex_bold)[2]
    draw.text((lex_x + lex_w + 4, lex_y), "AI", fill=TITLE_COLOR, font=font_lex_bold)
    draw.text((lex_x - 2, lex_y + 24), "legal.org.ua", fill=GRAY_COLOR, font=font_lex)

    # Save
    output_path = "/home/vovkes/SecondLayer/lexwebapp/public/blog-banners/opus-rag-vs-finetuned-llm.png"
    img.save(output_path, "PNG", optimize=True)
    print(f"Saved banner to {output_path}")
    print(f"Size: {img.size}")


if __name__ == "__main__":
    create_banner()

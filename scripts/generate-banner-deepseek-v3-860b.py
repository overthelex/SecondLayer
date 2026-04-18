#!/usr/bin/env python3
"""Generate fractal blog banner for DeepSeek V3 860B Ukrainian Law article."""

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

WIDTH, HEIGHT = 1200, 627
BG_COLOR = (10, 12, 28)  # deep navy / almost black
FRACTAL_COLOR_A = (90, 110, 255)  # electric blue
FRACTAL_COLOR_B = (200, 60, 180)  # magenta
TITLE_COLOR = (240, 240, 255)  # near-white
ACCENT_COLOR = (255, 140, 40)  # orange
GRAY_COLOR = (170, 175, 200)
TAG_BG = (25, 28, 50)
TAG_BORDER = (70, 80, 130)
TAG_TEXT = (200, 205, 230)
DARK_BAR = (255, 140, 40)

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"


def generate_julia(width, height, c_real, c_imag, x_range, y_range, max_iter=250):
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
    # Base image: deep navy
    img = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)

    # Layer 1: dragon-like Julia (right side, big)
    frac1_w, frac1_h = 900, 700
    data1 = generate_julia(
        frac1_w, frac1_h,
        c_real=-0.835, c_imag=-0.2321,
        x_range=(-1.6, 1.6),
        y_range=(-1.2, 1.2),
        max_iter=280,
    )
    layer1 = Image.new("RGBA", (frac1_w, frac1_h), (0, 0, 0, 0))
    arr1 = np.array(layer1)
    # Gradient: from blue (outer) to magenta (inner boundary)
    # Use data1 as blend
    for ch, ca, cb in [(0, FRACTAL_COLOR_A[0], FRACTAL_COLOR_B[0]),
                       (1, FRACTAL_COLOR_A[1], FRACTAL_COLOR_B[1]),
                       (2, FRACTAL_COLOR_A[2], FRACTAL_COLOR_B[2])]:
        arr1[:, :, ch] = (cb * (1 - data1) + ca * data1).astype(np.uint8)
    # Alpha: visible at boundary, fading at extremes
    edge1 = np.abs(data1 - 0.5) * 2
    arr1[:, :, 3] = ((1 - edge1) ** 1.5 * 200 + 15).clip(0, 255).astype(np.uint8)
    layer1 = Image.fromarray(arr1, "RGBA").filter(ImageFilter.GaussianBlur(radius=0.6))

    img_rgba = img.convert("RGBA")
    img_rgba.paste(layer1, (350, -40), layer1)

    # Layer 2: mandelbrot-like detail, smaller, different params (left-upper background glow)
    frac2_w, frac2_h = 700, 500
    data2 = generate_julia(
        frac2_w, frac2_h,
        c_real=0.285, c_imag=0.01,
        x_range=(-1.4, 1.4),
        y_range=(-1.0, 1.0),
        max_iter=220,
    )
    layer2 = Image.new("RGBA", (frac2_w, frac2_h), (0, 0, 0, 0))
    arr2 = np.array(layer2)
    for ch, v in [(0, 255), (1, 165), (2, 70)]:  # warm orange overlay
        arr2[:, :, ch] = (v * (1 - data2) + BG_COLOR[ch] * data2).astype(np.uint8)
    edge2 = np.abs(data2 - 0.5) * 2
    arr2[:, :, 3] = ((1 - edge2) ** 1.2 * 85 + 5).clip(0, 255).astype(np.uint8)
    layer2 = Image.fromarray(arr2, "RGBA").filter(ImageFilter.GaussianBlur(radius=1.2))
    img_rgba.paste(layer2, (50, 180), layer2)

    # Layer 3: tiny detail in top-right (small mandelbrot-style)
    frac3_w, frac3_h = 380, 280
    data3 = generate_julia(
        frac3_w, frac3_h,
        c_real=0.4, c_imag=-0.35,
        x_range=(-1.2, 1.2),
        y_range=(-0.9, 0.9),
        max_iter=180,
    )
    layer3 = Image.new("RGBA", (frac3_w, frac3_h), (0, 0, 0, 0))
    arr3 = np.array(layer3)
    for ch, v in [(0, 140), (1, 230), (2, 255)]:  # cyan accent
        arr3[:, :, ch] = (v * (1 - data3) + BG_COLOR[ch] * data3).astype(np.uint8)
    edge3 = np.abs(data3 - 0.5) * 2
    arr3[:, :, 3] = ((1 - edge3) ** 1.4 * 120 + 8).clip(0, 255).astype(np.uint8)
    layer3 = Image.fromarray(arr3, "RGBA").filter(ImageFilter.GaussianBlur(radius=0.5))
    img_rgba.paste(layer3, (820, 40), layer3)

    # Flatten
    bg_layer = Image.new("RGBA", (WIDTH, HEIGHT), (*BG_COLOR, 255))
    final_rgba = Image.alpha_composite(bg_layer, img_rgba)

    # Left-side darkening gradient for text readability (top 60% dark for text)
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    for x in range(800):
        alpha_val = int(180 * (1 - x / 800) ** 0.75)
        overlay_draw.line([(x, 0), (x, HEIGHT)], fill=(*BG_COLOR, alpha_val))
    final_rgba = Image.alpha_composite(final_rgba, overlay)

    img = final_rgba.convert("RGB")
    draw = ImageDraw.Draw(img)

    # Fonts
    font_label = ImageFont.truetype(FONT_BOLD, 13)
    font_title = ImageFont.truetype(FONT_BOLD, 46)
    font_subtitle = ImageFont.truetype(FONT_REGULAR, 17)
    font_tag = ImageFont.truetype(FONT_REGULAR, 14)
    font_stat_big = ImageFont.truetype(FONT_BOLD, 24)
    font_lex_bold = ImageFont.truetype(FONT_BOLD, 18)
    font_lex = ImageFont.truetype(FONT_REGULAR, 13)

    # Top-right thin accent bar
    draw.rectangle([960, 38, 1140, 44], fill=ACCENT_COLOR)

    # Top-left label: "ML TRAINING" with orange dot
    draw.ellipse([60, 52, 72, 64], fill=ACCENT_COLOR)
    draw.text((80, 48), "ML TRAINING", fill=ACCENT_COLOR, font=font_label)

    # Big title (top ~55%, three lines, bold white)
    title_lines = [
        "2 ТБ українського права",
        "+ DeepSeek V3 860B",
        "на GCP",
    ]
    y_pos = 90
    for i, line in enumerate(title_lines):
        color = (255, 255, 255) if i != 1 else (255, 210, 150)  # middle line warmer
        draw.text((60, y_pos), line, fill=color, font=font_title)
        y_pos += 58

    # Subtitle
    draw.text(
        (60, y_pos + 10),
        "Що вийде, якщо прогнати наш корпус крізь MoE-модель.",
        fill=GRAY_COLOR,
        font=font_subtitle,
    )

    # Mid-left stats strip (three big numbers)
    stats_y = 390
    stats = [
        ("96M", "рішень ЄДРСР"),
        ("280B", "токенів"),
        ("v5p-2048", "TPU под"),
    ]
    sx = 60
    for big, small in stats:
        draw.text((sx, stats_y), big, fill=ACCENT_COLOR, font=font_stat_big)
        bw = draw.textbbox((0, 0), big, font=font_stat_big)[2]
        draw.text((sx, stats_y + 32), small, fill=GRAY_COLOR, font=font_tag)
        sx += max(bw, 130) + 30

    # Tags at bottom-left
    tags = ["DeepSeek V3", "MoE", "TPU v5p", "EDRSR"]
    tag_x = 60
    tag_y = 555
    for tag in tags:
        bbox = draw.textbbox((0, 0), tag, font=font_tag)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        pad_x, pad_y = 14, 7
        r = (th + pad_y * 2) // 2
        x0, y0 = tag_x, tag_y
        x1, y1 = tag_x + tw + pad_x * 2, tag_y + th + pad_y * 2
        draw.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=TAG_BG, outline=TAG_BORDER, width=1)
        draw.text((tag_x + pad_x, tag_y + pad_y - 1), tag, fill=TAG_TEXT, font=font_tag)
        tag_x = x1 + 10

    # Bottom-right LEX AI
    lex_x = 1070
    lex_y = 568
    draw.text((lex_x, lex_y), "LEX", fill=ACCENT_COLOR, font=font_lex_bold)
    lex_w = draw.textbbox((0, 0), "LEX", font=font_lex_bold)[2]
    draw.text((lex_x + lex_w + 4, lex_y), "AI", fill=(255, 255, 255), font=font_lex_bold)
    draw.text((lex_x - 2, lex_y + 24), "legal.org.ua", fill=GRAY_COLOR, font=font_lex)

    output_path = "/home/vovkes/SecondLayer/lexwebapp/public/blog-banners/deepseek-v3-860b-ukrainian-law.png"
    img.save(output_path, "PNG", optimize=True)
    print(f"Saved banner to {output_path}")
    print(f"Size: {img.size}")


if __name__ == "__main__":
    create_banner()

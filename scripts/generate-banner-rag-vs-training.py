#!/usr/bin/env python3
"""Generate fractal blog banner for RAG vs Training article — two opposing fractals."""

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

WIDTH, HEIGHT = 1200, 627
BG_COLOR = (14, 16, 30)  # deep navy
LEFT_FRAC_COLOR = (90, 170, 255)   # cool blue - RAG side
RIGHT_FRAC_COLOR = (255, 130, 60)  # warm orange - training side
TITLE_COLOR = (245, 245, 255)
ACCENT_COLOR = (255, 140, 40)
GRAY_COLOR = (170, 175, 200)
TAG_BG = (26, 30, 52)
TAG_BORDER = (70, 82, 130)
TAG_TEXT = (200, 208, 230)

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


def apply_fractal(img_rgba, data, w, h, pos_xy, color_rgb, max_alpha=180, blur=0.6, gamma=1.4):
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    arr = np.array(layer)
    for ch in range(3):
        arr[:, :, ch] = (color_rgb[ch] * (1 - data) + BG_COLOR[ch] * data).astype(np.uint8)
    edge = np.abs(data - 0.5) * 2
    arr[:, :, 3] = ((1 - edge) ** gamma * max_alpha + 8).clip(0, 255).astype(np.uint8)
    layer = Image.fromarray(arr, "RGBA").filter(ImageFilter.GaussianBlur(radius=blur))
    img_rgba.paste(layer, pos_xy, layer)


def create_banner():
    img = Image.new("RGB", (WIDTH, HEIGHT), BG_COLOR)
    img_rgba = img.convert("RGBA")

    # LEFT fractal — RAG side (blue, structured, Mandelbrot-like)
    d_left = generate_julia(
        720, 700,
        c_real=-0.75, c_imag=0.11,
        x_range=(-1.5, 1.5),
        y_range=(-1.2, 1.2),
        max_iter=260,
    )
    apply_fractal(img_rgba, d_left, 720, 700, (-80, -40), LEFT_FRAC_COLOR, max_alpha=170, blur=0.7, gamma=1.3)

    # RIGHT fractal — Training side (warm orange, flame-like Julia)
    d_right = generate_julia(
        720, 700,
        c_real=-0.4, c_imag=0.6,
        x_range=(-1.5, 1.5),
        y_range=(-1.2, 1.2),
        max_iter=280,
    )
    apply_fractal(img_rgba, d_right, 720, 700, (560, -40), RIGHT_FRAC_COLOR, max_alpha=180, blur=0.7, gamma=1.4)

    # Small accent fractal — top right, cyan
    d_small = generate_julia(
        380, 280,
        c_real=0.285, c_imag=0.01,
        x_range=(-1.3, 1.3),
        y_range=(-1.0, 1.0),
        max_iter=200,
    )
    apply_fractal(img_rgba, d_small, 380, 280, (820, 20), (120, 220, 240), max_alpha=110, blur=0.5, gamma=1.3)

    # Flatten
    bg_layer = Image.new("RGBA", (WIDTH, HEIGHT), (*BG_COLOR, 255))
    final_rgba = Image.alpha_composite(bg_layer, img_rgba)

    # Darkening gradient on left for text readability
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    for x in range(820):
        alpha_val = int(190 * (1 - x / 820) ** 0.7)
        overlay_draw.line([(x, 0), (x, HEIGHT)], fill=(*BG_COLOR, alpha_val))
    final_rgba = Image.alpha_composite(final_rgba, overlay)

    img = final_rgba.convert("RGB")
    draw = ImageDraw.Draw(img)

    # Fonts
    font_label = ImageFont.truetype(FONT_BOLD, 13)
    font_title = ImageFont.truetype(FONT_BOLD, 44)
    font_subtitle = ImageFont.truetype(FONT_REGULAR, 17)
    font_tag = ImageFont.truetype(FONT_REGULAR, 14)
    font_pill = ImageFont.truetype(FONT_BOLD, 20)
    font_lex_bold = ImageFont.truetype(FONT_BOLD, 18)
    font_lex = ImageFont.truetype(FONT_REGULAR, 13)

    # Top-right accent bar
    draw.rectangle([950, 38, 1140, 44], fill=ACCENT_COLOR)

    # Top-left label with orange dot
    draw.ellipse([60, 52, 72, 64], fill=ACCENT_COLOR)
    draw.text((80, 48), "LEGAL AI · ARCHITECTURE", fill=ACCENT_COLOR, font=font_label)

    # Main title (two lines, high-contrast)
    title_lines = [
        "RAG підсвічує,",
        "тренінг орієнтує",
    ]
    y_pos = 95
    for i, line in enumerate(title_lines):
        color = (90, 170, 255) if i == 0 else (255, 160, 90)  # blue vs orange
        draw.text((60, y_pos), line, fill=color, font=font_title)
        y_pos += 56

    # Subtitle — two lines
    draw.text(
        (60, y_pos + 15),
        "Що робити з неоднорідністю української",
        fill=TITLE_COLOR,
        font=font_subtitle,
    )
    draw.text(
        (60, y_pos + 38),
        "судової практики — два шари рішення.",
        fill=TITLE_COLOR,
        font=font_subtitle,
    )

    # Mid: two pills — "RAG + ваги" vs "Training + DPO"
    pill_y = 400
    pills = [
        ("RAG + ваги", (40, 60, 110), (90, 170, 255)),          # blue pill
        ("→", (255, 255, 255, 0), (255, 255, 255)),              # arrow - no bg
        ("Training + DPO", (90, 50, 20), (255, 160, 90)),        # orange pill
    ]
    px = 60
    for text, bg_col, text_col in pills:
        bbox = draw.textbbox((0, 0), text, font=font_pill)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        pad_x, pad_y = 18, 10
        if text == "→":
            draw.text((px + 8, pill_y + 4), text, fill=text_col, font=font_pill)
            px += tw + 24
        else:
            x0, y0 = px, pill_y
            x1, y1 = px + tw + pad_x * 2, pill_y + th + pad_y * 2
            r = (y1 - y0) // 2
            draw.rounded_rectangle([x0, y0, x1, y1], radius=r, fill=bg_col)
            draw.text((px + pad_x, pill_y + pad_y - 1), text, fill=text_col, font=font_pill)
            px = x1 + 16

    # Thin separator line
    draw.line([(60, 485), (640, 485)], fill=(60, 70, 110), width=1)

    # Below: small supporting text
    draw.text(
        (60, 500),
        "Від доступу — до опори. Від пошуковика — до ко-юриста.",
        fill=GRAY_COLOR,
        font=font_subtitle,
    )

    # Tags at bottom-left
    tags = ["RAG", "DPO", "MoE", "ЄДРСР", "Legal AI"]
    tag_x = 60
    tag_y = 560
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

    # Bottom-right LEX AI logo
    lex_x = 1070
    lex_y = 568
    draw.text((lex_x, lex_y), "LEX", fill=ACCENT_COLOR, font=font_lex_bold)
    lex_w = draw.textbbox((0, 0), "LEX", font=font_lex_bold)[2]
    draw.text((lex_x + lex_w + 4, lex_y), "AI", fill=(255, 255, 255), font=font_lex_bold)
    draw.text((lex_x - 2, lex_y + 24), "legal.org.ua", fill=GRAY_COLOR, font=font_lex)

    output_path = "/home/vovkes/SecondLayer/lexwebapp/public/blog-banners/rag-vs-training-legal-heterogeneity.png"
    img.save(output_path, "PNG", optimize=True)
    print(f"Saved banner to {output_path}")
    print(f"Size: {img.size}")


if __name__ == "__main__":
    create_banner()

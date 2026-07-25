#!/usr/bin/env python3
"""Generate fractal blog banner for Claude Code article."""

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

WIDTH, HEIGHT = 1200, 627
BG_COLOR = (15, 20, 35)  # dark navy
FRACTAL_COLOR = (100, 180, 255)  # bright blue (Claude-ish)
TITLE_COLOR = (240, 245, 255)  # near-white
ORANGE_COLOR = (255, 140, 50)  # warm orange for accent
GRAY_COLOR = (160, 170, 190)
TAG_BG = (30, 40, 60)
TAG_BORDER = (80, 100, 140)
TAG_TEXT = (200, 210, 230)
ACCENT_BAR = (100, 180, 255)

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

    # Generate Julia set fractal - network/connectivity pattern
    frac_w, frac_h = 1000, 627
    fractal_data = generate_julia_fractal(
        frac_w, frac_h,
        c_real=-0.8, c_imag=0.156,
        x_range=(-1.5, 1.5),
        y_range=(-1.0, 1.0),
        max_iter=300
    )

    fractal_img = Image.new("RGBA", (frac_w, frac_h), (0, 0, 0, 0))
    fractal_arr = np.array(fractal_img)

    for ch, base_val, frac_val in [(0, BG_COLOR[0], FRACTAL_COLOR[0]),
                                     (1, BG_COLOR[1], FRACTAL_COLOR[1]),
                                     (2, BG_COLOR[2], FRACTAL_COLOR[2])]:
        fractal_arr[:, :, ch] = (frac_val * (1 - fractal_data) + base_val * fractal_data).astype(np.uint8)

    edge_factor = np.abs(fractal_data - 0.5) * 2
    alpha = ((1 - edge_factor) * 120 + 15).clip(0, 255).astype(np.uint8)
    fractal_arr[:, :, 3] = alpha

    fractal_img = Image.fromarray(fractal_arr, "RGBA")
    fractal_img = fractal_img.filter(ImageFilter.GaussianBlur(radius=1.0))

    img_rgba = img.convert("RGBA")
    img_rgba.paste(fractal_img, (250, 0), fractal_img)

    # Second fractal layer - different parameter for variety
    frac2_data = generate_julia_fractal(
        700, 450,
        c_real=0.285, c_imag=0.01,
        x_range=(-1.3, 1.3),
        y_range=(-0.9, 0.9),
        max_iter=200
    )
    frac2_img = Image.new("RGBA", (700, 450), (0, 0, 0, 0))
    frac2_arr = np.array(frac2_img)
    for ch, frac_val in [(0, 60), (1, 130), (2, 220)]:
        frac2_arr[:, :, ch] = (frac_val * (1 - frac2_data) + BG_COLOR[ch] * frac2_data).astype(np.uint8)
    edge2 = np.abs(frac2_data - 0.5) * 2
    frac2_arr[:, :, 3] = ((1 - edge2) * 80 + 8).clip(0, 255).astype(np.uint8)
    frac2_img = Image.fromarray(frac2_arr, "RGBA")
    frac2_img = frac2_img.filter(ImageFilter.GaussianBlur(radius=0.6))
    img_rgba.paste(frac2_img, (500, 200), frac2_img)

    bg_layer = Image.new("RGBA", (WIDTH, HEIGHT), (*BG_COLOR, 255))
    final_rgba = Image.alpha_composite(bg_layer, img_rgba)
    img = final_rgba.convert("RGB")

    draw = ImageDraw.Draw(img)

    # Gradient overlay on left for text readability
    overlay = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    for x in range(750):
        alpha_val = int(200 * (1 - x / 750) ** 0.5)
        overlay_draw.line([(x, 0), (x, HEIGHT)], fill=(*BG_COLOR, alpha_val))
    img_rgba2 = img.convert("RGBA")
    img_rgba2 = Image.alpha_composite(img_rgba2, overlay)
    img = img_rgba2.convert("RGB")
    draw = ImageDraw.Draw(img)

    # Load fonts
    font_label = ImageFont.truetype(FONT_BOLD, 14)
    font_title = ImageFont.truetype(FONT_BOLD, 46)
    font_subtitle = ImageFont.truetype(FONT_REGULAR, 17)
    font_tag = ImageFont.truetype(FONT_REGULAR, 15)
    font_lex_bold = ImageFont.truetype(FONT_BOLD, 18)
    font_lex = ImageFont.truetype(FONT_REGULAR, 13)
    font_stat = ImageFont.truetype(FONT_BOLD, 28)
    font_stat_label = ImageFont.truetype(FONT_REGULAR, 12)

    # Top accent bar
    draw.rectangle([980, 45, 1140, 52], fill=ACCENT_BAR)

    # Category label
    draw.ellipse([60, 58, 72, 70], fill=ORANGE_COLOR)
    draw.text((80, 53), "AI PRODUCTIVITY", fill=ORANGE_COLOR, font=font_label)

    # Main title
    title_lines = ["735 \u043a\u043e\u043c\u0456\u0442\u0456\u0432", "\u0437\u0430 25 \u0434\u043d\u0456\u0432:", "Claude Code"]
    y_pos = 88
    for i, line in enumerate(title_lines):
        color = ORANGE_COLOR if i == 2 else TITLE_COLOR
        draw.text((60, y_pos), line, fill=color, font=font_title)
        y_pos += 55

    # Subtitle
    draw.text((60, y_pos + 12),
              "486 sessions | 5 612 messages | 193K lines",
              fill=GRAY_COLOR, font=font_subtitle)

    # Stats row
    stats = [("735", "commits"), ("22K", "bash cmds"), ("89%", "success")]
    stat_x = 60
    stat_y = 430
    for val, label in stats:
        draw.text((stat_x, stat_y), val, fill=ACCENT_BAR, font=font_stat)
        draw.text((stat_x, stat_y + 34), label, fill=GRAY_COLOR, font=font_stat_label)
        stat_x += 150

    # Tags
    tags = ["Claude Code", "AI", "Startups", "MCP", "DevOps"]
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

    # Bottom-right: LEX AI
    lex_x = 1070
    lex_y = 570
    draw.text((lex_x, lex_y), "LEX", fill=ORANGE_COLOR, font=font_lex_bold)
    lex_w = draw.textbbox((0, 0), "LEX", font=font_lex_bold)[2]
    draw.text((lex_x + lex_w + 4, lex_y), "AI", fill=TITLE_COLOR, font=font_lex_bold)
    draw.text((lex_x - 2, lex_y + 24), "legal.org.ua", fill=GRAY_COLOR, font=font_lex)

    output_path = "/home/vovkes/SecondLayer/lexwebapp/public/blog-banners/claude-code-building-startups.png"
    img.save(output_path, "PNG", optimize=True)
    print(f"Saved banner to {output_path}")
    print(f"Size: {img.size}")


if __name__ == "__main__":
    create_banner()

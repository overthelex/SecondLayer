#!/usr/bin/env python3
"""Generate blog banner images with fractal backgrounds and text overlays.

Style: light background, subtle Mandelbrot fractal on right side,
large title text on left, category tag, subtitle, keywords, LEX AI watermark.
"""

import math
import struct
import zlib
import os

# Banner dimensions matching existing ones
W, H = 1200, 627

# Color schemes per article
SCHEMES = {
    # Tech articles - blue/indigo
    'tech-blue': {
        'bg': (235, 241, 252),        # light blue-gray
        'fractal_base': (180, 200, 235),
        'fractal_glow': (100, 140, 210),
        'title_color': (25, 35, 60),
        'accent_color': (59, 130, 246),  # blue-500
        'tag_bg': (219, 234, 254),
        'tag_text': (59, 130, 246),
        'sub_color': (100, 116, 139),
    },
    # Tech articles - dark blue
    'tech-navy': {
        'bg': (230, 237, 248),
        'fractal_base': (170, 190, 225),
        'fractal_glow': (80, 120, 200),
        'title_color': (15, 23, 42),
        'accent_color': (37, 99, 235),
        'tag_bg': (219, 234, 254),
        'tag_text': (37, 99, 235),
        'sub_color': (100, 116, 139),
    },
    # Tech articles - warm/coral
    'tech-coral': {
        'bg': (252, 240, 237),
        'fractal_base': (235, 195, 180),
        'fractal_glow': (220, 120, 90),
        'title_color': (30, 25, 25),
        'accent_color': (234, 88, 12),   # orange-600
        'tag_bg': (255, 237, 213),
        'tag_text': (234, 88, 12),
        'sub_color': (120, 100, 90),
    },
    # Tech articles - teal/green
    'tech-teal': {
        'bg': (236, 248, 246),
        'fractal_base': (180, 220, 210),
        'fractal_glow': (60, 170, 150),
        'title_color': (20, 40, 35),
        'accent_color': (13, 148, 136),  # teal-600
        'tag_bg': (204, 251, 241),
        'tag_text': (13, 148, 136),
        'sub_color': (100, 120, 115),
    },
    # Legal articles - amber/gold
    'legal-amber': {
        'bg': (252, 247, 235),
        'fractal_base': (230, 210, 175),
        'fractal_glow': (200, 160, 80),
        'title_color': (30, 28, 20),
        'accent_color': (217, 119, 6),  # amber-600
        'tag_bg': (254, 243, 199),
        'tag_text': (217, 119, 6),
        'sub_color': (120, 110, 90),
    },
    # Diia - blue/purple (government digital)
    'tech-purple': {
        'bg': (238, 238, 250),
        'fractal_base': (190, 190, 230),
        'fractal_glow': (100, 100, 200),
        'title_color': (25, 25, 55),
        'accent_color': (109, 40, 217),  # violet-600
        'tag_bg': (237, 233, 254),
        'tag_text': (109, 40, 217),
        'sub_color': (100, 100, 130),
    },
    # MCP Connect - green/data
    'legal-green': {
        'bg': (237, 248, 240),
        'fractal_base': (180, 225, 195),
        'fractal_glow': (34, 160, 100),
        'title_color': (20, 40, 30),
        'accent_color': (22, 163, 74),  # green-600
        'tag_bg': (220, 252, 231),
        'tag_text': (22, 163, 74),
        'sub_color': (90, 120, 100),
    },
}


def mandelbrot_value(cx, cy, max_iter=80):
    """Compute smooth Mandelbrot escape value."""
    zx, zy = 0.0, 0.0
    for i in range(max_iter):
        if zx * zx + zy * zy > 4.0:
            # Smooth coloring
            log_zn = math.log(zx * zx + zy * zy) / 2
            nu = math.log(log_zn / math.log(2)) / math.log(2)
            return (i + 1 - nu) / max_iter
        zx, zy = zx * zx - zy * zy + cx, 2 * zx * zy + cy
    return 0.0


def julia_value(zx, zy, cx, cy, max_iter=80):
    """Compute smooth Julia set escape value."""
    for i in range(max_iter):
        if zx * zx + zy * zy > 4.0:
            log_zn = math.log(zx * zx + zy * zy) / 2
            nu = math.log(log_zn / math.log(2)) / math.log(2)
            return (i + 1 - nu) / max_iter
        zx, zy = zx * zx - zy * zy + cx, 2 * zx * zy + cy
    return 0.0


def generate_fractal_bg(scheme, fractal_type='mandelbrot', seed=0):
    """Generate fractal background as raw pixel data."""
    bg = scheme['bg']
    fb = scheme['fractal_base']
    fg = scheme['fractal_glow']

    pixels = bytearray(W * H * 3)

    # Fractal parameters - position fractal on right side
    if fractal_type == 'mandelbrot':
        # Different zoom/position based on seed for variety
        centers = [
            (-0.75, 0.0, 1.5),      # Classic overview
            (-0.745, 0.186, 0.08),   # Seahorse valley
            (-1.25, 0.02, 0.15),     # Mini-brot
            (-0.16, 1.035, 0.06),    # Spiral
            (-0.7463, 0.1102, 0.005), # Deep zoom
            (0.3, 0.02, 0.4),        # Tail area
            (-1.768, 0.001, 0.02),   # Needle
        ]
        cx, cy, span = centers[seed % len(centers)]
    else:
        # Julia set parameters
        julia_params = [
            (-0.7, 0.27015),
            (-0.8, 0.156),
            (0.285, 0.01),
            (-0.4, 0.6),
            (0.355, 0.355),
            (-0.70176, -0.3842),
            (0.37, 0.1),
        ]
        jcx, jcy = julia_params[seed % len(julia_params)]
        cx, cy, span = 0.0, 0.0, 1.8

    aspect = W / H

    for y in range(H):
        for x in range(W):
            # Map pixel to fractal coordinates
            # Shift fractal to right side (offset by 0.3 of width)
            fx = cx + (x / W - 0.3) * span * aspect
            fy = cy + (y / H - 0.5) * span

            if fractal_type == 'mandelbrot':
                v = mandelbrot_value(fx, fy, 80)
            else:
                v = julia_value(fx, fy, jcx, jcy, 80)

            # Fade fractal on left side (text area should be clean)
            fade = min(1.0, max(0.0, (x / W - 0.1) * 2.5))
            v *= fade

            # Also fade at edges
            edge_fade = min(1.0, x / 40, (W - x) / 40, y / 20, (H - y) / 20)
            v *= edge_fade

            # Mix colors
            if v > 0:
                # Blend between base and glow based on value
                t = min(1.0, v * 3)
                r = int(bg[0] * (1 - v * 0.7) + fb[0] * v * 0.5 + fg[0] * t * 0.2)
                g = int(bg[1] * (1 - v * 0.7) + fb[1] * v * 0.5 + fg[1] * t * 0.2)
                b = int(bg[2] * (1 - v * 0.7) + fb[2] * v * 0.5 + fg[2] * t * 0.2)
            else:
                r, g, b = bg

            r = max(0, min(255, r))
            g = max(0, min(255, g))
            b = max(0, min(255, b))

            idx = (y * W + x) * 3
            pixels[idx] = r
            pixels[idx + 1] = g
            pixels[idx + 2] = b

    return pixels


def write_png(filename, pixels, width, height):
    """Write raw RGB pixels to PNG file."""
    def make_chunk(chunk_type, data):
        c = chunk_type + data
        crc = zlib.crc32(c) & 0xffffffff
        return struct.pack('>I', len(data)) + c + struct.pack('>I', crc)

    # PNG signature
    sig = b'\x89PNG\r\n\x1a\n'

    # IHDR
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    ihdr = make_chunk(b'IHDR', ihdr_data)

    # IDAT - raw pixel data with filter bytes
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)  # No filter
        offset = y * width * 3
        raw_data.extend(pixels[offset:offset + width * 3])

    compressed = zlib.compress(bytes(raw_data), 9)
    idat = make_chunk(b'IDAT', compressed)

    # IEND
    iend = make_chunk(b'IEND', b'')

    with open(filename, 'wb') as f:
        f.write(sig + ihdr + idat + iend)


def draw_text_on_pixels(pixels, text, x, y, font_data, size, color, bold=False):
    """Draw text using Pillow and composite onto pixel buffer."""
    from PIL import Image, ImageDraw, ImageFont

    # Create temporary image for text rendering
    img = Image.frombytes('RGB', (W, H), bytes(pixels))
    draw = ImageDraw.Draw(img)

    try:
        font = ImageFont.truetype(font_data, size)
    except (OSError, IOError):
        font = ImageFont.load_default()

    draw.text((x, y), text, fill=color, font=font)

    # Copy back to pixel buffer
    result = bytearray(img.tobytes())
    return result


def draw_rounded_rect(pixels, x, y, w, h, color, radius=8):
    """Draw a filled rounded rectangle."""
    for py in range(max(0, y), min(H, y + h)):
        for px in range(max(0, x), min(W, x + w)):
            # Check if inside rounded rect
            rx, ry = px - x, py - y
            inside = True

            # Corner checks
            if rx < radius and ry < radius:
                if (rx - radius) ** 2 + (ry - radius) ** 2 > radius ** 2:
                    inside = False
            elif rx > w - radius and ry < radius:
                if (rx - (w - radius)) ** 2 + (ry - radius) ** 2 > radius ** 2:
                    inside = False
            elif rx < radius and ry > h - radius:
                if (rx - radius) ** 2 + (ry - (h - radius)) ** 2 > radius ** 2:
                    inside = False
            elif rx > w - radius and ry > h - radius:
                if (rx - (w - radius)) ** 2 + (ry - (h - radius)) ** 2 > radius ** 2:
                    inside = False

            if inside:
                idx = (py * W + px) * 3
                pixels[idx] = color[0]
                pixels[idx + 1] = color[1]
                pixels[idx + 2] = color[2]


def create_banner(article_id, scheme_name, category_label, title_lines,
                  accent_words, subtitle, keywords, fractal_type='mandelbrot',
                  seed=0):
    """Create a complete blog banner."""
    scheme = SCHEMES[scheme_name]
    out_path = f'/home/vovkes/SecondLayer/lexwebapp/public/blog-banners/{article_id}.png'

    print(f'  Generating fractal for {article_id}...')
    pixels = generate_fractal_bg(scheme, fractal_type, seed)

    # Use Pillow for text rendering
    from PIL import Image, ImageDraw, ImageFont

    img = Image.frombytes('RGB', (W, H), bytes(pixels))
    draw = ImageDraw.Draw(img)

    FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
    FONT_REG = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    FONT_MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'

    # Category tag (small rounded pill)
    tag_font = ImageFont.truetype(FONT_BOLD, 11)
    tag_text = category_label.upper()
    tag_bbox = draw.textbbox((0, 0), tag_text, font=tag_font)
    tag_w = tag_bbox[2] - tag_bbox[0] + 24
    tag_h = 26
    tag_x, tag_y = 60, 55

    # Draw tag background
    pixels_mut = bytearray(img.tobytes())
    draw_rounded_rect(pixels_mut, tag_x, tag_y, tag_w, tag_h, scheme['tag_bg'], 13)
    img = Image.frombytes('RGB', (W, H), bytes(pixels_mut))
    draw = ImageDraw.Draw(img)

    # Draw dot before tag
    dot_x = tag_x + 10
    dot_y = tag_y + tag_h // 2
    draw.ellipse([dot_x - 3, dot_y - 3, dot_x + 3, dot_y + 3], fill=scheme['tag_text'])
    draw.text((dot_x + 8, tag_y + 5), tag_text, fill=scheme['tag_text'], font=tag_font)

    # Title - large bold text
    title_font = ImageFont.truetype(FONT_BOLD, 42)
    title_y = tag_y + tag_h + 20

    for line in title_lines:
        # Check if any word in this line should be accent colored
        words = line.split(' ')
        current_x = 60

        for i, word in enumerate(words):
            color = scheme['accent_color'] if word in accent_words else scheme['title_color']
            draw.text((current_x, title_y), word, fill=color, font=title_font)
            bbox = draw.textbbox((current_x, title_y), word + ' ', font=title_font)
            current_x = bbox[2]

        title_y += 52

    # Subtitle
    sub_font = ImageFont.truetype(FONT_REG, 16)
    sub_y = title_y + 12
    draw.text((60, sub_y), subtitle, fill=scheme['sub_color'], font=sub_font)

    # Keywords at bottom
    kw_font = ImageFont.truetype(FONT_REG, 13)
    kw_y = H - 70
    kw_x = 60

    pixels_mut = bytearray(img.tobytes())
    for kw in keywords:
        kw_bbox = draw.textbbox((0, 0), kw, font=kw_font)
        kw_w = kw_bbox[2] - kw_bbox[0] + 20
        kw_h = 28
        draw_rounded_rect(pixels_mut, kw_x, kw_y, kw_w, kw_h, (255, 255, 255), 14)
        kw_x += kw_w + 12

    img = Image.frombytes('RGB', (W, H), bytes(pixels_mut))
    draw = ImageDraw.Draw(img)

    # Redraw keyword text
    kw_x = 60
    for kw in keywords:
        kw_bbox = draw.textbbox((0, 0), kw, font=kw_font)
        kw_w = kw_bbox[2] - kw_bbox[0] + 20
        kw_h = 28
        draw.text((kw_x + 10, kw_y + 6), kw, fill=scheme['sub_color'], font=kw_font)
        kw_x += kw_w + 12

    # Dashes between keywords
    kw_x_start = 60
    for i, kw in enumerate(keywords):
        kw_bbox = draw.textbbox((0, 0), kw, font=kw_font)
        kw_w = kw_bbox[2] - kw_bbox[0] + 20
        kw_x_start += kw_w
        if i < len(keywords) - 1:
            dash_y = kw_y + 14
            draw.line([(kw_x_start + 2, dash_y), (kw_x_start + 10, dash_y)],
                      fill=(200, 200, 210), width=1)
        kw_x_start += 12

    # LEX AI watermark (bottom right)
    wm_font = ImageFont.truetype(FONT_REG, 14)
    wm_small = ImageFont.truetype(FONT_REG, 11)
    draw.text((W - 130, H - 60), 'LEX', fill=scheme['accent_color'], font=wm_font)
    lex_bbox = draw.textbbox((W - 130, H - 60), 'LEX ', font=wm_font)
    draw.text((lex_bbox[2], H - 60), 'AI', fill=scheme['sub_color'], font=wm_font)
    draw.text((W - 130, H - 40), 'legal.org.ua', fill=scheme['sub_color'], font=wm_small)

    # Decorative line (top right) - matches existing style
    line_color = scheme['accent_color']
    draw.line([(W - 200, 55), (W - 60, 55)], fill=line_color, width=3)

    img.save(out_path, 'PNG', optimize=True)
    size_kb = os.path.getsize(out_path) // 1024
    print(f'  Saved {out_path} ({size_kb} KB)')


if __name__ == '__main__':
    banners = [
        # 5 new articles
        {
            'article_id': 'chat-latency-optimization',
            'scheme_name': 'tech-coral',
            'category_label': 'Performance',
            'title_lines': ['Chat Latency:', '7 Optimization', 'Phases'],
            'accent_words': ['7', 'Optimization'],
            'subtitle': 'From 12s to 2.8s. Parallel tools, SSE streaming, 3-tier caching.',
            'keywords': ['Parallel', 'Streaming', 'Caching', 'Prompts'],
            'fractal_type': 'mandelbrot',
            'seed': 1,
        },
        {
            'article_id': 'bedrock-llm-fallback',
            'scheme_name': 'tech-navy',
            'category_label': 'Infrastructure',
            'title_lines': ['AWS Bedrock:', 'From OpenAI', 'to Claude + Nova'],
            'accent_words': ['Bedrock:'],
            'subtitle': 'One SDK. IAM auth. EU data residency. Unified billing.',
            'keywords': ['Bedrock', 'Nova Pro', 'IAM', 'Fallback'],
            'fractal_type': 'mandelbrot',
            'seed': 3,
        },
        {
            'article_id': 'erb-nbu-due-diligence',
            'scheme_name': 'legal-amber',
            'category_label': 'Compliance',
            'title_lines': ['ERB Debtors &', 'NBU Banks:', '18 Registries'],
            'accent_words': ['18', 'Registries'],
            'subtitle': 'Unified debtors registry + bank license verification in one query.',
            'keywords': ['ERB', 'NBU', 'Due Diligence', 'Compliance'],
            'fractal_type': 'julia',
            'seed': 2,
        },
        {
            'article_id': 'server-side-evidence',
            'scheme_name': 'tech-blue',
            'category_label': 'Architecture',
            'title_lines': ['Server-Side', 'Evidence', 'Extraction'],
            'accent_words': ['Evidence'],
            'subtitle': 'From client-side regex to structured SSE events. 2.1s to 0.8s.',
            'keywords': ['SSE', 'Evidence', 'Fallback', 'Mobile'],
            'fractal_type': 'mandelbrot',
            'seed': 5,
        },
        {
            'article_id': 'edrsr-fulltext-pipeline',
            'scheme_name': 'tech-teal',
            'category_label': 'Data Pipeline',
            'title_lines': ['EDRSR: 30M Court', 'Decisions from', 'Open Data'],
            'accent_words': ['30M', 'Open'],
            'subtitle': '137 GB of full-text court decisions. 685 courts. 94-97% coverage.',
            'keywords': ['EDRSR', 'PostgreSQL', 'Open Data', 'Pipeline'],
            'fractal_type': 'julia',
            'seed': 4,
        },
        # 2 fixes for existing articles (missing text)
        {
            'article_id': 'diia-digital-identity',
            'scheme_name': 'tech-purple',
            'category_label': 'Auth / Identity',
            'title_lines': ['Diia Login:', 'National Digital', 'Identity for Legal AI'],
            'accent_words': ['Diia', 'Digital'],
            'subtitle': 'ECDSA + SHA256. QR codes. Deep links. One tap to verify.',
            'keywords': ['Diia', 'ECDSA', 'QR Code', 'JWT'],
            'fractal_type': 'julia',
            'seed': 0,
        },
        {
            'article_id': 'mcp-connect-open-data',
            'scheme_name': 'legal-green',
            'category_label': 'Integration',
            'title_lines': ['MCP Connect:', 'Nextcloud, Drive &', '1400+ Datasets'],
            'accent_words': ['MCP', '1400+'],
            'subtitle': 'Your files + open data + legal AI. One unified interface.',
            'keywords': ['Nextcloud', 'Google Drive', 'Open Data', 'MCP'],
            'fractal_type': 'mandelbrot',
            'seed': 6,
        },
        {
            'article_id': 'developer-platform-api',
            'scheme_name': 'tech-navy',
            'category_label': 'Developer Platform',
            'title_lines': ['Developer Platform:', '56 Legal AI Tools', 'via One API'],
            'accent_words': ['56', 'API'],
            'subtitle': 'API keys. Usage analytics. 3 transports. 5 min to first request.',
            'keywords': ['MCP SSE', 'REST', 'Python', 'TypeScript'],
            'fractal_type': 'julia',
            'seed': 7,
        },
    ]

    print(f'Generating {len(banners)} banners...')
    for b in banners:
        create_banner(**b)
    print('Done!')

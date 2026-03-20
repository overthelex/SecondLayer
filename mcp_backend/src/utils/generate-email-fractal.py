#!/usr/bin/env python3
"""Generate fractal header banner for payment success email.

Outputs a PNG file at mcp_backend/src/assets/email-header-fractal.png
Style matches blog banners: light bg, Mandelbrot fractal on right side.
Size: 600x160 (email-optimized, smaller than blog 1200x627).
"""

import math
import struct
import zlib
import os

W, H = 600, 160

# tech-blue scheme — bold fractal for email header
BG = (232, 239, 250)          # light blue-gray
FRACTAL_BASE = (130, 165, 215)
FRACTAL_GLOW = (55, 100, 195)


def mandelbrot_value(cx, cy, max_iter=80):
    zx, zy = 0.0, 0.0
    for i in range(max_iter):
        if zx * zx + zy * zy > 4.0:
            log_zn = math.log(zx * zx + zy * zy) / 2
            nu = math.log(log_zn / math.log(2)) / math.log(2)
            return (i + 1 - nu) / max_iter
        zx, zy = zx * zx - zy * zy + cx, 2 * zx * zy + cy
    return 0.0


def generate():
    pixels = bytearray(W * H * 3)

    # Julia set — produces beautiful spiral tendrils like blog banners
    jcx, jcy = -0.7, 0.27015
    span = 1.6
    aspect = W / H

    for y in range(H):
        for x in range(W):
            # Map pixel to fractal coords, centered on right side
            fx = (x / W - 0.65) * span * aspect
            fy = (y / H - 0.5) * span

            v = julia_value(fx, fy, jcx, jcy, 100)

            # Fade on left side (keep clean for logo/text overlay)
            fade = min(1.0, max(0.0, (x / W - 0.25) * 2.5))
            v *= fade

            # Fade at edges
            edge_fade = min(1.0, x / 20, (W - x) / 20, y / 10, (H - y) / 10)
            v *= edge_fade

            if v > 0:
                t = min(1.0, v * 3)
                # Bold color mixing for email header
                r = int(BG[0] * (1 - v * 0.95) + FRACTAL_BASE[0] * v * 0.6 + FRACTAL_GLOW[0] * t * 0.35)
                g = int(BG[1] * (1 - v * 0.95) + FRACTAL_BASE[1] * v * 0.6 + FRACTAL_GLOW[1] * t * 0.35)
                b = int(BG[2] * (1 - v * 0.95) + FRACTAL_BASE[2] * v * 0.6 + FRACTAL_GLOW[2] * t * 0.35)
            else:
                r, g, b = BG

            r = max(0, min(255, r))
            g = max(0, min(255, g))
            b = max(0, min(255, b))

            idx = (y * W + x) * 3
            pixels[idx] = r
            pixels[idx + 1] = g
            pixels[idx + 2] = b

    return pixels


def julia_value(zx, zy, cx, cy, max_iter=100):
    for i in range(max_iter):
        if zx * zx + zy * zy > 4.0:
            log_zn = math.log(zx * zx + zy * zy) / 2
            nu = math.log(log_zn / math.log(2)) / math.log(2)
            return (i + 1 - nu) / max_iter
        zx, zy = zx * zx - zy * zy + cx, 2 * zx * zy + cy
    return 0.0


def write_png(filename, pixels, w, h):
    """Write raw RGB pixels to PNG (no dependencies needed)."""
    def chunk(chunk_type, data):
        c = chunk_type + data
        crc = struct.pack('>I', zlib.crc32(c) & 0xffffffff)
        return struct.pack('>I', len(data)) + c + crc

    raw = b''
    for y in range(h):
        raw += b'\x00'  # filter byte
        raw += bytes(pixels[y * w * 3:(y + 1) * w * 3])

    compressed = zlib.compress(raw, 9)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', compressed)
    png += chunk(b'IEND', b'')

    with open(filename, 'wb') as f:
        f.write(png)
    print(f"Written {filename} ({len(png)} bytes)")


if __name__ == '__main__':
    out_dir = os.path.join(os.path.dirname(__file__), '..', 'assets')
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, 'email-header-fractal.png')

    pixels = generate()
    write_png(out_path, pixels, W, H)

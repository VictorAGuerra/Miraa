import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = "/home/victor/Desktop/CC/Local/Miraa"
SRC = f"{ROOT}/Miraa-logo.png"
OUT = f"{ROOT}/public/img"

BLACK = np.array([5, 5, 8])
PURPLE = np.array([124, 58, 237])   # #7c3aed
PURPLE_2 = np.array([192, 132, 252])  # #c084fc

logo = Image.open(SRC).convert("RGBA")
arr = np.array(logo)
alpha = arr[:, :, 3]

ys, xs = np.where(alpha > 10)
pad = 14
x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad, arr.shape[1])
y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad, arr.shape[0])
cropped = logo.crop((x0, y0, x1, y1))
cropped.save(f"{OUT}/logo-black.png")

carr = np.array(cropped).copy()
carr[:, :, 0] = 255
carr[:, :, 1] = 255
carr[:, :, 2] = 255
white_logo = Image.fromarray(carr, "RGBA")
white_logo.save(f"{OUT}/logo-white.png")


def gradient_square(size, c1, c2):
    idx = np.arange(size)
    xs_idx, ys_idx = np.meshgrid(idx, idx)
    t = (xs_idx + ys_idx) / (2 * (size - 1))
    t = t[..., None]
    grad = (c1[None, None, :] * (1 - t) + c2[None, None, :] * t).astype(np.uint8)
    return Image.fromarray(grad, "RGB")


def make_badge(size, corner_ratio, logo_scale, filename, rounded=True, alpha_out=True):
    bg = gradient_square(size, BLACK, PURPLE).convert("RGBA")
    if rounded:
        mask = Image.new("L", (size, size), 0)
        d = ImageDraw.Draw(mask)
        radius = int(size * corner_ratio)
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
        bg.putalpha(mask)

    lw, lh = white_logo.size
    scale = (size * logo_scale) / max(lw, lh)
    new_size = (max(1, int(lw * scale)), max(1, int(lh * scale)))
    logo_resized = white_logo.resize(new_size, Image.LANCZOS)
    px = (size - new_size[0]) // 2
    py = (size - new_size[1]) // 2 + int(size * 0.02)
    bg.alpha_composite(logo_resized, (px, py))

    if not alpha_out:
        bg = bg.convert("RGB")
    bg.save(filename)
    return bg


badge_512 = make_badge(512, 0.22, 0.58, f"{OUT}/favicon-512.png", rounded=True, alpha_out=True)
make_badge(180, 0.0, 0.6, f"{OUT}/apple-touch-icon.png", rounded=False, alpha_out=False)
make_badge(32, 0.22, 0.58, f"{OUT}/favicon-32.png", rounded=True, alpha_out=True)
make_badge(16, 0.22, 0.6, f"{OUT}/favicon-16.png", rounded=True, alpha_out=True)

badge_512.save(
    f"{OUT}/favicon.ico",
    sizes=[(16, 16), (32, 32), (48, 48), (64, 64)],
)

print("OK")

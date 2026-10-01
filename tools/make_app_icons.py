"""
Generates the app icons needed for a PWA install and a Play Store listing.

All cut from the same source artwork as the website logo, via
build_artwork() in make_logo_assets.py, so the app and the site match exactly.

Run:  python tools\\make_app_icons.py
"""

import pathlib
import sys
from PIL import Image, ImageDraw

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from make_logo_assets import build_artwork  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parent.parent / "icons"

NAVY = (11, 42, 91)
ROYAL = (29, 78, 216)
EMERALD = (5, 150, 105)
WHITE = (255, 255, 255)
OFFWHITE = (246, 248, 251)


def gradient(size, top, bottom):
    """Vertical two-stop gradient, drawn at 1px per row then scaled."""
    strip = Image.new("RGB", (1, size))
    px = strip.load()
    for y in range(size):
        t = y / max(1, size - 1)
        px[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return strip.resize((size, size), Image.BICUBIC)


def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def fit(img, box):
    """Scale an RGBA image to fit inside a square box, preserving ratio."""
    scale = box / max(img.size)
    return img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)


def compose(size, mark, ink_bg=None, mark_ratio=0.62, radius=0, pad_ratio=0.0):
    """
    Build one square icon.

    ink_bg    - background gradient, or None for solid white
    mark_ratio - logo size as a fraction of the canvas
    radius    - corner radius in px (0 = square, for maskable/full-bleed)
    pad_ratio - extra inset for maskable safe zones
    """
    if ink_bg:
        canvas = gradient(size, ink_bg[0], ink_bg[1]).convert("RGBA")
    else:
        canvas = Image.new("RGBA", (size, size), WHITE + (255,))

    box = round(size * mark_ratio)
    logo = fit(mark, box)
    px = round(size * pad_ratio)

    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    layer.paste(logo, ((size - logo.width) // 2, (size - logo.height) // 2), logo)
    canvas.alpha_composite(layer)

    if radius:
        # Keep the transparent outside the rounded corners.
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        out.paste(canvas, (0, 0), rounded_mask(size, radius))
        return out
    return canvas


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    _, mark, _ = build_artwork()

    # ---- PWA / launcher icons -------------------------------------------
    # White plate: the artwork is dark navy, so a light background is what
    # keeps it readable at 48px on a home screen.
    for size in (192, 512):
        icon = compose(size, mark, ink_bg=(WHITE, OFFWHITE), mark_ratio=0.66, radius=round(size * 0.22))
        icon.save(OUT / f"icon-{size}.png", optimize=True)
        print(f"icon-{size}.png      {icon.size}")

    # ---- maskable -------------------------------------------------------
    # Android crops these to whatever shape the launcher uses, so the logo
    # must sit inside the middle 80% and the background must be full-bleed.
    maskable = compose(512, mark, ink_bg=(NAVY, ROYAL), mark_ratio=0.50, radius=0, pad_ratio=0.10)
    maskable.save(OUT / "maskable-512.png", optimize=True)
    print("maskable-512.png  512x512 (navy->royal, full bleed)")

    # The shield is navy on a navy plate here, so re-cut it in white.
    white_mark = Image.new("RGBA", mark.size, WHITE + (255,))
    white_mark.putalpha(mark.getchannel("A"))
    maskable_w = compose(512, white_mark, ink_bg=(NAVY, ROYAL), mark_ratio=0.50, radius=0, pad_ratio=0.10)
    maskable_w.save(OUT / "maskable-512.png", optimize=True)
    print("maskable-512.png  rewritten with a white shield")

    # ---- Play Store listing icon ----------------------------------------
    # Google requires 512x512, 32-bit PNG, and a background that is not
    # transparent. This one is the full lockup so the wordmark is readable in
    # search results.
    full, _, _ = build_artwork()
    store = compose(512, full, ink_bg=(WHITE, OFFWHITE), mark_ratio=0.86)
    store.save(OUT / "play-store-512.png", optimize=True)
    print("play-store-512.png 512x512 (full lockup, opaque)")

    # ---- feature graphic (Play listing banner, 1024x500) ----------------
    banner = Image.new("RGBA", (1024, 500), (255, 255, 255, 255))
    logo = fit(full, 300)
    banner.paste(logo, (70, (500 - logo.height) // 2), logo)
    text = Image.new("RGBA", (560, 200), (0, 0, 0, 0))
    td = ImageDraw.Draw(text)
    td.text((0, 20), "TRISHOOL", fill=NAVY)
    td.text((0, 90), "ENTERPRISES", fill=NAVY)
    banner.paste(text, (430, 150), text)
    banner.convert("RGB").save(OUT / "play-feature-1024x500.png", optimize=True)
    print("play-feature-1024x500.png 1024x500")


if __name__ == "__main__":
    main()

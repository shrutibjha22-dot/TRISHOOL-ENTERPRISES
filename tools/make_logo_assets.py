"""
Turns the supplied TRISHOOL ENTERPRISES artwork into web-ready assets.

The source is a JPEG with an opaque light-grey background. For the website we
want real transparency, so this script:

  1. Estimates the smooth background gradient (the logo is always darker than
     its local background, so a max-filter recovers the background).
  2. Recovers a per-pixel alpha from the background/foreground distance.
  3. Un-premultiplies the colour so anti-aliased edges keep the true navy/green
     instead of fading toward grey - this is what stops a pale halo.
  4. Crops tightly and emits the full lockup, the shield mark on its own, and
     a padded square icon for the favicon.

Run:  python tools\\make_logo_assets.py
"""

import pathlib
from PIL import Image, ImageFilter, ImageChops

SRC = pathlib.Path(
    r"C:\Users\diksh\Downloads\WhatsApp Image 2026-09-26 at 12.21.26 PM.jpeg"
)
OUT = pathlib.Path(__file__).resolve().parent.parent / "assets"

# Darkest channel value found inside the logo. Used as the "pure foreground"
# reference when solving for alpha.
LOGO_FLOOR = 6

# Alpha ramp, expressed as background->foreground distance.
# 0 px of difference = fully transparent, ALPHA_FULL = fully opaque.
ALPHA_START = 18
ALPHA_FULL = 210

# Below this alpha, un-premultiplication is skipped (noise amplification).
UNPREMULT_MIN = 0.12


def smoothstep(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def estimate_background(rgb):
    """
    Recover the light background gradient.

    The logo is always darker than the paper behind it, so the local maximum
    over a wide window is a good estimate of the background. Doing the max
    filter on a 1/16-scale copy keeps this fast and smooth.
    """
    small = rgb.resize(
        (max(1, rgb.width // 16), max(1, rgb.height // 16)), Image.BOX
    )
    small = small.filter(ImageFilter.MaxFilter(9))
    return small.resize(rgb.size, Image.BICUBIC)


def split_bands(alpha, min_gap=6, min_ink=40):
    """Return [start, end) row ranges that contain visible artwork."""
    px = alpha.load()
    w, h = alpha.size

    rows = []
    for y in range(h):
        ink = 0
        for x in range(0, w, 2):  # every other pixel is plenty
            if px[x, y] > 24:
                ink += 1
        rows.append(ink * 2)

    bands = []
    start = None
    gap = 0
    for y, ink in enumerate(rows):
        if ink > min_ink:
            if start is None:
                start = y
            gap = 0
        else:
            if start is not None:
                gap += 1
                if gap >= min_gap:
                    bands.append((start, y - gap + 1))
                    start = None
                    gap = 0
    if start is not None:
        bands.append((start, h))
    return bands


def content_bbox(alpha, threshold=16):
    """Tight bounding box of everything above `threshold`."""
    return alpha.point(lambda v: 255 if v > threshold else 0).getbbox()


def finalize(rgba, max_w=None, colors=128):
    """
    Clean up and shrink a finished RGBA asset.

    Three jobs:

    * Snap near-transparent pixels to fully transparent. Un-premultiplication
      leaves low-level colour noise in those areas, and PNG compresses a solid
      alpha-0 region enormously better than a dithered one.
    * Downscale to roughly 2x the largest size it is displayed at, so the file
      is sharp on retina screens without carrying megabytes of unused pixels.
    * Reduce to a small palette. The artwork is only a handful of flat navy and
      green tones, so a 128-colour RGBA palette is visually identical and cuts
      the file from ~70 KB to ~13 KB.
    """
    # Kill the noise floor.
    floor = 10
    alpha = rgba.getchannel("A").point(lambda v: 0 if v < floor else v)
    rgba = rgba.copy()
    rgba.putalpha(alpha)

    # Zero out RGB where alpha is gone, so the encoder sees flat regions.
    rgb = rgba.convert("RGB")
    mask = alpha.point(lambda v: 0 if v == 0 else 255)
    rgba.paste(rgb, (0, 0), mask)

    if max_w and rgba.width > max_w:
        scale = max_w / rgba.width
        rgba = rgba.resize(
            (max_w, max(1, round(rgba.height * scale))), Image.LANCZOS
        )
        # Re-snap after resampling, which can re-introduce a faint fringe.
        rgba.putalpha(
            rgba.getchannel("A").point(lambda v: 0 if v < floor else v)
        )

    if colors:
        rgba = rgba.quantize(
            colors=colors, method=Image.FASTOCTREE, dither=Image.NONE
        )
    return rgba


def build_artwork():
    """
    Extract the artwork from the source JPEG at full resolution.

    Returns (full_lockup_rgba, mark_rgba) with transparent backgrounds, before
    any downscaling or quantisation. Shared with make_app_icons.py so the app
    icons are cut from the same pixels as the website logo.
    """
    rgb = Image.open(SRC).convert("RGB")
    bg = estimate_background(rgb)

    src_px = rgb.load()
    bg_px = bg.load()
    w, h = rgb.size

    alpha = Image.new("L", (w, h), 0)
    a_px = alpha.load()
    out_rgb = Image.new("RGB", (w, h), (255, 255, 255))
    o_px = out_rgb.load()

    span = float(ALPHA_FULL - ALPHA_START)

    for y in range(h):
        for x in range(w):
            s_r, s_g, s_b = src_px[x, y]
            b_r, b_g, b_b = bg_px[x, y]

            # Background is the lightest of the three channels here.
            b_min = min(b_r, b_g, b_b)
            o_min = min(s_r, s_g, s_b)

            dist = b_min - o_min
            if dist <= ALPHA_START:
                continue

            a = (dist - ALPHA_START) / span
            if a > 1.0:
                a = 1.0
            a_px[x, y] = int(a * 255 + 0.5)

            # Un-premultiply: recover true logo colour from the blend.
            if a > UNPREMULT_MIN:
                wgt = smoothstep((a - UNPREMULT_MIN) / (1 - UNPREMULT_MIN))
                inv = 1.0 - a
                r = (s_r - inv * b_r) / a
                g = (s_g - inv * b_g) / a
                b = (s_b - inv * b_b) / a
                o_px[x, y] = (
                    max(0, min(255, int(r + 0.5))),
                    max(0, min(255, int(g + 0.5))),
                    max(0, min(255, int(b + 0.5))),
                )
            else:
                o_px[x, y] = (s_r, s_g, s_b)

    out = out_rgb.convert("RGBA")
    out.putalpha(alpha)

    # Full lockup: everything, tightly cropped.
    full = out.crop(content_bbox(alpha))

    # Shield only: the first band of artwork.
    bands = split_bands(alpha)
    top = bands[0]
    box = content_bbox(alpha.crop((0, top[0], w, top[1])))
    mark = out.crop((box[0], box[1] + top[0], box[2], box[3] + top[0]))

    return full, mark, bands


def main():
    if not SRC.exists():
        raise SystemExit(
            f"Source artwork not found:\n  {SRC}\n"
            "Edit SRC at the top of this script to point at your logo file."
        )

    OUT.mkdir(parents=True, exist_ok=True)
    full, mark, bands = build_artwork()

    print(f"artwork bands   {bands}")

    full_out = finalize(full, max_w=560)
    full_out.save(OUT / "logo.png", optimize=True)
    print(f"logo.png        {full_out.size[0]}x{full_out.size[1]}")

    mark_out = finalize(mark, max_w=200)
    mark_out.save(OUT / "logo-mark.png", optimize=True)
    print(f"logo-mark.png   {mark_out.size[0]}x{mark_out.size[1]}")

    mark_rgba = mark_out.convert("RGBA")
    side = max(mark_rgba.size) + 24
    icon = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    icon.alpha_composite(
        mark_rgba, ((side - mark_rgba.width) // 2, (side - mark_rgba.height) // 2)
    )
    icon = icon.resize((256, 256), Image.LANCZOS)
    icon = icon.quantize(colors=128, method=Image.FASTOCTREE, dither=Image.NONE)
    icon.save(OUT / "icon.png", optimize=True)
    print("icon.png        256x256")




if __name__ == "__main__":
    main()

"""Import an AI-generated character (e.g. from Dreamina) into a Lichdom sprite sheet.

Pipeline (deterministic, re-runnable from the kept original):
  1. load the background-removed cutout (RGBA); hard-threshold alpha; crop to the subject
  2. resample to the game's texel height (premultiplied area filter + mild unsharp)
  3. re-quantize to a small palette (no dithering) so the result is real pixel art
  4. 1-texel selective outline (same rule as tools/assets/hires.mjs)
  5. derive the standard strip idle(2) walk(4) atk(3) cast(2) from the single pose
     (bob, breathing squash, forward-lean shear); feet stay on the frame bottom
  6. write the sheet + register it in assets/data/manifest_ai.json

Usage:
  python3 tools/assets/import_ai_sprite.py <cutout.png> <key> --H 23 [--colors 28]
      [--override skeleton] [--category units] [--source-dir assets/source/dreamina/<name>]

The sheet keeps the game convention: texel density 2 (TEXEL_RES), manifest H in world px.
Only new files are written; existing generated sheets are never overwritten — an
`overrides` entry in manifest_ai.json maps an existing sprite key onto the new sheet.
"""
import argparse, json, os, sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEXEL_RES = 2  # procedural art; AI art defaults to --res 4 (twice the detail at the same world size)
OUTLINE = np.array([8, 9, 11])


def keep_subject(alpha):
    """Drop stray specks (e.g. the generator's 'AI' badge in a corner): keep the largest blob
    and any other blob whose box lies within 15% of the image size of the subject's box
    (detached flames, arrows, a floating head stay)."""
    from scipy import ndimage
    lab, n = ndimage.label(alpha > 0)
    if n <= 1: return alpha
    sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
    main = int(np.argmax(sizes)) + 1
    objs = ndimage.find_objects(lab)
    my0, my1, mx0, mx1 = objs[main - 1][0].start, objs[main - 1][0].stop, objs[main - 1][1].start, objs[main - 1][1].stop
    pad = 0.15 * max(alpha.shape)
    keep = np.zeros(n + 1, bool); keep[main] = True
    for i, sl in enumerate(objs, 1):
        if i == main or sizes[i - 1] < 40: continue
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        if x1 >= mx0 - pad and x0 <= mx1 + pad and y1 >= my0 - pad and y0 <= my1 + pad: keep[i] = True
    return np.where(keep[lab], alpha, 0)


def load_cutout(path):
    a = np.array(Image.open(path).convert('RGBA')).astype(np.float32)
    a[..., 3] = keep_subject(np.where(a[..., 3] > 128, 255, 0))
    ys, xs = np.where(a[..., 3] > 0)
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def resample(a, th):
    h, w = a.shape[:2]
    tw = max(1, round(w * th / h))
    al = a[..., 3:4] / 255.0
    pre = np.concatenate([a[..., :3] * al, al * 255], -1).clip(0, 255).astype(np.uint8)
    im = Image.fromarray(pre, 'RGBA')
    # two-stage: large box reduction, then Lanczos to the exact size, then a mild unsharp
    mid = im.resize((tw * 4, th * 4), Image.BOX)
    out = mid.resize((tw, th), Image.LANCZOS)
    o = np.array(out).astype(np.float32)
    alpha = o[..., 3:4] / 255.0
    rgb = np.where(alpha > 0.01, o[..., :3] / np.maximum(alpha, 1e-3), 0)
    rgb_im = Image.fromarray(rgb.clip(0, 255).astype(np.uint8), 'RGB').filter(ImageFilter.UnsharpMask(radius=1, percent=60, threshold=2))
    rgb = np.array(rgb_im).astype(np.float32)
    mask = (alpha[..., 0] > 0.5)
    return rgb, mask


def emissive_mask(cut, shape):
    """Bright, saturated magic colours (necro green, fire, holy...) in the full-res cutout,
    mapped onto the small sprite: any texel whose source block holds enough glow keeps it."""
    rgb = cut[..., :3]
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1)
    glow = (sat > 0.45) & (mx > 150) & (cut[..., 3] > 0)
    h, w = shape
    H, W = glow.shape
    out = np.zeros((h, w), bool); col = np.zeros((h, w, 3))
    for y in range(h):
        for x in range(w):
            y0, y1 = y * H // h, max(y * H // h + 1, (y + 1) * H // h)
            x0, x1 = x * W // w, max(x * W // w + 1, (x + 1) * W // w)
            g = glow[y0:y1, x0:x1]
            if g.mean() > 0.18:
                out[y, x] = True
                col[y, x] = rgb[y0:y1, x0:x1][g].mean(0)
    return out, col


def quantize(rgb, mask, colors):
    pts = rgb[mask].astype(np.uint8).reshape(-1, 1, 3)
    pal_im = Image.fromarray(pts, 'RGB').quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.NONE)
    pal = np.array(pal_im.getpalette()[:colors * 3]).reshape(-1, 3)
    flat = rgb.reshape(-1, 3)
    d = ((flat[:, None, :] - pal[None, :, :]) ** 2).sum(-1)
    q = pal[d.argmin(1)].reshape(rgb.shape)
    return q


def sel_outline(rgba):
    h, w = rgba.shape[:2]
    src = rgba.copy()
    op = src[..., 3] > 127
    out = rgba.copy()
    for y in range(h):
        for x in range(w):
            if src[y, x, 3] > 40:
                continue
            nb = [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)]
            nb = [(a, b) for a, b in nb if 0 <= a < w and 0 <= b < h and op[b, a]]
            if not nb:
                continue
            c = np.mean([src[b, a, :3] for a, b in nb], 0)
            below = (y > 0 and op[y - 1, x]) and not (y < h - 1 and op[y + 1, x])
            k = 0.16 * (0.35 if below else 1)
            out[y, x, :3] = OUTLINE * (1 - k) + c * 0.42 * k
            out[y, x, 3] = 255
    return out


def place(frame_w, frame_h, img, dx=0, dy=0, shear=0.0, breathe=0, legs_dx=0, split=0.45, legs=0.3):
    """Paste img with feet on the frame bottom.
    shear: texels of lean at the top (positive = forward/right), fading to 0 at the feet;
    breathe: upper body (above `split` of the height) sinks by this many texels;
    legs_dx: the bottom `legs` fraction shifts sideways (a stride), the rest stays planted."""
    h, w = img.shape[:2]
    canvas = np.zeros((frame_h, frame_w, 4), np.uint8)
    x0 = (frame_w - w) // 2 + dx
    y0 = frame_h - 1 - h + dy  # 1 texel under the feet for the outline
    split_row = int(h * (1 - split))  # rows above this are "upper body"
    legs_row = int(h * (1 - legs))
    # paint lower body first, then upper body so a sinking chest overlaps the waist cleanly
    order = list(range(split_row, h)) + list(range(0, split_row))
    for yy in order:
        t = 1 - yy / max(1, h - 1)
        sx = int(round(shear * t)) + (legs_dx if yy >= legs_row else 0)
        sy = breathe if yy < split_row else 0
        row = img[yy]
        for xx in range(w):
            p = row[xx]
            if p[3] == 0:
                continue
            X, Y = x0 + xx + sx, y0 + yy + sy
            if 0 <= X < frame_w and 0 <= Y < frame_h:
                canvas[Y, X] = p
    return canvas


def build_strip(spr, k=1.0):
    """Derived animation from one pose. k scales offsets with texel density (res/2).
    idle(4): slow breathing — the upper body sinks 1-2 texels and rises again
    walk(4): planted/striding legs alternate with a small body bob and forward lean
    atk(3): wind-up lean back, lunge forward, recover
    cast(2): straighten + breathe"""
    h, w = spr.shape[:2]
    fw, fh = w + int(12 * k), h + int(4 * k)
    b = max(1, round(1 * k))  # one "pixel" of motion at this density
    frames = {
        'idle': [place(fw, fh, spr), place(fw, fh, spr, breathe=b), place(fw, fh, spr, breathe=b), place(fw, fh, spr)],
        'walk': [place(fw, fh, spr, legs_dx=b, shear=0.5 * k), place(fw, fh, spr, dy=-b, shear=1 * k),
                 place(fw, fh, spr, legs_dx=-b, shear=0.5 * k), place(fw, fh, spr, dy=-b, shear=1 * k)],
        'atk': [place(fw, fh, spr, shear=-2.5 * k, dx=-b), place(fw, fh, spr, shear=5 * k, dx=2 * b, legs_dx=b), place(fw, fh, spr, shear=2 * k, dx=b)],
        'cast': [place(fw, fh, spr, dy=-b), place(fw, fh, spr, breathe=b)],
    }
    order = ['idle', 'walk', 'atk', 'cast']
    anims, strip, i = {}, [], 0
    for kk in order:
        anims[kk] = [i, len(frames[kk])]
        strip += frames[kk]
        i += len(frames[kk])
    sheet = np.concatenate(strip, 1)
    return sheet, fw, fh, anims


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cutout'); ap.add_argument('key')
    ap.add_argument('--H', type=float, default=23, help='character height in world px (texels = H*2)')
    ap.add_argument('--colors', type=int, default=32)
    ap.add_argument('--res', type=int, default=4, help='texels per world px (4 = AI detail tier, drawn at 1/4 scale)')
    ap.add_argument('--name', default=None, help='label stored in the manifest')
    ap.add_argument('--category', default='units')
    ap.add_argument('--override', default=None, help='existing sprite key to replace at runtime')
    ap.add_argument('--preview', default=None)
    ap.add_argument('--no-manifest', action='store_true')
    ap.add_argument('--flying', action='store_true')
    a = ap.parse_args()

    a.cutout = os.path.abspath(a.cutout)
    cut = load_cutout(a.cutout)
    th = int(round(a.H * a.res))
    rgb, mask = resample(cut, th)
    q = quantize(rgb, mask, a.colors)
    em, emc = emissive_mask(cut, q.shape[:2])
    em &= mask
    # glow texels: keep the source hue, pushed brighter so it still reads at 1 texel
    q[em] = np.clip(emc[em] * 1.15 + 20, 0, 255)
    rgba = np.zeros(q.shape[:2] + (4,), np.uint8)
    rgba[..., :3] = q.clip(0, 255).astype(np.uint8); rgba[..., 3] = np.where(mask, 255, 0)
    pad = np.zeros((rgba.shape[0] + 2, rgba.shape[1] + 2, 4), np.uint8); pad[1:-1, 1:-1] = rgba
    spr = sel_outline(pad.astype(np.float32)).clip(0, 255).astype(np.uint8)
    sheet, fw, fh, anims = build_strip(spr, a.res / 2)

    if a.preview:
        Image.fromarray(spr, 'RGBA').save(a.preview)
    if a.no_manifest:
        return
    rel = f'sprites/{a.category}/ai/{a.key}.png'
    os.makedirs(os.path.join(ROOT, 'assets', os.path.dirname(rel)), exist_ok=True)
    Image.fromarray(sheet, 'RGBA').save(os.path.join(ROOT, 'assets', rel), optimize=True)
    mpath = os.path.join(ROOT, 'assets/data/manifest_ai.json')
    man = json.load(open(mpath)) if os.path.exists(mpath) else {'version': 1, 'res': TEXEL_RES, 'enabled': True, 'sheets': {}, 'overrides': {}}
    man['sheets'][a.key] = {'file': rel, 'fw': fw, 'fh': fh, 'frames': sheet.shape[1] // fw, 'anims': anims, 'H': a.H, 'res': a.res, 'flying': a.flying, 'category': a.category, 'source': os.path.relpath(a.cutout, ROOT) if a.cutout.startswith(ROOT) else os.path.basename(a.cutout)}
    if a.override:
        man['overrides'][a.override] = a.key
    json.dump(man, open(mpath, 'w'), indent=1)
    print('wrote', rel, 'frame', fw, 'x', fh, 'frames', sheet.shape[1] // fw)


if __name__ == '__main__':
    main()

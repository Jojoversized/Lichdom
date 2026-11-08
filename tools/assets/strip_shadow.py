#!/usr/bin/env python3
"""Remove the painted ground shadow (and stray ground clutter) from a Dreamina 'Remove BG' cutout.

Remove BG keeps the character's cast shadow — a thick, near-black, unsaturated blob — but the game draws
its own shadows. Thin dark outlines must survive, so only *thick* dark regions are removed: the dark mask is
morphologically opened (thin lines vanish), then reconstructed inside the dark mask, and removed. Afterwards
only the largest opaque component (plus nearby pieces such as a lance tip) is kept.

    python3 tools/assets/strip_shadow.py <cutout.png> <out.png> [--dark 52] [--thick 7] [--keep-dist 40]
"""
import argparse

import numpy as np
from PIL import Image
from scipy import ndimage as ndi


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--dark', type=int, default=52, help='max channel value counted as shadow')
    ap.add_argument('--chroma', type=int, default=26, help='max channel spread counted as shadow')
    ap.add_argument('--thick', type=int, default=7, help='opening radius in source px (thinner dark lines survive)')
    ap.add_argument('--ground', type=float, default=0.6, help='shadow regions must be centred below this fraction of the height')
    ap.add_argument('--grow', type=int, default=10, help='px the thick shadow core grows back into dark pixels (0 = unbounded)')
    ap.add_argument('--keep-dist', type=int, default=40, help='keep opaque pieces within this many px of the main body')
    a = ap.parse_args()

    im = np.array(Image.open(a.src).convert('RGBA'))
    rgb = im[..., :3].astype(int); alpha = im[..., 3]
    opaque = alpha > 40
    mx, mn = rgb.max(-1), rgb.min(-1)
    dark = opaque & (mx <= a.dark) & (mx - mn <= a.chroma) | (opaque & (alpha < 200) & (mx <= a.dark + 20))
    st = ndi.generate_binary_structure(2, 1)
    core = ndi.binary_opening(dark, structure=st, iterations=a.thick)
    # grow the thick regions back to their soft edges, but only a few px: an unbounded geodesic
    # reconstruction climbs thin dark lines attached to the shadow (iron staffs, dark wing feathers)
    if a.grow > 0:
        shadow = ndi.binary_dilation(core, structure=st, iterations=a.grow) & dark
    else:  # unbounded geodesic reconstruction (keeps one connected blob; better when dark armour touches the shadow)
        shadow = core.copy()
        for _ in range(60):
            nxt = ndi.binary_dilation(shadow, structure=st, iterations=2) & dark
            if (nxt == shadow).all():
                break
            shadow = nxt
    # a cast shadow lies on the ground: keep only thick dark regions centred in the lower part of the figure
    ys = np.where(opaque.any(1))[0]; top, bot = ys[0], ys[-1]
    lab_s, ns = ndi.label(shadow)
    for i in range(1, ns + 1):
        m = lab_s == i
        cy = np.where(m.any(1))[0].mean() if m.any() else 0
        if cy < top + a.ground * (bot - top):
            shadow &= ~m
    keep = opaque & ~shadow
    keep = ndi.binary_opening(keep, structure=st, iterations=1)
    lab, n = ndi.label(keep)
    if n:
        sizes = ndi.sum(keep, lab, range(1, n + 1))
        main = lab == (int(np.argmax(sizes)) + 1)
        near = ndi.binary_dilation(main, iterations=a.keep_dist)
        ok = np.zeros(n + 1, bool)
        for i in range(1, n + 1):
            if sizes[i - 1] >= 40 and (near & (lab == i)).any():
                ok[i] = True
        keep = ok[lab]
    out = im.copy(); out[..., 3] = np.where(keep, alpha, 0)
    Image.fromarray(out).save(a.dst)
    print(f'{a.src}: removed {int((opaque & ~keep).sum())} px of {int(opaque.sum())} (shadow {int(shadow.sum())})')


if __name__ == '__main__':
    main()

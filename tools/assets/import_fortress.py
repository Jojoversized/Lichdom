#!/usr/bin/env python3
"""Import the Dreamina fortress art (v0.7) and fit it to the game's fortress arc.

    python3 tools/assets/import_fortress.py <original.png> <cutout.png>

* The source is a 9:16 image (1440 x 2560): at the AI detail tier (res 4 texels per world px)
  its height is exactly the map height (640 world px), so no resampling is needed.
* The wall's outer face is measured per texel row from the Remove-BG cutout (rightmost opaque
  texel, heavily smoothed so towers still protrude), and every row is shifted horizontally so
  the wall strip (from SEAM px left of that face, the wall walk's dark inner side, to the right
  edge) lands on the arc  x = OX + sqrt(R^2 - (y - OY)^2)  (world px). The strip is drawn over the
  citadel, which stays rigid (shifting whole rows would shear its spires). The citadel left of
  the wall is kept fully opaque (Remove BG punches holes into dark rooftops); right of it the
  cutout's alpha keeps towers, banners and chains.
* Writes assets/sprites/buildings/ai/fortress.png (+ an `images` entry in manifest_ai.json) and
  src/data/fortress_fit.ts: the walkable wall profile (the painted face per world row), torch and
  portcullis lights, and the arc constants — so map generation stays deterministic and the solid
  cells match the art exactly.
"""
import json, math, sys, os
import numpy as np
from PIL import Image
from scipy import ndimage

RES = 4
WH = 640                      # map height, world px
OX, OY, R = -879, 400, 1104   # wall arc: centred on the gatehouse (y = 400); face 225 px at the gate, ~150 at the top edge
SEAM = 100                    # world px left of the smoothed face: the wall strip that bends (the citadel stays rigid)
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main(orig_path, cut_path):
    orig = np.array(Image.open(orig_path).convert('RGB'))
    alpha = np.array(Image.open(cut_path).convert('RGBA'))[:, :, 3]
    H, W = alpha.shape
    assert H == WH * RES, f'expected {WH * RES} texel rows, got {H}'
    solid = alpha > 128
    # drop specks (the generator's corner badge, stray pixels) before measuring the face
    lab, n = ndimage.label(solid)
    if n > 1:
        sizes = ndimage.sum(solid, lab, range(1, n + 1))
        keep = np.zeros(n + 1, bool); keep[1:] = sizes >= 400
        solid = keep[lab]
    right = np.array([np.max(np.where(r)[0]) if r.any() else -1 for r in solid], float)
    valid = right >= 0
    right[~valid] = np.interp(np.where(~valid)[0], np.where(valid)[0], right[valid])
    # outer face: a running median (±30 world px) then mean (±20) — follows the wall's sweep
    # while towers (≈ 15–25 world px) still stick out past it
    face = ndimage.median_filter(right, size=241, mode='nearest')
    face = ndimage.uniform_filter1d(face, size=161, mode='nearest')
    ys = np.arange(H) / RES
    target = (OX + np.sqrt(np.maximum(0, R * R - (ys - OY) ** 2))) * RES
    shift = np.round(target - face).astype(int)
    shift = np.minimum(shift, 0)  # never pull the wall away from the citadel (would open a gap)
    # output width: rightmost opaque texel after the shift, plus margin
    OW = int(np.ceil(max(right + shift) + 8))
    OW += (-OW) % RES
    rgb = np.zeros((H, OW, 3), np.uint8)
    a = np.zeros((H, OW), np.uint8)
    interior = 40  # texels left of the smoothed face that are always opaque (fills Remove-BG holes)
    for y in range(H):
        sh = -shift[y]
        seam = max(0, int(face[y]) - SEAM * RES)
        # citadel: rigid, fully opaque up to the seam (Remove BG punches holes into its rooftops)
        cut = min(OW, seam - sh)
        rgb[y, :cut] = orig[y, :cut]; a[y, :cut] = 255
        # wall strip: shifted left by sh, drawn over the citadel
        n = min(OW - (seam - sh), W - seam)
        rgb[y, seam - sh:seam - sh + n] = orig[y, seam:seam + n]
        row = solid[y, seam:seam + n].copy()
        row[: max(0, int(face[y]) - interior - seam)] = True
        a[y, seam - sh:seam - sh + n] = row * 255
    img = Image.fromarray(np.dstack([rgb, a]), 'RGBA')
    out_rel = 'sprites/buildings/ai/fortress.png'
    out = os.path.join(ROOT, 'assets', out_rel)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out, optimize=True)

    # walkable profile: the painted face per world row (rightmost opaque texel of the contiguous
    # body, smoothed ±4 px so hanging chains / banner tips don't count)
    A = a > 0
    prof = []
    for wy in range(WH):
        rows = A[wy * RES:(wy + 1) * RES]
        xs = [np.max(np.where(r)[0]) for r in rows if r.any()]
        prof.append(max(xs) / RES if xs else 0)
    prof = ndimage.median_filter(np.array(prof), size=9, mode='nearest')
    prof = [int(round(v)) for v in prof]

    # lights: torch flames (bright orange) and the portcullis (necro green), in world px
    q_arr = np.array(img).astype(int)
    r_, g_, b_ = q_arr[:, :, 0], q_arr[:, :, 1], q_arr[:, :, 2]
    lights = []
    torch = (r_ > 190) & (g_ > 80) & (g_ < 190) & (b_ < 90) & A
    lab, n = ndimage.label(ndimage.binary_dilation(torch, iterations=3))
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        m = lab[sl] == i
        if m.sum() < 40: continue
        cy, cx = ndimage.center_of_mass(m)
        lights.append({'x': round((sl[1].start + cx) / RES), 'y': round((sl[0].start + cy) / RES), 'r': 34, 'color': '#ff9a2e', 'flicker': True})
    green = (g_ > 150) & (r_ < 130) & (b_ < 140) & A
    lab, n = ndimage.label(ndimage.binary_dilation(green, iterations=4))
    gates = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        m = lab[sl] == i
        cnt = int(m.sum())
        if cnt < 300: continue
        cy, cx = ndimage.center_of_mass(m)
        gates.append((cnt, round((sl[1].start + cx) / RES), round((sl[0].start + cy) / RES)))
    gates.sort(reverse=True)
    for cnt, x, y in gates[:6]:
        lights.append({'x': x, 'y': y, 'r': 60 if cnt == gates[0][0] else 28, 'color': '#5dff7a'})
    # merge torches closer than 14 px
    merged = []
    for l in lights:
        if any(m['color'] == l['color'] and math.hypot(m['x'] - l['x'], m['y'] - l['y']) < 14 for m in merged): continue
        merged.append(l)
    portcullis = {'x': gates[0][1], 'y': gates[0][2]} if gates else None

    ts = os.path.join(ROOT, 'src', 'data', 'fortress_fit.ts')
    with open(ts, 'w') as f:
        f.write('// GENERATED by tools/assets/import_fortress.py — do not edit by hand.\n')
        f.write('// Fit of the Dreamina fortress art (art_source/dreamina/fortress_v1) to the wall arc.\n')
        f.write(f'export const FORT_FIT = {{ ox: {OX}, oy: {OY}, r: {R}, width: {OW // RES}, res: {RES} }};\n')
        f.write('/** Painted outer face of the fortress per world row (world px): everything left of it is solid. */\n')
        f.write(f'export const FORT_PROFILE: number[] = {json.dumps(prof, separators=(",", ":"))};\n')
        f.write(f'export const FORT_PORTCULLIS = {json.dumps(portcullis)};\n')
        f.write('export const FORT_FIT_LIGHTS: { x: number; y: number; r: number; color: string; flicker?: boolean }[] = ' + json.dumps(merged) + ';\n')

    man_p = os.path.join(ROOT, 'assets', 'data', 'manifest_ai.json')
    man = json.load(open(man_p))
    man.setdefault('images', {})['fortress'] = {'file': out_rel, 'res': RES, 'w': OW, 'h': H}
    json.dump(man, open(man_p, 'w'), indent=1)
    print(f'wrote {out_rel} {OW}x{H} texels ({OW // RES}x{WH} world px); shift range {shift.min() / RES:.0f}..{shift.max() / RES:.0f} px; '
          f'{len(merged)} lights; portcullis {portcullis}; face at gate {prof[OY]}, top {prof[0]}, bottom {prof[-1]}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])

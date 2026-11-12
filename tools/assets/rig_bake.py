"""Rigged animation baker: gives an imported (single-pose) sprite a skeleton and bakes real limb animation
into a sprite sheet. Nothing is rigged at runtime — the game still just flips frames, so there is no
extra cost in the browser beyond a larger texture.

How it works (deterministic, re-runnable):
  1. take the rest pose = frame 0 of the unit's existing AI sheet, minus its 1-texel outline ring
  2. every opaque texel is given to the nearest bone (distance to the bone's segment, scaled by the bone's
     reach `r`; optional polygons pin awkward pieces such as a shield or a bow)
  3. each bone becomes a rigid layer. A layer that lies under another is continued beneath it where it
     plausibly runs on (between its own texels, plus a thin rim at the joints; nearest-colour fill), so
     nothing tears open when a limb swings away and nothing is smeared into empty space
  4. poses rotate bones about their joints (parent → child), layers are drawn back to front with
     nearest-neighbour sampling (texels are never blended, so the art keeps its palette) and the
     selective outline is re-drawn around the new silhouette
  5. clips are keyframed per archetype (tools/assets/rigs.py) and sampled with eased interpolation:
     idle 6, walk 8, cast 6 frames; attacks are pose-to-pose (anticipation, smear, held hit,
     follow-through, recovery, overshoot) with their own per-frame durations

The rest pose renders back to the original image exactly (checked on every bake).

Usage:
  python3 tools/assets/rig_bake.py <sheet key> [--debug out.png] [--preview out.png] [--no-write]
  python3 tools/assets/rig_bake.py --all
  python3 tools/assets/rig_bake.py --grid <sheet key> out.png      (gridded rest pose for authoring a rig)
Output: assets/sprites/<category>/rig/<key>.png and a `rigged` entry in assets/data/manifest_ai.json
(the original single-pose sheet is kept; remove the entry or set "rig": false to fall back to it).
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from import_ai_sprite import sel_outline, ROOT  # noqa: E402
import rigs  # noqa: E402

MPATH = os.path.join(ROOT, 'assets/data/manifest_ai.json')
FRAMES = {'idle': 6, 'walk': 8, 'atk': 6, 'cast': 6}
ORDER = ['idle', 'walk', 'atk', 'cast']
COLS = 8  # frames per sheet row (keeps textures well under 2048 px wide)


def load_rest(meta):
    sheet = np.array(Image.open(os.path.join(ROOT, 'assets', meta['file'])).convert('RGBA'))
    base = sheet[:meta['fh'], :meta['fw']].copy()
    op = base[..., 3] > 127
    # drop the outline ring (it was added outside the silhouette): opaque texels with a transparent 4-neighbour
    pad = np.pad(op, 1)
    inner = pad[1:-1, :-2] & pad[1:-1, 2:] & pad[:-2, 1:-1] & pad[2:, 1:-1]
    rest = base.copy(); rest[~(op & inner)] = 0
    return base, rest


def seg_dist(X, Y, p, t):
    px, py = p; tx, ty = t
    dx, dy = tx - px, ty - py
    L2 = dx * dx + dy * dy
    if L2 == 0:
        return np.hypot(X - px, Y - py)
    u = np.clip(((X - px) * dx + (Y - py) * dy) / L2, 0, 1)
    return np.hypot(X - (px + u * dx), Y - (py + u * dy))


def assign(rest, bones):
    """Label map: index of the owning bone per opaque texel (-1 = empty)."""
    h, w = rest.shape[:2]
    op = rest[..., 3] > 0
    Y, X = np.mgrid[0:h, 0:w].astype(np.float32)
    names = list(bones)
    D = np.stack([seg_dist(X, Y, bones[n]['p'], bones[n].get('t', bones[n]['p'])) / bones[n].get('r', 1.0) for n in names])
    lab = D.argmin(0)
    # pinned polygons win over distance
    for i, n in enumerate(names):
        for poly in bones[n].get('poly', []):
            m = Image.new('L', (w, h), 0); ImageDraw.Draw(m).polygon([tuple(q) for q in poly], fill=1)
            lab[np.array(m) > 0] = i
    lab[~op] = -1
    # islands that do not touch their own bone are handed to the neighbour they touch most
    for _ in range(2):
        for i, n in enumerate(names):
            comp, k = ndi.label(lab == i)
            if k <= 1:
                continue
            near = seg_dist(X, Y, bones[n]['p'], bones[n].get('t', bones[n]['p']))
            sizes = ndi.sum(lab == i, comp, range(1, k + 1))
            keep = int(np.argmax(sizes)) + 1
            for c in range(1, k + 1):
                if c == keep:
                    continue
                m = comp == c
                if bones[n].get('poly') and near[m].min() < 3:
                    continue
                ring = ndi.binary_dilation(m, iterations=1) & ~m & (lab >= 0)
                if ring.any():
                    vals, cnt = np.unique(lab[ring], return_counts=True)
                    lab[m] = vals[np.argmax(cnt)]
    return lab, names


def build_layers(rest, lab, names, bones):
    """One RGBA layer per bone; lower layers are extended under the higher ones next to them."""
    layers = []
    for i, n in enumerate(names):
        own = lab == i
        lay = np.zeros_like(rest); lay[own] = rest[own]
        if own.any():
            z = bones[n].get('z', 0)
            above = np.zeros_like(own)
            for j, m in enumerate(names):
                if j != i and bones[m].get('z', 0) > z:
                    above |= lab == j
            # what may lie beneath a covering piece: the stretch BETWEEN this piece's own texels (a sword across a
            # leg, an arm across the chest: morphological closing) plus a thin rim for the joints. Never a blind
            # smear outwards: empty space behind a weapon stays empty.
            close, rim = bones[n].get('close', 7), bones[n].get('under', 9 if n == 'torso' else 2)
            if above.any():
                pad = close + 2
                op = np.pad(own, pad)
                st = ndi.generate_binary_structure(2, 1)
                closed = ndi.binary_erosion(ndi.binary_dilation(op, st, iterations=close), st, iterations=close)[pad:-pad, pad:-pad]
                dist, (iy, ix) = ndi.distance_transform_edt(~own, return_indices=True)
                grow = above & (closed | (dist <= rim))
                lay[grow] = rest[iy[grow], ix[grow]]
                lay[grow, 3] = 255
        layers.append(lay)
    return layers


def mat_rot(a, px, py, dx=0.0, dy=0.0, sx=1.0, sy=1.0):
    c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
    T1 = np.array([[1, 0, -px], [0, 1, -py], [0, 0, 1]], float)
    S = np.array([[sx, 0, 0], [0, sy, 0], [0, 0, 1]], float)
    R = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], float)
    T2 = np.array([[1, 0, px + dx], [0, 1, py + dy], [0, 0, 1]], float)
    return T2 @ R @ S @ T1


def norm(v):
    """A pose value: angle, (angle, dx, dy) or (angle, dx, dy, sx, sy)."""
    v = list(v) if isinstance(v, (tuple, list)) else [v]
    return (v + [0, 0])[:3] + [1, 1] if len(v) <= 3 else v[:5]


def pose_mats(bones, names, pose):
    out = {}
    def world(n):
        if n in out:
            return out[n]
        b = bones[n]
        a, dx, dy, sx, sy = norm(pose.get(n, 0))
        M = mat_rot(a, b['p'][0], b['p'][1], dx, dy, sx, sy)
        if b.get('parent'):
            M = world(b['parent']) @ M
        out[n] = M
        return M
    for n in names:
        world(n)
    return out


def render(layers, names, bones, pose, W, H, ox, oy):
    canvas = np.zeros((H, W, 4), np.uint8)
    owner = np.zeros((H, W), np.int16) - 1
    mats = pose_mats(bones, names, pose)
    off = np.array([[1, 0, ox], [0, 1, oy], [0, 0, 1]], float)
    Yc, Xc = np.mgrid[0:H, 0:W]
    for i in sorted(range(len(names)), key=lambda k: bones[names[k]].get('z', 0)):
        lay = layers[i]
        if not lay[..., 3].any():
            continue
        inv = np.linalg.inv(off @ mats[names[i]])
        sx = inv[0, 0] * (Xc + 0.5) + inv[0, 1] * (Yc + 0.5) + inv[0, 2]
        sy = inv[1, 0] * (Xc + 0.5) + inv[1, 1] * (Yc + 0.5) + inv[1, 2]
        ix, iy = np.floor(sx).astype(int), np.floor(sy).astype(int)
        ok = (ix >= 0) & (iy >= 0) & (ix < lay.shape[1]) & (iy < lay.shape[0])
        samp = np.zeros((H, W, 4), np.uint8)
        samp[ok] = lay[iy[ok], ix[ok]]
        m = samp[..., 3] > 0
        canvas[m] = samp[m]; owner[m] = i
    return canvas


def lerp_pose(a, b, u):
    out = {}
    for k in set(a) | set(b):
        va = np.array(norm(a.get(k, 0)), float); vb = np.array(norm(b.get(k, 0)), float)
        v = va + (vb - va) * u
        out[k] = (float(v[0]), float(v[1]), float(v[2]), float(v[3]), float(v[4]))
    return out


def smear_mask(layers, lab, names, bones, spec, W, H, ox, oy):
    """The area a weapon (or claw) sweeps between two poses: the union of its striking end over the swing,
    minus where it ends up. Painted opaque in the piece's two brightest colours (the classic smear frame)."""
    bone = spec['bone']; i = names.index(bone)
    b = bones[bone]
    own = lab == i
    tip = np.array(b.get('t', b['p']), float); piv = np.array(b['p'], float)
    if np.hypot(*(tip - piv)) < 4:      # a pinned weapon without a real bone: its striking end is its farthest texel
        ys, xs = np.nonzero(own); j = np.argmax(np.hypot(xs - piv[0], ys - piv[1])); tip = np.array([xs[j], ys[j]], float)
    R = spec.get('tipR', 0.62) * max(8.0, float(np.hypot(*(tip - piv))))
    Y, X = np.mgrid[0:own.shape[0], 0:own.shape[1]]
    dtip = np.hypot(X - tip[0], Y - tip[1])
    steps = spec.get('steps', 14)
    acc = np.zeros((H, W), bool); last = None
    for k in range(steps + 1):
        # a crescent: only the very tip trails far behind, the full striking end is drawn next to the weapon
        lay = np.zeros(own.shape + (4,), np.uint8); lay[own & (dtip <= R * (0.22 + 0.78 * (k / steps) ** 1.5))] = 255
        one = [np.zeros_like(l) for l in layers]; one[i] = lay
        pose = lerp_pose(spec['from'], spec['to'], k / steps)
        m = render(one, names, bones, pose, W, H, ox, oy)[..., 3] > 0
        m = ndi.binary_dilation(m, iterations=1)
        acc |= m
        last = m
    acc = ndi.binary_closing(acc, iterations=2)
    lead = ndi.binary_dilation(last, iterations=spec.get('lead', 2)) & acc     # the bright leading edge, next to the weapon
    rgb = layers[i][own][:, :3].astype(int)
    lum = rgb.sum(1)
    hi = rgb[lum >= np.percentile(lum, 92)].mean(0); mid = rgb[lum >= np.percentile(lum, 70)].mean(0)
    hi = np.clip(hi * 1.12 + 22, 0, 255); mid = np.clip(mid * 1.0 + 6, 0, 255)
    return acc, lead, hi.astype(np.uint8), mid.astype(np.uint8)


def ease(u):
    return u * u * (3 - 2 * u)


def sample_clip(keys, n, loop):
    """keys: [(t, pose)], t in [0,1]. Returns n poses (a loop does not repeat its first frame)."""
    keys = sorted(keys, key=lambda k: k[0])
    if loop and keys[-1][0] < 1:
        keys = keys + [(1.0, keys[0][1])]
    bones = set().union(*[set(p) for _, p in keys])
    vec = lambda v: np.array(norm(v), float)
    out = []
    for f in range(n):
        t = f / n if loop else f / max(1, n - 1)
        j = max(i for i, k in enumerate(keys) if k[0] <= t + 1e-9)
        j = min(j, len(keys) - 2) if len(keys) > 1 else 0
        if len(keys) == 1:
            out.append(dict(keys[0][1])); continue
        t0, p0 = keys[j]; t1, p1 = keys[j + 1]
        u = ease(min(1, max(0, (t - t0) / max(1e-9, t1 - t0))))
        rest = np.array([0, 0, 0, 1, 1], float)
        pose = {}
        for b in bones:
            a = vec(p0[b]) if b in p0 else rest
            c = vec(p1[b]) if b in p1 else rest
            v = a + (c - a) * u
            pose[b] = (float(v[0]), float(round(v[1])), float(round(v[2])), float(v[3]), float(v[4]))
        out.append(pose)
    return out


def bake(key, man, debug=None, preview=None, write=True, check=None):
    meta = man['sheets'][key]
    rig = rigs.RIGS[key]
    bones = rig['bones']
    base, rest = load_rest(meta)
    lab, names = assign(rest, bones)
    layers = build_layers(rest, lab, names, bones)
    fw, fh = meta['fw'], meta['fh']
    mx, my = rig.get('margin', (14, 10))
    W, H = fw + 2 * mx, fh + my
    # the rest pose must reproduce the source exactly
    r0 = render(layers, names, bones, {}, fw, fh, 0, 0)
    same = np.array_equal(r0[..., 3] > 0, rest[..., 3] > 0) and np.array_equal(r0[r0[..., 3] > 0][:, :3], rest[rest[..., 3] > 0][:, :3])
    clips = rigs.clips_for(rig)
    frames, anims, durs, leads, i = [], {}, {}, {}, 0
    for name in ORDER:
        keys, loop = clips[name]
        if loop == 'frames':
            # pose-to-pose: every entry is one drawn frame {pose, ms, smear?} (attacks: nothing is interpolated away)
            seq = keys; durs[name] = [int(f['ms']) for f in seq]
            leads[name] = sum(int(f['ms']) for f in seq[:next((j for j, f in enumerate(seq) if f.get('hit')), 0)])   # ms until the blow lands
        else:
            seq = [{'pose': p} for p in sample_clip(keys, FRAMES[name], loop)]
        anims[name] = [i, len(seq)]
        for fr in seq:
            f = render(layers, names, bones, fr['pose'], W, H, mx, my)
            sm = fr.get('smear')
            if sm:
                acc, lead, hi, mid = smear_mask(layers, lab, names, bones, sm, W, H, mx, my)
                if sm.get('thin'):
                    acc = ndi.binary_erosion(acc, iterations=sm['thin']) & lead; lead = acc & False
                body = np.zeros((H, W), bool)
                if sm.get('behind', True):   # the body stays readable: the smear never covers it, only the air around it
                    hide = names
                    body = render([l if names[j] in hide else np.zeros_like(l) for j, l in enumerate(layers)], names, bones, fr['pose'], W, H, mx, my)[..., 3] > 0
                acc &= ~body; lead &= ~body
                f[acc] = np.append(mid, 255); f[lead] = np.append(hi, 255)
            frames.append(sel_outline(f.astype(np.float32)).clip(0, 255).astype(np.uint8))
            i += 1
    if debug:
        S = 5
        pal = [(230, 60, 60), (60, 200, 90), (70, 120, 255), (240, 200, 60), (220, 90, 220), (70, 220, 220), (255, 140, 40), (150, 110, 255), (170, 230, 90), (255, 130, 160), (120, 160, 200), (200, 170, 120), (90, 90, 230), (40, 160, 120), (200, 60, 140), (250, 250, 250)]
        im = np.zeros((fh, fw, 3), np.uint8) + 30
        for k in range(len(names)):
            im[lab == k] = (np.array(pal[k % len(pal)]) * 0.55 + rest[lab == k][:, :3] * 0.45).astype(np.uint8)
        big = Image.fromarray(im).resize((fw * S, fh * S), Image.NEAREST); d = ImageDraw.Draw(big)
        for k, n in enumerate(names):
            p = bones[n]['p']; t = bones[n].get('t', p)
            d.line([p[0] * S, p[1] * S, t[0] * S, t[1] * S], fill=(255, 255, 255), width=2)
            d.ellipse([p[0] * S - 4, p[1] * S - 4, p[0] * S + 4, p[1] * S + 4], outline=(0, 0, 0), fill=pal[k % len(pal)])
            d.text((t[0] * S + 4, t[1] * S - 4), n, fill=(255, 255, 255))
        big.save(debug)
    if preview:
        S = int(os.environ.get('RIG_ZOOM', 2))
        only = os.environ.get('RIG_ONLY')
        rows = [np.concatenate(frames[anims[n][0]:anims[n][0] + anims[n][1]] + [np.zeros((H, W, 4), np.uint8)] * (8 - anims[n][1]), 1) for n in ORDER if not only or n in only.split(',')]
        sh = np.concatenate(rows, 0)
        bg = np.zeros(sh.shape[:2] + (3,), np.uint8) + np.array([70, 30, 70], np.uint8)
        a = sh[..., 3:4] / 255.0
        Image.fromarray((sh[..., :3] * a + bg * (1 - a)).astype(np.uint8)).resize((sh.shape[1] * S, sh.shape[0] * S), Image.NEAREST).save(preview)
    if check:
        S = 3
        pick = [frames[anims['atk'][0] + k] for k in range(anims['atk'][1])] if os.environ.get('RIG_ATK') else [frames[anims['walk'][0] + k] for k in (0, 2, 4)] + [frames[anims['atk'][0] + k] for k in (1, 2, 3)] + [frames[anims['cast'][0] + 3], frames[anims['idle'][0] + 3]]
        sh = np.concatenate(pick, 1)
        bg = np.zeros(sh.shape[:2] + (3,), np.uint8) + np.array([70, 30, 70], np.uint8)
        a = sh[..., 3:4] / 255.0
        Image.fromarray((sh[..., :3] * a + bg * (1 - a)).astype(np.uint8)).resize((sh.shape[1] * S, sh.shape[0] * S), Image.NEAREST).save(check)
    if write:
        rows = []
        for r in range(0, len(frames), COLS):
            row = frames[r:r + COLS]
            row += [np.zeros((H, W, 4), np.uint8)] * (COLS - len(row))
            rows.append(np.concatenate(row, 1))
        rel = f"sprites/{meta['category']}/rig/{key}.png"
        os.makedirs(os.path.join(ROOT, 'assets', os.path.dirname(rel)), exist_ok=True)
        Image.fromarray(np.concatenate(rows, 0), 'RGBA').save(os.path.join(ROOT, 'assets', rel), optimize=True)
        man.setdefault('rigged', {})[key] = {'file': rel, 'fw': W, 'fh': H, 'frames': len(frames), 'anims': anims, 'durs': durs, 'lead': leads}
    print(f"{key}: {len(names)} bones, {len(frames)} frames {W}x{H}, rest pose {'exact' if same else 'DIFFERS'}")
    return same


def grid(key, man, out):
    meta = man['sheets'][key]
    base, rest = load_rest(meta)
    S = 6; fw, fh = meta['fw'], meta['fh']
    bg = np.zeros((fh, fw, 3), np.uint8) + np.array([70, 30, 70], np.uint8)
    a = rest[..., 3:4] / 255.0
    im = Image.fromarray((rest[..., :3] * a + bg * (1 - a)).astype(np.uint8)).resize((fw * S, fh * S), Image.NEAREST)
    d = ImageDraw.Draw(im)
    for x in range(0, fw, 10):
        d.line([x * S, 0, x * S, fh * S], fill=(255, 255, 255) if x % 50 == 0 else (150, 150, 150), width=1); d.text((x * S + 2, 1), str(x), fill=(255, 255, 0))
    for y in range(0, fh, 10):
        d.line([0, y * S, fw * S, y * S], fill=(255, 255, 255) if y % 50 == 0 else (150, 150, 150), width=1); d.text((1, y * S + 1), str(y), fill=(255, 255, 0))
    im.save(out)


if __name__ == '__main__':
    man = json.load(open(MPATH))
    args = sys.argv[1:]
    if args and args[0] == '--grid':
        grid(args[1], man, args[2]); sys.exit(0)
    opt = lambda f: args[args.index(f) + 1] if f in args else None
    keys = list(rigs.RIGS) if '--all' in args else [args[0]]
    ok = True
    for k in keys:
        ok &= bake(k, man, debug=opt('--debug'), preview=opt('--preview'), check=opt('--check'), write='--no-write' not in args)
    if '--no-write' not in args:
        json.dump(man, open(MPATH, 'w'), indent=1)
    sys.exit(0 if ok else 1)

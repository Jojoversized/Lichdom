"""Skeletons and animation clips for tools/assets/rig_bake.py.

A rig: bones (name → joint `p`, tip `t`, `parent`, draw order `z`, optional reach `r`, pinned `poly`gons and
`under`-growth) in the texel coordinates of frame 0 of the unit's sheet (`rig_bake.py --grid` prints a ruler),
plus the clip archetype and its amplitudes. Sprites face right. Angles are degrees, clockwise on screen:
a hanging limb swings FORWARD (to the right) with a NEGATIVE angle; an upright body leans forward with a
POSITIVE one. A pose value is `angle` or `(angle, dx, dy)` (texels, in the parent's frame).
Clips are (keyframes, loops): idle and walk loop, atk plays once, cast loops.
Keep motions small: these are rigid pixel-art pieces, and anything past ~35° starts to look like paper dolls.
"""

RIGS = {}


def merge(*ds):
    out = {}
    for d in ds:
        out.update(d or {})
    return out


def _n(v):
    if not isinstance(v, (tuple, list)):
        return (float(v), 0.0, 0.0, 1.0, 1.0)
    v = tuple(float(x) for x in v)
    return v + (0.0, 0.0, 1.0, 1.0)[len(v) - 1:] if len(v) < 5 else v


def lerp(a, b, u):
    """Blend two poses (missing bones are at rest); u may overshoot past 1."""
    out = {}
    for k in set(a) | set(b):
        va, vb = _n(a.get(k, 0)), _n(b.get(k, 0))
        out[k] = tuple(x + (y - x) * u for x, y in zip(va, vb))
    return out


def swing(W, S, ms=(50, 110, 40, 110, 60, 80, 60), smear=None, over=1.1, F=None, A=None, R=None):
    """A blow, pose to pose (xprite handbook, 'attacks and impacts'): anticipation the opposite way and HELD →
    one fast smear frame → the hit at full extension, overshot and HELD → settle → a slower recovery.
    W = wind-up pose, S = strike pose; F / A / R override the settle, first anticipation and recovery frames
    (secondary parts that lag). `ms` are the seven frame durations; the hit lands at ms[0] + ms[1] + ms[2].
    The slow-in / fast-out shape comes from the durations, never from evenly spaced in-betweens."""
    pre = lerp(W, S, 0.8)
    fr = [
        dict(pose=merge(lerp({}, W, 0.6), A), ms=ms[0]),
        dict(pose=W, ms=ms[1]),
        dict(pose=pre, ms=ms[2]),
        dict(pose=lerp(W, S, over), ms=ms[3], hit=True),
        dict(pose=merge(S, F), ms=ms[4]),
        dict(pose=merge(lerp(S, {}, 0.6), R), ms=ms[5]),
        dict(pose=lerp(S, {}, 0.92), ms=ms[6]),
    ]
    if smear:
        fr[2]['smear'] = merge({'from': lerp(W, S, 0.12), 'to': pre}, smear)
    return (fr, 'frames')


def biped(rig):
    """Walker on two legs with a weapon arm (`arm`), an off arm (`off`) and optional shield / cape / weapon bones."""
    g = lambda k, d: rig.get(k, d)
    s = g('stride', 1.0)       # leg swing scale
    arm, off = g('arm', 'armF'), g('off', 'armB')
    wind, strike = g('wind', 30), g('strike', -40)   # weapon arm: wind-up and blow
    wpn = g('wpn', (0, 0))     # extra weapon rotation at wind-up / strike
    lean = g('lean', 1.0)
    fore, forew = arm.replace('arm', 'fore'), g('fore', (12, -22))   # the weapon arm's forearm bends with it
    foreo = off.replace('arm', 'fore')
    idle = [
        (0.0, {}),
        (0.5, merge({'torso': (0.8 * lean, 0, 1), 'head': (-0.8, 0, 0), arm: 2.5, off: -2, 'shield': (0, 0, 1), 'cape': 2.5, 'weapon': 1.5, 'robe': 1.2, 'tail': 3}, g('idle_add', {}))),
    ]
    sw = g('armswing', 9)
    fl = g('float', 0)         # hovering units: bob instead of stepping
    walk = [
        (0.00, {'legL': -16 * s, 'shinL': 6 * s, 'legR': 14 * s, 'shinR': 10 * s, 'torso': 2 * lean, arm: sw, fore: -4, off: -sw, foreo: -8, 'cape': 5, 'shield': (2, 0, 0), 'robe': 4, 'tail': 6}),
        (0.25, {'hips': (0, 0, -1 - fl), 'legL': -2 * s, 'shinL': 2, 'legR': -4 * s, 'shinR': 22 * s, 'torso': 3 * lean, 'cape': 8, 'robe': 0, 'tail': 10}),
        (0.50, {'legL': 14 * s, 'shinL': 10 * s, 'legR': -16 * s, 'shinR': 6 * s, 'torso': 2 * lean, arm: -sw * 0.6, fore: -8, off: sw, foreo: -4, 'cape': 5, 'shield': (-2, 0, 0), 'robe': -4, 'tail': 6}),
        (0.75, {'hips': (0, 0, -1 - fl), 'legL': -4 * s, 'shinL': 22 * s, 'legR': -2 * s, 'shinR': 2, 'torso': 3 * lean, 'cape': 8, 'robe': 0, 'tail': 2}),
    ]
    atk = [
        (0.00, {}),
        (0.28, merge({'hips': (0, -1, 0), 'torso': -6 * lean, 'head': 2, arm: wind, fore: forew[0], 'weapon': wpn[0], off: -6, 'legL': 4, 'shield': (-3, 0, 0), 'cape': -4, 'robe': -3, 'tail': -6}, g('wind_add', {}))),
        (0.50, merge({'hips': (0, 3, 1), 'torso': 9 * lean, 'head': -3, arm: strike, fore: forew[1], 'weapon': wpn[1], off: 8, 'legL': -10 * s, 'shinL': 6, 'legR': 8 * s, 'shield': (4, 0, 0), 'cape': 10, 'robe': 5, 'tail': 10}, g('strike_add', {}))),
        (0.72, merge({'hips': (0, 2, 1), 'torso': 6 * lean, arm: strike * 0.7, fore: forew[1] * 0.6, 'weapon': wpn[1] * 0.7, 'legL': -6 * s, 'legR': 5 * s, 'cape': 6, 'robe': 3}, g('follow_add', {}))),
        (1.00, {}),
    ]
    cast = [
        (0.0, {}),
        (0.5, merge({'torso': (-3 * lean, 0, -1), 'head': -4, arm: g('cast_arm', -14), off: g('cast_off', -22), 'cape': -4, 'shield': (-2, 0, -1), 'robe': -2, 'tail': -5}, g('cast_add', {}))),
    ]
    return {'idle': (idle, True), 'walk': (walk, True), 'atk': (atk, False), 'cast': (cast, True)}


ARCH = {'biped': biped}


def clips_for(rig):
    clips = ARCH[rig.get('arch', 'biped')](rig)
    clips.update(rig.get('clips', {}))
    if 'swing' in rig:
        clips['atk'] = swing(**rig['swing'])
    return clips


# ------------------------------------------------------------------ the allied host
RIGS['ai_skeleton_warrior'] = dict(
    arch='biped', arm='armF', off='shield', wind=12, strike=-28, wpn=(-42, 16), margin=(20, 30),
    # an overhead chop: the blade goes up behind the helm, then comes down on the foe with the whole body behind it
    swing=dict(
        W={'hips': (0, -3, 0), 'torso': -8, 'head': 4, 'armF': -183, 'weapon': 41, 'shield': (-4, 2, -1), 'legL': 5, 'legR': -3},
        S={'hips': (0, 6, 1), 'torso': 12, 'head': -4, 'armF': -75, 'weapon': 33, 'shield': (5, -11, 3), 'legL': 12, 'shinL': 3, 'legR': -12, 'shinR': 10},
        smear=dict(bone='weapon', tipR=0.5)),
    bones={
        'hips':   dict(p=(47, 63), t=(47, 69), z=5),
        'torso':  dict(parent='hips', p=(47, 62), t=(46, 38), z=6, r=1.5),
        'head':   dict(parent='torso', p=(49, 33), t=(49, 14), z=8, r=1.4),
        'legL':   dict(parent='hips', p=(40, 68), t=(37, 83), z=2),
        'shinL':  dict(parent='legL', p=(37, 83), t=(35, 101), z=1),
        'legR':   dict(parent='hips', p=(55, 68), t=(58, 81), z=3),
        'shinR':  dict(parent='legR', p=(58, 81), t=(62, 96), z=2, under=9),
        'armF':   dict(parent='torso', p=(30, 42), t=(25, 63), z=9, r=0.9),
        'weapon': dict(parent='armF', p=(25, 64), t=(60, 93), z=10, r=0.01,
                       poly=[[(11, 51), (19, 51), (31, 61), (27, 68), (20, 62)], [(27, 60), (33, 60), (69, 93), (69, 99), (60, 98), (25, 67)]]),
        'shield': dict(parent='torso', p=(62, 44), t=(72, 50), z=11, r=0.01,
                       poly=[[(63, 34), (70, 26), (79, 26), (84, 36), (84, 60), (79, 73), (69, 74), (62, 62), (61, 44)]]),
    })

RIGS['ai_zombie_rotting'] = dict(
    arch='biped', arm='armF', off='armB', wind=18, strike=-42, fore=(14, -26), stride=0.85, armswing=7,
    idle_add={'head': (2, 0, 0), 'armF': 4, 'foreF': 3},
    # a lurching double-armed maul
    swing=dict(W={'hips': (0, -3, 0), 'torso': -10, 'head': 5, 'armF': 40, 'foreF': 20, 'armB': -70, 'legL': 4},
               S={'hips': (0, 7, 1), 'torso': 16, 'head': -8, 'armF': -62, 'foreF': -38, 'armB': -55, 'legL': 12, 'legR': -10, 'shinR': 8},
               ms=(70, 150, 50, 130, 70, 100, 70), smear={'bone': 'foreF', 'tipR': 0.7}),
    bones={
        'hips':  dict(p=(42, 57), t=(42, 65), z=5, r=1.6),
        'torso': dict(parent='hips', p=(42, 53), t=(46, 27), z=6, r=1.6),
        'head':  dict(parent='torso', p=(54, 23), t=(58, 10), z=8, r=1.3),
        'armF':  dict(parent='torso', p=(33, 26), t=(19, 40), z=9),
        'foreF': dict(parent='armF', p=(19, 40), t=(18, 63), z=10, r=1.2),
        'armB':  dict(parent='torso', p=(53, 40), t=(65, 60), z=4, r=0.9),
        'legL':  dict(parent='hips', p=(35, 67), t=(30, 80), z=2),
        'shinL': dict(parent='legL', p=(30, 80), t=(22, 93), z=1),
        'legR':  dict(parent='hips', p=(50, 68), t=(52, 82), z=3),
        'shinR': dict(parent='legR', p=(52, 82), t=(52, 97), z=2),
    })

RIGS['ai_skeleton_cleric'] = dict(
    arch='biped', arm='weapon', off='armF', wind=-7, strike=12, stride=0, armswing=3, cast_arm=-10, cast_off=-16, lean=0.7,
    # the staff is drawn back, then thrust at the foe as the bolt leaves it
    swing=dict(W={'torso': -6, 'head': 3, 'weapon': (-14, -3, -2), 'armF': 6},
               S={'hips': (0, 3, 0), 'torso': 8, 'head': -4, 'weapon': (16, 6, -2), 'armF': -10},
               ms=(60, 130, 40, 120, 60, 90, 60)),
    bones={
        'hips':   dict(p=(45, 74), t=(45, 106), z=4, r=1.7),
        'torso':  dict(parent='hips', p=(45, 72), t=(45, 46), z=6, r=1.5),
        'head':   dict(parent='torso', p=(45, 44), t=(45, 20), z=8, r=1.7),
        'armF':   dict(parent='torso', p=(27, 54), t=(27, 78), z=7),
        'weapon': dict(parent='torso', p=(66, 58), t=(66, 59), z=10, r=0.01,
                       poly=[[(58, 5), (84, 5), (85, 28), (77, 35), (72, 52), (72, 62), (69, 109), (60, 109), (61, 62), (59, 56), (64, 34), (59, 27)]]),
    })

RIGS['ai_haunted_armor'] = dict(
    arch='biped', arm='armF', off='armB', wind=20, strike=-36, fore=(12, -22), stride=0.8, armswing=7, margin=(40, 10),
    # a hip-driven straight: the trunk turns away from the camera (it narrows, the striking shoulder goes back and the
    # fist is cocked at the chest), then unwinds into a fully extended arm
    swing=dict(W={'hips': (0, -5, 0), 'torso': (-9, -2, 0, 0.9, 1), 'head': (4, 1, 0, 1.1, 1), 'armB': (58, -7, -2), 'foreB': -96, 'armF': (-20, 5, 0), 'foreF': -10, 'legL': 4, 'legR': -3},
               S={'hips': (0, 9, 1), 'torso': (13, 2, 0, 1.05, 1), 'head': -5, 'armB': (-86, 5, -1), 'foreB': 6, 'armF': (30, -4, 0), 'foreF': 14, 'legL': 12, 'legR': -12, 'shinR': 10},
               ms=(60, 140, 40, 130, 70, 100, 70), smear={'bone': 'foreB', 'tipR': 0.8}),
    bones={
        'hips':  dict(p=(53, 74), t=(53, 82), z=5, r=1.4),
        'torso': dict(parent='hips', p=(53, 72), t=(53, 46), z=6, r=2.0),
        'head':  dict(parent='torso', p=(53, 37), t=(53, 14), z=8, r=1.5),
        'armF':  dict(parent='torso', p=(30, 44), t=(22, 66), z=9, r=1.3),
        'foreF': dict(parent='armF', p=(22, 66), t=(24, 85), z=10, r=1.2),
        'armB':  dict(parent='torso', p=(72, 46), t=(75, 64), z=3),
        'foreB': dict(parent='armB', p=(75, 64), t=(79, 79), z=3, r=1.1),
        'legL':  dict(parent='hips', p=(40, 84), t=(38, 98), z=3, r=1.2),
        'shinL': dict(parent='legL', p=(38, 98), t=(40, 113), z=2, r=1.2),
        'legR':  dict(parent='hips', p=(60, 86), t=(60, 98), z=3, r=1.2),
        'shinR': dict(parent='legR', p=(60, 98), t=(60, 109), z=2, r=1.2),
    })

RIGS['wendigo'] = dict(
    arch='biped', arm='armB', off='armF', wind=14, strike=-30, stride=0.7, armswing=8, lean=0.6,
    strike_add={'head': -6, 'foreF': -8}, wind_add={'head': 4}, margin=(20, 26),
    # rears up and rakes down with the long arm
    swing=dict(W={'hips': (0, -3, -2), 'torso': -10, 'head': -8, 'armB': -85, 'armF': 8},
               S={'hips': (0, 9, 1), 'torso': 12, 'head': 10, 'armB': 8, 'armF': -10, 'foreF': -8},
               ms=(40, 90, 40, 100, 50, 70, 50), smear={'bone': 'armB', 'tipR': 0.55}),
    bones={
        'hips':  dict(p=(42, 40), t=(40, 47), z=5, r=1.2),
        'torso': dict(parent='hips', p=(42, 38), t=(70, 22), z=6, r=1.4),
        'head':  dict(parent='torso', p=(82, 25), t=(94, 24), z=9, r=1.4),
        'armF':  dict(parent='torso', p=(68, 27), t=(53, 48), z=7),
        'foreF': dict(parent='armF', p=(53, 48), t=(80, 73), z=8, r=1.3),
        'armB':  dict(parent='torso', p=(80, 38), t=(103, 55), z=3, r=1.2),
        'legL':  dict(parent='hips', p=(40, 45), t=(38, 66), z=4),
        'shinL': dict(parent='legL', p=(38, 66), t=(18, 78), z=3, r=1.3),
    })

RIGS['ai_skeleton_archer'] = dict(
    arch='biped', arm='armF', off='armB', stride=0.9, armswing=0, lean=0.7,
    clips={'atk': ([
        (0.00, {}),
        (0.35, {'torso': -3, 'head': -1, 'armF': (0, -3, 0), 'weapon': -2}),      # draw
        (0.50, {'torso': 2, 'armF': (-4, 3, 0), 'weapon': 5, 'hips': (0, 1, 0)}),   # loose
        (0.75, {'torso': 1, 'weapon': -2, 'armF': (-2, 1, 0)}),
        (1.00, {}),
    ], False)},
    # draw, hold, loose: the string hand snaps forward and the bow kicks
    swing=dict(W={'hips': (0, -2, 0), 'torso': -4, 'head': -2, 'armF': (0, -7, 0), 'weapon': (-3, -1, 0), 'armB': (0, -1, 0)},
               S={'hips': (0, 2, 0), 'torso': 3, 'head': 1, 'armF': (-6, 4, 1), 'weapon': (6, 2, 0)},
               ms=(60, 140, 30, 90, 60, 80, 60)),
    bones={
        'hips':   dict(p=(43, 63), t=(43, 74), z=5, r=1.6),
        'torso':  dict(parent='hips', p=(43, 61), t=(42, 37), z=6, r=1.6, poly=[[(11, 17), (29, 15), (31, 37), (17, 41)]]),
        'head':   dict(parent='torso', p=(43, 35), t=(43, 18), z=8, r=1.5),
        'armF':   dict(parent='torso', p=(24, 46), t=(48, 44), z=9, r=0.8),
        'armB':   dict(parent='torso', p=(56, 40), t=(76, 38), z=7, r=0.8),
        'weapon': dict(parent='armB', p=(74, 38), t=(74, 39), z=10, r=0.01,
                       poly=[[(60, 5), (68, 7), (79, 22), (80, 54), (69, 71), (60, 71), (62, 64), (72, 50), (73, 26), (63, 13)]]),
        'legL':   dict(parent='hips', p=(38, 72), t=(34, 85), z=3),
        'shinL':  dict(parent='legL', p=(34, 85), t=(30, 101), z=2),
        'legR':   dict(parent='hips', p=(48, 73), t=(47, 86), z=3),
        'shinR':  dict(parent='legR', p=(47, 86), t=(46, 97), z=2),
    })

RIGS['ai_skeleton_pikeman'] = dict(
    arch='biped', arm='weapon', off='armB', wind=0, strike=0, stride=0.9, armswing=0,
    cast_arm=0, cast_add={'weapon': (-3, 0, -1)},
    wind_add={'weapon': (2, -7, 2), 'armF': 6, 'foreF': 4, 'armB': 8},
    strike_add={'weapon': (-2, 12, -4), 'armF': -10, 'foreF': -8, 'armB': -12, 'hips': (0, 4, 1)},
    follow_add={'weapon': (-1, 6, -2), 'armF': -6, 'armB': -8}, margin=(34, 10),
    # a full-body thrust
    swing=dict(W={'hips': (0, -4, 0), 'torso': -8, 'weapon': (3, -14, 3), 'armF': 10, 'foreF': 6, 'armB': 14, 'legL': 4},
               S={'hips': (0, 8, 1), 'torso': 12, 'head': -3, 'weapon': (-2, 18, -5), 'armF': -16, 'foreF': -10, 'armB': -18, 'legL': 12, 'legR': -12, 'shinR': 10},
               ms=(60, 130, 40, 120, 60, 90, 60), over=1.15),
    bones={
        'hips':   dict(p=(62, 57), t=(62, 70), z=5, r=1.8),
        'torso':  dict(parent='hips', p=(62, 55), t=(62, 35), z=6, r=1.5),
        'head':   dict(parent='torso', p=(64, 31), t=(64, 12), z=8, r=1.5),
        'armF':   dict(parent='torso', p=(48, 35), t=(40, 50), z=9),
        'foreF':  dict(parent='armF', p=(40, 50), t=(49, 62), z=10),
        'armB':   dict(parent='torso', p=(73, 34), t=(88, 50), z=7, r=0.9),
        'weapon': dict(parent='torso', p=(68, 56), t=(68, 57), z=11, r=0.01,
                       poly=[[(12, 71), (18, 69), (140, 30), (157, 26), (159, 30), (142, 36), (20, 78), (13, 79)]]),
        'legL':   dict(parent='hips', p=(52, 69), t=(49, 84), z=3),
        'shinL':  dict(parent='legL', p=(49, 84), t=(45, 101), z=2),
        'legR':   dict(parent='hips', p=(72, 67), t=(80, 77), z=3),
        'shinR':  dict(parent='legR', p=(80, 77), t=(79, 93), z=2),
    })

RIGS['ai_bone_mage'] = dict(
    arch='biped', arm='armB', off='weapon', wind=9, strike=-13, stride=0, armswing=2, lean=0.7, cast_arm=-16, cast_off=-3,
    idle_add={'flame': (0, 0, -2), 'weapon': -1.5}, wind_add={'flame': (0, -1, 1)}, strike_add={'flame': (0, 3, -3)}, cast_add={'flame': (0, 0, -4)}, margin=(22, 14),
    # the flame hand is pulled in, then thrown at the foe
    swing=dict(W={'torso': -6, 'head': 3, 'armB': (0, -6, 0), 'flame': (0, -4, -3, 0.8, 0.8), 'weapon': -4},
               S={'hips': (0, 3, 0), 'torso': 8, 'head': -4, 'armB': (-8, 8, -2), 'flame': (0, 10, -4, 1.35, 1.35), 'weapon': 5},
               ms=(60, 130, 40, 120, 60, 90, 60)),
    bones={
        'hips':   dict(p=(55, 74), t=(55, 106), z=4, r=1.8),
        'torso':  dict(parent='hips', p=(55, 72), t=(55, 47), z=6, r=1.6),
        'head':   dict(parent='torso', p=(58, 43), t=(58, 20), z=8, r=1.6),
        'armF':   dict(parent='torso', p=(40, 45), t=(31, 57), z=7, r=0.8),
        'armB':   dict(parent='torso', p=(70, 46), t=(95, 44), z=9),
        'flame':  dict(parent='armB', p=(93, 36), t=(93, 37), z=10, r=0.01, poly=[[(86, 13), (103, 13), (103, 37), (86, 37)]]),
        'weapon': dict(parent='torso', p=(26, 60), t=(26, 61), z=10, r=0.01,
                       poly=[[(12, 5), (37, 5), (37, 34), (31, 37), (31, 55), (35, 57), (35, 67), (31, 69), (31, 111), (19, 111), (19, 67), (17, 57), (21, 35), (12, 31)]]),
    })

RIGS['ai_wraith'] = dict(
    arch='biped', arm='armB', off='armF', wind=-12, strike=12, fore=(-10, 16), stride=0, armswing=4, float=2, lean=0.8,
    strike_add={'hips': (0, 5, 1)}, margin=(22, 22),
    # a raking claw
    swing=dict(W={'hips': (0, -5, -1), 'torso': -10, 'head': 4, 'armB': -40, 'foreB': -20, 'armF': 10, 'robe': -6},
               S={'hips': (0, 9, 2), 'torso': 14, 'head': -4, 'armB': 30, 'foreB': 15, 'armF': -15, 'foreF': -10, 'robe': 10},
               ms=(40, 90, 40, 100, 50, 70, 50), smear={'bone': 'foreB', 'tipR': 0.9}),
    bones={
        'hips':  dict(p=(50, 50), t=(50, 58), z=5, r=1.2),
        'robe':  dict(parent='hips', p=(48, 60), t=(34, 98), z=4, r=2.2),
        'torso': dict(parent='hips', p=(50, 50), t=(48, 35), z=6, r=1.8),
        'head':  dict(parent='torso', p=(50, 31), t=(50, 12), z=8, r=1.6),
        'armB':  dict(parent='torso', p=(68, 34), t=(92, 28), z=9),
        'foreB': dict(parent='armB', p=(92, 28), t=(108, 28), z=10, r=1.2),
        'armF':  dict(parent='torso', p=(26, 42), t=(18, 66), z=9),
        'foreF': dict(parent='armF', p=(18, 66), t=(22, 82), z=10, r=1.1),
    })

RIGS['ai_banshee'] = dict(
    arch='biped', arm='armB', off='armF', wind=8, strike=-16, stride=0, armswing=5, float=2, lean=0.8,
    wind_add={'head': -8, 'armF': -6}, strike_add={'head': 7, 'armF': 14, 'hips': (0, 2, 0)},
    # draws breath, then screams with the arms thrown wide
    swing=dict(W={'hips': (0, -3, -1), 'torso': -10, 'head': -12, 'armB': 10, 'armF': -8, 'cape': -8},
               S={'hips': (0, 4, 1), 'torso': 12, 'head': 14, 'armB': -18, 'armF': 20, 'cape': 14, 'robe': 8},
               ms=(60, 150, 40, 180, 70, 90, 60)),
    bones={
        'hips':  dict(p=(52, 50), t=(52, 58), z=5, r=1.3),
        'robe':  dict(parent='hips', p=(50, 60), t=(34, 96), z=4, r=2.2),
        'torso': dict(parent='hips', p=(52, 50), t=(52, 33), z=6, r=1.6),
        'head':  dict(parent='torso', p=(54, 27), t=(54, 10), z=8, r=1.4),
        'cape':  dict(parent='head', p=(44, 20), t=(28, 25), z=7),
        'armB':  dict(parent='torso', p=(66, 34), t=(85, 28), z=9, r=1.1),
        'armF':  dict(parent='torso', p=(34, 46), t=(16, 52), z=9, r=1.1),
    })

RIGS['ai_vampire_lord'] = dict(
    arch='biped', arm='armB', off='armF', wind=-20, strike=14, wpn=(-26, 22), stride=0, armswing=5, float=1, lean=0.6, margin=(28, 40),
    # a descending slash: it rises out of the crouch with the blade over its shoulder and cuts down across the foe
    swing=dict(W={'hips': (0, -4, -4), 'torso': -8, 'head': 3, 'armB': -120, 'weapon': -22, 'cape': -10, 'armF': 10},
               S={'hips': (0, 8, 2), 'torso': 12, 'head': -4, 'armB': -50, 'weapon': 14, 'cape': 16, 'armF': -12, 'foreF': -10},
               ms=(40, 90, 40, 100, 50, 70, 50), smear={'bone': 'weapon', 'tipR': 0.5}),
    bones={
        'hips':   dict(p=(62, 62), t=(60, 86), z=5, r=2.4),
        'torso':  dict(parent='hips', p=(62, 58), t=(64, 32), z=6, r=1.7),
        'head':   dict(parent='torso', p=(76, 29), t=(80, 10), z=8, r=1.3),
        'cape':   dict(parent='torso', p=(40, 40), t=(20, 70), z=2, r=1.5),
        'armF':   dict(parent='torso', p=(46, 38), t=(44, 58), z=9, r=1.2),
        'foreF':  dict(parent='armF', p=(44, 58), t=(52, 91), z=10, r=1.2),
        'armB':   dict(parent='torso', p=(88, 40), t=(100, 62), z=7),
        'weapon': dict(parent='armB', p=(100, 64), t=(100, 65), z=11, r=0.01,
                       poly=[[(92, 59), (104, 56), (141, 88), (141, 96), (132, 95), (96, 69)]]),
    })


def flyer(rig):
    """Winged beast: the wings beat (a turn at the shoulder plus a squash, which reads as a real flap), the tail
    trails, the neck strikes. Used airborne for idle, walk and cast alike."""
    flap = [
        (0.0, {'wingL': (9, 0, 0, 1, 1), 'wingR': (-8, 0, 0, 1, 1), 'tail': 4, 'hips': (0, 0, 1), 'head': 2}),
        (0.5, {'wingL': (-13, 0, 0, 1, 0.84), 'wingR': (11, 0, 0, 1, 0.84), 'tail': -5, 'hips': (0, 0, -2), 'legL': 6, 'legR': 4, 'head': -3}),
    ]
    atk = [
        (0.00, {}),
        (0.30, {'hips': (-4, -3, -1), 'head': -10, 'wingL': (-12, 0, 0, 1, 0.9), 'wingR': 10, 'tail': 8}),
        (0.50, {'hips': (5, 5, 2), 'head': (12, 3, 2), 'wingL': 10, 'wingR': -8, 'tail': -8, 'legL': -10, 'legR': -10}),
        (0.75, {'hips': (2, 3, 1), 'head': 6}),
        (1.00, {}),
    ]
    return {'idle': (flap, True), 'walk': (flap, True), 'atk': (atk, False), 'cast': (flap, True)}


ARCH['flyer'] = flyer

RIGS['ai_bone_wyvern'] = dict(
    arch='flyer', margin=(22, 18),
    # the neck coils back, then whips forward as it spits
    swing=dict(W={'hips': (-6, -5, -2), 'head': -22, 'wingL': (-16, 0, 0, 1, 0.85), 'wingR': 12, 'tail': 10},
               S={'hips': (6, 6, 2), 'head': (20, 5, 3), 'wingL': 14, 'wingR': -12, 'tail': -12, 'legL': -12, 'legR': -12},
               ms=(60, 130, 40, 120, 60, 90, 60)),
    bones={
        'hips':  dict(p=(90, 62), t=(100, 64), z=5, r=1.6),
        'head':  dict(parent='hips', p=(104, 58), t=(132, 46), z=8, r=1.2),
        'tail':  dict(parent='hips', p=(82, 68), t=(20, 98), z=4),
        'wingL': dict(parent='hips', p=(90, 52), t=(50, 20), z=3, r=2.5),
        'wingR': dict(parent='hips', p=(112, 70), t=(140, 100), z=9, r=2.5),
        'legL':  dict(parent='hips', p=(74, 74), t=(64, 92), z=6),
        'legR':  dict(parent='hips', p=(84, 76), t=(74, 94), z=6),
    })

RIGS['ai_flesh_abomination'] = dict(
    arch='biped', arm='armB', off='armF', wind=-18, strike=16, wpn=(-20, 18), stride=0.7, armswing=6, lean=0.7, margin=(22, 36),
    # the cleaver goes up over the shoulder and comes down like a guillotine
    swing=dict(W={'hips': (0, -3, 0), 'torso': -6, 'head': 3, 'armB': -90, 'weapon': -19, 'armF': 12, 'foreF': 8},
               S={'hips': (0, 6, 2), 'torso': 12, 'head': -4, 'armB': -32, 'weapon': 32, 'armF': -14, 'foreF': -10, 'legL': 8, 'legR': -8, 'shinR': 8},
               ms=(80, 190, 50, 150, 80, 120, 80), smear={'bone': 'weapon', 'tipR': 0.6}),
    bones={
        'hips':   dict(p=(80, 80), t=(80, 98), z=5, r=1.8),
        'torso':  dict(parent='hips', p=(80, 76), t=(76, 40), z=6, r=3.0),
        'head':   dict(parent='torso', p=(88, 37), t=(88, 14), z=8, r=1.3),
        'armF':   dict(parent='torso', p=(40, 50), t=(28, 74), z=9, r=1.6),
        'foreF':  dict(parent='armF', p=(28, 74), t=(30, 106), z=10, r=1.3),
        'armB':   dict(parent='torso', p=(108, 56), t=(118, 78), z=7, r=1.3),
        'weapon': dict(parent='armB', p=(118, 78), t=(118, 79), z=11, r=0.01,
                       poly=[[(102, 70), (124, 73), (157, 84), (153, 113), (118, 97), (106, 84)]]),
        'legL':   dict(parent='hips', p=(58, 96), t=(54, 116), z=3, r=1.5),
        'shinL':  dict(parent='legL', p=(54, 116), t=(54, 133), z=2, r=1.4),
        'legR':   dict(parent='hips', p=(96, 96), t=(100, 112), z=3, r=1.5),
        'shinR':  dict(parent='legR', p=(100, 112), t=(104, 123), z=2, r=1.3),
    })

RIGS['ai_bone_golem'] = dict(
    arch='biped', arm='armF', off='armB', wind=18, strike=-34, fore=(12, -20), stride=0.7, armswing=6, lean=0.7, margin=(42, 40),
    # both fists go up, then the whole golem drops on the foe
    swing=dict(W={'hips': (0, -3, -2), 'torso': -8, 'head': 4, 'armF': -150, 'foreF': -20, 'armB': -140, 'foreB': -20, 'legL': 3},
               S={'hips': (0, 6, 4), 'torso': 14, 'head': -5, 'armF': -78, 'foreF': -8, 'armB': -72, 'foreB': -5, 'legL': 8, 'legR': -8, 'shinR': 8},
               ms=(80, 190, 50, 150, 80, 120, 80), smear={'bone': 'foreF', 'tipR': 0.8}),
    bones={
        'hips':  dict(p=(60, 80), t=(60, 94), z=5, r=1.6),
        'torso': dict(parent='hips', p=(60, 76), t=(62, 42), z=6, r=2.6),
        'head':  dict(parent='torso', p=(64, 37), t=(64, 14), z=8, r=1.3),
        'armF':  dict(parent='torso', p=(34, 44), t=(26, 70), z=9, r=1.7),
        'foreF': dict(parent='armF', p=(26, 72), t=(30, 104), z=10, r=1.5),
        'armB':  dict(parent='torso', p=(86, 44), t=(94, 68), z=7, r=1.5),
        'foreB': dict(parent='armB', p=(94, 68), t=(100, 92), z=8, r=1.4),
        'legL':  dict(parent='hips', p=(46, 96), t=(42, 118), z=3, r=1.4),
        'shinL': dict(parent='legL', p=(42, 118), t=(42, 139), z=2, r=1.3),
        'legR':  dict(parent='hips', p=(74, 96), t=(78, 112), z=3, r=1.4),
        'shinR': dict(parent='legR', p=(78, 112), t=(80, 127), z=2, r=1.3),
    })

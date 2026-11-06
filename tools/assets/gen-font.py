"""Builds assets/fonts/LichNumerals.ttf: a pixel numeral font (digits and number signs only).
index.html loads it with a unicode-range, ahead of every font stack, so all numbers in the DOM UI
use these glyphs (flat-topped 5, open 4 and 9 -- never confusable with S/A/g) while letters keep
Pixelify Sans / Jacquard 24.  Requires fontTools.  Usage: python3 tools/assets/gen-font.py"""
import os
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

PX = 100          # design units per pixel (em = 1000)
G = {  # 5 x 7 pixel glyphs
  'zero':   ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  'one':    ['..#..', '.##..', '#.#..', '..#..', '..#..', '..#..', '#####'],
  'two':    ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  'three':  ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  'four':   ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  'five':   ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  'six':    ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  'seven':  ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  'eight':  ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  'nine':   ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  'period': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  'comma':  ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  'percent':['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
  'plus':   ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  'minus':  ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  'slash':  ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  'colon':  ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
}
CMAP = {'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
        'period': '.', 'comma': ',', 'percent': '%', 'plus': '+', 'minus': '-', 'slash': '/', 'colon': ':'}
NARROW = {'period', 'comma', 'colon'}

def glyph(rows):
    pen = TTGlyphPen(None)
    h = len(rows)
    for y, row in enumerate(rows):
        x = 0
        while x < len(row):
            if row[x] != '#': x += 1; continue
            w = 1
            while x + w < len(row) and row[x + w] == '#': w += 1
            x0, x1 = (x + 0.5) * PX, (x + w + 0.5) * PX       # half-pixel side bearing
            y1 = (h - y) * PX; y0 = y1 - PX                   # baseline at the bottom row
            pen.moveTo((x0, y0)); pen.lineTo((x0, y1)); pen.lineTo((x1, y1)); pen.lineTo((x1, y0)); pen.closePath()
            x += w
    return pen.glyph()

order = ['.notdef', 'space'] + list(G)
fb = FontBuilder(1000, isTTF=True)
fb.setupGlyphOrder(order)
fb.setupCharacterMap({ord(c): n for n, c in CMAP.items()} | {32: 'space'})
empty = TTGlyphPen(None).glyph()
glyphs = {'.notdef': empty, 'space': empty} | {n: glyph(r) for n, r in G.items()}
fb.setupGlyf(glyphs)
adv = lambda n: 400 if n in NARROW else 600
fb.setupHorizontalMetrics({n: (adv(n) if n in G else 600, 0) for n in order})
fb.setupHorizontalHeader(ascent=900, descent=-200)
fb.setupNameTable({'familyName': 'Lich Numerals', 'styleName': 'Regular'})
fb.setupOS2(sTypoAscender=900, sTypoDescender=-200, usWinAscent=900, usWinDescent=200, sCapHeight=700, sxHeight=500)
fb.setupPost()
out = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'fonts', 'LichNumerals.ttf')
fb.save(out)
print('wrote', os.path.normpath(out), os.path.getsize(out), 'bytes')

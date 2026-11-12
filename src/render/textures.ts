// Runtime-generated textures (lighting falloff, enemy ground markers) and
// small rendering helpers shared by the renderer.
import * as Phaser from 'phaser';
import { makeCanvas, clamp } from '../core/util';
import { SheetMeta } from '../config/manifest';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Dithered, 5-band quantized radial light falloff — keeps lighting "pixel". */
export function makeLightTextures(scene: Phaser.Scene) {
  for (let r = 8; r <= 256; r += 8) {
    const key = 'light_' + r;
    if (scene.textures.exists(key)) continue;
    const s = r * 2;
    const [c, ctx] = makeCanvas(s, s);
    const img = ctx.createImageData(s, s), d = img.data;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const dd = Math.sqrt((x - r + 0.5) ** 2 + (y - r + 0.5) ** 2) / r;
      if (dd >= 1) continue;
      let v = 1 - dd; v = v * v * (3 - 2 * v);
      const lv = v * 5, band = Math.floor(lv), frac = lv - band;
      const th = (BAYER[(y % 4) * 4 + (x % 4)] + 0.5) / 16;
      const q = (band + (frac > th ? 1 : 0)) / 5;
      const i = (y * s + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.round(clamp(q, 0, 1) * 255);
    }
    ctx.putImageData(img, 0, 0);
    scene.textures.addCanvas(key, c);
  }
}

/** Enemy shadows carry a dark-red ground ring so mortals read instantly.
 *  Built at texel resolution from the generated shadow images (drawn at 1/T). */
export function makeShadowTextures(scene: Phaser.Scene, T = 2) {
  for (const w of [8, 12, 16, 24, 32, 48]) {
    const key = 'eshadow_' + w;
    if (scene.textures.exists(key)) continue;
    const src = scene.textures.get('shadow_' + w).getSourceImage() as HTMLImageElement;
    const W = src.width + 4 * T, H = src.height + 3 * T;
    const [c, ctx] = makeCanvas(W, H);
    ctx.drawImage(src, 2 * T, Math.round((H - src.height) / 2));
    ctx.fillStyle = 'rgba(176,42,32,0.7)';
    const rx = src.width / 2 + T, ry = src.height / 2 + T * 0.5, cx = W / 2, cy = H / 2;
    const n = Math.round((rx + ry) * 3.2);
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; ctx.fillRect(Math.round(cx + Math.cos(a) * rx - 0.5), Math.round(cy + Math.sin(a) * ry - 0.5), 1, 1); }
    scene.textures.addCanvas(key, c);
  }
}

/** phase: per-entity offset (seconds) so a squad never breathes or marches in lockstep. */
export function animFrameIndex(meta: SheetMeta, anim: string, at: number, phase = 0) {
  const a = (meta.anims && (meta.anims[anim] || meta.anims.idle)) || [0, 1];
  // every clip has a fixed DURATION whatever its frame count (rigged sheets have 6-8 frames, the older strips 2-4):
  // idle ~1.4 s, a walk cycle 0.55 s, an attack plays once in 0.3 s (the attack hold), a cast gesture 0.36 s
  const speed = anim === 'walk' ? a[1] / 0.55 : anim === 'atk' ? a[1] / 0.3 : anim === 'cast' ? a[1] / 0.36 : Math.max(1.4, a[1] / 1.4);
  if (anim !== 'atk') at += phase;
  const f = Math.floor(at * speed);
  return a[0] + (anim === 'atk' ? Math.min(f, a[1] - 1) : f % Math.max(1, a[1]));
}

/** 3x5 pixel font used for damage numbers and world labels. */
/** Texel-resolution glyphs (5×10 texels = 2.5×5 world px) for digits and number signs:
 *  1-texel strokes, a flat-topped 5 and an open 4 so numbers never read as letters. */
export const PX_DIGITS: Record<string, string> = {
  '0': '01110100011000110001100011000110001100011000101110',
  '1': '00100011001010000100001000010000100001000010011111',
  '2': '01110100010000100001000100010001000100001000011111',
  '3': '01110100010000100001001100000100001000011000101110',
  '4': '00010001100101010010100101111100010000100001000010',
  '5': '11111100001000011110000010000100001000011000101110',
  '6': '00110010001000010000111101000110001100011000101110',
  '7': '11111000010000100010000100010000100010000100001000',
  '8': '01110100011000110001011101000110001100011000101110',
  '9': '01110100011000110001100010111100001000010001001100',
  '+': '00000000000010000100111110010000100000000000000000',
  '-': '00000000000000000000111110000000000000000000000000',
  '.': '00000000000000000000000000000000000000000110001100',
  '%': '11001110010001000010001000010001000010001001110011',
};
export const PX_FONT: Record<string, string> = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001', '5': '111100111001111',
  '6': '111100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001111', '!': '010010010000010', '+': '000010111010000',
  '-': '000000111000000', '.': '000000000000010', a: '010101111101101', b: '110101110101110', c: '011100100100011', d: '110101101101110',
  e: '111100110100111', f: '111100110100100', g: '011100101101011', h: '101101111101101', i: '111010010010111', j: '001001001101010',
  k: '101101110101101', l: '100100100100111', m: '101111111101101', n: '110101101101101', o: '010101101101010', p: '110101110100100',
  q: '010101101110011', r: '110101110101101', s: '011100010001110', t: '111010010010010', u: '101101101101111', v: '101101101101010',
  w: '101101111111101', x: '101101010101101', y: '101101010010010', z: '111001010100111', ' ': '000000000000000', "'": '010010000000000',
};

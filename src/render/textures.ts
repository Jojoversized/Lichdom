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

export function animFrameIndex(meta: SheetMeta, anim: string, at: number) {
  const a = (meta.anims && (meta.anims[anim] || meta.anims.idle)) || [0, 1];
  const speed = anim === 'walk' ? 7 : anim === 'atk' ? 10 : anim === 'cast' ? 6 : 2.2;
  const f = Math.floor(at * speed);
  return a[0] + (anim === 'atk' ? Math.min(f, a[1] - 1) : f % Math.max(1, a[1]));
}

/** 3x5 pixel font used for damage numbers and world labels. */
export const PX_FONT: Record<string, string> = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001', '5': '111100111001111',
  '6': '111100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001111', '!': '010010010000010', '+': '000010111010000',
  '-': '000000111000000', '.': '000000000000010', a: '010101111101101', b: '110101110101110', c: '011100100100011', d: '110101101101110',
  e: '111100110100111', f: '111100110100100', g: '011100101101011', h: '101101111101101', i: '111010010010111', j: '001001001101010',
  k: '101101110101101', l: '100100100100111', m: '101111111101101', n: '110101101101101', o: '010101101101010', p: '110101110100100',
  q: '010101101110011', r: '110101110101101', s: '011100010001110', t: '111010010010010', u: '101101101101111', v: '101101101101010',
  w: '101101111111101', x: '101101010101101', y: '101101010010010', z: '111001010100111', ' ': '000000000000000', "'": '010010000000000',
};

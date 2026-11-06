// Hi-res finishing pass for every sprite, tile and icon.
//
// Painters author shapes at the 1x design grid (16 px world cell, 22 px humanoid).
// This pass turns those flat shapes into 2x-density pixel art:
//   1. edge-aware 2x upscale (Scale2x/EPX with colour tolerance) — rounds stair-step
//      diagonals and curves instead of fattening them into 2x2 blocks;
//   2. form shading at 2x — a height field built from the silhouette and from the
//      boundaries between colour regions gives every part (helmet, arm, blade) its own
//      volume, lit from the upper left, quantized to 4 bands with a 4x4 Bayer dither
//      and hue-shifted (warm highlights, cool shadows);
//   3. emissive colours (necro green, fire, holy, frost, arcane) are left unshaded so
//      magic still glows;
//   4. a 1-texel selective outline (darkened neighbour colour blended into #08090b)
//      instead of the old 2-texel-thick black line.
// Output is deterministic.
import { PixelCanvas } from './pixelcanvas.mjs';

export const RES = 2; // texels per world pixel
const OUTLINE = [8, 9, 11];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function same(d, i, j, tol) {
  const ai = d[i + 3] > 127, aj = d[j + 3] > 127;
  if (ai !== aj) return false;
  if (!ai) return true;
  return Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2]) <= tol;
}

/** Scale2x (EPX) with a colour tolerance so near-identical shades still count as equal. */
export function scale2x(src, tol = 18, interior = false) {
  const w = src.width, h = src.height, s = src.data;
  const out = new PixelCanvas(w * 2, h * 2), o = out.data, W2 = w * 2;
  const idx = (x, y) => (clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)) * 4;
  const put = (x, y, si) => { const k = (y * W2 + x) * 4; o[k] = s[si]; o[k + 1] = s[si + 1]; o[k + 2] = s[si + 2]; o[k + 3] = s[si + 3]; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const P = idx(x, y), A = idx(x, y - 1), B = idx(x + 1, y), C = idx(x - 1, y), D = idx(x, y + 1);
    let e0 = P, e1 = P, e2 = P, e3 = P;
    // only round the silhouette: interior details (emblems, visors, eyes) stay crisp
    const sil = (s[P + 3] > 127) !== (s[A + 3] > 127) || (s[P + 3] > 127) !== (s[B + 3] > 127) || (s[P + 3] > 127) !== (s[C + 3] > 127) || (s[P + 3] > 127) !== (s[D + 3] > 127);
    if (!sil && !interior) { put(x * 2, y * 2, P); put(x * 2 + 1, y * 2, P); put(x * 2, y * 2 + 1, P); put(x * 2 + 1, y * 2 + 1, P); continue; }
    if (same(s, C, A, tol) && !same(s, C, D, tol) && !same(s, A, B, tol)) e0 = A;
    if (same(s, A, B, tol) && !same(s, A, C, tol) && !same(s, B, D, tol)) e1 = B;
    if (same(s, D, C, tol) && !same(s, D, B, tol) && !same(s, C, A, tol)) e2 = C;
    if (same(s, B, D, tol) && !same(s, B, A, tol) && !same(s, D, C, tol)) e3 = D;
    put(x * 2, y * 2, e0); put(x * 2 + 1, y * 2, e1); put(x * 2, y * 2 + 1, e2); put(x * 2 + 1, y * 2 + 1, e3);
  }
  return out;
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hh = 0;
  if (d) hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hh * 60, mx ? d / mx : 0, mx];
}
/** Saturated, bright colours are "magic" and keep their glow. */
function emissive(r, g, b) { const [, s, v] = rgbToHsv(r, g, b); return s > 0.55 && v > 0.72; }

/** Chamfer distance (in texels) from seed pixels, restricted to the opaque mask. */
function distanceField(w, h, mask, seed, cap) {
  const D = new Float32Array(w * h).fill(cap);
  for (let i = 0; i < w * h; i++) if (!mask[i] || seed[i]) D[i] = mask[i] ? 0.5 : 0;
  const A = 1, B = 1.41;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!mask[i]) continue;
    let v = D[i];
    if (x > 0) v = Math.min(v, D[i - 1] + A);
    if (y > 0) { v = Math.min(v, D[i - w] + A); if (x > 0) v = Math.min(v, D[i - w - 1] + B); if (x < w - 1) v = Math.min(v, D[i - w + 1] + B); }
    D[i] = v;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; if (!mask[i]) continue;
    let v = D[i];
    if (x < w - 1) v = Math.min(v, D[i + 1] + A);
    if (y < h - 1) { v = Math.min(v, D[i + w] + A); if (x < w - 1) v = Math.min(v, D[i + w + 1] + B); if (x > 0) v = Math.min(v, D[i + w - 1] + B); }
    D[i] = Math.min(cap, v);
  }
  return D;
}

/**
 * Form shading at full (2x) resolution.
 * opts.body: silhouette volume depth in texels; opts.part: per-colour-region depth;
 * opts.strength: overall contrast; opts.grit: fine texture noise; opts.flat: skip volume (tiles).
 */
export function formShade(c, opts = {}) {
  const w = c.width, h = c.height, d = c.data;
  const body = opts.body ?? 7, part = opts.part ?? 3.5, strength = opts.strength ?? 1, grit = opts.grit ?? 0;
  let seed = opts.seed ?? 1;
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const N = w * h, mask = new Uint8Array(N), edgeS = new Uint8Array(N), edgeR = new Uint8Array(N);
  for (let i = 0; i < N; i++) mask[i] = d[i * 4 + 3] > 127 ? 1 : 0;
  const diff = (i, j) => Math.abs(d[i * 4] - d[j * 4]) + Math.abs(d[i * 4 + 1] - d[j * 4 + 1]) + Math.abs(d[i * 4 + 2] - d[j * 4 + 2]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!mask[i]) continue;
    const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
    for (const j of nb) {
      if (j < 0 || !mask[j]) { edgeS[i] = 1; edgeR[i] = 1; }
      else if (diff(i, j) > 70) edgeR[i] = 1;
    }
  }
  const dS = distanceField(w, h, mask, edgeS, body), dR = distanceField(w, h, mask, edgeR, part);
  // height: rounded profile (sqrt) so the light falls off like a cylinder, not a wedge
  const H = new Float32Array(N);
  for (let i = 0; i < N; i++) if (mask[i]) H[i] = 0.62 * Math.sqrt(dS[i] / body) + 0.38 * Math.sqrt(dR[i] / part);
  // light from the upper left
  const Lx = 0.55, Ly = 0.83;
  const src = new Uint8ClampedArray(d);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!mask[i]) continue;
    const k = i * 4, r = src[k], g = src[k + 1], b = src[k + 2];
    const hl = x > 0 && mask[i - 1] ? H[i - 1] : 0, hr = x < w - 1 && mask[i + 1] ? H[i + 1] : 0;
    const hu = y > 0 && mask[i - w] ? H[i - w] : 0, hd = y < h - 1 && mask[i + w] ? H[i + w] : 0;
    const gx = (hr - hl) * 0.5, gy = (hd - hu) * 0.5;
    // facing the light => height rises away from the light => positive dot
    let s = (gx * Lx + gy * Ly) * 3.2 * Math.max(1, body / 7) * strength; // slope-normalised: big sprites shade as clearly as small ones
    s -= 0.18 * (y / h) * strength; // gentle ambient occlusion toward the feet
    s += (H[i] - 0.5) * 0.25 * strength;
    s = clamp(s, -1.2, 1);
    const th = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5;
    const lv = clamp(Math.round(s * 2 + th * 0.55), -2, 1); // 4 bands: -2,-1,0,+1
    let nr = r, ng = g, nb = b;
    if (emissive(r, g, b)) {
      if (lv > 0) { nr += (255 - nr) * 0.25; ng += (255 - ng) * 0.25; nb += (255 - nb) * 0.25; }
    } else if (lv > 0) {
      // warm highlight
      nr = nr * 1.12 + 22; ng = ng * 1.1 + 16; nb = nb * 1.04 + 6;
    } else if (lv < 0) {
      const f = lv === -1 ? 0.8 : 0.62;
      // cool, slightly purple shadow
      nr = nr * f * 0.94 + 2; ng = ng * f * 0.95 + 2; nb = nb * f + 9 * -lv;
    }
    if (grit) { const n = 1 + (rng() - 0.5) * 2 * grit; nr *= n; ng *= n; nb *= n; }
    d[k] = clamp(Math.round(nr), 0, 255); d[k + 1] = clamp(Math.round(ng), 0, 255); d[k + 2] = clamp(Math.round(nb), 0, 255);
  }
  return c;
}

/** 1-texel selective outline: dark, but carries a hint of the colour it wraps. */
export function selOutline(c, opts = {}) {
  const w = c.width, h = c.height, d = c.data, src = new Uint8ClampedArray(d);
  const mixK = opts.tint ?? 0.16;
  const op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 127;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (src[i + 3] > 40) continue; // keep soft glows intact
    const nbs = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter(([a, b]) => op(a, b));
    if (!nbs.length) continue;
    let r = 0, g = 0, b = 0;
    for (const [a, bb] of nbs) { const j = (bb * w + a) * 4; r += src[j]; g += src[j + 1]; b += src[j + 2]; }
    r /= nbs.length; g /= nbs.length; b /= nbs.length;
    // the bottom contour (shadow side) stays pure ink
    const below = op(x, y - 1) && !op(x, y + 1);
    const k = below ? mixK * 0.35 : mixK;
    d[i] = Math.round(OUTLINE[0] * (1 - k) + r * 0.42 * k);
    d[i + 1] = Math.round(OUTLINE[1] * (1 - k) + g * 0.42 * k);
    d[i + 2] = Math.round(OUTLINE[2] * (1 - k) + b * 0.42 * k);
    d[i + 3] = 255;
  }
  return c;
}

/** Big sprites are painted with doubled pixels (k = H/22 ~ 2). Collapse each 2x2
 *  block back to one pixel (opaque-majority, most common colour), then Scale2x with
 *  interior smoothing: the same size again, but with rounded, non-blocky shapes. */
export function unblock(src) {
  const w = Math.ceil(src.width / 2), h = Math.ceil(src.height / 2), s = src.data;
  const half = new PixelCanvas(w, h), o = half.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = [];
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const X = x * 2 + dx, Y = y * 2 + dy;
      if (X < src.width && Y < src.height) px.push((Y * src.width + X) * 4);
    }
    const opq = px.filter(i => s[i + 3] > 127);
    const pool = opq.length >= 2 ? opq : px;
    let best = pool[0], bc = -1;
    for (const i of pool) { let c = 0; for (const j of pool) if (Math.abs(s[i] - s[j]) + Math.abs(s[i + 1] - s[j + 1]) + Math.abs(s[i + 2] - s[j + 2]) < 24) c++; if (c > bc) { bc = c; best = i; } }
    const k = (y * w + x) * 4;
    o[k] = s[best]; o[k + 1] = s[best + 1]; o[k + 2] = s[best + 2]; o[k + 3] = opq.length >= 2 ? Math.max(s[best + 3], 200) : 0;
  }
  const back = scale2x(half, 18, true);
  // keep the painted interior (faces, gems, emblems); take the rounded version only
  // within 2 px of the silhouette, where the blockiness actually shows
  const out = new PixelCanvas(src.width, src.height), od = out.data, bd = back.data, W = src.width, Hh = src.height;
  const op = (x, y) => x >= 0 && y >= 0 && x < W && y < Hh && s[(y * W + x) * 4 + 3] > 127;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) if (op(x + dx, y + dy) !== op(x, y)) { near = true; break; }
    const k = (y * W + x) * 4, from = near && x < back.width && y < back.height ? bd : s, j = near ? (y * back.width + x) * 4 : k;
    od[k] = from[j]; od[k + 1] = from[j + 1]; od[k + 2] = from[j + 2]; od[k + 3] = from[j + 3];
  }
  return out;
}

/** Full finishing pass for a character/structure frame painted at 1x. */
export function finish(c1, opts = {}) {
  if (opts.unblock) c1 = unblock(c1);
  // pad by 1 so the outline never clips at the frame border (icons keep their box)
  let pad = c1;
  if (opts.pad !== false) { pad = new PixelCanvas(c1.width + 2, c1.height + 2); pad.drawImage(c1, 1, 1); }
  const c2 = scale2x(pad, 18, !!opts.smoothInterior);
  formShade(c2, opts);
  selOutline(c2, opts);
  return c2;
}

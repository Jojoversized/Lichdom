// Core math, randomness, colour and data-structure helpers.
export const TAU = Math.PI * 2;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist2 = (ax: number, ay: number, bx: number, by: number) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.sqrt(dist2(ax, ay, bx, by));
export const rnd = (a = 1, b?: number) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const rndi = (a: number, b: number) => Math.floor(rnd(a, b + 1));
export const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p: number) => Math.random() < p;

/** Incremental-friendly number formatting: 1234 -> 1.2K, 3.4M, 5.6B, ... */
const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc'];
export function fmt(n: number): string {
  if (!isFinite(n)) return '∞';
  const neg = n < 0; n = Math.abs(n);
  if (n < 1000) return (neg ? '-' : '') + Math.floor(n);
  let i = 0;
  while (n >= 1000 && i < SUFFIX.length - 1) { n /= 1000; i++; }
  return (neg ? '-' : '') + (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)) + SUFFIX[i];
}

export interface Rng { (): number; range(lo: number, hi: number): number; int(lo: number, hi: number): number; pick<T>(a: T[]): T; }
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const f = (() => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  f.range = (lo, hi) => lo + f() * (hi - lo);
  f.int = (lo, hi) => Math.floor(lo + f() * (hi - lo + 1));
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  return f;
}

export function hexToRgb(h: string): [number, number, number] {
  h = h.replace('#', '');
  return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
}
export function hexNum(h: string): number { return parseInt(h.replace('#', ''), 16); }
export function rgbToHex(r: number, g: number, b: number) { return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join(''); }
export function shade(hex: string, f: number) {
  const [r, g, b] = hexToRgb(hex);
  if (f < 1) return rgbToHex(r * f, g * f, b * f);
  return rgbToHex(r + (255 - r) * (f - 1), g + (255 - g) * (f - 1), b + (255 - b) * (f - 1));
}

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

/** Uniform-grid spatial hash for neighbour and target queries. */
export class SpatialHash<T extends { x: number; y: number; dead?: boolean }> {
  map = new Map<number, T[]>();
  constructor(public cell = 48) { }
  clear() { this.map.clear(); }
  key(cx: number, cy: number) { return (cx + 512) * 4096 + (cy + 512); }
  insert(e: T) {
    const k = this.key(Math.floor(e.x / this.cell), Math.floor(e.y / this.cell));
    let b = this.map.get(k);
    if (!b) { b = []; this.map.set(k, b); }
    b.push(e);
  }
  /** Calls fn for each entity within r; return true from fn to stop. */
  query(x: number, y: number, r: number, fn: (e: T) => boolean | void) {
    const c = this.cell, r2 = r * r;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c), y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const b = this.map.get(this.key(cx, cy));
      if (!b) continue;
      for (let i = 0; i < b.length; i++) {
        const e = b[i];
        if (e.dead) continue;
        const dx = e.x - x, dy = e.y - y;
        if (dx * dx + dy * dy <= r2 && fn(e)) return;
      }
    }
  }
  nearest(x: number, y: number, r: number, filter?: (e: T) => boolean): T | null {
    let best: T | null = null, bd = Infinity;
    this.query(x, y, r, e => { if (filter && !filter(e)) return; const d = dist2(x, y, e.x, e.y); if (d < bd) { bd = d; best = e; } });
    return best;
  }
}

export class MinHeap {
  k: number[] = []; v: number[] = [];
  get size() { return this.k.length; }
  push(key: number, val: number) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= k[i]) break; [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]]; i = p; }
  }
  pop(): number {
    const k = this.k, v = this.v, top = v[0];
    const lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      k[0] = lk; v[0] = lv; let i = 0;
      for (; ;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < k.length && k[l] < k[m]) m = l; if (r < k.length && k[r] < k[m]) m = r; if (m === i) break;[k[m], k[i]] = [k[i], k[m]];[v[m], v[i]] = [v[i], v[m]]; i = m; }
    }
    return top;
  }
}

/** Simple object pool. */
export class Pool<T> {
  free: T[] = [];
  constructor(private factory: () => T, size = 64) { for (let i = 0; i < size; i++) this.free.push(factory()); }
  get(): T { return this.free.pop() || this.factory(); }
  release(o: T) { this.free.push(o); }
}

let _uid = 1;
export const uid = () => _uid++;

// Minimal, dependency-free software canvas used by the asset generators.
// It mimics the subset of CanvasRenderingContext2D the painters use
// (fillStyle, globalAlpha, fillRect, getImageData/putImageData, drawImage)
// so pixel art can be authored procedurally and exported as PNG.
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

export function parseColor(c) {
  if (typeof c !== 'string') return [255, 255, 255, 255];
  if (c[0] === '#') {
    const h = c.slice(1);
    if (h.length === 3) return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16), 255];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(',').map(s => parseFloat(s));
    return [p[0], p[1], p[2], Math.round((p[3] ?? 1) * 255)];
  }
  return [255, 255, 255, 255];
}

export class PixelCanvas {
  constructor(w, h) {
    this.width = w; this.height = h;
    this.data = new Uint8ClampedArray(w * h * 4);
    this.fillStyle = '#000'; this.globalAlpha = 1;
    this.imageSmoothingEnabled = false;
  }
  getContext() { return this; }
  _blend(i, r, g, b, a) {
    const d = this.data;
    const sa = a / 255, da = d[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    d[i] = (r * sa + d[i] * da * (1 - sa)) / oa;
    d[i + 1] = (g * sa + d[i + 1] * da * (1 - sa)) / oa;
    d[i + 2] = (b * sa + d[i + 2] * da * (1 - sa)) / oa;
    d[i + 3] = oa * 255;
  }
  fillRect(x, y, w, h) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    if (w <= 0 || h <= 0) return;
    const [r, g, b, a0] = parseColor(this.fillStyle);
    const a = a0 * this.globalAlpha;
    const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(this.width, x + w), y1 = Math.min(this.height, y + h);
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) this._blend((yy * this.width + xx) * 4, r, g, b, a);
  }
  clearRect(x, y, w, h) {
    for (let yy = Math.max(0, y); yy < Math.min(this.height, y + h); yy++)
      for (let xx = Math.max(0, x); xx < Math.min(this.width, x + w); xx++) this.data.fill(0, (yy * this.width + xx) * 4, (yy * this.width + xx) * 4 + 4);
  }
  getImageData() { return { data: this.data, width: this.width, height: this.height }; }
  putImageData(img) { if (img.data !== this.data) this.data.set(img.data); }
  drawImage(src, dx = 0, dy = 0) {
    dx = Math.round(dx); dy = Math.round(dy);
    for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
      const tx = x + dx, ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) continue;
      const si = (y * src.width + x) * 4;
      const a = src.data[si + 3] * this.globalAlpha;
      if (a > 0) this._blend((ty * this.width + tx) * 4, src.data[si], src.data[si + 1], src.data[si + 2], a);
    }
  }
}

// ---------- PNG encoder ----------
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function encodePNG(canvas) {
  const { width: w, height: h, data } = canvas;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
export function savePNG(canvas, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePNG(canvas));
}

// ---------- WAV encoder (16-bit mono) ----------
export function saveWAV(samples, sampleRate, file) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}

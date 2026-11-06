// Map generation (seeded), terrain painting and flow-field pathfinding.
// Layout: the keep stands on the far left; roads wind in from the right edge.
import { G } from '../core/state';
import { makeRng, makeCanvas, clamp, lerp, dist, shade, hexToRgb, MinHeap, Rng } from '../core/util';
import { CELL, MW, MH, WW, WH, KEEP, WELL_POS, LANES, PAL } from '../config/constants';
import { FORTRESSES } from '../data/world';

export const cellIdx = (x: number, y: number) => y * MW + x;
export function worldToCell(px: number, py: number): [number, number] { return [clamp(Math.floor(px / CELL), 0, MW - 1), clamp(Math.floor(py / CELL), 0, MH - 1)]; }

export interface Prop { name: string; x: number; y: number; solid?: boolean; anim?: boolean; light?: { r: number; color: string; flicker?: boolean }; view?: any; }

export function generateMap(seed: number, fortKey: string) {
  const rng = makeRng(seed);
  const n = MW * MH;
  const M: any = {
    seed, fort: fortKey, theme: FORTRESSES[fortKey],
    road: new Uint8Array(n), obstacle: new Uint8Array(n), reserved: new Uint8Array(n),
    struct: new Array(n).fill(null), terrain: null as HTMLCanvasElement | null, props: [] as Prop[],
    flow: new Float32Array(n), flowC: new Float32Array(n), dirty: true,
  };
  const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < MW && y < MH;
  for (let y = KEEP.cy0 - 1; y <= KEEP.cy1 + 1; y++) for (let x = 0; x <= KEEP.cx1 + 1; x++) if (inb(x, y)) M.reserved[cellIdx(x, y)] = 2;
  for (let y = WELL_POS.cy0; y <= WELL_POS.cy1; y++) for (let x = WELL_POS.cx0; x <= WELL_POS.cx1 + 1; x++) M.reserved[cellIdx(x, y)] = 3;
  // roads: from each lane on the right edge to the keep gate
  const gateX = KEEP.cx1 + 1, gateY = 21;
  for (const l of LANES) {
    let x = MW - 1, y = l.cy, steps = 0;
    const phase = rng() * Math.PI * 2;
    while ((x !== gateX || y !== gateY) && steps++ < 600) {
      const dx = gateX - x, dy = gateY - y;
      const horiz = Math.abs(dx) > Math.abs(dy) * 1.5 || Math.abs(dy) < 1;
      M.road[cellIdx(x, y)] = 1;
      if (horiz) { if (inb(x, y + 1)) M.road[cellIdx(x, y + 1)] = 1; } else { if (inb(x + 1, y)) M.road[cellIdx(x + 1, y)] = 1; }
      const wig = Math.sin(steps * 0.12 + phase);
      if (horiz) { x += Math.sign(dx); if (rng() < 0.3 && Math.abs(wig) > 0.5 && Math.abs(dx) > 12) y = clamp(y + Math.sign(wig), 1, MH - 2); }
      else { y += Math.sign(dy); if (rng() < 0.25 && Math.abs(wig) > 0.6) x = clamp(x + Math.sign(wig), gateX, MW - 1); }
    }
  }
  const nearRoad = (x: number, y: number, r: number) => { for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) if (inb(x + ox, y + oy) && M.road[cellIdx(x + ox, y + oy)]) return true; return false; };
  const nearKeep = (x: number, y: number, r: number) => x <= KEEP.cx1 + r && y >= KEEP.cy0 - r && y <= KEEP.cy1 + r;
  // obstacles
  const types: [string, number, number][] = [['tree0', 2, 1], ['tree1', 2, 1], ['tree2', 2, 1], ['rock', 1, 1], ['rock2', 2, 1], ['pillar', 1, 1], ['ruinwall', 2, 1]];
  let placed = 0, tries = 0;
  while (placed < 80 && tries++ < 4000) {
    const x = rng.int(1, MW - 4), y = rng.int(2, MH - 2);
    const [name, w, h] = rng.pick(types);
    if (nearKeep(x, y, 6) || nearRoad(x, y, 2) || nearRoad(x + w - 1, y, 2) || x > MW - 6) continue;
    let ok = true;
    for (let oy = 0; oy < h; oy++) for (let ox = 0; ox < w; ox++) if (!inb(x + ox, y + oy) || M.obstacle[cellIdx(x + ox, y + oy)] || M.reserved[cellIdx(x + ox, y + oy)]) ok = false;
    if (!ok) continue;
    for (let oy = 0; oy < h; oy++) for (let ox = 0; ox < w; ox++) M.obstacle[cellIdx(x + ox, y + oy)] = 1;
    M.props.push({ name, x: x * CELL + (w * CELL) / 2, y: (y + h) * CELL - 1, solid: true });
    placed++;
  }
  // light props
  let braz = 0; tries = 0;
  while (braz < 22 && tries++ < 3000) {
    const x = rng.int(4, MW - 4), y = rng.int(3, MH - 3);
    if (M.road[cellIdx(x, y)] || !nearRoad(x, y, 1) || M.obstacle[cellIdx(x, y)] || M.reserved[cellIdx(x, y)]) continue;
    if (M.props.some((p: Prop) => p.light && dist(p.x, p.y, x * CELL, y * CELL) < 150)) continue;
    const type = rng() < 0.75 ? 'brazier' : 'crystal';
    M.obstacle[cellIdx(x, y)] = 1;
    M.props.push({ name: type, x: x * CELL + 8, y: y * CELL + 15, solid: true, anim: true, light: { r: type === 'brazier' ? 64 : 44, color: type === 'brazier' ? '#ff8a1e' : M.theme.accent, flicker: type === 'brazier' } });
    braz++;
  }
  [[KEEP.x1 + 8, KEEP.y - 34], [KEEP.x1 + 8, KEEP.y1 + 6], [KEEP.x0 + 30, KEEP.y1 + 8], [KEEP.x0 + 90, KEEP.y1 + 8]].forEach(([x, y]) =>
    M.props.push({ name: 'torch', x, y, anim: true, light: { r: 40, color: '#ff9a2e', flicker: true } }));
  // small decorative props
  tries = 0; let sp = 0;
  const small = ['grave', 'grave2', 'cross', 'skullpole', 'fence', 'cart', 'banner'];
  while (sp < 55 && tries++ < 3000) {
    const x = rng.int(1, MW - 2), y = rng.int(2, MH - 2);
    if (M.road[cellIdx(x, y)] || M.obstacle[cellIdx(x, y)] || nearKeep(x, y, 3)) continue;
    const name = rng() < 0.55 ? rng.pick(['grave', 'grave2', 'cross']) : rng.pick(small);
    const count = name.startsWith('grave') || name === 'cross' ? rng.int(2, 5) : 1;
    for (let i = 0; i < count; i++) {
      const gx = x + rng.int(-2, 2), gy = y + rng.int(-1, 1);
      if (!inb(gx, gy) || M.road[cellIdx(gx, gy)] || M.obstacle[cellIdx(gx, gy)] || nearKeep(gx, gy, 3)) continue;
      M.props.push({ name: i ? rng.pick(['grave', 'grave2', 'cross']) : name, x: gx * CELL + 8, y: gy * CELL + 14, anim: name === 'banner' });
      sp++;
    }
  }
  M.terrain = paintTerrain(M, rng);
  return M;
}

function valueNoise(seed: number) {
  const rng = makeRng(seed), N = 64, grid = new Float32Array((N + 1) * (N + 1));
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  return (x: number, y: number) => {
    x = ((x % N) + N) % N; y = ((y % N) + N) % N;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = grid[y0 * (N + 1) + x0], b = grid[y0 * (N + 1) + x0 + 1], c = grid[(y0 + 1) * (N + 1) + x0], d = grid[(y0 + 1) * (N + 1) + x0 + 1];
    return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
  };
}

/** Paints the static ground layer: noise soil, cobbled roads, dead grass, debris. */
export function paintTerrain(M: any, rng: Rng): HTMLCanvasElement {
  const th = M.theme;
  const [c, ctx] = makeCanvas(WW, WH);
  const img = ctx.createImageData(WW, WH), d = img.data;
  const n1 = valueNoise(M.seed + 1), n2 = valueNoise(M.seed + 2), n3 = valueNoise(M.seed + 3);
  const g = th.ground.map(hexToRgb);
  for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) {
    const v = n1(x / 60, y / 60) * 0.6 + n2(x / 14, y / 14) * 0.3 + n3(x / 3, y / 3) * 0.25 + (rng() - 0.5) * 0.18;
    const col = g[v < 0.42 ? 3 : v < 0.6 ? 0 : v < 0.78 ? 1 : 2];
    const i = (y * WW + x) * 4;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const R = (x: number, y: number, w: number, h: number, col: string) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  for (let i = 0; i < 90; i++) {
    const x = rng() * WW, y = rng() * WH, r = 6 + rng() * 22;
    for (let yy = -r; yy < r; yy++) { const w = Math.sqrt(r * r - yy * yy) * (1.4 + rng() * 0.2); R(x - w, y + yy * 0.55, w * 2, 1, 'rgba(10,10,8,0.18)'); }
  }
  const st = th.stone;
  for (let cy = 0; cy < MH; cy++) for (let cx = 0; cx < MW; cx++) {
    if (!M.road[cellIdx(cx, cy)]) continue;
    const x0 = cx * CELL, y0 = cy * CELL;
    R(x0, y0, CELL, CELL, shade(th.ground[3], 0.95));
    let yy = 0;
    while (yy < CELL) {
      const rh = 3 + Math.floor(rng() * 3); let xx = -Math.floor(rng() * 3);
      while (xx < CELL) {
        const rw = 4 + Math.floor(rng() * 4);
        const edge = (xx < 2 && cx > 0 && !M.road[cellIdx(cx - 1, cy)]) || (xx > CELL - 5 && cx < MW - 1 && !M.road[cellIdx(cx + 1, cy)]) || (yy < 2 && cy > 0 && !M.road[cellIdx(cx, cy - 1)]) || (yy > CELL - 5 && cy < MH - 1 && !M.road[cellIdx(cx, cy + 1)]);
        if (rng() < (edge ? 0.3 : 0.6)) {
          const tone = shade(st, 0.55 + rng() * 0.4);
          const sx = Math.max(0, xx), sw = Math.min(rw - 1, CELL - sx);
          if (sw > 0) { R(x0 + sx, y0 + yy, sw, Math.min(rh - 1, CELL - yy), tone); R(x0 + sx, y0 + yy, sw, 1, shade(tone, 1.18)); }
        }
        xx += rw;
      }
      yy += rh;
    }
  }
  const gc = th.grass;
  for (let i = 0; i < 7500; i++) {
    const x = rng() * WW, y = rng() * WH;
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    if (M.road[cellIdx(cx, cy)] || M.reserved[cellIdx(cx, cy)] === 2) continue;
    if (n1(x / 40 + 9, y / 40 + 3) < 0.45 && rng() < 0.85) continue;
    const strands = 3 + Math.floor(rng() * 5);
    for (let s = 0; s < strands; s++) {
      const sx = x + s - strands / 2 + (rng() - 0.5) * 2, h = 2 + Math.floor(rng() * 5);
      const col = gc[Math.floor(rng() * gc.length)];
      R(sx, y - h, 1, h, col);
      if (h > 3 && rng() < 0.5) R(sx + (rng() < 0.5 ? -1 : 1), y - h - 1, 1, 1, shade(col, 1.2));
    }
    R(x - strands / 2, y, strands, 1, 'rgba(0,0,0,0.3)');
  }
  for (let i = 0; i < 520; i++) {
    const x = rng() * WW, y = rng() * WH, w = 3 + Math.floor(rng() * 7), h = 2 + Math.floor(rng() * 3), tone = shade(st, 0.6 + rng() * 0.4);
    R(x, y, w, h, tone); R(x, y, w, 1, shade(tone, 1.25)); R(x + 1, y + h, w, 1, 'rgba(0,0,0,0.45)');
  }
  for (let i = 0; i < 360; i++) R(rng() * WW, rng() * WH, 1 + (rng() < 0.3 ? 1 : 0), 1, rng() < 0.7 ? '#8a1c18' : '#5a1210');
  for (let i = 0; i < 300; i++) {
    const x = rng() * WW, y = rng() * WH, t = rng();
    if (t < 0.4) { R(x, y, 5, 1, PAL.boneD); R(x - 1, y - 1, 2, 3, PAL.bone); R(x + 4, y - 1, 2, 3, PAL.bone); }
    else if (t < 0.6) { R(x, y, 4, 3, PAL.bone); R(x + 1, y + 1, 1, 1, '#111'); R(x + 3, y + 1, 1, 1, '#111'); R(x + 1, y + 3, 2, 1, PAL.boneD); }
    else if (t < 0.8) { R(x, y, 7, 1, '#7a7e84'); R(x - 1, y - 1, 1, 3, '#5a4a30'); }
    else { R(x, y, 4, 4, '#4a4040'); R(x + 1, y + 1, 2, 2, '#6a6060'); }
  }
  for (let i = 0; i < 22; i++) {
    const x = rng() * WW, y = rng() * WH;
    for (let k = 0; k < 18; k++) R(x + (rng() - 0.5) * 20, y + (rng() - 0.5) * 9, 2 + rng() * 3, 1, rng() < 0.5 ? '#3a0c0a' : '#2a0808');
    R(x - 6, y - 1, 13, 3, '#3c2a24'); R(x - 6, y - 1, 13, 1, '#5a3a30'); R(x + 5, y - 2, 4, 4, '#6a4a3a');
  }
  for (let i = 0; i < 8; i++) {
    const x = 300 + rng() * (WW - 380), y = 50 + rng() * (WH - 100), len = 14 + rng() * 14;
    for (let yy = -6; yy < 6; yy++) {
      const w = (Math.sqrt(36 - yy * yy) * len) / 6;
      for (let xx = -w; xx < w; xx++) {
        const edge = Math.abs(xx) > w - 3 || yy < -4 || yy > 3;
        if (edge && rng() < 0.45) continue;
        R(x + xx + yy * 1.2, y + yy, 1, 1, yy < -3 ? (rng() < 0.5 ? '#1e1814' : '#16110e') : yy < 3 ? (rng() < 0.15 ? '#2a0c0a' : '#100b09') : rng() < 0.5 ? '#4a2618' : '#3a1e14');
      }
    }
  }
  return c;
}

// ---------------- flow field ----------------
export function computeFlow(M: any) {
  const run = (out: Float32Array, climber: boolean) => {
    out.fill(1e9);
    const h = new MinHeap();
    for (let y = KEEP.cy0; y <= KEEP.cy1; y++) for (let x = KEEP.cx0; x <= KEEP.cx1; x++) { const i = cellIdx(x, y); out[i] = 0; h.push(0, i); }
    const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
    while (h.size) {
      const i = h.pop(), d0 = out[i], x = i % MW, y = (i / MW) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
        const j = cellIdx(nx, ny);
        if (M.obstacle[j]) continue;
        if (k >= 4 && (M.obstacle[cellIdx(x + DX[k], y)] || M.obstacle[cellIdx(x, y + DY[k])])) continue;
        let c = M.road[j] ? 1 : 1.5;
        const s = M.struct[j];
        if (s && s.blocks) c += climber ? 5 : 45;
        if (s && s.kind === 'fort' && s.type === 'lava') c += 3;
        if (M.reserved[j] === 3) c += 2;
        if (k >= 4) c *= 1.414;
        const nd = d0 + c;
        if (nd < out[j]) { out[j] = nd; h.push(nd, j); }
      }
    }
  };
  run(M.flow, false);
  run(M.flowC, true);
  M.dirty = false;
}
export function flowStep(M: any, px: number, py: number, climber: boolean): [number, number] {
  const f = climber ? M.flowC : M.flow;
  const [x, y] = worldToCell(px, py);
  let best = f[cellIdx(x, y)], bx = x, by = y;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    if (!ox && !oy) continue;
    const nx = x + ox, ny = y + oy;
    if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
    if (ox && oy && (M.obstacle[cellIdx(x + ox, y)] || M.obstacle[cellIdx(x, y + oy)])) continue;
    const v = f[cellIdx(nx, ny)];
    if (v < best) { best = v; bx = nx; by = ny; }
  }
  return [bx, by];
}
/** Flow distance to the keep for a world position (smaller = closer / more urgent). */
export function flowDist(px: number, py: number) { const [x, y] = worldToCell(px, py); return G.map.flow[cellIdx(x, y)]; }

export function canBuildAt(cx: number, cy: number, w: number, h: number) {
  const M = G.map;
  for (let y = cy; y < cy + h; y++) for (let x = cx; x < cx + w; x++) {
    if (x < 1 || y < 1 || x >= MW - 2 || y >= MH - 1) return false;
    const i = cellIdx(x, y);
    if (M.obstacle[i] || M.reserved[i] || M.struct[i]) return false;
  }
  const px = (cx + w / 2) * CELL, py = (cy + h / 2) * CELL;
  let blocked = false;
  G.hashE.query(px, py, Math.max(w, h) * CELL * 0.7, (e: any) => { if (!e.flying) { blocked = true; return true; } });
  return !blocked;
}

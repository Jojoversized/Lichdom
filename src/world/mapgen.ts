// Map generation (seeded), terrain painting and flow-field pathfinding.
// Layout: the keep stands on the far left; roads wind in from the right edge.
import { G } from '../core/state';
import { makeRng, makeCanvas, clamp, lerp, dist, shade, hexToRgb, MinHeap, Rng } from '../core/util';
import { CELL, MW, MH, WW, WH, KEEP, WELL_POS, LANES, PAL } from '../config/constants';
import { FORTRESSES } from '../data/world';
import { cellInFort, gateDist, GATE, R_CURTAIN, R_BULWARK } from '../data/fortress';

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
  // the fortress: every cell inside the curtain wall is solid, except the gatehouse (the flow goal)
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (cellInFort(x, y)) {
    const i = cellIdx(x, y); M.reserved[i] = 2;
    if (!(x >= KEEP.cx0 && x <= KEEP.cx1 && y >= KEEP.cy0 && y <= KEEP.cy1)) M.obstacle[i] = 1;
  }
  for (let y = WELL_POS.cy0; y <= WELL_POS.cy1; y++) for (let x = WELL_POS.cx0; x <= WELL_POS.cx1; x++) if (!M.reserved[cellIdx(x, y)]) M.reserved[cellIdx(x, y)] = 3;
  // roads: from each lane on the right edge to the keep gate
  const gateX = KEEP.cx1 + 1, gateY = Math.floor(KEEP.y / CELL);
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
  M.sites = makeWallSites(M);
  M.plots = [...makeMounts(M), ...makePlots(M)];
  const nearRoad = (x: number, y: number, r: number) => { for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) if (inb(x + ox, y + oy) && M.road[cellIdx(x + ox, y + oy)]) return true; return false; };
  const nearKeep = (x: number, y: number, r: number) => cellInFort(x, y) || gateDist((x + 0.5) * CELL, (y + 0.5) * CELL) < R_BULWARK + r * CELL;
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
  // torches flanking the gate approach
  [[KEEP.x1 + 10, KEEP.y0 - 6], [KEEP.x1 + 10, KEEP.y1 + 10]].forEach(([x, y]) =>
    M.props.push({ name: 'torch', x, y, anim: true, light: { r: 40, color: '#ff9a2e', flicker: true } }));
  // small decorative props
  tries = 0; let sp = 0;
  const small = ['grave', 'grave2', 'cross', 'skullpole', 'fence', 'cart', 'banner'];
  while (sp < 55 && tries++ < 3000) {
    const x = rng.int(1, MW - 2), y = rng.int(2, MH - 2);
    if (M.road[cellIdx(x, y)] || M.obstacle[cellIdx(x, y)] || M.reserved[cellIdx(x, y)] || nearKeep(x, y, 3)) continue;
    const name = rng() < 0.55 ? rng.pick(['grave', 'grave2', 'cross']) : rng.pick(small);
    const count = name.startsWith('grave') || name === 'cross' ? rng.int(2, 5) : 1;
    for (let i = 0; i < count; i++) {
      const gx = x + rng.int(-2, 2), gy = y + rng.int(-1, 1);
      if (!inb(gx, gy) || M.road[cellIdx(gx, gy)] || M.obstacle[cellIdx(gx, gy)] || M.reserved[cellIdx(gx, gy)] || nearKeep(gx, gy, 3)) continue;
      M.props.push({ name: i ? rng.pick(['grave', 'grave2', 'cross']) : name, x: gx * CELL + 8, y: gy * CELL + 14, anim: name === 'banner' });
      sp++;
    }
  }
  M.terrain = paintTerrain(M, rng);
  return M;
}

export interface WallSite { id: string; name: string; cells: [number, number][]; x: number; y: number; line?: string; }
/** Preset rampart sites (no rng: identical for every seed). The keep ring closes on the map's
 *  left edge; the two lines span the whole field, so closing every segment of a line forces
 *  the crusade to breach it, while gaps funnel the host through them. */
const CURTAIN_SEGS = [['keep_n', 'Curtain: North'], ['keep_g', 'Curtain: Gate'], ['keep_s', 'Curtain: South']];
const BULWARK_SEGS = [['wall_0', 'Bulwark: North'], ['wall_1', 'Bulwark: Upper'], ['wall_2', 'Bulwark: Gate'], ['wall_3', 'Bulwark: Lower'], ['wall_4', 'Bulwark: South']];
/** Cells of an arc around the gate from angle a0 to a1 (radians, 0 = facing the crusade, −π/2 = north),
 *  4-connected, in order. */
function arcCells(R: number, a0: number, a1: number): [number, number][] {
  const out: [number, number][] = [];
  const steps = Math.ceil(Math.abs(a1 - a0) * R / 3);
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * i / steps;
    const cx = Math.floor((GATE.x + Math.cos(a) * R) / CELL), cy = Math.floor((GATE.y + Math.sin(a) * R) / CELL);
    const last = out[out.length - 1];
    if (last && last[0] === cx && last[1] === cy) continue;
    if (last && last[0] !== cx && last[1] !== cy) out.push([cx, last[1]]); // keep it 4-connected
    out.push([cx, cy]);
  }
  return out;
}
/** Extends an arc end horizontally (toward the keep) until it meets the fortress wall, so no gap is left. */
function sealEnd(cells: [number, number][], atStart: boolean) {
  const [x0, y0] = atStart ? cells[0] : cells[cells.length - 1];
  if (y0 < 0 || y0 >= MH) return;
  const ext: [number, number][] = [];
  for (let x = x0 - 1; x >= 0 && !cellInFort(x, y0) && ext.length < 8; x--) ext.push([x, y0]);
  if (atStart) cells.unshift(...ext.reverse()); else cells.push(...ext);
}
/** Preset rampart sites (no rng: identical for every seed): the Curtain and the Bulwark, arcs around
 *  the gatehouse whose ends run into the fortress wall (or off the map edge), split into segments. */
function makeWallSites(M: any): WallSite[] {
  const sites: WallSite[] = [];
  const add = (id: string, name: string, cells: [number, number][], line: string) => {
    cells = cells.filter(([x, y]) => x >= 0 && y >= 0 && x < MW && y < MH && !M.reserved[cellIdx(x, y)]);
    if (!cells.length) return;
    for (const [x, y] of cells) M.reserved[cellIdx(x, y)] = 4;
    const x = cells.reduce((a, c) => a + c[0], 0) / cells.length, y = cells.reduce((a, c) => a + c[1], 0) / cells.length;
    sites.push({ id, name, cells, x: (x + 0.5) * CELL, y: (y + 0.5) * CELL, line });
  };
  for (const [R, segs, line] of [[R_CURTAIN, CURTAIN_SEGS, 'curtain'], [R_BULWARK, BULWARK_SEGS, 'bulwark']] as [number, string[][], string][]) {
    const n = segs.length, span = Math.PI / n;
    segs.forEach(([id, name], i) => {
      const cells = arcCells(R, -Math.PI / 2 + i * span, -Math.PI / 2 + (i + 1) * span);
      if (i === 0) sealEnd(cells, true);
      if (i === n - 1) sealEnd(cells, false);
      add(id, name, cells, line);
    });
  }
  return sites;
}
/** Construction plots (2×2 cells). Buildings stand on ordinary plots behind the walls (reserved = 5);
 *  towers stand on top of rampart segments, on a mount plot centred on the segment (`mount` = site id,
 *  reserved = 6 on the cells that are not wall). */
export interface Plot { id: string; cx: number; cy: number; x: number; y: number; front: boolean; mount?: string; }
function makeMounts(M: any): Plot[] {
  const out: Plot[] = [];
  for (const s of M.sites as WallSite[]) {
    const [mx, my] = s.cells[s.cells.length >> 1];
    const cx = mx - 1, cy = my - 1;
    for (let y = cy; y < cy + 2; y++) for (let x = cx; x < cx + 2; x++) if (x >= 0 && y >= 0 && x < MW && y < MH && !M.reserved[cellIdx(x, y)]) M.reserved[cellIdx(x, y)] = 6;
    out.push({ id: 'm_' + s.id, cx, cy, x: (cx + 1) * CELL, y: (cy + 1) * CELL, front: true, mount: s.id });
  }
  return out;
}
/** Building plots: behind the Bulwark, around the gate (nearest first): inside the Curtain and in
 *  the ring between the two walls. Candidates on roads or other reservations are dropped. */
function makePlots(M: any): Plot[] {
  const cand: [number, number][] = [];
  for (const r of [72, 166, 200]) for (let k = 0; k <= 10; k++) for (const sgn of k ? [-1, 1] : [1]) {
    const a = sgn * k * 0.16;
    if (Math.abs(a) > 1.45) continue;
    cand.push([Math.round((GATE.x + Math.cos(a) * r) / CELL - 1), Math.round((GATE.y + Math.sin(a) * r) / CELL - 1)]);
  }
  const out: Plot[] = [];
  for (const [cx, cy] of cand) {
    if (out.length >= 14) break;
    let ok = true;
    for (let y = cy; y < cy + 2; y++) for (let x = cx; x < cx + 2; x++) {
      if (x < 0 || y < 0 || x >= MW || y >= MH) { ok = false; continue; }
      const i = cellIdx(x, y); if (M.road[i] || M.reserved[i] || M.obstacle[i]) ok = false;
    }
    if (!ok) continue;
    for (let y = cy; y < cy + 2; y++) for (let x = cx; x < cx + 2; x++) M.reserved[cellIdx(x, y)] = 5;
    out.push({ id: 'p' + out.length, cx, cy, x: (cx + 1) * CELL, y: (cy + 1) * CELL, front: false });
  }
  return out;
}
export function plotAtCell(cx: number, cy: number): Plot | null {
  if (!G.map || !G.map.plots) return null;
  const res = G.map.reserved[cellIdx(cx, cy)];
  if (res !== 5 && res !== 6 && res !== 4) return null;
  for (const p of G.map.plots) if ((res === 5) !== !!p.mount && cx >= p.cx && cx < p.cx + 2 && cy >= p.cy && cy < p.cy + 2) return p;
  return null;
}
export function siteAtCell(cx: number, cy: number): WallSite | null {
  if (!G.map || !G.map.sites || G.map.reserved[cellIdx(cx, cy)] !== 4) return null;
  for (const s of G.map.sites) for (const [x, y] of s.cells) if (x === cx && y === cy) return s;
  return null;
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

/** Paints the static ground layer at texel resolution (TEXEL_RES per world px):
 *  dithered soil bands, rounded cobblestones with lit/shaded faces, single-texel
 *  grass blades, pebbles, bones and old battle scars. The renderer draws it at 1/TEXEL_RES. */
export const TERRAIN_RES = 2;
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function paintTerrain(M: any, rng: Rng): HTMLCanvasElement {
  const T = TERRAIN_RES, th = M.theme, TW = WW * T, TH = WH * T;
  const [c, ctx] = makeCanvas(TW, TH);
  const img = ctx.createImageData(TW, TH), d = img.data;
  const n1 = valueNoise(M.seed + 1), n2 = valueNoise(M.seed + 2), n3 = valueNoise(M.seed + 3), n4 = valueNoise(M.seed + 4);
  const g = th.ground.map(hexToRgb);
  const order = [g[3], g[0], g[1], g[2]];
  // soil: 4 tones with Bayer-dithered transitions (no salt-and-pepper noise)
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
    const wx = x / T, wy = y / T;
    let v = n1(wx / 60, wy / 60) * 0.62 + n2(wx / 14, wy / 14) * 0.28 + n3(wx / 4, wy / 4) * 0.16;
    v += (BAYER4[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 0.09;
    const band = v < 0.43 ? 0 : v < 0.6 ? 1 : v < 0.77 ? 2 : 3;
    const col = order[band];
    // faint large-scale moisture tint
    const wet = n4(wx / 90, wy / 90) > 0.62 ? 0.9 : 1;
    const i = (y * TW + x) * 4;
    d[i] = col[0] * wet; d[i + 1] = col[1] * wet; d[i + 2] = col[2] * wet; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // all coordinates below are in texels
  const R = (x: number, y: number, w: number, h: number, col: string) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };
  // dark erosion patches (stepped ellipses)
  for (let i = 0; i < 90; i++) {
    const x = rng() * TW, y = rng() * TH, r = (6 + rng() * 22) * T;
    for (let yy = -r; yy < r; yy += 1) { const w = Math.sqrt(r * r - yy * yy) * (1.4 + rng() * 0.15); if ((yy | 0) % 2 && rng() < 0.3) continue; R(x - w, y + yy * 0.55, w * 2, 1, 'rgba(10,10,8,0.10)'); }
  }
  // cobbled roads: rounded stones with lit top-left faces and shaded bottom-right
  const st = th.stone, C = CELL * T;
  for (let cy = 0; cy < MH; cy++) for (let cx = 0; cx < MW; cx++) {
    if (!M.road[cellIdx(cx, cy)]) continue;
    const x0 = cx * C, y0 = cy * C;
    R(x0, y0, C, C, shade(th.ground[3], 0.82));
    const edgeL = cx > 0 && !M.road[cellIdx(cx - 1, cy)], edgeR = cx < MW - 1 && !M.road[cellIdx(cx + 1, cy)];
    const edgeT = cy > 0 && !M.road[cellIdx(cx, cy - 1)], edgeB = cy < MH - 1 && !M.road[cellIdx(cx, cy + 1)];
    let yy = 0;
    while (yy < C) {
      const rh = 6 + Math.floor(rng() * 5); let xx = -Math.floor(rng() * 6);
      while (xx < C) {
        const rw = 8 + Math.floor(rng() * 7);
        const edge = (xx < 4 && edgeL) || (xx > C - 10 && edgeR) || (yy < 4 && edgeT) || (yy > C - 10 && edgeB);
        if (rng() < (edge ? 0.35 : 0.8)) {
          const sx = Math.max(0, xx), sw = Math.min(rw - 2, C - sx), sh = Math.min(rh - 2, C - yy);
          if (sw > 2 && sh > 2) stone(x0 + sx, y0 + yy, sw, sh, shade(st, 0.55 + rng() * 0.38));
        }
        xx += rw;
      }
      yy += rh;
    }
  }
  function stone(x: number, y: number, w: number, h: number, tone: string) {
    R(x + 1, y, w - 2, h, tone); R(x, y + 1, w, h - 2, tone);              // rounded body
    R(x + 1, y, w - 2, 1, shade(tone, 1.22)); R(x, y + 1, 1, h - 3, shade(tone, 1.12)); // lit edges
    R(x + 1, y + h - 1, w - 2, 1, shade(tone, 0.62)); R(x + w - 1, y + 2, 1, h - 3, shade(tone, 0.72)); // shade
    if (w > 8 && rng() < 0.35) R(x + 2 + Math.floor(rng() * (w - 5)), y + 2 + Math.floor(rng() * (h - 4)), 2, 1, shade(tone, 0.8)); // pit
  }
  // dead grass: tufts of 1-texel blades that lean, with lit tips
  const gc = th.grass;
  for (let i = 0; i < 9000; i++) {
    const x = rng() * TW, y = rng() * TH;
    const cx = Math.floor(x / C), cy = Math.floor(y / C);
    if (M.road[cellIdx(cx, cy)] || M.reserved[cellIdx(cx, cy)] === 2) continue;
    if (n1(x / T / 40 + 9, y / T / 40 + 3) < 0.45 && rng() < 0.85) continue;
    const blades = 4 + Math.floor(rng() * 7), lean = (rng() - 0.5) * 0.6;
    R(x - blades, y + 1, blades * 2, 1, 'rgba(0,0,0,0.28)');
    for (let s = 0; s < blades; s++) {
      const bx = x + (s - blades / 2) * 1.4 + (rng() - 0.5) * 2, h = 3 + Math.floor(rng() * 9);
      const col = gc[Math.floor(rng() * gc.length)];
      for (let k = 0; k < h; k++) R(bx + lean * k, y - k, 1, 1, k > h - 3 ? shade(col, 1.18) : k < 2 ? shade(col, 0.7) : col);
    }
  }
  // pebbles and loose rocks
  for (let i = 0; i < 700; i++) {
    const x = rng() * TW, y = rng() * TH, w = 3 + Math.floor(rng() * 9), h = 2 + Math.floor(rng() * 5), tone = shade(st, 0.6 + rng() * 0.4);
    R(x + 1, y + h, w, 1, 'rgba(0,0,0,0.4)');
    R(x + 1, y, w - 2, h, tone); R(x, y + 1, w, h - 2, tone);
    R(x + 1, y, Math.max(1, w - 3), 1, shade(tone, 1.25)); R(x + w - 1, y + 1, 1, Math.max(1, h - 2), shade(tone, 0.7));
  }
  // old blood
  for (let i = 0; i < 420; i++) { const x = rng() * TW, y = rng() * TH; R(x, y, 1 + Math.floor(rng() * 3), 1 + (rng() < 0.4 ? 1 : 0), rng() < 0.6 ? '#7a1a16' : '#4e100e'); }
  // bones, skulls, broken blades, rubble
  for (let i = 0; i < 320; i++) {
    const x = rng() * TW, y = rng() * TH, t = rng();
    R(x - 1, y + 4, 12, 1, 'rgba(0,0,0,0.3)');
    if (t < 0.4) { R(x + 1, y + 1, 8, 2, PAL.boneD); R(x + 1, y + 1, 8, 1, PAL.bone); R(x - 1, y, 3, 4, PAL.bone); R(x + 8, y, 3, 4, PAL.bone); R(x - 1, y + 3, 3, 1, PAL.boneD); R(x + 8, y + 3, 3, 1, PAL.boneD); }
    else if (t < 0.6) { R(x + 1, y, 6, 6, PAL.bone); R(x, y + 1, 8, 4, PAL.bone); R(x + 1, y, 5, 1, '#efe8d4'); R(x + 1, y + 2, 2, 2, '#14100c'); R(x + 5, y + 2, 2, 2, '#14100c'); R(x + 2, y + 6, 4, 1, PAL.boneD); R(x + 7, y + 3, 1, 3, PAL.boneD); }
    else if (t < 0.8) { R(x, y, 14, 1, '#9aa0a6'); R(x, y + 1, 14, 1, '#5e6268'); R(x - 2, y - 2, 2, 5, '#5a4a30'); R(x - 3, y, 4, 1, '#8a6a3a'); }
    else { R(x, y, 7, 6, '#4a4040'); R(x + 1, y + 1, 4, 3, '#6a6060'); R(x + 6, y + 1, 1, 5, '#2e2828'); }
  }
  // fallen soldiers' remains
  for (let i = 0; i < 22; i++) {
    const x = rng() * TW, y = rng() * TH;
    for (let k = 0; k < 30; k++) R(x + (rng() - 0.5) * 40, y + (rng() - 0.5) * 18, 2 + rng() * 5, 1 + (rng() < 0.3 ? 1 : 0), rng() < 0.5 ? '#3a0c0a' : '#2a0808');
    R(x - 12, y - 2, 26, 6, '#3c2a24'); R(x - 12, y - 2, 26, 1, '#5a3a30'); R(x - 12, y + 3, 26, 1, '#24180f'); R(x + 10, y - 4, 8, 8, '#6a4a3a'); R(x + 11, y - 4, 6, 1, '#8a6a52');
  }
  // scorched craters
  for (let i = 0; i < 8; i++) {
    const x = (300 + rng() * (WW - 380)) * T, y = (50 + rng() * (WH - 100)) * T, len = (14 + rng() * 14) * T;
    for (let yy = -12; yy < 12; yy++) {
      const w = (Math.sqrt(144 - yy * yy) * len) / 12;
      for (let xx = -w; xx < w; xx++) {
        const edge = Math.abs(xx) > w - 6 || yy < -8 || yy > 7;
        if (edge && rng() < 0.5) continue;
        R(x + xx + yy * 1.2, y + yy, 1, 1, yy < -6 ? (rng() < 0.5 ? '#1e1814' : '#16110e') : yy < 6 ? (rng() < 0.12 ? '#2a0c0a' : '#100b09') : rng() < 0.5 ? '#4a2618' : '#3a1e14');
      }
    }
  }
  return c;
}

// ---------------- flow field ----------------
/** Terrain obstacle or a standing blocking structure (walls): diagonal moves may not squeeze past it. */
function solidAt(M: any, i: number) { const s = M.struct[i]; return M.obstacle[i] || (s && s.blocks && !s.dead); }
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
        if (k >= 4 && (solidAt(M, cellIdx(x + DX[k], y)) || solidAt(M, cellIdx(x, y + DY[k])))) continue; // no corner-cutting past walls
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
    if (ox && oy && (solidAt(M, cellIdx(x + ox, y)) || solidAt(M, cellIdx(x, y + oy)))) continue;
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

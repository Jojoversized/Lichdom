// Keep defences (v0.12): the Phylactery web grants SLOTS; between waves you choose which towers stand on
// which rampart sections, free of charge (demolish one to move it). Towers knocked down during a wave
// lie in ruins and rise again when the wave is repelled. Necropolis buildings owned on the web stand on
// their own fixed foundations from the start of every siege.
// Pure simulation: no Phaser, no DOM.
import { G } from '../core/state';
import { CELL } from '../config/constants';
import { TOWERS } from '../data/towers';
import { BUILDINGS, BUILDING_ORDER } from '../data/buildings';
import { Plot } from '../world/mapgen';
import { siteById, siteTier, buildSite } from './ramparts';
import { siteAtCell, canBuildAt } from '../world/mapgen';
import { FORTS } from '../data/towers';
import { KEEPS } from '../data/world';
import { placeTower, placeFort, removeStructure } from './combat';
import { bld, metaLv, towerSlots, towerTier, towerKnown, trapSlots, fortKnown } from './stats';
export { bld };
import { msg, sfx } from '../core/events';
import { anPick } from './analytics';

export function plotById(id: string): Plot | null {
  if (id && id.startsWith('m_')) { const [, x, y] = id.split('_'); return mountPlot(+x, +y); }
  return (G.map && G.map.plots || []).find((p: Plot) => p.id === id) || null;
}
// ---------------- tower mounts (any section of a built rampart) ----------------
/** Mount plot for a wall cell (no checks): the tower stands on that cell. */
function mountPlot(cx: number, cy: number): Plot | null {
  const s = siteAtCell(cx, cy);
  return s ? { id: `m_${cx}_${cy}`, cx: cx - 1, cy: cy - 1, x: cx * CELL + 8, y: cy * CELL + 8, front: true, mount: s.id } : null;
}
/** Towers (or their ruins) standing on wall cells, as cell coordinates. */
function mountedCells(): [number, number][] {
  const out: [number, number][] = [];
  for (const t of G.towers) if (t.mount && !t.dead) out.push([t.cx + 1, t.cy + 1]);
  for (const id in (G.run && G.run.ruins) || {}) if (id.startsWith('m_')) { const [, x, y] = id.split('_'); out.push([+x, +y]); }
  return out;
}
/** A tower may stand on any section of a BUILT rampart, two cells or more from another tower. */
export function mountAt(cx: number, cy: number): Plot | null {
  const p = mountPlot(cx, cy);
  if (!p || !mountReady(p)) return null;
  for (const [x, y] of mountedCells()) if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) < 2) return null;
  return p;
}
/** Every wall cell a tower could be placed on right now. */
export function mountCells(): Plot[] {
  const out: Plot[] = [];
  for (const s of (G.map && G.map.sites) || []) if (siteTier(s) > 0) for (const [x, y] of s.cells) { const p = mountAt(x, y); if (p) out.push(p); }
  return out;
}
/** What stands on a plot: a tower entity, a building entity, a ruin record, or nothing. */
export function plotContent(p: Plot): { tower?: any; building?: any; ruin?: any } {
  const tower = G.towers.find((t: any) => t.plot === p.id && !t.dead);
  if (tower) return { tower };
  const building = G.buildings.find((b: any) => b.plot === p.id);
  if (building) return { building };
  const ruin = G.run && G.run.ruins && G.run.ruins[p.id];
  return ruin ? { ruin } : {};
}
export function plotFree(p: Plot) { const c = plotContent(p); return !c.tower && !c.building && !c.ruin; }

export function hasBuilding(id: string) { return bld(id) > 0; }

// ---------------- towers ----------------
/** Towers standing or lying in ruins: each takes one of the web's tower slots. */
export function towersPlaced() { return G.towers.filter((t: any) => !t.dead).length + Object.keys((G.run && G.run.ruins) || {}).length; }
export function towerSlotsFree() { return Math.max(0, towerSlots() - towersPlaced()); }
/** A tower mount is usable once its rampart segment is built. */
export function mountReady(p: Plot): boolean { if (!p.mount) return false; const s = siteById(p.mount); return !!s && siteTier(s) > 0; }
export function constructTower(type: string, p: Plot, quiet = false): any {
  const fail = (m: string) => { if (!quiet) { msg(m, '#c8b890'); sfx('error'); } return null; };
  if (G.phase !== 'prep') return fail('Defences are placed between waves.');
  if (!towerKnown(type)) return fail('That tower has not been unlocked on the Phylactery web.');
  if (!plotFree(p)) return fail('Something already stands there.');
  if (!mountReady(p)) return fail(p.mount ? 'Raise this rampart first: towers stand on top of built walls.' : 'Towers stand on the ramparts.');
  if (towerSlotsFree() <= 0) return fail(towerSlots() ? `All ${towerSlots()} tower slots are in use: demolish a tower to move it, or deepen Spire Foundations on the web.` : 'No tower slots yet: unlock Spire Foundations on the Phylactery web.');
  const t = placeTower(type, p.cx, p.cy, towerTier(), { plot: p.id }); anPick('tower', type);
  if (t.tier === 2) G.stats.evolved = true;
  G.stats.maxTowers = Math.max(G.stats.maxTowers, G.towers.length);
  if (!quiet) sfx('build');
  return t;
}
/** Demolishing is free and frees the slot (between waves only). */
export function demolishTower(t: any) { if (G.phase !== 'prep') { msg('Defences are moved between waves.', '#c8b890'); sfx('error'); return false; } removeStructure(t); sfx('crumble'); return true; }
/** Called when a tower falls in battle: it leaves a ruin that rises again after the wave. */
export function ruinTower(t: any) { if (!t.plot) return; G.run.ruins[t.plot] = { type: t.type, tier: t.tier, mode: t.mode, kills: t.kills }; }
export function rebuildRuins(): number {
  const r = G.run; let n = 0;
  for (const id in r.ruins) {
    const p = plotById(id), ru = r.ruins[id]; delete r.ruins[id];
    if (!p) continue;
    const t = placeTower(ru.type, p.cx, p.cy, ru.tier, { plot: id }); t.mode = ru.mode || 'first'; t.kills = ru.kills || 0; n++;
  }
  return n;
}

// ---------------- buildings ----------------
export function spawnBuilding(type: string, p: Plot, tier: number) {
  const b: any = { kind: 'building', id: 'b' + p.id, type, tier, plot: p.id, cx: p.cx, cy: p.cy, x: (p.cx + 1) * CELL, y: (p.cy + 1) * CELL + 6, dead: false, hp: 1, maxHp: 1, team: 'u' };
  G.buildings.push(b);
  return b;
}
/** The fixed foundation of each building (always the same spot in the bailey). */
export function buildingPlot(type: string): Plot | null { const plots = (G.map && G.map.plots) || []; return plots[BUILDING_ORDER.indexOf(type)] || null; }
/** Raises every Necropolis building owned on the web (called when a siege begins). */
export function raiseBuildings() {
  const r = G.run; r.buildings = {};
  for (const b of BUILDING_ORDER) {
    const lv = Math.min(3, metaLv('b_' + b)), p = buildingPlot(b);
    if (!lv || !p || !BUILDINGS[b]) continue;
    r.buildings[p.id] = { type: b, tier: lv - 1 };
    spawnBuilding(b, p, lv - 1);
  }
}

// ---------------- traps and barricades ----------------
export function trapsPlaced() { return G.forts.filter((f: any) => !f.site && !f.dead).length; }
export function trapSlotsFree() { return Math.max(0, trapSlots() - trapsPlaced()); }
export function placeTrap(type: string, cx: number, cy: number, quiet = false): any {
  const fail = (m: string) => { if (!quiet) { msg(m, '#c8b890'); sfx('error'); } return null; };
  if (G.phase !== 'prep') return fail('Defences are placed between waves.');
  if (!FORTS[type] || type === 'wall' || !fortKnown(type)) return fail('That trap has not been unlocked on the Phylactery web.');
  if (trapSlotsFree() <= 0) return fail(trapSlots() ? `All ${trapSlots()} trap slots are in use.` : 'No trap slots yet: unlock Trapworks on the Phylactery web.');
  if (!canBuildAt(cx, cy, 1, 1)) return quiet ? null : (sfx('error'), null);
  const f = placeFort(type, cx, cy);
  if (!quiet) sfx('build');
  return f;
}
export function removeTrap(f: any) { if (G.phase !== 'prep') { msg('Defences are moved between waves.', '#c8b890'); sfx('error'); return false; } removeStructure(f); sfx('crumble'); return true; }

// ---------------- remembered layouts ----------------
/** The defences standing now (ruins count as standing). Taken when a wave starts: it is what gets mended
 *  after the wave, and what is raised again the next time you besiege this keep. */
export function snapshotLayout() {
  const r = G.run;
  const towers = G.towers.filter((t: any) => t.plot && !t.dead).map((t: any) => ({ type: t.type, plot: t.plot, mode: t.mode }));
  for (const id in r.ruins) towers.push({ type: r.ruins[id].type, plot: id, mode: r.ruins[id].mode });
  return {
    walls: (G.map.sites || []).filter((s: any) => siteTier(s) > 0).map((s: any) => s.id),
    towers,
    traps: G.forts.filter((f: any) => !f.site && !f.dead).map((f: any) => ({ type: f.type, cx: f.cx, cy: f.cy })),
  };
}
export function rememberLayout() { const L = snapshotLayout(); G.run.layout = L; G.meta.layout[KEEPS[G.run.keep].id] = L; }
/** Raises whatever of a layout is missing, within the web's slots. Returns how many pieces were raised. */
export function applyLayout(L: any): number {
  if (!L) return 0;
  let n = 0;
  for (const id of L.walls || []) { const s = siteById(id); if (s && !siteTier(s) && buildSite(s, true)) n++; }
  for (const t of L.towers || []) { const p = plotById(t.plot); if (p && plotFree(p) && mountAt(p.cx + 1, p.cy + 1)) { const made = constructTower(t.type, p, true); if (made) { made.mode = t.mode || 'first'; n++; } } }
  for (const f of L.traps || []) { if (placeTrap(f.type, f.cx, f.cy, true)) n++; }
  return n;
}

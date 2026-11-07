// Keep construction (v0.6): towers and buildings on the fixed plots around the keep, paid with
// MATERIALS. Towers knocked down during a wave lie in ruins on their plot and rise again when
// the wave is repelled. Buildings are permanent and give bonuses to every undead.
// Pure simulation: no Phaser, no DOM.
import { G } from '../core/state';
import { CELL } from '../config/constants';
import { TOWERS } from '../data/towers';
import { UNITS } from '../data/units';
import { BUILDINGS, TOWER_MAT, baseMaterialsIncome } from '../data/buildings';
import { Plot } from '../world/mapgen';
import { siteById, siteTier } from './ramparts';
import { siteAtCell } from '../world/mapgen';
import { placeTower, removeStructure, spawnUnit } from './combat';
import { towerMaxHp, recalcAllStats, recalcKeep, bld } from './stats';
export { bld };
import { msg, sfx } from '../core/events';

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

export function materialsIncome(wave: number, boss: boolean) { return baseMaterialsIncome(wave, boss) + bld('quarry'); }

// ---------------- towers ----------------
export function towerMatCost(type: string, tier = 0) { return TOWER_MAT[type][tier]; }
export function constructTower(type: string, p: Plot): any {
  const r = G.run, cost = towerMatCost(type, 0);
  if (!plotFree(p)) { sfx('error'); return null; }
  if (!mountReady(p)) { msg(p.mount ? 'Raise this rampart first: towers stand on top of built walls.' : 'Towers stand on the ramparts; foundations behind the walls are for buildings.', '#c8b890'); sfx('error'); return null; }
  if (r.materials < cost) { msg('Not enough materials.', '#ff8080'); sfx('error'); return null; }
  r.materials -= cost;
  const t = placeTower(type, p.cx, p.cy, 0, { plot: p.id, matInvested: cost });
  sfx('build');
  return t;
}
/** A tower mount is usable once its rampart segment is built. */
export function mountReady(p: Plot): boolean { if (!p.mount) return false; const s = siteById(p.mount); return !!s && siteTier(s) > 0; }
export function towerUpgradeCost(t: any) { const c = TOWER_MAT[t.type][t.tier + 1]; return c == null ? 0 : c; }
export function upgradeTowerMat(t: any): boolean {
  const r = G.run, next = TOWERS[t.type].tiers[t.tier + 1];
  if (!next) return false;
  const cost = towerUpgradeCost(t);
  if (r.materials < cost) { msg('Not enough materials.', '#ff8080'); sfx('error'); return false; }
  r.materials -= cost; t.tier++; t.matInvested = (t.matInvested || 0) + cost;
  const old = t.maxHp; t.maxHp = towerMaxHp(t); t.hp += t.maxHp - old;
  if (t.tier === 2) G.stats.evolved = true;
  msg(`${next.name} awakens.`, '#5dff7a'); sfx('levelup');
  return true;
}
/** Demolish refunds half the materials invested. */
export function demolishTower(t: any) { G.run.materials += Math.floor((t.matInvested || towerMatCost(t.type)) * 0.5); removeStructure(t); sfx('crumble'); }
/** Called when a tower falls in battle: it leaves a ruin that rises again after the wave. */
export function ruinTower(t: any) { if (!t.plot) return; G.run.ruins[t.plot] = { type: t.type, tier: t.tier, mat: t.matInvested || 0, mode: t.mode, kills: t.kills }; }
export function rebuildRuins(): number {
  const r = G.run; let n = 0;
  for (const id in r.ruins) {
    const p = plotById(id), ru = r.ruins[id]; delete r.ruins[id];
    if (!p) continue;
    const t = placeTower(ru.type, p.cx, p.cy, ru.tier, { plot: id, matInvested: ru.mat }); t.mode = ru.mode || 'first'; t.kills = ru.kills || 0; n++;
  }
  return n;
}

// ---------------- buildings ----------------
export function buildingCost(type: string, tier: number) { return BUILDINGS[type].cost[tier]; }
export function spawnBuilding(type: string, p: Plot, tier: number) {
  const b: any = { kind: 'building', id: 'b' + p.id, type, tier, plot: p.id, cx: p.cx, cy: p.cy, x: (p.cx + 1) * CELL, y: (p.cy + 1) * CELL + 6, dead: false, hp: 1, maxHp: 1, team: 'u' };
  G.buildings.push(b);
  return b;
}
export function constructBuilding(type: string, p: Plot): any {
  const r = G.run, cost = buildingCost(type, 0);
  if (!plotFree(p) || hasBuilding(type) || p.mount) { if (p.mount) msg('Rampart mounts carry towers; buildings stand on the foundations behind the walls.', '#c8b890'); sfx('error'); return null; }
  if (r.materials < cost) { msg('Not enough materials.', '#ff8080'); sfx('error'); return null; }
  r.materials -= cost;
  r.buildings[p.id] = { type, tier: 0 };
  const b = spawnBuilding(type, p, 0);
  onBuildingChanged(type, 1);
  msg(`${BUILDINGS[type].name} raised: ${BUILDINGS[type].per}.`, '#e8d8a8'); sfx('build');
  return b;
}
export function buildingUpgradeCost(b: any) { const c = BUILDINGS[b.type].cost[b.tier + 1]; return c == null ? 0 : c; }
export function upgradeBuilding(b: any): boolean {
  const r = G.run, cost = buildingUpgradeCost(b);
  if (!cost) return false;
  if (r.materials < cost) { msg('Not enough materials.', '#ff8080'); sfx('error'); return false; }
  r.materials -= cost; b.tier++; r.buildings[b.plot].tier = b.tier;
  onBuildingChanged(b.type, 1);
  msg(`${BUILDINGS[b.type].tiers[b.tier]} completed.`, '#e8d8a8'); sfx('levelup');
  return true;
}
/** Applies a building's effect to everything already on the field (future undead read it from stats). */
function onBuildingChanged(type: string, levels: number) {
  if (type === 'barracks') {
    // every squad already bought gains its extra body now
    const r = G.run;
    for (const u in r.bought) { if (!UNITS[u]) continue; for (let i = 0; i < r.bought[u] * levels; i++) spawnUnit(u, 190 + Math.random() * 40, 300 + Math.random() * 60, {}); }
  }
  recalcAllStats();
  recalcKeep();
  for (const t of G.towers) { const old = t.maxHp; t.maxHp = towerMaxHp(t); t.hp += t.maxHp - old; }
}

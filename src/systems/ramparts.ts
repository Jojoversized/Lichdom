// Ramparts: walls live on preset sites (see mapgen `makeWallSites`: the Curtain and the Bulwark
// around the gate). v0.12: the web's Ramparts node grants a number of segments per siege; between
// waves you choose which sites are raised (free; level one to move it). They are raised at the tier
// bought on the web (Bone Palisade → Stone Wall → Bone Rampart) and breaches are mended after every
// wave. A built segment can carry towers. Pure simulation: no Phaser, no DOM.
import { G } from '../core/state';
import { WALL_TIERS } from '../data/towers';
import { cellIdx, WallSite } from '../world/mapgen';
import { placeFort, removeStructure } from './combat';
import { fortMaxHp, wallSlots, wallTier } from './stats';
import { msg, sfx } from '../core/events';
import { anPick } from './analytics';

export function siteById(id: string): WallSite | null { return (G.map && G.map.sites || []).find((s: WallSite) => s.id === id) || null; }
export function siteTier(site: WallSite): number { return (G.run && G.run.walls && G.run.walls[site.id]) || 0; }
export function siteWalls(site: WallSite): any[] { return G.forts.filter((f: any) => f.site === site.id && !f.dead); }
/** Missing durability (destroyed sections count as fully missing), 0..1. */
export function siteDamage(site: WallSite): number {
  if (!siteTier(site)) return 0;
  let miss = 0;
  for (const [x, y] of site.cells) { const f = G.map.struct[cellIdx(x, y)]; miss += f && f.site === site.id && !f.dead ? 1 - f.hp / f.maxHp : 1; }
  return miss / site.cells.length;
}
export function siteHp(site: WallSite): [number, number] {
  let hp = 0, max = 0;
  for (const f of siteWalls(site)) { hp += f.hp; max += f.maxHp; }
  const per = max / Math.max(1, siteWalls(site).length);
  return [hp, per * site.cells.length];
}

export function sitesBuilt() { return ((G.map && G.map.sites) || []).filter((s: WallSite) => siteTier(s) > 0).length; }
export function wallSlotsFree() { return Math.max(0, wallSlots() - sitesBuilt()); }
/** Raises every missing section of a site at its current tier and heals the rest. */
export function restore(site: WallSite) {
  const t = siteTier(site);
  for (const [x, y] of site.cells) {
    const s = G.map.struct[cellIdx(x, y)];
    if (s && !s.dead) { if (s.site === site.id) { s.wtier = t; s.maxHp = fortMaxHp(s); s.hp = s.maxHp; } continue; }
    placeFort('wall', x, y, { site: site.id, wtier: t });
  }
  G.map.dirty = true;
}
/** Raise a rampart segment (uses one of the web's segment slots). */
export function buildSite(site: WallSite, quiet = false): boolean {
  const fail = (m: string) => { if (!quiet) { msg(m, '#c8b890'); sfx('error'); } return false; };
  if (G.phase !== 'prep') return fail('Defences are placed between waves.');
  if (siteTier(site) > 0) return fail('This rampart already stands.');
  if (wallSlotsFree() <= 0) return fail(wallSlots() ? `All ${wallSlots()} rampart segments are raised: level one to move it, or deepen Ramparts on the web.` : 'No ramparts yet: unlock Ramparts on the Phylactery web.');
  G.run.walls[site.id] = wallTier(); anPick('wall', site.id, { tier: wallTier() });
  restore(site);
  if (!quiet) sfx('build');
  return true;
}
/** Level a segment (and any towers on it) to free its slot. */
export function razeSite(site: WallSite): boolean {
  if (G.phase !== 'prep') { msg('Defences are moved between waves.', '#c8b890'); sfx('error'); return false; }
  if (!siteTier(site)) return false;
  for (const t of G.towers.slice()) if (t.plot && t.plot.startsWith('m_') && site.cells.some(([x, y]) => t.plot === `m_${x}_${y}`)) removeStructure(t);
  for (const id in G.run.ruins) if (site.cells.some(([x, y]) => id === `m_${x}_${y}`)) delete G.run.ruins[id];
  for (const f of siteWalls(site)) removeStructure(f);
  delete G.run.walls[site.id];
  G.map.dirty = true; sfx('crumble');
  return true;
}
/** After a wave every breach is mended for free. */
export function mendRamparts(): number {
  let n = 0;
  for (const s of (G.map && G.map.sites) || []) if (siteTier(s) > 0) { if (siteDamage(s) > 0.001) n++; restore(s); }
  return n;
}

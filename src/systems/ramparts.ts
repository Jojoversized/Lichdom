// Ramparts: walls live on preset sites (see mapgen `makeWallSites`). A site is built and
// upgraded as a whole (Bone Palisade → Stone Wall → Bone Rampart); destroyed sections stay
// rubble until the site is repaired. Pure simulation: no Phaser, no DOM.
import { G } from '../core/state';
import { WALL_TIERS, WALL_MAX_TIER } from '../data/towers';
import { cellIdx, WallSite } from '../world/mapgen';
import { placeFort } from './combat';
import { fortMaxHp } from './stats';
import { msg, sfx } from '../core/events';

export function siteById(id: string): WallSite | null { return (G.map && G.map.sites || []).find((s: WallSite) => s.id === id) || null; }
export function siteTier(site: WallSite): number { return (G.run && G.run.walls && G.run.walls[site.id]) || 0; }
export function siteWalls(site: WallSite): any[] { return G.forts.filter((f: any) => f.site === site.id && !f.dead); }
const inflation = () => Math.pow(1.045, Math.max(0, (G.run ? G.run.wave : 0)));
export function siteTierCost(site: WallSite, tier: number): number { return Math.round(site.cells.length * WALL_TIERS[tier].cell * inflation()); }
export function siteUpgradeCost(site: WallSite): number { const t = siteTier(site); return t >= WALL_MAX_TIER ? 0 : siteTierCost(site, t + 1); }
/** Missing durability (destroyed sections count as fully missing), 0..1. */
export function siteDamage(site: WallSite): number {
  if (!siteTier(site)) return 0;
  let miss = 0;
  for (const [x, y] of site.cells) { const f = G.map.struct[cellIdx(x, y)]; miss += f && f.site === site.id && !f.dead ? 1 - f.hp / f.maxHp : 1; }
  return miss / site.cells.length;
}
export function siteRepairCost(site: WallSite): number { const t = siteTier(site); return t ? Math.ceil(siteDamage(site) * siteTierCost(site, t) * 0.5) : 0; }
export function siteHp(site: WallSite): [number, number] {
  let hp = 0, max = 0;
  for (const f of siteWalls(site)) { hp += f.hp; max += f.maxHp; }
  const per = max / Math.max(1, siteWalls(site).length);
  return [hp, per * site.cells.length];
}

/** Raises every missing section of a site at its current tier and heals the rest. */
function restore(site: WallSite) {
  const t = siteTier(site);
  for (const [x, y] of site.cells) {
    const s = G.map.struct[cellIdx(x, y)];
    if (s && !s.dead) { if (s.site === site.id) { s.wtier = t; s.maxHp = fortMaxHp(s); s.hp = s.maxHp; } continue; }
    placeFort('wall', x, y, { site: site.id, wtier: t });
  }
  G.map.dirty = true;
}
/** Build (tier 0 → 1) or upgrade a site; the new tier comes fully repaired. */
export function upgradeSite(site: WallSite): boolean {
  const t = siteTier(site);
  if (t >= WALL_MAX_TIER) { msg('This rampart cannot be raised any higher.', '#c8b890'); sfx('error'); return false; }
  const cost = siteUpgradeCost(site);
  if (G.run.souls < cost) { msg('Not enough souls.', '#ff8080'); sfx('error'); return false; }
  G.run.souls -= cost;
  G.run.walls[site.id] = t + 1;
  restore(site);
  sfx('build');
  return true;
}
export function repairSite(site: WallSite): boolean {
  const cost = siteRepairCost(site);
  if (!cost) return false;
  if (G.run.souls < cost) { msg('Not enough souls.', '#ff8080'); sfx('error'); return false; }
  G.run.souls -= cost;
  restore(site);
  sfx('build');
  return true;
}

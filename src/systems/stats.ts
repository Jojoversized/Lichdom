// Derived stats: everything that combines base data, run upgrades,
// fortress bonuses and permanent (meta) upgrades lives here.
import { G } from '../core/state';
import { clamp } from '../core/util';
import { TOWERS, FORTS, WALL_TIERS } from '../data/towers';
import { UNITS } from '../data/units';
import { CONTENT_GATES } from '../data/meta';

export function metaLv(id: string): number { return (G.meta && G.meta.lv[id]) || 0; }
/** Fortress (stronghold) bonus lookup. */
export function fb(k: string): number { return (G.map && G.map.theme.bonus[k]) || 0; }
export function contentAvailable(kind: string, id: string) { const g = CONTENT_GATES[kind][id]; return !g || metaLv(g) > 0; }
export function dtypeMult(dtype: string) {
  if (dtype === 'necro') return 1 + fb('necroDmg');
  if (dtype === 'fire') return 1 + fb('fireDmg');
  if (dtype === 'frost') return 1 + fb('frostDmg');
  return 1;
}
/** Multiplicative "Ascension" bonuses bought repeatedly in the Soul Well. */
/** Keep building level 0..3 (one building of each kind; see data/buildings.ts). */
export function bld(id: string): number { const r = G.run; if (!r || !r.buildings) return 0; for (const k in r.buildings) if (r.buildings[k].type === id) return r.buildings[k].tier + 1; return 0; }
export function ascDmg() { return Math.pow(1.12, G.run.asc.dmg || 0); }
export function ascHp() { return Math.pow(1.12, G.run.asc.hp || 0); }
export function ascSouls() { return Math.pow(1.08, G.run.asc.souls || 0) * (1 + 0.1 * bld('cistern')); }
export function globalDmg() { const r = G.run; return (1 + r.m.dmg + fb('allDmg')) * ascDmg() * (1 + 0.1 * bld('forge')) * warBuff(); }
/** Temporary war buffs from story events (systems/events.ts). */
export function warBuff() { let m = 1; for (const b of (G.run && G.run.rogue && G.run.rogue.buffs) || []) m += b.dmg || 0; return m; }
export function frenzyMult() { return G.frenzyT > 0 ? 1.6 : 1; }

export function towerStats(t: any) {
  const d = TOWERS[t.type], r = G.run, tier = d.tiers[t.tier];
  let tierDmg = 1, tierRange = 1;
  for (let i = 1; i <= t.tier; i++) { tierDmg = d.tiers[i].dmg || tierDmg; tierRange = d.tiers[i].range || tierRange; }
  // towers draw on the keep's growing power (+7%/wave): materials are slow, so a tower must not go stale
  const dmg = d.dmg * tierDmg * (1 + (r.towerDmg[t.type] || 0) + (r.mods.leg_soulfire ? 0.25 : 0)) * globalDmg() * dtypeMult(d.dtype) * Math.pow(1.07, Math.max(0, r.wave - 1));
  let as = (1 + r.m.towerAs + 0.08 * bld('bell')) * frenzyMult();
  if (t.hasteT > 0) as *= 1 + t.haste;
  return { dmg, range: d.range * tierRange * (1 + r.m.range), cd: d.cd / as, name: tier.name };
}
export function towerMaxHp(t: any) {
  const d = TOWERS[t.type];
  let m = 1; for (let i = 1; i <= t.tier; i++) m = d.tiers[i].hp || m;
  return Math.round(d.hp * m * (1 + t.tier * 0.4) * (1 + metaLv('f_tower_hp') * 0.25 + G.run.m.towerHp) * Math.pow(1.05, G.run.wave));
}
export function fortMaxHp(f: any) { return Math.round(f.def.hp * (f.type === 'wall' ? WALL_TIERS[f.wtier || 2].hp : 1) * (1 + metaLv('f_wall') * 0.2 + G.run.m.wallHp + (G.run.mods.leg_bulwark && f.type === 'wall' ? 1 : 0)) * Math.pow(1.05, G.run.wave)); }
/** There is no army cap. Each recruit buys a squad; squad-size upgrades come from
 *  level-up cards (r.m.squad), the Legions meta node and Soul Well Ossuary Expansions. */
export function squadSize(type: string) {
  const r = G.run;
  return Math.max(5, UNITS[type].squad + (r ? (r.m.squad || 0) + (r.asc.squad || 0) + bld('barracks') : 0) + metaLv('m_cap'));
}
/** Incremental costs: a type's price climbs with the souls invested in it, not the number
 *  of squads. A squad's step is ×1.12 per 300 souls of base cost (cheap hordes ~+6%, golems
 *  ~+31%), so late in a run a cheap squad stays cheap relative to an elite one and every
 *  type keeps its value per soul (a flat ×1.12 per squad made elites snowball). */
export function recruitStep(type: string) { return Math.pow(1.12, clamp(UNITS[type].cost / 300, 0.5, 2.4)); }
export function recruitCost(type: string) {
  const n = (G.run.bought && G.run.bought[type]) || 0;
  return Math.round(UNITS[type].cost * Math.pow(recruitStep(type), n) * (1 - metaLv('m_cost') * 0.08));
}
/** Soul value of one body in the host (drives Crusade Fervor). */
export function unitValue(u: any) {
  if (u.temp) return 0;
  if (u.summon) return u.summonValue || 0;
  const d = UNITS[u.type];
  return (d.cost / d.squad) * (1 + (u.tier || 0) * 0.75);
}
export function towerCost(type: string) { let n = 0; for (const t of G.towers) if (t.type === type) n++; return Math.round(TOWERS[type].cost * Math.pow(1.2, n)); }
export function fortCost(type: string) { if (type === 'lava' && fb('freeLava')) return 0; let n = 0; for (const f of G.forts) if (f.type === type) n++; return Math.round(FORTS[type].cost * Math.pow(1.015, n)); }
export function recalcKeep() {
  const old = G.keep.maxHp;
  G.keep.maxHp = Math.round(1500 * (1 + metaLv('f_keep') * 0.15 + G.run.m.keep) * ascHp());
  if (old && G.keep.hp) G.keep.hp = Math.min(G.keep.maxHp, G.keep.hp + Math.max(0, G.keep.maxHp - old));
}

/** Wave strength curve. Grows exponentially (this is an incremental game);
 *  the player keeps pace through evolutions, cards and Soul Well Ascensions. */
export function waveHpMult(n: number) { return Math.pow(1.135, n - 1) * (1 + 0.05 * (n - 1)); }
export function waveDmgMult(n: number) { return Math.pow(1.065, n - 1) * (1 + 0.02 * (n - 1)); }
export function bountyMult(n: number) { return Math.pow(1.08, n - 1); }

/** Crusade Fervor: a fixed schedule that rises with the wave number only. It no longer
 *  reacts to the size or strength of your host, so every upgrade and squad you add is a
 *  real gain over the crusade. +3% enemy health per wave (compounding) (damage scales with its root). */
export function computeFervor(wave = G.run ? G.run.wave : 1) {
  return Math.pow(FERVOR_GROWTH, Math.max(0, wave - 1));
}
export const FERVOR_GROWTH = 1.03;

export function applyUnitStats(u: any) {
  const r = G.run;
  if (u.summon) return;
  const d = UNITS[u.type], tier = r.unitTier[u.type] || 0;
  const m: any = { hp: 1, dmg: 1, armor: 0, range: 1, spd: 1, splash: 1, raiser: 1 };
  for (let i = 1; i <= tier; i++) { const t = d.tiers[i]; for (const k in t) if (typeof t[k] === 'number' && k !== 'cost') m[k] = t[k]; }
  const hpMult = m.hp * (1 + r.m.unitHp + metaLv('n_hp') * 0.1 + fb('unitHp') + (r.unitBuff[u.type] || 0)) * ascHp() * (1 + 0.12 * bld('vault'));
  const newMax = Math.round(d.hp * hpMult * (u.raisedMult || 1));
  if (u.maxHp) u.hp = Math.max(1, u.hp + (newMax - u.maxHp)); else u.hp = newMax;
  u.maxHp = newMax;
  u.dmg = d.dmg * m.dmg * (1 + r.m.unitDmg + metaLv('n_dmg') * 0.08 + (r.unitBuff[u.type] || 0)) * globalDmg() * dtypeMult(d.dtype) * (u.raisedMult || 1);
  if (u.type === 'pikeman' && r.mods.pike_wall) u.dmg *= 1.6;
  u.armor = Math.min(0.8, (d.armor || 0) + (tier ? (m.armor || 0) : 0) + (u.type === 'skeleton' && r.mods.skel_shield ? 0.2 : 0));
  u.range = d.range * m.range;
  u.spd = d.spd * m.spd * (1 + r.m.unitSpd);
  u.cd = d.cd / (1 + r.m.unitAs + metaLv('m_as') * 0.06 + 0.08 * bld('bell'));
  u.splash = (d.splash || 0) * m.splash;
  u.raiser = d.raiser ? d.raiser * m.raiser : 0;
  u.tier = tier;
  if (!u.fixedSpr) u.spr = d.tiers[tier].spr;
}
export function recalcAllStats() {
  G.units.forEach(applyUnitStats);
  recalcKeep();
  G.towers.forEach((t: any) => { const nm = towerMaxHp(t); t.hp += Math.max(0, nm - t.maxHp); t.maxHp = nm; });
}

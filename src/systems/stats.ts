// Derived stats: everything that combines base data, run upgrades,
// fortress bonuses and permanent (meta) upgrades lives here.
import { G } from '../core/state';
import { TOWERS, FORTS, WALL_TIERS } from '../data/towers';
import { UNITS } from '../data/units';
import { legionBodies } from '../data/meta';
import { KEEPS, KEEP_HP, KEEP_DMG, KEEP_SOULS, KEEP_ESS, WAVE_HP, WAVE_DMG, WAVE_SOULS, WAVES_PER_KEEP, BASE_HP, BASE_DMG, BASE_SOULS, KEEP_BASE_HP } from '../data/world';

export function metaLv(id: string): number { return (G.meta && G.meta.lv[id]) || 0; }
/** Fortress (stronghold) bonus lookup. */
export function fb(k: string): number { return (G.map && G.map.theme.bonus[k]) || 0; }
export function dtypeMult(dtype: string) {
  if (dtype === 'necro') return 1 + fb('necroDmg');
  if (dtype === 'fire') return 1 + fb('fireDmg');
  if (dtype === 'frost') return 1 + fb('frostDmg');
  return 1;
}
/** Necropolis building level 0..3 (bought on the web; `r.buildings` is filled from it when a siege begins). */
export function bld(id: string): number { const r = G.run; if (!r || !r.buildings) return 0; for (const k in r.buildings) if (r.buildings[k].type === id) return r.buildings[k].tier + 1; return 0; }
/** Boons granted by story events during one siege (×1.12 each). */
export function ascDmg() { return Math.pow(1.12, G.run.asc.dmg || 0); }
export function ascHp() { return Math.pow(1.12, G.run.asc.hp || 0); }
/** Permanent web multipliers. */
export function metaDmg() { return Math.pow(1.12, metaLv('a_emp')); }
export function metaHp() { return Math.pow(1.12, metaLv('a_fort')); }
/** Multiplier on every soul earned (kills, wave bonuses, events). The crusade tier's reward is applied by the caller. */
export function soulMult() { const r = G.run; return (1 + (r ? r.m.souls : 0) + fb('souls')) * Math.pow(1.15, metaLv('s_gain')) * (1 + 0.1 * bld('cistern')) * (metaLv('d_tithe') ? 2 : 1); }
export function essenceMult() { return Math.pow(1.12, metaLv('i_ess')) * (metaLv('d_tithe') ? 1.5 : 1); }
export function globalDmg() { const r = G.run; return (1 + r.m.dmg + fb('allDmg')) * ascDmg() * metaDmg() * (1 + 0.1 * bld('forge')) * warBuff(); }
/** Temporary war buffs from story events (systems/events.ts). */
export function warBuff() { let m = 1; for (const b of (G.run && G.run.rogue && G.run.rogue.buffs) || []) m += b.dmg || 0; return m; }
export function frenzyMult() { return G.frenzyT > 0 ? 1.6 : 1; }
/** Towers and traps draw their strength from the web (Grimoire of Spires). */
export function structPower() { return Math.pow(1.07, metaLv('f_tdmg')); }
export function structHp() { return Math.pow(1.1, metaLv('f_wall')) * (1 + 0.2 * bld('quarry')); }
/** Spells and the Lich's own bolts. */
export function arcanePower() { return Math.pow(1.08, metaLv('a_dmg')); }

// ---------------- keeps: exponential difficulty and rewards ----------------
export function keepIdx(): number { return (G.run && G.run.keep) || 0; }
/** "Tech level" of a wave: which mortals and roads the crusade can field (later keeps start further along). */
export function waveTech(n: number, k = keepIdx()) { return n + k * 5; }
export function waveHpMult(n: number, k = keepIdx()) { return BASE_HP * Math.pow(KEEP_HP, k) * Math.pow(WAVE_HP, n - 1); }
export function waveDmgMult(n: number, k = keepIdx()) { return BASE_DMG * Math.pow(KEEP_DMG, k) * Math.pow(WAVE_DMG, n - 1); }
export function bountyMult(n: number, k = keepIdx()) { return BASE_SOULS * Math.pow(KEEP_SOULS, k) * Math.pow(WAVE_SOULS, n - 1); }
/** Life Essence for repelling wave `n` of keep `k` (before Eternal Hunger and the crusade tier). */
export function waveEssence(n: number, k = keepIdx()) { return Math.pow(KEEP_ESS, k) * (n >= WAVES_PER_KEEP ? 12 : 0.6 + 0.35 * n); }
export function keepUnlocked(k: number) { return k <= ((G.meta && G.meta.keepsCleared) || 0) && k < KEEPS.length; }

export function towerStats(t: any) {
  const d = TOWERS[t.type], r = G.run, tier = d.tiers[t.tier];
  let tierDmg = 1, tierRange = 1;
  for (let i = 1; i <= t.tier; i++) { tierDmg = d.tiers[i].dmg || tierDmg; tierRange = d.tiers[i].range || tierRange; }
  const dmg = d.dmg * tierDmg * (1 + (r.towerDmg[t.type] || 0) + (r.mods.leg_soulfire ? 0.25 : 0)) * globalDmg() * dtypeMult(d.dtype) * structPower();
  let as = (1 + r.m.towerAs + 0.08 * bld('bell')) * frenzyMult();
  if (t.hasteT > 0) as *= 1 + t.haste;
  return { dmg, range: d.range * tierRange * (1 + r.m.range), cd: d.cd / as, name: tier.name };
}
export function towerMaxHp(t: any) {
  const d = TOWERS[t.type];
  let m = 1; for (let i = 1; i <= t.tier; i++) m = d.tiers[i].hp || m;
  return Math.round(d.hp * m * (1 + t.tier * 0.4) * (1 + G.run.m.towerHp) * structHp());
}
export function fortMaxHp(f: any) { return Math.round(f.def.hp * (f.type === 'wall' ? WALL_TIERS[f.wtier || 2].hp : 1) * (1 + G.run.m.wallHp + (G.run.mods.leg_bulwark && f.type === 'wall' ? 1 : 0)) * structHp()); }

// ---------------- the host that rises at the start of a siege ----------------
export function unitOwned(type: string) { return type === 'skeleton' || metaLv('u_' + type) > 0; }
/** Bodies of `type` that rise when a siege begins (web musters, the Endless Host, Barrow Barracks). */
export function musterCount(type: string) {
  if (!unitOwned(type)) return 0;
  return Math.round(legionBodies(type, metaLv('n_' + type)) * (metaLv('d_host') ? 1.5 : 1) * (1 + 0.1 * bld('barracks')));
}
/** Size of a squad raised mid-siege by cards and events (reinforcements). */
export function squadSize(type: string) { return Math.max(3, Math.round(UNITS[type].squad * 0.75)); }
/** Slots for the defences you place before a wave. */
export function wallSlots() { return metaLv('f_walls'); }
export function wallTier() { return 1 + metaLv('f_walltier'); }
export function towerSlots() { return metaLv('f_towers'); }
export function towerTier() { return metaLv('f_ttier'); }
export function trapSlots() { return metaLv('f_traps') * 3 + (metaLv('f_traps') ? fb('trapSlots') : 0); }
export function towerKnown(type: string) { return type === 'necrotic' || metaLv('t_' + type) > 0; }
export function fortKnown(type: string) { const m = FORTS[type].meta; return !m || metaLv(m) > 0; }
/** Soul value of one body in the host (analytics). */
export function unitValue(u: any) {
  if (u.temp || u.summon) return 0;
  const d = UNITS[u.type];
  return (d.cost / d.squad) * (1 + (u.tier || 0) * 0.75);
}
export function hostValue() { let v = 0; for (const u of G.units) v += unitValue(u); return v; }
export function recalcKeep() {
  const old = G.keep.maxHp;
  G.keep.maxHp = Math.round(KEEP_BASE_HP * (1 + G.run.m.keep) * Math.pow(1.08, metaLv('f_keep')) * ascHp() * metaHp());
  if (old && G.keep.hp) G.keep.hp = Math.min(G.keep.maxHp, G.keep.hp + Math.max(0, G.keep.maxHp - old));
}

/** Crusade Fervor (enemy health; damage scales with its root). v0.12: only ZEAL remains — every Holy War
 *  fought in a siege adds a lasting +3.5% (story events can add or remove zeal). The keeps themselves
 *  carry the exponential curve now (data/world.ts). */
export const ZEAL_GROWTH = 1.035;
export function fervorParts(_wave = 1) {
  const zealN = (G.run && G.run.rogue && G.run.rogue.zeal) || 0, zeal = Math.pow(ZEAL_GROWTH, zealN);
  return { zeal, zealN, total: zeal };
}
export function computeFervor(wave = 1) { return fervorParts(wave).total; }

export function applyUnitStats(u: any) {
  const r = G.run;
  if (u.summon) return;
  const d = UNITS[u.type], tier = r.unitTier[u.type] || 0;
  const m: any = { hp: 1, dmg: 1, armor: 0, range: 1, spd: 1, splash: 1, raiser: 1 };
  for (let i = 1; i <= tier; i++) { const t = d.tiers[i]; for (const k in t) if (typeof t[k] === 'number' && k !== 'cost') m[k] = t[k]; }
  // unique cards (v0.9.1): Unholy Covenant scales with the number of undead types raised, Bone Vanguard / Grave Marksmen by role
  const cov = r.mods.covenant ? 0.05 * r.unlockedUnits.length : 0;
  const van = r.mods.vanguard && d.melee ? 0.25 : 0, mark = r.mods.marksmen && d.ranged ? 0.15 : 0;
  const night = metaLv('d_night') ? 2 : 1;
  const hpMult = m.hp * (1 + r.m.unitHp + fb('unitHp') + (r.unitBuff[u.type] || 0) + cov + van) * Math.pow(1.06, metaLv('n_hp')) * ascHp() * metaHp() * night * (1 + 0.12 * bld('vault'));
  const newMax = Math.round(d.hp * hpMult * (u.raisedMult || 1));
  if (u.maxHp) u.hp = Math.max(1, u.hp + (newMax - u.maxHp)); else u.hp = newMax;
  u.maxHp = newMax;
  u.dmg = d.dmg * m.dmg * (1 + r.m.unitDmg + (r.unitBuff[u.type] || 0) + cov + mark) * Math.pow(1.06, metaLv('n_dmg')) * night * globalDmg() * dtypeMult(d.dtype) * (u.raisedMult || 1);
  if (u.type === 'pikeman' && r.mods.pike_wall) u.dmg *= 1.6;
  u.armor = Math.min(0.8, (d.armor || 0) + (tier ? (m.armor || 0) : 0) + (u.type === 'skeleton' && r.mods.skel_shield ? 0.2 : 0) + (van ? 0.1 : 0));
  u.range = d.range * m.range * (mark ? 1.15 : 1);
  u.spd = d.spd * m.spd * (1 + r.m.unitSpd + metaLv('m_spd') * 0.04);
  u.cd = d.cd / (1 + r.m.unitAs + metaLv('m_as') * 0.03 + 0.08 * bld('bell'));
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

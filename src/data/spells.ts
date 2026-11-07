import { PAL } from '../config/constants';

import { SUMMONS, UNITS, UNIT_ORDER } from './units';
// ---------------- Spells ----------------
export const SPELLS: Record<string, any> = {
  deathwave: { name: 'Death Wave', icon: 'deathwave', cd: 18, cost: 0, target: false, dmg: 45, desc: 'An expanding ring of necrotic force from the keep.' },
  raise: { name: 'Raise the Dead', icon: 'raise', cd: 30, cost: 0, target: true, radius: 60, desc: 'All corpses in the area rise as skeleton warriors for 30s.' },
  meteor: { name: 'Meteoric Cataclysm', icon: 'meteor', cd: 25, cost: 20, target: true, radius: 60, dmg: 55, meta: 'a_meteor', desc: 'Calls down a hail of meteors on an area.' },
  prison: { name: 'Soul Prison', icon: 'prison', cd: 22, cost: 0, target: true, radius: 45, meta: 'a_meteor', desc: 'Roots enemies for 4s. Trapped enemies take +25% damage.' },
  time: { name: 'Time Distortion', icon: 'time', cd: 40, cost: 0, target: false, meta: 'a_time', desc: 'All enemies are slowed by 50% for 7s.' },
  blood: { name: 'Blood Harvest', icon: 'blood', cd: 28, cost: 0, target: true, radius: 55, dmg: 28, meta: 'a_time', desc: 'Drains life in an area for 4s. Kills yield double souls.' },
  resurrect: { name: 'Unholy Resurrection', icon: 'resurrect', cd: 45, cost: 30, target: false, meta: 'a_res', desc: 'Revives every unit that fell this wave.' },
  apocalypse: { name: 'Apocalypse', icon: 'apocalypse', cd: 120, cost: 250, target: false, dmg: 500, meta: 'a_apoc', desc: 'Rain fire and necrotic ruin across the entire battlefield.' },
};
export const SPELL_ORDER = ['deathwave', 'raise', 'meteor', 'prison', 'time', 'blood', 'resurrect', 'apocalypse'];

// ---------------- Soul Well ----------------
/** Unlocking a new undead type is a major purchase: it rises with every crypt opened and with the wave. */
/** Souls to unearth a crypt of `type`: scales with how strong (expensive) that undead is, so a cheap
 *  backbone unit (zombies, archers) is a cheap unlock and an elite (golem, wyvern) a dear one; every
 *  crypt opened and every wave adds to it. Without a type: the cheapest crypt still closed. */
export function unearthCost(r: any, type?: string): number {
  if (!type) {
    const locked = UNIT_ORDER.filter(k => !r.unlockedUnits.includes(k));
    return locked.length ? Math.min(...locked.map(k => unearthCost(r, k))) : 0;
  }
  return Math.round((120 + 1.7 * UNITS[type].cost + 250 * (r.unearthed || 0)) * Math.pow(1.07, Math.max(0, r.wave - 1)));
}

export const WELL: any[] = [
  { id: 'asc_dmg', cat: 'Ascension', name: 'Dark Empowerment', icon: 'frenzy', repeat: true, desc: 'Permanently (this campaign) multiply ALL damage by ×1.12. Repeatable.', cost: (r: any) => Math.round(80 * Math.pow(1.42, r.asc.dmg || 0)) },
  { id: 'asc_hp', cat: 'Ascension', name: 'Bone Fortitude', icon: 'shield', repeat: true, desc: 'Multiply undead and keep health by ×1.12. Repeatable.', cost: (r: any) => Math.round(70 * Math.pow(1.42, r.asc.hp || 0)) },
  { id: 'asc_souls', cat: 'Ascension', name: 'Soul Tithe', icon: 'soul', repeat: true, desc: 'Multiply all souls gained by ×1.08. Repeatable.', cost: (r: any) => Math.round(120 * Math.pow(1.55, r.asc.souls || 0)) },
  { id: 'insight', cat: 'Advancement', name: 'Dark Insight', icon: 'level', desc: 'Gain an immediate level-up (choose 1 of 3).', cost: (r: any) => Math.round(60 * Math.pow(1.45, r.insightBuys)) },
  { id: 'mend', cat: 'Reinforcement', name: 'Mend the Dead', icon: 'heal', desc: 'Fully heal all units. Repair walls, towers and 10% keep.', cost: (r: any) => 40 + r.wave * 6 },
  { id: 'revive', cat: 'Reinforcement', name: 'Mass Resurrection', icon: 'raise', desc: 'Resurrect every unit that has fallen this wave, right now.', cost: (r: any) => 60 + r.wave * 5 },
  { id: 'frenzy', cat: 'Reinforcement', name: 'Bloodfrenzy', icon: 'frenzy', desc: '+60% attack speed for all towers and units for 20s.', cost: (r: any) => 50 + r.wave * 5 },
  { id: 'unearth', cat: 'Summoning', name: 'Unearth a Crypt', icon: 'raise', desc: 'Choose an undead type to unlock for recruiting; a full squad of it rises at once. Stronger undead cost more to unearth, and each crypt opened raises every price. Cost shown: the cheapest crypt.', cost: (r: any) => unearthCost(r) },
  { id: 'legion', cat: 'Summoning', name: 'Skeleton Legion', icon: 'raise', summon: 'legion', desc: SUMMONS.legion.desc, cost: (r: any) => Math.round(SUMMONS.legion.cost * Math.pow(1.06, r.wave)) },
  { id: 'wraiths', cat: 'Summoning', name: 'Wraith Swarm', icon: 'soul', summon: 'wraiths', meta: 'n_wraith', desc: SUMMONS.wraiths.desc, cost: (r: any) => Math.round(SUMMONS.wraiths.cost * Math.pow(1.06, r.wave)) },
  { id: 'colossus', cat: 'Summoning', name: 'Bone Colossus', icon: 'skull', summon: 'colossus', desc: SUMMONS.colossus.desc, cost: (r: any) => Math.round(SUMMONS.colossus.cost * Math.pow(1.06, r.wave)) },
  { id: 'abom', cat: 'Summoning', name: 'The Abomination', icon: 'cauldron', summon: 'abom', meta: 's_summon', desc: SUMMONS.abom.desc, cost: (r: any) => Math.round(SUMMONS.abom.cost * Math.pow(1.06, r.wave)) },
  { id: 'devourer', cat: 'Summoning', name: 'Soul Devourer', icon: 'soul', summon: 'devourer', meta: 's_summon', desc: SUMMONS.devourer.desc, cost: (r: any) => Math.round(SUMMONS.devourer.cost * Math.pow(1.06, r.wave)) },
  { id: 'dragon', cat: 'Summoning', name: 'Infernal Dragon', icon: 'meteor', summon: 'dragon', meta: 's_dragon', desc: SUMMONS.dragon.desc, cost: (r: any) => Math.round(SUMMONS.dragon.cost * Math.pow(1.06, r.wave)) },
  { id: 'ward', cat: 'Emergency', name: 'Phylactery Ward', icon: 'shield', desc: 'The keep is invulnerable for 10s.', cost: (r: any) => 90 + r.wave * 4 },
  { id: 'detonate', cat: 'Emergency', name: 'Soul Detonation', icon: 'bomb', desc: 'Massive necrotic blast around the keep.', cost: (r: any) => 110 + r.wave * 6 },
  { id: 'storm', cat: 'Emergency', name: 'Necrotic Storm', icon: 'storm', desc: 'Green lightning strikes enemies across the field for 8s.', cost: (r: any) => 160 + r.wave * 8 },
];


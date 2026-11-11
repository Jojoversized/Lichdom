import { PAL } from '../config/constants';

// ---------------- Fortress environments ----------------
export const FORTRESSES: Record<string, any> = {
  haunted: { name: 'Haunted Barrow', desc: '+15% necrotic damage. +10% unit health.', bonus: { necroDmg: 0.15, unitHp: 0.1 },
    ground: ['#23221f', '#272522', '#2b2925', '#1f1e1b'], grass: ['#4a4f45', '#5d625a', '#3a3f36'], stone: '#55565a', accent: PAL.necro, keepTone: '#3b3b41', windowGlow: PAL.necro, fog: '#9fb0a0', ambient: 0.62 },
  volcanic: { name: 'Volcanic Forge', desc: '+30% fire damage. +4 trap slots.', bonus: { fireDmg: 0.3, trapSlots: 4 },
    ground: ['#2a1f1a', '#2f231d', '#352720', '#241a15'], grass: ['#4a3a30', '#5a3a2a', '#3a2a20'], stone: '#4d4440', accent: PAL.fire, keepTone: '#3e3430', windowGlow: PAL.fire, fog: '#a07060', ambient: 0.6 },
  frozen: { name: 'Frozen Spire', desc: '+30% frost damage. Enemies move 8% slower.', bonus: { frostDmg: 0.3, enemySlow: 0.08 },
    ground: ['#2a2e33', '#30353a', '#363c42', '#25292e'], grass: ['#6a7a84', '#8a9aa4', '#4a5a64'], stone: '#5a636c', accent: PAL.frost, keepTone: '#3e4650', windowGlow: PAL.frost, fog: '#c0d8e8', ambient: 0.55 },
  cathedral: { name: 'Ruined Cathedral', desc: '+25% souls from all sources. +15% XP.', bonus: { souls: 0.25, xp: 0.15 },
    ground: ['#26231f', '#2b2722', '#302b25', '#221f1b'], grass: ['#4a4a3a', '#5a5a48', '#3a3a2c'], stone: '#5c5850', accent: '#7dffb0', keepTone: '#44403a', windowGlow: '#c0ffb0', fog: '#b0a890', ambient: 0.6 },
  abyssal: { name: 'Abyssal Gate', desc: 'Summoned creatures last 50% longer. +10% all damage.', bonus: { summonDur: 0.5, allDmg: 0.1 },
    ground: ['#1f1d24', '#24212a', '#29252f', '#1b1920'], grass: ['#3a3448', '#4a4258', '#2a2436'], stone: '#4a4456', accent: PAL.arcane, keepTone: '#363040', windowGlow: PAL.arcane, fog: '#8a7aa8', ambient: 0.66 },
  dawn: { name: 'Gates of Dawn', desc: 'The threshold of heaven itself. +10% all damage, +10% unit health, +15% souls.', bonus: { allDmg: 0.1, unitHp: 0.1, souls: 0.15 },
    ground: ['#2b2820', '#302c23', '#353126', '#26231c'], grass: ['#6a6448', '#807a58', '#4a4634'], stone: '#6a6658', accent: '#ffd75a', keepTone: '#48443a', windowGlow: '#ffe9a0', fog: '#d8cfa0', ambient: 0.7 },
};

// ---------------- Keeps (v0.12) ----------------
// The campaign is a chain of keeps. Each is besieged by exactly 10 waves; the 10th is its boss, and the first
// time that boss falls its Stolen Divinity is yours. Every keep is exponentially harder than the last
// (the Phylactery web is how you keep pace), and pays exponentially more.
export interface KeepDef { id: string; name: string; fort: string; boss: string; blurb: string; }
export const KEEPS: KeepDef[] = [
  { id: 'k1', name: 'The Haunted Barrow', fort: 'haunted', boss: 'b_inquisitor', blurb: 'Where you first rose. The Grand Inquisitor rides to burn it.' },
  { id: 'k2', name: 'The Volcanic Forge', fort: 'volcanic', boss: 'b_archmage', blurb: 'Fire under black stone. The Arcane Conclave wants it sealed.' },
  { id: 'k3', name: 'The Frozen Spire', fort: 'frozen', boss: 'b_dragonslayer', blurb: 'A spire of old ice. The Freeborn send their legend.' },
  { id: 'k4', name: 'The Ruined Cathedral', fort: 'cathedral', boss: 'b_saint', blurb: 'Their holiest ground, defiled. The Saint comes to reclaim it.' },
  { id: 'k5', name: 'The Abyssal Gate', fort: 'abyssal', boss: 'b_kings', blurb: 'Every crown of the world marches on the gate.' },
  { id: 'k6', name: 'The Gates of Dawn', fort: 'dawn', boss: 'b_champion', blurb: 'You besiege heaven. The gods send their Champion.' },
];
export const WAVES_PER_KEEP = 10;
/** Exponential keep curves: mortal health / damage, and what a keep pays. */
export const KEEP_HP = 13, KEEP_DMG = 6.5, KEEP_SOULS = 5, KEEP_ESS = 4;
export const WAVE_HP = 1.25, WAVE_DMG = 1.12, WAVE_SOULS = 1.13;
/** Mortals of the first keep, first wave, relative to the tables in data/enemies.ts. */
export const BASE_HP = 2.2, BASE_DMG = 1.3, BASE_SOULS = 0.44, BASE_ESS = 1.1;
/** The keep's own health before the web (Foundations of Dread ×1.08 per level). */
export const KEEP_BASE_HP = 700;

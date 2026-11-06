import { PAL } from '../config/constants';

// ---------------- Fortress environments ----------------
export const FORTRESSES: Record<string, any> = {
  haunted: { name: 'Haunted Barrow', desc: '+15% necrotic damage. +10% unit health.', bonus: { necroDmg: 0.15, unitHp: 0.1 },
    ground: ['#23221f', '#272522', '#2b2925', '#1f1e1b'], grass: ['#4a4f45', '#5d625a', '#3a3f36'], stone: '#55565a', accent: PAL.necro, keepTone: '#3b3b41', windowGlow: PAL.necro, fog: '#9fb0a0', ambient: 0.62 },
  volcanic: { name: 'Volcanic Forge', desc: '+30% fire damage. Lava moats are free to build.', meta: 'i_fort1', bonus: { fireDmg: 0.3, freeLava: true },
    ground: ['#2a1f1a', '#2f231d', '#352720', '#241a15'], grass: ['#4a3a30', '#5a3a2a', '#3a2a20'], stone: '#4d4440', accent: PAL.fire, keepTone: '#3e3430', windowGlow: PAL.fire, fog: '#a07060', ambient: 0.6 },
  frozen: { name: 'Frozen Spire', desc: '+30% frost damage. Enemies move 8% slower.', meta: 'i_fort2', bonus: { frostDmg: 0.3, enemySlow: 0.08 },
    ground: ['#2a2e33', '#30353a', '#363c42', '#25292e'], grass: ['#6a7a84', '#8a9aa4', '#4a5a64'], stone: '#5a636c', accent: PAL.frost, keepTone: '#3e4650', windowGlow: PAL.frost, fog: '#c0d8e8', ambient: 0.55 },
  cathedral: { name: 'Ruined Cathedral', desc: '+25% souls from all sources. +15% XP.', meta: 'i_fort3', bonus: { souls: 0.25, xp: 0.15 },
    ground: ['#26231f', '#2b2722', '#302b25', '#221f1b'], grass: ['#4a4a3a', '#5a5a48', '#3a3a2c'], stone: '#5c5850', accent: '#7dffb0', keepTone: '#44403a', windowGlow: '#c0ffb0', fog: '#b0a890', ambient: 0.6 },
  abyssal: { name: 'Abyssal Gate', desc: 'Summons cost 25% less and last 50% longer. +10% all damage.', meta: 'i_fort4', bonus: { summonCost: 0.25, summonDur: 0.5, allDmg: 0.1 },
    ground: ['#1f1d24', '#24212a', '#29252f', '#1b1920'], grass: ['#3a3448', '#4a4258', '#2a2436'], stone: '#4a4456', accent: PAL.arcane, keepTone: '#363040', windowGlow: PAL.arcane, fog: '#8a7aa8', ambient: 0.66 },
};


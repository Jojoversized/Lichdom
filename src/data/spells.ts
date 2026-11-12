import { PAL } from '../config/constants';

// ---------------- Spells ----------------
// v0.12: spells cost nothing but their cooldown. Death Wave and Unholy Might are known from the first
// (Raise the Dead, far too strong for a fresh host, is now a deep node: v0.12.2);
// every other spell is learned on the Phylactery web (node `sp_<id>`). Summoning spells call creatures
// that fight for `dur` seconds (they were Soul Well purchases before v0.12).
export const SPELLS: Record<string, any> = {
  deathwave: { name: 'Death Wave', icon: 'deathwave', cd: 18, target: false, dmg: 45, desc: 'An expanding ring of necrotic force from the keep.' },
  might: { name: 'Unholy Might', icon: 'rally', cd: 30, target: false, dur: 12, dmg: 0, desc: 'For 12s every undead deals 40% more damage and takes 30% less.' },
  raise: { name: 'Raise the Dead', icon: 'raise', cd: 30, target: true, radius: 60, desc: 'All corpses in the area rise as skeleton warriors for 30s.' },
  prison: { name: 'Soul Prison', icon: 'prison', cd: 22, target: true, radius: 45, desc: 'Roots enemies for 4s. Trapped enemies take +25% damage.' },
  meteor: { name: 'Meteoric Cataclysm', icon: 'meteor', cd: 25, target: true, radius: 60, dmg: 55, desc: 'Calls down a hail of meteors on an area.' },
  frenzy: { name: 'Bloodfrenzy', icon: 'frenzy', cd: 60, target: false, desc: '+60% attack speed for all towers and undead for 20s.' },
  time: { name: 'Time Distortion', icon: 'time', cd: 40, target: false, desc: 'All enemies are slowed by 50% for 7s.' },
  blood: { name: 'Blood Harvest', icon: 'blood', cd: 28, target: true, radius: 55, dmg: 28, desc: 'Drains life in an area for 4s. Kills yield double souls.' },
  ward: { name: 'Phylactery Ward', icon: 'shield', cd: 90, target: false, desc: 'The keep is invulnerable for 10s.' },
  storm: { name: 'Necrotic Storm', icon: 'storm', cd: 70, target: false, desc: 'Green lightning strikes enemies across the field for 8s.' },
  resurrect: { name: 'Unholy Resurrection', icon: 'resurrect', cd: 75, target: false, desc: 'Revives every undead that fell this wave.' },
  legion: { name: 'Skeleton Legion', icon: 'raise', cd: 55, target: false, summon: 'legion', dur: 40, desc: 'Twelve Deathguard rise from the earth for 40s.' },
  wraiths: { name: 'Wraith Swarm', icon: 'soul', cd: 65, target: false, summon: 'wraiths', dur: 40, desc: 'Eight wraiths hunt anything, ignoring walls, for 40s.' },
  colossus: { name: 'Bone Colossus', icon: 'skull', cd: 90, target: false, summon: 'colossus', dur: 45, desc: 'Two gigantic skeletal monstrosities crush formations for 45s.' },
  abom: { name: 'The Abomination', icon: 'cauldron', cd: 90, target: false, summon: 'abom', dur: 45, desc: 'Two mountains of flesh draw every blade to themselves for 45s.' },
  devourer: { name: 'Soul Devourer', icon: 'soul', cd: 110, target: false, summon: 'devourer', dur: 45, desc: 'A pair of soul-eaters drain everything nearby for 45s, feeding your souls.' },
  dragon: { name: 'Infernal Dragon', icon: 'meteor', cd: 150, target: false, summon: 'dragon', dur: 60, desc: 'An Infernal Dragon breathes rivers of fire across the crusade for 60s.' },
  apocalypse: { name: 'Apocalypse', icon: 'apocalypse', cd: 150, target: false, dmg: 500, desc: 'Rain fire and necrotic ruin across the entire battlefield.' },
};
export const SPELL_ORDER = ['deathwave', 'might', 'raise', 'prison', 'meteor', 'frenzy', 'time', 'blood', 'ward', 'storm', 'resurrect', 'legion', 'wraiths', 'colossus', 'abom', 'devourer', 'dragon', 'apocalypse'];
export const BASE_SPELLS = ['deathwave', 'might'];


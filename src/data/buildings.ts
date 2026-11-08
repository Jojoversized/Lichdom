// ---------------- Keep construction (v0.6) ----------------
// Towers and buildings stand on fixed plots around the keep and are paid for with
// MATERIALS, a slow currency earned after every wave (souls buy the army and the Soul Well).
// Buildings give permanent bonuses to the Lich and to every undead, present and future.

/** Materials price of a tower by tier (index 0 = construction, 1 and 2 = upgrades). */
export const TOWER_MAT: Record<string, number[]> = {
  brimstone: [4, 6, 10], tesla: [4, 6, 10], necrotic: [3, 5, 9], frost: [3, 5, 9],
  artillery: [4, 7, 11], harvester: [3, 5, 8], arcane: [4, 7, 11], abomination: [5, 7, 11],
};

export interface BuildingDef { name: string; tiers: string[]; desc: string; per: string; cost: number[]; icon: string; }
export const BUILDINGS: Record<string, BuildingDef> = {
  forge: { name: 'Bone Forge', tiers: ['Bone Forge', 'Marrow Foundry', 'Forge of the Grave-King'], icon: 'forge',
    desc: 'Grinds the bones of the fallen into blades.', per: '+10% damage for every undead, tower and spell', cost: [13, 21, 32] },
  vault: { name: 'Ossuary Vault', tiers: ['Ossuary Vault', 'Reliquary of Bone', 'Catacomb Cathedral'], icon: 'vault',
    desc: 'Stores spare bones to knit wounded undead back together.', per: '+12% health for every undead', cost: [13, 21, 32] },
  cistern: { name: 'Soul Cistern', tiers: ['Soul Cistern', 'Soul Reservoir', 'Abyssal Font'], icon: 'cistern',
    desc: 'Catches souls that would slip away.', per: '+10% souls from every source', cost: [11, 19, 29] },
  barracks: { name: 'Barrow Barracks', tiers: ['Barrow Barracks', 'Hall of the Risen', 'Necropolis Garrison'], icon: 'barracks',
    desc: 'Bunks the dead in rank and file.', per: '+1 undead in every squad (existing squads gain theirs at once)', cost: [15, 24, 35] },
  sanctum: { name: 'Lich Sanctum', tiers: ['Lich Sanctum', 'Sepulchral Library', 'Throne of Night'], icon: 'sanctum',
    desc: 'Where the Lich hones forbidden rites.', per: '+15% spell damage and −8% spell cooldowns', cost: [11, 19, 29] },
  embalm: { name: "Embalmer's Hall", tiers: ["Embalmer's Hall", 'House of Preservation', 'Undying Workshop'], icon: 'embalm',
    desc: 'Ichor vats that keep rotting flesh in the fight.', per: 'undead regenerate 0.8% health per second', cost: [11, 19, 29] },
  bell: { name: 'War Bell', tiers: ['War Bell', 'Tolling Belfry', 'Bell of the Last Hour'], icon: 'bell',
    desc: 'Its toll drives the dead forward.', per: '+8% attack speed for every undead and tower', cost: [13, 21, 32] },
  quarry: { name: 'Bone Quarry', tiers: ['Bone Quarry', 'Ossuary Mine', 'Grave-Pit Works'], icon: 'quarry',
    desc: 'Cuts stone and bone for the builders.', per: '+1 materials after every wave', cost: [10, 17, 27] },
};
export const BUILDING_ORDER = ['forge', 'vault', 'cistern', 'barracks', 'sanctum', 'embalm', 'bell', 'quarry'];

/** Materials earned when a wave is repelled (before the Bone Quarry): 3, +1 per 5 waves, +5 for a boss. */
export function baseMaterialsIncome(wave: number, boss: boolean) { return 3 + Math.floor(wave / 5) + (boss ? 5 : 0); }
export const START_MATERIALS = 10; // a rampart segment and a tower on it (or a building) before wave 1

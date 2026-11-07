// ---------------- Keep construction (v0.6) ----------------
// Towers and buildings stand on fixed plots around the keep and are paid for with
// MATERIALS, a slow currency earned after every wave (souls buy the army and the Soul Well).
// Buildings give permanent bonuses to the Lich and to every undead, present and future.

/** Materials price of a tower by tier (index 0 = construction, 1 and 2 = upgrades). */
export const TOWER_MAT: Record<string, number[]> = {
  brimstone: [6, 10, 16], tesla: [6, 10, 16], necrotic: [5, 9, 15], frost: [5, 9, 15],
  artillery: [7, 11, 18], harvester: [5, 9, 14], arcane: [7, 11, 18], abomination: [8, 12, 18],
};

export interface BuildingDef { name: string; tiers: string[]; desc: string; per: string; cost: number[]; icon: string; }
export const BUILDINGS: Record<string, BuildingDef> = {
  forge: { name: 'Bone Forge', tiers: ['Bone Forge', 'Marrow Foundry', 'Forge of the Grave-King'], icon: 'forge',
    desc: 'Grinds the bones of the fallen into blades.', per: '+10% damage for every undead, tower and spell', cost: [8, 13, 20] },
  vault: { name: 'Ossuary Vault', tiers: ['Ossuary Vault', 'Reliquary of Bone', 'Catacomb Cathedral'], icon: 'vault',
    desc: 'Stores spare bones to knit wounded undead back together.', per: '+12% health for every undead', cost: [8, 13, 20] },
  cistern: { name: 'Soul Cistern', tiers: ['Soul Cistern', 'Soul Reservoir', 'Abyssal Font'], icon: 'cistern',
    desc: 'Catches souls that would slip away.', per: '+10% souls from every source', cost: [7, 12, 18] },
  barracks: { name: 'Barrow Barracks', tiers: ['Barrow Barracks', 'Hall of the Risen', 'Necropolis Garrison'], icon: 'barracks',
    desc: 'Bunks the dead in rank and file.', per: '+1 undead in every squad (existing squads gain theirs at once)', cost: [9, 15, 22] },
  sanctum: { name: 'Lich Sanctum', tiers: ['Lich Sanctum', 'Sepulchral Library', 'Throne of Night'], icon: 'sanctum',
    desc: 'Where the Lich hones forbidden rites.', per: '+15% spell damage and −8% spell cooldowns', cost: [7, 12, 18] },
  embalm: { name: "Embalmer's Hall", tiers: ["Embalmer's Hall", 'House of Preservation', 'Undying Workshop'], icon: 'embalm',
    desc: 'Ichor vats that keep rotting flesh in the fight.', per: 'undead regenerate 0.8% health per second', cost: [7, 12, 18] },
  bell: { name: 'War Bell', tiers: ['War Bell', 'Tolling Belfry', 'Bell of the Last Hour'], icon: 'bell',
    desc: 'Its toll drives the dead forward.', per: '+8% attack speed for every undead and tower', cost: [8, 13, 20] },
  quarry: { name: 'Bone Quarry', tiers: ['Bone Quarry', 'Ossuary Mine', 'Grave-Pit Works'], icon: 'quarry',
    desc: 'Cuts stone and bone for the builders.', per: '+1 materials after every wave', cost: [6, 11, 17] },
};
export const BUILDING_ORDER = ['forge', 'vault', 'cistern', 'barracks', 'sanctum', 'embalm', 'bell', 'quarry'];

/** Materials earned when a wave is repelled (before the Bone Quarry): 1, +1 per 10 waves, +3 for a boss. */
export function baseMaterialsIncome(wave: number, boss: boolean) { return 1 + Math.floor(wave / 10) + (boss ? 3 : 0); }
export const START_MATERIALS = 10; // a rampart segment and a tower on it (or a building) before wave 1

// ---------------- Necropolis buildings ----------------
// v0.12: buildings are bought on the Phylactery web (Life Essence, three levels each). A building you own
// stands on its own fixed foundation in the bailey at the start of every siege and gives its bonus to
// the whole host. (Materials are gone; `cost` is the Life Essence price of the first level.)

export interface BuildingDef { name: string; tiers: string[]; desc: string; per: string; cost: number[]; icon: string; }
export const BUILDINGS: Record<string, BuildingDef> = {
  forge: { name: 'Bone Forge', tiers: ['Bone Forge', 'Marrow Foundry', 'Forge of the Grave-King'], icon: 'forge',
    desc: 'Grinds the bones of the fallen into blades.', per: '+10% damage for every undead, tower and spell', cost: [13, 21, 32] },
  vault: { name: 'Ossuary Vault', tiers: ['Ossuary Vault', 'Reliquary of Bone', 'Catacomb Cathedral'], icon: 'vault',
    desc: 'Stores spare bones to knit wounded undead back together.', per: '+12% health for every undead', cost: [13, 21, 32] },
  cistern: { name: 'Soul Cistern', tiers: ['Soul Cistern', 'Soul Reservoir', 'Abyssal Font'], icon: 'cistern',
    desc: 'Catches souls that would slip away.', per: '+10% souls from every source', cost: [11, 19, 29] },
  barracks: { name: 'Barrow Barracks', tiers: ['Barrow Barracks', 'Hall of the Risen', 'Necropolis Garrison'], icon: 'barracks',
    desc: 'Bunks the dead in rank and file.', per: '+10% more undead of every type rise at the start of a siege', cost: [15, 24, 35] },
  sanctum: { name: 'Lich Sanctum', tiers: ['Lich Sanctum', 'Sepulchral Library', 'Throne of Night'], icon: 'sanctum',
    desc: 'Where the Lich hones forbidden rites.', per: '+15% spell damage and −8% spell cooldowns', cost: [11, 19, 29] },
  embalm: { name: "Embalmer's Hall", tiers: ["Embalmer's Hall", 'House of Preservation', 'Undying Workshop'], icon: 'embalm',
    desc: 'Ichor vats that keep rotting flesh in the fight.', per: 'undead regenerate 0.8% health per second', cost: [11, 19, 29] },
  bell: { name: 'War Bell', tiers: ['War Bell', 'Tolling Belfry', 'Bell of the Last Hour'], icon: 'bell',
    desc: 'Its toll drives the dead forward.', per: '+8% attack speed for every undead and tower', cost: [13, 21, 32] },
  quarry: { name: 'Bone Quarry', tiers: ['Bone Quarry', 'Ossuary Mine', 'Grave-Pit Works'], icon: 'quarry',
    desc: 'Cuts stone and bone for the builders.', per: '+20% durability for walls, towers and traps; they mend 2% per second', cost: [10, 17, 27] },
};
export const BUILDING_ORDER = ['forge', 'vault', 'cistern', 'barracks', 'sanctum', 'embalm', 'bell', 'quarry'];

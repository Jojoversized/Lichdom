// ---------------- Towers ----------------
export const TOWERS: Record<string, any> = {
  brimstone: { name: 'Brimstone Tower', cost: 120, range: 120, cd: 2.2, dmg: 26, dtype: 'fire', splash: 26, hp: 420, proj: 'fireball', burnGround: 6,
    tiers: [{ name: 'Brimstone Tower' }, { name: 'Infernal Furnace', cost: 200, dmg: 1.8, range: 1.1 }, { name: 'Cataclysmic Citadel', cost: 480, dmg: 3.0, range: 1.25 }],
    desc: 'Launches exploding fireballs that leave burning ground.', evo: ['', 'Fires twin fireballs.', 'Calls down a meteor every 8s.'] },
  tesla: { name: 'Tesla Obelisk', cost: 110, range: 95, cd: 1.4, dmg: 18, dtype: 'shock', chains: 3, hp: 360,
    tiers: [{ name: 'Tesla Obelisk' }, { name: 'Storm Conduit', cost: 190, dmg: 1.7, chains: 3, range: 1.1 }, { name: 'Eye of the Eternal Tempest', cost: 460, dmg: 2.8, chains: 7, range: 1.25 }],
    desc: 'Lightning that chains between enemies.', evo: ['', '+3 chains.', 'Calls storm strikes every 6s.'] },
  necrotic: { name: 'Necrotic Spire', cost: 100, range: 110, cd: 1.0, dmg: 14, dtype: 'necro', hp: 380, proj: 'necrobolt', weaken: 0.15, lifedrain: 0.3,
    tiers: [{ name: 'Necrotic Spire' }, { name: 'Death Nexus', cost: 180, dmg: 1.8, weaken: 0.25, range: 1.1 }, { name: 'Citadel of Souls', cost: 440, dmg: 3.0, weaken: 0.3, range: 1.2 }],
    desc: 'Necrotic bolts that weaken enemies and heal nearby undead.', evo: ['', 'Weakens harder.', 'Its victims rise as Deathguard (max 6).'] },
  frost: { name: 'Frostbound Tower', cost: 100, range: 100, cd: 1.6, dmg: 10, dtype: 'frost', splash: 22, hp: 380, proj: 'frostbolt', slow: 0.4, freeze: 0.1,
    tiers: [{ name: 'Frostbound Tower' }, { name: 'Glacial Bastion', cost: 180, dmg: 1.7, freeze: 0.25, range: 1.1 }, { name: 'Heart of Winter', cost: 440, dmg: 2.8, freeze: 0.4, range: 1.2 }],
    desc: 'Slows and freezes groups of enemies.', evo: ['', 'Freezes far more often.', 'Blizzard aura slows everything in range.'] },
  artillery: { name: 'Bone Artillery', cost: 140, range: 170, cd: 3.0, dmg: 64, dtype: 'phys', pierce: 0.6, splash: 12, hp: 400, proj: 'bonebolt',
    tiers: [{ name: 'Bone Artillery' }, { name: 'Ossuary Ballista', cost: 220, dmg: 1.8, range: 1.1 }, { name: "Titan's Ribcage", cost: 500, dmg: 2.8, range: 1.2 }],
    desc: 'Huge bone bolts that punch through armor.', evo: ['', 'Bolts pierce through lines.', 'Fires three bolts at once.'] },
  harvester: { name: 'Soul Harvester', cost: 90, range: 90, cd: 3.0, dmg: 0, dtype: 'necro', hp: 340, soulBonus: 0.5,
    tiers: [{ name: 'Soul Harvester' }, { name: 'Soul Siphon', cost: 160, soulBonus: 2, range: 1.15 }, { name: 'Soul Engine', cost: 400, soulBonus: 3, range: 1.3 }],
    desc: '+50% souls from kills in range. Harvests corpses for souls.', evo: ['', '+100% souls & hastes nearby towers.', 'Generates souls passively during waves.'] },
  arcane: { name: 'Arcane Rift', cost: 150, range: 130, cd: 0.6, dmg: 9, dtype: 'arcane', bolts: 2, hp: 360,
    tiers: [{ name: 'Arcane Rift' }, { name: 'Unstable Nexus', cost: 230, dmg: 1.6, bolts: 2, range: 1.1 }, { name: 'Void Maw', cost: 520, dmg: 2.6, bolts: 4, range: 1.2 }],
    desc: 'Unpredictable bolts strike random enemies.', evo: ['', '+2 bolts.', 'Opens damaging void rifts.'] },
  abomination: { name: 'Siege Abomination', cost: 160, range: 34, cd: 1.2, dmg: 30, dtype: 'phys', cleave: 24, hp: 1000, taunt: true, eater: true,
    tiers: [{ name: 'Siege Abomination' }, { name: 'Gorging Horror', cost: 240, dmg: 1.7, hp: 1.6 }, { name: 'Flesh Citadel', cost: 520, dmg: 2.6, hp: 2.4 }],
    desc: 'Living fortress. Taunts, cleaves and eats corpses to heal.', evo: ['', 'Hooks enemies from afar.', 'Births zombies every 12s.'] },
};
export const TOWER_ORDER = ['brimstone', 'tesla', 'necrotic', 'frost', 'artillery', 'harvester', 'arcane', 'abomination'];

// ---------------- Fortifications (1 cell each) ----------------
export const FORTS: Record<string, any> = {
  wall: { name: 'Stone Wall', cost: 15, hp: 320, block: true, icon: 'wall', desc: 'Blocks enemy movement. Undead pass through hidden sally-gates.' },
  spikes: { name: 'Spiked Barricade', cost: 10, hp: 140, block: true, thorns: 10, icon: 'spikes', desc: 'Weak barrier that wounds enemies who attack it.' },
  lava: { name: 'Lava Moat', cost: 30, hp: 0, dps: 18, dtype: 'fire', icon: 'lava', meta: 'f_traps', desc: 'Burns enemies walking through it.' },
  rune: { name: 'Necrotic Rune', cost: 40, hp: 0, trap: 70, radius: 30, recharge: 8, icon: 'rune', meta: 'f_traps', desc: 'Explodes when an enemy steps on it. Recharges.' },
  cauldron: { name: 'Acid Cauldron', cost: 60, hp: 200, block: true, pour: 28, radius: 44, icon: 'cauldron', meta: 'f_traps2', desc: 'Pours acid (boiling oil) on nearby attackers, shredding armor.' },
  ward: { name: 'Ward Pylon', cost: 50, hp: 220, block: true, slowAura: 0.3, radius: 50, icon: 'ward', meta: 'f_traps2', desc: 'Magical barrier: slows enemies and shields nearby structures from spells.' },
};
export const FORT_ORDER = ['wall', 'spikes', 'lava', 'rune', 'cauldron', 'ward'];


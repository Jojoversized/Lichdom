import { PAL } from '../config/constants';

// ---------------- Friendly units ----------------
// cd = seconds between attacks. range in px. spd px/s.
// cost buys a whole squad of `squad` undead (never fewer than 5). `size` is body
// size (1 small … 4 huge): giant-slayer bonuses and impact effects key off it.
// There is no army cap — the crusade answers numbers with Crusade Fervor.
export const UNITS: Record<string, any> = {
  skeleton: { name: 'Skeleton Warrior', cost: 160, squad: 8, size: 1, hp: 60, dmg: 8, cd: 1.0, range: 12, spd: 34, armor: 0.1, dtype: 'phys', melee: true,
    tiers: [{ name: 'Skeleton Warriors', spr: 'skeleton' }, { name: 'Armored Skeletons', spr: 'skeleton2', cost: 120, hp: 1.7, dmg: 1.4, armor: 0.2 }, { name: 'Deathguard Legion', spr: 'skeleton3', cost: 320, hp: 2.8, dmg: 2.2, armor: 0.3 }],
    desc: 'Cheap, reliable bone infantry. The backbone of every undead host.' },
  archer: { name: 'Skeleton Archer', cost: 170, squad: 6, size: 1, hp: 35, dmg: 7, cd: 1.2, range: 110, spd: 32, armor: 0, dtype: 'phys', ranged: 'arrow',
    tiers: [{ name: 'Skeleton Archers', spr: 'archer' }, { name: 'Bone Marksmen', spr: 'archer2', cost: 140, hp: 1.5, dmg: 1.6, range: 1.15 }, { name: 'Wailing Rangers', spr: 'archer3', cost: 340, hp: 2.2, dmg: 2.5, range: 1.25 }],
    desc: 'Ranged support that peppers anything in reach from behind the line.' },
  zombie: { name: 'Zombie Horde', cost: 130, squad: 8, size: 1, hp: 110, dmg: 6, cd: 1.4, range: 12, spd: 20, armor: 0, dtype: 'phys', melee: true, bloodless: false,
    tiers: [{ name: 'Zombie Horde', spr: 'zombie' }, { name: 'Ghoul Pack', spr: 'zombie2', cost: 100, hp: 1.8, dmg: 1.5, spd: 1.3 }, { name: 'Plague Behemoths', spr: 'zombie3', cost: 280, hp: 3.2, dmg: 2.4 }],
    desc: 'Slow, tough and cheap. Soaks damage for your other troops.' },
  pikeman: { name: 'Skeletal Pikemen', cost: 190, squad: 6, size: 1, hp: 70, dmg: 10, cd: 1.2, range: 20, spd: 30, armor: 0.15, dtype: 'phys', melee: true, antiCav: 2.5,
    tiers: [{ name: 'Skeletal Pikemen', spr: 'pikeman' }, { name: 'Phalanx of Bone', spr: 'pikeman2', cost: 150, hp: 1.7, dmg: 1.6, armor: 0.25 }, { name: 'Ossuary Phalanx', spr: 'pikeman2', cost: 340, hp: 2.6, dmg: 2.4, armor: 0.3 }],
    desc: 'Long reach. Deals 250% damage to cavalry.' },
  deathknight: { name: 'Death Knight', cost: 440, squad: 5, size: 2, hp: 230, dmg: 24, cd: 1.3, range: 14, spd: 38, armor: 0.35, dtype: 'necro', melee: true, pierce: 0.5,
    tiers: [{ name: 'Death Knights', spr: 'deathknight' }, { name: 'Dread Knights', spr: 'deathknight', cost: 260, hp: 1.6, dmg: 1.6 }, { name: 'Riders of the Pale Host', spr: 'deathknight2', cost: 520, hp: 2.4, dmg: 2.3, spd: 1.4 }],
    desc: 'Elite necro-knights. Ignore 50% of armor.' },
  bonemage: { name: 'Bone Mage', cost: 280, squad: 5, size: 1, hp: 45, dmg: 15, cd: 2.0, range: 100, spd: 28, armor: 0, dtype: 'necro', ranged: 'necrobolt', splash: 22,
    tiers: [{ name: 'Bone Mages', spr: 'bonemage' }, { name: 'Ossomancers', spr: 'bonemage', cost: 180, hp: 1.5, dmg: 1.7 }, { name: 'Archmages of Bone', spr: 'bonemage', cost: 380, hp: 2.2, dmg: 2.6, splash: 1.4 }],
    desc: 'Hurls bursting bone-bolts that damage groups.' },
  acolyte: { name: 'Necromantic Acolyte', cost: 240, squad: 5, size: 1, hp: 40, dmg: 5, cd: 1.5, range: 90, spd: 28, armor: 0, dtype: 'necro', ranged: 'necrobolt', raiser: 6,
    tiers: [{ name: 'Necromantic Acolytes', spr: 'acolyte' }, { name: 'Necromancers', spr: 'acolyte', cost: 170, hp: 1.6, dmg: 1.6, raiser: 0.7 }, { name: 'Masters of the Grave', spr: 'acolyte', cost: 360, hp: 2.2, dmg: 2.2, raiser: 0.5 }],
    desc: 'Raises nearby corpses as temporary skeletons.' },
  wraith: { name: 'Wraith', cost: 280, squad: 5, size: 1, hp: 70, dmg: 12, cd: 1.0, range: 14, spd: 52, armor: 0.2, dtype: 'necro', melee: true, flying: true, drain: 0.3,
    tiers: [{ name: 'Wraiths', spr: 'wraith' }, { name: 'Shades', spr: 'wraith', cost: 170, hp: 1.6, dmg: 1.6 }, { name: 'Soul Wraiths', spr: 'wraith', cost: 360, hp: 2.4, dmg: 2.4 }],
    desc: 'Flying spirits that bypass walls and drain life.' },
  banshee: { name: 'Banshee', cost: 320, squad: 5, size: 1, hp: 50, dmg: 9, cd: 1.6, range: 70, spd: 40, armor: 0.1, dtype: 'necro', ranged: 'scream', splash: 30, flying: true, slow: 0.35,
    tiers: [{ name: 'Banshees', spr: 'banshee' }, { name: 'Keening Banshees', spr: 'banshee', cost: 180, hp: 1.6, dmg: 1.6 }, { name: 'Queens of Sorrow', spr: 'banshee', cost: 380, hp: 2.4, dmg: 2.5 }],
    desc: 'Flying. Wails damage and slow groups.' },
  vampire: { name: 'Vampire', cost: 480, squad: 5, size: 2, hp: 150, dmg: 18, cd: 0.8, range: 14, spd: 52, armor: 0.15, dtype: 'phys', melee: true, lifesteal: 0.35,
    tiers: [{ name: 'Vampires', spr: 'vampire' }, { name: 'Vampire Lords', spr: 'vampire', cost: 280, hp: 1.6, dmg: 1.7 }, { name: 'Elder Bloodlords', spr: 'vampire', cost: 560, hp: 2.5, dmg: 2.5 }],
    desc: 'Fast duelists who heal from the damage they deal.' },
  abomination: { name: 'Abomination', cost: 640, squad: 5, size: 3, hp: 560, dmg: 22, cd: 1.8, range: 16, spd: 18, armor: 0.25, dtype: 'phys', melee: true, cleave: 24, taunt: true,
    tiers: [{ name: 'Abominations', spr: 'abomination' }, { name: 'Flesh Giants', spr: 'abomination', cost: 340, hp: 1.7, dmg: 1.6 }, { name: 'Plague Titans', spr: 'abomination', cost: 640, hp: 2.6, dmg: 2.4 }],
    desc: 'Huge stitched horror. Taunts enemies and cleaves crowds.' },
  golem: { name: 'Bone Golem', cost: 880, squad: 5, size: 4, hp: 760, dmg: 40, cd: 2.4, range: 18, spd: 16, armor: 0.4, dtype: 'phys', melee: true, cleave: 30,
    tiers: [{ name: 'Bone Golems', spr: 'golem' }, { name: 'Colossal Bone Golems', spr: 'golem', cost: 420, hp: 1.8, dmg: 1.7 }, { name: 'Titans of the Grave', spr: 'golem', cost: 800, hp: 2.8, dmg: 2.6 }],
    desc: 'A walking ossuary. Slams the ground, crushing formations.' },
  wyvern: { name: 'Skeletal Wyvern', cost: 600, squad: 5, size: 3, hp: 200, dmg: 16, cd: 1.4, range: 80, spd: 44, armor: 0.15, dtype: 'necro', ranged: 'bonespit', splash: 18, flying: true,
    tiers: [{ name: 'Skeletal Wyverns', spr: 'wyvern' }, { name: 'Bone Drakes', spr: 'wyvern', cost: 320, hp: 1.7, dmg: 1.7 }, { name: 'Undead Dragons', spr: 'wyvern', cost: 640, hp: 2.6, dmg: 2.6, splash: 1.5 }],
    desc: 'Flying beasts spitting corrosive bone shards.' },
};
export const UNIT_ORDER = ['skeleton', 'archer', 'zombie', 'pikeman', 'acolyte', 'bonemage', 'deathknight', 'wraith', 'banshee', 'vampire', 'wyvern', 'abomination', 'golem'];

// ---------------- Summons (Soul Well) ----------------
export const SUMMONS: Record<string, any> = {
  legion: { name: 'Skeleton Legion', spr: 'skeleton3', hp: 260, dmg: 26, cd: 1.0, range: 13, spd: 36, armor: 0.3, dtype: 'phys', melee: true, count: 12, cost: 140, desc: 'Twelve Deathguard rise from the earth at once.' },
  wraiths: { name: 'Wraith Swarm', spr: 'wraith', hp: 180, dmg: 22, cd: 0.9, range: 14, spd: 56, armor: 0.2, dtype: 'necro', melee: true, flying: true, drain: 0.3, count: 8, cost: 200, desc: 'Eight wraiths that hunt anything, ignoring walls.' },
  colossus: { name: 'Bone Colossus', spr: 'colossus', hp: 3200, dmg: 120, cd: 2.6, range: 26, spd: 20, armor: 0.5, cleave: 46, dtype: 'phys', melee: true, count: 2, cost: 260, desc: 'Two gigantic skeletal monstrosities that crush entire formations.' },
  abom: { name: 'The Abomination', spr: 'sumabom', hp: 5200, dmg: 60, cd: 1.8, range: 22, spd: 18, armor: 0.45, cleave: 34, taunt: true, dtype: 'phys', melee: true, count: 2, cost: 220, desc: 'Two mountains of flesh that draw every blade to themselves.' },
  devourer: { name: 'Soul Devourer', spr: 'devourer', hp: 2200, dmg: 40, cd: 0.6, range: 60, spd: 36, armor: 0.3, aura: 60, auraDps: 70, flying: true, dtype: 'necro', melee: true, drain: 0.6, count: 2, cost: 360, desc: 'A pair of soul-eaters that drain everything nearby, feeding your souls.' },
  dragon: { name: 'Infernal Dragon', spr: 'infdragon', hp: 4000, dmg: 90, cd: 2.0, range: 110, spd: 44, armor: 0.4, flying: true, dtype: 'fire', ranged: 'firebreath', splash: 50, count: 1, cost: 520, desc: 'Breathes rivers of fire across enemy formations.' },
};


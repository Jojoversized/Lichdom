// ---------------- Enemies ----------------
// faction: holy | iron | arcane | free
export const ENEMIES: Record<string, any> = {
  militia: { name: 'Conscript Militia', fac: 'iron', hp: 26, dmg: 4, cd: 1.1, range: 14, spd: 30, armor: 0, bounty: 2, xp: 2, melee: true, minWave: 1, w: 3, desc: 'Peasants pressed into service. Numerous and frightened.' },
  footman: { name: 'Footman', fac: 'iron', hp: 42, dmg: 6, cd: 1.1, range: 12, spd: 26, armor: 0.05, bounty: 4, xp: 3, melee: true, minWave: 1, w: 3, desc: 'Basic coalition infantry.' },
  crossbow: { name: 'Crossbowman', fac: 'iron', hp: 34, dmg: 9, cd: 2.0, range: 100, spd: 24, armor: 0.05, bounty: 5, xp: 3, ranged: 'bolt', minWave: 2, w: 2, desc: 'Fires heavy bolts at your troops and towers.' },
  shield: { name: 'Shieldbearer', fac: 'iron', hp: 75, dmg: 6, cd: 1.2, range: 12, spd: 22, armor: 0.3, projArmor: 0.5, bounty: 7, xp: 5, melee: true, minWave: 3, w: 2, desc: 'Tower shields block half of all projectile damage.' },
  cavalry: { name: 'Heavy Cavalry', fac: 'iron', hp: 120, dmg: 16, cd: 1.3, range: 16, spd: 56, armor: 0.25, bounty: 13, xp: 8, melee: true, charge: 2.5, cav: true, minWave: 5, w: 1.4, desc: 'Fast and deadly on the charge. Vulnerable to pikes.' },
  knight: { name: 'Knight of the Realm', fac: 'iron', hp: 170, dmg: 14, cd: 1.2, range: 12, spd: 22, armor: 0.45, bounty: 14, xp: 9, melee: true, minWave: 7, w: 1.2, desc: 'Heavily armored. Resists most physical damage.' },
  ram: { name: 'Battering Ram', fac: 'iron', hp: 620, dmg: 70, cd: 2.2, range: 14, spd: 13, armor: 0.5, bounty: 30, xp: 18, melee: true, siege: true, structOnly: true, bloodless: true, minWave: 6, w: 0.6, desc: 'Ignores troops and batters walls, towers and the keep.' },
  catapult: { name: 'Catapult', fac: 'iron', hp: 260, dmg: 48, cd: 4.0, range: 210, spd: 12, armor: 0.2, bounty: 28, xp: 16, ranged: 'boulder', splash: 26, siege: true, structOnly: true, bloodless: true, minWave: 9, w: 0.5, desc: 'Long-range artillery that bombards your fortifications.' },
  priest: { name: 'Priest of the Dawn', fac: 'holy', hp: 50, dmg: 5, cd: 1.5, range: 70, spd: 22, armor: 0, bounty: 10, xp: 6, healer: 14, ranged: 'holybolt', minWave: 4, w: 1, desc: 'Heals nearby crusaders.' },
  paladin: { name: 'Paladin', fac: 'holy', hp: 230, dmg: 18, cd: 1.3, range: 13, spd: 22, armor: 0.35, bounty: 24, xp: 14, melee: true, holy: true, auraWard: 0.25, minWave: 8, w: 0.8, desc: 'Holy warrior. Double damage to undead; shields allies from necromancy.' },
  inquisitor: { name: 'Inquisitor', fac: 'holy', hp: 160, dmg: 14, cd: 1.6, range: 120, spd: 22, armor: 0.2, bounty: 26, xp: 14, ranged: 'holyfire', holy: true, minWave: 11, w: 0.6, desc: 'Purges undead with holy fire from range.' },
  angel: { name: 'Angel of the Host', fac: 'holy', hp: 170, dmg: 14, cd: 1.3, range: 70, spd: 36, armor: 0.15, bounty: 22, xp: 13, ranged: 'holybolt', flying: true, holy: true, bloodless: true, minWave: 12, w: 0.7, desc: 'Divine flyer. Ignores walls entirely.' },
  battlemage: { name: 'Battle Mage', fac: 'arcane', hp: 60, dmg: 16, cd: 2.4, range: 110, spd: 22, armor: 0, mres: 0.3, bounty: 14, xp: 8, ranged: 'fireball', splash: 22, minWave: 6, w: 1, desc: 'Lobs fireballs at troops and towers.' },
  elementalist: { name: 'Elementalist', fac: 'arcane', hp: 70, dmg: 10, cd: 2.0, range: 100, spd: 22, armor: 0, mres: 0.3, bounty: 13, xp: 8, ranged: 'frostbolt', slowOnHit: 0.4, minWave: 8, w: 0.9, desc: 'Frost magic that slows your troops.' },
  spellbreaker: { name: 'Spellbreaker', fac: 'arcane', hp: 130, dmg: 12, cd: 1.2, range: 12, spd: 24, armor: 0.2, mres: 0.5, bounty: 18, xp: 10, melee: true, silencer: true, minWave: 10, w: 0.7, desc: 'Silences nearby towers. Highly resistant to magic.' },
  construct: { name: 'Arcane Construct', fac: 'arcane', hp: 560, dmg: 26, cd: 1.6, range: 16, spd: 14, armor: 0.4, mres: 0.3, bounty: 40, xp: 22, melee: true, bloodless: true, minWave: 14, w: 0.4, desc: 'Animated war-golem of runed iron.' },
  ranger: { name: 'Ranger', fac: 'free', hp: 46, dmg: 8, cd: 1.3, range: 110, spd: 30, armor: 0.05, bounty: 8, xp: 5, ranged: 'arrow', climber: true, minWave: 5, w: 1, desc: 'Scales walls with grappling hooks.' },
  assassin: { name: 'Assassin', fac: 'free', hp: 70, dmg: 28, cd: 1.0, range: 12, spd: 48, armor: 0.05, dodge: 0.3, bounty: 16, xp: 9, melee: true, hunter: 'struct', climber: true, minWave: 9, w: 0.7, desc: 'Evasive infiltrator that targets towers.' },
  hunter: { name: 'Monster Hunter', fac: 'free', hp: 170, dmg: 22, cd: 1.1, range: 13, spd: 28, armor: 0.2, bounty: 20, xp: 11, melee: true, bigSlayer: 2, minWave: 10, w: 0.7, desc: 'Deals double damage to large undead.' },
  griffon: { name: 'Griffon Knight', fac: 'free', hp: 230, dmg: 20, cd: 1.2, range: 16, spd: 50, armor: 0.25, bounty: 26, xp: 14, melee: true, flying: true, minWave: 15, w: 0.5, desc: 'Airborne lancer. Strikes from above.' },
};

// v0.12: one boss per keep (data/world.ts KEEPS), always on wave 10. hp0/dmg0 are multiplied by the keep's
// exponential curve (stats.waveHpMult / waveDmgMult at wave 10).
export const BOSSES: any[] = [
  { id: 'b_inquisitor', name: 'The Grand Inquisitor', hp: 600, hp0: 600, dmg: 13, dmg0: 13, cd: 1.6, range: 130, spd: 16, armor: 0.3, ranged: 'holyfire', holy: true, bounty: 100, xp: 120, abilities: ['purge', 'summon'], summon: ['priest', 'paladin'],
    title: 'Hand of the Holy Dominion', line: 'Your heresy ends today, abomination.' },
  { id: 'b_archmage', name: 'Archmage of the Last Covenant', hp: 650, hp0: 650, dmg: 15, dmg0: 15, cd: 1.4, range: 150, spd: 15, armor: 0.2, mres: 0.5, ranged: 'arcanebolt', bounty: 110, xp: 220, abilities: ['silence', 'meteor', 'blink'],
    title: 'Keeper of the Arcane Conclave', line: 'I have studied your kind for forty years, Lich.' },
  { id: 'b_dragonslayer', name: 'The Dragon-Slayer', hp: 900, hp0: 900, dmg: 30, dmg0: 30, cd: 1.5, range: 18, spd: 24, armor: 0.5, melee: true, bigSlayer: 3, bounty: 120, xp: 360, abilities: ['cleave', 'leap', 'warcry'],
    title: 'Freeborn Legend', line: 'I have slain greater beasts than you, bone-king.' },
  { id: 'b_saint', name: 'The Saint of Eternal Dawn', hp: 760, hp0: 760, dmg: 17, dmg0: 17, cd: 1.2, range: 120, spd: 20, armor: 0.3, flying: true, holy: true, ranged: 'holybeam', bounty: 130, xp: 520, abilities: ['heal', 'sunburst', 'summon'], summon: ['angel'],
    title: 'Beloved of the Light', line: 'Let the dawn burn away your night forever.' },
  { id: 'b_kings', name: 'The United Kings', hp: 950, hp0: 950, dmg: 24, dmg0: 24, cd: 1.3, range: 18, spd: 26, armor: 0.5, melee: true, bounty: 140, xp: 700, abilities: ['summon', 'warcry', 'siege'], summon: ['knight', 'cavalry', 'ram'],
    title: 'Crowned Heads of Every Realm', line: 'All the crowns of the world march against you.' },
  { id: 'b_champion', name: 'The Divine Champion', hp: 1150, hp0: 1150, dmg: 30, dmg0: 30, cd: 1.1, range: 20, spd: 28, armor: 0.5, mres: 0.3, holy: true, melee: true, bounty: 160, xp: 1000, abilities: ['sunburst', 'leap', 'purge', 'heal'],
    title: 'Chosen of the Gods', line: 'The gods themselves have sent me. Kneel.' },
];


// Roguelite layer (v0.8): crusade choices before every wave and story events between waves.
// Pure data; the effects are applied by systems/events.ts.

/** The three crusades offered before each wave. `count` scales the number of soldiers, `hp` their
 *  health, `reward` every soul they yield (kills and the wave bonus); `mats` is added to the
 *  materials earned when the wave is repelled. The middle choice is the baseline. */
export interface CrusadeTier { id: string; name: string; desc: string; count: number; hp: number; reward: number; mats: number; }
export const CRUSADE_TIERS: CrusadeTier[] = [
  { id: 'skirmish', name: 'Skirmish', desc: 'A wary vanguard probes the walls. Fewer soldiers, leaner spoils of souls.', count: 0.6, hp: 1, reward: 0.6, mats: 0 },
  { id: 'crusade', name: 'Crusade', desc: 'The crusade marches as foretold.', count: 1, hp: 1, reward: 1, mats: 0 },
  { id: 'holywar', name: 'Holy War', desc: 'Zealots answer every bell in the realm. A far greater, hardier host, and far richer spoils.', count: 1.5, hp: 1.15, reward: 1.8, mats: 3 },
];

/** A story event every few waves. Each choice lists its effects (see systems/events.ts for the
 *  kinds); numbers with `perWave` grow with the campaign's wave. */
export interface EventEffect { kind: string; [k: string]: any; }
export interface EventChoice { label: string; hint: string; effects: EventEffect[]; result: string; }
export interface EventDef { id: string; title: string; text: string; icon: string; choices: EventChoice[]; minWave?: number; }

export const EVENT_EVERY = 3;

export const EVENTS: EventDef[] = [
  { id: 'village', title: 'A Village Burns', icon: 'skull',
    text: 'Your roaming hordes have fallen upon Harrowmere, a farming village that sent its sons to the crusade. The palisade is down, the chapel bell has stopped ringing, and the survivors huddle in the square, waiting to learn what the dead want of them.',
    choices: [
      { label: 'Dismantle their architecture', hint: 'Materials now', effects: [{ kind: 'materials', base: 4, perWave: 0.2 }],
        result: 'Beams, millstones and church bells are dragged back to the keep. +{materials} materials.' },
      { label: 'Enslave their populace', hint: 'Souls over the next 5 waves', effects: [{ kind: 'tithe', base: 1.4, perWave: 0.14, waves: 5 }],
        result: 'Chained villagers toil in the grave-pits; their despair seeps into the Soul Well. +{tithe} souls per second during the next {waves} waves.' },
      { label: 'Massacre them and raise the dead', hint: 'A random horde of your undead types', effects: [{ kind: 'raise', min: 8, max: 12, perWave: 0.35 }],
        result: 'Harrowmere marches again — for you. {raised}.' },
    ] },
  { id: 'chapel', title: 'The Forsaken Chapel', icon: 'resurrect',
    text: 'In a hollow beyond the eastern road stands a chapel the crusade left unguarded. Its reliquary still hums with stolen sanctity, its crypt is full of restless saints, and its tithe chest is heavy with coin.',
    choices: [
      { label: 'Shatter the reliquary', hint: 'An immediate level-up', effects: [{ kind: 'level', n: 1 }],
        result: 'The relics crack and their stolen light pours into you. A dark insight awaits.' },
      { label: 'Bind the restless saints', hint: 'Wraiths and banshees join you', effects: [{ kind: 'spirits', min: 4, max: 6, perWave: 0.15 }],
        result: 'The saints rise screaming and swear themselves to you. {raised}.' },
      { label: 'Loot the tithe chest', hint: 'Souls now', effects: [{ kind: 'souls', base: 160, perWave: 26 }],
        result: 'Pilgrims\' coin, every piece paid for a prayer. +{souls} souls.' },
    ] },
  { id: 'deserters', title: 'Deserters at the Crossroads', icon: 'rally',
    text: 'A band of crusaders has thrown away its tabards and fled the front. Your scouts have them cornered at a crossroads gibbet. They beg, they bargain, and they know a great deal about the march.',
    choices: [
      { label: 'Turn them', hint: 'A small random horde', effects: [{ kind: 'raise', min: 4, max: 7, perWave: 0.2 }],
        result: 'Their oaths end at the rope; their service begins after. {raised}.' },
      { label: 'Let them spread the terror', hint: 'The next 2 crusades are 25% smaller', effects: [{ kind: 'curse', count: 0.75, waves: 2 }],
        result: 'They run east with tales of the walking dead. Recruiters find empty villages: the next {waves} crusades march 25% smaller.' },
      { label: 'Interrogate them', hint: 'Crusaders have 15% less health for 3 waves', effects: [{ kind: 'curse', hp: 0.85, waves: 3 }],
        result: 'You learn where their armour is thin and their healers are few. Crusaders have 15% less health for {waves} waves.' },
    ] },
  { id: 'necromancer', title: 'A Rival Necromancer', icon: 'raise', minWave: 6,
    text: 'An upstart necromancer has been raising the crusade\'s dead before you can. Your host has stormed his tower; he kneels among his shattered phylacteries, his apprentices cowering behind him.',
    choices: [
      { label: 'Devour his phylactery', hint: '+12% damage for the campaign, but the keep loses 25% health', effects: [{ kind: 'ascDmg', n: 1 }, { kind: 'keepHurt', frac: 0.25 }],
        result: 'His soul is yours, and it burns going down. All damage ×1.12 for the rest of the campaign; the keep shudders.' },
      { label: 'Steal his grimoires', hint: 'Spells recharge 15% faster', effects: [{ kind: 'spellCd', mult: 0.85 }],
        result: 'Margins full of shortcuts. Your spells recharge 15% faster for the rest of the campaign.' },
      { label: 'Enslave his apprentices', hint: 'Unlock a random new undead type with a free squad', effects: [{ kind: 'unlock' }],
        result: '{unlocked}' },
    ] },
  { id: 'plague', title: 'The Plague Wagon', icon: 'cauldron', minWave: 6,
    text: 'A cart of plague-dead, bound for the crusade\'s burning pits, has lost its escort. The corpses are bloated, the miasma is thick enough to taste, and the road east runs straight to the enemy camps.',
    choices: [
      { label: 'Drive it east', hint: 'Crusaders have 20% less health for 2 waves', effects: [{ kind: 'curse', hp: 0.8, waves: 2 }],
        result: 'The plague reaches their camps before the crusade marches. Crusaders have 20% less health for {waves} waves.' },
      { label: 'Harvest the corpses', hint: 'Materials and souls', effects: [{ kind: 'materials', base: 3, perWave: 0.1 }, { kind: 'souls', base: 80, perWave: 12 }],
        result: 'Bone for the builders, rot for the Well. +{materials} materials, +{souls} souls.' },
      { label: 'Drink the miasma', hint: '+12% undead health for the campaign, but lose half your souls', effects: [{ kind: 'ascHp', n: 1 }, { kind: 'loseSouls', frac: 0.5 }],
        result: 'The Well curdles and your dead grow strong on the rot. Undead and keep health ×1.12 for the rest of the campaign; half your souls are spent.' },
    ] },
  { id: 'siegecamp', title: 'An Abandoned Siege Camp', icon: 'bomb',
    text: 'The crusade\'s engineers fled their camp when your scouts appeared. Half-built rams and trebuchets stand in the mud, the war drums are still stacked by the fires, and the camp graveyard is freshly dug.',
    choices: [
      { label: 'Take the engines apart', hint: 'Plenty of materials', effects: [{ kind: 'materials', base: 6, perWave: 0.25 }],
        result: 'Seasoned timber, iron and rope. +{materials} materials.' },
      { label: 'Beat their war drums', hint: '+25% damage for your host for 3 waves', effects: [{ kind: 'buff', dmg: 0.25, waves: 3 }],
        result: 'The drums thunder from your walls. All damage +25% for {waves} waves.' },
      { label: 'Empty the camp graveyard', hint: 'A random horde of your undead types', effects: [{ kind: 'raise', min: 6, max: 10, perWave: 0.3 }],
        result: 'The engineers\' dead climb out of fresh graves. {raised}.' },
    ] },
];

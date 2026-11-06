import { PAL } from '../config/constants';

// ---------------- Meta progression tree ----------------
export const META_BRANCHES = [
  { id: 'N', name: 'Necromantic Mastery', color: PAL.necro },
  { id: 'F', name: 'Fortress Architecture', color: '#c0c0c8' },
  { id: 'S', name: 'Soul Manipulation', color: '#7dffb0' },
  { id: 'A', name: 'Arcane Ascendancy', color: PAL.arcane },
  { id: 'M', name: 'Military Command', color: '#e06050' },
  { id: 'I', name: 'Immortality & Phylactery', color: PAL.gold },
];
export const META: any[] = [
  // Necromantic Mastery
  { id: 'n_dmg', b: 'N', name: 'Grave Strength', max: 5, cost: 12, mult: 1.7, desc: (lv: number) => `+${lv * 8}% undead unit damage.` },
  { id: 'n_hp', b: 'N', name: 'Bone Hardening', max: 5, cost: 12, mult: 1.7, desc: (lv: number) => `+${lv * 10}% undead unit health.` },
  { id: 'n_pike', b: 'N', name: 'Ossuary Lore', max: 1, cost: 25, req: ['n_dmg'], desc: () => 'Skeletal Pikemen and Bone Mages can appear in level-up choices.' },
  { id: 'n_dk', b: 'N', name: 'Oath of the Death Knight', max: 1, cost: 60, req: ['n_pike'], desc: () => 'Death Knights can be unlocked during campaigns.' },
  { id: 'n_raise', b: 'N', name: 'Restless Dead', max: 3, cost: 40, mult: 1.8, req: ['n_hp'], desc: (lv: number) => `${lv * 4}% of slain mortals rise as temporary skeletons.` },
  { id: 'n_wraith', b: 'N', name: 'Wraith Binding', max: 1, cost: 90, req: ['n_dk'], desc: () => 'Wraiths and Banshees can be unlocked.' },
  { id: 'n_flesh', b: 'N', name: 'Fleshcrafting', max: 1, cost: 130, req: ['n_wraith'], desc: () => 'Abominations and Bone Golems can be unlocked.' },
  { id: 'n_vamp', b: 'N', name: 'Vampiric Covenant', max: 1, cost: 170, req: ['n_flesh'], desc: () => 'Vampires and Skeletal Wyverns can be unlocked.' },
  { id: 'n_evo', b: 'N', name: 'Rite of Ascension', max: 1, cost: 160, req: ['n_dk'], desc: () => 'Units can evolve to their third, legendary form.' },
  // Fortress
  { id: 'f_keep', b: 'F', name: 'Foundations of Dread', max: 5, cost: 10, mult: 1.6, desc: (lv: number) => `+${lv * 15}% keep health.` },
  { id: 'f_wall', b: 'F', name: 'Black Mortar', max: 5, cost: 10, mult: 1.6, desc: (lv: number) => `+${lv * 20}% wall and barricade health.` },
  { id: 'f_free', b: 'F', name: 'Cornerstone', max: 1, cost: 30, req: ['f_keep'], desc: () => 'Begin every campaign with a free Necrotic Spire.' },
  { id: 'f_towers', b: 'F', name: 'Grimoire of Spires', max: 1, cost: 30, desc: () => 'Frostbound Tower and Bone Artillery can be unlocked.' },
  { id: 'f_traps', b: 'F', name: 'Infernal Engineering', max: 1, cost: 40, req: ['f_wall'], desc: () => 'Build Lava Moats and Necrotic Runes.' },
  { id: 'f_tower_hp', b: 'F', name: 'Gargoyle Masonry', max: 3, cost: 30, mult: 1.8, req: ['f_wall'], desc: (lv: number) => `+${lv * 25}% tower durability.` },
  { id: 'f_towers2', b: 'F', name: 'Forbidden Engines', max: 1, cost: 110, req: ['f_towers'], desc: () => 'Arcane Rift and Siege Abomination can be unlocked.' },
  { id: 'f_traps2', b: 'F', name: 'Siegecraft', max: 1, cost: 90, req: ['f_traps'], desc: () => 'Build Acid Cauldrons and Ward Pylons.' },
  { id: 'f_evo', b: 'F', name: 'Tower Apotheosis', max: 1, cost: 150, req: ['f_towers'], desc: () => 'Towers can evolve to their third, legendary form.' },
  // Soul
  { id: 's_gain', b: 'S', name: 'Soul Hunger', max: 5, cost: 12, mult: 1.7, desc: (lv: number) => `+${lv * 10}% souls from all sources.` },
  { id: 's_start', b: 'S', name: 'Hoarded Souls', max: 5, cost: 8, mult: 1.6, desc: (lv: number) => `Begin campaigns with +${lv * 50} souls.` },
  { id: 's_harv', b: 'S', name: 'Harvester Rites', max: 1, cost: 25, desc: () => 'The Soul Harvester can be unlocked.' },
  { id: 's_well', b: 'S', name: 'Deep Well', max: 5, cost: 20, mult: 1.6, req: ['s_gain'], desc: (lv: number) => `Soul Well costs -${lv * 6}%.` },
  { id: 's_interest', b: 'S', name: 'Usury of the Damned', max: 3, cost: 50, mult: 1.9, req: ['s_start'], desc: (lv: number) => `Earn ${lv * 3}% interest on unspent souls after each wave (max ${lv * 60}).` },
  { id: 's_summon', b: 'S', name: 'Abyssal Pact', max: 1, cost: 80, req: ['s_well'], desc: () => 'Soul Well can summon The Abomination and the Soul Devourer.' },
  { id: 's_sumdur', b: 'S', name: 'Bound Eternity', max: 3, cost: 50, mult: 1.8, req: ['s_summon'], desc: (lv: number) => `Summons last +${lv * 25}% longer.` },
  { id: 's_dragon', b: 'S', name: 'Draconic Pact', max: 1, cost: 220, req: ['s_summon'], desc: () => 'Soul Well can summon the Infernal Dragon.' },
  // Arcane
  { id: 'a_dmg', b: 'A', name: 'Arcane Potency', max: 5, cost: 12, mult: 1.7, desc: (lv: number) => `+${lv * 12}% spell damage.` },
  { id: 'a_cd', b: 'A', name: 'Temporal Mastery', max: 5, cost: 15, mult: 1.7, desc: (lv: number) => `-${lv * 5}% spell cooldowns.` },
  { id: 'a_meteor', b: 'A', name: 'Tome of Cataclysm', max: 1, cost: 30, desc: () => 'Meteoric Cataclysm and Soul Prison can be learned.' },
  { id: 'a_time', b: 'A', name: 'Tome of Hours', max: 1, cost: 70, req: ['a_meteor'], desc: () => 'Time Distortion and Blood Harvest can be learned.' },
  { id: 'a_res', b: 'A', name: 'Tome of Unlife', max: 1, cost: 90, req: ['a_time'], desc: () => 'Unholy Resurrection can be learned.' },
  { id: 'a_start', b: 'A', name: 'Ancient Memory', max: 2, cost: 60, mult: 2, req: ['a_meteor'], desc: (lv: number) => `Begin campaigns knowing ${lv} extra random spell${lv > 1 ? 's' : ''}.` },
  { id: 'a_apoc', b: 'A', name: 'The Final Page', max: 1, cost: 260, req: ['a_res'], desc: () => 'Apocalypse can be learned.' },
  // Military
  { id: 'm_cap', b: 'M', name: 'Legions', max: 5, cost: 12, mult: 1.6, desc: (lv: number) => `Every squad you recruit raises +${lv} more undead.` },
  { id: 'm_as', b: 'M', name: 'Drums of the Dead', max: 5, cost: 15, mult: 1.7, desc: (lv: number) => `+${lv * 6}% unit attack speed.` },
  { id: 'm_start', b: 'M', name: 'Vanguard', max: 3, cost: 20, mult: 1.8, desc: (lv: number) => `Begin campaigns with ${lv} extra squad${lv > 1 ? 's' : ''} of random undead.` },
  { id: 'm_cost', b: 'M', name: 'Conscription', max: 3, cost: 25, mult: 1.8, req: ['m_cap'], desc: (lv: number) => `-${lv * 8}% recruitment cost.` },
  { id: 'm_acolyte', b: 'M', name: 'Dark Seminary', max: 1, cost: 40, req: ['m_start'], desc: () => 'Necromantic Acolytes can be unlocked.' },
  { id: 'm_reinforce', b: 'M', name: 'Grave Pact', max: 3, cost: 50, mult: 1.9, req: ['m_cost'], desc: (lv: number) => `Every Soul Well summon raises +${lv * 50}% more creatures.` },
  // Immortality
  { id: 'i_ess', b: 'I', name: 'Eternal Hunger', max: 5, cost: 20, mult: 1.7, desc: (lv: number) => `+${lv * 10}% Life Essence earned.` },
  { id: 'i_reroll', b: 'I', name: 'Foresight', max: 3, cost: 25, mult: 1.8, desc: (lv: number) => `${lv * 2} rerolls of level-up choices per campaign.` },
  { id: 'i_fort1', b: 'I', name: 'Volcanic Stronghold', max: 1, cost: 60, desc: () => 'Unlock the Volcanic Forge fortress.' },
  { id: 'i_fort2', b: 'I', name: 'Frozen Stronghold', max: 1, cost: 60, req: ['i_fort1'], desc: () => 'Unlock the Frozen Spire fortress.' },
  { id: 'i_phyl', b: 'I', name: 'Second Phylactery', max: 1, cost: 120, req: ['i_ess'], desc: () => 'Once per campaign, a fallen keep reforms at 40% health.' },
  { id: 'i_fort3', b: 'I', name: 'Cathedral Stronghold', max: 1, cost: 100, req: ['i_fort2'], desc: () => 'Unlock the Ruined Cathedral fortress.' },
  { id: 'i_start', b: 'I', name: 'Echoes of Power', max: 3, cost: 60, mult: 2, req: ['i_reroll'], desc: (lv: number) => `Begin campaigns with ${lv} free level-up${lv > 1 ? 's' : ''}.` },
  { id: 'i_fort4', b: 'I', name: 'Abyssal Stronghold', max: 1, cost: 180, req: ['i_fort3'], desc: () => 'Unlock the Abyssal Gate fortress.' },
];
export const META_BY_ID: Record<string, any> = Object.fromEntries(META.map(m => [m.id, m]));
export const metaCost = (m: any, lv: number) => Math.round(m.cost * Math.pow(m.mult || 1, lv));

// which meta node gates which content
export const CONTENT_GATES: Record<string, Record<string, string>> = {
  tower: { frost: 'f_towers', artillery: 'f_towers', arcane: 'f_towers2', abomination: 'f_towers2', harvester: 's_harv' },
  unit: { pikeman: 'n_pike', bonemage: 'n_pike', deathknight: 'n_dk', wraith: 'n_wraith', banshee: 'n_wraith', abomination: 'n_flesh', golem: 'n_flesh', vampire: 'n_vamp', wyvern: 'n_vamp', acolyte: 'm_acolyte' },
};


// ---------------- Achievements ----------------
export const ACHIEVEMENTS: any[] = [
  { id: 'first_blood', name: 'First Blood', desc: 'Slay your first mortal.', ess: 5, test: (s: any) => s.totalKills >= 1 },
  { id: 'kills_500', name: 'Reaper', desc: 'Slay 500 mortals across all campaigns.', ess: 20, test: (s: any) => s.totalKills >= 500 },
  { id: 'kills_5000', name: 'Extinction Event', desc: 'Slay 5,000 mortals.', ess: 80, test: (s: any) => s.totalKills >= 5000 },
  { id: 'wave_10', name: 'Unbroken', desc: 'Survive wave 10.', ess: 15, test: (s: any) => s.bestWave >= 10 },
  { id: 'wave_25', name: 'Eternal Siege', desc: 'Survive wave 25.', ess: 40, test: (s: any) => s.bestWave >= 25 },
  { id: 'wave_50', name: 'Dominion', desc: 'Survive wave 50.', ess: 120, test: (s: any) => s.bestWave >= 50 },
  { id: 'boss_1', name: 'Heresy', desc: 'Defeat the Grand Inquisitor.', ess: 25, test: (s: any) => s.bosses.b_inquisitor },
  { id: 'boss_2', name: 'Spellbound', desc: 'Defeat the Archmage of the Last Covenant.', ess: 40, test: (s: any) => s.bosses.b_archmage },
  { id: 'boss_3', name: 'Dragon-Slayer Slain', desc: 'Defeat the Dragon-Slayer.', ess: 60, test: (s: any) => s.bosses.b_dragonslayer },
  { id: 'boss_4', name: 'Eclipse', desc: 'Defeat the Saint of Eternal Dawn.', ess: 80, test: (s: any) => s.bosses.b_saint },
  { id: 'boss_5', name: 'Regicide', desc: 'Defeat the United Kings.', ess: 100, test: (s: any) => s.bosses.b_kings },
  { id: 'boss_6', name: 'Godslayer', desc: 'Defeat the Divine Champion.', ess: 200, test: (s: any) => s.bosses.b_champion },
  { id: 'army_20', name: 'Grand Host', desc: 'Command 40 undead at once.', ess: 20, test: (s: any) => s.maxArmy >= 40 },
  { id: 'army_200', name: 'The Endless Dead', desc: 'Command 200 undead at once.', ess: 80, test: (s: any) => s.maxArmy >= 200 },
  { id: 'towers_10', name: 'Spires of Ruin', desc: 'Have 10 towers standing at once.', ess: 20, test: (s: any) => s.maxTowers >= 10 },
  { id: 'evolve', name: 'Apotheosis', desc: 'Evolve a tower to its third form.', ess: 25, test: (s: any) => s.evolved },
  { id: 'legendary', name: 'Forbidden Knowledge', desc: 'Choose a Legendary upgrade.', ess: 20, test: (s: any) => s.legendary },
  { id: 'apocalypse', name: 'End of Days', desc: 'Cast Apocalypse.', ess: 30, test: (s: any) => s.castApoc },
  { id: 'retreat', name: 'Undying', desc: 'Retreat to a new phylactery for the first time.', ess: 10, test: (s: any) => s.runs >= 1 },
  { id: 'flawless', name: 'Untouchable', desc: 'Clear a wave of 10+ without the keep taking damage.', ess: 15, test: (s: any) => s.flawless },
];

// ---------------- The Lich speaks ----------------
export const DIALOGUE: Record<string, string[]> = {
  start: ['Another stronghold. Another century. Let them come.', 'My phylactery hums. The mortals are already marching.', 'Raise the walls. Wake the dead. We have guests.', 'They burned my last keep. How quaint. This one is better.'],
  wave: ['More of them. Always more of them.', 'March, little mortals. The grave is patient.', 'I can smell their hope. It is delicious.', 'Banners, trumpets, prayers. The usual.', 'They sing as they march. Let us give them something to scream about.', 'Each generation thinks it is the last. This time, they are right.'],
  waveClear: ['Gather the souls. Waste nothing.', 'Silence. I do so enjoy silence.', 'Their bones will make fine soldiers.', 'Was that their best? Disappointing.', 'Another wave broken upon my walls.'],
  boss: ['Ah. A champion. How I have missed these.', 'They sent a hero. I will add him to my collection.', 'Finally, something worth my attention.'],
  bossDead: ['Kneel. Oh — you already are. Dead, that is.', 'Your legend ends as a footnote in my library.', 'Rise again, champion. You serve me now.'],
  keepHit: ['They are scratching at my door!', 'Who let them reach the keep? Unacceptable.', 'My walls! Hold them back, you rattling fools!'],
  keepLow: ['The phylactery trembles... HOLD THE LINE!', 'If I fall, I will remember every one of you.'],
  levelUp: ['Knowledge, power... more.', 'The old secrets whisper to me.', 'Yes. This will do nicely.'],
  legendary: ['Forbidden power. My favourite kind.', 'Even the gods did not dare to learn this.'],
  defeat: ['This is not the end. It is never the end.', 'Enjoy your victory, mortals. It will be brief.'],
  adapt: ['They are learning. How tedious.', 'The crusade adapts. So shall I.'],
  idle: ['Patience is easy when one is immortal.', 'Build, minion. The next wave will not wait forever.'],
};

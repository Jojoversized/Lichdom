// ---------------- The Phylactery: a web of permanent upgrades (v0.12) ----------------
// Three currencies: SOULS (from every kill; the small, fast currency: more bodies, small stat steps),
// LIFE ESSENCE (from waves repelled and bosses; unlocks, buildings, moderate passives) and
// STOLEN DIVINITY (one per keep, the first time its boss falls; the rarest, strongest nodes).
// A node appears once its parent is owned and can be bought once the parent reaches `need` levels.
// Costs grow exponentially (`mult` per level); effects that should keep pace with the exponential
// keeps compound per level (×1.06 …) instead of adding.
import { UNITS, UNIT_ORDER } from './units';
import { TOWERS, TOWER_ORDER } from './towers';
import { SPELLS } from './spells';
import { BUILDINGS, BUILDING_ORDER } from './buildings';

export type Cur = 'souls' | 'essence' | 'divinity';
export interface WebNode {
  id: string; name: string; cur: Cur; max: number; cost: number; mult?: number;
  parent: string | null; need?: number; branch: string;
  icon?: string; unit?: string; tower?: string; building?: string;
  desc: (lv: number) => string;
  x?: number; y?: number; depth?: number;
}
export const CUR_NAME: Record<Cur, string> = { souls: 'Souls', essence: 'Life Essence', divinity: 'Stolen Divinity' };
export const CUR_COLOR: Record<Cur, string> = { souls: '#7dffb0', essence: '#c9a0ff', divinity: '#ffd75a' };
export const META_BRANCHES = [
  { id: 'L', name: 'The Legion', color: '#5dff7a' },
  { id: 'M', name: 'Grave Might', color: '#e06050' },
  { id: 'F', name: 'The Fortress', color: '#c0c0c8' },
  { id: 'B', name: 'The Necropolis', color: '#e8d8a8' },
  { id: 'A', name: 'The Arcane', color: '#b26bff' },
  { id: 'S', name: 'Soulcraft', color: '#7dffb0' },
];

const pct = (v: number) => `${Math.round(v * 100)}%`;
const xm = (b: number, lv: number) => `×${Math.pow(b, lv).toFixed(2)}`;
/** Undead that rise at the start of every siege for a legion node at `lv` (0 while the type is locked). */
export function legionBase(u: string) { return u === 'skeleton' ? 6 : Math.max(2, Math.round(UNITS[u].squad / 2)); }
export function legionPer(u: string) { return UNITS[u].size >= 2 ? 1 : 2; }
export function legionBodies(u: string, lv: number) { return legionBase(u) + legionPer(u) * lv; }

export const META: WebNode[] = [];
const N = (n: WebNode) => { META.push(n); return n; };
N({ id: 'core', name: 'The Phylactery', cur: 'souls', max: 1, cost: 0, parent: null, branch: 'core', icon: 'essence', desc: () => 'Your soul, hidden beyond the reach of mortals. Every rite of the web grows from here.' });

// ---- The Legion: which undead rise at the start of a siege, and how many
const UNLOCK_AFTER: Record<string, [string, number]> = {
  archer: ['skeleton', 3], zombie: ['skeleton', 5], pikeman: ['zombie', 4], wendigo: ['zombie', 8], bonemage: ['archer', 5], acolyte: ['archer', 8],
  deathknight: ['pikeman', 6], wraith: ['bonemage', 6], banshee: ['wraith', 5], vampire: ['deathknight', 6], abomination: ['wendigo', 6], golem: ['abomination', 6], wyvern: ['banshee', 6],
};
for (const u of UNIT_ORDER) {
  const d = UNITS[u], nm = d.tiers[0].name, after = UNLOCK_AFTER[u];
  if (u !== 'skeleton') N({ id: 'u_' + u, name: nm, cur: 'essence', max: 1, cost: Math.round(Math.pow(d.cost / 26, 1.7)), parent: after ? 'n_' + after[0] : 'n_skeleton', need: after ? after[1] : 3, branch: 'L', unit: u,
    desc: () => `Unlock ${nm}: ${legionBase(u)} rise at the start of every siege. ${d.desc}` });
  N({ id: 'n_' + u, name: `${nm}: Muster`, cur: 'souls', max: 60, cost: Math.round(d.cost / 7), mult: 1.3, parent: u === 'skeleton' ? 'core' : 'u_' + u, branch: 'L', unit: u,
    desc: (lv) => `${legionBodies(u, lv)} ${nm} rise at the start of every siege (+${legionPer(u)} per level).` });
  N({ id: 'e_' + u, name: `${d.tiers[1].name}`, cur: 'essence', max: 2, cost: Math.round(d.tiers[1].cost / 5), mult: 4, parent: 'n_' + u, need: 6, branch: 'L', unit: u,
    desc: (lv) => lv >= 2 ? `Your ${nm} rise as ${d.tiers[2].name}.` : lv === 1 ? `Your ${nm} rise as ${d.tiers[1].name}. Next: ${d.tiers[2].name}.` : `Evolve: all ${nm} rise as ${d.tiers[1].name}, then ${d.tiers[2].name}.` });
}

// ---- Grave Might: compounding strength for the whole host
N({ id: 'n_dmg', name: 'Grave Strength', cur: 'souls', max: 150, cost: 30, mult: 1.2, parent: 'core', branch: 'M', icon: 'frenzy', desc: (lv) => `Undead damage ${xm(1.06, lv)} (×1.06 per level).` });
N({ id: 'n_hp', name: 'Bone Hardening', cur: 'souls', max: 150, cost: 30, mult: 1.2, parent: 'core', branch: 'M', icon: 'shield', desc: (lv) => `Undead health ${xm(1.06, lv)} (×1.06 per level).` });
N({ id: 'm_as', name: 'Drums of the Dead', cur: 'souls', max: 30, cost: 120, mult: 1.45, parent: 'n_dmg', need: 5, branch: 'M', icon: 'time', desc: (lv) => `+${lv * 3}% undead attack speed.` });
N({ id: 'm_spd', name: 'Forced March', cur: 'souls', max: 10, cost: 90, mult: 1.6, parent: 'n_hp', need: 5, branch: 'M', icon: 'rally', desc: (lv) => `+${lv * 4}% undead movement speed.` });
N({ id: 'm_crit', name: 'Cruel Precision', cur: 'essence', max: 8, cost: 12, mult: 1.9, parent: 'm_as', need: 3, branch: 'M', icon: 'bomb', desc: (lv) => `+${lv * 3}% critical strike chance.` });
N({ id: 'm_regen', name: 'Unquiet Flesh', cur: 'essence', max: 5, cost: 15, mult: 2.2, parent: 'm_spd', need: 2, branch: 'M', icon: 'heal', desc: (lv) => `Undead regenerate ${(lv * 0.5).toFixed(1)}% health per second.` });
N({ id: 'a_emp', name: 'Dark Empowerment', cur: 'essence', max: 30, cost: 20, mult: 1.75, parent: 'n_dmg', need: 10, branch: 'M', icon: 'skull', desc: (lv) => `ALL damage (undead, towers, spells) ${xm(1.12, lv)}.` });
N({ id: 'a_fort', name: 'Bone Fortitude', cur: 'essence', max: 30, cost: 20, mult: 1.75, parent: 'n_hp', need: 10, branch: 'M', icon: 'shield', desc: (lv) => `Undead and keep health ${xm(1.12, lv)}.` });
N({ id: 'n_raise', name: 'Restless Dead', cur: 'essence', max: 5, cost: 25, mult: 2, parent: 'a_emp', need: 2, branch: 'M', icon: 'raise', desc: (lv) => `${lv * 4}% of slain mortals rise as temporary skeletons.` });
N({ id: 'd_night', name: 'Eternal Night', cur: 'divinity', max: 1, cost: 1, parent: 'a_fort', need: 3, branch: 'M', icon: 'apocalypse', desc: () => 'The sun never rises on your sieges: every undead deals double damage and has double health.' });
N({ id: 'd_host', name: 'The Endless Host', cur: 'divinity', max: 1, cost: 1, parent: 'a_emp', need: 3, branch: 'M', icon: 'rally', desc: () => 'Half again as many undead of every type rise at the start of a siege (+50%).' });

// ---- The Fortress: keep, ramparts, towers and traps (you place towers and walls before each wave)
N({ id: 'f_keep', name: 'Foundations of Dread', cur: 'souls', max: 150, cost: 25, mult: 1.2, parent: 'core', branch: 'F', icon: 'keep', desc: (lv) => `Keep health ${xm(1.08, lv)} (×1.08 per level).` });
N({ id: 'f_walls', name: 'Ramparts', cur: 'souls', max: 8, cost: 80, mult: 1.9, parent: 'f_keep', need: 2, branch: 'F', icon: 'wall', desc: (lv) => `Raise up to ${lv} rampart segment${lv === 1 ? '' : 's'} per siege (of 8). You choose which.` });
N({ id: 'f_wall', name: 'Black Mortar', cur: 'souls', max: 100, cost: 60, mult: 1.22, parent: 'f_walls', branch: 'F', icon: 'wall', desc: (lv) => `Wall, trap and tower durability ${xm(1.1, lv)}.` });
N({ id: 'f_walltier', name: 'Masonry of the Dead', cur: 'essence', max: 2, cost: 30, mult: 5, parent: 'f_walls', need: 3, branch: 'F', icon: 'wall', desc: (lv) => `Ramparts are raised as ${['Bone Palisades', 'Stone Walls', 'Bone Ramparts (wound attackers)'][lv]}.` });
N({ id: 'f_towers', name: 'Spire Foundations', cur: 'essence', max: 14, cost: 10, mult: 1.6, parent: 'f_walls', branch: 'F', tower: 'necrotic', desc: (lv) => `Stand up to ${lv} tower${lv === 1 ? '' : 's'} on your ramparts per siege. The Necrotic Spire is known from the first.` });
for (const t of TOWER_ORDER) if (t !== 'necrotic') N({ id: 't_' + t, name: TOWERS[t].name, cur: 'essence', max: 1, cost: Math.round(TOWERS[t].cost / 5), parent: 'f_towers', need: 1 + TOWER_ORDER.indexOf(t) % 4, branch: 'F', tower: t, desc: () => `Unlock: ${TOWERS[t].desc}` });
N({ id: 'f_tdmg', name: 'Grimoire of Spires', cur: 'souls', max: 150, cost: 50, mult: 1.2, parent: 'f_towers', branch: 'F', icon: 'storm', desc: (lv) => `Tower damage ${xm(1.07, lv)} (×1.07 per level).` });
N({ id: 'f_ttier', name: 'Tower Apotheosis', cur: 'essence', max: 2, cost: 60, mult: 6, parent: 'f_tdmg', need: 5, branch: 'F', icon: 'level', desc: (lv) => `Every tower is raised at tier ${['I', 'II', 'III (evolved)'][lv]}.` });
N({ id: 'f_traps', name: 'Trapworks', cur: 'souls', max: 12, cost: 60, mult: 1.6, parent: 'f_keep', need: 4, branch: 'F', icon: 'spikes', desc: (lv) => `Lay up to ${lv * 3} traps and barricades per siege.` });
N({ id: 'f_traps1', name: 'Infernal Engineering', cur: 'essence', max: 1, cost: 18, parent: 'f_traps', branch: 'F', icon: 'lava', desc: () => 'Lava Moats and Necrotic Runes can be laid.' });
N({ id: 'f_traps2', name: 'Siegecraft', cur: 'essence', max: 1, cost: 45, parent: 'f_traps1', branch: 'F', icon: 'cauldron', desc: () => 'Acid Cauldrons and Ward Pylons can be laid.' });
N({ id: 'i_phyl', name: 'Second Phylactery', cur: 'divinity', max: 1, cost: 1, parent: 'f_keep', need: 10, branch: 'F', icon: 'essence', desc: () => 'Once per siege, a fallen keep reforms at 40% health and scours the field.' });

// ---- The Necropolis: buildings that stand in the bailey in every siege
for (const b of BUILDING_ORDER) {
  const d = BUILDINGS[b], i = BUILDING_ORDER.indexOf(b);
  N({ id: 'b_' + b, name: d.name, cur: 'essence', max: 3, cost: d.cost[0], mult: 3.2, parent: i < 2 ? 'core' : 'b_' + BUILDING_ORDER[i - 2], branch: 'B', building: b,
    desc: (lv) => `${d.desc} Stands in the bailey at the start of every siege. ${lv ? `Now ${lv} × (${d.per}).` : `Each level: ${d.per}.`}` });
}

// ---- The Arcane: the Lich's own power, spells and summons
N({ id: 'a_dmg', name: 'Arcane Potency', cur: 'souls', max: 150, cost: 35, mult: 1.2, parent: 'core', branch: 'A', icon: 'deathwave', desc: (lv) => `Spell and Lich damage ${xm(1.08, lv)} (×1.08 per level).` });
N({ id: 'a_cd', name: 'Temporal Mastery', cur: 'souls', max: 10, cost: 150, mult: 1.7, parent: 'a_dmg', need: 4, branch: 'A', icon: 'time', desc: (lv) => `-${lv * 4}% spell cooldowns.` });
const SPELL_NODES: [string, string, number, number, Cur][] = [
  ['prison', 'a_dmg', 3, 12, 'essence'], ['meteor', 'a_dmg', 6, 20, 'essence'], ['frenzy', 'sp_prison', 1, 25, 'essence'], ['time', 'sp_meteor', 1, 45, 'essence'], ['blood', 'sp_meteor', 1, 40, 'essence'],
  ['ward', 'sp_frenzy', 1, 50, 'essence'], ['storm', 'sp_time', 1, 110, 'essence'], ['resurrect', 'sp_blood', 1, 90, 'essence'],
  ['legion', 'a_cd', 2, 35, 'essence'], ['wraiths', 'sp_legion', 1, 80, 'essence'], ['colossus', 'sp_wraiths', 1, 180, 'essence'], ['abom', 'sp_colossus', 1, 320, 'essence'], ['devourer', 'sp_abom', 1, 600, 'essence'],
  ['apocalypse', 'sp_storm', 1, 1, 'divinity'], ['dragon', 'sp_devourer', 1, 1, 'divinity'],
];
for (const [s, parent, need, cost, cur] of SPELL_NODES) N({ id: 'sp_' + s, name: SPELLS[s].name, cur, max: 1, cost, parent, need, branch: 'A', icon: SPELLS[s].icon, desc: () => `Learn the spell: ${SPELLS[s].desc}` });
N({ id: 'm_reinforce', name: 'Grave Pact', cur: 'essence', max: 3, cost: 60, mult: 3, parent: 'sp_legion', branch: 'A', icon: 'raise', desc: (lv) => `Summoning spells raise +${lv * 50}% more creatures.` });
N({ id: 's_sumdur', name: 'Bound Eternity', cur: 'essence', max: 4, cost: 40, mult: 2.4, parent: 'sp_wraiths', branch: 'A', icon: 'time', desc: (lv) => `Summoned creatures last +${lv * 25}% longer.` });

// ---- Soulcraft: economy, the level-up deck and the Lich's foresight
N({ id: 'x_xp', name: 'Ancient Wisdom', cur: 'souls', max: 20, cost: 40, mult: 1.5, parent: 'core', branch: 'S', icon: 'level', desc: (lv) => `+${lv * 8}% experience: more level-up choices during a siege.` });
N({ id: 's_gain', name: 'Soul Hunger', cur: 'essence', max: 20, cost: 15, mult: 1.9, parent: 'x_xp', need: 2, branch: 'S', icon: 'soul', desc: (lv) => `Souls from every source ${xm(1.15, lv)}.` });
N({ id: 'i_ess', name: 'Eternal Hunger', cur: 'essence', max: 20, cost: 30, mult: 2.1, parent: 's_gain', need: 2, branch: 'S', icon: 'essence', desc: (lv) => `Life Essence earned ${xm(1.12, lv)}.` });
N({ id: 'i_reroll', name: 'Foresight', cur: 'essence', max: 4, cost: 10, mult: 2, parent: 'x_xp', need: 1, branch: 'S', icon: 'level', desc: (lv) => `${1 + lv * 2} rerolls and ${1 + lv} banishes of level-up choices per siege.` });
N({ id: 'i_start', name: 'Echoes of Power', cur: 'essence', max: 5, cost: 25, mult: 2.4, parent: 'i_reroll', need: 1, branch: 'S', icon: 'level', desc: (lv) => `Begin every siege with ${lv} free level-up${lv === 1 ? '' : 's'}.` });
N({ id: 'c_reinforce', name: 'Unbidden Dead', cur: 'essence', max: 1, cost: 8, parent: 'x_xp', need: 3, branch: 'S', icon: 'raise', desc: () => 'Level-up deck: Reinforcement cards (fresh undead rise mid-siege).' });
N({ id: 'c_greater', name: 'Greater Rites', cur: 'essence', max: 1, cost: 20, parent: 'c_reinforce', branch: 'S', icon: 'skull', desc: () => 'Level-up deck: the stronger tier of every Power card.' });
N({ id: 'c_tactics', name: 'Battle Doctrines', cur: 'essence', max: 1, cost: 35, parent: 'c_greater', branch: 'S', icon: 'rally', desc: () => 'Level-up deck: special modifiers for the undead types you field.' });
N({ id: 'c_engineer', name: 'Siege Doctrines', cur: 'essence', max: 1, cost: 35, parent: 'c_greater', branch: 'S', icon: 'storm', desc: () => 'Level-up deck: special modifiers for the towers you raise.' });
N({ id: 'c_unique', name: 'Forbidden Rites', cur: 'essence', max: 1, cost: 90, parent: 'c_tactics', branch: 'S', icon: 'rune', desc: () => 'Level-up deck: unique rites (Unholy Covenant, Death Knell, Unending…).' });
N({ id: 'c_legend', name: 'Crown of Forbidden Knowledge', cur: 'divinity', max: 1, cost: 1, parent: 'c_unique', branch: 'S', icon: 'level', desc: () => 'Level-up deck: Legendary cards can appear.' });
N({ id: 'd_tithe', name: 'Tithe of the Gods', cur: 'divinity', max: 1, cost: 1, parent: 'i_ess', need: 2, branch: 'S', icon: 'soul', desc: () => 'Souls from every source are doubled; Life Essence +50%.' });

export const META_BY_ID: Record<string, WebNode> = Object.fromEntries(META.map(m => [m.id, m]));
export const metaCost = (m: WebNode, lv: number) => Math.round(m.cost * Math.pow(m.mult || 1, lv));
export const CHILDREN: Record<string, WebNode[]> = {};
for (const m of META) if (m.parent) (CHILDREN[m.parent] || (CHILDREN[m.parent] = [])).push(m);

// ---- layout: a radial web around the Phylactery. Every node claims at least SLOT px of arc at its own ring,
// a parent spans what its children need, and the ring spacing grows until the whole web fits the circle.
export const WEB = { ring: 0, radius: 0 };
(function layout() {
  const SLOT = 100, R0 = 150;
  let ring = 104;
  const rad = (d: number) => d ? R0 + (d - 1) * ring : 0;
  const need = (m: WebNode, d: number): number => { const own = d ? SLOT / rad(d) : 0, c = CHILDREN[m.id]; return Math.max(own, c ? c.reduce((a, k) => a + need(k, d + 1), 0) : 0); };
  while (need(META_BY_ID.core, 0) > Math.PI * 2 && ring < 400) ring += 6;
  let maxD = 0;
  const place = (m: WebNode, a0: number, a1: number, d: number) => {
    const a = (a0 + a1) / 2, r = rad(d);
    m.x = Math.round(Math.cos(a) * r); m.y = Math.round(Math.sin(a) * r); m.depth = d; maxD = Math.max(maxD, d);
    const kids = CHILDREN[m.id]; if (!kids) return;
    const needs = kids.map(k => need(k, d + 1)), tot = needs.reduce((x, y) => x + y, 0);
    const span = d ? Math.min(a1 - a0, tot) : a1 - a0, scale = span / tot; // the root spreads its branches over the full circle
    let t = a - span / 2;
    kids.forEach((k, i) => { place(k, t, t + needs[i] * scale, d + 1); t += needs[i] * scale; });
  };
  place(META_BY_ID.core, -Math.PI / 2 - Math.PI, -Math.PI / 2 + Math.PI, 0);
  WEB.ring = ring; WEB.radius = rad(maxD);
})();

/** Which level-up card groups need which web node. */
export const CARD_GATES: Record<string, string> = { greater: 'c_greater', reinforce: 'c_reinforce', unitmod: 'c_tactics', towermod: 'c_engineer', unique: 'c_unique', legend: 'c_legend' };

// ---------------- Achievements ----------------
export const ACHIEVEMENTS: any[] = [
  { id: 'first_blood', name: 'First Blood', desc: 'Slay your first mortal.', ess: 5, test: (s: any) => s.totalKills >= 1 },
  { id: 'kills_500', name: 'Reaper', desc: 'Slay 500 mortals across all campaigns.', ess: 20, test: (s: any) => s.totalKills >= 500 },
  { id: 'kills_5000', name: 'Extinction Event', desc: 'Slay 5,000 mortals.', ess: 80, test: (s: any) => s.totalKills >= 5000 },
  { id: 'wave_5', name: 'Unbroken', desc: 'Repel 5 waves in one siege.', ess: 8, test: (s: any) => s.bestWave >= 5 },
  { id: 'wave_9', name: 'Eternal Siege', desc: 'Reach the boss of a keep.', ess: 20, test: (s: any) => s.bestWave >= 9 },
  { id: 'keeps_3', name: 'Dominion', desc: 'Conquer three keeps.', ess: 400, test: (s: any) => s.keeps >= 3 },
  { id: 'runs_10', name: 'Patience of the Grave', desc: 'Fight 10 sieges.', ess: 15, test: (s: any) => s.runs >= 10 },
  { id: 'boss_1', name: 'Heresy', desc: 'Defeat the Grand Inquisitor.', ess: 25, test: (s: any) => s.bosses.b_inquisitor },
  { id: 'boss_2', name: 'Spellbound', desc: 'Defeat the Archmage of the Last Covenant.', ess: 100, test: (s: any) => s.bosses.b_archmage },
  { id: 'boss_3', name: 'Dragon-Slayer Slain', desc: 'Defeat the Dragon-Slayer.', ess: 400, test: (s: any) => s.bosses.b_dragonslayer },
  { id: 'boss_4', name: 'Eclipse', desc: 'Defeat the Saint of Eternal Dawn.', ess: 1600, test: (s: any) => s.bosses.b_saint },
  { id: 'boss_5', name: 'Regicide', desc: 'Defeat the United Kings.', ess: 6400, test: (s: any) => s.bosses.b_kings },
  { id: 'boss_6', name: 'Godslayer', desc: 'Defeat the Divine Champion.', ess: 25000, test: (s: any) => s.bosses.b_champion },
  { id: 'army_20', name: 'Grand Host', desc: 'Command 40 undead at once.', ess: 20, test: (s: any) => s.maxArmy >= 40 },
  { id: 'army_200', name: 'The Endless Dead', desc: 'Command 200 undead at once.', ess: 80, test: (s: any) => s.maxArmy >= 200 },
  { id: 'towers_10', name: 'Spires of Ruin', desc: 'Have 10 towers standing at once.', ess: 20, test: (s: any) => s.maxTowers >= 10 },
  { id: 'evolve', name: 'Apotheosis', desc: 'Raise a tower in its third form.', ess: 25, test: (s: any) => s.evolved },
  { id: 'legendary', name: 'Forbidden Knowledge', desc: 'Choose a Legendary upgrade.', ess: 20, test: (s: any) => s.legendary },
  { id: 'apocalypse', name: 'End of Days', desc: 'Cast Apocalypse.', ess: 30, test: (s: any) => s.castApoc },
  { id: 'retreat', name: 'Undying', desc: 'Return to the Phylactery after your first siege.', ess: 10, test: (s: any) => s.runs >= 1 },
  { id: 'flawless', name: 'Untouchable', desc: 'Clear a wave of 10+ without the keep taking damage.', ess: 15, test: (s: any) => s.flawless },
];

// ---------------- The Lich speaks ----------------
export const DIALOGUE: Record<string, string[]> = {
  victory: ['Another keep is mine. And a sliver of their god with it.', 'Divinity tastes of honey and ash.', 'Their champion kneels. Their heaven is one light dimmer.'],
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

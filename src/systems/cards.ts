// Level-up card pool (three-choice roguelite upgrades).
import { G } from '../core/state';
import { lichSay } from '../core/events';
import { TOWERS, TOWER_ORDER } from '../data/towers';
import { UNITS, UNIT_ORDER } from '../data/units';
import { SPELLS, SPELL_ORDER } from '../data/spells';
import { contentAvailable, metaLv, recalcKeep, recalcAllStats, fortMaxHp, towerMaxHp } from './stats';

// ============================================================
// Level-up card pool (three-choice roguelite upgrades)
// ============================================================
export const RARITY = [
  { name: 'Common', color: '#b8b8b0', w: 50 },
  { name: 'Uncommon', color: '#5dff7a', w: 28 },
  { name: 'Rare', color: '#4aa8ff', w: 14 },
  { name: 'Epic', color: '#b26bff', w: 6 },
  { name: 'Legendary', color: '#ffb02e', w: 2 },
];

function hasTower(r: any, t: string) { return r.unlockedTowers.includes(t); }
function hasUnit(r: any, u: string) { return r.unlockedUnits.includes(u); }
export function ownsTower(t: string) { return G.towers.some(x => x.type === t && !x.dead); }
export function ownsUnit(u: string) { return G.units.some(x => x.type === u && !x.dead && !x.summon); }
function modN(r: any, id: string) { return r.mods[id] || 0; }

export function buildCardPool(): any[] {
  const C: any[] = [];
  const add = (c: any) => C.push(c);
  // ---- generic stat cards
  const stat = (id: string, name: string, rar: number, desc: string, apply: (r: any) => void, max = 99, icon = 'skull') => add({ id, name, rar, cat: 'Power', desc, apply, max, icon, req: () => true });
  stat('dmg1', 'Malevolence', 0, '+10% damage for everything you command.', (r: any) => r.m.dmg += 0.10);
  stat('dmg2', 'Profound Malevolence', 1, '+20% damage for everything you command.', (r: any) => r.m.dmg += 0.20);
  stat('tas1', 'Quickened Rituals', 0, '+10% tower attack speed.', (r: any) => r.m.towerAs += 0.10, 99, 'time');
  stat('tas2', 'Frenzied Rituals', 1, '+20% tower attack speed.', (r: any) => r.m.towerAs += 0.20, 99, 'time');
  stat('rng1', 'Far Sight', 1, '+10% tower range.', (r: any) => r.m.range += 0.10, 5, 'level');
  stat('uhp1', 'Hardened Bone', 0, '+15% unit health.', (r: any) => r.m.unitHp += 0.15, 99, 'shield');
  stat('uhp2', 'Ironbone Marrow', 1, '+30% unit health.', (r: any) => r.m.unitHp += 0.30, 99, 'shield');
  stat('udm1', 'Sharpened Bone', 0, '+12% unit damage.', (r: any) => r.m.unitDmg += 0.12, 99, 'frenzy');
  stat('udm2', 'Grave Fury', 1, '+25% unit damage.', (r: any) => r.m.unitDmg += 0.25, 99, 'frenzy');
  stat('uas1', 'Rattling Haste', 1, '+15% unit attack and move speed.', (r: any) => { r.m.unitAs += 0.15; r.m.unitSpd += 0.1; }, 99, 'frenzy');
  stat('crit1', 'Cruel Precision', 1, '+6% critical strike chance (x2 damage).', (r: any) => r.m.crit += 0.06, 6, 'bomb');
  stat('crit2', 'Executioner', 3, 'Critical strikes deal x3 damage instead of x2. +5% crit chance.', (r: any) => { r.m.critMult = 3; r.m.crit += 0.05; }, 1, 'bomb');
  stat('soul1', 'Soul Greed', 0, '+15% souls from kills.', (r: any) => r.m.souls += 0.15, 99, 'soul');
  stat('soul2', 'Soul Gluttony', 2, '+35% souls from kills.', (r: any) => r.m.souls += 0.35, 99, 'soul');
  stat('cap1', 'Mass Graves', 0, '+2 unit capacity.', (r: any) => r.m.cap += 2, 99, 'rally');
  stat('cap2', 'Necropolis', 2, '+5 unit capacity.', (r: any) => r.m.cap += 5, 99, 'rally');
  stat('keep1', 'Fortified Phylactery', 0, '+20% keep max health and heal 25%.', (r: any) => { r.m.keep += 0.2; recalcKeep(); G.keep.hp = Math.min(G.keep.maxHp, G.keep.hp + G.keep.maxHp * 0.25); }, 99, 'keep');
  stat('wall1', 'Bone Mortar', 0, '+30% wall and barricade health.', (r: any) => { r.m.wallHp += 0.3; G.forts.forEach((f: any) => { if (f.def.hp) { const nm = fortMaxHp(f); f.hp += nm - f.maxHp; f.maxHp = nm; } }); }, 99, 'wall');
  stat('cd1', 'Swift Incantations', 1, '-10% spell cooldowns.', (r: any) => r.m.spellCd *= 0.9, 5, 'time');
  stat('sdm1', 'Dark Potency', 0, '+20% spell damage.', (r: any) => r.m.spellDmg += 0.2, 99, 'deathwave');
  stat('xp1', 'Ancient Wisdom', 0, '+20% experience gained.', (r: any) => r.m.xp += 0.2, 5, 'level');
  stat('thp1', 'Warded Stone', 0, '+30% tower durability. Repairs all towers.', (r: any) => { r.m.towerHp += 0.3; G.towers.forEach((t: any) => { t.maxHp = towerMaxHp(t); t.hp = t.maxHp; }); }, 99, 'wall');
  // keep battlements
  add({ id: 'keepbolt', name: 'Lich\'s Wrath', rar: 1, cat: 'Power', icon: 'deathwave', desc: 'The Lich\'s own bolts deal +40% damage and fire 20% faster.', max: 99, req: () => true, apply: (r: any) => { r.m.lichDmg += 0.4; r.m.lichAs += 0.2; } });
  add({ id: 'lichchain', name: 'Grasping Malice', rar: 2, cat: 'Power', icon: 'storm', desc: 'The Lich hurls an extra bolt each attack.', max: 3, req: () => true, apply: (r: any) => r.m.lichBolts += 1 });

  // ---- tower unlocks
  for (const t of TOWER_ORDER) {
    add({ id: 'unlock_t_' + t, name: TOWERS[t].name, rar: t === 'abomination' || t === 'arcane' ? 3 : 2, cat: 'New Tower', tower: t, desc: 'Unlock: ' + TOWERS[t].desc, max: 1,
      req: (r: any) => !hasTower(r, t) && contentAvailable('tower', t), apply: (r: any) => r.unlockedTowers.push(t) });
    add({ id: 'tdmg_' + t, name: `${TOWERS[t].name} Mastery`, rar: 0, cat: 'Tower', tower: t, desc: `+30% ${TOWERS[t].name} damage.`, max: 99,
      req: (r: any) => hasTower(r, t) && ownsTower(t) && TOWERS[t].dmg > 0, apply: (r: any) => r.towerDmg[t] = (r.towerDmg[t] || 0) + 0.3 });
  }
  // ---- unit unlocks
  for (const u of UNIT_ORDER) {
    add({ id: 'unlock_u_' + u, name: UNITS[u].name, rar: UNITS[u].cap >= 3 ? 3 : 2, cat: 'New Unit', unit: u, desc: 'Unlock: ' + UNITS[u].desc, max: 1,
      req: (r: any) => !hasUnit(r, u) && contentAvailable('unit', u), apply: (r: any) => r.unlockedUnits.push(u) });
    add({ id: 'udmg_' + u, name: `${UNITS[u].name} Drill`, rar: 0, cat: 'Unit', unit: u, desc: `+30% ${UNITS[u].name} damage and health.`, max: 99,
      req: (r: any) => hasUnit(r, u) && ownsUnit(u), apply: (r: any) => { r.unitBuff[u] = (r.unitBuff[u] || 0) + 0.3; } });
  }
  // ---- spell unlocks
  for (const s of SPELL_ORDER) {
    add({ id: 'spell_' + s, name: SPELLS[s].name, rar: s === 'apocalypse' ? 4 : 3, cat: 'New Spell', icon: SPELLS[s].icon, desc: 'Learn spell: ' + SPELLS[s].desc, max: 1,
      req: (r: any) => !r.spells.includes(s) && (!SPELLS[s].meta || metaLv(SPELLS[s].meta) > 0), apply: (r: any) => r.spells.push(s) });
  }
  // ---- special modifiers
  const mod = (id: string, name: string, rar: number, desc: string, req: (r: any) => boolean, max = 1, extra: any = {}) => add(Object.assign({ id, name, rar, cat: 'Modifier', desc, max, req, apply: (r: any) => r.mods[id] = (r.mods[id] || 0) + 1 }, extra));
  const T = (t: string) => (r: any) => hasTower(r, t) && ownsTower(t);
  const U = (u: string) => (r: any) => hasUnit(r, u) && ownsUnit(u);
  mod('brim_split', 'Splitting Hellfire', 2, 'Brimstone fireballs burst into 3 smaller fireballs on impact.', T('brimstone'), 1, { tower: 'brimstone' });
  mod('brim_inferno', 'Everburning Pitch', 1, 'Brimstone burning ground deals double damage and lasts twice as long.', T('brimstone'), 1, { tower: 'brimstone' });
  mod('tesla_chain', 'Conductive Souls', 2, 'Tesla lightning chains through twice as many enemies.', T('tesla'), 1, { tower: 'tesla' });
  mod('tesla_stun', 'Overload', 1, 'Tesla lightning has a 20% chance to stun for 0.7s.', T('tesla'), 1, { tower: 'tesla' });
  mod('tesla_net', 'Storm Network', 3, 'Tesla Obelisks within 170px link with permanent arcs that burn enemies crossing them.', (r: any) => T('tesla')(r) && G.towers.filter((t: any) => t.type === 'tesla').length >= 1, 1, { tower: 'tesla' });
  mod('necro_raise', 'Grave Calling', 2, 'Enemies slain by Necrotic Spires have a 50% chance to rise as skeletons for 25s.', T('necrotic'), 1, { tower: 'necrotic' });
  mod('necro_spread', 'Contagion', 1, 'Necrotic Spire damage spreads 40% to 2 nearby enemies.', T('necrotic'), 1, { tower: 'necrotic' });
  mod('frost_shatter', 'Shatter', 2, 'Frozen enemies that die explode in ice shards (30% of their max health).', T('frost'), 1, { tower: 'frost' });
  mod('frost_formation', 'Absolute Zero', 3, 'Frostbound freezes apply to every enemy in the blast; freezes last 50% longer.', T('frost'), 1, { tower: 'frost' });
  mod('art_quake', 'Marrow Quake', 2, 'Bone Artillery bolts stun for 0.6s and their splash is doubled.', T('artillery'), 1, { tower: 'artillery' });
  mod('arcane_multi', 'Fractured Reality', 2, 'Arcane Rifts fire +2 bolts per volley.', T('arcane'), 2, { tower: 'arcane' });
  mod('arcane_chaos', 'Chaos Weave', 1, 'Arcane bolts randomly burn, freeze or weaken their target.', T('arcane'), 1, { tower: 'arcane' });
  mod('harv_aura', 'Soul Resonance', 2, 'Soul Harvesters grant +25% attack speed to towers in their range.', T('harvester'), 1, { tower: 'harvester' });
  mod('abom_hook', 'Meat Hooks', 2, 'Siege Abominations hook and drag distant enemies into their maw.', T('abomination'), 1, { tower: 'abomination' });
  mod('skel_shield', 'Bone Bulwark', 1, 'Skeleton Warriors gain +20% armor and block 30% of projectile damage.', U('skeleton'), 1, { unit: 'skeleton' });
  mod('arch_explosive', 'Explosive Arrows', 2, 'Skeleton Archer arrows explode, damaging nearby enemies.', U('archer'), 1, { unit: 'archer' });
  mod('arch_volley', 'Volley', 1, 'Skeleton Archers loose two arrows at once.', U('archer'), 1, { unit: 'archer' });
  mod('zom_explode', 'Corpse Bombs', 2, 'Zombies explode on death, dealing heavy necrotic damage.', U('zombie'), 1, { unit: 'zombie' });
  mod('zom_plague', 'Plague Bearers', 1, 'Zombie attacks inflict a spreading plague.', U('zombie'), 1, { unit: 'zombie' });
  mod('dk_regen', 'Unholy Vigor', 2, 'Death Knights heal 20% of max health on every kill.', U('deathknight'), 1, { unit: 'deathknight' });
  mod('acolyte_perm', 'Eternal Servitude', 3, 'Acolytes raise enemies as permanent skeletons (up to 10 extra).', U('acolyte'), 1, { unit: 'acolyte' });
  mod('mage_chain', 'Ricocheting Bone', 2, 'Bone Mage bolts bounce to 2 more targets.', U('bonemage'), 1, { unit: 'bonemage' });
  mod('pike_wall', 'Hedge of Spears', 1, 'Pikemen deal +60% damage and knock back attackers.', U('pikeman'), 1, { unit: 'pikeman' });
  mod('wraith_terror', 'Terror', 2, 'Wraith strikes terrify enemies, making them flee for 1.5s.', U('wraith'), 1, { unit: 'wraith' });
  mod('vamp_feast', 'Blood Feast', 2, 'Vampire lifesteal also heals all undead within 50px.', U('vampire'), 1, { unit: 'vampire' });
  mod('golem_quake', 'Tremor', 2, 'Bone Golem slams stun enemies for 1s.', U('golem'), 1, { unit: 'golem' });
  mod('unit_rise', 'Unending', 3, 'Undead units have a 30% chance to reassemble once after dying.', (r: any) => G.units.length >= 4, 1);
  mod('feast', 'Feast of Souls', 2, 'Every kill heals undead within 70px by 6% of their max health.', (r: any) => G.units.length >= 3, 1);
  mod('volatile', 'Volatile Remains', 2, '25% of slain mortals explode in necrotic fire.', () => true, 1);
  mod('keep_spikes', 'Bone Spires', 1, 'The keep impales attackers for heavy damage every second.', () => true, 1);
  // ---- legendaries
  mod('leg_storm', 'Eye of the Storm', 4, 'All Tesla Obelisks link across any distance; +3 chains; arcs deal triple damage.', T('tesla'), 1, { tower: 'tesla' });
  mod('leg_hellfire', 'Hellgate', 4, 'Every 10s each Brimstone Tower calls a meteor on a random enemy.', T('brimstone'), 1, { tower: 'brimstone' });
  mod('leg_legion', 'Legion of the Damned', 4, '20% of slain mortals rise as skeleton warriors for 40s.', () => true, 1);
  mod('leg_crown', 'Crown of the Lich-King', 4, 'Spell cooldowns -40%. Spell damage +60%.', (r: any) => r.spells.length >= 2, 1);
  mod('leg_soulfire', 'Soulfire', 4, 'All towers +25% damage. Each kill launches a soul bolt at another enemy.', (r: any) => G.towers.length >= 3, 1);
  mod('leg_bulwark', 'Bones of the Earth', 4, 'Walls have +100% health, regenerate 3%/s and damage attackers.', (r: any) => G.forts.filter((f: any) => f.def.block).length >= 6, 1);
  return C;
}

let CARD_POOL: any[] = null;

export function rollCards(n = 3): any[] {
  const r = G.run;
  if (!CARD_POOL) CARD_POOL = buildCardPool();
  const eligible = CARD_POOL.filter((c: any) => (r.picks[c.id] || 0) < c.max && !r.banished.includes(c.id) && c.req(r));
  const out: any[] = [];
  const lvBonus = Math.min(1, r.level / 30);
  for (let i = 0; i < n && eligible.length; i++) {
    // pick rarity first, then card within rarity (fallback lower)
    const weights = RARITY.map((ra: any, idx: number) => ra.w * (idx >= 2 ? 1 + lvBonus * 1.5 : 1));
    let tot = weights.reduce((a, b) => a + b, 0), roll = Math.random() * tot, rar = 0;
    for (let k = 0; k < weights.length; k++) { roll -= weights[k]; if (roll <= 0) { rar = k; break; } }
    let cands: any[] = [];
    for (let rr = rar; rr >= 0 && !cands.length; rr--) cands = eligible.filter((c: any) => c.rar === rr && !out.includes(c));
    if (!cands.length) cands = eligible.filter((c: any) => !out.includes(c));
    if (!cands.length) break;
    // prefer relevant: modifiers/tower-specific for things owned get weight boost
    const w = cands.map((c: any) => (c.tower && ownsTower(c.tower)) || (c.unit && ownsUnit(c.unit)) ? 2.5 : 1);
    let tw = w.reduce((a, b) => a + b, 0), rl = Math.random() * tw, ch = cands[0];
    for (let k = 0; k < cands.length; k++) { rl -= w[k]; if (rl <= 0) { ch = cands[k]; break; } }
    out.push(ch);
  }
  return out;
}

export function applyCard(c: any) {
  const r = G.run;
  r.picks[c.id] = (r.picks[c.id] || 0) + 1;
  c.apply(r);
  if (c.rar === 4) { G.stats.legendary = true; lichSay('legendary'); }
  recalcAllStats();
}

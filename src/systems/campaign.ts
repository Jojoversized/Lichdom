// Siege flow (v0.12): begin/load a siege of a keep, its 10 waves, wave-end revival,
// spells and the main simulation step.
import { G } from '../core/state';
import { rnd, rndi, pick, dist2, TAU } from '../core/util';
import { KEEP, LANES, PAL, WW, WH } from '../config/constants';
import { ENEMIES, BOSSES } from '../data/enemies';
import { UNITS, UNIT_ORDER, SUMMONS } from '../data/units';
import { SPELLS, SPELL_ORDER, BASE_SPELLS } from '../data/spells';
import { KEEPS, WAVES_PER_KEEP } from '../data/world';
import { TOWER_ORDER } from '../data/towers';
import { msg, lichSay, sfx, hooks } from '../core/events';
import { generateMap, computeFlow } from '../world/mapgen';
import { metaLv, recalcKeep, squadSize, globalDmg, computeFervor, bountyMult, soulMult, essenceMult, waveEssence, recalcAllStats, bld, keepIdx, waveTech, keepUnlocked, musterCount, unitOwned, towerKnown, arcanePower } from './stats';
import { rebuildRuins, spawnBuilding, plotById, raiseBuildings, applyLayout, rememberLayout } from './keep';
import { mendRamparts } from './ramparts';
import { CRUSADE_TIERS } from '../data/events';
import { GATE } from '../data/fortress';
import { rogue, tierMods, waveMods, afterWave, stepRogue } from './events';
import {
  spawnUnit, spawnSummon, spawnEnemy, placeTower, placeFort, fireProjectile, aoeDamage, dealDamage, addHazard, raiseCorpse,
  updateProjectiles, updateHazards, bakeCorpse, NEUTRAL_SRC,
} from './combat';
import { addRing, addFlash, addText, lightningBolt } from './fx';
import { updateEnemy, updateUnit, updateTower, updateFort, updateLich, updateNetArcs, planArmy } from './ai';
import { xpForLevel, codexSee, checkAchievements, endCampaign } from './progression';
import { announceBoss } from './bosses';
import { defaultMods, saveRun, saveMeta, saveMetaSoon, readRunSave } from './save';
import { anStart, anResume, anPick, anWaveStart, anWaveEnd } from './analytics';

export function resetWorld() {
  for (const k of ['units', 'enemies', 'towers', 'forts', 'buildings', 'corpses', 'dying']) for (const o of G[k]) if (o.view || o.shadow) G.retired.push(o);
  for (const k of ['units', 'enemies', 'towers', 'forts', 'buildings', 'projectiles', 'particles', 'hazards', 'corpses', 'dying', 'texts', 'bolts', 'rings', 'flashes', 'netArcs', 'waveFx', 'timers', 'decalQueue']) G[k].length = 0;
  G.keep.ward = 0; G.tdT = 0; G.frenzyT = 0; G.stormT = 0; G.extraRaised = 0; G.citadelRaised = 0; G.fleshZombies = 0;
  G.selected = null; G.build = null; G.wave = null; G.bossBar = null; G.bossIntro = null; G.speech = null;
  G.worldVersion = (G.worldVersion || 0) + 1; // tells the renderer to rebuild every view
}

function newRunState(keep: number, seed: number) {
  const m = defaultMods(); m.crit += metaLv('m_crit') * 0.03;
  return {
    keep, fortress: KEEPS[keep].fort, seed, wave: 0, level: 1, xp: 0, xpNext: xpForLevel(1), pendingLevels: metaLv('i_start'),
    // the haul: souls, Life Essence and Stolen Divinity gathered this siege; carried to the Phylactery when it ends
    souls: 0, essence: 0, divinity: 0, soulsEarned: 0, kills: 0, bossesKilled: [] as string[],
    unlockedTowers: TOWER_ORDER.filter(towerKnown), unlockedUnits: UNIT_ORDER.filter(unitOwned), walls: {} as Record<string, number>,
    buildings: {} as Record<string, { type: string; tier: number }>, ruins: {} as Record<string, any>, layout: null as any,
    spells: SPELL_ORDER.filter(s => BASE_SPELLS.includes(s) || metaLv('sp_' + s) > 0), spellCd: {} as Record<string, number>,
    unitTier: Object.fromEntries(UNIT_ORDER.map(u => [u, Math.min(2, metaLv('e_' + u))])) as Record<string, number>, unitBuff: {} as Record<string, number>,
    towerDmg: {} as Record<string, number>, mods: {} as Record<string, number>, picks: {} as Record<string, number>, banished: [] as string[],
    m, asc: { dmg: 0, hp: 0 }, rerolls: metaLv('i_reroll') * 2 + 1, banishes: 1 + metaLv('i_reroll'),
    phylUsed: false, adapt: {}, spellsCastWave: 0, fervor: 1, startTime: Date.now(),
  };
}

/** Begins a siege of keep `keep` (index into KEEPS). Nothing is bought during a siege: the host, the
 *  buildings, the spells and the slots for towers, ramparts and traps all come from the Phylactery web. */
export function newCampaign(keep = 0) {
  keep = Math.max(0, Math.min(KEEPS.length - 1, keep | 0));
  if (!keepUnlocked(keep)) keep = Math.min(G.meta.keepsCleared || 0, KEEPS.length - 1);
  resetWorld();
  const seed = (Math.random() * 1e9) | 0;
  G.map = generateMap(seed, KEEPS[keep].fort);
  computeFlow(G.map);
  G.run = newRunState(keep, seed);
  raiseBuildings();
  G.keep.maxHp = 0; recalcKeep(); G.keep.hp = G.keep.maxHp;
  const host = raiseHost();
  G.phase = 'prep'; G.speed = 1; G.paused = false;
  G.camera.x = KEEP.x1 + 160; G.camera.y = KEEP.y;
  const raised = applyLayout(G.meta.layout[KEEPS[keep].id]); // the defences you placed here last time
  G.meta.lastKeep = keep;
  anStart();
  lichSay('start');
  msg(`You besiege ${KEEPS[keep].name}: ${WAVES_PER_KEEP} waves, and ${BOSSES.find(b => b.id === KEEPS[keep].boss).name} leads the last.`, G.map.theme.accent);
  msg(`Your host rises: ${host}.`, PAL.necro);
  if (raised) msg(`Your defences stand where you left them (${raised} raised). Rearrange them before the wave if you wish.`, '#c8b890');
  saveRun();
}

export function loadRun(): boolean {
  const s = readRunSave();
  if (!s || s.run.keep == null || !KEEPS[s.run.keep]) return false;
  resetWorld();
  G.map = generateMap(s.run.seed, KEEPS[s.run.keep].fort);
  G.run = Object.assign(newRunState(s.run.keep, s.run.seed), s.run, { m: Object.assign(defaultMods(), s.run.m), spellCd: {} });
  G.run.asc = Object.assign({ dmg: 0, hp: 0 }, s.run.asc);
  G.run.buildings = Object.assign({}, s.run.buildings); G.run.ruins = Object.assign({}, s.run.ruins);
  for (const id in G.run.buildings) { const p = plotById(id); if (p) spawnBuilding(G.run.buildings[id].type, p, G.run.buildings[id].tier); }
  G.keep.maxHp = 0; recalcKeep(); G.keep.hp = Math.min(Math.max(1, s.keepHp), G.keep.maxHp);
  G.run.walls = Object.assign({}, s.run.walls);
  for (const f of s.forts) placeFort(f.type, f.cx, f.cy, { hp: f.hp, site: f.site, wtier: f.wt });
  for (const t of s.towers) { const tw = placeTower(t.type, t.cx, t.cy, t.tier, { hp: t.hp, plot: t.plot }); tw.mode = t.mode || 'first'; tw.kills = t.kills || 0; }
  for (const u of s.units) { if (UNITS[u.type]) spawnUnit(u.type, u.x, u.y, { free: u.free, tierSpr: u.spr || undefined, mult: u.mult }); }
  computeFlow(G.map);
  G.phase = 'prep'; G.speed = 1; G.paused = false;
  G.camera.x = KEEP.x1 + 160; G.camera.y = KEEP.y;
  anResume();
  msg(`Siege resumed — preparing for wave ${G.run.wave + 1} of ${WAVES_PER_KEEP}.`, PAL.necro);
  return true;
}

function spawnMany(type: string, n: number, x: number, y: number, opts: any = {}) {
  const out: any[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / Math.max(1, n)) * TAU * 2.4, rr = 6 + Math.sqrt(i + 1) * 5.5;
    out.push(spawnUnit(type, x + Math.cos(a) * rr, Math.max(24, Math.min(WH - 24, y + Math.sin(a) * rr * 0.75)), opts));
  }
  return out;
}
/** The host the web has mustered rises at the gate. Returns a description. */
export function raiseHost(): string {
  const parts: string[] = [];
  let i = 0;
  for (const u of UNIT_ORDER) {
    const n = musterCount(u); if (!n) continue;
    const d = UNITS[u], back = d.ranged ? -8 : 34, row = (i++ % 5) - 2;
    spawnMany(u, n, KEEP.x1 + 30 + back + (i % 2) * 14, KEEP.y + row * 34);
    parts.push(`${n}× ${d.tiers[G.run.unitTier[u] || 0].name}`);
  }
  return parts.join(', ');
}
/** A reinforcement squad raised mid-siege by cards and events. */
export function spawnSquad(type: string, x: number, y: number, opts: any = {}) { return spawnMany(type, squadSize(type), x, y, opts); }
/** Raises `frac` more of every undead type in the host (at least one of each). Returns a description. */
export function musterMore(frac: number): string {
  const by: Record<string, number> = {};
  for (const u of G.units) if (!u.summon && !u.temp) by[u.type] = (by[u.type] || 0) + 1;
  for (const f of (G.wave && G.wave.fallen) || []) by[f.type] = (by[f.type] || 0) + 1;
  const parts: string[] = [];
  for (const t in by) { const n = Math.max(1, Math.round(by[t] * frac)); spawnMany(t, n, KEEP.x1 + 40, KEEP.y + rnd(-50, 50)); parts.push(`${n}× ${UNITS[t].tiers[G.run.unitTier[t] || 0].name}`); }
  return parts.length ? parts.join(', ') + ' rise' : 'No undead answer';
}

// ---------------- waves ----------------
const THEMES = [
  { id: 'iron', name: 'Iron Vanguard', fac: 'iron' },
  { id: 'holy', name: 'Holy Procession', fac: 'holy', min: 4 },
  { id: 'arcane', name: 'Arcane Conclave Warband', fac: 'arcane', min: 6 },
  { id: 'free', name: 'Freeborn Raiders', fac: 'free', min: 5 },
  { id: 'siege', name: 'Siege Assault', types: ['ram', 'catapult', 'shield', 'footman'], min: 6 },
  { id: 'cav', name: 'Cavalry Charge', types: ['cavalry', 'griffon', 'knight'], min: 5 },
  { id: 'swarm', name: 'Peasant Swarm', types: ['militia', 'footman'], swarm: true },
  { id: 'elite', name: 'Elite Strike Force', elite: true, min: 8 },
] as any[];

function computeAdapt() {
  const unitsN = G.units.filter((u: any) => !u.temp).length, towersN = G.towers.length, wallsN = G.forts.filter((f: any) => f.def.block).length, spells = G.run.spellsCastWave;
  const a = {
    holy: 1 + Math.min(2, unitsN / 160), // armies are squads now: tuned for hundreds of undead
    siege: 1 + Math.min(2.5, towersN / 6),
    climb: 1 + Math.min(2.5, wallsN / 20),
    arcane: 1 + Math.min(2, (spells + G.towers.filter((t: any) => t.type === 'arcane' || t.type === 'tesla').length) / 6),
  };
  const old = G.run.adapt || {};
  const notes: string[] = [];
  if (a.holy > 1.8 && !(old.holy > 1.8)) notes.push('Your vast army draws the Holy Dominion — paladins and priests join the crusade.');
  if (a.siege > 1.8 && !(old.siege > 1.8)) notes.push('Your towers alarm the generals — more siege engines approach.');
  if (a.climb > 1.8 && !(old.climb > 1.8)) notes.push('Your walls are noticed — rangers and battering rams are being sent.');
  if (a.arcane > 1.8 && !(old.arcane > 1.8)) notes.push('Your sorcery attracts spellbreakers of the Arcane Conclave.');
  G.run.adapt = a;
  if (notes.length) { notes.forEach(n => msg('Adaptive Crusade: ' + n, '#ffb060')); lichSay('adapt'); }
  return a;
}

/** Wave `n` (1..10) of the keep under siege. The 10th wave is the keep's boss with its host (always at full
 *  strength, whatever crusade was chosen). Waves are large from the start and grow by a third of the first
 *  wave each time; health, damage and spoils follow the keep's exponential curve (systems/stats.ts). */
export function genWave(n: number, tier = 1) {
  const k = keepIdx(), tech = waveTech(n, k);
  const boss = n >= WAVES_PER_KEEP ? BOSSES.find(b => b.id === KEEPS[k].boss) : null;
  if (boss) tier = 1;
  const lanes = LANES.filter(l => l.minWave <= tech).map(l => l.id);
  const themes = THEMES.filter(t => !t.min || t.min <= tech);
  const theme = n <= 2 && k === 0 ? THEMES[0] : n % 5 === 0 && !boss ? THEMES.find(t => t.id === 'elite') : pick(themes);
  const adapt: any = computeAdapt();
  const types = Object.keys(ENEMIES).filter(t => ENEMIES[t].minWave <= tech);
  const weights = types.map(t => {
    const d = ENEMIES[t];
    let w = d.w;
    if (theme.fac && d.fac === theme.fac) w *= 3.5;
    if (theme.types && theme.types.includes(t)) w *= 5;
    if (theme.swarm && (t === 'militia' || t === 'footman')) w *= 3;
    if (theme.elite && d.bounty < 10) w *= 0.25;
    if (d.fac === 'holy') w *= adapt.holy;
    if (t === 'ram' || t === 'catapult') w *= adapt.siege;
    if (d.climber || t === 'ram') w *= adapt.climb;
    if (t === 'spellbreaker' || t === 'battlemage') w *= adapt.arcane;
    if (tech - d.minWave > 12 && d.bounty < 6) w *= 0.5;
    return w;
  });
  const wTot = weights.reduce((a, b) => a + b, 0);
  const roll = () => { let x = Math.random() * wTot; for (let i = 0; i < types.length; i++) { x -= weights[i]; if (x <= 0) return types[i]; } return types[0]; };
  let count = Math.floor((WAVE_COUNT0 + n * WAVE_COUNT_STEP) * (1 + 0.12 * k) * (theme.swarm ? 1.3 : theme.elite ? 0.6 : 1) * (boss ? 0.8 : 1));
  const tm = tierMods(tier);
  count = Math.max(6, Math.round(Math.min(count, 320) * tm.count));
  const spawns: any[] = [];
  let t = 1.5;
  while (spawns.length < count) {
    const lane = pick(lanes), main = roll();
    const size = theme.elite ? rndi(2, 4) : rndi(4, 6 + Math.floor(tech / 4));
    for (let i = 0; i < size && spawns.length < count; i++) { spawns.push({ t, type: Math.random() < 0.75 ? main : roll(), lane }); t += 0.3; }
    t += Math.max(0.5, rnd(1.8, 3.2) - tech * 0.03);
  }
  if (n % 5 === 0 && !boss) { const el = types.filter(t2 => ENEMIES[t2].bounty >= 10 && !ENEMIES[t2].structOnly); spawns.push({ t: t * 0.5, type: el.length ? pick(el) : 'footman', lane: pick(lanes), champion: true }); }
  if (boss) spawns.push({ t: Math.max(4, t * 0.35), boss, lane: 'E' });
  spawns.sort((a, b) => a.t - b.t);
  return { n, spawns, idx: 0, t: 0, theme, boss, total: spawns.length, keepDamaged: false, fallen: [] as any[], tier };
}
export const WAVE_COUNT0 = 14, WAVE_COUNT_STEP = 7;
export function previewWave(n: number) {
  const boss: any = n >= WAVES_PER_KEEP ? BOSSES.find(b => b.id === KEEPS[keepIdx()].boss) : null;
  return { boss: boss ? boss.name : null, newLane: LANES.find(l => l.minWave === waveTech(n) && n > 1) };
}

/** The three crusades offered for the next wave (rolled once per wave, kept until one is chosen). */
export function crusadeOffer() {
  const r = G.run, n = r.wave + 1;
  if (!G.crusadeOffer || G.crusadeOffer.n !== n) G.crusadeOffer = { n, waves: [0, 1, 2].map(t => genWave(n, t)) };
  return G.crusadeOffer;
}
/** Starts the next wave against crusade `tier` (0 Skirmish, 1 Crusade, 2 Holy War; default: the last choice). */
export function startWave(tier?: number) {
  if (G.phase !== 'prep') return;
  const r = G.run, ro = rogue();
  if (r.wave >= WAVES_PER_KEEP) return;
  tier = tier ?? ro.lastTier ?? 1;
  if (r.wave + 1 >= WAVES_PER_KEEP) tier = 1; // the boss marches at full strength
  else ro.lastTier = tier;
  rememberLayout(); // what stands now is mended after the wave and raised again next siege
  r.wave++;
  r.spellsCastWave = 0;
  if (r.mods.covenant) recalcAllStats();
  if (tier === 2) ro.zeal = (ro.zeal || 0) + 1; // Holy War: a lasting rise in Fervor
  r.fervor = computeFervor();
  const off = G.crusadeOffer && G.crusadeOffer.n === r.wave ? G.crusadeOffer.waves[tier] : null;
  G.wave = off || genWave(r.wave, tier);
  G.wave.tier = tier;
  G.wave.souls0 = r.soulsEarned; G.wave.kills0 = r.kills; G.wave.keep0 = G.keep.hp;
  G.crusadeOffer = null;
  anPick('crusade', CRUSADE_TIERS[tier].name); anWaveStart();
  G.phase = 'wave'; G.autoT = 0; G.build = null;
  const nl = LANES.find(l => l.minWave === waveTech(r.wave));
  if (nl && r.wave > 1) msg(`A new approach opens: the ${nl.name}!`, '#ffb060');
  msg(`Wave ${r.wave} of ${WAVES_PER_KEEP}: ${G.wave.boss ? G.wave.boss.name : CRUSADE_TIERS[tier].name + ' — ' + G.wave.theme.name}${r.fervor > 1.05 ? ` (Crusade Fervor ×${r.fervor.toFixed(2)})` : ''}`, '#e0d0b0');
  if (!G.wave.boss) lichSay('wave');
  sfx('horn', 0.7);
  saveRun(); saveMetaSoon();
}

function updateWave(dt: number) {
  const W = G.wave;
  if (!W || G.phase !== 'wave') return;
  W.t += dt;
  while (W.idx < W.spawns.length && W.spawns[W.idx].t <= W.t) {
    const s = W.spawns[W.idx++];
    if (s.boss) { const e = spawnEnemy(null, s.lane, { boss: s.boss }); G.bossBar = e; announceBoss(e); }
    else spawnEnemy(s.type, s.lane, { champion: s.champion });
  }
  if (W.idx >= W.spawns.length && G.enemies.length === 0) { waveCleared(); return; }
  // no stalemates: when the whole crusade has been on the field for a long while, it grows desperate
  if (W.idx >= W.spawns.length) {
    W.lateT = (W.lateT || 0) + dt;
    if (W.lateT > 150 && (W.rageT = (W.rageT || 0) + dt) >= 10) {
      W.rageT = 0; W.rage = (W.rage || 0) + 1;
      for (const e of G.enemies) e.dmg *= 1.2;
      if (W.rage === 1) msg('The crusade grows desperate: its blows strike harder the longer the wave drags on.', '#ffb060');
    }
  }
}

/** Revives every undead slain during the wave, for free. */
function reviveFallen() {
  const W = G.wave; if (!W || !W.fallen.length) return 0;
  let n = 0;
  for (const f of W.fallen) {
    if (!UNITS[f.type]) continue;
    spawnUnit(f.type, KEEP.x1 + rnd(10, 50), KEEP.y + rnd(-50, 50), { free: f.free, tierSpr: f.spr || undefined, mult: f.mult });
    n++;
  }
  W.fallen.length = 0;
  return n;
}

function waveCleared() {
  const r = G.run;
  G.phase = 'prep';
  const wm = waveMods(), last = r.wave >= WAVES_PER_KEEP;
  const bonus = Math.round((20 + r.wave * 8) * bountyMult(r.wave) * soulMult() * wm.reward);
  r.souls += bonus; r.soulsEarned += bonus;
  const ess = waveEssence(r.wave) * essenceMult() * (last ? 1 : wm.reward);
  r.essence += ess;
  const revived = reviveFallen();
  const rebuilt = rebuildRuins();
  const mended = mendRamparts() + (r.layout ? applyLayout({ traps: r.layout.traps }) : 0);
  msg(`Wave ${r.wave} repelled. +${fmtN(bonus)} souls, +${fmtN(ess)} Life Essence${revived ? ` · ${revived} fallen undead rise again` : ''}${rebuilt ? ` · ${rebuilt} tower${rebuilt > 1 ? 's' : ''} rebuilt` : ''}${mended ? ' · defences mended' : ''}.`, PAL.necro);
  // end-of-wave summary (shown by the UI before level-ups and events)
  const rep = G.wave.report || { src: {}, fallen: {} };
  G.waveSummary = { n: r.wave, tier: CRUSADE_TIERS[G.wave.tier ?? 1].name, theme: G.wave.theme.name, boss: G.wave.boss && G.wave.boss.name,
    souls: r.soulsEarned - (G.wave.souls0 ?? r.soulsEarned) - bonus, bonus, essence: ess, kills: r.kills - (G.wave.kills0 ?? r.kills),
    keepLost: Math.max(0, Math.round((G.wave.keep0 ?? G.keep.hp) - G.keep.hp)), revived, rebuilt,
    src: Object.values(rep.src).filter((s: any) => s.dmg > 0 || s.n > 0).sort((a: any, b: any) => b.dmg - a.dmg), fallen: rep.fallen, names: rep.names || {} };
  anWaveEnd(G.waveSummary);
  if (!G.wave.keepDamaged && G.wave.total >= 10) G.stats.flawless = true;
  G.stats.bestWave = Math.max(G.stats.bestWave, r.wave);
  G.bossBar = null;
  if (last) { G.waveSummary = null; endCampaign('victory'); return; } // the keep is yours
  G.keep.hp = Math.min(G.keep.maxHp, G.keep.hp + G.keep.maxHp * 0.1);
  G.units.forEach((u: any) => { u.hp = u.maxHp; u.retreat = false; });
  afterWave();
  if (Math.random() < 0.5) lichSay('waveClear');
  checkAchievements();
  saveRun(); saveMeta();
  G.autoT = 0;
  hooks.refreshBuild();
}
const fmtN = (v: number) => v >= 100 ? Math.round(v).toLocaleString('en-US') : v >= 10 ? v.toFixed(0) : (Math.round(v * 10) / 10) + '';
/** Abandon the siege between waves: everything gathered so far goes to the Phylactery. */
export function retreat() { if (!G.run || G.phase === 'over') return null; return endCampaign('retreat'); }

// ---------------- spells ----------------
export function spellCd(id: string) { return SPELLS[id].cd * G.run.m.spellCd * (1 - metaLv('a_cd') * 0.04) * (G.run.mods.leg_crown ? 0.6 : 1) * (1 - 0.08 * bld('sanctum')); }
export function spellPower() { const r = G.run; return (1 + r.level * 0.08) * arcanePower() * (1 + r.m.spellDmg + (r.mods.leg_crown ? 0.6 : 0)) * globalDmg() * (1 + 0.15 * bld('sanctum')); }
export function canCast(id: string) { const r = G.run; return (G.phase === 'wave' || G.phase === 'prep') && r.spells.includes(id) && (r.spellCd[id] || 0) <= 0; }

export function castSpell(id: string, x?: number, y?: number) {
  const r = G.run, s = SPELLS[id];
  if (!canCast(id)) return false;
  r.spellCd[id] = spellCd(id);
  r.spellsCastWave++; anPick('spell', id);
  G.lich.anim = 'cast'; G.lich.at = 0; G.lich.castT = 0.8;
  codexSee('spell', id);
  const P = spellPower();
  addFlash(KEEP.x, KEEP.y0 - 20, 60, PAL.necro, 0.4);
  switch (id) {
    case 'deathwave': G.waveFx.push({ x: KEEP.x1, y: KEEP.y, r: 20, max: 300, spd: 260, hit: new Set(), dmg: s.dmg * P }); sfx('deathwave'); G.shake = 4; break;
    case 'raise': {
      let n = 0;
      for (const c of G.corpses.slice()) if (dist2(c.x, c.y, x, y) < s.radius ** 2) { raiseCorpse(c, 30); n++; }
      addRing(x, y, 4, s.radius, PAL.necro, 0.6); sfx('raise'); addText(x, y - 20, n ? `${n} rise!` : 'no corpses', PAL.necro, true);
      break;
    }
    case 'meteor':
      for (let i = 0; i < 9; i++) G.timers.push({ t: i * 0.2, fn: () => { const a = rnd(TAU), rr = rnd(s.radius); fireProjectile(NEUTRAL_SRC, 0, 0, { x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr * 0.7 }, 'meteor', s.dmg * P, 'fire', { splash: 26 }); } });
      addRing(x, y, s.radius, s.radius - 4, PAL.fire, 2.0); sfx('cast');
      break;
    case 'prison': G.hashE.query(x, y, s.radius, (e: any) => { e.st.prisonT = e.boss ? 1.5 : 4; e.st.rootT = e.st.prisonT; }); addRing(x, y, s.radius, 4, PAL.arcane, 0.5); addRing(x, y, 4, s.radius, PAL.arcane, 0.5); sfx('prison'); break;
    case 'time': G.tdT = 7; sfx('time'); msg('Time itself bends to your will.', '#9fe6ff'); break;
    case 'blood': addHazard(x, y, s.radius, s.dmg * P, 'necro', 4, 'blood'); sfx('blood'); break;
    case 'resurrect': { const n = G.wave ? G.wave.fallen.length : 0; reviveFallen(); msg(n ? `${n} servants return from death.` : 'None have fallen this wave.', PAL.necro); sfx('raise'); break; }
    case 'frenzy': G.frenzyT = 20; msg('Bloodfrenzy! Your forces attack with unholy speed.', '#ff6060'); sfx('cast'); break;
    case 'ward': G.keep.ward = 10; msg('The phylactery is warded.', PAL.necro); sfx('cast'); break;
    case 'storm': G.stormT = 8; sfx('thunder'); msg('A necrotic storm gathers.', PAL.necro); break;
    case 'legion': case 'wraiths': case 'colossus': case 'abom': case 'devourer': case 'dragon': {
      const made = spawnSummon(s.summon, undefined, undefined, s.dur);
      msg(`${made.length}× ${SUMMONS[s.summon].name} answer your call!`, PAL.necro);
      break;
    }
    case 'apocalypse':
      G.stats.castApoc = true; sfx('apocalypse'); G.shake = 10; G.flash = 0.6;
      for (let i = 0; i < 80; i++) G.timers.push({ t: i * 0.05, fn: () => {
        const e: any = G.enemies.length && Math.random() < 0.75 ? pick(G.enemies) : null;
        const tx = e ? e.x + rnd(-20, 20) : rnd(200, WW - 40), ty = e ? e.y + rnd(-10, 10) : rnd(40, WH - 40);
        fireProjectile(NEUTRAL_SRC, 0, 0, { x: tx, y: ty }, 'meteor', s.dmg * 0.3 * P, Math.random() < 0.5 ? 'fire' : 'necro', { splash: 34 });
        if (Math.random() < 0.3) lightningBolt(tx + rnd(-20, 20), ty - 200, tx, ty, PAL.necro, 0.3, 2, 12);
      } });
      lichSay('legendary');
      break;
  }
  return true;
}
function updateWaveFx(dt: number) {
  for (let i = G.waveFx.length - 1; i >= 0; i--) {
    const w = G.waveFx[i];
    w.r += w.spd * dt;
    G.hashE.query(w.x, w.y, w.r + 10, (e: any) => {
      if (w.hit.has(e) || Math.hypot(w.x - e.x, w.y - e.y) < w.r - 14) return;
      w.hit.add(e);
      dealDamage(e, w.dmg, 'necro', NEUTRAL_SRC, { aoe: true });
      if (!e.boss) e.x += 14;
    });
    if (w.r > w.max) G.waveFx.splice(i, 1);
  }
}

function updateStorm(dt: number) {
  if (G.stormT <= 0) return;
  G.stormT -= dt;
  G.stormTick = (G.stormTick || 0) - dt;
  if (G.stormTick <= 0 && G.enemies.length) {
    G.stormTick = 0.18;
    const e: any = pick(G.enemies);
    lightningBolt(e.x + rnd(-14, 14), e.y - 200, e.x, e.y - 6, PAL.necro, 0.3, 2, 12);
    aoeDamage(e.x, e.y, 22, 40 * spellPower(), 'necro', NEUTRAL_SRC);
    addFlash(e.x, e.y, 60, PAL.necro, 0.25);
    if (Math.random() < 0.3) sfx('zap', 0.3);
  }
}

// ---------------- the simulation step ----------------
/** Unique level-up cards that act over time (v0.9.1). */
function stepUniqueCards(dt: number) {
  const r = G.run; if (G.phase !== 'wave') return;
  if (r.mods.bond) G.keep.hp = Math.min(G.keep.maxHp, G.keep.hp + G.keep.maxHp * 0.015 * dt); // Phylactery Bond
  if (r.mods.knell) { // Death Knell: a necrotic nova bursts from the gate every 15 s
    r.knellT = (r.knellT || 0) + dt;
    if (r.knellT >= 15) {
      r.knellT = 0;
      aoeDamage(GATE.x + 40, GATE.y, 140, 120 * spellPower(), 'necro', LICH_SRC);
      addRing(GATE.x + 40, GATE.y, 10, 140, PAL.necro, 0.7); sfx('deathwave', 0.5);
    }
  }
}
const LICH_SRC = { team: 'u', def: {}, kind: 'lich' };
export function step(dt: number) {
  const M = G.map;
  if (M.dirty) computeFlow(M);
  G.time += dt;
  G.stepN = (G.stepN || 0) + 1;
  for (let i = G.timers.length - 1; i >= 0; i--) { G.timers[i].t -= dt; if (G.timers[i].t <= 0) { const fn = G.timers[i].fn; G.timers.splice(i, 1); fn(); } }
  updateWave(dt);
  G.hashE.clear(); for (const e of G.enemies) G.hashE.insert(e);
  G.hashU.clear(); for (const u of G.units) G.hashU.insert(u);
  G.wards = G.forts.filter((f: any) => f.type === 'ward'); // looked up by every moving crusader
  planArmy(dt);
  for (let i = G.enemies.length - 1; i >= 0; i--) { const e = G.enemies[i]; if (e) updateEnemy(e, dt); }
  for (let i = G.units.length - 1; i >= 0; i--) { const u = G.units[i]; if (u) updateUnit(u, dt); }
  for (let i = G.towers.length - 1; i >= 0; i--) { const t = G.towers[i]; if (t) updateTower(t, dt); }
  for (let i = G.forts.length - 1; i >= 0; i--) { const f = G.forts[i]; if (f) updateFort(f, dt); }
  updateLich(dt);
  updateNetArcs(dt);
  updateHazards(dt);
  updateProjectiles(dt);
  updateWaveFx(dt);
  updateStorm(dt);
  stepRogue(dt);
  stepUniqueCards(dt);
  if (G.tdT > 0) G.tdT -= dt;
  if (G.frenzyT > 0) G.frenzyT -= dt;
  if (G.keep.ward > 0) G.keep.ward -= dt;
  if (G.keep.flash > 0) G.keep.flash -= dt;
  for (const k in G.run.spellCd) if (G.run.spellCd[k] > 0) G.run.spellCd[k] -= dt;
  for (let i = G.corpses.length - 1; i >= 0; i--) { const c = G.corpses[i]; c.t += dt; if (c.t > c.life) { G.corpses.splice(i, 1); bakeCorpse(c); } }
  for (let i = G.dying.length - 1; i >= 0; i--) { const d = G.dying[i]; d.dieT += dt; if (d.dieT > 0.5) { G.dying.splice(i, 1); G.retired.push(d); } }
  if (G.phase === 'prep' && G.settings.autoWave && !G.modal) { G.autoT += dt; if (G.autoT > 6) startWave(); }
}

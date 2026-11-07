// Campaign flow: new/load campaign, wave generation, wave-end revival,
// spells, the Soul Well and the main simulation step.
import { G } from '../core/state';
import { rnd, rndi, pick, dist2, TAU } from '../core/util';
import { KEEP, LANES, PAL, WW, WH, CELL } from '../config/constants';
import { ENEMIES, BOSSES } from '../data/enemies';
import { UNITS, UNIT_ORDER, SUMMONS } from '../data/units';
import { SPELLS, SPELL_ORDER, WELL, unearthCost } from '../data/spells';
import { FORTRESSES } from '../data/world';
import { msg, lichSay, sfx, hooks } from '../core/events';
import { generateMap, computeFlow, canBuildAt } from '../world/mapgen';
import { metaLv, fb, recalcKeep, squadSize, globalDmg, computeFervor, bountyMult, ascSouls, recalcAllStats, bld } from './stats';
import { materialsIncome, rebuildRuins, spawnBuilding, plotById } from './keep';
import { START_MATERIALS } from '../data/buildings';
import { WALL_TIERS } from '../data/towers';
import { upgradeSite } from './ramparts';
import {
  spawnUnit, spawnSummon, spawnEnemy, placeTower, placeFort, fireProjectile, aoeDamage, dealDamage, addHazard, raiseCorpse,
  updateProjectiles, updateHazards, bakeCorpse, NEUTRAL_SRC,
} from './combat';
import { addRing, addFlash, addText, lightningBolt, explosion } from './fx';
import { updateEnemy, updateUnit, updateTower, updateFort, updateLich, updateNetArcs, planArmy } from './ai';
import { xpForLevel, codexSee, checkAchievements } from './progression';
import { announceBoss } from './bosses';
import { defaultMods, saveRun, saveMeta, readRunSave } from './save';

export function resetWorld() {
  for (const k of ['units', 'enemies', 'towers', 'forts', 'buildings', 'corpses', 'dying']) for (const o of G[k]) if (o.view || o.shadow) G.retired.push(o);
  for (const k of ['units', 'enemies', 'towers', 'forts', 'buildings', 'projectiles', 'particles', 'hazards', 'corpses', 'dying', 'texts', 'bolts', 'rings', 'flashes', 'netArcs', 'waveFx', 'timers', 'decalQueue']) G[k].length = 0;
  G.keep.ward = 0; G.tdT = 0; G.frenzyT = 0; G.stormT = 0; G.extraRaised = 0; G.citadelRaised = 0; G.fleshZombies = 0;
  G.selected = null; G.build = null; G.wave = null; G.bossBar = null; G.bossIntro = null; G.speech = null;
  G.worldVersion = (G.worldVersion || 0) + 1; // tells the renderer to rebuild every view
}

function newRunState(fortKey: string, seed: number) {
  return {
    fortress: fortKey, seed, wave: 0, level: 1, xp: 0, xpNext: xpForLevel(1), pendingLevels: metaLv('i_start'),
    souls: 300 + metaLv('s_start') * 60, soulsEarned: 0, kills: 0, bossesKilled: [] as string[], essenceBonus: 0,
    unlockedTowers: ['brimstone', 'tesla', 'necrotic'], unlockedUnits: [] as string[], walls: {} as Record<string, number>,
    materials: START_MATERIALS, buildings: {} as Record<string, { type: string; tier: number }>, ruins: {} as Record<string, any>,
    spells: ['deathwave', 'raise'], spellCd: {} as Record<string, number>, unitTier: {} as Record<string, number>, unitBuff: {} as Record<string, number>,
    towerDmg: {} as Record<string, number>, mods: {} as Record<string, number>, picks: {} as Record<string, number>, banished: [] as string[],
    m: defaultMods(), asc: { dmg: 0, hp: 0, souls: 0, squad: 0 }, bought: {} as Record<string, number>, unearthed: 0, rerolls: metaLv('i_reroll') * 2 + 1, banishes: 1 + metaLv('i_reroll'), insightBuys: 0,
    phylUsed: false, adapt: {}, spellsCastWave: 0, fervor: 1, startTime: Date.now(),
  };
}

export function newCampaign(fortKey: string) {
  resetWorld();
  const seed = (Math.random() * 1e9) | 0;
  G.map = generateMap(seed, fortKey);
  computeFlow(G.map);
  G.run = newRunState(fortKey, seed);
  const extra = SPELL_ORDER.filter(s => !G.run.spells.includes(s) && SPELLS[s].meta && metaLv(SPELLS[s].meta) > 0 && s !== 'apocalypse');
  for (let i = 0; i < metaLv('a_start') && extra.length; i++) G.run.spells.push(extra.splice(rndi(0, extra.length - 1), 1)[0]);
  G.keep.maxHp = 0; recalcKeep(); G.keep.hp = G.keep.maxHp;
  // Every campaign drafts a small random roster: one front-line type, one ranged type and
  // one wild card. More types are unlocked mid-run via level-up cards (Forgotten Crypt,
  // unit unlocks) and the Soul Well (Call of the Crypt).
  const roster = startingRoster();
  G.run.unlockedUnits.push(...roster);
  spawnSquad(roster[0], KEEP.x1 + 30, KEEP.y - 24);
  spawnSquad(roster[0], KEEP.x1 + 30, KEEP.y + 24);
  spawnSquad(roster[1], KEEP.x1 + 10, KEEP.y);
  spawnSquad(roster[2], KEEP.x1 + 40, KEEP.y);
  msg(`Your host rises: ${roster.map(t => UNITS[t].tiers[0].name).join(', ')}.`, PAL.necro);
  for (let i = 0; i < metaLv('m_start'); i++) { const t = randomUnitType(false, 3); if (t) spawnSquad(t, KEEP.x1 + 40, KEEP.y + rnd(-50, 50)); }
  if (metaLv('f_free')) { // a Bone Palisade on the Curtain's gate segment with a Necrotic Spire on top
    const site = G.map.sites.find((s: any) => s.id === 'keep_g'), mount = G.map.plots.find((p: any) => p.mount === 'keep_g');
    if (site && mount) { G.run.materials += WALL_TIERS[1].mat; upgradeSite(site); placeTower('necrotic', mount.cx, mount.cy, 0, { plot: mount.id, matInvested: 5 }); }
  }
  G.phase = 'prep'; G.speed = 1; G.paused = false;
  G.camera.x = KEEP.x1 + 160; G.camera.y = KEEP.y;
  lichSay('start');
  msg(`A new stronghold rises: ${G.map.theme.name}.`, G.map.theme.accent);
  saveRun();
}

export function loadRun(): boolean {
  const s = readRunSave();
  if (!s || !FORTRESSES[s.run.fortress]) return false;
  resetWorld();
  G.map = generateMap(s.run.seed, s.run.fortress);
  G.run = Object.assign(newRunState(s.run.fortress, s.run.seed), s.run, { m: Object.assign(defaultMods(), s.run.m), spellCd: {} });
  G.run.asc = Object.assign({ dmg: 0, hp: 0, souls: 0, squad: 0 }, s.run.asc);
  G.run.bought = Object.assign({}, s.run.bought);
  G.run.unearthed = s.run.unearthed || 0;
  G.keep.maxHp = 0; recalcKeep(); G.keep.hp = Math.min(Math.max(1, s.keepHp), G.keep.maxHp);
  G.run.materials = s.run.materials ?? START_MATERIALS; G.run.buildings = Object.assign({}, s.run.buildings); G.run.ruins = Object.assign({}, s.run.ruins);
  for (const id in G.run.buildings) { const p = plotById(id); if (p) spawnBuilding(G.run.buildings[id].type, p, G.run.buildings[id].tier); }
  recalcKeep();
  for (const t of s.towers) { const tw = placeTower(t.type, t.cx, t.cy, t.tier, { hp: t.hp, invested: t.invested, plot: t.plot, matInvested: t.mat }); tw.mode = t.mode || 'first'; tw.kills = t.kills || 0; }
  G.run.walls = Object.assign({}, s.run.walls);
  for (const f of s.forts) placeFort(f.type, f.cx, f.cy, { hp: f.hp, site: f.site, wtier: f.wt });
  const summonVals: Record<string, number> = {};
  for (const u of s.units) {
    if (u.summon) { if (!SUMMONS[u.type]) continue; const made = spawnSummonSingle(u.type, u.x, u.y, u.value); made.x = u.x; made.y = u.y; continue; }
    if (!UNITS[u.type]) continue;
    spawnUnit(u.type, u.x, u.y, { free: u.free, tierSpr: u.spr || undefined, mult: u.mult });
  }
  computeFlow(G.map);
  G.phase = 'prep'; G.speed = 1; G.paused = false;
  G.camera.x = KEEP.x1 + 160; G.camera.y = KEEP.y;
  msg(`Campaign resumed — preparing for wave ${G.run.wave + 1}.`, PAL.necro);
  return true;
}

/** Raises a whole squad of `type` at (x, y). Squad size is always at least 5. */
export function spawnSquad(type: string, x: number, y: number, opts: any = {}) {
  const n = squadSize(type), out: any[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, rr = 8 + n * 0.9;
    out.push(spawnUnit(type, x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7, opts));
  }
  return out;
}
/** Soul Well "Unearth a Crypt": the player picks which locked undead type to unlock;
 *  a full squad of it rises immediately. */
export function lockedUnitTypes(): string[] { return UNIT_ORDER.filter(k => !G.run.unlockedUnits.includes(k)); }
export function unearthUnit(type: string): boolean {
  const r = G.run, c = unearthCost(r);
  if (!UNITS[type] || r.unlockedUnits.includes(type)) return false;
  if (r.souls < c) { sfx('error'); return false; }
  r.souls -= c; r.unearthed = (r.unearthed || 0) + 1;
  r.unlockedUnits.push(type);
  const made = spawnSquad(type, KEEP.x1 + 40, KEEP.y + rnd(-40, 40));
  sfx('well');
  msg(`A crypt is unearthed: ${made.length}× ${UNITS[type].tiers[r.unitTier[type] || 0].name} rise, and more can now be recruited.`, PAL.necro);
  if (G.phase === 'wave') r.fervor = Math.max(r.fervor, computeFervor());
  hooks.refreshBuild();
  return true;
}

/** Front-line and ranged pools for the opening draft (small, cheap bodies only). */
const START_MELEE = ['skeleton', 'zombie', 'pikeman', 'wendigo'];
const START_RANGED = ['archer', 'bonemage', 'acolyte', 'banshee'];
export function startingRoster(): string[] {
  const melee = pick(START_MELEE.filter(k => UNITS[k]));
  const ranged = pick(START_RANGED.filter(k => UNITS[k]));
  const wild = pick(Object.keys(UNITS).filter(k => UNITS[k].size <= 2 && k !== melee && k !== ranged));
  return [melee, ranged, wild];
}

/** A random unit type for free grants (starting squad, Call of the Crypt, Forgotten Crypt).
 *  Random grants may reach past Phylactery gates — a taste of locked undead.
 *  `onlyNew` = not yet unlocked this campaign; `maxSize` limits body size. */
export function randomUnitType(onlyNew: boolean, maxSize = 4): string | null {
  const pool = Object.keys(UNITS).filter(k => UNITS[k].size <= maxSize && (!onlyNew || !G.run.unlockedUnits.includes(k)));
  return pool.length ? pick(pool) : null;
}

/** Recreates exactly one summoned creature (used by loading and wave-end revival). */
export function spawnSummonSingle(key: string, x: number, y: number, value: number) {
  const orig = SUMMONS[key].count;
  SUMMONS[key].count = 1;
  const savedReinforce = G.meta.lv.m_reinforce; G.meta.lv.m_reinforce = 0;
  const u = spawnSummon(key, x, y, value)[0];
  SUMMONS[key].count = orig; G.meta.lv.m_reinforce = savedReinforce;
  return u;
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

export function genWave(n: number) {
  const boss = BOSSES.find(b => b.wave === n) || (n > 60 && n % 10 === 0 ? Object.assign({}, BOSSES[(n / 10 - 1) % 6], { wave: n, ascended: true }) : null);
  const lanes = LANES.filter(l => l.minWave <= n).map(l => l.id);
  const themes = THEMES.filter(t => !t.min || t.min <= n);
  const theme = n <= 2 ? THEMES[0] : n % 5 === 0 && !boss ? THEMES.find(t => t.id === 'elite') : pick(themes);
  const adapt: any = computeAdapt();
  const types = Object.keys(ENEMIES).filter(k => ENEMIES[k].minWave <= n);
  const weights = types.map(k => {
    const d = ENEMIES[k];
    let w = d.w;
    if (theme.fac && d.fac === theme.fac) w *= 3.5;
    if (theme.types && theme.types.includes(k)) w *= 5;
    if (theme.swarm && (k === 'militia' || k === 'footman')) w *= 3;
    if (theme.elite && d.bounty < 10) w *= 0.25;
    if (d.fac === 'holy') w *= adapt.holy;
    if (k === 'ram' || k === 'catapult') w *= adapt.siege;
    if (d.climber || k === 'ram') w *= adapt.climb;
    if (k === 'spellbreaker' || k === 'battlemage') w *= adapt.arcane;
    if (n - d.minWave > 15 && d.bounty < 6) w *= 0.5;
    return w;
  });
  const wTot = weights.reduce((a, b) => a + b, 0);
  const roll = () => { let x = Math.random() * wTot; for (let i = 0; i < types.length; i++) { x -= weights[i]; if (x <= 0) return types[i]; } return types[0]; };
  // incremental: armies grow steadily in size, then strength scales on top
  let count = Math.floor((10 + n * 2.2 + Math.pow(n, 1.25) * 0.6) * (theme.swarm ? 1.3 : theme.elite ? 0.6 : 1) * (boss ? 0.7 : 1));
  count = Math.min(count, 260);
  const spawns: any[] = [];
  let t = 1.5;
  while (spawns.length < count) {
    const lane = pick(lanes), main = roll();
    const size = theme.elite ? rndi(2, 4) : rndi(4, 6 + Math.floor(n / 4));
    for (let i = 0; i < size && spawns.length < count; i++) { spawns.push({ t, type: Math.random() < 0.75 ? main : roll(), lane }); t += 0.3; }
    t += Math.max(0.6, rnd(2.2, 4) - n * 0.03);
  }
  if (n % 5 === 0 && !boss) { const el = types.filter(k => ENEMIES[k].bounty >= 10 && !ENEMIES[k].structOnly); spawns.push({ t: t * 0.5, type: el.length ? pick(el) : 'footman', lane: pick(lanes), champion: true }); }
  if (boss) spawns.push({ t: Math.max(4, t * 0.35), boss, lane: 'E' });
  spawns.sort((a, b) => a.t - b.t);
  return { n, spawns, idx: 0, t: 0, theme, boss, total: spawns.length, keepDamaged: false, fallen: [] as any[] };
}
export function previewWave(n: number) {
  const boss: any = BOSSES.find(b => b.wave === n) || (n > 60 && n % 10 === 0);
  return { boss: boss ? (boss.name || 'Ascended Champion') : null, newLane: LANES.find(l => l.minWave === n && n > 1) };
}

export function startWave() {
  if (G.phase !== 'prep') return;
  const r = G.run;
  r.wave++;
  r.spellsCastWave = 0;
  r.fervor = computeFervor();
  G.wave = genWave(r.wave);
  G.phase = 'wave'; G.autoT = 0;
  const nl = LANES.find(l => l.minWave === r.wave);
  if (nl && r.wave > 1) msg(`A new approach opens: the ${nl.name}!`, '#ffb060');
  msg(`Wave ${r.wave}: ${G.wave.theme.name}${r.fervor > 1.05 ? ` (Crusade Fervor ×${r.fervor.toFixed(2)})` : ''}`, '#e0d0b0');
  if (!G.wave.boss) lichSay('wave');
  sfx('horn', 0.7);
  saveRun();
}

function updateWave(dt: number) {
  const W = G.wave;
  if (!W || G.phase !== 'wave') return;
  W.t += dt;
  while (W.idx < W.spawns.length && W.spawns[W.idx].t <= W.t) {
    const s = W.spawns[W.idx++];
    if (s.boss) { const e = spawnEnemy(null, s.lane, { boss: s.boss }); if (s.boss.ascended) e.name = 'Ascended ' + e.name; G.bossBar = e; announceBoss(e); }
    else spawnEnemy(s.type, s.lane, { champion: s.champion });
  }
  if (W.idx >= W.spawns.length && G.enemies.length === 0) waveCleared();
}

/** Revives every undead slain during the wave, for free. */
function reviveFallen() {
  const W = G.wave; if (!W || !W.fallen.length) return 0;
  let n = 0;
  for (const f of W.fallen) {
    const x = KEEP.x1 + rnd(10, 50), y = KEEP.y + rnd(-50, 50);
    if (f.summon) spawnSummonSingle(f.type, x, y, f.value);
    else spawnUnit(f.type, x, y, { free: f.free, tierSpr: f.spr || undefined, mult: f.mult });
    n++;
  }
  W.fallen.length = 0;
  return n;
}

function waveCleared() {
  const r = G.run;
  G.phase = 'prep';
  const bonus = Math.round((40 + r.wave * 10) * bountyMult(r.wave) * (1 + metaLv('s_gain') * 0.1 + fb('souls')) * ascSouls());
  r.souls += bonus;
  let interest = 0;
  if (metaLv('s_interest')) { interest = Math.min(Math.round(metaLv('s_interest') * 80 * bountyMult(r.wave)), Math.floor(r.souls * metaLv('s_interest') * 0.03)); r.souls += interest; }
  const revived = reviveFallen();
  const mats = materialsIncome(r.wave, !!(G.wave && G.wave.boss));
  r.materials += mats;
  const rebuilt = rebuildRuins();
  msg(`Wave ${r.wave} repelled. +${bonus} souls, +${mats} materials${interest ? `, +${interest} interest` : ''}${revived ? ` · ${revived} fallen undead rise again` : ''}${rebuilt ? ` · ${rebuilt} tower${rebuilt > 1 ? 's' : ''} rebuilt` : ''}.`, PAL.necro);
  if (!G.wave.keepDamaged && G.wave.total >= 10) G.stats.flawless = true;
  G.stats.bestWave = Math.max(G.stats.bestWave, r.wave);
  G.keep.hp = Math.min(G.keep.maxHp, G.keep.hp + G.keep.maxHp * 0.1);
  G.units.forEach((u: any) => { u.hp = u.maxHp; u.retreat = false; });
  G.bossBar = null;
  if (Math.random() < 0.5) lichSay('waveClear');
  checkAchievements();
  saveRun(); saveMeta();
  G.autoT = 0;
  hooks.refreshBuild();
}

// ---------------- spells ----------------
export function spellCd(id: string) { return SPELLS[id].cd * G.run.m.spellCd * (1 - metaLv('a_cd') * 0.05) * (G.run.mods.leg_crown ? 0.6 : 1) * (1 - 0.08 * bld('sanctum')); }
export function spellPower() { const r = G.run; return (1 + r.level * 0.08) * Math.pow(1.085, r.wave) * (1 + r.m.spellDmg + metaLv('a_dmg') * 0.12 + (r.mods.leg_crown ? 0.6 : 0)) * globalDmg() * (1 + 0.15 * bld('sanctum')); }
export function canCast(id: string) { const r = G.run; return (G.phase === 'wave' || G.phase === 'prep') && (r.spellCd[id] || 0) <= 0 && r.souls >= SPELLS[id].cost; }

export function castSpell(id: string, x?: number, y?: number) {
  const r = G.run, s = SPELLS[id];
  if (!canCast(id)) return false;
  r.spellCd[id] = spellCd(id);
  r.souls -= s.cost; r.spellsCastWave++;
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

// ---------------- Soul Well ----------------
export function wellCost(item: any) {
  let c = item.cost(G.run) * (item.repeat ? 1 : 1 - metaLv('s_well') * 0.06);
  if (item.summon) c *= 1 - fb('summonCost');
  return Math.round(c);
}
export function wellAvailable(item: any) { if (item.id === 'unearth' && !lockedUnitTypes().length) return false; return !item.meta || metaLv(item.meta) > 0; }
export function buyWell(id: string): boolean {
  const item = WELL.find(w => w.id === id), r = G.run;
  if (!item || !wellAvailable(item)) return false;
  if (id === 'unearth') return false; // needs a choice: the UI opens the crypt picker → unearthUnit(type)
  const c = wellCost(item);
  if (r.souls < c) { sfx('error'); return false; }
  r.souls -= c;
  sfx('well');
  switch (id) {
    case 'asc_dmg': r.asc.dmg++; recalcAllStats(); msg(`Dark Empowerment ${r.asc.dmg}: all damage ×${Math.pow(1.12, r.asc.dmg).toFixed(2)}`, PAL.necro); break;
    case 'asc_hp': r.asc.hp++; recalcAllStats(); msg(`Bone Fortitude ${r.asc.hp}: health ×${Math.pow(1.12, r.asc.hp).toFixed(2)}`, PAL.necro); break;
    case 'asc_squad': r.asc.squad++; msg(`Ossuary Expansion ${r.asc.squad}: every squad raises +${r.asc.squad} more undead.`, PAL.necro); break;
    case 'asc_souls': r.asc.souls++; msg(`Soul Tithe ${r.asc.souls}: souls ×${Math.pow(1.08, r.asc.souls).toFixed(2)}`, PAL.necro); break;
    case 'insight': r.insightBuys++; r.pendingLevels++; break;
    case 'mend':
      G.units.forEach((u: any) => u.hp = u.maxHp);
      G.towers.forEach((t: any) => t.hp = Math.min(t.maxHp, t.hp + t.maxHp * 0.6));
      G.forts.forEach((f: any) => f.hp = Math.min(f.maxHp, f.hp + f.maxHp * 0.6));
      G.keep.hp = Math.min(G.keep.maxHp, G.keep.hp + G.keep.maxHp * 0.15);
      msg('Bone knits and stone mends.', PAL.necro); addRing(KEEP.x1, KEEP.y, 10, 300, PAL.necro, 0.8);
      break;
    case 'revive': { const n = G.wave ? G.wave.fallen.length : 0; reviveFallen(); msg(n ? `${n} fallen rise again.` : 'None have fallen this wave.', PAL.necro); break; }
    case 'frenzy': G.frenzyT = 20; msg('Bloodfrenzy! Your forces attack with unholy speed.', '#ff6060'); break;
    case 'ward': G.keep.ward = 10; msg('The phylactery is warded.', PAL.necro); break;
    case 'detonate': aoeDamage(KEEP.x1 + 20, KEEP.y + 10, 170, 260 * spellPower(), 'necro', NEUTRAL_SRC); explosion(KEEP.x1 + 20, KEEP.y + 10, 170, PAL.necro, true); G.shake = 8; sfx('apocalypse'); break;
    case 'storm': G.stormT = 8; sfx('thunder'); msg('A necrotic storm gathers.', PAL.necro); break;
    default:
      if (item.summon) {
        const made = spawnSummon(item.summon, undefined, undefined, c);
        msg(`${made.length}× ${SUMMONS[item.summon].name} answer your call!`, PAL.necro);
        if (G.phase === 'wave') r.fervor = Math.max(r.fervor, computeFervor());
      }
  }
  return true;
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
export function step(dt: number) {
  const M = G.map;
  if (M.dirty) computeFlow(M);
  G.time += dt;
  G.stepN = (G.stepN || 0) + 1;
  for (let i = G.timers.length - 1; i >= 0; i--) { G.timers[i].t -= dt; if (G.timers[i].t <= 0) { const fn = G.timers[i].fn; G.timers.splice(i, 1); fn(); } }
  updateWave(dt);
  G.hashE.clear(); for (const e of G.enemies) G.hashE.insert(e);
  G.hashU.clear(); for (const u of G.units) G.hashU.insert(u);
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
  if (G.tdT > 0) G.tdT -= dt;
  if (G.frenzyT > 0) G.frenzyT -= dt;
  if (G.keep.ward > 0) G.keep.ward -= dt;
  if (G.keep.flash > 0) G.keep.flash -= dt;
  for (const k in G.run.spellCd) if (G.run.spellCd[k] > 0) G.run.spellCd[k] -= dt;
  for (let i = G.corpses.length - 1; i >= 0; i--) { const c = G.corpses[i]; c.t += dt; if (c.t > c.life) { G.corpses.splice(i, 1); bakeCorpse(c); } }
  for (let i = G.dying.length - 1; i >= 0; i--) { const d = G.dying[i]; d.dieT += dt; if (d.dieT > 0.5) { G.dying.splice(i, 1); G.retired.push(d); } }
  if (G.phase === 'prep' && G.settings.autoWave && !G.modal) { G.autoT += dt; if (G.autoT > 6) startWave(); }
}

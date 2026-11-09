// Entity creation, damage resolution, deaths, corpses, projectiles,
// hazards and status effects.
import { G, Ent, retire } from '../core/state';
import { uid, rnd, rndi, pick, dist, dist2, clamp, Pool, TAU } from '../core/util';
import { CELL, WW, KEEP, LANES, PAL, MW } from '../config/constants';
import { UNITS, SUMMONS } from '../data/units';
import { ENEMIES } from '../data/enemies';
import { TOWERS, FORTS } from '../data/towers';
import { msg, lichSay, sfx } from '../core/events';
import { addParticle, spawnBurst, addRing, addFlash, addText, addSoulParticle, explosion, lightningBolt, stampDecal } from './fx';
import { applyUnitStats, towerMaxHp, fortMaxHp, metaLv, fb, globalDmg, dtypeMult, towerStats, waveHpMult, waveDmgMult, bountyMult, ascSouls } from './stats';
import { waveMods } from './events';
import { SHEETS } from '../config/manifest';
import { cellIdx } from '../world/mapgen';
import { gainXp, codexSee, bossKilled, keepFallen } from './progression';

const sheetH = (key: string) => (SHEETS[key] ? SHEETS[key].H || 22 : 22);

export function baseEnt(kind: Ent['kind'], x: number, y: number): Ent {
  return { id: uid(), kind, x, y, hp: 1, maxHp: 1, armor: 0, dead: false, anim: 'idle', at: Math.random(), face: 1, cdT: Math.random() * 0.5, target: null, retT: 0, st: {}, hitT: 0, rad: 5, alt: 0, type: '', def: null, team: 'u' };
}

// ---------------- undead ----------------
export function spawnUnit(type: string, x: number, y: number, opts: any = {}): Ent {
  const d = UNITS[type];
  const u = Object.assign(baseEnt('unit', x, y), { type, def: d, team: 'u' as const, flying: !!d.flying, temp: opts.temp || 0, free: !!opts.free, raisedMult: opts.mult || 1 });
  if (opts.tierSpr) { u.spr = opts.tierSpr; u.fixedSpr = true; }
  applyUnitStats(u);
  u.rad = sheetH(u.spr) > 28 ? 9 : 5;
  u.alt = u.flying ? 14 : 0;
  u.slot = Math.random();
  G.units.push(u);
  G.stats.maxArmy = Math.max(G.stats.maxArmy, G.units.length);
  spawnBurst(x, y - 6, PAL.necro, 8);
  return u;
}

export function summonCount(key: string) { return Math.max(1, Math.round(SUMMONS[key].count * (1 + metaLv('m_reinforce') * 0.5))); }

export function spawnSummon(key: string, x?: number, y?: number, value?: number): Ent[] {
  const s = SUMMONS[key];
  const n = summonCount(key);
  const out: Ent[] = [];
  const cx = x ?? KEEP.x1 + 50, cy = y ?? KEEP.y + 20;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, rr = n > 2 ? 18 + n : 10;
    const u = Object.assign(baseEnt('unit', cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.6), { type: key, def: s, team: 'u' as const, summon: true, flying: !!s.flying });
    const w = G.run.wave;
    u.maxHp = u.hp = Math.round(s.hp * Math.pow(1.07, w) * (1 + metaLv('n_hp') * 0.1));
    u.dmg = s.dmg * Math.pow(1.07, w) * globalDmg() * dtypeMult(s.dtype);
    u.armor = s.armor; u.range = s.range; u.spd = s.spd; u.cd = s.cd; u.splash = s.splash || 0;
    u.spr = s.spr; u.rad = sheetH(s.spr) > 30 ? 14 : 6; u.alt = u.flying ? (sheetH(s.spr) > 30 ? 20 : 14) : 0;
    u.summonValue = value != null ? value / n : s.cost / n;
    u.slot = Math.random();
    G.units.push(u); out.push(u);
  }
  G.stats.maxArmy = Math.max(G.stats.maxArmy, G.units.length);
  addRing(cx, cy, 10, 70, PAL.necro, 0.8); G.shake = 6;
  for (let i = 0; i < 40; i++) addParticle(cx + rnd(-20, 20), cy + rnd(-10, 10), rnd(-30, 30), rnd(-80, -20), pick([PAL.necro, PAL.necroD, '#efffef']), 1.2, 'p', 2);
  sfx('summon');
  return out;
}

// ---------------- mortals ----------------
export function laneSpawn(laneId: string) {
  const L = LANES.find(l => l.id === laneId) || LANES[1];
  return { x: WW + 12 + rnd(0, 10), y: L.cy * CELL + 8 + rnd(-12, 12) };
}

export function spawnEnemy(type: string | null, lane: string, opts: any = {}): Ent {
  const isBoss = !!opts.boss;
  const d = isBoss ? opts.boss : ENEMIES[type!];
  const p = laneSpawn(lane);
  const n = G.run.wave;
  const fervor = G.run.fervor || 1;
  const e = Object.assign(baseEnt('enemy', p.x, p.y), { type: isBoss ? d.id : type!, def: d, team: 'm' as const, flying: !!d.flying, lane });
  const hpM = waveHpMult(n) * fervor * (opts.champion ? 5 : 1) * waveMods().hp;
  const dmgM = waveDmgMult(n) * Math.sqrt(fervor) * (opts.champion ? 1.6 : 1);
  if (isBoss) {
    const extra = Math.max(0, n - d.wave);
    e.maxHp = e.hp = Math.round(d.hp * waveHpMult(n) / waveHpMult(d.wave) * (1 + extra * 0.05) * Math.sqrt(fervor) * 1.6 * waveMods().hp);
    e.dmg = d.dmg * waveDmgMult(n) / waveDmgMult(d.wave) * 1.3;
    // story events can weaken the next boss (systems/events.ts 'bossHp'); consumed here
    const ro = G.run.rogue; if (ro && ro.bossHp && ro.bossHp !== 1) { e.maxHp = e.hp = Math.round(e.maxHp * ro.bossHp); ro.bossHp = 1; }
  } else {
    e.maxHp = e.hp = Math.round(d.hp * hpM);
    e.dmg = d.dmg * dmgM;
  }
  e.armor = d.armor || 0; e.range = d.range; e.spd = d.spd * (1 - fb('enemySlow')); e.cd = d.cd;
  e.bounty = Math.round(d.bounty * bountyMult(n) * (opts.champion ? 6 : 1) * (isBoss ? 2 : 1));
  e.xp = d.xp * (opts.champion ? 6 : 1) * (1 + n * 0.03);
  e.spr = isBoss ? d.id : type!;
  e.boss = isBoss; e.champion = !!opts.champion;
  e.rad = isBoss ? 14 : sheetH(e.spr) > 28 ? 10 : 5;
  e.alt = e.flying ? (isBoss ? 22 : 16) : 0;
  e.charged = false; e.abT = 4; e.silT = rnd(3, 8);
  if (opts.champion) e.name = championName();
  if (isBoss) { e.name = d.name; e.title = d.title; }
  G.enemies.push(e);
  codexSee('enemy', e.spr);
  return e;
}
function championName() {
  const first = ['Sir Aldric', 'Dame Seraphine', 'Lord Halvard', 'Brother Cassian', 'Captain Roderick', 'Magister Ilsa', 'Warden Thorne', 'Sister Maren', 'Marshal Odo', 'Ser Gawin'];
  const epi = ['the Unbowed', 'the Pure', 'of the Silver Dawn', 'Lichbane', 'the Relentless', 'Gravebreaker', 'the Faithful', 'Bonecrusher'];
  return pick(first) + ' ' + pick(epi);
}

// ---------------- structures ----------------
export function placeTower(type: string, cx: number, cy: number, tier = 0, opts: any = {}): Ent {
  const t = Object.assign(baseEnt('tower', (cx + 1) * CELL, (cy + 1) * CELL + 6), { type, def: TOWERS[type], tier, cx, cy, team: 'u' as const, blocks: true, mode: 'first', kills: 0, silT: 0, hasteT: 0, haste: 0, abT: 3, abT2: 5, rad: 12, invested: opts.invested || TOWERS[type].cost, plot: opts.plot || null, matInvested: opts.matInvested || 0 });
  t.maxHp = towerMaxHp(t); t.hp = opts.hp ?? t.maxHp;
  // towers on rampart mounts stand on top of the wall (which already blocks): they claim no cells,
  // and they sit on the segment's middle cell
  if (t.plot && String(t.plot).startsWith('m_')) { t.mount = true; t.x = (cx + 1) * CELL + 8; t.y = (cy + 1) * CELL + 8; }
  else for (let y = cy; y < cy + 2; y++) for (let x = cx; x < cx + 2; x++) G.map.struct[cellIdx(x, y)] = t;
  G.map.dirty = true;
  G.towers.push(t);
  G.stats.maxTowers = Math.max(G.stats.maxTowers, G.towers.length);
  codexSee('tower', type);
  return t;
}
export function placeFort(type: string, cx: number, cy: number, opts: any = {}): Ent {
  const d = FORTS[type];
  const f = Object.assign(baseEnt('fort', cx * CELL + 8, cy * CELL + 8), { type, def: d, cx, cy, team: 'u' as const, blocks: !!d.block, trapT: 0, abT: 0, rad: 7, site: opts.site || null, wtier: opts.wtier || (type === 'wall' ? 2 : 0) });
  f.maxHp = d.hp ? fortMaxHp(f) : 1; f.hp = opts.hp ?? f.maxHp;
  G.map.struct[cellIdx(cx, cy)] = f;
  G.map.dirty = true;
  G.forts.push(f);
  return f;
}
export function removeStructure(s: Ent) {
  s.dead = true;
  if (s.kind === 'tower') {
    for (let y = s.cy; y < s.cy + 2; y++) for (let x = s.cx; x < s.cx + 2; x++) if (G.map.struct[cellIdx(x, y)] === s) G.map.struct[cellIdx(x, y)] = null;
    G.towers.splice(G.towers.indexOf(s), 1);
  } else {
    if (G.map.struct[cellIdx(s.cx, s.cy)] === s) G.map.struct[cellIdx(s.cx, s.cy)] = null;
    G.forts.splice(G.forts.indexOf(s), 1);
  }
  G.map.dirty = true;
  if (G.selected === s) G.selected = null;
  retire(s);
}

// ---------------- damage ----------------
const MAGIC: Record<string, number> = { fire: 1, frost: 1, shock: 1, necro: 1, arcane: 1, holy: 1 };
export const DCOL: Record<string, string> = { fire: '#ffb04a', frost: '#9fe6ff', shock: '#d8f6ff', necro: '#8dffa0', arcane: '#d0a0ff', holy: '#fff3c4', phys: '#e8e8e0', siege: '#e8e8e0' };
export const NEUTRAL_SRC = { team: 'u', def: {}, kind: 'spell' };

// ---------------- per-wave report (end-of-wave summary) ----------------
/** The running report of the current wave: damage and kills per source, undead fallen. */
export function waveReport() {
  if (!G.wave) return null;
  return G.wave.report || (G.wave.report = { src: {} as Record<string, any>, fallen: {} as Record<string, any> });
}
function reportSrc(src: any) {
  const rep = waveReport(); if (!rep) return null;
  const key = !src ? 'x:other' : src.kind === 'unit' ? 'u:' + src.type : src.kind === 'tower' ? 't:' + src.type : src.kind === 'lich' ? 'x:lich' : 'x:spell';
  let rec = rep.src[key];
  if (!rec) rec = rep.src[key] = { key, dmg: 0, kills: {}, n: 0, spr: src && (src.kind === 'unit' ? src.spr : src.kind === 'tower' ? 'tower_' + src.type : null), tier: src && src.tier || 0, type: src && src.type, kind: src && src.kind };
  return rec;
}

export function dealDamage(t: any, amount: number, dtype: string, src: any, opt: any = {}): number {
  if (!t || t.dead || amount <= 0) return 0;
  if (t.kind === 'keep') { damageKeep(amount, src); return amount; }
  let dmg = amount, crit = false;
  if (src && src.team === 'u' && !opt.noCrit && Math.random() < G.run.m.crit) { dmg *= G.run.m.critMult; crit = true; }
  if (t.team === 'm') {
    if (G.run.mods.reaper && !t.reaped && src && src.team === 'u') { dmg *= 2; t.reaped = true; } // Reaper's Mark: the first blow lands twice as hard
    if (t.def.dodge && !opt.aoe && Math.random() < t.def.dodge) { addText(t.x, t.y - 18, 'dodge', '#aaaaaa'); return 0; }
    if (opt.proj && t.def.projArmor) dmg *= 1 - t.def.projArmor;
    if (MAGIC[dtype] && t.def.mres) dmg *= 1 - t.def.mres;
    if (dtype === 'necro' && t.st.wardT > 0) dmg *= 0.75;
    if (t.st.weakT > 0) dmg *= 1 + t.st.weak;
    if (t.st.prisonT > 0) dmg *= 1.25;
  } else if (t.team === 'u') {
    if (src && src.def && src.def.holy && t.kind === 'unit') dmg *= 2;
    if (src && src.def && src.def.bigSlayer && t.kind === 'unit' && (t.def.size >= 3 || t.summon)) dmg *= src.def.bigSlayer;
    if (opt.proj && t.type === 'skeleton' && G.run.mods.skel_shield) dmg *= 0.7;
    if (t.kind !== 'unit' && opt.spell && G.forts.some((f: any) => f.type === 'ward' && dist2(f.x, f.y, t.x, t.y) < 2500)) dmg *= 0.5;
  }
  if (dtype === 'phys' || dtype === 'siege') {
    let arm = t.armor || 0;
    if (src && src.def && src.def.pierce) arm *= 1 - src.def.pierce;
    if (opt.pierce) arm *= 1 - opt.pierce;
    if (t.st.shredT > 0) arm *= 0.4;
    dmg *= 1 - clamp(arm, 0, 0.85);
  }
  if (dtype === 'siege' && t.kind === 'unit') dmg *= 0.3;
  dmg = Math.max(1, dmg);
  const dealt = Math.min(dmg, Math.max(0, t.hp)); // lifesteal never feeds on overkill
  t.hp -= dmg;
  t.hitT = 0.12;
  if (t.team === 'm' && G.phase === 'wave') { const rec = reportSrc(src); if (rec) rec.dmg += dealt; }
  // damage numbers: one merged number per target every 0.35s (crits always pop) so big fights stay readable
  if (G.settings.dmgNumbers && (t.team === 'm' || dmg > t.maxHp * 0.08)) {
    t.dmgAcc = (t.dmgAcc || 0) + dmg;
    if (crit || !(t.dmgTxtT > G.time)) {
      addText(t.x + rnd(-4, 4), t.y - sheetH(t.spr) - t.alt - 2, fmtDmg(t.dmgAcc) + (crit ? '!' : ''), crit ? '#ffd257' : t.team === 'm' ? DCOL[dtype] || '#e8e8e0' : '#ff6060', crit);
      t.dmgAcc = 0; t.dmgTxtT = G.time + 0.35;
    }
  }
  if (src && src.kind === 'unit' && src.def && src.def.lifesteal) healUnit(src, dealt * src.def.lifesteal, G.run.mods.vamp_feast);
  if (t.hp <= 0) killEntity(t, src, dtype);
  return dmg;
}
function fmtDmg(n: number) { if (n < 1000) return '' + Math.round(n); if (n < 1e6) return (n / 1000).toFixed(n < 1e4 ? 1 : 0) + 'k'; return (n / 1e6).toFixed(1) + 'm'; }

export function healUnit(u: any, amt: number, splash = false) {
  if (u.dead) return;
  u.hp = Math.min(u.maxHp, u.hp + amt);
  if (splash) { // Blood Feast: the 2 most wounded undead nearby get 30% of it (was everyone at 50%: quadratic in dense hosts)
    const near: any[] = [];
    G.hashU.query(u.x, u.y, 50, (o: any) => { if (o !== u && !o.dead && o.hp < o.maxHp) near.push(o); });
    near.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
    for (let i = 0; i < Math.min(2, near.length); i++) near[i].hp = Math.min(near[i].maxHp, near[i].hp + amt * 0.3);
  }
}

export function damageKeep(amount: number, src: any) {
  if (G.phase === 'over') return;
  if (G.keep.ward > 0) { addText(KEEP.x + rnd(-30, 30), KEEP.y0, 'warded', PAL.necro); return; }
  amount *= 0.7; // the keep's masonry absorbs 30%
  G.keep.hp -= amount; G.keep.flash = 0.15;
  if (G.wave) G.wave.keepDamaged = true;
  if (G.time - G.lastKeepLine > 25) { G.lastKeepLine = G.time; lichSay(G.keep.hp < G.keep.maxHp * 0.3 ? 'keepLow' : 'keepHit'); }
  G.shake = Math.max(G.shake, 2);
  if (G.run.mods.keep_spikes && src && !src.dead && src.team === 'm' && G.time - (src.spikeT || 0) > 1) {
    src.spikeT = G.time;
    dealDamage(src, (30 + G.run.wave * 6) * globalDmg(), 'phys', NEUTRAL_SRC, { noCrit: true }); spawnBurst(src.x, src.y - 4, PAL.bone, 5);
  }
  if (G.keep.hp <= 0) keepFallen();
}

export function killEntity(t: any, src: any, dtype?: string) {
  if (t.dead) return;
  t.dead = true;
  if (t.kind === 'enemy') onEnemyDeath(t, src, dtype);
  else if (t.kind === 'unit') onUnitDeath(t);
  else if (t.kind === 'tower' || t.kind === 'fort') {
    // a fallen tower leaves a ruin on its plot; it rises again when the wave is repelled
    if (t.kind === 'tower' && t.plot && G.run) G.run.ruins[t.plot] = { type: t.type, tier: t.tier, mat: t.matInvested || 0, mode: t.mode, kills: t.kills };
    t.dead = false; removeStructure(t);
    for (let i = 0; i < 24; i++) addParticle(t.x + rnd(-10, 10), t.y - rnd(0, 20), rnd(-40, 40), rnd(-60, -10), pick([PAL.stone, PAL.stoneL, PAL.stoneD]), 1.2, 'p', 2, 140);
    addRing(t.x, t.y, 4, 30, '#888888', 0.4); sfx('crumble');
    if (t.kind === 'tower') { msg(`${towerStats(t).name} has fallen: it will be rebuilt after the wave.`, '#ff6060'); G.shake = 4; }
    stampDecal(t.x, t.y, 'rubble');
  }
}

function onEnemyDeath(e: any, src: any, dtype?: string) {
  const r = G.run;
  const i = G.enemies.indexOf(e); if (i >= 0) G.enemies.splice(i, 1);
  e.dieT = 0; G.dying.push(e);
  r.kills++; G.stats.totalKills++;
  { const rec = reportSrc(src); if (rec) { const k = e.spr || e.type; rec.kills[k] = (rec.kills[k] || 0) + 1; rec.n++; const rep = waveReport(); (rep.names || (rep.names = {}))[k] = e.name || k; } }
  let souls = e.bounty * (1 + r.m.souls + metaLv('s_gain') * 0.1 + fb('souls')) * ascSouls() * waveMods().reward;
  let hb = 0;
  for (const t of G.towers) if (t.type === 'harvester' && dist2(t.x, t.y, e.x, e.y) < towerStats(t).range ** 2) hb = Math.max(hb, [0.5, 1, 1.5][t.tier]);
  souls *= 1 + hb;
  if (e.st.bloodT > 0) souls *= 2;
  souls = Math.round(souls);
  r.souls += souls; r.soulsEarned += souls;
  addSoulParticle(e.x, e.y - 8, souls);
  gainXp(e.xp * (1 + r.m.xp + fb('xp')));
  if (!e.flying || e.boss) addCorpse(e);
  const bloodless = e.def.bloodless;
  for (let k = 0; k < (e.boss ? 40 : 8); k++) addParticle(e.x + rnd(-4, 4), e.y - rnd(2, 12) - e.alt, rnd(-50, 50), rnd(-70, -10), bloodless ? pick(['#888888', '#aaaaaa', PAL.wood]) : pick([PAL.blood, PAL.bloodD, '#a02020']), 0.8, 'p', 1 + (Math.random() < 0.3 ? 1 : 0), 160);
  if (e.def.holy) addFlash(e.x, e.y - 10, 30, PAL.holy, 0.3);
  if (dtype === 'frost' && e.st.freezeT > 0) for (let k = 0; k < 10; k++) addParticle(e.x, e.y - 8, rnd(-60, 60), rnd(-60, 20), pick([PAL.frost, '#ffffff']), 0.6, 'p', 2, 120);
  if (!bloodless && Math.random() < 0.5) stampDecal(e.x, e.y, 'blood');
  const fromTower = src && src.kind === 'tower' ? src : null;
  if (fromTower) fromTower.kills++;
  if (fromTower && fromTower.type === 'necrotic' && r.mods.necro_raise && Math.random() < 0.5 && e.corpse) raiseCorpse(e.corpse, 25);
  if (fromTower && fromTower.type === 'necrotic' && fromTower.tier === 2 && G.citadelRaised < 8 && e.corpse) { if (raiseCorpse(e.corpse, 0, 'skeleton3')) G.citadelRaised++; }
  if (r.mods.frost_shatter && e.st.freezeT > 0) { aoeDamage(e.x, e.y, 32, e.maxHp * 0.3, 'frost', NEUTRAL_SRC); addRing(e.x, e.y, 4, 32, PAL.frost, 0.35); }
  if (r.mods.volatile && Math.random() < 0.25) { aoeDamage(e.x, e.y, 30, e.maxHp * 0.25 + 20, 'necro', NEUTRAL_SRC); explosion(e.x, e.y, 30, PAL.necro); }
  if (r.mods.feast) G.hashU.query(e.x, e.y, 70, (u: any) => { u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.06); });
  if (src && src.kind === 'unit' && src.type === 'deathknight' && r.mods.dk_regen) src.hp = Math.min(src.maxHp, src.hp + src.maxHp * 0.2);
  if (r.mods.leg_soulfire) { const n2 = G.hashE.nearest(e.x, e.y, 120, (o: any) => o !== e); if (n2) fireProjectile(NEUTRAL_SRC, e.x, e.y - 8, n2, 'soulbolt', e.maxHp * 0.3, 'necro', {}); }
  const legionChance = (r.mods.leg_legion ? 0.2 : 0) + metaLv('n_raise') * 0.04;
  if (e.corpse && legionChance > 0 && Math.random() < legionChance) raiseCorpse(e.corpse, r.mods.leg_legion ? 40 : 25);
  if (e.boss) bossKilled(e);
  if (e.champion) { msg(`${e.name} has fallen!`, PAL.gold); r.essenceBonus += 5; }
  sfx(e.boss ? 'bossdie' : 'die', 0.6);
}

function onUnitDeath(u: any) {
  const i = G.units.indexOf(u); if (i >= 0) G.units.splice(i, 1);
  u.dieT = 0; G.dying.push(u);
  { const rep = waveReport(); if (rep && !u.temp) { const k = u.spr; const f = rep.fallen[k] || (rep.fallen[k] = { n: 0, type: u.type }); f.n++; } }
  // every non-temporary undead returns when the wave is repelled
  if (!u.temp && G.wave) G.wave.fallen.push({ type: u.type, summon: !!u.summon, free: !!u.free, spr: u.fixedSpr ? u.spr : null, value: u.summonValue || 0, mult: u.raisedMult || 1 });
  if (G.run.mods.pyre && !u.temp && !u.summon) { aoeDamage(u.x, u.y, 28, u.maxHp * 0.4, 'necro', u); if (Math.random() < 0.3) explosion(u.x, u.y, 24, PAL.necro); } // Martyr's Pyre
  if (u.type === 'zombie' && G.run.mods.zom_explode) { aoeDamage(u.x, u.y, 34, 40 + u.maxHp * 0.4, 'necro', u); explosion(u.x, u.y, 34, PAL.necro); }
  if (!u.summon && !u.temp && G.run.mods.unit_rise && !u.rose && Math.random() < 0.3) {
    G.timers.push({ t: 1.2, fn: () => { if (G.phase !== 'wave') return; const n = spawnUnit(u.type, u.x, u.y, { free: u.free }); n.rose = true; if (G.wave) G.wave.fallen.pop(); addText(u.x, u.y - 20, 'reassembled', PAL.necro); } });
  }
  for (let k = 0; k < 6; k++) addParticle(u.x, u.y - 8 - u.alt, rnd(-40, 40), rnd(-60, -10), u.def.bloodless === false ? PAL.blood : pick([PAL.bone, PAL.boneD, PAL.necroD]), 0.7, 'p', 1, 160);
}

export function aoeDamage(x: number, y: number, r: number, dmg: number, dtype: string, src: any, opt: any = {}) {
  const hit: any[] = [];
  G.hashE.query(x, y, r + 6, (e: any) => { hit.push(e); });
  for (const e of hit) {
    const d = dist(x, y, e.x, e.y);
    const f = d < r * 0.4 ? 1 : 1 - 0.4 * (d - r * 0.4) / (r * 0.6);
    dealDamage(e, dmg * clamp(f, 0.5, 1), dtype, src, Object.assign({ aoe: true }, opt));
    if (opt.onHit) opt.onHit(e);
  }
  return hit;
}

// ---------------- corpses ----------------
export function addCorpse(e: any) {
  const c = { x: e.x, y: e.y, spr: e.spr, face: e.face, t: 0, life: 45, type: e.type, big: sheetH(e.spr) > 28 || e.boss, gone: false };
  e.corpse = c;
  G.corpses.push(c);
  if (G.corpses.length > 160) { const old = G.corpses.shift(); bakeCorpse(old); }
}
export function bakeCorpse(c: any) { G.decalQueue.push({ x: c.x, y: c.y, kind: 'corpse', spr: c.spr, face: c.face }); c.gone = true; retire(c); }
export function removeCorpse(c: any) { const i = G.corpses.indexOf(c); if (i >= 0) G.corpses.splice(i, 1); c.gone = true; retire(c); }
export function raiseCorpse(c: any, dur: number, spr?: string): Ent | null {
  if (!c || c.gone) return null;
  removeCorpse(c);
  const u = spawnUnit('skeleton', c.x, c.y, { temp: dur, free: true, mult: c.big ? 2 : 1, tierSpr: spr });
  u.raised = true;
  addRing(c.x, c.y, 2, 18, PAL.necro, 0.4);
  for (let i = 0; i < 8; i++) addParticle(c.x + rnd(-6, 6), c.y, rnd(-10, 10), rnd(-50, -20), PAL.necro, 0.8, 'p', 1);
  return u;
}

// ---------------- projectiles ----------------
const PROJ = new Pool<any>(() => ({}), 300);
const PROJ_SPEED: Record<string, number> = { arrow: 260, bolt: 280, fireball: 0, necrobolt: 190, frostbolt: 200, bonebolt: 360, holybolt: 200, holyfire: 170, arcanebolt: 220, boulder: 0, bonespit: 200, soulbolt: 240, firebreath: 300, lichbolt: 230, meteor: 0 };
export function fireProjectile(src: any, x: number, y: number, target: any, kind: string, dmg: number, dtype: string, o: any = {}) {
  const p = PROJ.get();
  Object.assign(p, { src, team: src.team, x, y, sx: x, sy: y, target, tx: target.x, ty: target.y - (target.alt || 0) - 6, kind, dmg, dtype, splash: o.splash || 0, pierce: o.pierce || 0, hits: null, t: 0, life: 3, onHit: o.onHit || null, speed: PROJ_SPEED[kind] || 220, lob: 0, dur: 0, armorPierce: o.armorPierce || 0, homing: o.homing !== false, ang: 0 });
  if (kind === 'fireball' || kind === 'boulder' || kind === 'meteor') {
    p.tx = target.x + (target.vx || 0) * 0.4; p.ty = target.y;
    p.dur = kind === 'meteor' ? 0.7 : clamp(dist(x, y, p.tx, p.ty) / 170, 0.45, 1.3);
    p.lob = kind === 'meteor' ? 0 : 30 + dist(x, y, p.tx, p.ty) * 0.15;
    p.homing = false;
    if (kind === 'meteor') { p.sx = p.tx + 60; p.sy = p.ty - 140; p.x = p.sx; p.y = p.sy; }
  }
  if (o.straight) { p.homing = false; const a = Math.atan2(p.ty - y, p.tx - x); p.vx = Math.cos(a) * p.speed; p.vy = Math.sin(a) * p.speed; p.life = (o.maxDist || 300) / p.speed; p.hits = new Set(); }
  if (G.projectiles.length < 600) G.projectiles.push(p); else PROJ.release(p);
  return p;
}

export function updateProjectiles(dt: number) {
  const P = G.projectiles;
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    p.t += dt;
    const done = () => { P[i] = P[P.length - 1]; P.pop(); PROJ.release(p); };
    if (p.dur) {
      const k = Math.min(1, p.t / p.dur);
      p.x = p.sx + (p.tx - p.sx) * k; p.y = p.sy + (p.ty - p.sy) * k - Math.sin(k * Math.PI) * p.lob;
      p.ang = Math.atan2(p.ty - p.sy, p.tx - p.sx);
      if ((p.kind === 'fireball' || p.kind === 'meteor') && Math.random() < 0.8) addParticle(p.x, p.y, rnd(-8, 8), rnd(-14, 2), pick([PAL.fire, PAL.fireL, PAL.fireD]), 0.35, 'p', 1);
      if (k >= 1) { impact(p); done(); }
      continue;
    }
    if (p.hits) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.ang = Math.atan2(p.vy, p.vx);
      const hitList: any[] = [];
      G.hashE.query(p.x, p.y + 6, 10, (e: any) => { if (!p.hits.has(e)) hitList.push(e); });
      for (const e of hitList) {
        p.hits.add(e); dealDamage(e, p.dmg, p.dtype, p.src, { proj: true, pierce: p.armorPierce });
        if (p.onHit) p.onHit(e, p);
        spawnBurst(e.x, e.y - 8, PAL.bone, 3);
        if (!p.pierce) { p.t = 99; break; }
      }
      if (p.t > p.life) { if (p.splash) impact(p); done(); }
      continue;
    }
    if (p.homing && p.target && !p.target.dead) { p.tx = p.target.x; p.ty = p.target.y - (p.target.alt || 0) - 6; }
    const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.sqrt(dx * dx + dy * dy), step = p.speed * dt;
    p.ang = Math.atan2(dy, dx);
    if (d <= step + 2 || p.t > p.life) { p.x = p.tx; p.y = p.ty; impact(p); done(); continue; }
    p.x += dx / d * step; p.y += dy / d * step;
    const trail: Record<string, string[]> = { necrobolt: [PAL.necro, PAL.necroD], soulbolt: [PAL.necro, PAL.necroD], lichbolt: [PAL.necro, PAL.necroD], frostbolt: [PAL.frost, '#ffffff'], holyfire: [PAL.holy, PAL.holyD], holybolt: [PAL.holy, PAL.holyD], arcanebolt: [PAL.arcane, '#f0dcff'], firebreath: [PAL.fire, PAL.fireL, PAL.fireD] };
    const tc = trail[p.kind];
    if (tc && Math.random() < 0.7) addParticle(p.x, p.y, rnd(-5, 5), rnd(-5, 5), pick(tc), 0.3, 'p', p.kind === 'firebreath' ? 2 : 1);
  }
}

function impact(p: any) {
  const src = p.src, tgt = p.target;
  if (p.splash) {
    if (p.team === 'u') aoeDamage(p.x, p.y + (p.dur ? 0 : 6), p.splash, p.dmg, p.dtype, src, { proj: true, onHit: p.onHit && ((e: any) => p.onHit(e, p)) });
    else {
      G.hashU.query(p.x, p.y, p.splash, (u: any) => { if (src.def && src.def.structOnly) return; dealDamage(u, p.dmg, p.dtype, src, { proj: true, spell: true }); });
      structuresNear(p.x, p.y, p.splash).forEach(s => dealDamage(s, p.dmg * (src.def && src.def.siege ? 1 : 0.6), p.dtype === 'phys' ? 'siege' : p.dtype, src, { spell: true }));
      if (keepDistance(p.x, p.y) < p.splash) damageKeep(p.dmg * (src.def && src.def.siege ? 1 : 0.5), src);
    }
  } else if (tgt && tgt.kind === 'keep') damageKeep(p.dmg, src);
  else if (tgt && !tgt.dead) { dealDamage(tgt, p.dmg, p.dtype, src, { proj: true, pierce: p.armorPierce }); if (p.onHit) p.onHit(tgt, p); }
  switch (p.kind) {
    case 'fireball': explosion(p.x, p.y, p.splash || 20, PAL.fire); stampDecal(p.x, p.y, 'scorch'); sfx('boom', 0.4); break;
    case 'meteor': explosion(p.x, p.y, p.splash || 30, PAL.fire, true); stampDecal(p.x, p.y, 'scorch'); G.shake = Math.max(G.shake, 3); sfx('boom', 0.7); break;
    case 'boulder': explosion(p.x, p.y, p.splash || 20, '#a09080'); stampDecal(p.x, p.y, 'rubble'); sfx('crumble', 0.5); break;
    case 'necrobolt': case 'soulbolt': case 'lichbolt': spawnBurst(p.x, p.y, PAL.necro, 5); addFlash(p.x, p.y, 16, PAL.necro, 0.15); if (p.splash) addRing(p.x, p.y, 2, p.splash, PAL.necro, 0.3); break;
    case 'frostbolt': addRing(p.x, p.y + 6, 2, p.splash || 10, PAL.frost, 0.3); spawnBurst(p.x, p.y, PAL.frost, 6); if (p.splash) stampDecal(p.x, p.y + 6, 'frost'); break;
    case 'holyfire': case 'holybolt': spawnBurst(p.x, p.y, PAL.holy, 5); addFlash(p.x, p.y, 18, PAL.holy, 0.15); break;
    case 'arcanebolt': spawnBurst(p.x, p.y, PAL.arcane, 5); addFlash(p.x, p.y, 14, PAL.arcane, 0.12); break;
    case 'bonespit': spawnBurst(p.x, p.y, PAL.bone, 5); if (p.splash) addRing(p.x, p.y, 2, p.splash, PAL.bone, 0.25); break;
    case 'firebreath': explosion(p.x, p.y, p.splash || 30, PAL.fire); stampDecal(p.x, p.y, 'scorch'); break;
    case 'bonebolt': spawnBurst(p.x, p.y, PAL.bone, 6); if (p.splash) addRing(p.x, p.y + 6, 2, p.splash, PAL.bone, 0.25); break;
    default: spawnBurst(p.x, p.y, '#bbbbbb', 2);
  }
}

export function keepDistance(x: number, y: number) {
  const dx = Math.max(KEEP.x0 - x, 0, x - KEEP.x1), dy = Math.max(KEEP.y0 + 40 - y, 0, y - KEEP.y1);
  return Math.sqrt(dx * dx + dy * dy);
}
export function structuresNear(x: number, y: number, r: number) {
  const out: any[] = [];
  for (const t of G.towers) if (dist2(t.x, t.y, x, y) < (r + 10) ** 2) out.push(t);
  for (const f of G.forts) if (f.def.hp && dist2(f.x, f.y, x, y) < (r + 6) ** 2) out.push(f);
  return out;
}

// ---------------- hazards ----------------
export function addHazard(x: number, y: number, r: number, dps: number, dtype: string, life: number, kind: string, extra: any = {}) {
  if (G.hazards.length > 80) G.hazards.shift();
  G.hazards.push(Object.assign({ x, y, r, dps, dtype, life, t: 0, kind, tick: 0 }, extra));
}
export function updateHazards(dt: number) {
  for (let i = G.hazards.length - 1; i >= 0; i--) {
    const h = G.hazards[i];
    h.t += dt; h.tick -= dt;
    if (h.tick <= 0) {
      h.tick = 0.25;
      G.hashE.query(h.x, h.y, h.r, (e: any) => {
        dealDamage(e, h.dps * 0.25, h.dtype, h.src || NEUTRAL_SRC, { aoe: true, noCrit: true });
        if (h.slow) applySlow(e, h.slow, 0.5);
        if (h.kind === 'blood') e.st.bloodT = 0.6;
      });
      if (h.kind === 'blood') G.hashU.query(h.x, h.y, h.r + 20, (u: any) => { u.hp = Math.min(u.maxHp, u.hp + h.dps * 0.1); });
    }
    if (h.kind === 'fire' && Math.random() < 0.5) addParticle(h.x + rnd(-h.r, h.r), h.y + rnd(-h.r * 0.5, h.r * 0.5), rnd(-4, 4), rnd(-30, -10), pick([PAL.fire, PAL.fireD, PAL.fireL]), 0.45, 'p', 1);
    if (h.kind === 'rift' && Math.random() < 0.6) { const a = rnd(TAU); addParticle(h.x + Math.cos(a) * h.r, h.y + Math.sin(a) * h.r * 0.6, -Math.cos(a) * 30, -Math.sin(a) * 18, pick([PAL.arcane, '#f0dcff']), 0.5, 'p', 1); }
    if (h.kind === 'blood' && Math.random() < 0.6) addParticle(h.x + rnd(-h.r, h.r), h.y + rnd(-h.r * 0.5, h.r * 0.5), 0, rnd(-30, -10), pick([PAL.blood, '#c03030']), 0.5, 'p', 1);
    if (h.t > h.life) G.hazards.splice(i, 1);
  }
}

// ---------------- status ----------------
export function applySlow(e: any, amt: number, t: number) { if (amt >= (e.st.slow || 0) || (e.st.slowT || 0) <= 0) e.st.slow = amt; e.st.slowT = Math.max(e.st.slowT || 0, t); }
export function applyFreeze(e: any, t: number) { if (e.boss) t *= 0.3; e.st.freezeT = Math.max(e.st.freezeT || 0, t); }
export function applyStun(e: any, t: number) { if (e.boss) t *= 0.3; e.st.stunT = Math.max(e.st.stunT || 0, t); }
const STATUS_KEYS = ['slowT', 'freezeT', 'stunT', 'rootT', 'weakT', 'burnT', 'wardT', 'prisonT', 'plagueT', 'fearT', 'bloodT', 'shredT'];
export function tickStatus(e: any, dt: number) {
  const s = e.st;
  for (const k of STATUS_KEYS) if (s[k] > 0) s[k] -= dt;
  if (s.burnT > 0) { s.burnTick = (s.burnTick || 0) - dt; if (s.burnTick <= 0) { s.burnTick = 0.5; dealDamage(e, s.burnDps * 0.5, 'fire', NEUTRAL_SRC, { noCrit: true }); if (Math.random() < 0.7) addParticle(e.x + rnd(-3, 3), e.y - 10, 0, -20, PAL.fire, 0.4, 'p', 1); } }
  if (s.plagueT > 0) { s.plTick = (s.plTick || 0) - dt; if (s.plTick <= 0) { s.plTick = 0.5; dealDamage(e, s.plagueDps * 0.5, 'necro', NEUTRAL_SRC, { noCrit: true }); addParticle(e.x, e.y - 10, rnd(-5, 5), -15, '#7fa040', 0.5, 'p', 1); } }
}
export function moveMult(e: any) {
  const s = e.st;
  if (s.freezeT > 0 || s.stunT > 0 || s.rootT > 0 || s.prisonT > 0) return 0;
  let m = 1;
  if (s.slowT > 0) m *= 1 - s.slow;
  if (G.tdT > 0) m *= 0.5;
  for (const f of G.wards) if (dist2(f.x, f.y, e.x, e.y) < 2500) { m *= 0.7; break; }
  return m;
}
export { lightningBolt, addRing, addFlash, addText, explosion, spawnBurst, addParticle, rndi, MW };

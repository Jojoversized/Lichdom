// AI for mortals, the autonomous undead army, towers, fortifications and the Lich.
import { G } from '../core/state';
import { dist, dist2, rnd, rndi, pick, clamp, TAU } from '../core/util';
import { CELL, KEEP, GUARD_LINE_X, LANES, PAL, WW, WH } from '../config/constants';
import { fortWallX, LICH_POS, GATE, R_CURTAIN, R_BULWARK, threatensZone, gateDist, DEFENSE_R } from '../data/fortress';
import { sfx } from '../core/events';
import { flowStep, worldToCell, cellIdx, flowDist } from '../world/mapgen';
import {
  dealDamage, aoeDamage, fireProjectile, keepDistance, damageKeep, tickStatus, moveMult, applySlow, applyFreeze, applyStun,
  raiseCorpse, removeCorpse, spawnUnit, killEntity, addHazard, healUnit, NEUTRAL_SRC,
} from './combat';
import { addParticle, addRing, addFlash, addText, lightningBolt, explosion, addSoulParticle } from './fx';
import { towerStats, globalDmg, dtypeMult, frenzyMult, fb, bld, metaLv, structPower, arcanePower, waveTech, bountyMult, soulMult } from './stats';
import { gainXp } from './progression';
import { bossAbilities } from './bosses';
import { WALL_TIERS } from '../data/towers';

export function setAnim(e: any, a: string) { if (e.anim !== a) { e.anim = a; e.at = 0; } }
function startAttack(e: any) { setAnim(e, 'atk'); e.atkHold = 0.3; }
function moveToward(e: any, tx: number, ty: number, spd: number, dt: number) {
  const dx = tx - e.x, dy = ty - e.y, d = Math.sqrt(dx * dx + dy * dy);
  if (d < 0.5) return true;
  const s = Math.min(d, spd * dt);
  e.x += (dx / d) * s; e.y += (dy / d) * s;
  if (!e.flying) { const fx = fortWallX(e.y) + 3; if (e.x < fx) e.x = fx; } // nobody walks through the fortress wall
  e.vx = (dx / d) * spd;
  if (Math.abs(dx) > 0.3) e.face = dx > 0 ? 1 : -1;
  return d <= spd * dt;
}
function blockingAt(cx: number, cy: number) { const s = G.map.struct[cellIdx(cx, cy)]; return s && s.blocks && !s.dead ? s : null; }
export function keepReach(e: any) { return e.def.ranged ? Math.min(e.range, e.def.structOnly ? 110 : 44) : e.range; }
const KEEP_TARGET = { kind: 'keep', dead: false, hp: 1, x: KEEP.x1, y: KEEP.y, alt: 0 };

// =====================================================================
// MORTALS
// =====================================================================
export function updateEnemy(e: any, dt: number) {
  tickStatus(e, dt);
  if (e.dead) return;
  // knockbacks and terror must never carry a mortal off the field (unreachable = an endless wave)
  if (e.x > WW + 14) e.x = WW + 14; if (e.y < 8) e.y = 8; else if (e.y > WH - 8) e.y = WH - 8;
  e.at += dt;
  if (e.hitT > 0) e.hitT -= dt;
  if (e.atkHold > 0) { e.atkHold -= dt; if (e.atkHold <= 0) setAnim(e, 'idle'); }
  e.cdT -= dt;
  const d = e.def;
  const mm = moveMult(e);
  if (e.st.freezeT > 0 || e.st.stunT > 0) return;
  if (e.boss) bossAbilities(e, dt);
  if (d.healer) {
    e.abT -= dt;
    if (e.abT <= 0) {
      e.abT = 2;
      let best: any = null, bp = 0.95;
      G.hashE.query(e.x, e.y, 80, (o: any) => { const p = o.hp / o.maxHp; if (p < bp) { bp = p; best = o; } });
      if (best) { best.hp = Math.min(best.maxHp, best.hp + best.maxHp * 0.08); setAnim(e, 'cast'); e.atkHold = 0.4; addFlash(best.x, best.y - 8, 20, PAL.holy, 0.3); }
    }
  }
  if (d.auraWard) G.hashE.query(e.x, e.y, 60, (o: any) => { o.st.wardT = 0.5; });
  if (d.silencer) {
    e.silT -= dt;
    if (e.silT <= 0) {
      let did = false;
      for (const t of G.towers) if (dist2(t.x, t.y, e.x, e.y) < 70 * 70) { const warded = G.forts.some((f: any) => f.type === 'ward' && dist2(f.x, f.y, t.x, t.y) < 2500); t.silT = warded ? 1 : 4; did = true; }
      if (did) { addRing(e.x, e.y, 4, 70, PAL.arcane, 0.5); sfx('silence', 0.5); e.silT = 8; } else e.silT = 1;
    }
  }
  if (e.st.fearT > 0) { moveToward(e, e.x + 30, e.y, e.spd * 0.8, dt); setAnim(e, 'walk'); return; }
  e.retT -= dt;
  if (e.retT <= 0) { e.retT = 0.25 + Math.random() * 0.15; e.target = enemyFindTarget(e); }
  if (e.target && (e.target.dead || (e.target.kind !== 'keep' && e.target.hp <= 0))) e.target = null;
  if (e.target) {
    const t = e.target;
    const td = t.kind === 'keep' ? keepDistance(e.x, e.y) : Math.max(0, dist(e.x, e.y, t.x, t.y) - (t.rad || 4));
    if (td <= (t.kind === 'keep' ? keepReach(e) : e.range) + 2) {
      e.face = (t.kind === 'keep' ? KEEP.x : t.x) > e.x ? 1 : -1;
      if (e.cdT <= 0) { enemyAttack(e, t); e.cdT = e.cd; }
      else if (e.anim === 'walk') setAnim(e, 'idle');
      return;
    }
    if ((t.kind === 'unit' || t.kind === 'fort' || t.kind === 'tower') && mm > 0) { moveToward(e, t.x, t.y, e.spd * mm, dt); setAnim(e, 'walk'); return; }
  }
  if (mm <= 0) { if (e.anim === 'walk') setAnim(e, 'idle'); return; }
  const kd = keepDistance(e.x, e.y);
  if (kd <= keepReach(e) + 2) { e.target = KEEP_TARGET; return; }
  if (e.flying || e.x > WW - 2) {
    // flyers go straight for the keep; ground units walk in from beyond the map edge
    if (e.flying || e.x > WW - 2) { moveToward(e, e.flying ? KEEP.x1 - 10 : WW - 8, e.flying ? KEEP.y + ((e.id % 7) - 3) * 10 : e.y, e.spd * mm, dt); setAnim(e, 'walk'); return; }
  }
  const climber = !!d.climber;
  const [ncx, ncy] = flowStep(G.map, e.x, e.y, climber);
  const blk = blockingAt(ncx, ncy);
  let spd = e.spd * mm;
  if (blk && !climber) { e.target = blk; return; }
  const [ccx, ccy] = worldToCell(e.x, e.y);
  if (climber && blockingAt(ccx, ccy)) spd *= 0.4;
  const here = G.map.struct[cellIdx(ccx, ccy)];
  if (here && here.type === 'lava') { e.st.lavaT = (e.st.lavaT || 0) - dt; if (e.st.lavaT <= 0) { e.st.lavaT = 0.5; dealDamage(e, here.def.dps * 0.5 * structPower() * dtypeMult('fire') * globalDmg(), 'fire', NEUTRAL_SRC, { aoe: true, noCrit: true }); } }
  if (here && here.type === 'rune' && here.trapT <= 0) triggerRune(here);
  if (d.charge && !e.charged) spd *= 1.2;
  spd = escortSpeed(e, spd, dt);
  if (spd <= 0) { if (e.anim === 'walk') setAnim(e, 'idle'); return; }
  const tx = ncx * CELL + 8 + ((e.id * 7) % 9 - 4), ty = ncy * CELL + 8 + ((e.id * 13) % 9 - 4);
  moveToward(e, tx, ty, spd, dt);
  if ((e.id + G.stepN) % 2 === 0) { let n = 0; G.hashE.query(e.x, e.y, 7, (o: any) => { if (o !== e && !o.flying) { const dx = e.x - o.x, dy = e.y - o.y, dd = Math.hypot(dx, dy) || 1; e.x += (dx / dd) * 16 * dt; e.y += (dy / dd) * 16 * dt; return ++n >= 5; } }); }
  setAnim(e, 'walk');
}

// ---------------- escorts ----------------
/** Slow crusaders (siege engines, constructs, bosses) that faster soldiers escort on the march. */
const isEscortee = (o: any) => !o.dead && !o.flying && (o.spd <= 16 || o.def.siege) && o.team === 'm';
/** Faster crusaders on the march keep pace with a slow engine marching behind them instead of rushing
 *  ahead and dying alone: they match its speed, and wait if they get more than ~3 cells ahead. Only
 *  outside the battle (beyond the defence zone, no target) — once the fighting starts, everyone charges. */
function escortSpeed(e: any, spd: number, dt: number): number {
  if (e.boss || isEscortee(e) || e.def.charge || gateDist(e.x, e.y) < DEFENSE_R + 70) return spd;
  e.escT = (e.escT || 0) - dt;
  if (e.escT <= 0) {
    e.escT = 0.8 + Math.random() * 0.4;
    if (e.escort && (e.escort.dead || dist2(e.x, e.y, e.escort.x, e.escort.y) > 200 * 200)) e.escort = null;
    if (!e.escort) {
      let best: any = null, bd = 130 * 130;
      G.hashE.query(e.x, e.y, 130, (o: any) => { if (o !== e && isEscortee(o)) { const dd = dist2(o.x, o.y, e.x, e.y); if (dd < bd) { bd = dd; best = o; } } });
      e.escort = best;
    }
  }
  const o = e.escort;
  if (!o || o.dead) return spd;
  const f = G.map.flow, fe = f[cellIdx(...worldToCell(e.x, e.y))], fo = f[cellIdx(...worldToCell(o.x, o.y))];
  const lead = fo - fe; // > 0: we are ahead of the engine (closer to the gate)
  if (lead > 3) return 0;                        // too far ahead: wait for it
  if (lead > 0.5) return Math.min(spd, o.spd * (o.st.slowT > 0 ? 0.6 : 1)); // in front of it: keep its pace
  return spd;                                    // beside or behind it: close up at full speed
}

function enemyFindTarget(e: any) {
  const d = e.def;
  if (d.structOnly) {
    if (d.ranged) {
      let best: any = null, bd = e.range ** 2;
      for (const t of G.towers) { const dd = dist2(t.x, t.y, e.x, e.y); if (dd < bd) { bd = dd; best = t; } }
      if (!best) for (const f of G.forts) if (f.def.hp) { const dd = dist2(f.x, f.y, e.x, e.y); if (dd < bd) { bd = dd; best = f; } }
      if (best) return best;
      if (keepDistance(e.x, e.y) < keepReach(e)) return KEEP_TARGET;
      return null;
    }
    return e.target && e.target.kind !== 'unit' ? e.target : null;
  }
  let taunt: any = null;
  G.hashU.query(e.x, e.y, 60, (u: any) => { if (u.def.taunt) { taunt = u; return true; } });
  if (!taunt) for (const t of G.towers) if (t.def.taunt && dist2(t.x, t.y, e.x, e.y) < 3600) { taunt = t; break; }
  if (taunt && !d.ranged) return taunt;
  if (d.hunter === 'struct') {
    let best: any = null, bd = 130 * 130;
    for (const t of G.towers) { const dd = dist2(t.x, t.y, e.x, e.y); if (dd < bd) { bd = dd; best = t; } }
    if (best) return best;
  }
  const aggro = d.ranged ? e.range : 26;
  let best: any = null, bd = Infinity;
  G.hashU.query(e.x, e.y, aggro, (u: any) => { const dd = dist2(u.x, u.y, e.x, e.y); if (dd < bd) { bd = dd; best = u; } });
  if (best) return best;
  if (d.ranged) {
    let bt: any = null; bd = e.range * e.range;
    for (const t of G.towers) { const dd = dist2(t.x, t.y, e.x, e.y); if (dd < bd) { bd = dd; bt = t; } }
    if (bt && (d.ranged === 'fireball' || Math.random() < 0.5)) return bt;
    if (keepDistance(e.x, e.y) < keepReach(e)) return KEEP_TARGET;
  }
  if (e.target && (e.target.kind === 'fort' || e.target.kind === 'tower') && !e.target.dead) return e.target;
  return null;
}

function enemyAttack(e: any, t: any) {
  const d = e.def;
  if (d.ranged) {
    setAnim(e, ['fireball', 'frostbolt', 'holyfire', 'arcanebolt', 'holybeam'].includes(d.ranged) ? 'cast' : 'atk'); e.atkHold = 0.35;
    const tt = t.kind === 'keep' ? { kind: 'keep', x: clamp(e.x, KEEP.x0 + 10, KEEP.x1 - 10), y: KEEP.y1 - 20, alt: 0, dead: false } : t;
    const kind = d.ranged === 'holybeam' ? 'holyfire' : d.ranged;
    const dtype = kind === 'fireball' ? 'fire' : kind === 'frostbolt' ? 'frost' : kind === 'holyfire' || kind === 'holybolt' ? 'holy' : kind === 'arcanebolt' ? 'arcane' : 'phys';
    const p = fireProjectile(e, e.x + e.face * 6, e.y - 12 - e.alt, tt, kind, e.dmg, dtype, { splash: d.splash || 0, onHit: d.slowOnHit ? ((u: any) => { u.st.slowT = 2; u.st.slow = d.slowOnHit; }) : null });
    if (kind === 'fireball' && !d.splash) p.splash = 16;
    sfx(kind === 'boulder' ? 'catapult' : kind === 'fireball' ? 'fireball' : 'shoot', 0.3);
    return;
  }
  startAttack(e);
  if (t.kind === 'keep') { damageKeep(e.dmg * (d.siege ? 1.5 : 1), e); sfx('hit', 0.3); return; }
  let dmg = e.dmg;
  if (d.charge && !e.charged) { dmg *= d.charge; e.charged = true; }
  if (t.kind === 'unit' && t.def.antiCav && d.cav) {
    dealDamage(e, t.dmg * 0.5, 'phys', t);
    if (G.run.mods.pike_wall) e.x += 10;
  }
  if (d.siege && t.kind !== 'unit') dmg *= 1.5;
  dealDamage(t, dmg, t.kind === 'unit' ? (d.holy ? 'holy' : 'phys') : 'siege', e);
  const th = t.kind === 'fort' ? (t.type === 'wall' ? WALL_TIERS[t.wtier || 2].thorns : t.def.thorns) : 0;
  if (th) dealDamage(e, th * structPower() * globalDmg(), 'phys', NEUTRAL_SRC, { noCrit: true });
  if (t.kind === 'fort' && t.type === 'wall' && G.run.mods.leg_bulwark) dealDamage(e, e.maxHp * 0.03 + 10, 'phys', NEUTRAL_SRC, { noCrit: true });
  sfx(t.kind === 'unit' ? 'hit' : 'hitstone', 0.2);
}

// =====================================================================
// THE UNDEAD ARMY — autonomous tactical AI (no player micromanagement)
// =====================================================================
// Every few tenths of a second a planner assigns each undead a target using
// a cost that weighs: how close the mortal is to the keep (urgency), how far
// the undead must travel, how many allies already engage it (spread out),
// and unit role (ranged stay behind the line, flyers hunt flyers, taunters
// go where the press is thickest). Idle undead form a guard line in front of
// the gate, distributed toward the roads that carried the most recent threat.
let planT = 0;
const laneHeat: Record<string, number> = {};

function isRanged(u: any) { return !!u.def.ranged; }
/** Where an idle undead stands. The host fills the player's half of the field: each unit
 *  gets a stable post from its own id on a low-discrepancy (R2) sequence, so posts are
 *  evenly spread, never stack, and don't reshuffle when others die. The formation grows
 *  with the host — a tight block at the gate for a small army, out toward midfield for a
 *  large one — melee in front, ranged mixed into the rear ranks, flyers above the front. */
/** Formation context shared by every guard post of one planning pass (computed once, not per unit). */
function formationCtx() {
  const lanes = LANES.filter(l => l.minWave <= waveTech(Math.max(1, G.run.wave + 1)));
  let wy = 0, ws = 0; for (const l of lanes) { const w = 1 + (laneHeat[l.id] || 0); wy += (l.cy * CELL + 8) * w; ws += w; }
  return { fallback: G.enemies.some((e: any) => e.boss), lean: ((ws ? wy / ws : GATE.y) - GATE.y) / 400 };
}
function guardPosition(u: any, ctx: any, count: number) {
  // with a boss on the field the host tightens behind the Curtain, under the towers
  const fallback = ctx.fallback;
  const ranged = isRanged(u);
  let r0: number, r1: number;
  if (fallback) { r0 = ranged ? 40 : 70; r1 = R_CURTAIN + 30; }
  else if (ranged) { r0 = R_CURTAIN - 40; r1 = R_CURTAIN + 50; }        // just behind / on the Curtain
  else if (u.flying) { r0 = R_BULWARK - 50; r1 = R_BULWARK + 30; }      // over the Bulwark
  else { r0 = R_CURTAIN + 28; r1 = R_BULWARK + 24; }                     // between the walls, holding the Bulwark
  // a small host stands compact around the gate road; a large one fills the whole arc
  const cell = fallback ? 13 : u.flying ? 34 : 30;
  const rm = (r0 + r1) / 2;
  const spread = clamp((Math.max(1, count) * cell * cell) / ((r1 - r0) * rm), 0.9, 2.9);
  // lean toward the roads that carried recent pressure
  const a0 = clamp(ctx.lean, -0.5, 0.5) * (1 - spread / 3.2);
  const n = u.id + 1;
  const fr = (0.5 + n * 0.7548776662) % 1, fa = (0.5 + n * 0.5698402910) % 1;
  const r = r0 + fr * (r1 - r0), a = clamp(a0 + (fa - 0.5) * spread, -1.5, 1.5);
  let x = GATE.x + Math.cos(a) * r, y = clamp(GATE.y + Math.sin(a) * r, 18, WH - 12);
  x = Math.max(x, fortWallX(y) + 8);
  return { x, y };
}
/** Ground undead defend the gate: they plan only against foes in the defence zone or shooting into it
 *  (ranged crusaders parked just outside used to pepper the host unanswered). `t.z0` / `t.z1`: the
 *  zone tests for ground / flying undead, computed once per threat. */
function inZone(u: any, t: any) {
  if (u.summon || mopUp) return true;
  return (u.flying ? t.z1 : t.z0) || dist2(u.x, u.y, t.e.x, t.e.y) < 60 * 60;
}
/** The planner runs in PLAN_SLICES interleaved slices on consecutive ticks, so a 3,000-strong host
 *  never plans all at once (that used to spike a single step to 30–50 ms). */
const PLAN_SLICES = 3;
/** Mop-up: once the whole wave is on the field and only stragglers remain (no boss), the host leaves the
 *  defence zone and hunts them down wherever they stand. */
let mopUp = false;
let planSlice = 0, planCrowd = new Map<any, number>();

export function planArmy(dt: number) {
  planT -= dt;
  for (const k in laneHeat) laneHeat[k] *= Math.pow(0.9, dt);
  if (planT > 0) return;
  planT = 0.35 / PLAN_SLICES;
  const slice = planSlice; planSlice = (planSlice + 1) % PLAN_SLICES;
  if (slice === 0) { for (const e of G.enemies) laneHeat[e.lane] = Math.min(20, (laneHeat[e.lane] || 0) + 0.05); planCrowd = new Map(); }
  const crowd = planCrowd;
  { const W = G.wave; mopUp = !!W && G.phase === 'wave' && W.idx >= W.spawns.length && (W.lateT || 0) > 20 && G.enemies.length <= 15 && !G.enemies.some((e: any) => e.boss); }
  const ground = G.units.filter((u: any) => !isRanged(u) && !u.flying).length;
  // enemies sorted by urgency (closest to keep first)
  const threats = G.enemies.map((e: any) => ({ e, fd: e.flying ? Math.max(0, e.x - KEEP.x1) / CELL : flowDist(e.x, e.y), z0: threatensZone(e, 0), z1: threatensZone(e, 120) }));
  // only the most urgent threats are worth planning around (keeps huge hosts cheap)
  threats.sort((a: any, b: any) => a.fd - b.fd);
  if (threats.length > 90) threats.length = 90;
  const nRanged = G.units.filter((u: any) => isRanged(u)).length;
  const ctx = formationCtx();
  for (let i = slice; i < G.units.length; i += PLAN_SLICES) {
    const u = G.units[i];
    u.guard = isRanged(u) ? guardPosition(u, ctx, nRanged) : guardPosition(u, ctx, Math.max(1, ground));
    let best: any = null, bc = Infinity;
    for (const t of threats) {
      const e = t.e;
      if (!inZone(u, t)) continue;
      const travel = dist(u.x, u.y, e.x, e.y);
      const c = crowd.get(e) || 0;
      let cost = travel * 0.8 + t.fd * CELL * 0.6 + c * (u.def.taunt ? 5 : 22);
      if (e.boss || e.champion) cost -= 60;
      if (u.flying && e.flying) cost -= 120;
      if (u.def.antiCav && e.def.cav) cost -= 80;
      if (u.def.hunter && (e.def.ranged || e.def.caster || e.def.healer)) cost -= 90; // wendigos hunt the backline
      if (u.type === 'deathknight' && e.armor > 0.3) cost -= 50;
      if (u.def.taunt) cost -= c * 30; // taunters dive into the thick of it
      if (cost < bc) { bc = cost; best = e; }
    }
    u.plan = best;
    if (best) crowd.set(best, (crowd.get(best) || 0) + (isRanged(u) ? 0.5 : 1));
  }
}

export function updateUnit(u: any, dt: number) {
  u.at += dt;
  if (u.hitT > 0) u.hitT -= dt;
  if (u.atkHold > 0) { u.atkHold -= dt; if (u.atkHold <= 0) setAnim(u, 'idle'); }
  if (u.temp > 0) { u.temp -= dt; if (u.temp <= 0) { u.hp = 0; killEntity(u, null); return; } }
  if (u.st.slowT > 0) u.st.slowT -= dt;
  u.cdT -= dt * frenzyMult();
  const d = u.def;
  const spd = u.spd * (u.st.slowT > 0 ? 1 - u.st.slow : 1);
  // undead fight to the death (v0.12.1: no falling back to mend); those fighting at the gate still mend there
  const nearKeep = keepDistance(u.x, u.y) < 40;
  if (nearKeep && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.05 * dt);
  const emb = bld('embalm') * 0.008 + metaLv('m_regen') * 0.005; if (emb && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * emb * dt); // Embalmer's Hall
  if (u.raiser) {
    u.abT = (u.abT ?? u.raiser) - dt;
    if (u.abT <= 0) {
      u.abT = u.raiser;
      let best: any = null, bd = 90 * 90;
      for (const c of G.corpses) { const dd = dist2(c.x, c.y, u.x, u.y); if (dd < bd) { bd = dd; best = c; } }
      if (best) {
        const perm = G.run.mods.acolyte_perm && G.extraRaised < 10;
        const s = raiseCorpse(best, perm ? 0 : 25);
        if (s && perm) { G.extraRaised++; s.free = true; }
        setAnim(u, 'cast'); u.atkHold = 0.5;
        lightningBolt(u.x, u.y - 14, best.x, best.y, PAL.necro, 0.25, 1, 3);
      }
    }
  }
  if (d.aura) {
    u.auraT = (u.auraT || 0) - dt;
    if (u.auraT <= 0) { u.auraT = 0.25; let sum = 0; G.hashE.query(u.x, u.y, d.aura, (e: any) => { sum += dealDamage(e, u.dmg * 1.5 * 0.25, 'necro', u, { aoe: true, noCrit: true }); }); if (sum > 0) G.run.souls += Math.round(sum * 0.01); }
    if (Math.random() < 0.6) { const a = rnd(TAU); addParticle(u.x + Math.cos(a) * d.aura, u.y + Math.sin(a) * d.aura * 0.6, -Math.cos(a) * 40, -Math.sin(a) * 24, PAL.necro, 0.6, 'p', 1); }
  }
  // opportunistic retarget: anything already in range takes priority
  let t = u.plan && !u.plan.dead ? u.plan : null;
  u.retT -= dt;
  if (u.retT <= 0) {
    u.retT = 0.25;
    const near = G.hashE.nearest(u.x, u.y, (u.range || 14) + 6);
    if (near) u.engage = near; else u.engage = null;
  }
  if (u.engage && !u.engage.dead) t = u.engage;
  // never chase a foe out of the defence zone: hit it if it is in reach, otherwise go back to the post
  if (t && !u.summon && !u.flying && !threatensZone(t, 40) && dist(u.x, u.y, t.x, t.y) - (t.rad || 4) > u.range) t = null;
  if (t) {
    u.atPost = false;
    const td = dist(u.x, u.y, t.x, t.y) - (t.rad || 4);
    // ranged undead kite away from mortal melee that closes in
    if (isRanged(u) && td < 16 && t.def.melee && !u.flying) { moveToward(u, u.x - 20, u.y + (u.slot > 0.5 ? 8 : -8), spd, dt); setAnim(u, 'walk'); }
    if (td <= u.range) {
      u.face = t.x > u.x ? 1 : -1;
      if (u.cdT <= 0) { unitAttack(u, t); u.cdT = u.cd; }
      else if (u.anim === 'walk') setAnim(u, 'idle');
      return;
    }
    const want = isRanged(u) ? u.range * 0.85 : 0;
    const dx = t.x - u.x, dy = t.y - u.y, dd = Math.hypot(dx, dy) || 1;
    moveToward(u, t.x - (dx / dd) * want, t.y - (dy / dd) * want, spd, dt); setAnim(u, 'walk');
  } else {
    // hold the post with hysteresis: arrive within 3px, only march again when pushed >12px
    // away; small nudges (crowding, a post shifting as the host grows) are absorbed by a
    // slow drift without switching to the walk cycle — no more walk/idle flicker
    const g = u.guard || { x: GATE.x + R_CURTAIN, y: GATE.y };
    const gd = dist2(u.x, u.y, g.x, g.y);
    if (u.atPost && gd > 144) u.atPost = false;
    if (!u.atPost && gd <= 9) u.atPost = true;
    if (!u.atPost) { moveToward(u, g.x, g.y, spd, dt); setAnim(u, 'walk'); }
    else { if (gd > 1) moveToward(u, g.x, g.y, Math.min(spd, 6), dt); if (u.anim === 'walk') setAnim(u, 'idle'); }
  }
  // crowd separation: staggered over 3 steps (3x strength) and capped at 5 neighbours,
  // so an uncapped host of thousands stays cheap
  if (!u.flying && !u.atPost && (u.id + G.stepN) % 3 === 0) {
    let n = 0;
    G.hashU.query(u.x, u.y, 6, (o: any) => {
      if (o === u || o.flying) return;
      const dx = u.x - o.x, dy = u.y - o.y, dd = Math.hypot(dx, dy) || 1;
      u.x += (dx / dd) * 30 * dt; u.y += (dy / dd) * 30 * dt;
      return ++n >= 5;
    });
  }
}

function unitAttack(u: any, t: any) {
  const d = u.def, r = G.run;
  if (d.ranged) {
    setAnim(u, d.ranged === 'arrow' ? 'atk' : 'cast'); u.atkHold = 0.35;
    if (d.ranged === 'scream') {
      addRing(t.x, t.y, 2, u.splash, '#cfe8ff', 0.4); sfx('wail', 0.3);
      aoeDamage(t.x, t.y, u.splash, u.dmg, 'necro', u, { onHit: (e: any) => applySlow(e, d.slow, 2) });
      return;
    }
    const shots = d.ranged === 'arrow' && r.mods.arch_volley ? 2 : 1;
    for (let i = 0; i < shots; i++) {
      let tt = t;
      if (i > 0) { const o = G.hashE.nearest(t.x, t.y, 60, (e: any) => e !== t); if (o) tt = o; }
      const onHit = d.ranged === 'arrow' && r.mods.arch_explosive ? ((e: any) => { aoeDamage(e.x, e.y, 18, u.dmg * 0.5, 'fire', u); explosion(e.x, e.y, 14, PAL.fire); })
        : d.ranged === 'necrobolt' && u.type === 'bonemage' && r.mods.mage_chain ? ((e: any) => chainBounce(u, e, u.dmg * 0.6, 2)) : null;
      fireProjectile(u, u.x + u.face * 5, u.y - 12 - u.alt, tt, d.ranged, u.dmg, d.dtype, { splash: u.splash, onHit });
    }
    sfx(d.ranged === 'arrow' ? 'bow' : d.ranged === 'firebreath' ? 'fireball' : 'necro', 0.2);
    return;
  }
  startAttack(u);
  if (d.cleave || u.splash) {
    const cr = d.cleave || u.splash;
    aoeDamage(t.x, t.y, cr, u.dmg, d.dtype, u);
    if (u.type === 'golem' && r.mods.golem_quake && !t.dead && !(t.st.stunT > 0)) applyStun(t, 0.6); // the struck foe only: a golem crowd must not stun-lock the whole field
    addRing(t.x, t.y, 2, cr, u.summon ? PAL.necro : '#bbbbaa', 0.25);
    if (u.def.size >= 3 || u.summon) { G.shake = Math.max(G.shake, 1.5); sfx('slam', 0.35); }
  } else {
    let dmg = u.dmg;
    if (d.antiCav && t.def.cav) dmg *= d.antiCav;
    dealDamage(t, dmg, d.dtype, u);
    if (d.drain) healUnit(u, dmg * d.drain);
    if (u.type === 'wraith' && r.mods.wraith_terror && Math.random() < 0.35 && !t.boss && !t.def.siege && G.time > (t.fearImm || 0)) { t.st.fearT = 1.5; t.fearImm = G.time + 8; } // then it steels itself for a while
    if (u.type === 'zombie' && r.mods.zom_plague) { t.st.plagueT = 4; t.st.plagueDps = u.dmg * 0.8; }
    sfx('slash', 0.15);
  }
}

function chainBounce(src: any, from: any, dmg: number, n: number) {
  let cur = from; const hit = new Set([from]);
  for (let i = 0; i < n; i++) {
    const nx = G.hashE.nearest(cur.x, cur.y, 70, (e: any) => !hit.has(e));
    if (!nx) break;
    hit.add(nx); lightningBolt(cur.x, cur.y - 8, nx.x, nx.y - 8, PAL.necro, 0.2, 1, 3);
    dealDamage(nx, dmg, 'necro', src); cur = nx;
  }
}

// =====================================================================
// TOWERS
// =====================================================================
function towerTarget(t: any, range: number, filter?: (e: any) => boolean) {
  let best: any = null, score = -Infinity;
  G.hashE.query(t.x, t.y - 8, range, (e: any) => {
    if (filter && !filter(e)) return;
    let s: number;
    if (t.mode === 'strongest') s = e.hp;
    else if (t.mode === 'closest') s = -dist2(e.x, e.y, t.x, t.y);
    else s = -(e.flying ? Math.max(0, e.x - KEEP.x1) / CELL : flowDist(e.x, e.y));
    if (e.boss && t.mode === 'strongest') s += 1e12;
    if (s > score) { score = s; best = e; }
  });
  return best;
}
export function densestEnemy(x: number, y: number, r: number) {
  let best: any = null, bc = 0;
  G.hashE.query(x, y, r, (e: any) => { let c = 0; G.hashE.query(e.x, e.y, 40, () => { c++; }); if (e.boss) c += 5; if (c > bc) { bc = c; best = e; } });
  return best;
}
export function chainLightning(src: any, ox: number, oy: number, first: any, dmg: number, chains: number) {
  const hit = new Set();
  let cur = first, px = ox, py = oy, dd = dmg;
  for (let i = 0; i <= chains && cur; i++) {
    hit.add(cur);
    lightningBolt(px, py, cur.x, cur.y - 8 - cur.alt, i === 0 ? '#e8fbff' : '#9fe6ff', 0.2, i === 0 ? 2 : 1, 5);
    dealDamage(cur, dd, 'shock', src);
    if (G.run.mods.tesla_stun && Math.random() < 0.2) applyStun(cur, 0.7);
    if (i < 6) addFlash(cur.x, cur.y - 8, 20, '#bff2ff', 0.12);
    px = cur.x; py = cur.y - 8 - cur.alt; dd *= 0.88;
    const c = cur; cur = G.hashE.nearest(c.x, c.y, 70, (e: any) => !hit.has(e));
  }
}

export function updateTower(t: any, dt: number) {
  t.at += dt;
  if (t.hitT > 0) t.hitT -= dt;
  if (t.silT > 0) { t.silT -= dt; if (Math.random() < 0.2) addParticle(t.x + rnd(-8, 8), t.y - 30, 0, -10, PAL.arcane, 0.5, 'p', 1); return; }
  if (t.hasteT > 0) t.hasteT -= dt;
  { const q = bld('quarry'); if (q && t.hp < t.maxHp) t.hp = Math.min(t.maxHp, t.hp + t.maxHp * 0.02 * q * dt); } // Bone Quarry
  const st = towerStats(t), d = t.def, r = G.run;
  t.cdT -= dt;
  if (t.fireT > 0) t.fireT -= dt;
  const ox = t.x, oy = t.y - 30 - t.tier * 4;
  switch (t.type) {
    case 'brimstone': {
      if (t.cdT <= 0) {
        const e = towerTarget(t, st.range);
        if (e) {
          t.cdT = st.cd; t.fireT = 0.2;
          for (let i = 0; i < (t.tier >= 1 ? 2 : 1); i++) fireProjectile(t, ox, oy, i === 0 ? e : (G.hashE.nearest(e.x, e.y, 70, (o: any) => o !== e) || e), 'fireball', st.dmg, 'fire', { splash: d.splash, onHit: r.mods.brim_split ? null : null });
          sfx('fireball', 0.3);
          if (r.mods.brim_split) for (let k = 0; k < 3; k++) G.timers.push({ t: 0.9, fn: () => { const o = G.hashE.nearest(e.x + rnd(-30, 30), e.y + rnd(-20, 20), 50); if (o) fireProjectile(t, e.x, e.y - 10, o, 'fireball', st.dmg * 0.4, 'fire', { splash: 14 }); } });
          addHazard(e.x, e.y, 18, st.dmg * 0.25 * (r.mods.brim_inferno ? 2 : 1), 'fire', 3 * (r.mods.brim_inferno ? 2 : 1), 'fire');
        }
      }
      if (t.tier >= 2) { t.abT -= dt; if (t.abT <= 0) { const e = densestEnemy(t.x, t.y, st.range * 1.4); if (e) { fireProjectile(t, 0, 0, e, 'meteor', st.dmg * 2.5, 'fire', { splash: 40 }); t.abT = 8; } else t.abT = 1; } }
      if (r.mods.leg_hellfire) { t.abT2 -= dt; if (t.abT2 <= 0) { const e = pick(G.enemies) as any; if (e) fireProjectile(t, 0, 0, e, 'meteor', st.dmg * 2, 'fire', { splash: 36 }); t.abT2 = 10; } }
      break;
    }
    case 'tesla': {
      if (t.cdT <= 0) {
        const e = towerTarget(t, st.range);
        if (e) {
          t.cdT = st.cd; t.fireT = 0.15;
          let chains = d.chains + (t.tier >= 1 ? 3 : 0) + (t.tier >= 2 ? 4 : 0) + (r.mods.leg_storm ? 3 : 0);
          if (r.mods.tesla_chain) chains *= 2;
          chainLightning(t, ox, oy, e, st.dmg, chains); sfx('zap', 0.3);
        }
      }
      if (t.tier >= 2) { t.abT -= dt; if (t.abT <= 0) { t.abT = 6; for (let i = 0; i < 5; i++) { const e = towerTarget(t, st.range * 1.5, () => Math.random() < 0.5); if (e) { lightningBolt(e.x + rnd(-10, 10), e.y - 160, e.x, e.y - 6, '#e8fbff', 0.3, 2, 10); aoeDamage(e.x, e.y, 24, st.dmg * 1.5, 'shock', t); addFlash(e.x, e.y, 50, '#bff2ff', 0.25); } } sfx('thunder', 0.5); } }
      break;
    }
    case 'necrotic': {
      if (t.cdT <= 0) {
        const e = towerTarget(t, st.range);
        if (e) {
          t.cdT = st.cd; t.fireT = 0.2;
          let weak = d.weaken; for (let i = 1; i <= t.tier; i++) weak = d.tiers[i].weaken || weak;
          fireProjectile(t, ox, oy, e, 'necrobolt', st.dmg, 'necro', {
            onHit: (en: any) => {
              en.st.weakT = 3; en.st.weak = weak;
              const ally = G.hashU.nearest(t.x, t.y, 80, (u: any) => u.hp < u.maxHp);
              if (ally) ally.hp = Math.min(ally.maxHp, ally.hp + st.dmg * d.lifedrain);
              if (r.mods.necro_spread) { let k = 0; G.hashE.query(en.x, en.y, 40, (o: any) => { if (o !== en && k < 2) { k++; dealDamage(o, st.dmg * 0.4, 'necro', t); lightningBolt(en.x, en.y - 8, o.x, o.y - 8, PAL.necro, 0.15, 1, 2); } }); }
            },
          });
          sfx('necro', 0.2);
        }
      }
      break;
    }
    case 'frost': {
      if (t.tier >= 2) { t.auraT = (t.auraT || 0) - dt; if (t.auraT <= 0) { t.auraT = 0.3; G.hashE.query(t.x, t.y, st.range, (e: any) => applySlow(e, 0.3, 0.5)); } }
      if (t.cdT <= 0) {
        const e = towerTarget(t, st.range);
        if (e) {
          t.cdT = st.cd; t.fireT = 0.2;
          let fr = d.freeze; for (let i = 1; i <= t.tier; i++) fr = d.tiers[i].freeze || fr;
          const fdur = 1.5 * (r.mods.frost_formation ? 1.5 : 1);
          const allFreeze = r.mods.frost_formation && Math.random() < fr;
          fireProjectile(t, ox, oy, e, 'frostbolt', st.dmg, 'frost', { splash: d.splash, onHit: (en: any) => { applySlow(en, d.slow, 2.2); if (allFreeze || (en === e && Math.random() < fr)) applyFreeze(en, fdur); } });
          if (t.tier >= 1 && Math.random() < 0.3) addHazard(e.x, e.y, 20, 0, 'frost', 4, 'frost', { slow: 0.5 });
          sfx('frost', 0.25);
        }
      }
      break;
    }
    case 'artillery': {
      if (t.cdT <= 0) {
        const e = towerTarget(t, st.range);
        if (e) {
          t.cdT = st.cd; t.fireT = 0.3;
          for (let i = 0; i < (t.tier >= 2 ? 3 : 1); i++) {
            const tg = i === 0 ? e : (G.hashE.nearest(e.x + rnd(-30, 30), e.y + rnd(-30, 30), 80) || e);
            fireProjectile(t, ox, oy + 8, tg, 'bonebolt', st.dmg, 'phys', { splash: d.splash * (r.mods.art_quake ? 2 : 1), armorPierce: d.pierce, straight: t.tier >= 1, pierce: t.tier >= 1, maxDist: st.range + 40, onHit: r.mods.art_quake ? ((en: any) => applyStun(en, 0.6)) : null });
          }
          sfx('ballista', 0.4);
        }
      }
      break;
    }
    case 'harvester': {
      t.abT -= dt;
      if (t.abT <= 0) {
        t.abT = 3 / (t.tier + 1);
        let best: any = null, bd = st.range ** 2;
        for (const c of G.corpses) { const dd = dist2(c.x, c.y, t.x, t.y); if (dd < bd) { bd = dd; best = c; } }
        if (best) { removeCorpse(best); const s = Math.round(5 * bountyMult(r.wave) * soulMult()); r.souls += s; r.soulsEarned += s; gainXp(1 + r.wave * 0.1); addSoulParticle(best.x, best.y, s); lightningBolt(best.x, best.y - 2, t.x, t.y - 30, '#7dffb0', 0.3, 1, 3); addText(best.x, best.y - 10, '+' + s, PAL.necro); }
      }
      if (t.tier >= 2 && G.phase === 'wave') { t.passT = (t.passT || 0) + dt; if (t.passT >= 1) { t.passT = 0; r.souls += Math.round(3 * bountyMult(r.wave) * soulMult()); } }
      if (t.tier >= 1 || r.mods.harv_aura) {
        const hst = (t.tier >= 1 ? 0.1 : 0) + (r.mods.harv_aura ? 0.25 : 0);
        for (const o of G.towers) if (o !== t && dist2(o.x, o.y, t.x, t.y) < st.range ** 2) { o.hasteT = 0.5; o.haste = Math.max(o.haste || 0, hst); }
      }
      break;
    }
    case 'arcane': {
      if (t.cdT <= 0) {
        const pool: any[] = []; G.hashE.query(t.x, t.y, st.range, (e: any) => { pool.push(e); });
        if (pool.length) {
          t.cdT = st.cd; t.fireT = 0.15;
          const n = d.bolts + (t.tier >= 1 ? 2 : 0) + (t.tier >= 2 ? 2 : 0) + (r.mods.arcane_multi || 0) * 2;
          for (let i = 0; i < n; i++) fireProjectile(t, ox + rnd(-6, 6), oy + rnd(-6, 6), pick(pool), 'arcanebolt', st.dmg, 'arcane', {
            onHit: r.mods.arcane_chaos ? ((en: any) => { const k = rndi(0, 2); if (k === 0) { en.st.burnT = 3; en.st.burnDps = st.dmg; } else if (k === 1) applySlow(en, 0.5, 2); else { en.st.weakT = 3; en.st.weak = 0.2; } }) : null,
          });
          sfx('arcane', 0.15);
        }
      }
      if (t.tier >= 2) { t.abT -= dt; if (t.abT <= 0) { const e = densestEnemy(t.x, t.y, st.range); if (e) { addHazard(e.x, e.y, 34, st.dmg * 6, 'arcane', 4, 'rift'); addRing(e.x, e.y, 30, 4, PAL.arcane, 0.5); t.abT = 7; } else t.abT = 1; } }
      break;
    }
    case 'abomination': {
      if (t.cdT <= 0) {
        const e = G.hashE.nearest(t.x, t.y, st.range + 8);
        if (e) { t.cdT = st.cd; t.fireT = 0.25; aoeDamage(e.x, e.y, d.cleave, st.dmg, 'phys', t); addRing(e.x, e.y, 2, d.cleave, '#a06050', 0.25); sfx('slam', 0.3); }
      }
      t.abT -= dt;
      if (t.abT <= 0) {
        t.abT = 2;
        if (t.hp < t.maxHp) { const c = G.corpses.find((c: any) => dist2(c.x, c.y, t.x, t.y) < 80 * 80); if (c) { removeCorpse(c); t.hp = Math.min(t.maxHp, t.hp + t.maxHp * 0.15); addText(t.x, t.y - 40, 'devours', '#c08070'); } }
      }
      if (t.tier >= 1 || r.mods.abom_hook) { t.hookT = (t.hookT ?? 5) - dt; if (t.hookT <= 0) { t.hookT = 5; const e = G.hashE.nearest(t.x, t.y, 120, (o: any) => !o.boss && dist(o.x, o.y, t.x, t.y) > 40); if (e) { lightningBolt(t.x, t.y - 16, e.x, e.y - 8, '#9a7a60', 0.3, 1, 1); const a = Math.atan2(e.y - t.y, e.x - t.x); e.x = t.x + Math.cos(a) * 26; e.y = t.y + Math.sin(a) * 18; applyStun(e, 0.8); sfx('hook', 0.3); } } }
      if (t.tier >= 2) { t.abT2 -= dt; if (t.abT2 <= 0) { t.abT2 = 12; if (G.fleshZombies < 8) { spawnUnit('zombie', t.x + rnd(-10, 10), t.y + 14, { free: true }); G.fleshZombies++; } } }
      break;
    }
  }
}

export function updateNetArcs(dt: number) {
  G.netArcs.length = 0;
  const r = G.run;
  if (!r.mods.tesla_net && !r.mods.leg_storm) return;
  const ts = G.towers.filter((t: any) => t.type === 'tesla' && t.silT <= 0);
  const maxD = r.mods.leg_storm ? 1e9 : 170;
  for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) if (dist2(ts[i].x, ts[i].y, ts[j].x, ts[j].y) <= maxD * maxD) G.netArcs.push([ts[i], ts[j]]);
  G.netT = (G.netT || 0) - dt;
  if (G.netT > 0) return;
  G.netT = 0.25;
  for (const [a, b] of G.netArcs) {
    const dps = towerStats(a).dmg * 1.2 * (r.mods.leg_storm ? 3 : 1);
    const ax = a.x, ay = a.y - 34, bx = b.x, by = b.y - 34;
    const mx = (ax + bx) / 2, my = (ay + by) / 2, half = dist(ax, ay, bx, by) / 2 + 20;
    G.hashE.query(mx, my + 20, half, (e: any) => {
      const k = clamp(((e.x - ax) * (bx - ax) + (e.y - 8 - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2 || 1), 0, 1);
      const px = ax + (bx - ax) * k, py = ay + (by - ay) * k;
      if (dist2(px, py + 26, e.x, e.y) < 22 * 22) { dealDamage(e, dps * 0.25, 'shock', a, { aoe: true, noCrit: true }); if (Math.random() < 0.3) lightningBolt(px, py, e.x, e.y - 8, '#bff2ff', 0.12, 1, 3); }
    });
  }
}

// =====================================================================
// FORTIFICATIONS & THE LICH
// =====================================================================
export function triggerRune(f: any) {
  f.trapT = f.def.recharge;
  aoeDamage(f.x, f.y, f.def.radius, f.def.trap * structPower() * dtypeMult('necro') * globalDmg(), 'necro', NEUTRAL_SRC);
  explosion(f.x, f.y, f.def.radius, PAL.necro); sfx('boom', 0.35);
}
export function updateFort(f: any, dt: number) {
  { const q = bld('quarry'); if (q && f.def.hp && f.hp < f.maxHp) f.hp = Math.min(f.maxHp, f.hp + f.maxHp * 0.02 * q * dt); } // Bone Quarry
  if (f.hitT > 0) f.hitT -= dt;
  if (f.trapT > 0) f.trapT -= dt;
  if (f.type === 'cauldron') {
    f.abT -= dt;
    if (f.abT <= 0) {
      f.abT = 2;
      let any = false;
      G.hashE.query(f.x, f.y, f.def.radius, (e: any) => { { any = true; dealDamage(e, f.def.pour * structPower() * globalDmg(), 'fire', NEUTRAL_SRC, { aoe: true, noCrit: true }); e.st.shredT = 3; } });
      if (any) { for (let i = 0; i < 14; i++) addParticle(f.x + rnd(-f.def.radius, f.def.radius) * 0.7, f.y + rnd(-10, 10), rnd(-10, 10), rnd(-30, 5), pick(['#7fff5a', '#c8ff9a', '#d0a040']), 0.6, 'p', 1); addRing(f.x, f.y, 4, f.def.radius, '#7fff5a', 0.35); sfx('sizzle', 0.25); }
    }
  }
  if (f.type === 'wall' && G.run.mods.leg_bulwark && f.hp < f.maxHp) f.hp = Math.min(f.maxHp, f.hp + f.maxHp * 0.03 * dt);
}

export function updateLich(dt: number) {
  const L = G.lich, r = G.run;
  L.at += dt;
  if (L.castT > 0) { L.castT -= dt; if (L.castT <= 0) L.anim = 'idle'; }
  L.cdT -= dt;
  if (L.cdT <= 0 && G.phase === 'wave') {
    const lx = LICH_POS.x, ly = LICH_POS.y;
    const e = G.hashE.nearest(KEEP.x1, KEEP.y, 210);
    if (e) {
      L.cdT = 1.2 / (1 + r.m.lichAs);
      L.anim = 'cast'; L.at = 0; L.castT = 0.4; L.face = e.x > lx ? 1 : -1;
      for (let i = 0; i < r.m.lichBolts; i++) {
        const tg = i === 0 ? e : (G.hashE.nearest(e.x + rnd(-40, 40), e.y + rnd(-40, 40), 100) || e);
        fireProjectile({ team: 'u', def: {}, kind: 'lich' }, lx + L.face * 8, ly - 18, tg, 'lichbolt', (10 + r.level * 2) * arcanePower() * (1 + r.m.lichDmg) * globalDmg() * dtypeMult('necro'), 'necro', {});
      }
      sfx('necro', 0.25);
    } else L.cdT = 0.3;
  }
}

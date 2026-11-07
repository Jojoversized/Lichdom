// Roguelite layer (v0.8): the crusade chosen for each wave, story events between waves, and the
// lasting effects they leave (soul tithes, curses on the crusade, temporary war buffs).
// Pure simulation: no Phaser, no DOM.
import { G } from '../core/state';
import { rnd, rndi, pick } from '../core/util';
import { KEEP, PAL } from '../config/constants';
import { CRUSADE_TIERS, EVENTS, EVENT_EVERY, EventDef } from '../data/events';
import { UNITS } from '../data/units';
import { msg, sfx } from '../core/events';
import { spawnUnit } from './combat';
import { recalcAllStats, recalcKeep, bountyMult } from './stats';
import { spawnSquad, randomUnitType } from './campaign';

/** Roguelite state on the run (older saves lack it). */
export function rogue(r: any = G.run) {
  if (!r.rogue) r.rogue = { tithes: [], curses: [], buffs: [], seen: [], event: null, lastTier: 1 };
  return r.rogue;
}

// ---------------- crusade tiers ----------------
/** Multipliers for a crusade tier, including active curses on the crusade. */
export function tierMods(tier: number) {
  const t = CRUSADE_TIERS[tier] || CRUSADE_TIERS[1];
  let count = t.count, hp = t.hp;
  for (const c of rogue().curses) { count *= c.count || 1; hp *= c.hp || 1; }
  return { tier: t, count, hp, reward: t.reward, mats: t.mats };
}
/** Multipliers for the wave being fought (or about to start). */
export function waveMods() { return tierMods((G.wave && G.wave.tier) ?? rogue().lastTier); }

/** Souls per second from active tithes (added during waves). */
export function titheRate() { let s = 0; for (const t of rogue().tithes) s += t.ps; return s; }
export function stepRogue(dt: number) {
  if (G.phase !== 'wave' || !G.run) return;
  const ro = rogue(); if (!ro.tithes.length) return;
  ro.acc = (ro.acc || 0) + titheRate() * dt;
  if (ro.acc >= 1) { const n = Math.floor(ro.acc); ro.acc -= n; G.run.souls += n; G.run.soulsEarned += n; }
}
/** After a repelled wave: tithes, curses and buffs count down; maybe queue a story event. */
export function afterWave() {
  const r = G.run, ro = rogue();
  for (const k of ['tithes', 'curses', 'buffs']) ro[k] = ro[k].filter((x: any) => --x.waves > 0);
  if (r.wave > 0 && r.wave % EVENT_EVERY === 0 && !ro.event) ro.event = pickEvent();
}
function pickEvent(): string {
  const r = G.run, ro = rogue();
  const pool = EVENTS.filter(e => !e.minWave || e.minWave <= r.wave);
  const fresh = pool.filter(e => !ro.seen.includes(e.id));
  const ev = pick(fresh.length ? fresh : pool);
  ro.seen.push(ev.id); if (ro.seen.length > EVENTS.length - 1) ro.seen.shift();
  return ev.id;
}
export function pendingEvent(): EventDef | null { const id = G.run && rogue().event; return id ? EVENTS.find(e => e.id === id) || null : null; }

// ---------------- event effects ----------------
const scaled = (base: number, perWave: number) => base + (perWave || 0) * G.run.wave;
/** Raises `n` undead whose types are drawn at random, body by body, from `types`. */
function raiseRandom(n: number, types: string[]): string {
  const counts: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const t: string = pick(types);
    const a = rnd(0, Math.PI * 2), rr = rnd(10, 40);
    spawnUnit(t, KEEP.x1 + 30 + Math.cos(a) * rr, KEEP.y + Math.sin(a) * rr * 0.8);
    counts[t] = (counts[t] || 0) + 1;
  }
  return `${n} undead rise: ` + Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${c}× ${UNITS[t].tiers[G.run.unitTier[t] || 0].name}`).join(', ');
}
/** Applies one choice of the pending event; returns the result text. */
export function resolveEvent(choice: number): string {
  const ev = pendingEvent(); if (!ev) return '';
  const c = ev.choices[choice]; if (!c) return '';
  const r = G.run, ro = rogue(), v: Record<string, any> = {};
  for (const e of c.effects) {
    switch (e.kind) {
      case 'materials': v.materials = Math.round(scaled(e.base, e.perWave)); r.materials += v.materials; break;
      case 'souls': v.souls = Math.round(scaled(e.base, e.perWave) * bountyMult(r.wave)); r.souls += v.souls; r.soulsEarned += v.souls; break;
      case 'tithe': { const ps = +scaled(e.base, e.perWave).toFixed(1); ro.tithes.push({ ps, waves: e.waves }); v.tithe = ps; v.waves = e.waves; break; }
      case 'raise': {
        const n = rndi(Math.round(e.min + (e.perWave || 0) * r.wave), Math.round(e.max + (e.perWave || 0) * r.wave));
        v.raised = raiseRandom(n, r.unlockedUnits.length ? r.unlockedUnits : ['skeleton']); break;
      }
      case 'spirits': {
        const n = rndi(Math.round(e.min + (e.perWave || 0) * r.wave), Math.round(e.max + (e.perWave || 0) * r.wave));
        v.raised = raiseRandom(n, ['wraith', 'banshee']); break;
      }
      case 'level': r.pendingLevels += e.n; break;
      case 'curse': ro.curses.push({ count: e.count || 1, hp: e.hp || 1, waves: e.waves }); v.waves = e.waves; break;
      case 'buff': ro.buffs.push({ dmg: e.dmg, waves: e.waves }); v.waves = e.waves; recalcAllStats(); break;
      case 'ascDmg': r.asc.dmg += e.n; recalcAllStats(); break;
      case 'ascHp': r.asc.hp += e.n; recalcAllStats(); break;
      case 'keepHurt': G.keep.hp = Math.max(1, G.keep.hp - G.keep.maxHp * e.frac); break;
      case 'loseSouls': r.souls = Math.floor(r.souls * (1 - e.frac)); break;
      case 'spellCd': r.m.spellCd *= e.mult; break;
      case 'unlock': {
        const t = randomUnitType(true);
        if (t) { r.unlockedUnits.push(t); const made = spawnSquad(t, KEEP.x1 + 40, KEEP.y + rnd(-40, 40)); v.unlocked = `The apprentices open a new crypt: ${made.length}× ${UNITS[t].tiers[0].name} rise, and more can now be recruited.`; }
        else { const t2: string = pick(r.unlockedUnits.length ? r.unlockedUnits : ['skeleton']); const made = spawnSquad(t2, KEEP.x1 + 40, KEEP.y); v.unlocked = `Every crypt already answers to you; the apprentices raise ${made.length}× ${UNITS[t2].tiers[0].name} instead.`; }
        break;
      }
    }
  }
  recalcKeep();
  ro.event = null;
  sfx('well');
  const text = c.result.replace(/\{(\w+)\}/g, (_m, k) => (v[k] ?? '') + '');
  msg(`${ev.title}: ${c.label}.`, PAL.necro);
  return text;
}

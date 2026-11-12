// Roguelite layer (v0.8): the crusade chosen for each wave, story events between waves, and the
// lasting effects they leave (soul tithes, curses on the crusade, temporary war buffs).
// Pure simulation: no Phaser, no DOM.
import { G } from '../core/state';
import { rnd, rndi, pick } from '../core/util';
import { KEEP, PAL } from '../config/constants';
import { CRUSADE_TIERS, EVENTS, EVENT_EVERY, EXTRA_EVENT_CHANCE, EventDef, EventChoice, EventEffect } from '../data/events';
import { TOWERS } from '../data/towers';
import { UNITS } from '../data/units';
import { msg, sfx } from '../core/events';
import { spawnUnit, spawnSummon, killEntity } from './combat';
import { recalcAllStats, recalcKeep, bountyMult, soulMult, waveTech, fortMaxHp, towerMaxHp } from './stats';
import { gainXp } from './progression';
import { spawnSquad, musterMore } from './campaign';
import { anPick } from './analytics';

/** Roguelite state on the run (older saves lack it). */
export function rogue(r: any = G.run) {
  if (!r.rogue) r.rogue = { tithes: [], curses: [], buffs: [], seen: [], event: null, lastTier: 1 };
  if (!r.rogue.flags) r.rogue.flags = Object.assign({}, G.meta && G.meta.flags); // story chains span sieges
  return r.rogue;
}

// ---------------- crusade tiers ----------------
/** Multipliers for a crusade tier, including active curses on the crusade. */
export function tierMods(tier: number) {
  const t = CRUSADE_TIERS[tier] || CRUSADE_TIERS[1];
  let count = t.count, hp = t.hp, reward = t.reward;
  for (const c of rogue().curses) { count *= c.count || 1; hp *= c.hp || 1; reward *= c.reward || 1; }
  return { tier: t, count, hp, reward };
}
/** Multipliers for the wave being fought (or about to start). */
export function waveMods() { return tierMods((G.wave && G.wave.tier) ?? rogue().lastTier); }

/** Souls per second from active tithes (added to the haul during waves). */
export function titheRate() { let s = 0; for (const t of rogue().tithes) s += t.ps; return s * bountyMult(Math.max(1, G.run.wave)) * soulMult(); }
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
  if (ro.event || r.wave <= 0) return;
  // a story event every EVENT_EVERY waves, and sometimes an extra one in between
  if (r.wave % EVENT_EVERY === 0 || (r.wave >= 2 && Math.random() < EXTRA_EVENT_CHANCE)) ro.event = pickEvent();
}
/** Events that may be drawn now: wave window, story flags (chains) and not seen this campaign
 *  (once every event has been seen, the least recently seen half becomes available again). */
export function eventPool(): EventDef[] {
  const r = G.run, ro = rogue();
  const tech = waveTech(r.wave);
  const ok = (e: EventDef) => (!e.minWave || e.minWave <= tech) && (!e.maxWave || tech <= e.maxWave)
    && (!e.requires || ro.flags[e.requires]) && (!e.excludes || !ro.flags[e.excludes]);
  const pool = EVENTS.filter(ok);
  const fresh = pool.filter(e => !ro.seen.includes(e.id));
  if (fresh.length) return fresh;
  const old = ro.seen.slice(0, Math.ceil(ro.seen.length / 2));
  return pool.filter(e => old.includes(e.id) && !e.requires);
}
function pickEvent(): string | null {
  const ro = rogue(), pool = eventPool();
  if (!pool.length) return null;
  let tot = 0; for (const e of pool) tot += e.weight || 1;
  let x = Math.random() * tot, ev = pool[0];
  for (const e of pool) { x -= e.weight || 1; if (x <= 0) { ev = e; break; } }
  ro.seen = ro.seen.filter((id: string) => id !== ev.id); ro.seen.push(ev.id);
  return ev.id;
}
export function pendingEvent(): EventDef | null { const id = G.run && rogue().event; return id ? EVENTS.find(e => e.id === id) || null : null; }

// ---------------- event effects ----------------
const scaled = (base: number, perWave: number) => base + (perWave || 0) * waveTech(G.run.wave);
/** Hordes raised by events keep pace with the host the web fields (never fewer than the event's own number). */
const hordeScale = () => Math.max(1, G.units.filter((u: any) => !u.temp && !u.summon).length / 40);
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
const unitName = (t: string) => UNITS[t].tiers[G.run.unitTier[t] || 0].name;
/** Up-front cost of a choice: souls out of the haul gathered this siege. */
export function choiceCost(c: EventChoice) {
  let souls = 0;
  for (const e of c.effects) if (e.kind === 'paySouls') souls += Math.round(scaled(e.base, e.perWave) * bountyMult(G.run.wave));
  return { souls };
}
export function canChoose(c: EventChoice) { return G.run.souls >= choiceCost(c).souls; }
/** Kills a fraction of the (non-summoned) host, optionally of one type. Between waves the dead stay dead. */
function sacrifice(frac: number, type?: string): string {
  const pool = G.units.filter((u: any) => !u.summon && !u.temp && (!type || u.type === type));
  const n = type && frac >= 1 ? pool.length : Math.max(pool.length ? 1 : 0, Math.round(pool.length * frac));
  const counts: Record<string, number> = {};
  for (let i = 0; i < n && pool.length; i++) {
    const u = pool.splice(rndi(0, pool.length - 1), 1)[0];
    counts[u.type] = (counts[u.type] || 0) + 1; killEntity(u, null);
  }
  if (!n) return 'No undead are lost';
  return `${n} undead lost (` + Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([t, c]) => `${c}× ${unitName(t)}`).join(', ') + ')';
}
/** Free tier-up, for this siege, of a random type in the host that can still evolve. */
function freeEvolve(): string {
  const r = G.run;
  const can = r.unlockedUnits.filter((t: string) => { const k = r.unitTier[t] || 0; return UNITS[t].tiers[k + 1]; });
  if (!can.length) { gainXp(20 + waveTech(r.wave) * 3); return 'None of your undead can evolve further; you gain insight instead.'; }
  const t: string = pick(can), from = unitName(t);
  r.unitTier[t] = (r.unitTier[t] || 0) + 1; recalcAllStats();
  return `Your ${from}s evolve into ${unitName(t)}s.`;
}
function applyEffects(effects: EventEffect[], v: Record<string, any>) {
  const r = G.run, ro = rogue();
  for (const e of effects) {
    switch (e.kind) {
      case 'fortify': { // plunder hauled back to the keep: sturdier keep, walls, traps and towers for this siege
        const add = Math.round(scaled(e.base, e.perWave) * 3) / 100;
        r.m.keep += add; r.m.wallHp += add; r.m.towerHp += add; recalcKeep();
        G.forts.forEach((f: any) => { if (f.def.hp) { const nm = fortMaxHp(f); f.hp += nm - f.maxHp; f.maxHp = nm; } });
        G.towers.forEach((t: any) => { const nm = towerMaxHp(t); t.hp += nm - t.maxHp; t.maxHp = nm; });
        v.fortify = `+${Math.round(add * 100)}% durability for the keep and its defences`; break;
      }
      case 'muster': v.mustered = musterMore(e.frac); break;
      case 'souls': v.souls = Math.round(scaled(e.base, e.perWave) * bountyMult(r.wave) * soulMult()); r.souls += v.souls; r.soulsEarned += v.souls; break;
      case 'tithe': { const ps = +scaled(e.base, e.perWave).toFixed(1); ro.tithes.push({ ps, waves: e.waves }); v.tithe = +(ps * bountyMult(Math.max(1, r.wave)) * soulMult()).toFixed(1); v.waves = e.waves; break; }
      case 'raise': {
        const n = Math.round(rndi(Math.round(e.min + (e.perWave || 0) * waveTech(r.wave)), Math.round(e.max + (e.perWave || 0) * waveTech(r.wave))) * hordeScale());
        v.raised = raiseRandom(n, r.unlockedUnits.length ? r.unlockedUnits : ['skeleton']); break;
      }
      case 'spirits': {
        const n = Math.round(rndi(Math.round(e.min + (e.perWave || 0) * waveTech(r.wave)), Math.round(e.max + (e.perWave || 0) * waveTech(r.wave))) * hordeScale());
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
      case 'paySouls': r.souls = Math.max(0, r.souls - Math.round(scaled(e.base, e.perWave) * bountyMult(r.wave))); break;
      case 'xp': gainXp(Math.round(scaled(e.base, e.perWave))); break;
      case 'mod': r.m[e.key] = (r.m[e.key] || 0) + e.add; recalcAllStats(); break;
      case 'towerDmg': for (const k in TOWERS) r.towerDmg[k] = (r.towerDmg[k] || 0) + e.add; break;
      case 'unitBuff': {
        const t: string = pick(r.unlockedUnits.length ? r.unlockedUnits : ['skeleton']);
        r.unitBuff[t] = (r.unitBuff[t] || 0) + e.add; recalcAllStats();
        v.buffed = `${unitName(t)}s gain +${Math.round(e.add * 100)}% health and damage`; break;
      }
      case 'squad': {
        const parts: string[] = [];
        for (let i = 0; i < (e.n || 1); i++) {
          const t: string = e.type || pick(r.unlockedUnits.length ? r.unlockedUnits : ['skeleton']);
          if (!r.unlockedUnits.includes(t)) r.unlockedUnits.push(t); // an event may lend a type the web has not unlocked, for this siege
          const made = spawnSquad(t, KEEP.x1 + 40, KEEP.y + rnd(-40, 40)); parts.push(`${made.length}× ${unitName(t)}`);
        }
        v.squad = parts.join(', ') + ' rise'; break;
      }
      case 'summon': spawnSummon(e.key); break; // they fight until they fall
      case 'evolve': v.evolved = freeEvolve(); break;
      case 'mirror': {
        const by: Record<string, number> = {};
        for (const u of G.units) if (!u.summon && !u.temp) by[u.type] = (by[u.type] || 0) + 1;
        const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
        if (!top) { v.mirrored = 'The mirror shows nothing at all.'; break; }
        const n = Math.min(top[1], 60);
        for (let i = 0; i < n; i++) { const a = rnd(0, Math.PI * 2), rr = rnd(10, 50); spawnUnit(top[0], KEEP.x1 + 40 + Math.cos(a) * rr, KEEP.y + Math.sin(a) * rr * 0.8); }
        v.mirrored = `Your reflection steps out of the glass: ${n}× ${unitName(top[0])} join the host.`; break;
      }
      case 'heal': G.keep.hp = Math.min(G.keep.maxHp, G.keep.hp + G.keep.maxHp * e.frac); break;
      case 'sacrifice': v.sacrificed = sacrifice(e.frac, e.type); break;
      case 'rerolls': r.rerolls = (r.rerolls || 0) + e.n; break;
      case 'bossHp': ro.bossHp = (ro.bossHp || 1) * e.mult; break;
      case 'flag': ro.flags[e.name] = true; break;
      case 'gamble': {
        const win = Math.random() < e.chance;
        applyEffects(win ? e.win : e.lose, v);
        v.gamble = (win ? e.winText : e.loseText).replace(/\{(\w+)\}/g, (_m: string, k: string) => (v[k] ?? '') + '');
        break;
      }
    }
  }
}
/** Applies one choice of the pending event; returns the result text. */
export function resolveEvent(choice: number): string {
  const ev = pendingEvent(); if (!ev) return '';
  const c = ev.choices[choice]; if (!c || !canChoose(c)) return '';
  anPick('event', ev.id, { choice });
  const ro = rogue(), v: Record<string, any> = {};
  applyEffects(c.effects, v);
  recalcKeep();
  ro.event = null;
  if (ev.requires) { delete ro.flags[ev.requires]; if (G.meta.flags) delete G.meta.flags[ev.requires]; } // the chain is told; it may begin again in a later siege
  sfx('well');
  const text = c.result.replace(/\{(\w+)\}/g, (_m, k) => (v[k] ?? '') + '').trim();
  msg(`${ev.title}: ${c.label}.`, PAL.necro);
  return text;
}

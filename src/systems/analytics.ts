// Run analytics (v0.9): every campaign the player plays is recorded wave by wave — economy, the host's
// composition, damage / kills / losses per source, the crusade fought, and every decision (cards,
// events, purchases, spells) — and kept in localStorage (last MAX_RUNS runs). Exported as JSON from
// the menu for balance work (`tools/analytics/report.py` summarises an export). Pure data: no DOM.
import { G } from '../core/state';
import { store } from './save';
import { metaLv } from './stats';

export const AN_KEY = 'lichdom_analytics_v1';
const MAX_RUNS = 20;
export const AN_VERSION = '0.9';

interface AnStore { v: number; runs: any[]; }
function load(): AnStore {
  try { const d = JSON.parse(store.get(AN_KEY) || ''); if (d && Array.isArray(d.runs)) return d; } catch { /* fresh */ }
  return { v: 1, runs: [] };
}
function save(d: AnStore) {
  while (d.runs.length > MAX_RUNS) d.runs.shift();
  // localStorage is shared with the saves: if the record does not fit, drop the oldest runs
  while (!store.set(AN_KEY, JSON.stringify(d)) && d.runs.length > 1) d.runs.shift();
}
/** The analytics record of the current run (lives on the run so it survives save/reload). */
function rec() { return G.run && G.run.an; }
const rnd1 = (n: number) => Math.round(n * 10) / 10;

/** A new campaign: snapshot the meta progression it starts with. */
export function anStart() {
  const r = G.run; if (!r) return;
  const meta: Record<string, number> = {};
  for (const k in (G.meta && G.meta.lv) || {}) if (G.meta.lv[k]) meta[k] = G.meta.lv[k];
  r.an = {
    id: Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), version: AN_VERSION,
    started: new Date().toISOString(), keep: r.keep, fortress: r.fortress, seed: r.seed, meta, purse: G.meta ? { souls: G.meta.souls, essence: G.meta.essence, divinity: G.meta.divinity } : null,
    roster: [...r.unlockedUnits], spells: [...r.spells], waves: [] as any[], picks: [] as any[], end: null as any,
  };
  persist();
}
/** A saved campaign was resumed: reattach its record (or start one for runs saved before v0.9). */
export function anResume() {
  const r = G.run; if (!r) return;
  const id = r.anId; delete r.anId;
  const found = id && load().runs.find((x: any) => x.id === id);
  if (!found) { anStart(); if (r.an) r.an.partialFrom = r.wave; persist(); return; }
  r.an = found;
  // a run saved mid-wave restarts that wave: drop the decisions logged during the aborted attempt
  r.an.picks = r.an.picks.filter((p: any) => p.w <= r.wave);
  r.an.picks.push({ w: r.wave, k: 'resume', id: 'load', ph: 'p' });
}
/** A decision: kind = card | event | crusade | recruit | unearth | tower | towerUp | building | buildingUp | wall | well | spell. */
export function anPick(kind: string, id: string, extra: any = {}) {
  const a = rec(); if (!a) return;
  const r = G.run;
  // recruits and spells are frequent: tallied per wave instead of logged one by one
  if (kind === 'recruit' || kind === 'spell') {
    const w = a.cur || (a.cur = { recruits: {}, spells: {}, spent: {} });
    const t = kind === 'recruit' ? w.recruits : w.spells; t[id] = (t[id] || 0) + 1;
    if (kind === 'recruit' && extra.cost) { const sp = w.spent || (w.spent = {}); sp[id] = (sp[id] || 0) + extra.cost; }
    return;
  }
  a.picks.push(Object.assign({ w: r.wave, k: kind, id, ph: G.phase === 'wave' ? 'w' : 'p' }, extra));
}
export function anWaveStart() {
  const a = rec(); if (!a || !G.wave) return;
  const roster: Record<string, number> = {};
  for (const s of G.wave.spawns) if (s.type) roster[s.type] = (roster[s.type] || 0) + 1;
  a.cur = Object.assign(a.cur || { recruits: {}, spells: {}, spent: {} }, { t0: G.time, roster, boss: G.wave.boss ? G.wave.boss.id || G.wave.boss.name : null });
}
/** Wave repelled: the full record of it (built from the end-of-wave summary). */
export function anWaveEnd(S: any) {
  const a = rec(); if (!a || !S) return;
  const r = G.run, cur = a.cur || {};
  const host: Record<string, number> = {}, summons: Record<string, number> = {};
  for (const u of G.units) { const t = u.summon ? summons : host; t[u.type] = (t[u.type] || 0) + 1; }
  const tiers: Record<string, number> = {};
  for (const k of r.unlockedUnits) tiers[k] = r.unitTier[k] || 0;
  const towers: string[] = G.towers.map((t: any) => `${t.type}:${t.tier}`);
  const buildings: Record<string, number> = {};
  for (const b of G.buildings) buildings[b.type] = b.tier + 1;
  const walls: Record<string, number> = {};
  for (const k in r.walls || {}) if (r.walls[k]) walls[k] = r.walls[k];
  const fallen: Record<string, number> = {};
  for (const k in S.fallen) { const f = S.fallen[k]; fallen[f.type] = (fallen[f.type] || 0) + f.n; }
  a.waves.push({
    n: S.n, tier: S.tier, theme: S.theme, boss: S.boss || null, dur: rnd1(G.time - (cur.t0 ?? G.time)),
    souls: S.souls, bonus: S.bonus, essence: S.essence, kills: S.kills, keepLost: S.keepLost, keepHp: Math.round(G.keep.hp), keepMax: Math.round(G.keep.maxHp),
    bank: { souls: Math.round(r.souls), essence: Math.round(r.essence * 10) / 10 }, level: r.level, fervor: rnd1((r.fervor || 1) * 100) / 100,
    host, summons, tiers, towers, buildings, walls, fallen, revived: S.revived,
    src: S.src.map((s: any) => [s.key, Math.round(s.dmg), s.n, s.kills]), // [source, damage, kills, kills by enemy type]
    roster: cur.roster || {}, recruits: cur.recruits || {}, spent: cur.spent || {}, spells: cur.spells || {},
    rogue: r.rogue ? { tithes: r.rogue.tithes.length, curses: r.rogue.curses.length, buffs: r.rogue.buffs.length } : null,
    asc: Object.assign({}, r.asc),
  });
  a.cur = { recruits: {}, spells: {}, spent: {} };
  persist();
}
/** The campaign ended (the keep fell or the player abandoned it). */
export function anEnd(outcome: string, essence: number) {
  const a = rec(); if (!a || a.end) return;
  const r = G.run;
  a.end = { outcome, wave: r.wave, level: r.level, kills: r.kills, soulsEarned: r.soulsEarned, essence, at: new Date().toISOString(),
    lastWave: G.wave && G.phase !== 'prep' ? { n: G.wave.n, tier: G.wave.tier, spawned: G.wave.idx, total: G.wave.total, left: G.enemies.length, src: (G.wave.report ? Object.values(G.wave.report.src) : []).map((s: any) => [s.key, Math.round(s.dmg), s.n]) } : null };
  persist();
}
/** Upserts the current run into the store. */
export function persist() {
  const a = rec(); if (!a) return;
  const d = load();
  const i = d.runs.findIndex((x: any) => x.id === a.id);
  const copy = Object.assign({}, a); delete copy.cur;
  if (i >= 0) d.runs[i] = copy; else d.runs.push(copy);
  save(d);
}
/** Everything recorded, for export. */
export function anExport() {
  const d = load();
  return { exported: new Date().toISOString(), game: 'LICH — Eternal Dominion', version: AN_VERSION, runs: d.runs };
}
export function anCount() { return load().runs.length; }
export function anClear() { store.del(AN_KEY); }
export { metaLv };

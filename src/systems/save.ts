// Persistence: meta progression + the current campaign, in localStorage.
// A campaign saved mid-wave resumes at that wave's preparation phase.
import { G } from '../core/state';

export const SAVE_META = 'lichdom_meta_v3', SAVE_RUN = 'lichdom_run_v7';
export const store = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

export function defaultMods() {
  return { dmg: 0, towerAs: 0, range: 0, unitHp: 0, unitDmg: 0, unitAs: 0, unitSpd: 0, crit: 0.05, critMult: 2, souls: 0, xp: 0, squad: 0, keep: 0, wallHp: 0, towerHp: 0, spellCd: 1, spellDmg: 0, lichDmg: 0, lichAs: 0, lichBolts: 1 };
}
/** v0.12: three currencies, the web's node levels, keeps conquered (0..6), story-chain flags that span sieges,
 *  and the defences last placed at each keep (raised again automatically next time). */
export function defaultMeta() { return { souls: 0, essence: 0, divinity: 0, totalSouls: 0, totalEssence: 0, totalDivinity: 0, lv: { core: 1 } as Record<string, number>, keepsCleared: 0, lastKeep: 0, flags: {} as Record<string, any>, layout: {} as Record<string, any>, best: {} as Record<string, number> }; }
export function defaultStats() { return { totalKills: 0, bestWave: 0, keeps: 0, victories: 0, bosses: {}, maxArmy: 0, maxTowers: 0, evolved: false, legendary: false, castApoc: false, runs: 0, flawless: false, seenHelp: false, ach: {}, codex: { enemy: {}, tower: {}, unit: {}, spell: {} } }; }
export function defaultSettings() { return { sfx: 0.6, music: 0.4, shake: true, dmgNumbers: true, fx: 'high', autoWave: false, zoom: 0, waveReport: true }; }

let metaT: any = null;
export function saveMetaSoon() { clearTimeout(metaT); metaT = setTimeout(saveMeta, 800); }
export function saveMeta() { store.set(SAVE_META, JSON.stringify({ v: 3, ts: Date.now(), meta: G.meta, stats: G.stats, settings: G.settings })); }
export function loadMeta() {
  let d: any = null;
  try { d = JSON.parse(store.get(SAVE_META) || 'null'); } catch { /* corrupt */ }
  G.meta = Object.assign(defaultMeta(), d && d.meta);
  G.meta.lv.core = 1;
  G.stats = Object.assign(defaultStats(), d && d.stats);
  G.stats.codex = Object.assign(defaultStats().codex, G.stats.codex);
  G.settings = Object.assign(defaultSettings(), d && d.settings);
}

export function serializeRun() {
  if (!G.run || G.phase === 'over' || G.phase === 'menu') return null;
  const r = Object.assign({}, G.run);
  if (G.phase === 'wave') r.wave = Math.max(0, r.wave - 1);
  // the analytics record lives in its own store (systems/analytics.ts); the run save only points at it
  if (r.an) { r.anId = r.an.id; delete r.an; }
  return {
    v: 2, ts: Date.now(), run: r, keepHp: G.keep.hp,
    towers: G.towers.map((t: any) => ({ type: t.type, tier: t.tier, cx: t.cx, cy: t.cy, hp: Math.round(t.hp), mode: t.mode, kills: t.kills, plot: t.plot })),
    forts: G.forts.map((f: any) => ({ type: f.type, cx: f.cx, cy: f.cy, hp: Math.round(f.hp), site: f.site || undefined, wt: f.wtier || undefined })),
    units: G.units.filter((u: any) => !u.temp && !u.summon).map((u: any) => ({ type: u.type, x: Math.round(u.x), y: Math.round(u.y), free: !!u.free, spr: u.fixedSpr ? u.spr : null, mult: u.raisedMult || 1 })),
  };
}
let runT: any = null;
export function saveRunSoon() { clearTimeout(runT); runT = setTimeout(saveRun, 700); }
export function saveRun() { const s = serializeRun(); if (s) store.set(SAVE_RUN, JSON.stringify(s)); }
export function clearRunSave() { store.del(SAVE_RUN); }
export function hasRunSave() { return !!store.get(SAVE_RUN); }
export function readRunSave(): any { try { return JSON.parse(store.get(SAVE_RUN) || 'null'); } catch { return null; } }

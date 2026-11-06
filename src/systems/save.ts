// Persistence: meta progression + the current campaign, in localStorage.
// A campaign saved mid-wave resumes at that wave's preparation phase.
import { G } from '../core/state';

export const SAVE_META = 'lichdom_meta_v2', SAVE_RUN = 'lichdom_run_v3';
export const store = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

export function defaultMods() {
  return { dmg: 0, towerAs: 0, range: 0, unitHp: 0, unitDmg: 0, unitAs: 0, unitSpd: 0, crit: 0.05, critMult: 2, souls: 0, xp: 0, squad: 0, keep: 0, wallHp: 0, towerHp: 0, spellCd: 1, spellDmg: 0, lichDmg: 0, lichAs: 0, lichBolts: 1 };
}
export function defaultMeta() { return { essence: 0, totalEssence: 0, lv: {} as Record<string, number> }; }
export function defaultStats() { return { totalKills: 0, bestWave: 0, bosses: {}, maxArmy: 0, maxTowers: 0, evolved: false, legendary: false, castApoc: false, runs: 0, flawless: false, seenHelp: false, ach: {}, codex: { enemy: {}, tower: {}, unit: {}, spell: {} } }; }
export function defaultSettings() { return { sfx: 0.6, music: 0.4, shake: true, dmgNumbers: true, fx: 'high', autoWave: false, zoom: 0 }; }

let metaT: any = null;
export function saveMetaSoon() { clearTimeout(metaT); metaT = setTimeout(saveMeta, 800); }
export function saveMeta() { store.set(SAVE_META, JSON.stringify({ v: 2, ts: Date.now(), meta: G.meta, stats: G.stats, settings: G.settings })); }
export function loadMeta() {
  let d: any = null;
  try { d = JSON.parse(store.get(SAVE_META) || 'null'); } catch { /* corrupt */ }
  G.meta = Object.assign(defaultMeta(), d && d.meta);
  G.stats = Object.assign(defaultStats(), d && d.stats);
  G.stats.codex = Object.assign(defaultStats().codex, G.stats.codex);
  G.settings = Object.assign(defaultSettings(), d && d.settings);
}

export function serializeRun() {
  if (!G.run || G.phase === 'over' || G.phase === 'menu') return null;
  const r = Object.assign({}, G.run);
  if (G.phase === 'wave') r.wave = Math.max(0, r.wave - 1);
  return {
    v: 2, ts: Date.now(), run: r, keepHp: G.keep.hp,
    towers: G.towers.map((t: any) => ({ type: t.type, tier: t.tier, cx: t.cx, cy: t.cy, hp: Math.round(t.hp), mode: t.mode, kills: t.kills, invested: t.invested })),
    forts: G.forts.map((f: any) => ({ type: f.type, cx: f.cx, cy: f.cy, hp: Math.round(f.hp), site: f.site || undefined, wt: f.wtier || undefined })),
    units: G.units.filter((u: any) => !u.temp).map((u: any) => ({ type: u.type, x: Math.round(u.x), y: Math.round(u.y), summon: !!u.summon, free: !!u.free, spr: u.fixedSpr ? u.spr : null, value: u.summonValue || 0, mult: u.raisedMult || 1 })),
  };
}
let runT: any = null;
export function saveRunSoon() { clearTimeout(runT); runT = setTimeout(saveRun, 700); }
export function saveRun() { const s = serializeRun(); if (s) store.set(SAVE_RUN, JSON.stringify(s)); }
export function clearRunSave() { store.del(SAVE_RUN); }
export function hasRunSave() { return !!store.get(SAVE_RUN); }
export function readRunSave(): any { try { return JSON.parse(store.get(SAVE_RUN) || 'null'); } catch { return null; } }

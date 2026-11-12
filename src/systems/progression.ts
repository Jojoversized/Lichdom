// Experience, codex, achievements, bosses slain, defeat and Life Essence.
import { G } from '../core/state';
import { rnd, pick } from '../core/util';
import { KEEP, PAL } from '../config/constants';
import { ACHIEVEMENTS, META, META_BY_ID, metaCost, WebNode } from '../data/meta';
import { KEEPS, WAVES_PER_KEEP } from '../data/world';
import { hooks, msg, lichSay, sfx } from '../core/events';
import { metaLv } from './stats';
import { aoeDamage, NEUTRAL_SRC } from './combat';
import { explosion, addSoulParticle } from './fx';
import { saveMeta, saveMetaSoon, clearRunSave } from './save';
import { anEnd } from './analytics';

/** v0.12: about a dozen level-ups in a full 10-wave siege (Ancient Wisdom on the web adds more). */
export function xpForLevel(l: number) { return Math.round(30 * Math.pow(1.3, l - 1) + l * 10); }
export function gainXp(x: number) {
  const r = G.run;
  r.xp += x;
  while (r.xp >= r.xpNext) { r.xp -= r.xpNext; r.level++; r.xpNext = xpForLevel(r.level); r.pendingLevels++; }
}
export function codexSee(kind: string, id: string) { if (G.stats && !G.stats.codex[kind][id]) { G.stats.codex[kind][id] = true; saveMetaSoon(); } }

export function bossKilled(e: any) {
  const r = G.run;
  r.bossesKilled.push(e.def.id);
  G.stats.bosses[e.def.id] = true;
  G.bossBar = null;
  msg(`${e.name} has been destroyed!`, PAL.gold);
  lichSay('bossDead');
  G.shake = 10; G.flash = 0.4;
  explosion(e.x, e.y, 80, PAL.holy, true);
  for (let i = 0; i < 30; i++) addSoulParticle(e.x + rnd(-20, 20), e.y - rnd(0, 30), 10);
  checkAchievements();
}

export function keepFallen() {
  const r = G.run;
  if (G.phase === 'over') return;
  if (metaLv('i_phyl') && !r.phylUsed) {
    r.phylUsed = true;
    G.keep.hp = G.keep.maxHp * 0.4; G.keep.ward = 4;
    msg('The Second Phylactery flares — your keep reforms!', PAL.necro);
    aoeDamage(KEEP.x1, KEEP.y, 200, 1e15, 'necro', NEUTRAL_SRC);
    explosion(KEEP.x1, KEEP.y, 180, PAL.necro, true); G.shake = 12; G.flash = 0.5; sfx('apocalypse');
    return;
  }
  G.keep.hp = 0;
  endCampaign('defeat');
}

/** What this siege has earned so far. Everything is kept, win or lose: it is carried to the Phylactery
 *  when the siege ends (defeat, retreat or conquest). */
export function haul() {
  const r = G.run;
  return { souls: Math.round(r.souls), essence: Math.round(r.essence), divinity: r.divinity || 0, wave: r.wave, kills: r.kills, keep: r.keep, name: KEEPS[r.keep].name, outcome: r.anOutcome || 'defeat', first: !!r.firstClear };
}
function bank() {
  const b = haul(), m = G.meta;
  m.souls += b.souls; m.totalSouls += b.souls;
  m.essence += b.essence; m.totalEssence += b.essence;
  m.divinity += b.divinity; m.totalDivinity += b.divinity;
  m.best[KEEPS[b.keep].id] = Math.max(m.best[KEEPS[b.keep].id] || 0, G.phase === 'over' && b.outcome === 'victory' ? WAVES_PER_KEEP : Math.max(0, b.wave - (b.outcome === 'retreat' ? 0 : 1)));
  // story chains span sieges: the flags a siege set are remembered
  Object.assign(m.flags, (G.run.rogue && G.run.rogue.flags) || {});
  return b;
}

/** Ends the siege. outcome: 'defeat' (the keep fell), 'retreat' (abandoned between waves), 'victory' (the boss fell). */
export function endCampaign(outcome: 'defeat' | 'retreat' | 'victory' = 'defeat') {
  if (G.phase === 'over') return null;
  const r = G.run;
  r.anOutcome = outcome;
  if (outcome === 'victory') {
    G.stats.victories++;
    if (G.meta.keepsCleared <= r.keep) { // the first time this keep's boss falls: its divinity is stolen
      G.meta.keepsCleared = r.keep + 1; G.stats.keeps = G.meta.keepsCleared;
      r.divinity = (r.divinity || 0) + 1; r.firstClear = true;
    }
  }
  G.phase = 'over';
  const b = bank();
  anEnd(outcome, b.essence);
  G.stats.runs++;
  G.stats.bestWave = Math.max(G.stats.bestWave, outcome === 'victory' ? WAVES_PER_KEEP : r.wave - (outcome === 'defeat' ? 1 : 0));
  checkAchievements();
  clearRunSave();
  saveMeta();
  if (outcome === 'defeat') {
    lichSay('defeat'); sfx('defeat');
    G.shake = 14; G.flash = 0.8;
    for (let i = 0; i < 6; i++) G.timers.push({ t: i * 0.2, fn: () => explosion(KEEP.x + rnd(-50, 50), KEEP.y + rnd(-40, 40), 50, pick([PAL.fire, PAL.holy]), true) });
    setTimeout(() => hooks.defeat(b), 2200);
  } else if (outcome === 'victory') {
    lichSay('victory'); sfx('levelup'); G.flash = 0.5;
    setTimeout(() => hooks.defeat(b), 1800);
  } else hooks.defeat(b);
  return b;
}

export function checkAchievements() {
  for (const a of ACHIEVEMENTS) {
    if (G.stats.ach[a.id] || !a.test(G.stats)) continue;
    G.stats.ach[a.id] = true;
    G.meta.essence += a.ess; G.meta.totalEssence += a.ess;
    hooks.achievement(a);
    saveMetaSoon();
  }
}

// ---------------- the Phylactery web ----------------
/** A node shows on the web once its parent is owned. */
export function nodeVisible(m: WebNode) { return !m.parent || metaLv(m.parent) > 0; }
/** …and can be bought once the parent has reached the node's threshold. */
export function nodeOpen(m: WebNode) { return !m.parent || metaLv(m.parent) >= (m.need || 1); }
export function canBuyMeta(id: string) {
  const m = META_BY_ID[id], lv = metaLv(id);
  return !!m && lv < m.max && nodeOpen(m) && (G.meta as any)[m.cur] >= metaCost(m, lv);
}
export function buyMeta(id: string) {
  if (!canBuyMeta(id)) return false;
  const m = META_BY_ID[id], lv = metaLv(id);
  (G.meta as any)[m.cur] -= metaCost(m, lv);
  G.meta.lv[id] = lv + 1;
  saveMetaSoon(); sfx('well');
  return true;
}
/** Everything spent on the web so far, per currency (costs are deterministic, so a refund is exact). */
export function webSpent() {
  const out: Record<string, number> = { souls: 0, essence: 0, divinity: 0 };
  for (const m of META) { const lv = metaLv(m.id); for (let l = 0; l < lv; l++) out[m.cur] += metaCost(m, l); }
  return out;
}
/** Free respec: every node is unlearned and everything spent is returned to the purse. */
export function resetWeb() {
  const back = webSpent();
  for (const c in back) (G.meta as any)[c] += back[c];
  G.meta.lv = { core: 1 };
  saveMeta(); sfx('well');
  return back;
}
/** Buys as many levels as the purse allows (shift-click); returns the number bought. */
export function buyMetaMax(id: string, cap = 999) { let n = 0; while (n < cap && buyMeta(id)) n++; return n; }

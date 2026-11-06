// Experience, codex, achievements, bosses slain, defeat and Life Essence.
import { G } from '../core/state';
import { rnd, pick } from '../core/util';
import { KEEP, PAL } from '../config/constants';
import { BOSSES } from '../data/enemies';
import { ACHIEVEMENTS, META_BY_ID, metaCost } from '../data/meta';
import { hooks, msg, lichSay, sfx } from '../core/events';
import { metaLv } from './stats';
import { aoeDamage, NEUTRAL_SRC } from './combat';
import { explosion, addSoulParticle } from './fx';
import { saveMeta, saveMetaSoon, clearRunSave } from './save';

export function xpForLevel(l: number) { return Math.round(14 * Math.pow(1.17, l - 1) + l * 5); }
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
  const idx = BOSSES.findIndex(b => b.id === e.def.id);
  r.essenceBonus += 30 + idx * 25;
  r.pendingLevels += 2;
  msg(`${e.name} has been destroyed! A champion's soul empowers you (+2 levels).`, PAL.gold);
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
    aoeDamage(KEEP.x1, KEEP.y, 200, 1e9, 'necro', NEUTRAL_SRC);
    explosion(KEEP.x1, KEEP.y, 180, PAL.necro, true); G.shake = 12; G.flash = 0.5; sfx('apocalypse');
    return;
  }
  G.keep.hp = 0;
  endCampaign();
}

export function essenceBreakdown() {
  const r = G.run;
  const kills = Math.round(r.kills * 0.05);
  const waves = Math.round(Math.pow(Math.max(0, r.wave - 1), 1.4) * 1.6);
  const bosses = Math.round(r.essenceBonus);
  const level = Math.round(r.level * 0.8);
  const mult = 1 + metaLv('i_ess') * 0.1;
  return { kills, waves, bosses, level, mult, total: Math.round((kills + waves + bosses + level) * mult) };
}

export function endCampaign() {
  G.phase = 'over';
  const b = essenceBreakdown();
  G.meta.essence += b.total; G.meta.totalEssence += b.total;
  G.stats.runs++;
  G.stats.bestWave = Math.max(G.stats.bestWave, G.run.wave - 1);
  checkAchievements();
  clearRunSave();
  saveMeta();
  lichSay('defeat'); sfx('defeat');
  G.shake = 14; G.flash = 0.8;
  for (let i = 0; i < 6; i++) G.timers.push({ t: i * 0.2, fn: () => explosion(KEEP.x + rnd(-50, 50), KEEP.y + rnd(-40, 40), 50, pick([PAL.fire, PAL.holy]), true) });
  setTimeout(() => hooks.defeat(b), 2200);
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

export function buyMeta(id: string) {
  const m = META_BY_ID[id], lv = metaLv(id);
  if (lv >= m.max) return false;
  if (m.req && m.req.some((q: string) => metaLv(q) < 1)) return false;
  const c = metaCost(m, lv);
  if (G.meta.essence < c) return false;
  G.meta.essence -= c;
  G.meta.lv[id] = lv + 1;
  saveMeta(); sfx('well');
  return true;
}

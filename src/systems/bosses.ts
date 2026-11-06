// Boss abilities and introductions.
import { G } from '../core/state';
import { rnd, pick, dist2 } from '../core/util';
import { CELL, KEEP, PAL } from '../config/constants';
import { lichSay, sfx } from '../core/events';
import { flowStep } from '../world/mapgen';
import { dealDamage, spawnEnemy, fireProjectile, structuresNear } from './combat';
import { addRing, addFlash, explosion } from './fx';

export function announceBoss(e: any) {
  G.bossIntro = { name: e.name, title: e.title || '', t: 0 };
  sfx('bossroar'); G.shake = 6;
  lichSay('boss');
  G.timers.push({ t: 2.5, fn: () => addSpeech(e, e.def.line) });
}
export function addSpeech(e: any, line: string) { G.speech = { e, line, t: 0 }; }

export function bossAbilities(e: any, dt: number) {
  e.abT -= dt;
  if (e.abT > 0) return;
  e.abT = rnd(5, 8);
  const ab = pick(e.def.abilities as string[]);
  const pw = e.dmg;
  switch (ab) {
    case 'purge':
      addRing(e.x, e.y, 4, 110, PAL.holy, 0.6); addFlash(e.x, e.y, 120, PAL.holy, 0.5);
      // capped at ~45% of each target's max health (holy doubles it): punishing, never a wipe
      G.hashU.query(e.x, e.y, 100, (u: any) => { dealDamage(u, Math.min(pw * 1.6, u.maxHp * 0.22), 'holy', e, { aoe: true }); });
      sfx('holy'); addSpeech(e, 'Be purged!');
      break;
    case 'summon': {
      const types = e.def.summon || ['footman'];
      const n = Math.min(6, 2 + Math.floor((e.def.wave || 10) / 10)); // 3 at wave 10 … 6 from wave 40
      for (let i = 0; i < n; i++) { const m = spawnEnemy(pick(types), e.lane); m.x = e.x + rnd(-24, 24); m.y = e.y + rnd(-16, 16); }
      addRing(e.x, e.y, 4, 50, PAL.holy, 0.5); addSpeech(e, 'To me, faithful!');
      break;
    }
    case 'silence':
      for (const t of G.towers) if (dist2(t.x, t.y, e.x, e.y) < 180 * 180) t.silT = 5;
      addRing(e.x, e.y, 4, 180, PAL.arcane, 0.7); sfx('silence'); addSpeech(e, 'Your engines fall silent.');
      break;
    case 'meteor': {
      const tg = G.towers.length ? G.towers : G.units;
      for (let i = 0; i < 5; i++) G.timers.push({ t: i * 0.25, fn: () => { const t: any = tg.length ? pick(tg) : { x: KEEP.x1, y: KEEP.y }; fireProjectile(e, 0, 0, { x: t.x + rnd(-10, 10), y: t.y }, 'meteor', pw * 1.5, 'fire', { splash: 34 }); } });
      addSpeech(e, 'Burn, necromancer!');
      break;
    }
    case 'blink': {
      let x = e.x, y = e.y;
      for (let i = 0; i < 6; i++) { const [nx, ny] = flowStep(G.map, x, y, true); x = nx * CELL + 8; y = ny * CELL + 8; }
      addRing(e.x, e.y, 20, 2, PAL.arcane, 0.4); e.x = x; e.y = y; addRing(x, y, 2, 24, PAL.arcane, 0.4);
      break;
    }
    case 'leap': {
      const tgt: any = G.hashU.nearest(e.x, e.y, 200) || G.towers.find((t: any) => dist2(t.x, t.y, e.x, e.y) < 200 * 200);
      if (tgt) {
        e.x = tgt.x + rnd(-6, 6); e.y = tgt.y + 6;
        G.hashU.query(e.x, e.y, 50, (u: any) => { dealDamage(u, pw * 0.8, 'phys', e, { aoe: true }); });
        structuresNear(e.x, e.y, 40).forEach(s => dealDamage(s, pw, 'siege', e));
        explosion(e.x, e.y, 50, '#c0b090', true); G.shake = 7; sfx('slam'); addSpeech(e, 'HAAA!');
      }
      break;
    }
    case 'cleave':
      G.hashU.query(e.x, e.y, 46, (u: any) => { dealDamage(u, pw * 1.5, 'phys', e, { aoe: true }); });
      structuresNear(e.x, e.y, 40).forEach(s => dealDamage(s, pw * 2, 'siege', e));
      addRing(e.x, e.y, 4, 46, '#dddddd', 0.3); sfx('slam');
      break;
    case 'warcry':
      G.hashE.query(e.x, e.y, 180, (o: any) => { o.spd *= 1.25; o.dmg *= 1.2; });
      addRing(e.x, e.y, 4, 180, '#ff6040', 0.6); sfx('horn'); addSpeech(e, 'For the living! CHARGE!');
      break;
    case 'heal':
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.05);
      G.hashE.query(e.x, e.y, 150, (o: any) => { o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.3); });
      addFlash(e.x, e.y, 150, PAL.holy, 0.6); addRing(e.x, e.y, 4, 150, PAL.holy, 0.6); sfx('holy');
      break;
    case 'sunburst':
      addFlash(e.x, e.y, 220, '#fff8d0', 0.7); addRing(e.x, e.y, 4, 140, PAL.holy, 0.7); G.flash = 0.25;
      G.hashU.query(e.x, e.y, 140, (u: any) => { dealDamage(u, Math.min(pw * 2, u.maxHp * 0.25), 'holy', e, { aoe: true }); });
      structuresNear(e.x, e.y, 140).forEach(s => dealDamage(s, pw * 1.5, 'holy', e, { spell: true }));
      sfx('holy'); addSpeech(e, 'Behold the dawn!');
      break;
    case 'siege':
      for (let i = 0; i < 6; i++) G.timers.push({ t: i * 0.3, fn: () => fireProjectile(e, 0, 0, { x: KEEP.x1 - rnd(0, 60), y: KEEP.y1 - rnd(0, 60) }, 'meteor', pw, 'phys', { splash: 30 }) });
      addSpeech(e, 'Bring down those walls!');
      break;
  }
}

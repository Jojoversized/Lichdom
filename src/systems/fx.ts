// Visual-effect data (particles, rings, lightning, flashes, floating text,
// decals). Pure data: src/render draws it. Pooled to avoid GC churn.
import { G } from '../core/state';
import { Pool, rnd, rndi, pick, dist, lerp, TAU } from '../core/util';
import { PAL } from '../config/constants';

const PARTICLES = new Pool<any>(() => ({}), 800);

export function particleLimit() { return G.settings.fx === 'low' ? 300 : G.settings.fx === 'med' ? 800 : 1600; }

export function addParticle(x: number, y: number, vx: number, vy: number, color: string, life: number, type = 'p', size = 1, grav = 0) {
  if (G.particles.length > particleLimit()) return;
  const p = PARTICLES.get();
  p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.color = color; p.life = life; p.max = life; p.type = type; p.size = size; p.grav = grav;
  G.particles.push(p);
}
export function spawnBurst(x: number, y: number, color: string, n: number) { for (let i = 0; i < n; i++) addParticle(x + rnd(-4, 4), y + rnd(-4, 4), rnd(-30, 30), rnd(-40, 0), color, rnd(0.3, 0.7), 'p', 1); }
export function addRing(x: number, y: number, r0: number, r1: number, color: string, life: number, ground = true) { if (G.rings.length < 200) G.rings.push({ x, y, r0, r1, color, life, t: 0, ground }); }
export function addFlash(x: number, y: number, r: number, color: string, life: number) { if (G.flashes.length < 120) G.flashes.push({ x, y, r, color, life, t: 0 }); }
export function addText(x: number, y: number, s: string | number, color: string, big = false) { if (G.texts.length > 70) G.texts.shift(); G.texts.push({ x, y, s: '' + s, color, t: 0, life: big ? 1.0 : 0.75, big }); }
export function addSoulParticle(x: number, y: number, souls: number) {
  const n = Math.min(3, 1 + Math.floor(Math.log10(Math.max(1, souls))));
  for (let i = 0; i < n; i++) if (G.particles.length < particleLimit() + 200) {
    const p = PARTICLES.get();
    Object.assign(p, { x: x + rnd(-4, 4), y: y + rnd(-4, 4), vx: rnd(-40, 40), vy: rnd(-60, -20), color: PAL.necro, life: 3, max: 3, type: 'soul', size: 2, grav: 0 });
    G.particles.push(p);
  }
}
export function explosion(x: number, y: number, r: number, color: string, big = false) {
  addRing(x, y, 2, r, color, 0.35);
  addFlash(x, y, r * 1.6, color, 0.3);
  const n = big ? 30 : 14;
  for (let i = 0; i < n; i++) { const a = rnd(TAU), s = rnd(20, 90); addParticle(x, y - 3, Math.cos(a) * s, Math.sin(a) * s * 0.6 - 20, pick([color, '#fff4d0', color]), rnd(0.25, 0.6), 'p', rndi(1, 2), 60); }
  for (let i = 0; i < n / 3; i++) addParticle(x + rnd(-r / 2, r / 2), y - 4, rnd(-8, 8), rnd(-25, -8), '#3c3834', rnd(0.6, 1.2), 'smoke', 3);
}
export function lightningBolt(x0: number, y0: number, x1: number, y1: number, color: string, life = 0.22, w = 1, jag = 6) {
  if (G.bolts.length > 160) return;
  const pts: number[][] = [[x0, y0]];
  const n = Math.max(2, Math.floor(dist(x0, y0, x1, y1) / 9));
  for (let i = 1; i < n; i++) { const t = i / n; pts.push([lerp(x0, x1, t) + rnd(-jag, jag), lerp(y0, y1, t) + rnd(-jag, jag)]); }
  pts.push([x1, y1]);
  G.bolts.push({ pts, color, life, t: 0, w });
  if (Math.random() < 0.5 && pts.length > 3) { const k = rndi(1, pts.length - 2); const [bx, by] = pts[k]; G.bolts.push({ pts: [[bx, by], [bx + rnd(-14, 14), by + rnd(-14, 14)], [bx + rnd(-22, 22), by + rnd(-22, 22)]], color, life: life * 0.7, t: 0, w: 1 }); }
}
/** Queue a permanent ground mark (blood, scorch, rubble, frost) for the decal layer. */
export function stampDecal(x: number, y: number, kind: string) { if (G.decalQueue.length < 400) G.decalQueue.push({ x, y, kind }); }

export function stepVisual(dt: number, wellX: number, wellY: number) {
  const P = G.particles;
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    p.life -= dt;
    if (p.type === 'soul') {
      const dx = wellX - p.x, dy = wellY - p.y, d = Math.hypot(dx, dy) || 1;
      const t = 1 - p.life / p.max, sp = 60 + t * 600;
      p.vx = lerp(p.vx, dx / d * sp, Math.min(1, dt * 4)); p.vy = lerp(p.vy, dy / d * sp, Math.min(1, dt * 4));
      if (d < 8) p.life = 0;
    } else if (p.type === 'smoke') { p.vx *= 0.97; p.vy *= 0.97; }
    p.vy += p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.life <= 0) { P[i] = P[P.length - 1]; P.pop(); PARTICLES.release(p); }
  }
  for (const arr of [G.rings, G.bolts, G.flashes, G.texts]) for (let i = arr.length - 1; i >= 0; i--) { arr[i].t += dt; if (arr[i].t > arr[i].life) arr.splice(i, 1); }
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 20);
  if (G.flash > 0) G.flash -= dt;
  if (G.bossIntro) { G.bossIntro.t += dt; if (G.bossIntro.t > 4) G.bossIntro = null; }
  if (G.speech) { G.speech.t += dt; if (G.speech.t > 3 || G.speech.e.dead) G.speech = null; }
}

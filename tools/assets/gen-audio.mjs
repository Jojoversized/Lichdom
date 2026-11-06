// Offline sound-effect synthesizer: renders every SFX to assets/audio/sfx/*.wav
// Run: npm run assets   (or: node tools/assets/gen-audio.mjs)
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { saveWAV } from './pixelcanvas.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SR = 22050;
let seed = 12345;
const rand = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff * 2 - 1; };

function buffer(dur) { return new Float32Array(Math.ceil(dur * SR)); }
function env(t, dur, attack) { if (t < attack) return t / attack; return Math.exp(-5 * (t - attack) / Math.max(0.001, dur - attack)); }
// oscillator with exponential pitch slide
function tone(buf, { f, type = 'sine', dur, vol = 0.3, slide = 0, delay = 0, attack = 0.005 }) {
  let ph = 0; const s0 = Math.floor(delay * SR), n = Math.floor(dur * SR);
  for (let i = 0; i < n && s0 + i < buf.length; i++) {
    const t = i / SR, k = t / dur;
    const fr = slide ? f * Math.pow(slide / f, k) : f;
    ph += fr / SR; const p = ph % 1;
    let v = type === 'sine' ? Math.sin(p * Math.PI * 2) : type === 'square' ? (p < 0.5 ? 1 : -1) : type === 'sawtooth' ? p * 2 - 1 : 1 - 4 * Math.abs(p - 0.5);
    buf[s0 + i] += v * vol * env(t, dur, attack);
  }
}
// biquad-filtered noise with sweeping cutoff
function noise(buf, { dur, vol = 0.3, f = 1000, type = 'lowpass', slide = 0, delay = 0, q = 0.9 }) {
  const s0 = Math.floor(delay * SR), n = Math.floor(dur * SR);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, b0, b1, b2, a1, a2;
  for (let i = 0; i < n && s0 + i < buf.length; i++) {
    if (i % 32 === 0) {
      const k = i / n, fc = Math.min(SR * 0.45, slide ? f * Math.pow(slide / f, k) : f);
      const w = 2 * Math.PI * fc / SR, al = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + al;
      if (type === 'lowpass') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
      else if (type === 'highpass') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
      else { b0 = al; b1 = 0; b2 = -al; }
      a1 = -2 * c; a2 = 1 - al; b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
    }
    const x = rand();
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    buf[s0 + i] += y * vol * env(i / SR, dur, 0.004);
  }
}
const S = {
  fireball: b => noise(b, { dur: 0.35, vol: 0.5, f: 1200, type: 'bandpass', slide: 300 }),
  boom: b => { noise(b, { dur: 0.5, vol: 0.9, f: 600, slide: 60 }); tone(b, { f: 80, dur: 0.4, vol: 0.5, slide: 30 }); },
  zap: b => { tone(b, { f: 1400, type: 'sawtooth', dur: 0.12, vol: 0.18, slide: 300 }); noise(b, { dur: 0.12, vol: 0.3, f: 4000, type: 'highpass' }); },
  thunder: b => { noise(b, { dur: 1.2, vol: 0.9, f: 800, slide: 50 }); tone(b, { f: 55, dur: 0.8, vol: 0.4, slide: 30 }); },
  necro: b => { tone(b, { f: 220, type: 'triangle', dur: 0.25, vol: 0.25, slide: 110 }); tone(b, { f: 330, dur: 0.2, vol: 0.15, slide: 160 }); },
  frost: b => { tone(b, { f: 1800, dur: 0.2, vol: 0.18, slide: 900 }); noise(b, { dur: 0.15, vol: 0.2, f: 6000, type: 'highpass' }); },
  ballista: b => { noise(b, { dur: 0.12, vol: 0.6, f: 300 }); tone(b, { f: 120, type: 'square', dur: 0.1, vol: 0.15, slide: 60 }); },
  arcane: b => tone(b, { f: 750, dur: 0.15, vol: 0.18, slide: 1600 }),
  slam: b => { noise(b, { dur: 0.3, vol: 0.8, f: 300, slide: 40 }); tone(b, { f: 60, dur: 0.3, vol: 0.5, slide: 30 }); },
  hook: b => noise(b, { dur: 0.2, vol: 0.4, f: 2000, type: 'bandpass', slide: 400 }),
  sizzle: b => noise(b, { dur: 0.6, vol: 0.3, f: 5000, type: 'highpass' }),
  bow: b => noise(b, { dur: 0.08, vol: 0.4, f: 2500, type: 'bandpass', slide: 800, q: 3 }),
  shoot: b => noise(b, { dur: 0.1, vol: 0.4, f: 1600, type: 'bandpass', slide: 600, q: 2 }),
  catapult: b => { noise(b, { dur: 0.3, vol: 0.5, f: 400 }); tone(b, { f: 90, type: 'triangle', dur: 0.25, vol: 0.3, slide: 60 }); },
  hit: b => noise(b, { dur: 0.06, vol: 0.5, f: 1800, type: 'bandpass', slide: 600, q: 2 }),
  hitstone: b => noise(b, { dur: 0.1, vol: 0.5, f: 700, slide: 200 }),
  slash: b => noise(b, { dur: 0.07, vol: 0.4, f: 3000, type: 'highpass', slide: 1200 }),
  die: b => { tone(b, { f: 200, type: 'sawtooth', dur: 0.25, vol: 0.12, slide: 70 }); noise(b, { dur: 0.15, vol: 0.2, f: 900 }); },
  bossdie: b => { tone(b, { f: 110, type: 'sawtooth', dur: 1.6, vol: 0.35, slide: 30 }); noise(b, { dur: 1.6, vol: 0.7, f: 900, slide: 40 }); tone(b, { f: 440, dur: 1.2, vol: 0.2, slide: 880, delay: 0.3 }); },
  crumble: b => noise(b, { dur: 0.6, vol: 0.8, f: 500, slide: 80 }),
  summon: b => { tone(b, { f: 55, type: 'sawtooth', dur: 1.4, vol: 0.35, slide: 110 }); tone(b, { f: 82, type: 'sawtooth', dur: 1.4, vol: 0.25, slide: 165 }); noise(b, { dur: 1.2, vol: 0.4, f: 400, slide: 1600 }); },
  horn: b => { tone(b, { f: 146.8, type: 'sawtooth', dur: 1.1, vol: 0.25, attack: 0.15 }); tone(b, { f: 220, type: 'sawtooth', dur: 0.9, vol: 0.16, delay: 0.1, attack: 0.15 }); },
  cast: b => { tone(b, { f: 300, dur: 0.5, vol: 0.25, slide: 900 }); noise(b, { dur: 0.4, vol: 0.2, f: 3000, type: 'bandpass', slide: 600 }); },
  deathwave: b => { tone(b, { f: 110, type: 'sawtooth', dur: 0.9, vol: 0.35, slide: 40 }); noise(b, { dur: 0.9, vol: 0.6, f: 1200, slide: 100 }); },
  raise: b => { tone(b, { f: 98, type: 'triangle', dur: 1.0, vol: 0.35, slide: 196 }); tone(b, { f: 147, dur: 1.0, vol: 0.2, slide: 294, delay: 0.1 }); },
  prison: b => { tone(b, { f: 660, type: 'square', dur: 0.4, vol: 0.1, slide: 330 }); tone(b, { f: 990, type: 'square', dur: 0.3, vol: 0.08, slide: 495, delay: 0.05 }); },
  time: b => { tone(b, { f: 800, dur: 1.2, vol: 0.2, slide: 200 }); tone(b, { f: 1200, dur: 1.2, vol: 0.12, slide: 300 }); },
  blood: b => { noise(b, { dur: 1.0, vol: 0.4, f: 500, type: 'bandpass', slide: 200, q: 4 }); tone(b, { f: 70, dur: 1.0, vol: 0.35, slide: 50 }); },
  apocalypse: b => { noise(b, { dur: 2.5, vol: 1, f: 1500, slide: 40 }); tone(b, { f: 40, type: 'sawtooth', dur: 2.5, vol: 0.5, slide: 25 }); },
  well: b => { tone(b, { f: 523, dur: 0.4, vol: 0.2 }); tone(b, { f: 784, dur: 0.5, vol: 0.15, delay: 0.08 }); tone(b, { f: 1046, dur: 0.6, vol: 0.1, delay: 0.16 }); },
  error: b => tone(b, { f: 140, type: 'square', dur: 0.15, vol: 0.12, slide: 90 }),
  click: b => tone(b, { f: 900, type: 'square', dur: 0.03, vol: 0.08 }),
  build: b => { noise(b, { dur: 0.15, vol: 0.5, f: 600 }); tone(b, { f: 200, type: 'triangle', dur: 0.12, vol: 0.2, slide: 120 }); },
  levelup: b => [392, 466, 587, 784].forEach((f, i) => tone(b, { f, type: 'triangle', dur: 0.5, vol: 0.2, delay: i * 0.08 })),
  silence: b => tone(b, { f: 400, dur: 0.6, vol: 0.2, slide: 60 }),
  wail: b => { tone(b, { f: 900, dur: 0.6, vol: 0.15, slide: 500, attack: 0.1 }); tone(b, { f: 910, dur: 0.6, vol: 0.12, slide: 520, attack: 0.1 }); },
  holy: b => [523, 659, 784].forEach((f, i) => tone(b, { f, dur: 1.0, vol: 0.15, delay: i * 0.04, attack: 0.05 })),
  bossroar: b => { tone(b, { f: 70, type: 'sawtooth', dur: 1.8, vol: 0.45, slide: 45 }); noise(b, { dur: 1.8, vol: 0.5, f: 300, slide: 120 }); tone(b, { f: 146.8, type: 'sawtooth', dur: 1.6, vol: 0.2, delay: 0.2, attack: 0.2 }); },
  defeat: b => { tone(b, { f: 220, type: 'sawtooth', dur: 3, vol: 0.3, slide: 55 }); tone(b, { f: 233, type: 'sawtooth', dur: 3, vol: 0.2, slide: 58 }); noise(b, { dur: 3, vol: 0.5, f: 600, slide: 40 }); },
};
const DUR = { thunder: 1.3, bossdie: 1.8, summon: 1.5, horn: 1.2, deathwave: 1.0, raise: 1.2, time: 1.3, blood: 1.1, apocalypse: 2.6, levelup: 0.9, holy: 1.2, bossroar: 1.9, defeat: 3.1, well: 0.8, wail: 0.7, sizzle: 0.7, crumble: 0.7, cast: 0.6, silence: 0.7 };
const list = [];
for (const name in S) {
  const b = buffer(DUR[name] || 0.55);
  S[name](b);
  let peak = 0; for (const v of b) peak = Math.max(peak, Math.abs(v));
  if (peak > 0.95) for (let i = 0; i < b.length; i++) b[i] *= 0.95 / peak;
  saveWAV(b, SR, path.join(ROOT, `assets/audio/sfx/${name}.wav`));
  list.push(name);
}
fs.writeFileSync(path.join(ROOT, 'assets/data/sfx.json'), JSON.stringify(list));
console.log(`Rendered ${list.length} sound effects.`);

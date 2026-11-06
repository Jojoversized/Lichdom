// Generates every sprite sheet into /assets and writes assets/data/manifest.json.
// Run: npm run assets   (or: node tools/assets/gen-sprites.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PixelCanvas, savePNG } from './pixelcanvas.mjs';
import * as P from './painters.mjs';
import { finish, RES } from './hires.mjs';
const LORES = process.env.LICH_LORES === '1';
const fin = (c, o) => (LORES ? c : finish(c, o));

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'assets');
const manifest = { version: 2, res: LORES ? 1 : RES, generated: 'tools/assets/gen-sprites.mjs', sheets: {}, images: {} };

const ANIMS = ['idle', 'walk', 'atk', 'cast'];
function writeSheet(key, rel, frameLists, meta = {}, look = {}) {
  // frameLists: { anim: [canvas...] } -> horizontal strip
  const all = [];
  const anims = {};
  let fi = 0;
  for (const a of ANIMS) {
    const fr = (frameLists[a] || []).map(c => fin(c, Object.assign({ seed: key.length * 131 + fi++ }, look)));
    anims[a] = [all.length, fr.length];
    all.push(...fr);
  }
  const fw = Math.max(...all.map(c => c.width)), fh = Math.max(...all.map(c => c.height));
  const sheet = new PixelCanvas(fw * all.length, fh);
  all.forEach((c, i) => sheet.drawImage(c, i * fw + Math.floor((fw - c.width) / 2), fh - c.height));
  savePNG(sheet, path.join(OUT, rel));
  manifest.sheets[key] = { file: rel, fw, fh, frames: all.length, anims, ...meta };
}
function writeStrip(key, rel, frames, meta = {}, look = {}) {
  frames = frames.map((c, i) => fin(c, Object.assign({ seed: key.length * 71 + i }, look)));
  const fw = Math.max(...frames.map(c => c.width)), fh = Math.max(...frames.map(c => c.height));
  const sheet = new PixelCanvas(fw * frames.length, fh);
  frames.forEach((c, i) => sheet.drawImage(c, i * fw + Math.floor((fw - c.width) / 2), fh - c.height));
  savePNG(sheet, path.join(OUT, rel));
  manifest.sheets[key] = { file: rel, fw, fh, frames: frames.length, ...meta };
}

const UNDEAD = ['skeleton', 'skeleton2', 'skeleton3', 'archer', 'archer2', 'archer3', 'zombie', 'zombie2', 'zombie3', 'pikeman', 'pikeman2', 'deathknight', 'deathknight2', 'bonemage', 'acolyte', 'wraith', 'banshee', 'vampire', 'abomination', 'golem'];
const SUMMONS = ['colossus', 'devourer', 'sumabom'];
console.log('Painting characters...');
for (const k in P.SPRITE_SPECS) {
  const spec = P.SPRITE_SPECS[k];
  if (!spec) continue;
  P.reseed(k.length * 997 + k.charCodeAt(0));
  const set = P.buildHumanoidSet(k, Object.assign({ H: 22 }, spec));
  const cat = k.startsWith('b_') ? 'bosses' : SUMMONS.includes(k) ? 'summons' : UNDEAD.includes(k) ? 'units' : 'enemies';
  const big = set.H >= 30, huge = set.H >= 38;
  writeSheet(k, `sprites/${cat}/${k}.png`, set.frames, { H: set.H, flying: !!spec.flying, category: cat }, { body: big ? 12 : 7, part: big ? 5 : 3.5, unblock: huge });
}
P.reseed(5);
P.buildDragonSet('wyvern', { body: '#4a4440', wing: '#2a2624', bony: true, eye: P.PAL.necro, k: 0.6 });
P.buildDragonSet('infdragon', { body: '#6a1a10', wing: '#3a0e0a', eye: P.PAL.fireL, belly: P.PAL.fire, k: 1.15, mouthGlow: true });
writeSheet('wyvern', 'sprites/units/wyvern.png', P.SPR.wyvern.frames, { H: P.SPR.wyvern.H, flying: true, category: 'units' });
writeSheet('infdragon', 'sprites/summons/infdragon.png', P.SPR.infdragon.frames, { H: P.SPR.infdragon.H, flying: true, category: 'summons' }, { body: 12, part: 5 });
P.buildRamSet(); P.buildCatapultSet();
writeSheet('ram', 'sprites/enemies/ram.png', P.SPR.ram.frames, { H: 22, category: 'enemies' });
writeSheet('catapult', 'sprites/enemies/catapult.png', P.SPR.catapult.frames, { H: 22, category: 'enemies' });
P.buildLichSet();
writeSheet('lich', 'sprites/units/lich.png', P.SPR.lich.frames, { H: 30, category: 'units' });

console.log('Painting towers...');
P.buildTowerArt();
for (const t in P.TOWER_ART) writeStrip('tower_' + t, `sprites/towers/${t}.png`, P.TOWER_ART[t].flat(), { tiers: 3, perTier: 4 }, { body: 9, part: 4 });

console.log('Painting environment...');
for (const f in P.FORTRESSES) writeStrip('keep_' + f, `sprites/environment/keep_${f}.png`, P.buildKeepArt(P.FORTRESSES[f]), {}, { body: 14, part: 5, strength: 0.9 });
writeStrip('soulwell', 'sprites/environment/soulwell.png', P.buildSoulWellArt());
P.buildPropArt();
for (const k in P.PROP_ART) writeStrip('prop_' + k, `sprites/environment/props/${k}.png`, P.PROP_ART[k]);

console.log('Painting fortifications...');
P.buildFortArt();
writeStrip('fort_wall', 'sprites/fortifications/wall.png', P.FORT_ART.wall);
writeStrip('fort_wall2', 'sprites/fortifications/wall_reinforced.png', P.FORT_ART.wall2);
writeStrip('fort_spikes', 'sprites/fortifications/spikes.png', [P.FORT_ART.spikes]);
for (const k of ['lava', 'rune', 'cauldron', 'ward']) writeStrip('fort_' + k, `sprites/fortifications/${k}.png`, P.FORT_ART[k], {}, k === 'lava' || k === 'rune' ? { strength: 0.35, body: 3 } : {});

console.log('Painting icons...');
P.buildIcons();
for (const k in P.ICONS) { savePNG(fin(P.ICONS[k], { pad: false, body: 5, part: 3, grit: 0.02 }), path.join(OUT, `ui/icons/${k}.png`)); manifest.images['icon_' + k] = { file: `ui/icons/${k}.png` }; }

// effects: soft-edged shadow ellipses at a few (world) sizes, drawn at texel resolution
const R = LORES ? 1 : RES;
for (const w of [8, 12, 16, 24, 32, 48]) {
  const h = Math.max(3, Math.round(w * 0.35));
  const W = w * R, Hh = h * R;
  const c = new PixelCanvas(W, Hh);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const dx = (x + 0.5) / W * 2 - 1, dy = (y + 0.5) / Hh * 2 - 1, dd = dx * dx + dy * dy;
    if (dd >= 1) continue;
    const a = dd < 0.55 ? 0.5 : dd < 0.8 ? 0.36 : 0.2; // 3 stepped bands, no smooth gradient
    c.fillStyle = `rgba(0,0,0,${a})`; c.fillRect(x, y, 1, 1);
  }
  savePNG(c, path.join(OUT, `sprites/effects/shadow_${w}.png`));
  manifest.images['shadow_' + w] = { file: `sprites/effects/shadow_${w}.png` };
}

fs.mkdirSync(path.join(OUT, 'data'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'data/manifest.json'), JSON.stringify(manifest, null, 1));
fs.writeFileSync(path.join(OUT, 'data/palette.json'), JSON.stringify(P.PAL, null, 1));
console.log(`Done: ${Object.keys(manifest.sheets).length} sheets, ${Object.keys(manifest.images).length} images.`);

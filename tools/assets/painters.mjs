// AUTO-ASSEMBLED painter library for the asset pipeline.
// Every sprite in the game is painted here, pixel by pixel, then exported
// by gen-sprites.mjs. Edit painters/specs here and run `npm run assets`.
import { PixelCanvas } from './pixelcanvas.mjs';
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
function makeRng(seed) {
  let a = seed >>> 0;
  const f = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  f.range = (lo, hi) => lo + f() * (hi - lo); f.int = (lo, hi) => Math.floor(lo + f() * (hi - lo + 1)); f.pick = arr => arr[Math.floor(f() * arr.length)];
  return f;
}
// deterministic Math.random replacement so regenerated assets are stable
let _seed = makeRng(20261106);
Math.random = () => _seed();
export function reseed(n) { _seed = makeRng(n); }
function hexToRgb(h) { h = h.replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
function rgbToHex(r, g, b) { return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join(''); }
function shade(hex, f) { const [r, g, b] = hexToRgb(hex); if (f < 1) return rgbToHex(r * f, g * f, b * f); return rgbToHex(r + (255 - r) * (f - 1), g + (255 - g) * (f - 1), b + (255 - b) * (f - 1)); }
function makeCanvas(w, h) { const c = new PixelCanvas(w, h); return [c, c]; }
// ============================================================
// Procedural pixel-art sprite generator
// Every sprite is painted pixel-by-pixel into small canvases at
// native resolution, then outlined. No smoothing anywhere.
// ============================================================
const OUTLINE = '#08090b';
const PAL = {
  bone: '#d8cfb4', boneD: '#a39a80', boneDD: '#6d6654',
  iron: '#7d838a', ironD: '#4c5157', ironL: '#b4bac0',
  gold: '#d6a940', goldD: '#8e6b22',
  holy: '#fff3c4', holyD: '#e2c46a',
  cloth: '#3a2f45', clothD: '#241c2c',
  necro: '#5dff7a', necroD: '#1f9c3e', necroDD: '#0d4a1e',
  blood: '#7a1414', bloodD: '#4a0b0b',
  fire: '#ff8a1e', fireL: '#ffd257', fireD: '#b8380e',
  frost: '#9fe6ff', frostD: '#3d8fc4',
  arcane: '#b26bff', arcaneD: '#5a2a9c',
  skin: '#c79a7a', skinD: '#8f6650',
  zomb: '#7f8f6a', zombD: '#55604a',
  leather: '#5b4030', leatherD: '#3a281d',
  wood: '#6b4a2e', woodD: '#42301f',
  stone: '#4a4a4e', stoneD: '#2e2e33', stoneL: '#6c6c70',
  white: '#f2f2ee',
};

const SPR = {}; // name -> sprite set

// In the hi-res pipeline (default) outlines and shading are applied at 2x by
// tools/assets/hires.mjs after painting; set LICH_LORES=1 for the legacy 1x look.
const LORES = typeof process !== 'undefined' && process.env && process.env.LICH_LORES === '1';
function outlineCanvas(c, color = OUTLINE) {
  if (!LORES) return c;
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height;
  const img = ctx.getImageData(0, 0, w, h); const d = img.data;
  const src = new Uint8ClampedArray(d);
  const [or, og, ob] = hexToRgb(color);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (src[i + 3] > 40) continue;
    let n = false;
    if (x > 0 && src[i - 4 + 3] > 140) n = true;
    else if (x < w - 1 && src[i + 4 + 3] > 140) n = true;
    else if (y > 0 && src[i - w * 4 + 3] > 140) n = true;
    else if (y < h - 1 && src[i + w * 4 + 3] > 140) n = true;
    if (n) { d[i] = or; d[i + 1] = og; d[i + 2] = ob; d[i + 3] = 255; }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Adds form shading: rim light on top edges, shade on bottom/right edges and
// subtle grit noise on larger sprites so flat shapes read as volume.
function shadeCanvas(c, grit = 0.06, seed = 1) {
  if (!LORES) return c;
  const ctx = c.getContext('2d');
  const w = c.width, h = c.height;
  const img = ctx.getImageData(0, 0, w, h); const d = img.data; const src = new Uint8ClampedArray(d);
  const rng = makeRng(seed);
  const op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 140;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (src[i + 3] < 140) continue;
    let f = 1;
    if (!op(x, y - 1)) f *= 1.16;
    else if (!op(x - 1, y)) f *= 1.07;
    if (!op(x, y + 1)) f *= 0.78;
    else if (!op(x + 1, y)) f *= 0.88;
    if (grit) f *= 1 + (rng() - 0.5) * 2 * grit;
    for (let k = 0; k < 3; k++) d[i + k] = clamp(src[i + k] * f + (f > 1 ? 4 : 0), 0, 255);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function tintCanvas(src, color, alpha = 1) {
  const [c, ctx] = makeCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color; ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

function rotated90(src) {
  const [c, ctx] = makeCanvas(src.height, src.width);
  ctx.translate(src.height, 0); ctx.rotate(Math.PI / 2);
  ctx.drawImage(src, 0, 0);
  return c;
}

// pixel line (Bresenham-ish via stepping)
function pline(ctx, x0, y0, x1, y1, color, th = 1) {
  ctx.fillStyle = color;
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) {
    const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n);
    ctx.fillRect(x - (th >> 1), y - (th >> 1), th, th);
  }
}

// ------------------------------------------------------------
// Humanoid generator
// ------------------------------------------------------------
function drawHumanoid(ctx, sp, cw, ch, anim, f) {
  const H = sp.H, k = H / 22;
  const T = ch - H - 1; // top of head (in canvas)
  const cx = Math.floor(cw / 2) + (sp.mount ? 1 : 0);
  const S = v => Math.max(1, Math.round(v * k));
  const bulk = sp.bulk || 1;
  const X = v => cx + Math.round(v * k * (v < 0 ? bulk : bulk));
  let bob = 0;
  if (anim === 'idle') bob = f % 2 ? 1 : 0;
  if (anim === 'walk') bob = f % 2 ? 1 : 0;
  if (anim === 'atk' && f === 1) bob = 1;
  if (sp.float) bob = [0, 1, 2, 1][f % 4] - 1;
  const yo = (sp.mountYOff || 0);
  const Y = v => T + Math.round(v * k) + bob + yo;
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(X(x), Y(y), Math.max(1, Math.round(w * k * bulk)), S(h)); };
  const P = (x, y, c, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(X(x), Y(y), S(w), S(h)); };

  const body = sp.body || PAL.cloth, bodyD = shade(body, 0.65), bodyL = shade(body, 1.18);
  const limb = sp.limb || (sp.bony ? PAL.bone : body);
  const legC = sp.legs || (sp.bony ? PAL.bone : shade(body, 0.8));
  const boots = sp.boots || (sp.bony ? PAL.boneD : PAL.leatherD);

  // ---- wings (behind)
  if (sp.wings) {
    const flap = [0, -3, -5, -2][f % 4];
    const wc = sp.wings === 'feather' ? PAL.white : sp.wings === 'bone' ? PAL.boneD : '#2b2230';
    const wd = shade(wc, 0.7);
    for (let i = 0; i < 9; i++) {
      const wy = 8 + flap * (i / 9) - i * 0.6;
      R(-4 - i, wy, 1, 6 - i * 0.4, i % 3 === 0 ? wd : wc);
      R(3 + i * 0.6, wy - 1, 1, 5 - i * 0.4, i % 3 === 0 ? wd : wc);
    }
    if (sp.wings === 'bone') { for (let i = 0; i < 9; i += 2) P(-4 - i, 7 + flap * (i / 9) - i * 0.6, PAL.bone); }
  }
  // ---- cape (behind)
  if (sp.cape) {
    const cc = sp.cape, cd = shade(cc, 0.6);
    const sway = anim === 'walk' ? (f % 2 ? 1 : 0) : 0;
    R(-4 - sway * 0.5, 7, 7, 12, cd);
    R(-3 - sway * 0.5, 7, 5, 11, cc);
    for (let i = 0; i < 7; i += 2) P(-4 + i - sway * 0.5, 19, cd);
  }
  // ---- legs
  if (!sp.noLegs && !sp.float) {
    let l1 = 0, l2 = 0, lift1 = 0, lift2 = 0;
    if (anim === 'walk') {
      l1 = [-1.5, 0, 1.5, 0][f % 4]; l2 = -l1;
      lift1 = f % 4 === 1 ? 1 : 0; lift2 = f % 4 === 3 ? 1 : 0;
    }
    if (anim === 'atk' && f === 1) { l1 = -1.5; l2 = 1.5; }
    const lw = sp.bony ? 1.2 : 2.4;
    R(-2.6 + l1, 14, lw, 6 - lift1, legC);
    R(0.6 + l2, 14, lw, 6 - lift2, sp.bony ? PAL.boneD : shade(legC, 0.8));
    R(-3 + l1, 20 - lift1, 3, 2, boots);
    R(0.4 + l2, 20 - lift2, 3, 2, shade(boots, 0.85));
    if (sp.bony) { P(-2.4 + l1, 16.5, PAL.boneDD); P(0.8 + l2, 16.5, PAL.boneDD); }
  }
  if (sp.float) {
    // ghostly tail
    const tc = sp.body || '#2a2f3a';
    for (let i = 0; i < 7; i++) {
      const w = 6 - i * 0.8, wob = Math.sin((f + i) * 1.3) * 0.8;
      ctx.globalAlpha = 1 - i * 0.12;
      R(-w / 2 + wob - 0.5, 14 + i, w, 1, i % 2 ? shade(tc, 0.75) : tc);
    }
    ctx.globalAlpha = 1;
  }
  // ---- back arm
  const armY = 7.5;
  if (!sp.noArms) {
    R(-4.6, armY, sp.bony ? 1.2 : 1.8, 5.5, sp.bony ? PAL.boneD : shade(limb, 0.75));
  }
  // ---- shield (held on back arm, in front-left)
  // ---- torso
  R(-3, 7, 6.4, 7.4, body);
  R(-3, 7, 1.2, 7.4, bodyL);
  R(2.2, 7, 1.2, 7.4, bodyD);
  if (sp.ribs) {
    R(-2.2, 7.5, 4.6, 6, '#1a1714');
    for (let i = 0; i < 3; i++) R(-2.4, 8 + i * 1.8, 4.8, 0.9, PAL.bone);
    R(-0.3, 7.5, 0.9, 6.5, PAL.boneD);
    R(-2, 12.6, 4.2, 1.6, PAL.boneD); // pelvis
  }
  if (sp.armor) {
    R(-3, 7, 6.4, 2, sp.armor); R(-3, 7, 6.4, 0.8, shade(sp.armor, 1.25));
    P(-3.6, 7, shade(sp.armor, 1.1), 1.4, 1.6); P(2.6, 7, shade(sp.armor, 0.8), 1.4, 1.6);
  }
  if (sp.tabard) { R(-1.6, 9, 3.4, 5.6, sp.tabard); }
  if (sp.emblem === 'cross') { R(-0.3, 9.6, 0.9, 3, PAL.gold); R(-1.2, 10.4, 2.8, 0.9, PAL.gold); }
  if (sp.emblem === 'sun') { R(-0.8, 10, 1.8, 1.8, PAL.gold); P(-1.6, 10.6, PAL.goldD); P(1.4, 10.6, PAL.goldD); }
  if (sp.emblem === 'skull') { R(-0.8, 10, 1.8, 1.6, PAL.bone); P(-0.6, 10.5, '#111'); P(0.4, 10.5, '#111'); }
  if (sp.emblem === 'eye') { R(-1, 10.4, 2.2, 1, PAL.arcane); P(0, 10.4, '#fff'); }
  if (sp.stitch) { for (let i = 0; i < 5; i++) P(-1.5 + i * 0.7, 9 + (i % 2), '#2a1a1a'); P(1.2, 11.5, PAL.blood, 1.2, 1); }
  if (!sp.ribs) R(-3, 13.2, 6.4, 1, sp.belt || PAL.leatherD);
  if (sp.robe) { R(-3.4, 13, 7.2, 7.5, body); R(-3.4, 13, 1.2, 7.5, bodyL); R(2.6, 13, 1.2, 7.5, bodyD); R(-3.4, 19.6, 7.2, 1, bodyD); }

  // ---- head
  const hx = -3, hy = 0;
  const glow = sp.eyes || null;
  switch (sp.head) {
    case 'skull': case 'skullHelm': {
      R(-2.8, 0.4, 5.8, 5, PAL.bone); R(-2.8, 0.4, 1, 5, PAL.white); R(2.2, 1, 0.8, 4, PAL.boneD);
      P(-0.8, 2.2, '#111', 1.2, 1.4); P(1.4, 2.2, '#111', 1.2, 1.4);
      if (glow) { P(-0.6, 2.5, glow); P(1.6, 2.5, glow); }
      R(-1.8, 5.2, 4.4, 1, PAL.boneD); P(-1, 5.2, '#111'); P(0.6, 5.2, '#111');
      if (sp.head === 'skullHelm') { R(-3.2, 0, 6.6, 1.8, sp.helm || PAL.ironD); R(-3.2, 0, 6.6, 0.7, shade(sp.helm || PAL.ironD, 1.4)); }
      break;
    }
    case 'helm': case 'greathelm': {
      const hc = sp.helm || PAL.iron;
      R(-3, 0, 6.4, 6.2, hc); R(-3, 0, 1.2, 6.2, shade(hc, 1.3)); R(2.2, 0, 1.2, 6.2, shade(hc, 0.7));
      R(-0.6, 2.6, 3.8, 0.9, '#0d0d10');
      if (glow) P(1.6, 2.6, glow);
      if (sp.head === 'greathelm') { R(0.6, 3.8, 0.9, 2, '#0d0d10'); }
      if (sp.plume) { R(-1, -2, 1.8, 2.2, sp.plume); R(-2.2, -1.2, 1.4, 1.6, shade(sp.plume, 0.7)); }
      break;
    }
    case 'horned': {
      const hc = sp.helm || '#2c2a30';
      R(-3, 0, 6.4, 6.2, hc); R(-3, 0, 1.2, 6.2, shade(hc, 1.4));
      R(-0.6, 2.6, 3.8, 0.9, '#050505'); P(0.4, 2.6, glow || PAL.necro); P(1.8, 2.6, glow || PAL.necro);
      R(-4.6, -1.5, 1.4, 2.5, PAL.bone); R(-5, -3, 1, 1.8, PAL.boneD);
      R(3.2, -1.5, 1.4, 2.5, PAL.bone); R(4, -3, 1, 1.8, PAL.boneD);
      break;
    }
    case 'hood': {
      const hc = sp.hood || body;
      R(-3.2, -0.4, 6.6, 6.8, hc); R(-3.2, -0.4, 1.2, 6.8, shade(hc, 1.25));
      R(-1, 1.8, 3.8, 3.6, '#060607');
      if (glow) { P(-0.2, 3, glow); P(1.6, 3, glow); }
      R(1.8, -1.2, 1.4, 1.4, hc);
      break;
    }
    case 'face': case 'mitre': case 'crown': case 'wizard': case 'zombie': {
      const sk = sp.head === 'zombie' ? PAL.zomb : (sp.skin || PAL.skin);
      R(-2.6, 0.8, 5.6, 5.2, sk); R(2, 1, 1, 4.8, shade(sk, 0.75));
      P(1.2, 2.8, sp.head === 'zombie' ? '#1a1010' : '#1d1410');
      if (sp.head === 'zombie') { P(-0.6, 2.6, '#1a1010'); R(0, 4.6, 2.2, 0.9, '#2b0d0d'); P(-2, 1.6, PAL.blood); }
      const hair = sp.hair || '#3b2a1e';
      if (sp.head !== 'wizard') { R(-3, 0, 6, 1.4, hair); R(-3, 0, 1.6, 4, hair); }
      if (sp.beard) { R(-0.6, 4.4, 3.6, 2.4, sp.beard); }
      if (sp.head === 'mitre') { R(-2.4, -3.6, 5, 4, PAL.white); R(-0.4, -3.2, 1, 3.2, PAL.gold); R(-1.4, -2.2, 3, 0.9, PAL.gold); R(-2.4, 0, 5, 0.9, PAL.gold); }
      if (sp.head === 'crown') { R(-3, -1.2, 6.2, 1.6, PAL.gold); P(-3, -2.4, PAL.gold); P(-0.2, -2.6, PAL.gold); P(2.4, -2.4, PAL.gold); P(-0.2, -0.8, '#c22'); }
      if (sp.head === 'wizard') { const hc = sp.hat || PAL.arcaneD; R(-3.6, 0, 7.4, 1.2, hc); R(-2.4, -2.2, 4.8, 2.4, hc); R(-1, -4.2, 2.6, 2.2, hc); R(0.6, -5.6, 1.2, 1.6, hc); }
      break;
    }
    case 'veil': { // banshee
      R(-2.8, 0, 5.8, 6, '#cfd8dc'); R(-2.8, 0, 5.8, 6, '#cfd8dc');
      R(-1, 2, 3.4, 2.6, '#1b2224'); P(-0.2, 3, glow || '#bff'); P(1.6, 3, glow || '#bff');
      R(-3.4, 0.6, 1.2, 8, '#a9b4b8'); R(2.6, 0.6, 1.2, 8, '#a9b4b8');
      break;
    }
  }
  if (sp.halo) { ctx.fillStyle = PAL.holy; ctx.fillRect(X(-2.4), Y(-2.4), S(5.4), 1); ctx.fillRect(X(-2.4), Y(-1.2), 1, 1); ctx.fillRect(X(2.6), Y(-1.2), 1, 1); }

  // ---- weapon & front arm
  let ang = -60, hand = [4.2, 12], reach = 0;
  const wpn = sp.weapon;
  if (anim === 'atk') {
    if (wpn === 'spear' || wpn === 'lance') { ang = [-20, -10, 0][f]; reach = [-1.5, 2, 1][f]; }
    else if (wpn === 'bow' || wpn === 'crossbow') { ang = 0; }
    else if (wpn === 'staff') { ang = [-90, -100, -80][f]; hand = [4.2, [9, 7, 9][f]]; }
    else { ang = [-150, 25, 55][f]; hand = [[3.4, 4.6, 4.6][f], [8, 11, 12][f]]; }
  } else if (anim === 'cast') { ang = -95; hand = [4.4, 6 + (f % 2)]; }
  else if (wpn === 'spear' || wpn === 'lance') { ang = -80; }
  else if (wpn === 'staff') { ang = -90; }
  else if (wpn === 'bow' || wpn === 'crossbow') { ang = 0; }
  const hX = X(hand[0] + reach), hY = Y(hand[1]);
  const th = Math.max(1, Math.round(k * (sp.weaponTh || 1)));
  const lenOf = { sword: 7, greatsword: 11, spear: 15, lance: 17, axe: 8, hammer: 9, mace: 8, dagger: 4, scythe: 12, staff: 14, cleaver: 8, claws: 3 };
  const wl = (lenOf[wpn] || 6) * k;
  const rad = ang * Math.PI / 180;
  const ex = hX + Math.cos(rad) * wl, ey = hY + Math.sin(rad) * wl;
  const wc = sp.weaponColor || PAL.ironL;
  const drawArm = () => {
    if (sp.noArms) return;
    // front arm from shoulder to hand
    pline(ctx, X(3.4), Y(armY), hX, hY, sp.bony ? PAL.bone : limb, Math.max(1, Math.round((sp.bony ? 1 : 1.8) * k)));
    ctx.fillStyle = sp.bony ? PAL.bone : (sp.glove || shade(limb, 0.85)); ctx.fillRect(hX - (th >> 1), hY - (th >> 1), S(1.4), S(1.4));
  };
  if (wpn === 'bow') {
    const pull = anim === 'atk' ? [1, 3, 0][f] : 0;
    drawArm();
    const bx = hX + S(1), by = hY - S(5);
    ctx.fillStyle = sp.weaponColor || PAL.wood;
    for (let i = 0; i <= 10; i++) { const yy = by + Math.round(i * k); const xx = bx + Math.round(Math.sin(i / 10 * Math.PI) * 2.5 * k); ctx.fillRect(xx, yy, th, th); }
    pline(ctx, bx, by, bx - Math.round(pull * k), by + Math.round(5 * k), '#cfcfcf', 1);
    pline(ctx, bx - Math.round(pull * k), by + Math.round(5 * k), bx, by + Math.round(10 * k), '#cfcfcf', 1);
    if (anim === 'atk' && f < 2) pline(ctx, bx - Math.round(pull * k), by + Math.round(5 * k), bx + Math.round(5 * k), by + Math.round(5 * k), sp.arrow || PAL.boneD, 1);
  } else if (wpn === 'crossbow') {
    drawArm();
    pline(ctx, hX - S(2), hY, hX + S(6), hY, PAL.wood, th);
    pline(ctx, hX + S(4), hY - S(3), hX + S(4), hY + S(3), PAL.iron, 1);
  } else if (wpn && wpn !== 'none') {
    // haft / blade
    const hiltLen = wpn === 'sword' || wpn === 'greatsword' || wpn === 'dagger' ? 0.25 : 0.65;
    const mx = hX + (ex - hX) * hiltLen, my = hY + (ey - hY) * hiltLen;
    // grip behind hand
    pline(ctx, hX - Math.cos(rad) * 2 * k, hY - Math.sin(rad) * 2 * k, hX, hY, PAL.woodD, th);
    if (wpn === 'sword' || wpn === 'greatsword' || wpn === 'dagger' || wpn === 'claws') {
      pline(ctx, hX, hY, ex, ey, wc, th);
      // guard
      const gx = Math.round(Math.cos(rad + Math.PI / 2) * 1.5 * k), gy = Math.round(Math.sin(rad + Math.PI / 2) * 1.5 * k);
      pline(ctx, hX + gx, hY + gy, hX - gx, hY - gy, sp.guard || PAL.goldD, 1);
      if (sp.glowBlade) { ctx.fillStyle = sp.glowBlade; ctx.fillRect(Math.round(ex), Math.round(ey), th, th); }
    } else {
      pline(ctx, hX, hY, ex, ey, wpn === 'staff' ? (sp.staffC || PAL.wood) : PAL.wood, th);
      const px = Math.round(Math.cos(rad + Math.PI / 2) * k), py = Math.round(Math.sin(rad + Math.PI / 2) * k);
      if (wpn === 'spear' || wpn === 'lance') { pline(ctx, ex, ey, ex + Math.cos(rad) * 3 * k, ey + Math.sin(rad) * 3 * k, wc, th + (wpn === 'lance' ? 1 : 0)); if (sp.pennant) { ctx.fillStyle = sp.pennant; ctx.fillRect(Math.round(mx + (ex - mx) * 0.7) - S(2), Math.round(my + (ey - my) * 0.7), S(2), S(1.5)); } }
      if (wpn === 'axe') { for (let i = 0; i < 3; i++) pline(ctx, ex - Math.cos(rad) * i * k, ey - Math.sin(rad) * i * k, ex - Math.cos(rad) * i * k + px * 3, ey - Math.sin(rad) * i * k + py * 3, wc, 1); }
      if (wpn === 'hammer' || wpn === 'mace') { ctx.fillStyle = wc; ctx.fillRect(Math.round(ex) - S(1.5), Math.round(ey) - S(1.5), S(3.2), S(3.2)); ctx.fillStyle = shade(wc, 1.3); ctx.fillRect(Math.round(ex) - S(1.5), Math.round(ey) - S(1.5), S(1), S(1)); }
      if (wpn === 'scythe') { for (let i = 0; i < 6; i++) { ctx.fillStyle = i < 2 ? shade(wc, 1.2) : wc; ctx.fillRect(Math.round(ex + px * i * 0.9 - Math.cos(rad) * i * 0.4 * k), Math.round(ey + py * i * 0.9 - Math.sin(rad) * i * 0.4 * k), th, th); } }
      if (wpn === 'cleaver') { for (let i = 0; i < 4; i++) pline(ctx, ex - Math.cos(rad) * i * k, ey - Math.sin(rad) * i * k, ex - Math.cos(rad) * i * k - px * 3, ey - Math.sin(rad) * i * k - py * 3, '#8a8a80', 1); }
      if (wpn === 'staff') {
        const oc = sp.orb || PAL.necro;
        ctx.fillStyle = oc; ctx.fillRect(Math.round(ex) - S(1), Math.round(ey) - S(2), S(2.4), S(2.4));
        ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(ex) - S(1) + 1, Math.round(ey) - S(2), 1, 1);
        if (sp.staffTop === 'skull') { ctx.fillStyle = PAL.bone; ctx.fillRect(Math.round(ex) - S(1.5), Math.round(ey) + S(0.4), S(3), S(1.2)); }
      }
    }
    drawArm();
  } else drawArm();
  // shield in front
  if (sp.shield) {
    const sc = sp.shield, sx = -5.4, sy = 8;
    R(sx, sy, 3.4, 6.4, sc); R(sx, sy, 3.4, 0.8, shade(sc, 1.3)); R(sx + 2.6, sy, 0.8, 6.4, shade(sc, 0.7));
    R(sx + 0.6, sy + 5.6, 2.2, 1.2, sc);
    if (sp.shieldEm === 'cross') { R(sx + 1.2, sy + 1.2, 0.9, 4, PAL.gold); R(sx + 0.4, sy + 2.4, 2.6, 0.9, PAL.gold); }
    if (sp.shieldEm === 'sun') { R(sx + 0.9, sy + 2, 1.6, 1.6, PAL.gold); }
    if (sp.shieldEm === 'skull') { R(sx + 0.8, sy + 2, 1.8, 1.6, PAL.bone); }
    if (sp.shieldEm === 'band') { R(sx, sy + 2.6, 3.4, 1, PAL.iron); }
  }
  if (anim === 'cast' && sp.castGlow) {
    ctx.fillStyle = sp.castGlow; ctx.globalAlpha = 0.9;
    ctx.fillRect(hX - 1, hY - 2 - (f % 2), 3, 3); ctx.globalAlpha = 1;
  }
}

function drawHorse(ctx, sp, cw, ch, anim, f) {
  const H = sp.H, k = H / 22;
  const base = ch - 1, cx = Math.floor(cw / 2);
  const hc = sp.mount.color, hd = shade(hc, 0.7), hl = shade(hc, 1.2);
  const S = v => Math.max(1, Math.round(v * k));
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(cx + Math.round(x * k), base - Math.round(y * k), S(w), S(h)); };
  const gait = anim === 'walk' ? f % 4 : (anim === 'atk' ? 1 : 0);
  const legOff = [[0, 1, 0, -1], [1, 0, -1, 0], [0, -1, 0, 1], [-1, 0, 1, 0]][gait];
  // legs
  const legsX = [-7, -5, 4, 6];
  legsX.forEach((lx, i) => { R(lx + legOff[i] * 0.8, 6, 1.4, 6 - Math.abs(legOff[i]) * 0.5, i % 2 ? hd : hc); R(lx + legOff[i] * 0.8, 1, 1.4, 1, '#1a1612'); });
  // body
  R(-8.5, 11, 16, 5.4, hc); R(-8.5, 11, 16, 1.2, hl); R(-8.5, 7, 16, 1.2, hd);
  // tail
  R(-10.5, 10.5, 2, 4, hd); R(-11, 7.5, 1.4, 3, hd);
  // neck & head
  R(6, 14.5, 3, 6, hc); R(7.6, 16, 4, 2.6, hc); R(10.6, 15, 1.6, 1.6, hd); R(6, 15, 1, 6, hd);
  R(9.4, 17, 0.8, 0.8, '#0a0a0a');
  if (sp.mount.mane) R(5.6, 17, 1.2, 6, sp.mount.mane);
  if (sp.mount.barding) { R(-6, 12, 12, 4.5, sp.mount.barding); R(-6, 8.5, 12, 1, shade(sp.mount.barding, 0.7)); R(6.6, 18.5, 3.5, 1.4, sp.mount.barding); if (sp.mount.em) R(-1, 11, 2, 2, PAL.gold); }
  if (sp.mount.bony) { for (let i = -6; i < 6; i += 2) R(i, 10.5, 0.9, 3, '#1a1714'); R(9.4, 17, 0.8, 0.8, PAL.necro); }
}

// Generate full sprite set for a humanoid spec
function buildHumanoidSet(name, sp) {
  const H = sp.H || 22;
  const k = H / 22;
  const mounted = !!sp.mount;
  const cw = Math.round((mounted ? 34 : 26) * k * (sp.bulk || 1)) + (sp.wings ? Math.round(12 * k) : 0) + (sp.weapon === 'lance' || sp.weapon === 'spear' ? Math.round(8 * k) : 0);
  const ch = H + Math.round((mounted ? 18 : 9) * k) + 2;
  const anims = { idle: 2, walk: 4, atk: 3, cast: 2 };
  const set = { name, w: cw, h: ch, frames: {}, white: {}, H, flying: !!sp.flying, sp };
  for (const a in anims) {
    set.frames[a] = [];
    for (let f = 0; f < anims[a]; f++) {
      const [c, ctx] = makeCanvas(cw, ch);
      if (mounted) {
        drawHorse(ctx, sp, cw, ch, a, f);
        const rider = Object.assign({}, sp, { noLegs: true, mountYOff: -Math.round(9 * k), mount: null });
        drawHumanoid(ctx, rider, cw, ch, a, f);
        // legs over horse flank
        ctx.fillStyle = sp.legs || shade(sp.body, 0.8);
        ctx.fillRect(Math.floor(cw / 2) - Math.round(1 * k), ch - 1 - Math.round(12 * k), Math.max(1, Math.round(2 * k)), Math.round(5 * k));
      } else drawHumanoid(ctx, sp, cw, ch, a, f);
      shadeCanvas(c, H >= 28 ? 0.1 : 0.05, name.length * 7 + f);
      outlineCanvas(c);
      set.frames[a].push(c);
    }
  }
  finalizeSet(set);
  SPR[name] = set;
  return set;
}

function finalizeSet(set) { set.icon = set.frames.idle[0]; }

function makeCorpse(src, set) {
  // lie the sprite down, darken, add blood pool
  const r = rotated90(src);
  const [c, ctx] = makeCanvas(r.width + 6, r.height + 4);
  // blood pool
  ctx.fillStyle = set.sp && set.sp.bloodless ? 'rgba(80,80,70,0.5)' : PAL.bloodD;
  const pw = Math.round(r.width * 0.7), ph = Math.max(3, Math.round(r.height * 0.5));
  for (let y = 0; y < ph; y++) {
    const w = Math.round(pw * Math.sin((y + 0.5) / ph * Math.PI));
    ctx.fillRect(Math.round(3 + (r.width - w) / 2 + (y % 2)), 2 + Math.round((r.height - ph) / 2) + y, w, 1);
  }
  ctx.globalAlpha = 1;
  ctx.drawImage(r, 3, 2);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(10,8,8,0.35)'; ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

function getWhite(set, anim, f) {
  const key = anim + f;
  if (!set.white[key]) set.white[key] = tintCanvas(set.frames[anim][f], '#ffffff');
  return set.white[key];
}

// ------------------------------------------------------------
// Bespoke sprites: dragon, siege engines, towers, keep, props
// ------------------------------------------------------------
function buildDragonSet(name, opt) {
  const k = opt.k || 1;
  const W = Math.round(72 * k), Hh = Math.round(56 * k);
  const set = { name, w: W, h: Hh, frames: { idle: [], walk: [], atk: [], cast: [] }, white: {}, H: Math.round(40 * k), flying: true, sp: { bloodless: opt.bony } };
  const body = opt.body, bodyD = shade(body, 0.6), bodyL = shade(body, 1.25);
  for (let f = 0; f < 4; f++) {
    const [c, ctx0] = makeCanvas(W, Hh);
    const R = (x, y, w, h, col) => { ctx0.fillStyle = col; ctx0.fillRect(Math.round(x * k), Math.round(y * k), Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))); };
    const flap = [0, -8, -14, -6][f];
    // far wing
    for (let i = 0; i < 20; i++) {
      const y0 = 22 + flap * (i / 20) - i * 0.5;
      R(26 - i, y0, 1, 10 - i * 0.35, i % 4 === 0 ? (opt.bony ? PAL.bone : bodyD) : shade(opt.wing, 0.7));
    }
    // tail
    for (let i = 0; i < 16; i++) R(16 - i, 34 + Math.sin(i * 0.5 + f) * 2, 3 - i * 0.15, 3 - i * 0.12, i % 3 ? body : bodyD);
    // body
    R(18, 26, 24, 12, body); R(18, 26, 24, 2, bodyL); R(18, 36, 24, 2, bodyD);
    if (opt.bony) { for (let i = 0; i < 6; i++) R(22 + i * 3, 29, 1.4, 6, '#140f0f'); R(20, 28, 20, 1, PAL.bone); }
    else { for (let i = 0; i < 6; i++) R(21 + i * 3, 34, 2, 2, opt.belly || PAL.fireD); }
    // legs
    R(22, 37, 3, 5, bodyD); R(36, 37, 3, 5, bodyD); R(21, 41, 4, 1, PAL.boneD); R(35, 41, 4, 1, PAL.boneD);
    // neck
    for (let i = 0; i < 10; i++) R(40 + i * 1.4, 28 - i * 1.3, 4, 4, i % 3 ? body : bodyL);
    // head
    R(52, 13, 9, 6, body); R(58, 15, 7, 4, body); R(52, 13, 9, 1.4, bodyL);
    R(56, 14, 2, 1.4, opt.eye); R(63, 18, 2, 1, '#111');
    R(51, 10, 2, 4, PAL.bone); R(54, 9, 2, 4, PAL.boneD);
    if (f === 2 || opt.mouthGlow) R(62, 18.5, 3, 1.2, opt.eye);
    // near wing
    for (let i = 0; i < 26; i++) {
      const y0 = 24 + flap * (i / 26) * 1.2 - i * 0.6;
      R(30 + i * 0.25 - i, y0, 1, 13 - i * 0.42, i % 4 === 0 ? (opt.bony ? PAL.bone : bodyD) : opt.wing);
    }
    R(30, 22 + flap * 0.05, 3, 4, bodyD);
    shadeCanvas(c, 0.1, f + 3);
    outlineCanvas(c);
    set.frames.idle.push(c); set.frames.walk.push(c); set.frames.cast.push(c);
    if (f < 3) set.frames.atk.push(c);
  }
  set.frames.idle = set.frames.idle.slice(0, 4);
  finalizeSet(set);
  SPR[name] = set;
}

function buildRamSet() {
  const W = 40, Hh = 30;
  const set = { name: 'ram', w: W, h: Hh, frames: { idle: [], walk: [], atk: [], cast: [] }, white: {}, H: 22, sp: { bloodless: true } };
  for (let f = 0; f < 4; f++) {
    const [c, ctx] = makeCanvas(W, Hh);
    const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
    const push = [0, 2, 4, 1][f];
    // wheels
    [6, 16, 26].forEach((wx, i) => { R(wx, 24, 5, 5, PAL.woodD); R(wx + 1, 25, 3, 3, PAL.wood); R(wx + 2, 26 + ((f + i) % 2 ? 0 : -1) + 1, 1, 1, '#222'); });
    // frame
    R(4, 14, 30, 10, PAL.woodD); R(5, 15, 28, 8, PAL.wood);
    // roof (hides)
    R(2, 8, 34, 6, '#4b3a2c'); R(4, 6, 30, 3, '#5d4836'); R(8, 4, 22, 3, '#6c5642');
    for (let i = 0; i < 34; i += 4) R(2 + i, 13, 2, 1, '#2c2118');
    // ram log
    R(8 + push, 17, 28, 4, '#5a3e26'); R(8 + push, 17, 28, 1, '#7a5636');
    R(34 + push, 16, 5, 6, PAL.iron); R(37 + push, 17, 2, 4, PAL.ironL);
    // banner
    R(18, 0, 1, 5, PAL.woodD); R(19, 0, 4, 3, '#8a1d1d');
    outlineCanvas(c);
    set.frames.walk.push(c); if (f < 2) set.frames.idle.push(c); if (f < 3) set.frames.atk.push(c); if (f < 2) set.frames.cast.push(c);
  }
  set.frames.atk = [set.frames.walk[0], set.frames.walk[2], set.frames.walk[1]];
  finalizeSet(set); SPR.ram = set;
}

function buildCatapultSet() {
  const W = 40, Hh = 34;
  const set = { name: 'catapult', w: W, h: Hh, frames: { idle: [], walk: [], atk: [], cast: [] }, white: {}, H: 22, sp: { bloodless: true } };
  const draw = (armAng, f) => {
    const [c, ctx] = makeCanvas(W, Hh);
    const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
    [7, 27].forEach(wx => { R(wx, 27, 6, 6, PAL.woodD); R(wx + 1, 28, 4, 4, PAL.wood); R(wx + 2 + (f % 2), 29, 1, 1, '#222'); });
    R(4, 23, 32, 4, PAL.woodD); R(5, 23, 30, 1, PAL.wood);
    R(18, 13, 3, 11, PAL.woodD); R(14, 20, 11, 2, PAL.wood);
    const rad = armAng * Math.PI / 180;
    pline(ctx, 19, 15, 19 + Math.cos(rad) * 16, 15 + Math.sin(rad) * 16, '#7a5636', 2);
    const bx = Math.round(19 + Math.cos(rad) * 16), by = Math.round(15 + Math.sin(rad) * 16);
    R(bx - 2, by - 2, 4, 3, PAL.leatherD);
    if (armAng > 100) R(bx - 1, by - 3, 3, 3, PAL.stoneL);
    R(5, 18, 6, 5, PAL.stoneD);
    outlineCanvas(c); return c;
  };
  set.frames.idle = [draw(160, 0), draw(160, 0)];
  set.frames.walk = [draw(160, 0), draw(160, 1), draw(160, 0), draw(160, 1)];
  set.frames.atk = [draw(170, 0), draw(-70, 0), draw(-10, 0)];
  set.frames.cast = set.frames.idle;
  finalizeSet(set); SPR.catapult = set;
}

// ---------------- Towers ----------------
// Each tower: frames[tier] = array of animation frames (canvas 28x44ish)
const TOWER_ART = {};
function stoneBase(ctx, x, y, w, h, tone = PAL.stone, rng) {
  ctx.fillStyle = shade(tone, 0.7); ctx.fillRect(x, y, w, h);
  // bricks
  for (let row = 0; row < h; row += 3) {
    const off = (row / 3) % 2 ? 2 : 0;
    for (let col = -off; col < w; col += 5) {
      const bx = x + Math.max(0, col), bw = Math.min(4, w - Math.max(0, col)) - (col < 0 ? -col : 0);
      if (bw <= 0) continue;
      const t = rng ? rng() : Math.random();
      ctx.fillStyle = t < 0.3 ? shade(tone, 0.9) : t < 0.8 ? tone : shade(tone, 1.15);
      ctx.fillRect(bx, y + row, bw, 2);
    }
  }
  ctx.fillStyle = shade(tone, 1.35); ctx.fillRect(x, y, w, 1);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + w - 2, y, 2, h);
}

function buildTowerArt() {
  const defs = {
    brimstone: { tone: '#4a3c36', accent: PAL.fire, glow: PAL.fireL },
    tesla: { tone: '#3f454c', accent: '#7fd8ff', glow: '#e8fbff' },
    necrotic: { tone: '#2c2a33', accent: PAL.necro, glow: '#c8ffd0' },
    frost: { tone: '#4d5862', accent: PAL.frost, glow: '#ffffff' },
    artillery: { tone: '#4a463f', accent: PAL.bone, glow: PAL.white },
    harvester: { tone: '#2f2d38', accent: '#7dffb0', glow: '#e3fff0' },
    arcane: { tone: '#38304a', accent: PAL.arcane, glow: '#f0dcff' },
    abomination: { tone: '#4a3a36', accent: '#9b5a4a', glow: '#ff5a3a' },
  };
  for (const type in defs) {
    TOWER_ART[type] = [];
    for (let tier = 0; tier < 3; tier++) {
      const frames = [];
      for (let f = 0; f < 4; f++) {
        const rng = makeRng(type.length * 31 + tier * 7);
        const W = 32, Hh = 52;
        const [c, ctx] = makeCanvas(W, Hh);
        paintTowerArt(ctx, type, tier, f, defs[type], rng, W, Hh);
        outlineCanvas(c);
        frames.push(c);
      }
      TOWER_ART[type].push(frames);
    }
  }
}

function paintTowerArt(ctx, type, tier, f, d, rng, W, Hh) {
  const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); };
  const by = Hh - 1; // ground
  const extra = tier * 4;
  if (type === 'abomination') {
    // living mound of flesh
    const s = 1 + tier * 0.15;
    const bw = Math.round(22 * s), bh = Math.round(16 * s);
    const x0 = Math.round((W - bw) / 2), y0 = by - bh;
    const pulse = f % 2;
    for (let y = 0; y < bh; y++) {
      const ww = Math.round(bw * Math.sin((y + 1) / (bh + 1) * Math.PI * 0.5 + 0.5));
      R(x0 + (bw - ww) / 2 - pulse * 0.5, y0 + y, ww + pulse, 1, y < 3 ? '#a87262' : y % 4 === 0 ? '#6e4038' : '#8a5548');
    }
    // stitches & maw
    for (let i = 0; i < 4; i++) R(x0 + 4 + i * 4, y0 + 6 + (i % 2), 2, 1, '#2a1414');
    R(W / 2 - 4, y0 + 9, 8, 4 + pulse, '#1c0606'); for (let i = 0; i < 4; i++) R(W / 2 - 4 + i * 2, y0 + 9, 1, 2, PAL.bone);
    R(W / 2 - 2, y0 + 3, 1.5, 1.5, '#ff5a3a'); R(W / 2 + 2, y0 + 4, 1.5, 1.5, '#ff5a3a');
    // tentacle arms
    const sw = [0, 2, 0, -2][f];
    for (let i = 0; i < 8 + tier * 2; i++) { R(x0 - 1 - i * 0.6, y0 + 8 - i + sw * i / 8, 2, 2, i % 2 ? '#8a5548' : '#6e4038'); R(x0 + bw - 1 + i * 0.6, y0 + 8 - i - sw * i / 8, 2, 2, i % 2 ? '#8a5548' : '#6e4038'); }
    if (tier >= 1) { for (let i = 0; i < 3; i++) R(x0 + 3 + i * 6, y0 - 2, 1, 3, PAL.bone); }
    if (tier >= 2) { R(W / 2 - 1, y0 - 6, 2, 6, PAL.boneD); R(W / 2 - 3, y0 - 8, 6, 3, PAL.bone); R(W / 2 - 2, y0 - 7, 1, 1, '#ff5a3a'); R(W / 2 + 1, y0 - 7, 1, 1, '#ff5a3a'); }
    return;
  }
  // stone foundation
  const baseW = 22 + tier * 2, baseH = 6;
  const bx = Math.round((W - baseW) / 2);
  stoneBase(ctx, bx, by - baseH, baseW, baseH, shade(d.tone, 0.9), rng);
  if (type === 'arcane') {
    // floating stones and portal
    const h = 18 + extra;
    stoneBase(ctx, bx + 3, by - baseH - 4, baseW - 6, 4, d.tone, rng);
    const cy = by - baseH - 12 - extra, cx = W / 2;
    const r = 6 + tier * 2;
    for (let a = 0; a < 24; a++) {
      const ang = a / 24 * TAU + f * 0.25;
      R(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r * 1.2, 1.4, 1.4, a % 3 === 0 ? d.glow : d.accent);
    }
    R(cx - r * 0.5, cy - r * 0.6, r, r * 1.2, '#140a22');
    R(cx - 1, cy - 1, 2, 2, d.glow);
    for (let i = 0; i < 3 + tier; i++) {
      const ang = i / (3 + tier) * TAU + f * 0.4;
      R(cx + Math.cos(ang) * (r + 5) - 1.5, cy + Math.sin(ang) * (r + 3) - 1, 3, 3, d.tone); R(cx + Math.cos(ang) * (r + 5) - 1.5, cy + Math.sin(ang) * (r + 3) - 1, 3, 1, shade(d.tone, 1.4));
    }
    return;
  }
  const colW = type === 'tesla' ? 8 + tier * 2 : 12 + tier * 2;
  const colH = (type === 'artillery' ? 8 : type === 'harvester' ? 22 : 18) + extra;
  const cx0 = Math.round((W - colW) / 2);
  const topY = by - baseH - colH;
  if (type === 'tesla') {
    R(cx0, topY, colW, colH, '#2e3238');
    for (let i = 0; i < colH; i += 3) { R(cx0 - 1, topY + i, colW + 2, 1, '#b87333'); }
    R(cx0, topY, 1, colH, '#4a5058');
    const r = 4 + tier;
    R(W / 2 - r, topY - r * 2, r * 2, r * 2, '#2f3b46');
    R(W / 2 - r + 1, topY - r * 2 + 1, r * 2 - 2, r * 2 - 2, f % 2 ? '#bff2ff' : '#7fd8ff');
    R(W / 2 - 1, topY - r - 1, 2, 2, '#ffffff');
    // sparks
    for (let i = 0; i < 2 + tier; i++) { const a = (f * 1.7 + i * 2.1); R(W / 2 + Math.cos(a) * (r + 3), topY - r + Math.sin(a) * (r + 2), 1, 1, '#e8fbff'); }
    if (tier >= 1) { R(cx0 - 4, topY + 4, 2, 6, '#b87333'); R(cx0 + colW + 2, topY + 4, 2, 6, '#b87333'); R(cx0 - 4, topY + 3, 2, 1, '#bff2ff'); R(cx0 + colW + 2, topY + 3, 2, 1, '#bff2ff'); }
    if (tier >= 2) { for (let i = 0; i < 4; i++) R(W / 2 - 7 + i * 4, topY - r * 2 - 3, 1, 3, '#b87333'); }
    return;
  }
  if (type === 'necrotic') {
    // twisted spire
    for (let y = 0; y < colH + 8; y++) {
      const t = y / (colH + 8);
      const w = Math.max(2, Math.round(colW * (0.35 + t * 0.65)));
      const tw = Math.round(Math.sin(y * 0.5) * 1.5);
      R(W / 2 - w / 2 + tw, topY - 8 + y, w, 1, y % 5 === 0 ? '#16141a' : (y % 2 ? d.tone : shade(d.tone, 1.2)));
    }
    const cy = topY - 12 - tier * 2;
    const cs = 3 + tier;
    R(W / 2 - cs / 2, cy - cs, cs, cs * 2, f % 2 ? '#a8ffb6' : d.accent);
    R(W / 2 - cs / 2, cy - cs, 1, cs * 2, '#e8ffec');
    for (let i = 0; i < 2 + tier; i++) R(W / 2 - 6 + i * 5, topY - 2 - (i % 2) * 3, 1, 4, PAL.bone);
    if (tier >= 1) { R(W / 2 - 3, topY + 4, 6, 4, PAL.bone); R(W / 2 - 2, topY + 5, 1, 1, '#0a0a0a'); R(W / 2 + 1, topY + 5, 1, 1, '#0a0a0a'); }
    if (tier >= 2) { for (let a = 0; a < 6; a++) { const ang = a / 6 * TAU + f * 0.5; R(W / 2 + Math.cos(ang) * 8, cy + Math.sin(ang) * 4, 1, 1, d.accent); } }
    return;
  }
  // standard column
  stoneBase(ctx, cx0, topY, colW, colH, d.tone, rng);
  // windows
  if (colH > 10) { R(W / 2 - 1, topY + 5, 2, 3, '#0b0b0d'); R(W / 2 - 1, topY + 6, 2, 1, type === 'frost' ? '#9fe6ff' : type === 'harvester' ? '#7dffb0' : '#ff8a1e'); }
  // battlement
  const bw = colW + 4, bxx = Math.round((W - bw) / 2);
  R(bxx, topY - 2, bw, 3, shade(d.tone, 1.1));
  for (let i = 0; i < bw; i += 3) R(bxx + i, topY - 4, 2, 2, shade(d.tone, 1.2));
  if (type === 'brimstone') {
    // brazier with fire
    R(W / 2 - 5 - tier, topY - 8, 10 + tier * 2, 4, '#2a2220'); R(W / 2 - 5 - tier, topY - 8, 10 + tier * 2, 1, '#5a4a40');
    const fh = 6 + tier * 3;
    for (let i = 0; i < 9 + tier * 2; i++) {
      const fx = W / 2 - 4 - tier + i, h = fh * (0.5 + 0.5 * Math.abs(Math.sin(i * 1.7 + f * 1.3)));
      R(fx, topY - 8 - h, 1, h, PAL.fireD); R(fx, topY - 8 - h * 0.7, 1, h * 0.7, PAL.fire); R(fx, topY - 8 - h * 0.35, 1, h * 0.35, PAL.fireL);
    }
    if (tier >= 1) { R(bxx - 1, topY + 2, 2, 6, '#5a1e10'); R(bxx + bw - 1, topY + 2, 2, 6, '#5a1e10'); }
    if (tier >= 2) { R(W / 2 - 1, topY + 9, 2, 2, PAL.fireL); R(cx0 - 2, topY - 2, 2, 2, PAL.fire); R(cx0 + colW, topY - 2, 2, 2, PAL.fire); }
  } else if (type === 'frost') {
    const cs = 4 + tier * 2;
    R(W / 2 - cs / 2, topY - 6 - cs * 2, cs, cs * 2, PAL.frost);
    R(W / 2 - cs / 2, topY - 6 - cs * 2, 1, cs * 2, '#ffffff');
    R(W / 2 - cs / 2 - 2, topY - 6 - cs, 2, cs, PAL.frostD); R(W / 2 + cs / 2, topY - 6 - cs, 2, cs, PAL.frostD);
    if (f % 2) R(W / 2, topY - 7 - cs * 2, 1, 1, '#fff');
    for (let i = 0; i < bw; i += 2) R(bxx + i, topY + 1, 1, 1 + (i % 3), '#cfefff');
    if (tier >= 2) { R(W / 2 - 9, topY - 10, 2, 6, PAL.frost); R(W / 2 + 7, topY - 10, 2, 6, PAL.frost); }
  } else if (type === 'artillery') {
    // bone ballista
    const ang = [-20, -24, -20, -16][f];
    const rad = ang * Math.PI / 180;
    const len = 12 + tier * 3;
    pline(ctx, W / 2 - 4, topY - 5, W / 2 - 4 + Math.cos(rad) * len, topY - 5 + Math.sin(rad) * len, PAL.boneD, 2);
    // bow arms (ribs)
    const tx = W / 2 - 4 + Math.cos(rad) * len * 0.7, ty = topY - 5 + Math.sin(rad) * len * 0.7;
    pline(ctx, tx, ty, tx - 3, ty - 7 - tier, PAL.bone, 1); pline(ctx, tx, ty, tx + 3, ty + 6 + tier, PAL.bone, 1);
    pline(ctx, tx - 3, ty - 7 - tier, W / 2 - 3, topY - 4, '#ddd', 1); pline(ctx, tx + 3, ty + 6 + tier, W / 2 - 3, topY - 4, '#ddd', 1);
    R(W / 2 - 6, topY - 4, 6, 4, PAL.woodD);
    R(W / 2 - 8, topY - 3, 3, 3, PAL.bone); R(W / 2 - 7, topY - 2, 1, 1, '#000');
    if (tier >= 1) { for (let i = 0; i < 3; i++) R(bxx + 1 + i * 2, topY + 2, 1, 4, PAL.bone); }
  } else if (type === 'harvester') {
    // obelisk with orbiting souls
    R(W / 2 - 3, topY - 12 - tier * 3, 6, 12 + tier * 3, '#25232c'); R(W / 2 - 3, topY - 12 - tier * 3, 1, 12 + tier * 3, '#3d3a48');
    R(W / 2 - 2, topY - 15 - tier * 3, 4, 3, '#25232c'); R(W / 2 - 1, topY - 17 - tier * 3, 2, 2, '#25232c');
    for (let i = 0; i < 4; i++) R(W / 2 - 1, topY - 10 + i * 3 - tier * 3, 2, 1, d.accent);
    for (let i = 0; i < 3 + tier; i++) { const a = i / (3 + tier) * TAU + f * 0.6; R(W / 2 + Math.cos(a) * 9, topY - 8 - tier * 2 + Math.sin(a) * 4, 2, 2, i % 2 ? d.accent : '#d8ffe8'); }
  }
}

// ---------------- Keep ----------------
function buildKeepArt(theme) {
  const W = 120, Hh = 116;
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const [c, ctx] = makeCanvas(W, Hh);
    const rng = makeRng(777);
    const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };
    const tone = theme.keepTone || '#3b3b41';
    // curtain wall
    stoneBase(ctx, 6, 66, 108, 48, shade(tone, 0.9), rng);
    for (let i = 6; i < 114; i += 6) R(i, 62, 4, 4, shade(tone, 1.15));
    R(6, 66, 108, 2, shade(tone, 1.3));
    // gate
    R(50, 88, 20, 26, '#0c0c0e'); R(52, 90, 16, 24, '#2a1d14');
    for (let i = 0; i < 4; i++) R(54 + i * 4, 90, 1, 24, '#1a120c');
    R(50, 86, 20, 3, shade(tone, 1.2));
    // corner towers
    [[0, 44], [96, 44]].forEach(([tx, ty]) => {
      stoneBase(ctx, tx, ty, 24, 70, tone, rng);
      for (let i = 0; i < 24; i += 5) R(tx + i, ty - 4, 3, 4, shade(tone, 1.2));
      R(tx + 10, ty + 14, 4, 6, '#09090b'); R(tx + 10, ty + 16, 4, 2, theme.windowGlow || PAL.necro);
      R(tx + 10, ty + 34, 4, 6, '#09090b'); R(tx + 10, ty + 36, 4, 2, theme.windowGlow || PAL.necro);
    });
    // central donjon
    stoneBase(ctx, 34, 18, 52, 50, shade(tone, 1.05), rng);
    for (let i = 34; i < 86; i += 5) R(i, 14, 3, 4, shade(tone, 1.25));
    // spire
    R(52, 0, 16, 20, shade(tone, 0.8));
    for (let y = 0; y < 10; y++) R(60 - y * 0.8, y - 2, y * 1.6 + 1, 1, '#25252a');
    // phylactery window with green glow
    R(54, 28, 12, 18, '#060608');
    const g = f % 2 ? '#8dffa0' : PAL.necro;
    R(57, 31, 6, 12, PAL.necroD); R(58, 33, 4, 8, g); R(59, 35, 2, 3, '#efffef');
    // windows
    [40, 74].forEach(wx => { R(wx, 34, 4, 7, '#09090b'); R(wx, 37, 4, 2, theme.windowGlow || PAL.necro); });
    // banners
    [[38, 48], [78, 48]].forEach(([bx, byy]) => { R(bx, byy, 5, 14, '#1f3a24'); R(bx, byy, 5, 1, '#0d1a10'); R(bx + 1, byy + 4, 3, 3, PAL.bone); R(bx + 1, byy + 13, 1, 2, '#1f3a24'); R(bx + 3, byy + 13, 1, 2, '#1f3a24'); });
    // skulls on wall
    for (let i = 0; i < 6; i++) { R(12 + i * 18, 72, 3, 3, PAL.bone); R(13 + i * 18, 73, 1, 1, '#111'); }
    // cracks & moss
    for (let i = 0; i < 18; i++) { R(Math.floor(rng() * 110) + 5, Math.floor(rng() * 50) + 60, 1, 2 + Math.floor(rng() * 3), '#1b1b1f'); }
    for (let i = 0; i < 14; i++) { R(Math.floor(rng() * 110) + 5, 108 + Math.floor(rng() * 6), 2, 1, '#3a4a2c'); }
    outlineCanvas(c);
    frames.push(c);
  }
  return frames;
}

function buildLichSet() {
  // The Lich himself: tall skeletal sorcerer, elaborate robes, crown, green flame
  return buildHumanoidSet('lich', {
    H: 30, head: 'skull', eyes: PAL.necro, body: '#1c1824', robe: true, cape: '#2a1430', armor: '#3e3448', tabard: '#2e5c34', emblem: 'skull',
    weapon: 'staff', orb: PAL.necro, staffTop: 'skull', staffC: '#2b2420', bony: true, castGlow: PAL.necro, trim: PAL.gold,
  });
}

function buildSoulWellArt() {
  const frames = [];
  for (let f = 0; f < 6; f++) {
    const [c, ctx] = makeCanvas(40, 34);
    const R = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
    // ring of stones
    for (let a = 0; a < 28; a++) {
      const ang = a / 28 * TAU;
      const x = 20 + Math.cos(ang) * 15, y = 22 + Math.sin(ang) * 8;
      R(x - 2, y - 2, 4, 4, a % 3 ? PAL.stone : PAL.stoneL);
    }
    R(8, 20, 24, 6, '#062010');
    for (let i = 0; i < 18; i++) {
      const ang = i / 18 * TAU + f * 0.35;
      R(20 + Math.cos(ang) * (4 + (i % 3) * 3), 23 + Math.sin(ang) * (2 + (i % 3)), 2, 1, i % 2 ? PAL.necro : '#b6ffc4');
    }
    R(18, 22, 4, 2, '#eaffea');
    // pillars
    R(4, 6, 3, 18, PAL.stoneD); R(33, 6, 3, 18, PAL.stoneD); R(3, 4, 34, 3, PAL.stone); R(3, 4, 34, 1, PAL.stoneL);
    R(18, 0, 4, 4, PAL.bone); R(19, 1, 1, 1, '#000'); R(21, 1, 1, 1, '#000');
    // rising wisps
    for (let i = 0; i < 3; i++) R(14 + i * 6, 16 - ((f + i * 2) % 6) * 2, 1, 2, PAL.necro);
    outlineCanvas(c);
    frames.push(c);
  }
  return frames;
}

// --------- small pixel icons (16x16) for spells / ui ----------
const ICONS = {};
function buildIcons() {
  const mk = (name, fn) => { const [c, ctx] = makeCanvas(16, 16); fn((x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); }, ctx); outlineCanvas(c); ICONS[name] = c; };
  mk('deathwave', R => { for (let r = 2; r <= 7; r += 2.5) for (let a = 0; a < 20; a++) { const ang = a / 20 * TAU; R(Math.round(8 + Math.cos(ang) * r), Math.round(8 + Math.sin(ang) * r), 1, 1, r > 5 ? PAL.necroD : PAL.necro); } R(7, 7, 2, 2, '#efffef'); });
  mk('meteor', R => { for (let i = 0; i < 7; i++) R(2 + i, 2 + i, 2, 2, i < 3 ? PAL.fireD : PAL.fire); R(9, 9, 5, 5, PAL.fireD); R(10, 9, 3, 3, PAL.fireL); R(10, 10, 2, 2, '#fff6c0'); });
  mk('raise', R => { R(5, 3, 6, 5, PAL.bone); R(6, 5, 1, 1, '#000'); R(9, 5, 1, 1, '#000'); R(6, 8, 4, 1, PAL.boneD); R(2, 12, 12, 2, PAL.necroD); R(4, 10, 1, 3, PAL.bone); R(11, 10, 1, 3, PAL.bone); R(3, 14, 10, 1, PAL.necro); });
  mk('prison', R => { R(3, 3, 10, 1, PAL.arcane); R(3, 12, 10, 1, PAL.arcane); for (let i = 3; i < 13; i += 3) R(i, 3, 1, 10, PAL.arcaneD); R(6, 6, 4, 4, '#ffd0ff'); });
  mk('time', R => { R(4, 2, 8, 1, PAL.gold); R(4, 13, 8, 1, PAL.gold); R(5, 3, 6, 3, '#9fe6ff'); R(7, 6, 2, 3, '#9fe6ff'); R(5, 10, 6, 3, '#9fe6ff'); R(6, 11, 4, 2, PAL.frostD); });
  mk('blood', R => { R(7, 2, 2, 2, PAL.blood); R(6, 4, 4, 3, PAL.blood); R(5, 7, 6, 5, PAL.blood); R(6, 12, 4, 1, PAL.bloodD); R(6, 7, 1, 3, '#d04040'); });
  mk('resurrect', R => { R(7, 2, 2, 12, PAL.necro); R(4, 5, 8, 2, PAL.necro); R(7, 2, 1, 12, '#dfffe5'); R(3, 13, 10, 1, PAL.necroD); });
  mk('apocalypse', R => { R(4, 4, 8, 8, PAL.fireD); R(5, 5, 6, 6, PAL.fire); R(6, 6, 4, 4, PAL.fireL); for (let a = 0; a < 8; a++) { const ang = a / 8 * TAU; R(Math.round(8 + Math.cos(ang) * 6.5), Math.round(8 + Math.sin(ang) * 6.5), 1, 1, PAL.necro); } });
  mk('soul', R => { R(6, 3, 4, 2, PAL.necro); R(5, 5, 6, 5, PAL.necro); R(6, 10, 4, 3, PAL.necroD); R(6, 6, 1, 1, '#000'); R(9, 6, 1, 1, '#000'); R(7, 1, 1, 2, PAL.necroD); });
  mk('essence', R => { R(7, 2, 2, 2, '#ff6a8a'); R(5, 4, 6, 6, '#c22a52'); R(6, 10, 4, 2, '#7a1030'); R(7, 12, 2, 2, '#4a0a20'); R(6, 5, 1, 3, '#ffc0d0'); });
  mk('keep', R => { R(2, 6, 12, 8, PAL.stone); R(2, 4, 2, 2, PAL.stone); R(7, 4, 2, 2, PAL.stone); R(12, 4, 2, 2, PAL.stone); R(6, 10, 4, 4, '#111'); R(7, 7, 2, 2, PAL.necro); });
  mk('skull', R => { R(4, 3, 8, 7, PAL.bone); R(5, 10, 6, 3, PAL.boneD); R(5, 6, 2, 2, '#000'); R(9, 6, 2, 2, '#000'); R(6, 11, 1, 1, '#000'); R(9, 11, 1, 1, '#000'); });
  mk('wall', R => { for (let y = 4; y < 14; y += 3) for (let x = 1 + ((y / 3) % 2) * 2; x < 15; x += 5) R(x, y, 4, 2, PAL.stoneL); });
  mk('spikes', R => { for (let i = 0; i < 4; i++) { R(2 + i * 3, 6, 2, 8, PAL.wood); R(2 + i * 3, 4, 1, 2, PAL.boneD); } R(1, 11, 14, 1, PAL.woodD); });
  mk('lava', R => { R(2, 5, 12, 8, '#3a0e04'); R(3, 6, 10, 6, PAL.fireD); R(5, 7, 5, 3, PAL.fire); R(6, 8, 2, 1, PAL.fireL); });
  mk('rune', R => { for (let a = 0; a < 16; a++) { const ang = a / 16 * TAU; R(Math.round(8 + Math.cos(ang) * 5), Math.round(8 + Math.sin(ang) * 3), 1, 1, PAL.necro); } R(7, 5, 2, 6, PAL.necroD); R(5, 7, 6, 1, PAL.necroD); });
  mk('ward', R => { R(3, 3, 10, 10, '#203a50'); R(4, 4, 8, 8, '#4aa8ff'); R(6, 6, 4, 4, '#dff'); });
  mk('oil', R => { R(4, 4, 8, 9, '#2a2420'); R(5, 3, 6, 2, '#5a4a40'); R(5, 6, 6, 3, '#d0a040'); R(6, 13, 1, 2, '#d0a040'); });
  mk('cauldron', R => { R(3, 6, 10, 7, '#262a20'); R(4, 5, 8, 2, '#7fff5a'); R(6, 3, 1, 2, '#7fff5a'); R(9, 2, 1, 2, '#7fff5a'); R(4, 13, 2, 2, '#262a20'); R(10, 13, 2, 2, '#262a20'); });
  mk('level', R => { R(7, 1, 2, 14, PAL.gold); R(3, 5, 10, 2, PAL.gold); R(7, 1, 1, 14, PAL.holy); });
  mk('heal', R => { R(6, 2, 4, 12, PAL.necro); R(2, 6, 12, 4, PAL.necro); R(7, 3, 2, 10, '#dfffe5'); });
  mk('frenzy', R => { R(3, 2, 3, 6, PAL.blood); R(7, 4, 3, 6, PAL.blood); R(11, 6, 3, 6, PAL.blood); R(3, 12, 11, 2, '#c03030'); });
  mk('shield', R => { R(3, 2, 10, 8, '#3a5a3a'); R(4, 10, 8, 2, '#3a5a3a'); R(6, 12, 4, 2, '#3a5a3a'); R(7, 4, 2, 7, PAL.necro); R(5, 6, 6, 2, PAL.necro); });
  mk('bomb', R => { for (let a = 0; a < 12; a++) { const ang = a / 12 * TAU; R(Math.round(8 + Math.cos(ang) * 6), Math.round(8 + Math.sin(ang) * 6), 2, 2, a % 2 ? PAL.necro : '#efffef'); } R(6, 6, 4, 4, '#efffef'); });
  mk('storm', R => { R(2, 2, 12, 4, '#3a4050'); R(4, 1, 8, 2, '#4a5060'); for (let i = 0; i < 5; i++) R(8 - i + (i % 2) * 2, 6 + i * 2, 2, 2, '#bff2ff'); });
  mk('rally', R => { R(3, 1, 1, 14, PAL.woodD); R(4, 2, 8, 6, '#1f3a24'); R(6, 4, 3, 2, PAL.bone); R(4, 8, 2, 2, '#1f3a24'); R(10, 8, 2, 2, '#1f3a24'); });
}

// ---------------- Wall / fortification sprites (16px cells) ----------------
const FORT_ART = {};
function buildFortArt() {
  // stone wall tile: 16x24 (8px top face over cell, front face below)
  const rng = makeRng(99);
  const wall = (tone, dmg) => {
    const [c, ctx] = makeCanvas(16, 24);
    stoneBase(ctx, 0, 6, 16, 18, tone, rng);
    ctx.fillStyle = shade(tone, 1.25); ctx.fillRect(0, 2, 16, 5);
    ctx.fillStyle = shade(tone, 1.45); ctx.fillRect(0, 2, 16, 1);
    for (let i = 0; i < 16; i += 6) { ctx.fillStyle = shade(tone, 1.3); ctx.fillRect(i, 0, 4, 2); }
    if (dmg > 0) { ctx.fillStyle = '#121214'; for (let i = 0; i < dmg * 4; i++) ctx.fillRect(Math.floor(rng() * 15), 6 + Math.floor(rng() * 16), 1 + Math.floor(rng() * 2), 2 + Math.floor(rng() * 3)); }
    outlineCanvas(c); return c;
  };
  FORT_ART.wall = [wall('#4d4d52', 0), wall('#4d4d52', 1), wall('#4d4d52', 3)];
  FORT_ART.wall2 = [wall('#3a3f4a', 0), wall('#3a3f4a', 1), wall('#3a3f4a', 3)];
  // spikes
  {
    const [c, ctx] = makeCanvas(16, 18);
    for (let i = 0; i < 5; i++) {
      const x = 1 + i * 3, h = 8 + (i % 2) * 3;
      ctx.fillStyle = PAL.wood; ctx.fillRect(x, 17 - h, 2, h);
      ctx.fillStyle = PAL.boneD; ctx.fillRect(x, 17 - h - 2, 1, 2);
      ctx.fillStyle = PAL.woodD; ctx.fillRect(x + 1, 17 - h, 1, h);
    }
    ctx.fillStyle = PAL.woodD; ctx.fillRect(0, 12, 16, 2);
    ctx.fillStyle = PAL.bloodD; ctx.fillRect(4, 7, 1, 2); ctx.fillRect(10, 5, 1, 2);
    outlineCanvas(c); FORT_ART.spikes = c;
  }
  // lava frames
  FORT_ART.lava = [];
  for (let f = 0; f < 4; f++) {
    const [c, ctx] = makeCanvas(16, 16);
    ctx.fillStyle = '#2a0a04'; ctx.fillRect(0, 0, 16, 16);
    for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) {
      const n = Math.sin(x * 0.9 + f * 1.1) + Math.cos(y * 0.8 - f * 0.7) + Math.sin((x + y) * 0.5 + f);
      ctx.fillStyle = n > 1.4 ? PAL.fireL : n > 0.4 ? PAL.fire : n > -0.6 ? PAL.fireD : '#5a1606';
      ctx.fillRect(x, y, 1, 1);
    }
    FORT_ART.lava.push(c);
  }
  // rune trap frames
  FORT_ART.rune = [];
  for (let f = 0; f < 4; f++) {
    const [c, ctx] = makeCanvas(16, 16);
    for (let a = 0; a < 24; a++) { const ang = a / 24 * TAU + f * 0.2; ctx.fillStyle = a % 3 ? PAL.necroD : PAL.necro; ctx.fillRect(Math.round(8 + Math.cos(ang) * 6), Math.round(8 + Math.sin(ang) * 4), 1, 1); }
    ctx.fillStyle = f % 2 ? PAL.necro : PAL.necroD; ctx.fillRect(7, 5, 2, 6); ctx.fillRect(5, 7, 6, 2);
    FORT_ART.rune.push(c);
  }
  // acid cauldron
  FORT_ART.cauldron = [];
  for (let f = 0; f < 4; f++) {
    const [c, ctx] = makeCanvas(16, 18);
    ctx.fillStyle = '#26281f'; ctx.fillRect(2, 6, 12, 9); ctx.fillRect(3, 15, 2, 3); ctx.fillRect(11, 15, 2, 3);
    ctx.fillStyle = '#3a3e2e'; ctx.fillRect(2, 6, 12, 1);
    ctx.fillStyle = '#7fff5a'; ctx.fillRect(3, 5, 10, 2);
    ctx.fillStyle = '#c8ff9a'; ctx.fillRect(4 + f * 2, 4 - (f % 2), 2, 2);
    ctx.fillStyle = '#ff7a1e'; ctx.fillRect(4, 16, 8, 1);
    outlineCanvas(c); FORT_ART.cauldron.push(c);
  }
  // ward pylon
  FORT_ART.ward = [];
  for (let f = 0; f < 4; f++) {
    const [c, ctx] = makeCanvas(16, 24);
    ctx.fillStyle = PAL.stoneD; ctx.fillRect(5, 8, 6, 16); ctx.fillStyle = PAL.stone; ctx.fillRect(5, 8, 2, 16);
    ctx.fillStyle = f % 2 ? '#bfe6ff' : '#4aa8ff'; ctx.fillRect(6, 2, 4, 6); ctx.fillStyle = '#fff'; ctx.fillRect(7, 3, 1, 2);
    outlineCanvas(c); FORT_ART.ward.push(c);
  }
}

// rally banner sprite
function buildBanner(color) {
  const frames = [];
  for (let f = 0; f < 4; f++) {
    const [c, ctx] = makeCanvas(14, 26);
    ctx.fillStyle = PAL.woodD; ctx.fillRect(2, 0, 2, 26);
    ctx.fillStyle = PAL.bone; ctx.fillRect(1, 0, 4, 2);
    const wave = [0, 1, 0, -1][f];
    for (let x = 0; x < 9; x++) { ctx.fillStyle = x % 3 === 0 ? shade(color, 0.7) : color; ctx.fillRect(4 + x, 3 + Math.round(Math.sin(x * 0.7 + f) * 0.8), 1, 10 - (x > 6 ? x - 6 : 0)); }
    ctx.fillStyle = PAL.bone; ctx.fillRect(7, 6 + wave * 0, 3, 3); ctx.fillStyle = '#000'; ctx.fillRect(7, 7, 1, 1); ctx.fillRect(9, 7, 1, 1);
    outlineCanvas(c); frames.push(c);
  }
  return frames;
}


const PROP_ART = {};
function buildPropArt() {
  const mk = (name, w, h, fn, frames = 1) => {
    PROP_ART[name] = [];
    for (let f = 0; f < frames; f++) {
      const [c, ctx] = makeCanvas(w, h);
      fn((x, y, ww, hh, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(ww)), Math.max(1, Math.round(hh))); }, ctx, f);
      outlineCanvas(c);
      PROP_ART[name].push(c);
    }
  };
  // dead trees (several variants)
  for (let v = 0; v < 3; v++) {
    mk('tree' + v, 40, 48, (R, ctx) => {
      const rng = makeRng(300 + v * 17);
      const trunk = '#2a2420', tl = '#3a322b';
      R(18, 26, 4, 22, trunk); R(18, 26, 1, 22, tl); R(16, 44, 8, 4, trunk); R(14, 46, 3, 2, trunk); R(23, 46, 3, 2, trunk);
      const branch = (x, y, ang, len, th) => {
        if (len < 3) return;
        const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
        pline(ctx, x, y, ex, ey, th > 1 ? trunk : '#2e2824', th);
        branch(ex, ey, ang - 0.5 - rng() * 0.3, len * 0.66, Math.max(1, th - 1));
        if (rng() < 0.8) branch(ex, ey, ang + 0.4 + rng() * 0.4, len * 0.6, Math.max(1, th - 1));
      };
      branch(20, 28, -Math.PI / 2 - 0.1, 10 + v * 2, 3);
      branch(20, 34, -Math.PI / 2 - 0.9, 8, 2);
      branch(20, 32, -Math.PI / 2 + 0.8, 9, 2);
    });
  }
  mk('rock', 18, 13, R => { R(2, 4, 14, 8, '#3c3c40'); R(4, 2, 9, 3, '#4a4a4f'); R(3, 4, 5, 2, '#5a5a60'); R(12, 7, 4, 5, '#2c2c30'); R(6, 9, 2, 1, '#252528'); });
  mk('rock2', 26, 16, R => { R(2, 6, 22, 9, '#38383c'); R(5, 2, 12, 5, '#45454a'); R(4, 6, 8, 3, '#57575c'); R(16, 8, 7, 6, '#2a2a2e'); R(12, 4, 4, 2, '#4f4f55'); R(8, 12, 3, 1, '#222'); });
  mk('pillar', 18, 46, (R) => {
    R(3, 40, 12, 6, '#3e3e42'); R(3, 40, 12, 1, '#5a5a5e');
    R(5, 8, 8, 32, '#4a4a4e'); R(5, 8, 2, 32, '#5e5e62'); R(11, 8, 2, 32, '#353538');
    for (let y = 10; y < 40; y += 6) R(5, y, 8, 1, '#3a3a3e');
    R(5, 4, 3, 4, '#4a4a4e'); R(8, 6, 3, 2, '#4a4a4e'); R(10, 3, 3, 5, '#4a4a4e');
    R(6, 20, 1, 6, '#2a2a2c'); R(12, 12, 1, 4, '#2a2a2c');
    R(6, 36, 2, 1, '#4a5a3a'); R(9, 38, 3, 1, '#4a5a3a');
  });
  mk('ruinwall', 34, 22, R => {
    const rng = makeRng(55);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 6; x++) { const h = y === 0 && (x === 0 || x > 3) ? 0 : 1; if (!h) continue; R(1 + x * 5 + (y % 2) * 2, 6 + y * 5, 4, 4, rng() < 0.4 ? '#4c4c50' : '#55555a'); }
    R(1, 16, 32, 5, '#3a3a3e'); R(0, 20, 34, 2, '#2d2d30');
    R(6, 2, 4, 4, '#4c4c50'); R(14, 4, 3, 2, '#55555a');
  });
  mk('grave', 10, 14, R => { R(2, 2, 6, 11, '#4e4e52'); R(3, 1, 4, 1, '#4e4e52'); R(2, 2, 1, 11, '#606064'); R(4, 4, 2, 4, '#353538'); R(3, 5, 4, 1, '#353538'); R(1, 12, 8, 2, '#2e2a26'); });
  mk('grave2', 12, 10, R => { R(1, 3, 10, 6, '#48484c'); R(1, 3, 10, 1, '#5c5c60'); R(2, 1, 3, 2, '#48484c'); R(0, 8, 12, 2, '#2e2a26'); });
  mk('cross', 10, 16, R => { R(4, 1, 2, 14, '#3a2e24'); R(1, 4, 8, 2, '#3a2e24'); R(4, 1, 1, 14, '#4a3e32'); R(2, 14, 6, 2, '#2a2420'); });
  mk('skullpole', 10, 26, (R) => { R(4, 6, 2, 20, PAL.woodD); R(3, 1, 4, 4, PAL.bone); R(4, 2, 1, 1, '#000'); R(6, 2, 1, 1, '#000'); R(3, 5, 4, 1, PAL.boneD); R(2, 10, 6, 1, PAL.boneD); });
  // brazier tripod (like the reference) - animated
  mk('brazier', 14, 30, (R, ctx, f) => {
    pline(ctx, 7, 12, 2, 29, '#3a3430', 1); pline(ctx, 7, 12, 12, 29, '#3a3430', 1); pline(ctx, 7, 12, 7, 29, '#2a2420', 1);
    R(3, 9, 8, 3, '#2a2420'); R(3, 9, 8, 1, '#5a4a40');
    for (let i = 0; i < 6; i++) { const h = 4 + Math.abs(Math.sin(i * 1.9 + f * 1.4)) * 5; R(4 + i, 9 - h, 1, h, PAL.fireD); R(4 + i, 9 - h * 0.7, 1, h * 0.7, PAL.fire); R(4 + i, 9 - h * 0.35, 1, h * 0.35, PAL.fireL); }
  }, 4);
  mk('torch', 6, 20, (R, ctx, f) => { R(2, 6, 2, 14, PAL.woodD); R(1, 5, 4, 2, '#3a3430'); const h = 3 + f % 3; R(2, 5 - h, 2, h, PAL.fire); R(2, 5 - h + 1, 1, h - 1, PAL.fireL); }, 4);
  mk('crystal', 12, 18, (R, ctx, f) => { R(4, 2, 4, 14, PAL.necroD); R(5, 3, 2, 12, f % 2 ? PAL.necro : '#8dffa0'); R(2, 8, 3, 8, PAL.necroD); R(8, 6, 3, 10, PAL.necroD); R(1, 16, 10, 2, '#1a2a1a'); }, 2);
  mk('cart', 30, 18, R => { R(2, 6, 22, 6, PAL.woodD); R(2, 6, 22, 1, PAL.wood); R(6, 10, 7, 7, '#2a2018'); R(8, 12, 3, 3, PAL.wood); R(20, 12, 6, 2, PAL.woodD); R(24, 2, 2, 6, PAL.woodD); R(10, 3, 6, 3, '#3a3a3a'); });
  mk('fence', 22, 12, R => { for (let i = 0; i < 4; i++) R(1 + i * 6, 2 + (i % 2), 2, 10, PAL.woodD); R(0, 5, 18, 1, PAL.wood); R(4, 8, 15, 1, PAL.wood); });
  mk('banner', 12, 28, (R, ctx, f) => { R(2, 0, 2, 28, PAL.woodD); for (let x = 0; x < 7; x++) R(4 + x, 2 + Math.round(Math.sin(x * 0.8 + f) * 0.7), 1, 11, x % 3 ? '#5a1a1a' : '#3a0e0e'); R(6, 5, 3, 3, PAL.gold); }, 4);
}


const SPRITE_SPECS = {
  // ---- undead (friendly)
  skeleton: { head: 'skull', eyes: PAL.necro, ribs: true, bony: true, body: '#2a2622', weapon: 'sword', weaponColor: '#9a9a90', shield: '#3a3026', shieldEm: 'band' },
  skeleton2: { head: 'skullHelm', helm: '#3c4046', eyes: PAL.necro, ribs: true, bony: true, body: '#2a2622', armor: '#4c5157', weapon: 'sword', shield: '#2f3a30', shieldEm: 'skull' },
  skeleton3: { head: 'horned', helm: '#26262c', eyes: PAL.necro, bony: true, body: '#1e2422', armor: '#3a4048', tabard: '#1f3a24', emblem: 'skull', weapon: 'greatsword', weaponColor: '#c8d0c8', glowBlade: PAL.necro, shield: '#1f2a22', shieldEm: 'skull', cape: '#15301c' },
  archer: { head: 'skull', eyes: PAL.necro, ribs: true, bony: true, body: '#2a2622', weapon: 'bow', arrow: PAL.bone },
  archer2: { head: 'hood', hood: '#2a3a2a', eyes: PAL.necro, ribs: true, bony: true, body: '#2a3a2a', weapon: 'bow', cape: '#1d2a1d' },
  archer3: { head: 'hood', hood: '#1a2e22', eyes: '#c8ffd0', bony: true, body: '#1a2e22', armor: '#3a4048', weapon: 'bow', weaponColor: PAL.bone, cape: '#0f2416', castGlow: PAL.necro },
  zombie: { head: 'zombie', body: '#4a4a3a', limb: PAL.zomb, legs: '#3b3a30', weapon: 'claws', weaponColor: PAL.zombD, hair: '#2a2a20' },
  zombie2: { head: 'zombie', body: '#3e3a32', limb: PAL.zomb, legs: '#3b3a30', weapon: 'cleaver', hair: '#1a1a10', stitch: true, bulk: 1.15 },
  zombie3: { head: 'zombie', body: '#5a4a3a', limb: '#8a9a6a', legs: '#3b3a30', weapon: 'cleaver', stitch: true, bulk: 1.35, H: 26 },
  pikeman: { head: 'skullHelm', helm: '#4c5157', eyes: PAL.necro, ribs: true, bony: true, body: '#2a2622', weapon: 'spear', pennant: '#1f3a24' },
  pikeman2: { head: 'skullHelm', helm: '#5a6068', eyes: PAL.necro, bony: true, body: '#2a2622', armor: '#5a6068', weapon: 'spear', pennant: '#2e5c34', shield: '#2f3a30' },
  deathknight: { head: 'horned', helm: '#25232a', eyes: PAL.necro, body: '#2a2830', armor: '#3e3c46', tabard: '#1f3a24', emblem: 'skull', weapon: 'greatsword', weaponColor: '#9aa09a', glowBlade: PAL.necro, cape: '#1a1420', H: 25 },
  deathknight2: { head: 'horned', helm: '#1a1a20', eyes: '#c8ffd0', body: '#1e1c24', armor: '#2e2c36', tabard: '#14301a', emblem: 'skull', weapon: 'greatsword', weaponColor: '#bfe6c8', glowBlade: PAL.necro, cape: '#0e2a14', H: 26, mount: { color: '#2a2622', bony: true, mane: PAL.necroD } },
  bonemage: { head: 'skull', eyes: PAL.necro, bony: true, body: '#2b2236', robe: true, weapon: 'staff', orb: PAL.necro, staffTop: 'skull', castGlow: PAL.necro },
  acolyte: { head: 'hood', hood: '#2a1d2e', eyes: PAL.necro, body: '#2a1d2e', robe: true, weapon: 'staff', orb: '#7dffb0', castGlow: PAL.necro, skin: PAL.boneD },
  wraith: { head: 'hood', hood: '#1c1e26', eyes: '#a8ffff', body: '#1c1e26', float: true, flying: true, weapon: 'scythe', weaponColor: '#b0c4c4', bony: true },
  banshee: { head: 'veil', eyes: '#bff', body: '#8fa0a6', float: true, flying: true, weapon: 'none', noArms: false, limb: '#a9b4b8' },
  vampire: { head: 'face', skin: '#d8d0d0', hair: '#141014', body: '#3a0e18', armor: '#2a2a2a', cape: '#5a0a14', weapon: 'sword', weaponColor: '#d0d0e0', eyes: '#ff3030' },
  abomination: { head: 'zombie', body: '#7a5a50', limb: '#8a6a5a', legs: '#5a4a40', weapon: 'cleaver', stitch: true, bulk: 1.8, H: 30, weaponTh: 2 },
  golem: { head: 'skull', eyes: PAL.necro, ribs: true, body: '#2a2622', limb: PAL.bone, legs: PAL.bone, boots: PAL.boneD, weapon: 'claws', weaponColor: PAL.bone, bulk: 1.7, H: 32, weaponTh: 2 },
  wyvern: null, // dragon builder
  colossus: { head: 'skull', eyes: PAL.necro, ribs: true, body: '#2a2622', limb: PAL.bone, legs: PAL.bone, boots: PAL.boneD, weapon: 'hammer', weaponColor: PAL.bone, bulk: 1.8, H: 54, weaponTh: 3, cape: '#1f3a24' },
  devourer: { head: 'hood', hood: '#0e1016', eyes: '#7dffb0', body: '#0e1016', float: true, flying: true, weapon: 'scythe', weaponColor: '#7dffb0', H: 44, bulk: 1.5, weaponTh: 2 },
  sumabom: { head: 'zombie', body: '#6a4a40', limb: '#7a5a4a', legs: '#5a4a40', weapon: 'cleaver', stitch: true, bulk: 2.1, H: 42, weaponTh: 2 },
  // ---- mortals (enemies)
  militia: { head: 'face', hair: '#5a3a1e', body: '#5a4a32', legs: '#3a3024', weapon: 'spear', weaponColor: '#888' },
  footman: { head: 'helm', helm: '#7d838a', body: '#6a2a2a', armor: '#7d838a', tabard: '#8a2a2a', weapon: 'sword', shield: '#6a4a2a', shieldEm: 'band' },
  shield: { head: 'helm', helm: '#8a9098', body: '#2a3a6a', armor: '#8a9098', tabard: '#2a3a6a', weapon: 'sword', shield: '#8a9098', shieldEm: 'sun' },
  knight: { head: 'greathelm', helm: '#a0a6ae', plume: '#b02020', body: '#3a3a44', armor: '#a0a6ae', tabard: '#7a1a1a', emblem: 'cross', weapon: 'sword', shield: '#7a1a1a', shieldEm: 'cross', H: 23 },
  cavalry: { head: 'helm', helm: '#a0a6ae', plume: '#d8c040', body: '#3a3a44', armor: '#a0a6ae', tabard: '#1a3a7a', weapon: 'lance', pennant: '#d8c040', mount: { color: '#5a3a24', barding: '#1a3a7a', em: true, mane: '#2a1a10' } },
  crossbow: { head: 'face', hair: '#6a4a2a', body: '#4a5a3a', armor: '#6a6a60', weapon: 'crossbow' },
  priest: { head: 'mitre', hair: '#cfcfcf', body: '#e8e4d8', robe: true, tabard: '#d6a940', emblem: 'cross', weapon: 'staff', orb: PAL.holy, staffC: PAL.goldD, castGlow: PAL.holy },
  paladin: { head: 'greathelm', helm: '#d8c890', plume: '#ffffff', body: '#e0dccc', armor: '#d8c890', tabard: '#f0ece0', emblem: 'sun', weapon: 'hammer', weaponColor: '#e0d090', shield: '#f0ece0', shieldEm: 'sun', H: 24, cape: '#b8a060' },
  inquisitor: { head: 'hood', hood: '#5a0a0a', eyes: '#ffcc66', body: '#2a1010', robe: true, armor: '#4a3a30', tabard: '#5a0a0a', emblem: 'cross', weapon: 'staff', orb: '#ff8a1e', staffC: PAL.goldD, castGlow: '#ff8a1e', cape: '#3a0606', H: 24 },
  battlemage: { head: 'wizard', hat: '#7a2a1a', beard: '#9a9a9a', body: '#7a2a1a', robe: true, weapon: 'staff', orb: PAL.fire, castGlow: PAL.fire },
  elementalist: { head: 'wizard', hat: '#2a4a7a', beard: '#c0c0c0', body: '#2a4a7a', robe: true, weapon: 'staff', orb: PAL.frost, castGlow: PAL.frost },
  spellbreaker: { head: 'helm', helm: '#5a4a7a', body: '#2a2a3a', armor: '#6a5a8a', tabard: '#3a2a5a', emblem: 'eye', weapon: 'axe', weaponColor: '#c0b0ff', shield: '#3a2a5a', shieldEm: 'band' },
  construct: { head: 'helm', helm: '#6a6a80', body: '#4a4a5a', armor: '#7a7a90', emblem: 'eye', weapon: 'claws', weaponColor: '#8a8aa0', limb: '#5a5a70', legs: '#4a4a5a', bulk: 1.7, H: 32, eyes: PAL.arcane, weaponTh: 2 },
  ranger: { head: 'hood', hood: '#3a4a2a', eyes: null, body: '#3a4a2a', skin: PAL.skin, weapon: 'bow', cape: '#2a3a1e' },
  assassin: { head: 'hood', hood: '#1e1e22', eyes: '#d0d0d0', body: '#1e1e22', weapon: 'dagger', weaponColor: '#e0e0e0', cape: '#141418' },
  hunter: { head: 'face', hair: '#8a5a2a', beard: '#7a4a2a', body: '#5a3a24', armor: '#6a5a4a', weapon: 'axe', weaponColor: '#c0c0c0', cape: '#4a2a1a', H: 23 },
  angel: { head: 'face', skin: '#f0e0d0', hair: '#f0d070', body: '#f0ece0', armor: '#e0c870', halo: true, wings: 'feather', flying: true, weapon: 'spear', weaponColor: '#fff3c4', robe: true },
  griffon: { head: 'helm', helm: '#c0b080', plume: '#2a5ad0', body: '#2a4a8a', armor: '#c0b080', wings: 'feather', flying: true, weapon: 'lance', pennant: '#2a5ad0', mount: { color: '#a07a4a', mane: '#e0d0a0' } },
  // bosses
  b_inquisitor: { head: 'mitre', hair: '#888', beard: '#aaa', body: '#5a0a0a', robe: true, armor: '#d6a940', tabard: '#2a0505', emblem: 'cross', weapon: 'staff', orb: '#ff6a1e', staffC: PAL.gold, castGlow: '#ff8a1e', cape: '#8a1010', H: 40 },
  b_archmage: { head: 'wizard', hat: '#3a1a6a', beard: '#e0e0e0', body: '#3a1a6a', robe: true, armor: '#b08aff', emblem: 'eye', weapon: 'staff', orb: '#d0a0ff', castGlow: '#d0a0ff', cape: '#1a0a3a', H: 40 },
  b_dragonslayer: { head: 'greathelm', helm: '#8a8a8a', plume: '#c02020', body: '#3a2a2a', armor: '#8a8a8a', tabard: '#5a1a1a', weapon: 'greatsword', weaponColor: '#e0e0e0', weaponTh: 2, cape: '#3a1a10', H: 42, bulk: 1.15 },
  b_saint: { head: 'face', skin: '#f8f0e0', hair: '#fff8d0', body: '#fffaf0', robe: true, armor: '#ffe080', halo: true, wings: 'feather', weapon: 'sword', weaponColor: '#fff8c0', glowBlade: '#ffffff', flying: true, H: 40 },
  b_kings: { head: 'crown', hair: '#5a3a2a', beard: '#5a3a2a', body: '#5a0a3a', armor: '#d6a940', tabard: '#3a0a2a', emblem: 'sun', weapon: 'sword', weaponColor: '#e0e0e0', shield: '#5a0a3a', shieldEm: 'sun', cape: '#7a0a4a', H: 40, mount: { color: '#e8e0d0', barding: '#5a0a3a', em: true, mane: '#d6a940' } },
  b_champion: { head: 'greathelm', helm: '#ffe080', plume: '#ffffff', body: '#fffaf0', armor: '#ffe080', tabard: '#ffffff', emblem: 'sun', halo: true, wings: 'feather', weapon: 'greatsword', weaponColor: '#ffffff', glowBlade: PAL.holy, weaponTh: 2, shield: '#ffe080', shieldEm: 'sun', H: 46 },
};


const FORTRESSES = {
  haunted: { name: 'Haunted Barrow', desc: '+15% necrotic damage. +10% unit health.', bonus: { necroDmg: 0.15, unitHp: 0.1 },
    ground: ['#23221f', '#272522', '#2b2925', '#1f1e1b'], grass: ['#4a4f45', '#5d625a', '#3a3f36'], stone: '#55565a', accent: PAL.necro, keepTone: '#3b3b41', windowGlow: PAL.necro, fog: '#9fb0a0', ambient: 0.62 },
  volcanic: { name: 'Volcanic Forge', desc: '+30% fire damage. Lava moats are free to build.', meta: 'i_fort1', bonus: { fireDmg: 0.3, freeLava: true },
    ground: ['#2a1f1a', '#2f231d', '#352720', '#241a15'], grass: ['#4a3a30', '#5a3a2a', '#3a2a20'], stone: '#4d4440', accent: PAL.fire, keepTone: '#3e3430', windowGlow: PAL.fire, fog: '#a07060', ambient: 0.6 },
  frozen: { name: 'Frozen Spire', desc: '+30% frost damage. Enemies move 8% slower.', meta: 'i_fort2', bonus: { frostDmg: 0.3, enemySlow: 0.08 },
    ground: ['#2a2e33', '#30353a', '#363c42', '#25292e'], grass: ['#6a7a84', '#8a9aa4', '#4a5a64'], stone: '#5a636c', accent: PAL.frost, keepTone: '#3e4650', windowGlow: PAL.frost, fog: '#c0d8e8', ambient: 0.55 },
  cathedral: { name: 'Ruined Cathedral', desc: '+25% souls from all sources. +15% XP.', meta: 'i_fort3', bonus: { souls: 0.25, xp: 0.15 },
    ground: ['#26231f', '#2b2722', '#302b25', '#221f1b'], grass: ['#4a4a3a', '#5a5a48', '#3a3a2c'], stone: '#5c5850', accent: '#7dffb0', keepTone: '#44403a', windowGlow: '#c0ffb0', fog: '#b0a890', ambient: 0.6 },
  abyssal: { name: 'Abyssal Gate', desc: 'Summons cost 25% less and last 50% longer. +10% all damage.', meta: 'i_fort4', bonus: { summonCost: 0.25, summonDur: 0.5, allDmg: 0.1 },
    ground: ['#1f1d24', '#24212a', '#29252f', '#1b1920'], grass: ['#3a3448', '#4a4258', '#2a2436'], stone: '#4a4456', accent: PAL.arcane, keepTone: '#363040', windowGlow: PAL.arcane, fog: '#8a7aa8', ambient: 0.66 },
};


export { PAL, SPR, TOWER_ART, FORT_ART, ICONS, PROP_ART, SPRITE_SPECS, FORTRESSES, buildHumanoidSet, buildDragonSet, buildRamSet, buildCatapultSet, buildTowerArt, buildKeepArt, buildLichSet, buildSoulWellArt, buildIcons, buildFortArt, buildPropArt, outlineCanvas, shadeCanvas, makeCanvas };

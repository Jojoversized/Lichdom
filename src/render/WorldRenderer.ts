// Renders the simulation with Phaser: y-sorted sprites, decals, pixel FX,
// dithered localized lighting and overlay bars/text. Owns all Phaser objects;
// the simulation never touches them.
import * as Phaser from 'phaser';
import { G } from '../core/state';
import { CELL, MW, MH, WW, WH, KEEP, WELL_POS, PAL } from '../config/constants';
import { SHEETS, IMAGES } from '../config/manifest';
import { FORT_ART, FORT_LIGHTS, LICH_POS } from '../data/fortress';
import { hexNum, clamp, rnd, rndi, pick, dist, lerp, makeCanvas, TAU } from '../core/util';
import { TOWERS, FORTS, WALL_TIERS, WALL_MAX_TIER } from '../data/towers';
import { siteTier, wallSlotsFree } from '../systems/ramparts';
import { towerStats } from '../systems/stats';
import { cellIdx, canBuildAt, siteAtCell, plotAtCell, worldToCell } from '../world/mapgen';
import { mountAt, mountCells, towerSlotsFree, trapSlotsFree } from '../systems/keep';
import { SPELLS } from '../data/spells';
import { animFrameIndex, makeLightTextures, makeShadowTextures, PX_FONT, PX_DIGITS } from './textures';
import { TEXEL_RES, VIEW } from '../config/zoom';

/** Art is authored at TEXEL_RES texels per world pixel. */
const T = TEXEL_RES, SC = 1 / TEXEL_RES;
/** Snap a world coordinate to the texel grid (half-pixel steps at 2x). */
const snap = (v: number) => Math.round(v * T) / T;
/** Draw scale of a sheet: 1 / its texel density (procedural art 2, AI art 4). */
const sheetScale = (key: string) => 1 / ((SHEETS[key] && (SHEETS[key] as any).res) || T);

/** Placeholder look of evolved undead until they get their own Dreamina art: tier II a cold soul-blue glow,
 *  tier III a blood-crimson one (both pulse slightly), with a faint matching tint on the sprite. */
export const TIER_GLOW: any[] = [null, { color: '#6fc8ff', r: 22, a: 0.42, tint: 0xcfe6ff }, { color: '#ff4a4a', r: 26, a: 0.42, tint: 0xffd2cc }];
const DEPTH = { terrain: -10000, decals: -9990, groundFx: -9000, shadows: -8000, world: 0, fx: 100000, dark: 200000, glow: 200001, overlay: 300000 };
const colorCache = new Map<string, number>();
const col = (c: string) => { let v = colorCache.get(c); if (v === undefined) { v = c.startsWith('#') ? hexNum(c) : 0xffffff; colorCache.set(c, v); } return v; };

export class WorldRenderer {
  scene: Phaser.Scene;
  terrain?: Phaser.GameObjects.Image;
  decalTex?: Phaser.Textures.CanvasTexture; decalCtx?: CanvasRenderingContext2D; decalDirty = false; decalT = 0;
  gGround: Phaser.GameObjects.Graphics; gFx: Phaser.GameObjects.Graphics; gOver: Phaser.GameObjects.Graphics;
  dark: Phaser.GameObjects.RenderTexture; glow: Phaser.GameObjects.RenderTexture;
  stamps: Phaser.GameObjects.Image[] = [];
  cull: { x0: number; y0: number; x1: number; y1: number } | null = null;
  /** Unit / enemy shadows are Blitter bobs (one batched object per shadow size) rather than 3,000+ Images. */
  shadowBlits: Record<string, Phaser.GameObjects.Blitter> = {};
  keep?: Phaser.GameObjects.Sprite; lich?: Phaser.GameObjects.Sprite; well?: Phaser.GameObjects.Sprite; fortress?: Phaser.GameObjects.Image;
  props: Phaser.GameObjects.Sprite[] = [];
  worldVersion = -1;
  viewW = 480; viewH = 270;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    makeLightTextures(scene); makeShadowTextures(scene);
    this.gGround = scene.add.graphics().setDepth(DEPTH.groundFx);
    this.gFx = scene.add.graphics().setDepth(DEPTH.fx);
    this.gOver = scene.add.graphics().setDepth(DEPTH.overlay);
    // light buffers live at texel resolution and are drawn at 1/T scale (the camera zoom brings them to the screen)
    this.dark = scene.add.renderTexture(0, 0, 8, 8).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.dark).setScale(SC);
    this.glow = scene.add.renderTexture(0, 0, 8, 8).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.glow).setBlendMode(Phaser.BlendModes.ADD).setScale(SC);
    for (let i = 0; i < 420; i++) this.stamps.push(scene.make.image({ key: 'light_16', add: false }).setOrigin(0.5));
  }

  /** w, h: canvas size. The visible world is canvas / camera zoom. */
  resize(w: number, h: number) {
    this.viewW = Math.ceil(w / VIEW.cz); this.viewH = Math.ceil(h / VIEW.cz);
    const tw = this.viewW * T, th = this.viewH * T;
    this.dark.resize?.(tw, th); this.glow.resize?.(tw, th);
    this.dark.setSize(tw, th); this.glow.setSize(tw, th);
    // the camera viewport must follow the canvas, or zooming out leaves the rest of the screen black
    this.scene.cameras.main.setSize(w, h).setOrigin(0, 0).setZoom(VIEW.cz);
    this.updateDetailFilters();
  }
  /** High-density sheets (AI art, res 4) show every texel crisply once a texel covers at
   *  least one screen pixel (zoom >= 4). Below that they are downsampled smoothly
   *  (linear filtering) instead of dropping texels, so the extra detail still reads. */
  updateDetailFilters() {
    for (const [key, m] of [...Object.entries(SHEETS), ...Object.entries(IMAGES)]) {
      const res = (m as any).res || T;
      if (res <= T || !this.scene.textures.exists(key)) continue;
      const crisp = VIEW.Z / res >= 1;
      this.scene.textures.get(key).setFilter(crisp ? Phaser.Textures.FilterMode.NEAREST : Phaser.Textures.FilterMode.LINEAR);
    }
  }

  // ---------- world (re)build ----------
  rebuildWorld() {
    const s = this.scene, M = G.map;
    this.worldVersion = G.worldVersion;
    // destroy any view still attached to old entities
    for (const k of ['units', 'enemies', 'towers', 'forts', 'buildings', 'corpses', 'dying']) for (const o of G[k]) this.destroyView(o);
    for (const k in this.shadowBlits) this.shadowBlits[k].destroy(); this.shadowBlits = {};
    this.props.forEach(p => p.destroy()); this.props = [];
    this.terrain?.destroy(); this.keep?.destroy(); this.lich?.destroy(); this.well?.destroy(); this.fortress?.destroy(); this.fortress = undefined;
    if (s.textures.exists('terrain')) s.textures.remove('terrain');
    s.textures.addCanvas('terrain', M.terrain);
    this.terrain = s.add.image(0, 0, 'terrain').setOrigin(0).setDepth(DEPTH.terrain).setScale(WW / M.terrain.width);
    if (!this.decalTex) {
      // decals are painted at texel resolution: callers keep using world coordinates
      this.decalTex = s.textures.createCanvas('decals', WW * T, WH * T);
      s.add.image(0, 0, 'decals').setOrigin(0).setDepth(DEPTH.decals).setScale(SC);
      this.decalCtx = this.decalTex.getContext();
      this.decalCtx.imageSmoothingEnabled = false;
      this.decalCtx.setTransform(T, 0, 0, T, 0, 0);
    }
    this.decalCtx.clearRect(0, 0, WW, WH); this.decalTex.refresh();
    for (const p of M.props) {
      const key = 'prop_' + p.name;
      if (!s.textures.exists(key)) continue;
      const spr = s.add.sprite(p.x, p.y + 1, key, 0).setOrigin(0.5, 1).setDepth(p.y).setScale(SC);
      (spr as any).animProp = p.anim; (spr as any).seed = p.x | 0;
      this.props.push(spr);
    }
    const keepKey = 'keep_' + M.fort;
    this.keep = s.add.sprite(KEEP.x, KEEP.y1 + 2, keepKey, 0).setOrigin(0.5, 1).setDepth(KEEP.y1).setScale(SC);
    // v0.7: the necropolis fortress (AI art) spans the map's left edge; the old keep sprite is the fallback
    if (s.textures.exists(FORT_ART.key)) {
      const res = (IMAGES[FORT_ART.key] as any)?.res || FORT_ART.res;
      this.fortress = s.add.image(0, 0, FORT_ART.key).setOrigin(0).setDepth(DEPTH.decals + 5).setScale(1 / res);
      this.keep.setVisible(false);
    }
    this.lich = s.add.sprite(LICH_POS.x, LICH_POS.y, 'lich', 0).setOrigin(0.5, 1).setDepth(WH + 10).setScale(sheetScale('lich'));
    this.well = s.add.sprite(WELL_POS.x, WELL_POS.y + 8, 'soulwell', 0).setOrigin(0.5, 1).setDepth(WELL_POS.y + 6).setScale(SC);
  }

  destroyView(o: any) {
    if (o.view) { o.view.destroy(); o.view = null; }
    if (o.shadow) { o.shadow.destroy(); o.shadow = null; }
    if (o.sbob) { if (o.sbob.parent && o.sbob.parent.children) o.sbob.destroy(); o.sbob = null; }
  }
  /** A shadow bob from the blitter of texture `key` (bob coordinates are in texel space: the blitter is scaled SC). */
  private shadowBob(key: string) {
    let bl = this.shadowBlits[key];
    if (!bl) { bl = this.scene.add.blitter(0, 0, key).setDepth(DEPTH.shadows).setScale(SC); this.shadowBlits[key] = bl; }
    const src = this.scene.textures.get(key).getSourceImage() as HTMLImageElement;
    const bob: any = bl.create(0, 0); bob.hw = src.width / 2; bob.hh = src.height / 2;
    return bob;
  }

  // ---------- per-frame ----------
  render(dt: number, now: number) {
    if (!G.map) return;
    if (this.worldVersion !== G.worldVersion) this.rebuildWorld();
    for (const o of G.retired) this.destroyView(o);
    G.retired.length = 0;
    this.flushDecals();
    const cam = this.scene.cameras.main;
    const vw = this.viewW, vh = this.viewH;
    G.camera.x = vw >= WW ? WW / 2 : clamp(G.camera.x, vw / 2, WW - vw / 2);
    G.camera.y = vh >= WH ? WH / 2 : clamp(G.camera.y, vh / 2, WH - vh / 2);
    let ox = Math.round(G.camera.x - vw / 2), oy = Math.round(G.camera.y - vh / 2);
    if (G.shake > 0 && G.settings.shake) { ox += Math.round(rnd(-G.shake, G.shake) * 0.5); oy += Math.round(rnd(-G.shake, G.shake) * 0.5); }
    cam.setScroll(ox, oy);
    // actors outside the view (plus a margin for tall sprites) are hidden and not updated
    this.cull = { x0: ox - 40, y0: oy - 20, x1: ox + vw + 40, y1: oy + vh + 70 };
    const animF = Math.floor(now / 140);
    // static set pieces
    this.keep.setFrame(animF % 4);
    if (G.keep.flash > 0) this.keep.setTint(0xff7070); else this.keep.clearTint();
    if (this.fortress) { if (G.keep.flash > 0) this.fortress.setTint(0xffb0b0); else this.fortress.clearTint(); }
    this.well.setFrame(animF % 6);
    const L = G.lich, ls = SHEETS.lich;
    const la = L.anim === 'cast' ? 'cast' : 'idle';
    this.lich.setFrame(ls.anims[la][0] + (Math.floor(L.at * (la === 'cast' ? 6 : 2)) % ls.anims[la][1])).setFlipX(L.face < 0);
    for (const p of this.props) if ((p as any).animProp) { const n = p.texture.frameTotal - 1; p.setFrame((animF + (p as any).seed) % Math.max(1, n)); }
    // dynamic entities
    for (const t of G.towers) this.syncTower(t, animF);
    for (const b of G.buildings) this.syncBuilding(b, animF);
    for (const f of G.forts) this.syncFort(f, animF);
    for (const u of G.units) this.syncActor(u);
    for (const e of G.enemies) this.syncActor(e);
    for (const d of G.dying) this.syncDying(d);
    for (const c of G.corpses) this.syncCorpse(c);
    this.drawGround(ox, oy, now);
    this.drawFx(ox, oy);
    this.drawLighting(ox, oy, now);
    this.drawOverlay(ox, oy);
  }

  private ensureSprite(o: any, key: string, frame = 0) {
    if (!o.view) {
      o.view = this.scene.add.sprite(o.x, o.y, key, frame).setOrigin(0.5, 1).setScale(sheetScale(key));
      o.viewKey = key;
    } else if (o.viewKey !== key) { o.view.setTexture(key, frame).setScale(sheetScale(key)); o.viewKey = key; }
    return o.view as Phaser.GameObjects.Sprite;
  }

  /** Per-frame sync of a unit / enemy. Off-screen actors are hidden and skipped; on-screen ones only
   *  touch what changed (Phaser re-sorts the whole display list on every setDepth call, and frame
   *  and tint changes are not free either) — this keeps 3,000+ undead cheap. */
  syncActor(e: any) {
    const meta = SHEETS[e.spr];
    if (!meta) return;
    const spr = this.ensureSprite(e, e.spr);
    const c = this.cull;
    if (c && (e.x < c.x0 || e.x > c.x1 || e.y < c.y0 || e.y > c.y1)) {
      if (spr.visible) { spr.setVisible(false); if (e.sbob) e.sbob.visible = false; }
      return;
    }
    if (!spr.visible) { spr.setVisible(true); if (e.sbob) e.sbob.visible = true; }
    const bob = e.flying ? Math.sin(G.time * 3 + e.id) * 2 : 0;
    spr.setPosition(snap(e.x), snap(e.y - e.alt + bob + 1));
    const fr = animFrameIndex(meta, e.anim, e.at, ((e.id * 0.6180339) % 1) * 2);
    if (e._fr !== fr) { e._fr = fr; spr.setFrame(fr); }
    const flip = e.face < 0; if (spr.flipX !== flip) spr.setFlipX(flip);
    const depth = Math.round(e.y) + (e.flying ? 40 : 0);
    if (spr.depth !== depth) spr.setDepth(depth);
    let alpha = 1;
    if (e.temp > 0 && e.temp < 3 && Math.floor(G.time * 8) % 2) alpha = 0.5;
    if (e.type === 'banshee' || e.type === 'wraith' || e.type === 'wraiths' || e.type === 'devourer') alpha *= 0.88;
    if (spr.alpha !== alpha) spr.setAlpha(alpha);
    // evolved undead (tier II / III) share the base sheet for now: a faint tint and a coloured glow tell them apart
    const tier = e.team === 'u' && !e.summon ? (e.tier || 0) : 0;
    const tint = e.hitT > 0 ? 1 : e.st.freezeT > 0 ? 2 : e.st.prisonT > 0 ? 3 : tier ? 3 + tier : 0;
    if (e._tint !== tint) {
      e._tint = tint;
      if (tint === 1) spr.setTintFill(0xffffff); else if (tint === 2) spr.setTint(0x9fe6ff); else if (tint === 3) spr.setTint(0xd0a0ff); else if (tint >= 4) spr.setTint(TIER_GLOW[tint - 3].tint); else spr.clearTint();
    }
    if (!e.sbob) {
      const w = clamp(Math.round(e.rad * 2.4 / 4) * 4, 8, 48);
      e.sbob = this.shadowBob((e.team === 'm' ? 'eshadow_' : 'shadow_') + nearestShadow(w));
    }
    const b = e.sbob; b.x = snap(e.x) / SC - b.hw; b.y = snap(e.y) / SC - b.hh;
  }

  syncDying(e: any) {
    const meta = SHEETS[e.spr];
    if (!meta) return;
    const spr = this.ensureSprite(e, e.spr);
    const k = Math.min(1, e.dieT / 0.35);
    spr.setFrame(meta.anims.idle[0]).setOrigin(0.5, 1);
    spr.setPosition(Math.round(e.x), Math.round(e.y - e.alt * (1 - k)));
    spr.setAngle(k * 90 * (e.face < 0 ? -1 : 1));
    if (e.dieT < 0.1) spr.setTintFill(0xffffff); else spr.clearTint();
    spr.setAlpha(e.corpse ? 1 : 1 - Math.max(0, (e.dieT - 0.2) / 0.3));
    if (e.shadow) { e.shadow.destroy(); e.shadow = null; }
    if (e.sbob) { if (e.sbob.parent && e.sbob.parent.children) e.sbob.destroy(); e.sbob = null; }
  }

  syncCorpse(c: any) {
    const meta = SHEETS[c.spr];
    if (!meta) return;
    if (!c.view) {
      c.view = this.scene.add.sprite(c.x, c.y, c.spr, meta.anims.idle[0]).setOrigin(0.5, 1).setScale(sheetScale(c.spr)).setAngle(90 * (c.face < 0 ? -1 : 1)).setTint(0x8a7a78).setFlipX(c.face < 0);
      c.view.setDepth(DEPTH.decals + 5);
    }
    c.view.setAlpha(c.t > c.life - 5 ? Math.max(0.3, (c.life - c.t) / 5) : 1);
  }

  syncTower(t: any, animF: number) {
    const spr = this.ensureSprite(t, 'tower_' + t.type);
    // mounted towers stand on the battlements of their rampart segment, above the wall blocks
    if (t.mount) spr.setPosition(t.x, t.y + 2).setDepth(t.y + 40);
    else spr.setPosition(t.x, t.cy * CELL + 2 * CELL + 2).setDepth(t.y + 10);
    spr.setFrame(t.tier * 4 + ((animF + t.id) % 4));
    if (t.hitT > 0) spr.setTintFill(0xffffff); else if (t.silT > 0) spr.setTint(0xb090ff); else spr.clearTint();
    if (!t.shadow && !t.mount) t.shadow = this.scene.add.image(t.x, t.cy * CELL + 2 * CELL - 4, 'shadow_32').setDepth(DEPTH.shadows).setScale(SC);
  }

  syncBuilding(b: any, animF: number) {
    const spr = this.ensureSprite(b, 'building_' + b.type);
    spr.setPosition(b.x, b.cy * CELL + 2 * CELL + 2).setDepth(b.y + 10).setFrame(b.tier * 4 + ((animF + b.cx) % 4));
    if (!b.shadow) b.shadow = this.scene.add.image(b.x, b.cy * CELL + 2 * CELL - 4, 'shadow_32').setDepth(DEPTH.shadows).setScale(SC);
  }

  /** Construction spots: building foundations (Buildings tab / placing a building) and tower mounts —
   *  every section of a built rampart that can take a tower (Towers tab / placing a tower). */
  drawPlots(g: Phaser.GameObjects.Graphics) {
    const b = G.build, placing = b && b.kind === 'tower';
    if (!placing && !G.showPlots) return;
    const towers = placing || G.showPlots === 'mounts';
    const [hx, hy] = worldToCell(G.mouse.world[0], G.mouse.world[1]);
    const corners = (X: number, Y: number, S: number, col: number, a: number) => {
      g.fillStyle(col, a);
      for (const [dx, dy, w, h] of [[0, 0, 4, SC], [0, 0, SC, 4], [S - 4, 0, 4, SC], [S - SC, 0, SC, 4], [0, S - SC, 4, SC], [0, S - 4, SC, 4], [S - 4, S - SC, 4, SC], [S - SC, S - 4, SC, 4]]) g.fillRect(X + dx, Y + dy, w, h);
    };
    if (towers) {
      const ok = !placing || towerSlotsFree() > 0;
      const col = !placing ? 0xc8b890 : ok ? 0x5dff7a : 0xff5050;
      const hov = placing && G.mouse.onCanvas ? mountAt(hx, hy) : null;
      for (const p of mountCells()) {
        const on = hov && hov.id === p.id, X = p.x - 8, Y = p.y - 8;
        g.fillStyle(col, on ? 0.35 : 0.12); g.fillRect(X + 1, Y + 1, CELL - 2, CELL - 2);
        corners(X, Y, CELL, col, on ? 1 : 0.7);
      }
      if (hov) { const range = TOWERS[b.type].range * (1 + G.run.m.range); this.ellipse(g, hov.x, hov.y, range, range * 0.75, ok ? '#c8ffd0' : '#ff8080', 0.7, 2); }
      return;
    }
  }

  syncFort(f: any, animF: number) {
    const x = f.cx * CELL + 8, y = f.cy * CELL + 16;
    if (f.type === 'wall') {
      const k = f.hp / f.maxHp;
      const wt = WALL_TIERS[f.wtier || 2];
      const spr = this.ensureSprite(f, wt.spr);
      spr.setPosition(x, y + 8).setFrame(k > 0.66 ? 0 : k > 0.33 ? 1 : 2).setDepth(f.y + 8).setTint(wt.tint);
    } else if (f.type === 'spikes') this.ensureSprite(f, 'fort_spikes').setPosition(x, y + 2).setDepth(f.y + 8);
    else if (f.type === 'cauldron') this.ensureSprite(f, 'fort_cauldron').setPosition(x, y + 2).setFrame(animF % 4).setDepth(f.y + 8);
    else if (f.type === 'ward') this.ensureSprite(f, 'fort_ward').setPosition(x, y + 2).setFrame(animF % 4).setDepth(f.y + 8);
    else if (f.type === 'lava') this.ensureSprite(f, 'fort_lava').setPosition(x, y).setFrame(animF % 4).setDepth(DEPTH.decals + 2);
    else if (f.type === 'rune') this.ensureSprite(f, 'fort_rune').setPosition(x, y).setFrame(animF % 4).setDepth(DEPTH.decals + 2).setAlpha(f.trapT > 0 ? 0.35 : 1);
    if (f.view) { if (f.hitT > 0) f.view.setTintFill(0xffffff); else f.view.clearTint(); }
  }

  // ---------- decals ----------
  flushDecals() {
    const ctx = this.decalCtx; if (!ctx) return;
    if (G.decalQueue.length) {
      for (const d of G.decalQueue) {
        if (d.kind === 'blood') for (let i = 0; i < 10; i++) { ctx.fillStyle = Math.random() < 0.5 ? 'rgba(74,11,11,0.7)' : 'rgba(58,8,8,0.6)'; ctx.fillRect(Math.round(d.x + rnd(-7, 7)), Math.round(d.y + rnd(-3, 3)), 1 + rndi(0, 2), 1); }
        else if (d.kind === 'scorch') for (let i = 0; i < 26; i++) { const a = rnd(TAU), r = rnd(0, 14); ctx.fillStyle = Math.random() < 0.6 ? 'rgba(12,8,6,0.35)' : 'rgba(40,20,10,0.3)'; ctx.fillRect(Math.round(d.x + Math.cos(a) * r), Math.round(d.y + Math.sin(a) * r * 0.6), 2, 1); }
        else if (d.kind === 'rubble') for (let i = 0; i < 30; i++) { ctx.fillStyle = pick(['#3a3a3e', '#4a4a4e', '#2a2a2e']); ctx.fillRect(Math.round(d.x + rnd(-12, 12)), Math.round(d.y + rnd(-6, 6)), rndi(1, 3), rndi(1, 2)); }
        else if (d.kind === 'frost') for (let i = 0; i < 16; i++) { ctx.fillStyle = 'rgba(160,220,255,0.18)'; ctx.fillRect(Math.round(d.x + rnd(-14, 14)), Math.round(d.y + rnd(-7, 7)), rndi(1, 4), 1); }
        else if (d.kind === 'corpse') this.bakeCorpse(ctx, d);
      }
      G.decalQueue.length = 0;
      this.decalDirty = true;
    }
    const now = performance.now();
    if (this.decalDirty && now - this.decalT > 250) { this.decalTex.refresh(); this.decalDirty = false; this.decalT = now; }
  }
  bakeCorpse(ctx: CanvasRenderingContext2D, d: any) {
    const meta = SHEETS[d.spr]; if (!meta) return;
    const img = this.scene.textures.get(d.spr).getSourceImage() as HTMLImageElement;
    const fx = meta.anims.idle[0] * meta.fw;
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.translate(Math.round(d.x), Math.round(d.y));
    ctx.rotate((d.face < 0 ? -1 : 1) * Math.PI / 2);
    const R = (meta as any).res || T;
    ctx.drawImage(img, fx, 0, meta.fw, meta.fh, -meta.fw / R / 2, -meta.fh / R, meta.fw / R, meta.fh / R);
    ctx.restore();
  }

  // ---------- ground layer graphics ----------
  drawGround(ox: number, oy: number, now: number) {
    const g = this.gGround; g.clear();
    for (const h of G.hazards) {
      const a = h.t > h.life - 0.6 ? (h.life - h.t) / 0.6 : 1;
      const c = h.kind === 'fire' ? PAL.fireD : h.kind === 'frost' ? '#a8e0ff' : h.kind === 'rift' ? PAL.arcaneD : h.kind === 'blood' ? PAL.blood : '#7fff5a';
      const n = Math.round(h.r * 1.4), seed = h.x * 13 + h.y * 7;
      for (let i = 0; i < n; i++) {
        const ang = (((seed + i * 137.5) % 360) * Math.PI) / 180, rr = (((i * 53 + seed) % 100) / 100) * h.r;
        g.fillStyle(h.kind === 'fire' && Math.random() < 0.3 ? col(PAL.fire) : col(c), 0.55 * a);
        g.fillRect(Math.round(h.x + Math.cos(ang) * rr), Math.round(h.y + Math.sin(ang) * rr * 0.55), 2, 1);
      }
      if (h.kind === 'rift' || h.kind === 'blood') this.ellipse(g, h.x, h.y, h.r, h.r * 0.55, h.kind === 'rift' ? PAL.arcane : '#c03030', 0.6 * a);
    }
    for (const r of G.rings) if (r.ground) this.ring(g, r);
    for (const w of G.waveFx) { this.ellipse(g, w.x, w.y, w.r, w.r * 0.6, PAL.necro, 1); this.ellipse(g, w.x, w.y, w.r - 3, (w.r - 3) * 0.6, PAL.necroD, 1); }
    if (G.keep.ward > 0) this.ellipse(g, KEEP.x, KEEP.y - 10, 72 + Math.sin(G.time * 6) * 2, 58, PAL.necro, 0.9);
    for (const e of G.enemies) if (e.champion || e.boss) this.ellipse(g, e.x, e.y, e.rad * 1.6 + Math.sin(G.time * 5), e.rad * 0.7, e.boss ? PAL.holy : PAL.gold, 0.9, 2);
    for (const u of G.units) if (u.summon) this.ellipse(g, u.x, u.y, u.rad * 1.4, u.rad * 0.55, PAL.necro, 0.5, 3);
    this.drawBuildOverlay(g);
    const s = G.selected;
    if (s && !s.dead && s.kind === 'tower') {
      const st = towerStats(s);
      this.ellipse(g, s.x, s.y, st.range, st.range * 0.75, '#e8e0c0', 0.8, 2);
    } else if (s && !s.dead && s.kind === 'fort' && s.def.radius) this.ellipse(g, s.x, s.y, s.def.radius, s.def.radius * 0.7, '#e8e0c0', 0.8, 2);
  }

  /** Rampart sites: shown while building ramparts or when a site is selected. */
  drawSites(g: Phaser.GameObjects.Graphics) {
    const b = G.build, sel = G.selected && G.selected.kind === 'site' ? G.selected.siteId : null;
    const mode = b && b.kind === 'site';
    if (!mode && !sel) return;
    const hov = mode && G.mouse.onCanvas ? siteAtCell(...worldToCell(G.mouse.world[0], G.mouse.world[1])) : null;
    for (const site of G.map.sites || []) {
      const t = siteTier(site), on = hov === site || sel === site.id;
      if (!mode && !on) continue;
      const ok = !t && wallSlotsFree() > 0;
      const c = on ? (t ? 0xe8e0c0 : ok ? 0x5dff7a : 0xff5050) : t ? 0xc8b890 : 0x8a8478;
      g.fillStyle(c, on ? 0.32 : t ? 0.12 : 0.26);
      for (const [x, y] of site.cells) g.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
      g.fillStyle(c, on ? 0.95 : 0.8);
      for (const [x, y] of site.cells) { // corner ticks per cell
        const X = x * CELL, Y = y * CELL;
        g.fillRect(X, Y, 3, SC); g.fillRect(X, Y, SC, 3); g.fillRect(X + CELL - 3, Y + CELL - SC, 3, SC); g.fillRect(X + CELL - SC, Y + CELL - 3, SC, 3);
      }
      if (on) {
        const label = t ? WALL_TIERS[t].name : ok ? 'raise' : 'no slots';
        const top = site.cells.reduce((m: number, c: number[]) => Math.min(m, c[1]), 99), xs = site.cells.map((c: number[]) => c[0]);
        const lx = (Math.min(...xs) + Math.max(...xs) + 1) / 2 * CELL;
        this.text(g, label, lx, Math.max(2, top * CELL - 9), c, 1);
      }
    }
  }

  drawBuildOverlay(g: Phaser.GameObjects.Graphics) {
    this.drawSites(g);
    this.drawPlots(g);
    const b = G.build; if (!b || !G.mouse.onCanvas || b.kind === 'site' || b.kind === 'tower' || b.kind === 'building') return;
    const [wx, wy] = G.mouse.world;
    const size = b.kind === 'tower' ? 2 : 1;
    const cx = Math.floor(wx / CELL - (size === 2 ? 0.5 : 0)), cy = Math.floor(wy / CELL - (size === 2 ? 0.5 : 0));
    g.fillStyle(0xc8c8b4, 0.14);
    for (let y = cy - 6; y <= cy + 7; y++) for (let x = cx - 8; x <= cx + 9; x++) {
      if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
      const i = cellIdx(x, y);
      if (G.map.obstacle[i] || G.map.reserved[i] || G.map.struct[i]) continue;
      g.fillRect(x * CELL, y * CELL, SC, SC);
    }
    if (b.kind === 'spell') { const r = SPELLS[b.type].radius || 40; this.ellipse(g, wx, wy, r, r * 0.7, PAL.necro, 0.9); this.ellipse(g, wx, wy, r - 2, (r - 2) * 0.7, PAL.necroD, 0.8, 2); return; }
    const ok = canBuildAt(cx, cy, size, size) && trapSlotsFree() > 0;
    b.cx = cx; b.cy = cy; b.ok = ok;
    g.fillStyle(ok ? 0x5dff7a : 0xff4040, 0.35);
    g.fillRect(cx * CELL, cy * CELL, size * CELL, size * CELL);
    if (b.kind === 'tower') { const range = TOWERS[b.type].range * (1 + G.run.m.range); this.ellipse(g, (cx + 1) * CELL, (cy + 1) * CELL + 6, range, range * 0.75, ok ? '#c8ffd0' : '#ff8080', 0.7, 2); }
    else if (b.kind === 'fort' && FORTS[b.type].radius) this.ellipse(g, cx * CELL + 8, cy * CELL + 8, FORTS[b.type].radius, FORTS[b.type].radius * 0.7, '#c8ffd0', 0.7, 2);
  }

  ellipse(g: Phaser.GameObjects.Graphics, x: number, y: number, rx: number, ry: number, c: string, alpha = 1, step = 1) {
    g.fillStyle(col(c), alpha);
    const n = Math.max(12, Math.round((rx + ry) * 1.6));
    const n2 = n * T; // one dot per texel: crisp, thin rings
    for (let i = 0; i < n2; i += step) { const a = (i / n2) * TAU; g.fillRect(snap(x + Math.cos(a) * rx), snap(y + Math.sin(a) * ry), SC, SC); }
  }
  ring(g: Phaser.GameObjects.Graphics, r: any) {
    const k = r.t / r.life, rad = lerp(r.r0, r.r1, Math.sqrt(k));
    this.ellipse(g, r.x, r.y, rad, r.ground ? rad * 0.6 : rad, r.color, 1 - k);
  }
  line(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, c: number, alpha = 1, th = 1) {
    g.fillStyle(c, alpha);
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    const m = n * T, w = th === 1 ? SC * 1.5 : th; // 1-px lines become ~1.5-texel strokes
    for (let i = 0; i <= m; i++) g.fillRect(snap(x0 + ((x1 - x0) * i) / m - w / 2), snap(y0 + ((y1 - y0) * i) / m - w / 2), w, w);
  }

  // ---------- projectiles, particles, lightning ----------
  drawFx(ox: number, oy: number) {
    const g = this.gFx; g.clear();
    const vw = this.viewW, vh = this.viewH;
    const inView = (x: number, y: number) => x > ox - 40 && x < ox + vw + 40 && y > oy - 40 && y < oy + vh + 40;
    for (const [a, b] of G.netArcs) if (Math.random() < 0.6) this.jagged(g, a.x, a.y - 34, b.x, b.y - 34, 0x9fe6ff);
    for (const p of G.projectiles) if (inView(p.x, p.y)) this.projectile(g, p);
    for (const p of G.particles) {
      if (!inView(p.x, p.y)) continue;
      const a = clamp(p.life / p.max, 0, 1);
      if (p.type === 'smoke') { const s = Math.round(p.size + (1 - a) * 4); g.fillStyle(0x3a3836, a * 0.5); g.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s); continue; }
      g.fillStyle(col(p.color), p.type === 'soul' ? 1 : Math.min(1, a * 1.5));
      const ps = Math.max(SC, p.size * 0.75);
      g.fillRect(snap(p.x), snap(p.y), snap(ps), snap(ps));
    }
    for (const r of G.rings) if (!r.ground) this.ring(g, r);
    for (const b of G.bolts) {
      const a = 1 - b.t / b.life;
      for (let i = 0; i < b.pts.length - 1; i++) this.line(g, b.pts[i][0], b.pts[i][1], b.pts[i + 1][0], b.pts[i + 1][1], i % 3 === 0 ? 0xffffff : col(b.color), a, b.w);
    }
  }
  jagged(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, c: number) {
    const n = Math.max(2, Math.floor(dist(x0, y0, x1, y1) / 10));
    let px = x0, py = y0;
    for (let i = 1; i <= n; i++) { const t = i / n; const nx = lerp(x0, x1, t) + (i < n ? rnd(-4, 4) : 0), ny = lerp(y0, y1, t) + (i < n ? rnd(-4, 4) : 0); this.line(g, px, py, nx, ny, i % 2 ? c : 0xffffff); px = nx; py = ny; }
  }
  projectile(g: Phaser.GameObjects.Graphics, p: any) {
    const x = Math.round(p.x), y = Math.round(p.y), c = Math.cos(p.ang), s = Math.sin(p.ang);
    const R = (xx: number, yy: number, w: number, h: number, cc: string) => { g.fillStyle(col(cc), 1); g.fillRect(xx, yy, w, h); };
    switch (p.kind) {
      case 'arrow': case 'bolt': this.line(g, x - c * 5, y - s * 5, x, y, col(p.kind === 'bolt' ? '#8a7a60' : PAL.boneD)); R(x, y, 1, 1, '#dddddd'); break;
      case 'bonebolt': this.line(g, x - c * 9, y - s * 9, x, y, col(PAL.bone), 1, 2); R(x - 1, y - 1, 2, 2, '#ffffff'); break;
      case 'fireball': case 'meteor': {
        const r = p.kind === 'meteor' ? 3 : 2;
        if (p.dur) { const k = Math.min(1, p.t / p.dur); g.fillStyle(0x000000, 0.3); g.fillRect(Math.round(lerp(p.sx, p.tx, k)) - 3, Math.round(lerp(p.sy, p.ty, k)) - 1, 6, 2); }
        R(x - r - 1, y - r, r * 2 + 2, r * 2, PAL.fireD); R(x - r, y - r - 1, r * 2, r * 2 + 2, PAL.fireD);
        R(x - r, y - r, r * 2, r * 2, PAL.fire); R(x - r + 1, y - r + 1, r, r, PAL.fireL);
        if (p.kind === 'meteor') this.line(g, x + 2, y - 2, x + 10, y - 16, col(PAL.fireD), 1, 2);
        break;
      }
      case 'boulder': R(x - 2, y - 2, 4, 4, '#5a5450'); R(x - 2, y - 2, 2, 2, '#7a7470'); break;
      case 'necrobolt': case 'soulbolt': case 'lichbolt': R(x - 2, y - 1, 4, 3, PAL.necroD); R(x - 1, y - 1, 3, 2, PAL.necro); R(x, y, 1, 1, '#efffef'); break;
      case 'frostbolt': R(x - 2, y - 1, 4, 3, PAL.frostD); R(x - 1, y - 1, 2, 2, PAL.frost); R(x, y, 1, 1, '#ffffff'); break;
      case 'holybolt': case 'holyfire': R(x - 2, y - 1, 4, 3, PAL.holyD); R(x - 1, y - 1, 2, 2, PAL.holy); break;
      case 'arcanebolt': R(x - 1, y - 1, 3, 3, PAL.arcaneD); R(x, y, 1, 1, '#f0dcff'); break;
      case 'bonespit': R(x - 1, y - 1, 3, 2, PAL.bone); break;
      case 'firebreath': R(x - 2, y - 2, 4, 4, PAL.fire); R(x - 1, y - 1, 2, 2, PAL.fireL); break;
      default: R(x, y, 2, 2, '#ffffff');
    }
  }

  // ---------- lighting ----------
  drawLighting(ox: number, oy: number, now: number) {
    const vw = this.viewW, vh = this.viewH, M = G.map;
    const lights: [number, number, number, string, number][] = [];
    const add = (x: number, y: number, r: number, c: string, i = 1) => { if (lights.length >= this.stamps.length || x + r < ox || x - r > ox + vw || y + r < oy || y - r > oy + vh) return; lights.push([x - ox, y - oy, r, c, i]); };
    const flick = Math.sin(now / 90) * 0.06 + Math.random() * 0.05;
    for (const p of M.props) if (p.light) add(p.x, p.y - 14, p.light.r * (p.light.flicker ? 1 + flick : 1), p.light.color, 1);
    add(KEEP.x, KEEP.y0 + 30, 64, M.theme.windowGlow, 0.9);
    add(LICH_POS.x, LICH_POS.y - 20, 46, PAL.necro, 1);
    for (const l of FORT_LIGHTS) add(l.x, l.y, l.r * (l.flicker ? 1 + flick : 1), l.color, 0.9);
    add(WELL_POS.x, WELL_POS.y - 4, 48, PAL.necro, 1);
    const tc: Record<string, string> = { brimstone: PAL.fire, tesla: '#9fe6ff', necrotic: PAL.necro, frost: PAL.frost, artillery: '#c8c0a8', harvester: '#7dffb0', arcane: PAL.arcane, abomination: '#ff5a3a' };
    for (const t of G.towers) add(t.x, t.y - 32, 38 + t.tier * 10 + (t.fireT > 0 ? 14 : 0), tc[t.type], t.silT > 0 ? 0.3 : 0.9);
    for (const f of G.forts) { if (f.type === 'lava') add(f.x, f.y, 22, PAL.fire, 0.7); else if (f.type === 'rune' && f.trapT <= 0) add(f.x, f.y, 14, PAL.necro, 0.6); else if (f.type === 'ward') add(f.x, f.y - 6, 24, '#4aa8ff', 0.7); }
    const pc: Record<string, string> = { fireball: PAL.fire, meteor: PAL.fire, necrobolt: PAL.necro, soulbolt: PAL.necro, lichbolt: PAL.necro, frostbolt: PAL.frost, holybolt: PAL.holy, holyfire: '#ffcc66', arcanebolt: PAL.arcane, firebreath: PAL.fire };
    for (const p of G.projectiles) { const c = pc[p.kind]; if (c) add(p.x, p.y, p.kind === 'meteor' ? 36 : 20, c, 0.8); }
    for (const f of G.flashes) add(f.x, f.y, f.r, f.color, 1 - f.t / f.life);
    for (const h of G.hazards) if (h.kind === 'fire') add(h.x, h.y, h.r + 14, PAL.fire, 0.5); else if (h.kind === 'rift') add(h.x, h.y, h.r + 10, PAL.arcane, 0.6);
    for (const b of G.bolts) { const p = b.pts[b.pts.length - 1]; add(p[0], p[1], 34, b.color, (1 - b.t / b.life) * 0.9); }
    let lit = 0;
    for (const e of G.enemies) { if (e.def.holy || e.boss) add(e.x, e.y - 10, e.boss ? 50 : 22, PAL.holy, 0.45); else if (lit++ < 120) add(e.x, e.y - 8, 16, '#ffd0a0', 0.35); }
    for (const u of G.units) { if (u.summon) add(u.x, u.y - 16, 36, u.type === 'dragon' ? PAL.fire : PAL.necro, 0.5); else if (lit++ < 200) { const tg = TIER_GLOW[u.tier || 0]; if (tg) add(u.x, u.y - 10, tg.r * (1 + Math.sin(now / 260 + u.id) * 0.12), tg.color, tg.a); else add(u.x, u.y - 8, 14, '#c8ffd0', 0.25); } }
    for (const w of G.waveFx) add(w.x, w.y, w.r + 20, PAL.necro, 0.4);
    let sc = 0; for (const p of G.particles) if (p.type === 'soul' && sc++ < 30) add(p.x, p.y, 8, PAL.necro, 0.6);
    const amb = M.theme.ambient * (G.phase === 'prep' ? 0.9 : 1);
    this.dark.clear(); this.dark.fill(0x04060a, amb);
    this.glow.clear();
    const used: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < lights.length; i++) {
      const [x, y, r, c, a] = lights[i];
      const st = this.stamps[i];
      st.setTexture('light_' + lightBucket(r * T)).setPosition(Math.round(x * T), Math.round(y * T)).setAlpha(clamp(a, 0, 1)).clearTint();
      used.push(st);
    }
    if (used.length) this.dark.erase(used);
    for (let i = 0; i < used.length; i++) { const [, , , c, a] = lights[i]; used[i].setTint(col(c)).setAlpha(clamp(a, 0, 1) * 0.22); }
    if (used.length) this.glow.draw(used);
    this.dark.setAlpha(1);
  }

  // ---------- overlay (unlit) ----------
  drawOverlay(ox: number, oy: number) {
    const g = this.gOver; g.clear();
    const vw = this.viewW, vh = this.viewH;
    if (G.tdT > 0) { g.fillStyle(0x508cc8, 0.1); g.fillRect(ox, oy, vw, vh); }
    if (G.frenzyT > 0) { g.fillStyle(0xa01414, 0.06); g.fillRect(ox, oy, vw, vh); }
    if (G.mightT > 0) { g.fillStyle(0x30c050, 0.05); g.fillRect(ox, oy, vw, vh); }
    if (G.flash > 0) { g.fillStyle(0xfffae6, Math.min(0.5, G.flash)); g.fillRect(ox, oy, vw, vh); }
    if (G.keep.hp < G.keep.maxHp) this.bar(g, LICH_POS.x, LICH_POS.y - 44, 60, G.keep.hp / G.keep.maxHp, 0x3fae5a);
    const bars = (e: any) => {
      if (e.dead || (e.hp >= e.maxHp && !e.champion) || e.boss) return;
      const h = e.kind === 'tower' ? 44 + e.tier * 4 : e.kind === 'fort' ? 14 : ((SHEETS[e.spr] && SHEETS[e.spr].H) || 20) + e.alt + 4;
      const w = e.kind === 'tower' ? 20 : e.kind === 'fort' ? 12 : Math.max(10, Math.round(e.rad * 2.2));
      this.bar(g, e.x, e.y - h, w, e.hp / e.maxHp, e.team === 'u' ? (e.kind === 'unit' ? 0x5dff7a : 0x9ab0c8) : e.champion ? 0xd6a940 : 0xe04040);
    };
    const inView = (x: number, y: number) => x > ox - 30 && x < ox + vw + 30 && y > oy - 30 && y < oy + vh + 60;
    for (const e of G.enemies) if (inView(e.x, e.y)) bars(e);
    // a huge host only shows the bars of badly wounded undead (thousands of bars would swamp the overlay)
    const uMin = G.units.length > 800 ? 0.6 : 1;
    for (const u of G.units) if ((uMin >= 1 || u.hp < u.maxHp * uMin) && inView(u.x, u.y)) bars(u);
    for (const t of G.towers) if (inView(t.x, t.y)) bars(t);
    for (const f of G.forts) if (f.def.hp && inView(f.x, f.y)) bars(f);
    for (const t of G.texts) { const a = 1 - t.t / t.life; this.text(g, t.s, t.x, t.y - t.t * 14, col(t.color), Math.min(1, a * 2), t.big ? 1.5 : 1); }
    const s = G.selected;
    if (s && !s.dead && (s.kind === 'tower' || s.kind === 'building')) {
      const x = s.cx * CELL, y = s.cy * CELL; g.fillStyle(0xe8e0c0, 1);
      [[0, 0], [31, 0], [0, 31], [31, 31]].forEach(([dx, dy]) => { g.fillRect(x + dx - (dx ? 2 : 0), y + dy, 3, 1); g.fillRect(x + dx, y + dy - (dy ? 2 : 0), 1, 3); });
    }
    if (G.phase === 'wave') {
      let n = 0;
      for (const e of G.enemies) {
        if (e.x > ox && e.x < ox + vw && e.y > oy && e.y < oy + vh) continue;
        if (n++ > 50) break;
        g.fillStyle(e.boss ? 0xd6a940 : 0xc03030, 1);
        g.fillRect(Math.round(clamp(e.x, ox + 3, ox + vw - 4)) - 1, Math.round(clamp(e.y, oy + 3, oy + vh - 4)) - 1, e.boss ? 4 : 2, e.boss ? 4 : 2);
      }
    }
  }
  bar(g: Phaser.GameObjects.Graphics, cx: number, y: number, w: number, k: number, c: number) {
    const x = snap(cx - w / 2); y = snap(y);
    g.fillStyle(0x000000, 0.9); g.fillRect(x - SC, y - SC, w + 2 * SC, 1 + 2 * SC);
    g.fillStyle(0x2a0a0a, 1); g.fillRect(x, y, w, 1);
    const fw = Math.max(SC, snap(w * clamp(k, 0, 1)));
    g.fillStyle(c, 1); g.fillRect(x, y, fw, 1);
    g.fillStyle(0xffffff, 0.25); g.fillRect(x, y, fw, SC); // lit top texel
  }
  text(g: Phaser.GameObjects.Graphics, s: string, x: number, y: number, c: number, alpha: number, scale = 1) {
    s = s.toLowerCase();
    // digits/signs: 5×10 texel glyphs (advance 3 world px); letters: 3×5 world-px glyphs (advance 4)
    const adv = (ch: string) => (PX_DIGITS[ch] ? 3 : 4) * scale;
    let w = -scale; for (let i = 0; i < s.length; i++) w += adv(s[i]);
    x = Math.round(x - w / 2); y = Math.round(y);
    const draw = (dx: number, dy: number, cc: number) => {
      g.fillStyle(cc, alpha);
      let cx = x + dx;
      for (let i = 0; i < s.length; i++) {
        const ch = s[i], dg = PX_DIGITS[ch];
        if (dg) { const t = SC * scale; for (const [rx, ry, rw] of glyphRuns(ch, dg)) g.fillRect(cx + rx * t, y + dy + ry * t, rw * t, t); }
        else { const gl = PX_FONT[ch]; if (gl) for (let p = 0; p < 15; p++) if (gl[p] === '1') g.fillRect(cx + (p % 3) * scale, y + dy + Math.floor(p / 3) * scale, scale, scale); }
        cx += adv(ch);
      }
    };
    // 1-texel ink outline (8 directions so the thin digit strokes stay legible on any ground)
    const o = SC * Math.max(1, Math.round(scale));
    for (const [ox, oy] of [[o, 0], [-o, 0], [0, o], [0, -o], [o, o], [-o, o], [o, -o], [-o, -o]]) draw(ox, oy, 0);
    draw(0, 0, c);
  }
}

const RUNS: Record<string, number[][]> = {};
/** Horizontal runs [x, y, w] of a 5-wide glyph, cached: far fewer rects per number. */
function glyphRuns(ch: string, gl: string) {
  let r = RUNS[ch]; if (r) return r;
  r = RUNS[ch] = [];
  for (let y = 0; y < 10; y++) for (let x = 0; x < 5; x++) {
    if (gl[y * 5 + x] !== '1') continue;
    let w = 1; while (x + w < 5 && gl[y * 5 + x + w] === '1') w++;
    r.push([x, y, w]); x += w - 1;
  }
  return r;
}

function lightBucket(r: number) { return clamp(Math.round(r / 8) * 8, 8, 256); }
function nearestShadow(w: number) { const s = [8, 12, 16, 24, 32, 48]; let b = s[0]; for (const v of s) if (Math.abs(v - w) < Math.abs(b - w)) b = v; return b; }

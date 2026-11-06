// The single gameplay scene: drives the fixed-step simulation, the renderer,
// world input (build/select/pan/zoom) and the DOM UI.
import * as Phaser from 'phaser';
import { G } from '../core/state';
import { clamp, dist2 } from '../core/util';
import { CELL, KEEP, WELL_POS, WW, WH } from '../config/constants';
import { WorldRenderer } from '../render/WorldRenderer';
import { step, castSpell, resetWorld } from '../systems/campaign';
import { stepVisual } from '../systems/fx';
import { placeTower, placeFort } from '../systems/combat';
import { canBuildAt, worldToCell, cellIdx, generateMap } from '../world/mapgen';
import { loadMeta, saveRun, saveMeta, saveRunSoon } from '../systems/save';
import { UI } from '../ui/ui';
import { initAudio, startMusic } from '../audio/audio';
import { hooks } from '../core/events';
import { applyZoom, VIEW } from '../config/zoom';

export class GameScene extends Phaser.Scene {
  renderer2!: WorldRenderer;
  menuMap: any;
  drag: any = null;
  constructor() { super('game'); }

  create() {
    loadMeta();
    initAudio(this);
    this.renderer2 = new WorldRenderer(this);
    applyZoom(this.game);
    this.renderer2.resize(this.scale.width, this.scale.height);
    this.cameras.main.setOrigin(0, 0).setZoom(VIEW.cz);
    this.scale.on('resize', (s: any) => this.renderer2.resize(s.width, s.height));
    UI.init(this.game);
    this.menuMap = generateMap(1337, 'haunted');
    (window as any).__toMenu = () => { resetWorld(); G.map = this.menuMap; G.rallies = []; };
    (window as any).__toMenu();
    UI.showMenu();
    this.bindInput();
    window.addEventListener('beforeunload', () => { if (G.phase === 'prep' || G.phase === 'wave') saveRun(); saveMeta(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && G.phase === 'prep') saveRun(); });
  }

  worldToScreen = (x: number, y: number): [number, number] => {
    const cam = this.cameras.main, z = VIEW.cz * VIEW.pz, rect = this.game.canvas.getBoundingClientRect();
    return [(x - cam.scrollX) * z + rect.left, (y - cam.scrollY) * z + rect.top];
  };

  update(_t: number, deltaMs: number) {
    const dt = Math.min(0.1, deltaMs / 1000);
    try {
      if (G.phase === 'menu') {
        G.time += dt;
        G.camera.x = 520 + Math.sin(G.time * 0.05) * 320; G.camera.y = KEEP.y + Math.cos(G.time * 0.04) * 90;
        stepVisual(dt, WELL_POS.x, WELL_POS.y - 14);
      } else if (G.run) {
        if (!G.modal && G.run.pendingLevels > 0 && G.phase !== 'over' && !UI.screenOpen()) UI.showLevelUp();
        const paused = G.paused || !!G.modal || UI.screenOpen();
        if (!paused) {
          let sim = dt * (G.phase === 'over' ? 1 : G.speed);
          while (sim > 1e-6) { const s = Math.min(sim, 1 / 30); step(s); stepVisual(s, WELL_POS.x, WELL_POS.y - 14); sim -= s; }
        }
        this.panKeys(dt);
      }
      this.renderer2.render(dt, performance.now());
      UI.update(dt, this.worldToScreen);
    } catch (err: any) {
      console.error(err);
      if (!(window as any).__errShown) { (window as any).__errShown = true; hooks.msg('Error: ' + err.message, '#ff6060'); }
    }
  }

  panKeys(dt: number) {
    const k = UI.keys || {}, sp = 420 * dt;
    if (k['a'] || k['arrowleft']) G.camera.x -= sp;
    if (k['d'] || k['arrowright']) G.camera.x += sp;
    if (k['w'] || k['arrowup']) G.camera.y -= sp;
    if (k['s'] || k['arrowdown']) G.camera.y += sp;
  }

  bindInput() {
    this.input.mouse?.disableContextMenu();
    const updateMouse = (p: Phaser.Input.Pointer) => { G.mouse.world = [p.worldX, p.worldY]; G.mouse.sx = p.x; G.mouse.sy = p.y; G.mouse.onCanvas = true; };
    this.game.canvas.addEventListener('mouseleave', () => { G.mouse.onCanvas = false; });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      updateMouse(p);
      if (this.drag) {
        G.camera.x = this.drag.cx - (p.x - this.drag.x); G.camera.y = this.drag.cy - (p.y - this.drag.y);
        if (Math.abs(p.x - this.drag.x) + Math.abs(p.y - this.drag.y) > 3) this.drag.moved = true;
      }
      if (p.leftButtonDown() && G.build && G.build.kind === 'fort') this.tryPlace(true);
      this.hoverTip(p);
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      startMusic();
      if (G.phase === 'menu' || !G.run) return;
      updateMouse(p);
      if (p.rightButtonDown() || p.middleButtonDown() || (p.wasTouch && !G.build)) { this.drag = { x: p.x, y: p.y, cx: G.camera.x, cy: G.camera.y, moved: false, right: p.rightButtonDown(), touch: p.wasTouch }; return; }
      if (G.build) this.tryPlace(false); else this.selectAt(p.worldX, p.worldY);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.drag) {
        if (!this.drag.moved && this.drag.right) { G.build = null; G.selected = null; UI.renderBuild(); }
        if (!this.drag.moved && this.drag.touch && G.run) this.selectAt(p.worldX, p.worldY);
        this.drag = null;
      }
    });
    this.input.on('wheel', (_p: any, _o: any, _dx: number, dy: number) => {
      const z = clamp((G.settings.zoom || 0) + (dy < 0 ? 1 : -1), -2, 3);
      if (z !== G.settings.zoom) { G.settings.zoom = z; applyZoom(this.game); }
    });
  }

  tryPlace(painting: boolean) {
    const b = G.build; if (!b) return;
    const [wx, wy] = G.mouse.world, r = G.run;
    if (b.kind === 'spell') { if (castSpell(b.type, wx, wy)) G.build = null; return; }
    const size = b.kind === 'tower' ? 2 : 1;
    const cx = Math.floor(wx / CELL - (size === 2 ? 0.5 : 0)), cy = Math.floor(wy / CELL - (size === 2 ? 0.5 : 0));
    if (painting && b.lastCell === cx + ',' + cy) return;
    b.lastCell = cx + ',' + cy;
    if (r.souls < b.cost) { if (!painting) { hooks.sfx('error'); hooks.msg('Not enough souls.', '#ff8080'); } return; }
    if (!canBuildAt(cx, cy, size, size)) { if (!painting) hooks.sfx('error'); return; }
    r.souls -= b.cost;
    if (b.kind === 'tower') { const t = placeTower(b.type, cx, cy, 0, { invested: b.cost }); G.build = null; G.selected = t; UI.renderBuild(); }
    else placeFort(b.type, cx, cy);
    hooks.sfx('build');
    saveRunSoon();
  }

  selectAt(wx: number, wy: number) {
    const [cx, cy] = worldToCell(wx, wy + 6);
    const s = G.map.struct[cellIdx(cx, cy)] || G.map.struct[cellIdx(...worldToCell(wx, wy + 16))];
    if (s) { G.selected = s; UI.infoKey = ''; hooks.sfx('click'); return; }
    if (dist2(wx, wy, WELL_POS.x, WELL_POS.y) < 26 * 26) { UI.showWell(); return; }
    const u = G.hashU.nearest(wx, wy + 6, 12);
    if (u) { G.selected = u; UI.infoKey = ''; hooks.sfx('click'); return; }
    G.selected = null;
  }

  hoverTip(p: Phaser.Input.Pointer) {
    if (!G.run || G.phase === 'menu' || G.build || G.modal) { if (this.hovered) { UI.hideTip(); this.hovered = null; } return; }
    const en: any = G.hashE.nearest(p.worldX, p.worldY + 8, 14);
    if (en) {
      this.hovered = en;
      const st = Object.entries(en.st).filter(([k, v]: any) => k.endsWith('T') && v > 0).map(([k]) => k.replace('T', '')).join(', ');
      const rect = this.game.canvas.getBoundingClientRect();
      UI.showTip(null, `<b>${en.name || en.def.name}</b>${en.champion ? ' <span class="gold">CHAMPION</span>' : ''}<br>HP ${Math.ceil(en.hp)}/${en.maxHp} · Armor ${Math.round(en.armor * 100)}%<br><span class="dim">${en.def.desc || en.title || ''}</span>${st ? `<br><span class="good">${st}</span>` : ''}`, rect.left + p.x * this.game.scale.zoom, rect.top + p.y * this.game.scale.zoom - 10);
    } else if (this.hovered) { UI.hideTip(); this.hovered = null; }
  }
  hovered: any = null;
}

// Entry point. Fixed integer-zoom pixel rendering: the canvas is sized to the
// window divided by the largest integer zoom that shows at least
// VIEW_TARGET_W x VIEW_TARGET_H world pixels; no texture smoothing anywhere.
import { UNITS } from './data/units';
import * as ramparts from './systems/ramparts';
import * as keep from './systems/keep';
import { unearthCost } from './data/spells';
import * as Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { G } from './core/state';
import { computeZoom, applyZoom } from './config/zoom';
import * as campaign from './systems/campaign';
import * as combat from './systems/combat';
import * as cards from './systems/cards';
import * as stats from './systems/stats';
import * as progression from './systems/progression';
import { META_BY_ID } from './data/meta';
import { stepVisual } from './systems/fx';
import { canBuildAt } from './world/mapgen';
import { UI, recruit } from './ui/ui';

const z0 = computeZoom().pz;
const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game-root',
  backgroundColor: '#060607',
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  width: Math.ceil(window.innerWidth / z0),
  height: Math.ceil(window.innerHeight / z0),
  zoom: z0,
  scale: { mode: Phaser.Scale.NONE },
  scene: [BootScene, GameScene],
  audio: { disableWebAudio: false },
  fps: { target: 60 },
});
window.addEventListener('resize', () => applyZoom(game));
// Debug/test handle (used by tools/test/*.py; harmless in production).
(window as any).__LICH = { G, game, UI, recruit, unearthCost, UNITS, canBuildAt, stepVisual, META_BY_ID, ...campaign, ...combat, ...cards, ...stats, ...progression, ...ramparts, ...keep };

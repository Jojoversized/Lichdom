// Integer-zoom pixel scaling: the canvas is the window divided by the largest
// integer zoom that keeps at least VIEW_TARGET_W x VIEW_TARGET_H world pixels visible.
import * as Phaser from 'phaser';
import { VIEW_TARGET_W, VIEW_TARGET_H } from './constants';
import { G } from '../core/state';
import { clamp } from '../core/util';

export function computeZoom() {
  const base = clamp(Math.floor(Math.min(window.innerWidth / VIEW_TARGET_W, window.innerHeight / VIEW_TARGET_H)), 1, 8);
  return clamp(base + ((G.settings && G.settings.zoom) || 0), 1, 10);
}
export function applyZoom(game: Phaser.Game) {
  const z = computeZoom();
  game.scale.setZoom(z);
  game.scale.resize(Math.ceil(window.innerWidth / z), Math.ceil(window.innerHeight / z));
}

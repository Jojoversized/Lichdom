// Pixel-perfect scaling with 2x texel density.
//
// Art is authored at TEXEL_RES texels per world pixel (sprites are drawn with
// scale 1/TEXEL_RES). The on-screen size of one world pixel is Z screen pixels,
// split into an integer canvas zoom (pz, CSS upscaling of the canvas) and an
// integer camera zoom (cz, world -> canvas). For even Z every texel lands on
// whole screen pixels; the default always picks an even Z.
import * as Phaser from 'phaser';
import { VIEW_TARGET_W, VIEW_TARGET_H } from './constants';
import { G } from '../core/state';
import { clamp } from '../core/util';

export const TEXEL_RES = 2;
export const VIEW = { Z: 2, pz: 1, cz: 2 };

/** Screen pixels per world pixel. Defaults to the largest even zoom that still
 *  shows ~VIEW_TARGET world pixels; the user zoom setting steps through every integer. */
export function computeZoom() {
  const fit = Math.max(2, Math.floor(Math.min(window.innerWidth / VIEW_TARGET_W, window.innerHeight / VIEW_TARGET_H)));
  const base = fit % 2 ? Math.max(2, fit - 1) : fit;
  const Z = clamp(base + ((G.settings && G.settings.zoom) || 0), 1, 12);
  // smallest camera zoom >= 2 that divides Z keeps the canvas small (Z=1: cz 1)
  let cz = Z;
  for (let k = 2; k <= Z; k++) if (Z % k === 0) { cz = k; break; }
  VIEW.Z = Z; VIEW.cz = cz; VIEW.pz = Z / cz;
  return VIEW;
}
export function applyZoom(game: Phaser.Game) {
  const v = computeZoom();
  game.scale.setZoom(v.pz);
  game.scale.resize(Math.ceil(window.innerWidth / v.pz), Math.ceil(window.innerHeight / v.pz));
  const cam = game.scene.getScene('game')?.cameras?.main;
  if (cam) cam.setOrigin(0, 0).setZoom(v.cz);
}

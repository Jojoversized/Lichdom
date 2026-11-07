// The Lich's necropolis (v0.7.1): the Dreamina fortress art spans the map's left edge at its
// original proportions (no warping); the gameplay follows the art. Everything here is world px.
//
//   wall face — the painted outer face of the fortress per world row (FORT_PROFILE, measured by
//               tools/assets/import_fortress.py); everything left of it is solid.
//   gate      — the gatehouse face; the defence is centred on it:
//               Curtain (inner arc, R_CURTAIN) and Bulwark (outer arc, R_BULWARK) are preset rampart
//               lines whose ends run into the fortress wall / the map edge, so each fully encloses
//               the gate. The undead hold and fight inside DEFENSE_R; buildings stand behind the walls;
//               towers stand on top of built rampart segments.
import { CELL } from '../config/constants';
import { FORT_FIT, FORT_PROFILE, FORT_FIT_LIGHTS, FORT_PORTCULLIS } from './fortress_fit';

/** Centre of the defence: the gatehouse's outer face. */
export const GATE = { x: 256, y: 412 };
export const R_CURTAIN = 140, R_BULWARK = 290;
/** How far from the gate the host forms up and engages (beyond the Bulwark); foes whose attacks reach
 *  into this zone (archers, casters, siege) are engaged too — see `threatensZone`. */
export const DEFENSE_R = R_BULWARK + 64;
/** A foe is fair game for the host when it stands in the defence zone or can hit something inside it. */
export function threatensZone(e: any, margin = 0): boolean {
  return gateDist(e.x, e.y) - (e.range || 0) <= DEFENSE_R + margin;
}

/** x of the fortress's outer face at world y (the fortress fills everything left of it). */
export function fortWallX(wy: number): number {
  return FORT_PROFILE[Math.max(0, Math.min(FORT_PROFILE.length - 1, Math.floor(wy)))];
}
export function insideFort(wx: number, wy: number): boolean { return wx < fortWallX(wy); }
/** Cell centre inside the fortress (solid). */
export function cellInFort(cx: number, cy: number): boolean { return insideFort((cx + 0.5) * CELL, (cy + 0.5) * CELL); }
export function gateDist(wx: number, wy: number): number { return Math.hypot(wx - GATE.x, wy - GATE.y); }

/** Fortress art: one big res-4 image, left-aligned at x = 0, spanning the map's full height, unscaled. */
export const FORT_ART = { key: 'fortress', res: FORT_FIT.res };
export { FORT_PORTCULLIS };

/** Where the Lich stands: on the gatehouse battlements (feet position). */
export const LICH_POS = { x: 172, y: 350 };
/** Torch, portcullis and window glows on the fortress art (world px), lit by the renderer's light buffer. */
export const FORT_LIGHTS = FORT_FIT_LIGHTS;

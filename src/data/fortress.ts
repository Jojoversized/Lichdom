// The Lich's necropolis (v0.7): a colossal fortress whose curtain wall arcs from the top edge of the
// map to the bottom edge on the far left, cut off by the map's left edge (the citadel continues
// beyond the frame). Everything here is world px.
//
//   wall face    — the painted outer face of the fortress art per world row (FORT_PROFILE, generated
//                  by tools/assets/import_fortress.py, which bends the art's wall onto the arc
//                  (OX, OY, R)); everything left of it is solid. Fallback: the arc itself.
//   bailey       — the band between the wall and the curtain rampart: rear construction plots, Soul Well.
//   curtain line — rampart sites rasterised along the arc (OX, OY, R_RAMP), split into five segments.
import { CELL } from '../config/constants';
import { FORT_FIT, FORT_PROFILE, FORT_FIT_LIGHTS } from './fortress_fit';

export const FORT = { ox: FORT_FIT.ox, oy: FORT_FIT.oy, rWall: FORT_FIT.r, rRamp: FORT_FIT.r + 72, rBand: FORT_FIT.r + 38 };

/** x of the fortress's outer face at world y (the fortress fills everything left of it). */
export function fortWallX(wy: number): number {
  if (FORT_PROFILE.length) return FORT_PROFILE[Math.max(0, Math.min(FORT_PROFILE.length - 1, Math.floor(wy)))];
  const dy = wy - FORT.oy;
  return FORT.ox + Math.sqrt(Math.max(0, FORT.rWall * FORT.rWall - dy * dy));
}
export function fortRadius(wx: number, wy: number): number { return Math.hypot(wx - FORT.ox, wy - FORT.oy); }
export function insideFort(wx: number, wy: number): boolean { return wx < fortWallX(wy); }
/** Cell centre inside the fortress (solid). */
export function cellInFort(cx: number, cy: number): boolean { return insideFort((cx + 0.5) * CELL, (cy + 0.5) * CELL); }
/** x of the curtain rampart arc at world y. */
export function rampartX(wy: number): number { return FORT.ox + Math.sqrt(Math.max(0, FORT.rRamp * FORT.rRamp - (wy - FORT.oy) ** 2)); }

/** Fortress art: one big res-4 image, left-aligned at x = 0 and spanning the map's full height. */
export const FORT_ART = { key: 'fortress', res: FORT_FIT.res };

/** Where the Lich stands: on the gatehouse battlements (feet position). */
export const LICH_POS = { x: 165, y: 342 };
/** Torch and portcullis glows on the fortress art (world px), lit by the renderer's light buffer. */
export const FORT_LIGHTS = FORT_FIT_LIGHTS;

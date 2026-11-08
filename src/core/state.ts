// Global game state. The simulation (src/systems) mutates plain data held
// here; the renderer (src/render) reads it and owns every Phaser object.
import { SpatialHash } from './util';

export type Team = 'u' | 'm';
export interface Status { [k: string]: number; }

/** Any simulated thing with a position: units, enemies, towers, forts. */
export interface Ent {
  id: number; kind: 'unit' | 'enemy' | 'tower' | 'fort' | 'keep';
  type: string; def: any; team: Team;
  x: number; y: number; vx?: number;
  hp: number; maxHp: number; armor: number;
  dmg?: number; cd?: number; cdT: number; range?: number; spd?: number;
  dead: boolean; anim: string; at: number; face: number;
  target: any; retT: number; st: Status; hitT: number; rad: number; alt: number;
  flying?: boolean; spr?: string; view?: any; shadow?: any;
  [k: string]: any;
}

export interface FxParticle { x: number; y: number; vx: number; vy: number; color: number; life: number; max: number; type: string; size: number; grav: number; }

export const G: any = {
  map: null, run: null, meta: null, stats: null, settings: null,
  units: [] as Ent[], enemies: [] as Ent[], towers: [] as Ent[], forts: [] as Ent[], buildings: [] as any[],
  projectiles: [] as any[], particles: [] as FxParticle[], hazards: [] as any[], corpses: [] as any[], dying: [] as Ent[],
  texts: [] as any[], bolts: [] as any[], rings: [] as any[], flashes: [] as any[], netArcs: [] as any[], waveFx: [] as any[],
  /** objects whose Phaser views must be destroyed by the renderer */
  retired: [] as any[],
  /** decal stamps (blood/scorch/corpses) for the renderer to bake into the ground layer */
  decalQueue: [] as any[],
  keep: { hp: 1000, maxHp: 1000, ward: 0, flash: 0 },
  lich: { anim: 'idle', at: 0, castT: 0, cdT: 1, face: 1 },
  hashE: new SpatialHash<Ent>(24), hashU: new SpatialHash<Ent>(16), stepN: 0,
  time: 0, speed: 1, paused: false, modal: null as string | null, phase: 'menu' as 'menu' | 'prep' | 'wave' | 'over',
  wave: null, shake: 0, flash: 0, selected: null, build: null, showPlots: false as false | 'mounts' | 'plots', crusadeOffer: null as any, waveSummary: null as any, wards: [] as any[],
  tdT: 0, frenzyT: 0, stormT: 0, extraRaised: 0, citadelRaised: 0, fleshZombies: 0,
  camera: { x: 400, y: 320 }, mouse: { sx: 0, sy: 0, world: [0, 0] as [number, number], down: false },
  bossBar: null, bossIntro: null, speech: null, lastKeepLine: -99, autoT: 0, timers: [] as any[],
};

export function retire(o: any) { if (o && (o.view || o.shadow || o.extraViews)) G.retired.push(o); }

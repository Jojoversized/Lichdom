// Runtime view of assets/data/manifest.json (written by the asset pipeline).
// Filled by BootScene before the game starts.
export interface SheetMeta { file: string; fw: number; fh: number; frames: number; anims?: Record<string, [number, number]>; H?: number; res?: number; flying?: boolean; category?: string; }
export const SHEETS: Record<string, SheetMeta> = {};
export const IMAGES: Record<string, { file: string }> = {};
export const SFX_LIST: string[] = [];

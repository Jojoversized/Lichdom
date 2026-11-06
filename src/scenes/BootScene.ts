// Loads the asset manifest produced by the pipeline, then every sprite sheet,
// icon and sound effect it lists.
import * as Phaser from 'phaser';
import { SHEETS, IMAGES, SFX_LIST } from '../config/manifest';
import { G } from '../core/state';

export class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }
  preload() {
    this.load.json('manifest', 'data/manifest.json');
    this.load.json('sfxlist', 'data/sfx.json');
    this.load.json('manifest_ai', 'data/manifest_ai.json'); // imported AI art (optional)
    const bar = this.add.graphics();
    this.load.on('progress', (p: number) => { bar.clear(); bar.fillStyle(0x1f9c3e, 1); bar.fillRect(20, this.scale.height / 2, (this.scale.width - 40) * p, 4); });
  }
  create() {
    const man = this.cache.json.get('manifest');
    Object.assign(SHEETS, man.sheets); Object.assign(IMAGES, man.images);
    // AI-assisted art (tools/assets/import_ai_sprite.py): new sheets plus `overrides`
    // that point an existing sprite key at an imported sheet. The generated files stay
    // untouched, so removing an override (or enabled: false) restores the original art.
    const ai = this.cache.json.get('manifest_ai');
    if (ai && ai.enabled !== false && (G.settings?.aiArt ?? true)) {
      Object.assign(SHEETS, ai.sheets || {});
      for (const [key, aiKey] of Object.entries<string>(ai.overrides || {})) if (ai.sheets?.[aiKey]) SHEETS[key] = ai.sheets[aiKey];
    }
    SFX_LIST.push(...(this.cache.json.get('sfxlist') || []));
    for (const [key, m] of Object.entries(SHEETS)) this.load.spritesheet(key, m.file, { frameWidth: m.fw, frameHeight: m.fh });
    for (const [key, m] of Object.entries(IMAGES)) this.load.image(key, m.file);
    for (const s of SFX_LIST) this.load.audio('sfx_' + s, `audio/sfx/${s}.wav`);
    this.load.once('complete', () => this.scene.start('game'));
    this.load.start();
  }
}

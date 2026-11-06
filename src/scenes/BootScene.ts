// Loads the asset manifest produced by the pipeline, then every sprite sheet,
// icon and sound effect it lists.
import * as Phaser from 'phaser';
import { SHEETS, IMAGES, SFX_LIST } from '../config/manifest';

export class BootScene extends Phaser.Scene {
  constructor() { super('boot'); }
  preload() {
    this.load.json('manifest', 'data/manifest.json');
    this.load.json('sfxlist', 'data/sfx.json');
    const bar = this.add.graphics();
    this.load.on('progress', (p: number) => { bar.clear(); bar.fillStyle(0x1f9c3e, 1); bar.fillRect(20, this.scale.height / 2, (this.scale.width - 40) * p, 4); });
  }
  create() {
    const man = this.cache.json.get('manifest');
    Object.assign(SHEETS, man.sheets); Object.assign(IMAGES, man.images);
    SFX_LIST.push(...(this.cache.json.get('sfxlist') || []));
    for (const [key, m] of Object.entries(SHEETS)) this.load.spritesheet(key, m.file, { frameWidth: m.fw, frameHeight: m.fh });
    for (const [key, m] of Object.entries(IMAGES)) this.load.image(key, m.file);
    for (const s of SFX_LIST) this.load.audio('sfx_' + s, `audio/sfx/${s}.wav`);
    this.load.once('complete', () => this.scene.start('game'));
    this.load.start();
  }
}

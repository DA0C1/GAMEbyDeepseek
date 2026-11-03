/* 启动：程序化纹理、音频解锁、纸纹 */

import { W } from '../core/config.js';
import { save } from '../core/save.js';
import { audio } from '../core/audio.js';
import { ensureTextures } from '../core/fx.js';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    save.load();
    this.buildUiTextures();
    ensureTextures(this);

    // 音效需要一次用户交互后才能启动
    const unlock = () => {
      audio.ensure();
      audio.setVolumes();
    };
    this.input.on('pointerdown', unlock);
    this.input.keyboard.on('keydown', unlock);

    this.scene.start('Preload');
  }

  buildUiTextures() {
    // 1x1 白，用于绘制矩形
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 4, 4);
    g.generateTexture('white', 4, 4);
    g.clear();

    // 墨点（带柔边）
    for (let i = 0; i < 8; i++) {
      const r = 6 + i * 4;
      g.fillStyle(0x1d1a17, 0.06);
      g.fillCircle(r + 2, r + 2, r);
      g.fillStyle(0x1d1a17, 0.12);
      g.fillCircle(r + 2, r + 2, r * 0.7);
      g.generateTexture('blot' + i, r * 2 + 4, r * 2 + 4);
      g.clear();
    }

    // 宣纸纹理（平铺用小块）
    const c = this.textures.createCanvas('paper_tile', 256, 256);
    if (c) {
      const ctx = c.getContext();
      ctx.fillStyle = '#f0e6d2';
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 2600; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(120,100,70,0.05)' : 'rgba(255,255,255,0.07)';
        ctx.fillRect(x, y, 1, 1);
      }
      for (let i = 0; i < 90; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        ctx.strokeStyle = 'rgba(120,104,80,0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30);
        ctx.stroke();
      }
      c.refresh();
    }

    g.destroy();
  }
}

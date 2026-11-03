/* 预加载：美术与音乐，水墨进度条 */

import { W, H, PAL, FONT } from '../core/config.js';
import { IMAGES, AUDIO, imagePath, audioPath } from '../core/assets.js';

export class PreloadScene extends Phaser.Scene {
  constructor() { super('Preload'); }

  preload() {
    const cx = W / 2;
    const cy = H / 2;

    const label = this.add.text(cx, cy - 70, '展 卷', {
      fontFamily: FONT.song, fontSize: '52px', color: PAL.ink
    }).setOrigin(0.5).setAlpha(0.85);

    const barW = 420;
    const barBg = this.add.graphics();
    barBg.lineStyle(1, 0x1d1a17, 0.25);
    barBg.strokeRect(cx - barW / 2, cy + 10, barW, 3);

    const bar = this.add.graphics();
    const pct = this.add.text(cx, cy + 44, '', {
      fontFamily: FONT.hei, fontSize: '13px', color: PAL.ink3
    }).setOrigin(0.5);

    this.load.on('progress', (v) => {
      bar.clear();
      bar.fillStyle(0x1d1a17, 0.75);
      bar.fillRect(cx - barW / 2, cy + 10, barW * v, 3);
      pct.setText(Math.round(v * 100) + '%');
    });

    this.load.on('loaderror', (file) => {
      // 缺资源时不阻塞，占位在用到时生成
      console.warn('[asset missing]', file.key);
    });

    IMAGES.forEach((key) => {
      this.load.image(key, imagePath(key));
    });
    AUDIO.forEach((key) => {
      this.load.audio(key, audioPath(key));
    });

    this.load.on('complete', () => {
      label.destroy();
      pct.destroy();
      barBg.destroy();
      bar.destroy();
    });
  }

  create() {
    this.scene.start('Title');
  }
}

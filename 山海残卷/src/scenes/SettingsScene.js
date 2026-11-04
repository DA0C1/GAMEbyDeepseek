/* 设置（覆盖层） */

import { W, H, PAL, FONT, DEPTH } from '../core/config.js';
import { save } from '../core/save.js';
import { audio } from '../core/audio.js';
import { text, makeButton, drawPanel } from '../ui/widgets.js';

export class SettingsScene extends Phaser.Scene {
  constructor() { super('Settings'); }

  init(data) { this.from = (data && data.from) || 'Title'; }

  create() {
    const refreshers = [];
    let didReset = false;
    this.add.rectangle(W / 2, H / 2, W, H, 0x12100c, 0.72).setDepth(DEPTH.overlay);
    const g = this.add.graphics().setDepth(DEPTH.overlay + 1);
    drawPanel(g, W / 2 - 330, 160, 660, 560, { fill: 0xfaf4e6, alpha: 0.98, gold: true });

    text(this, W / 2, 220, '心　法', 42, { originX: 0.5, color: PAL.ink }).setDepth(DEPTH.overlay + 2);

    const mkSlider = (label, key, y) => {
      text(this, W / 2 - 250, y, label, 18, {
        font: FONT.hei, color: PAL.ink2
      }).setDepth(DEPTH.overlay + 2);

      const valT = text(this, W / 2 + 250, y, '', 18, {
        font: FONT.mono, color: PAL.cinnabar, originX: 1
      }).setDepth(DEPTH.overlay + 2);

      const refresh = () => {
        valT.setText(Math.round(save.data.settings[key] * 100) + '%');
      };
      refreshers.push(refresh);
      refresh();

      makeButton(this, W / 2 + 60, y - 10, 60, 42, '−', () => {
        save.data.settings[key] = Math.max(0, +(save.data.settings[key] - 0.1).toFixed(2));
        audio.setVolumes();
        save.write();
        refresh();
      }, { size: 24, depth: DEPTH.overlay + 2 });

      makeButton(this, W / 2 + 130, y - 10, 60, 42, '＋', () => {
        save.data.settings[key] = Math.min(1, +(save.data.settings[key] + 0.1).toFixed(2));
        audio.setVolumes();
        save.write();
        refresh();
      }, { size: 24, depth: DEPTH.overlay + 2 });
    };

    mkSlider('背景音乐', 'music', 310);
    mkSlider('音　　效', 'sfx', 388);

    // 震动
    text(this, W / 2 - 250, 470, '屏幕震动', 18, { font: FONT.hei, color: PAL.ink2 }).setDepth(DEPTH.overlay + 2);
    const shakeBtn = makeButton(this, W / 2 + 60, 456, 130, 42, save.data.settings.shake ? '开' : '关', () => {
      save.data.settings.shake = !save.data.settings.shake;
      shakeBtn.list[1].setText(save.data.settings.shake ? '开' : '关');
      save.write();
      audio.sfx('click');
    }, { size: 20, depth: DEPTH.overlay + 2 });

    // 重置
    let confirm = false;
    const resetBtn = makeButton(this, W / 2 - 250, 530, 220, 46, '清除进度', () => {
      if (!confirm) {
        confirm = true;
        resetBtn.list[1].setText('再点一次确认');
        resetBtn.list[1].setColor(PAL.cinnabar);
        return;
      }
      if (didReset) return;
      save.reset();
      didReset = true;
      audio.setVolumes();
      refreshers.forEach(refresh => refresh());
      shakeBtn.list[1].setText(save.data.settings.shake ? '开' : '关');
      audio.sfx('debuff');
      resetBtn.list[1].setText('已清除');
      resetBtn.zone.disableInteractive();
    }, { size: 16, depth: DEPTH.overlay + 2 });

    makeButton(this, W / 2 - 110, H - 200, 220, 56, '返　回', () => {
      if (didReset && this.from === 'Title') {
        this.scene.stop('Title');
        this.scene.start('Title');
        return;
      }
      this.scene.stop();
      const prev = this.scene.get(this.from);
      if (prev) this.scene.resume(this.from);
    }, { size: 22, depth: DEPTH.overlay + 2 });

    text(this, W / 2, H - 130, '存档保存在浏览器本地', 12, {
      originX: 0.5, font: FONT.hei, color: 'rgba(58,52,44,0.5)'
    }).setDepth(DEPTH.overlay + 2);
  }
}

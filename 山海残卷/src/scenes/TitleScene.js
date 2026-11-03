/* 标题 */

import { W, H, PAL, FONT, DEPTH, ASCENSION_MAX } from '../core/config.js';
import { save } from '../core/save.js';
import { audio } from '../core/audio.js';
import { run } from '../core/run.js';
import { makeButton, text } from '../ui/widgets.js';
import { openRules } from '../ui/overlays.js';
import { codexPercent } from '../data/codex.js';

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  init() { this._rules = null; }

  create() {
    this.cameras.main.fadeIn(600, 20, 17, 14);

    if (this.textures.exists('bg_title')) {
      this.add.image(W / 2, H / 2, 'bg_title').setDisplaySize(W, H).setDepth(DEPTH.bg);
      this.add.rectangle(W / 2, H / 2, W, H, 0xefe6d4, 0.35).setDepth(DEPTH.bg + 1);
    } else {
      this.add.rectangle(W / 2, H / 2, W, H, 0xefe6d4).setDepth(DEPTH.bg);
    }

    // 顶部渐隐
    const topG = this.add.graphics().setDepth(DEPTH.bg + 2);
    topG.fillGradientStyle(0xefe6d4, 0xefe6d4, 0xefe6d4, 0xefe6d4, 0.8, 0.8, 0, 0);
    topG.fillRect(0, 0, W, 260);
    const botG = this.add.graphics().setDepth(DEPTH.bg + 2);
    botG.fillGradientStyle(0xefe6d4, 0xefe6d4, 0xefe6d4, 0xefe6d4, 0, 0, 0.85, 0.85);
    botG.fillRect(0, H - 300, W, 300);

    // 标题
    const title = text(this, W / 2, 210, '山海残卷', 116, {
      color: PAL.ink, originX: 0.5, originY: 0.5
    }).setDepth(DEPTH.scene);
    title.setShadow(0, 8, 'rgba(60,44,26,0.28)', 22, false, true);

    this.add.text(W / 2, 322, 'S C R O L L S   O F   S H A N H A I', {
      fontFamily: FONT.mono, fontSize: '16px', color: 'rgba(48,42,36,0.86)',
      stroke: '#f8f1e2', strokeThickness: 3
    }).setOrigin(0.5).setDepth(DEPTH.scene + 1);
    // 英文两侧短线，收住视线
    const sr = this.add.graphics().setDepth(DEPTH.scene);
    sr.lineStyle(1, 0x8b2a20, 0.35);
    sr.lineBetween(W / 2 - 320, 322, W / 2 - 210, 322);
    sr.lineBetween(W / 2 + 210, 322, W / 2 + 320, 322);

    // 印章：贴在标题右端
    const seal = this.add.graphics().setDepth(DEPTH.scene);
    seal.fillStyle(0xb23a2e, 0.92);
    seal.fillRoundedRect(W / 2 + 244, 178, 74, 74, 5);
    seal.lineStyle(2, 0xf3ecdc, 0.85);
    seal.strokeRoundedRect(W / 2 + 253, 187, 56, 56, 3);
    this.add.text(W / 2 + 281, 216, '残\n卷', {
      fontFamily: FONT.song, fontSize: '21px', color: '#f7f0e0',
      align: 'center', lineSpacing: 2
    }).setOrigin(0.5).setDepth(DEPTH.scene + 1);

    // 按钮
    makeButton(this, W / 2 - 150, 400, 300, 62, '展　卷', () => {
      run.newRun();
      run._actIntroShown = false;
      // 初次入卷者先读序章，再入第一卷
      const first = !!save.data.firstRun;
      if (first) { save.data.firstRun = false; save.write(); }
      this.cameras.main.fadeOut(420, 20, 17, 14);
      this.time.delayedCall(440, () => {
        if (first) this.scene.start('Story', { kind: 'prologue' });
        else { run._mapIntroPending = true; this.scene.start('Map', { fresh: true }); }
      });
    }, { size: 30 });

    makeButton(this, W / 2 - 150, 486, 144, 50, '心　法', () => {
      this.scene.launch('Settings', { from: 'Title' });
      this.scene.pause();
    }, { size: 20, font: FONT.hei });

    makeButton(this, W / 2 + 6, 486, 144, 50, '图　鉴', () => {
      this.cameras.main.fadeOut(300, 20, 17, 14);
      this.time.delayedCall(310, () => this.scene.start('Codex'));
    }, { size: 20, font: FONT.hei });

    // 山影太碎，小字压不住：垫一团纸色雾（径向渐变，四边自然化开，不留方框）
    if (!this.textures.exists('title_wash')) {
      const cw = 512, chh = 256;
      const tex = this.textures.createCanvas('title_wash', cw, chh);
      const ctx = tex.getContext();
      const grd = ctx.createRadialGradient(cw / 2, chh / 2, 0, cw / 2, chh / 2, chh / 2);
      grd.addColorStop(0, 'rgba(247,240,223,0.9)');
      grd.addColorStop(0.42, 'rgba(247,240,223,0.74)');
      grd.addColorStop(0.75, 'rgba(247,240,223,0.3)');
      grd.addColorStop(1, 'rgba(247,240,223,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, cw, chh);
      tex.refresh();
    }
    this.add.image(W / 2, 626, 'title_wash')
      .setDisplaySize(980, 330).setDepth(DEPTH.scene - 2);

    // 要诀：规则与五行，随时可查（新手最缺的一环）
    const keyTip = text(this, W / 2, 556, '要　诀　·　五行与规则', 17, {
      originX: 0.5, font: FONT.hei, color: 'rgba(139,42,32,0.92)'
    }).setDepth(DEPTH.scene).setInteractive({ useHandCursor: true });
    keyTip.setStroke('#f8f1e2', 5);
    const keyRule = this.add.graphics().setDepth(DEPTH.scene);
    const drawKeyRule = (on) => {
      keyRule.clear();
      keyRule.lineStyle(1, 0xb23a2e, on ? 0.7 : 0.4);
      const half = keyTip.width / 2 + 46;
      keyRule.lineBetween(W / 2 - half, 574, W / 2 + half, 574);
    };
    drawKeyRule(false);
    keyTip.on('pointerover', () => { drawKeyRule(true); keyTip.setColor(PAL.cinnabar); audio.sfx('hover'); });
    keyTip.on('pointerout', () => { drawKeyRule(false); keyTip.setColor('rgba(139,42,32,0.82)'); });
    keyTip.on('pointerdown', () => {
      audio.sfx('page');
      if (!this._rules) this._rules = openRules(this, { depth: DEPTH.overlay + 10, onClose: () => { this._rules = null; } });
      else { this._rules.close(); this._rules = null; }
    });

    // 首局提示：读一眼要诀再落笔
    if ((save.data.runs || 0) === 0) {
      const first = text(this, W / 2, 604, '初入此卷 —— 先读要诀，再落笔', 14, {
        originX: 0.5, font: FONT.hei, color: 'rgba(58,52,44,0.78)'
      }).setDepth(DEPTH.scene);
      first.setStroke('#f8f1e2', 4);
      this.tweens.add({ targets: first, alpha: 0.55, duration: 1600, yoyo: true, repeat: -1 });
    }

    // 天命：破卷会解锁更高难度，但玩家可以自己调回去；每重一句设定风味
    const ASC_FLAVOR = [
      '墨面平静', '墨始微涨', '墨色转沉', '蠹虫啮卷', '墨涨如春汛', '卷将就木'
    ];
    const ascT = text(this, W / 2, 646, `天命 ${save.data.ascension || 0} 重 · ${ASC_FLAVOR[save.data.ascension || 0]}　·　点击调整难度`, 13, {
      originX: 0.5, font: FONT.hei, color: 'rgba(139,42,32,0.86)'
    }).setDepth(DEPTH.scene).setInteractive({ useHandCursor: true });
    ascT.setStroke('#f8f1e2', 4);
    const ascBox = this.add.graphics().setDepth(DEPTH.scene - 1);
    const drawAscBox = () => {
      ascBox.clear();
      ascBox.lineStyle(1, 0xb23a2e, 0.3);
      const w = ascT.width + 34;
      ascBox.strokeRect(W / 2 - w / 2, 632, w, 28);
    };
    drawAscBox();
    ascT.on('pointerdown', () => {
      save.data.ascension = ((save.data.ascension || 0) + 1) % (ASCENSION_MAX + 1);
      ascT.setText(`天命 ${save.data.ascension} 重 · ${ASC_FLAVOR[save.data.ascension]}　·　点击调整难度`);
      drawAscBox();
      save.write();
      audio.sfx('click');
    });

    // 底部统计
    const d = save.data;
    text(this, 64, H - 56,
      `入卷 ${d.runs} 次    ·    破卷 ${d.wins} 次    ·    最远 第 ${d.bestDepth || 0} 层    ·    最佳 ${d.bestScore || 0} 分    ·    图鉴 ${codexPercent(d)}%`,
      14, { font: FONT.hei, color: 'rgba(58,52,44,0.66)' });

    text(this, W - 64, H - 56, 'v3.9.4  ·  点击或拖拽出牌', 13, {
      font: FONT.hei, color: 'rgba(139,42,32,0.6)', originX: 1
    });

    // 飘落墨点
    this.inkDots = [];
    for (let i = 0; i < 26; i++) {
      const g = this.add.graphics().setDepth(DEPTH.bg + 3);
      const r = 1 + Math.random() * 2.4;
      g.fillStyle(0x1d1a17, 0.05 + Math.random() * 0.07);
      g.fillCircle(0, 0, r);
      g.x = Math.random() * W;
      g.y = Math.random() * H;
      g.vy = 6 + Math.random() * 16;
      g.vx = -4 + Math.random() * 8;
      this.inkDots.push(g);
    }

    audio.playBgm(this, 'bgm_title');

    // ESC 收起要诀
    this.input.keyboard.on('keydown-ESC', () => {
      if (this._rules) { this._rules.close(); this._rules = null; }
    });
    this.events.once('shutdown', () => { this._rules = null; });
  }

  update(time, delta) {
    const dt = delta / 1000;
    for (const d of this.inkDots) {
      d.y += d.vy * dt;
      d.x += d.vx * dt;
      if (d.y > H + 10) { d.y = -10; d.x = Math.random() * W; }
      if (d.x < -10) d.x = W + 10;
      if (d.x > W + 10) d.x = -10;
    }
  }
}

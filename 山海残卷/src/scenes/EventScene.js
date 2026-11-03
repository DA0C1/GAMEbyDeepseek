/* 际遇事件：左图右文，像一幅挂在墙上的小卷 */

import { W, H, PAL, FONT, DEPTH } from '../core/config.js';
import { save } from '../core/save.js';
import { run } from '../core/run.js';
import { audio } from '../core/audio.js';
import { rollEvent } from '../data/events.js';
import { text, makeButton, drawPanel } from '../ui/widgets.js';
import { burst, inkTransition } from '../core/fx.js';

const PANEL = { x: 206, y: 108, w: 1188, h: 684 };
const ART = { x: 246, y: 150, w: 402, h: 588 };
const COL = { x: 704, w: 650 };
const NUM = ['一', '二', '三', '四'];

export class EventScene extends Phaser.Scene {
  constructor() { super('Event'); }

  create() {
    this._chosen = false;
    this.cameras.main.fadeIn(420, 20, 17, 14);
    const act = run.map ? run.map.act : { theme: 'dawn', index: 0 };
    const bgKey = 'bg_act' + (act.index + 1);
    if (this.textures.exists(bgKey)) {
      this.add.image(W / 2, H / 2, bgKey).setDisplaySize(W, H).setDepth(DEPTH.bg).setAlpha(0.5);
    }
    this.add.rectangle(W / 2, H / 2, W, H, 0xefe6d4, 0.55).setDepth(DEPTH.bg + 1);

    this.ev = rollEvent((run.flags.usedEvents || []).slice(), act.index);
    run.flags.usedEvents = run.flags.usedEvents || [];
    run.flags.usedEvents.push(this.ev.id);
    // 叙事向际遇入《卷宗》见闻
    if (this.ev.loreKey) save.seeLore(this.ev.loreKey);

    this.buildPanel(act);
    this.buildArt();
    this.buildBody(act);

    audio.playBgm(this, 'bgm_map');
  }

  /* ---------- 框架 ---------- */
  buildPanel() {
    const g = this.add.graphics().setDepth(DEPTH.scene);
    // 投影
    g.fillStyle(0x2a2118, 0.14);
    g.fillRoundedRect(PANEL.x + 5, PANEL.y + 10, PANEL.w, PANEL.h, 8);
    drawPanel(g, PANEL.x, PANEL.y, PANEL.w, PANEL.h, { fill: 0xfaf4e6, alpha: 0.975, radius: 8 });

    // 中缝：把画面分成画与文两栏
    g.lineStyle(1, 0x1d1a17, 0.13);
    g.beginPath();
    g.moveTo(676, PANEL.y + 42);
    g.lineTo(676, PANEL.y + PANEL.h - 42);
    g.strokePath();

    // 四角朱砂短线
    g.lineStyle(2, 0xb23a2e, 0.5);
    const L = 22, padX = PANEL.x + 22, padY = PANEL.y + 22;
    [[padX, padY, 1, 1], [PANEL.x + PANEL.w - 22, padY, -1, 1],
     [padX, PANEL.y + PANEL.h - 22, 1, -1], [PANEL.x + PANEL.w - 22, PANEL.y + PANEL.h - 22, -1, -1]]
      .forEach(([x, y, sx, sy]) => {
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + L * sx, y); g.strokePath();
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + L * sy); g.strokePath();
      });
  }

  /* ---------- 画 ---------- */
  buildArt() {
    const key = 'ev_' + this.ev.id;
    const cx = ART.x + ART.w / 2;
    const cy = ART.y + ART.h / 2;

    if (this.textures.exists(key)) {
      const img = this.add.image(cx, cy, key).setDisplaySize(ART.w, ART.h)
        .setDepth(DEPTH.scene + 1).setAlpha(0);
      // 正片叠底：画的纸色与面板纸色相乘，墨色保留，边缘不留方框
      img.setBlendMode(Phaser.BlendModes.MULTIPLY);
      this.tweens.add({ targets: img, alpha: 1, duration: 700, ease: 'Sine.easeOut' });
      this.artImg = img;
    } else {
      this.drawArtFallback(cx, cy);
    }

    // 画框：极细墨线 + 内侧留白
    const f = this.add.graphics().setDepth(DEPTH.scene + 2);
    f.lineStyle(1, 0x1d1a17, 0.28);
    f.strokeRect(ART.x - 8, ART.y - 8, ART.w + 16, ART.h + 16);
    f.lineStyle(1, 0xb98f3f, 0.4);
    f.strokeRect(ART.x - 3, ART.y - 3, ART.w + 6, ART.h + 6);
  }

  /* 缺图时的替身：一摊淡墨 + 竖排标题，不显示方框 */
  drawArtFallback(cx, cy) {
    const g = this.add.graphics().setDepth(DEPTH.scene + 1);
    for (let i = 0; i < 7; i++) {
      const r = 150 - i * 18;
      g.fillStyle(0x1d1a17, 0.012 + i * 0.004);
      g.fillCircle(cx + Math.sin(i * 1.7) * 12, cy + 10, r);
    }
    this.add.text(cx, cy, this.ev.title, {
      fontFamily: FONT.song, fontSize: '34px', color: 'rgba(29,26,23,0.34)',
      align: 'center', lineSpacing: 10,
      wordWrap: { width: 120, useAdvancedWrap: true }
    }).setOrigin(0.5).setDepth(DEPTH.scene + 2);
  }

  /* ---------- 文 ---------- */
  buildBody(act) {
    const actName = ['一', '二', '三'][act.index] || '一';
    text(this, COL.x, 168, `第 ${actName} 卷　·　际 遇`, 13, {
      font: FONT.hei, color: 'rgba(139,42,32,0.78)', depth: DEPTH.scene + 2
    });

    const title = text(this, COL.x, 192, this.ev.title, 46, {
      color: PAL.ink, depth: DEPTH.scene + 2
    });
    title.setShadow(0, 4, 'rgba(60,44,26,0.16)', 8, false, true);

    const rule = this.add.graphics().setDepth(DEPTH.scene + 2);
    rule.fillStyle(0xb23a2e, 0.85);
    rule.fillRect(COL.x, 256, 46, 3);

    const body = text(this, COL.x, 282, this.ev.text, 19, {
      font: FONT.hei, color: 'rgba(58,52,44,0.86)', align: 'left',
      wrap: COL.w - 24, lineSpacing: 15, depth: DEPTH.scene + 2
    });

    this.optY = Math.max(432, 282 + body.height + 48);

    this.optionNodes = [];
    this.ev.options.forEach((opt, i) => {
      const y = this.optY + i * 76;
      const bw = COL.w - 40, bx = COL.x;
      const btn = makeButton(this, bx, y, bw, 64, '', () => this.choose(opt), {
        size: 22, depth: DEPTH.scene + 2
      });
      // 序号：一 / 二 / 三，朱砂
      const num = text(this, bx + 30, y + 32, NUM[i] || '·', 19, {
        font: FONT.song, color: 'rgba(139,42,32,0.85)', originY: 0.5, depth: DEPTH.scene + 3
      });
      const lab = text(this, bx + 62, y + 32, opt.label, 23, {
        originY: 0.5, color: PAL.ink, depth: DEPTH.scene + 3
      });
      let hintT = null;
      if (opt.hint) {
        hintT = text(this, bx + bw - 26, y + 32, opt.hint, 15, {
          originX: 1, originY: 0.5, font: FONT.hei,
          color: 'rgba(58,52,44,0.62)', depth: DEPTH.scene + 3
        });
      }
      this.optionNodes.push(btn, num, lab, hintT);
    });

    // 底部小字：提示选一个
    this.footNote = text(this, COL.x, this.optY + 3 * 76 + 2, '—— 择其一，落笔无悔', 13, {
      font: FONT.hei, color: 'rgba(58,52,44,0.42)', depth: DEPTH.scene + 2
    });
  }

  /* ---------- 选择 ---------- */
  choose(opt) {
    if (this._chosen) return;
    this._chosen = true;
    audio.sfx('page');

    let result = '';
    try {
      result = opt.effect(run) || '';
    } catch (e) {
      result = '……';
      console.error(e);
    }
    const dead = run.player.hp <= 0;
    if (dead) result += '\n\n气血已尽，纸面开始褪色。';

    this.footNote.destroy();

    // 选项淡出，原位换成结果
    const gone = this.optionNodes.filter(Boolean);
    this.tweens.add({
      targets: gone, alpha: 0, y: '+=10', duration: 220, ease: 'Cubic.easeIn',
      onComplete: () => gone.forEach((o) => { try { o.destroy(); } catch (e) {} })
    });

    this.time.delayedCall(240, () => {
      const top = this.optY;

      // 你刚才选了什么：给结果一个锚点，免得右栏空荡
      const picked = text(this, COL.x, top, '你选择了 · ' + opt.label, 15, {
        font: FONT.hei, color: 'rgba(58,52,44,0.5)', depth: DEPTH.overlay
      }).setAlpha(0);
      this.tweens.add({ targets: picked, alpha: 1, duration: 260 });

      const stamp = this.add.text(COL.x, top + 36, dead ? '终' : '果', {
        fontFamily: FONT.song, fontSize: '20px', color: '#fdfaf3',
        backgroundColor: dead ? 'rgba(80,20,16,0.9)' : 'rgba(139,42,32,0.88)',
        padding: { x: 9, y: 3 }
      }).setDepth(DEPTH.overlay).setAlpha(0);
      this.tweens.add({ targets: stamp, alpha: 1, duration: 220, delay: 60 });

      const rBody = text(this, COL.x + 44, top + 34, result, 21, {
        font: FONT.hei, color: 'rgba(29,26,23,0.9)', align: 'left',
        wrap: COL.w - 74, lineSpacing: 14, depth: DEPTH.overlay
      }).setAlpha(0);
      this.tweens.add({ targets: rBody, alpha: 1, y: rBody.y - 6, duration: 420, ease: 'Sine.easeOut' });

      const rl = this.add.graphics().setDepth(DEPTH.overlay);
      rl.lineStyle(1, 0x1d1a17, 0.16);
      rl.lineBetween(COL.x, top + 30 + Math.max(rBody.height, 40) + 26,
        COL.x + 220, top + 30 + Math.max(rBody.height, 40) + 26);
      rl.setAlpha(0);
      this.tweens.add({ targets: rl, alpha: 1, duration: 500, delay: 200 });

      burst(this, ART.x + ART.w / 2, ART.y + ART.h - 96, {
        kind: 'ink', count: 16, speed: 150, life: 800, scale: 0.7
      });

      const hintStr = dead ? '— 点击，回到卷外 —' : '— 点击继续行卷 —';
      const hint = text(this, COL.x, 706, hintStr, 15, {
        font: FONT.hei, color: 'rgba(139,42,32,0.7)', depth: DEPTH.overlay
      }).setAlpha(0);
      this.tweens.add({ targets: hint, alpha: 1, duration: 300, delay: 300 });
      this.tweens.add({ targets: hint, alpha: 0.4, duration: 900, yoyo: true, repeat: -1, delay: 700 });

      this.input.once('pointerdown', () => {
        if (run.player.hp <= 0) {
          run.player.alive = false;
          this.cameras.main.fadeOut(700, 20, 17, 14);
          this.time.delayedCall(760, () => this.scene.start('Result', { win: false }));
          return;
        }
        if (run.map && run.map.cur.node) run.map.cur.node.cleared = true;
        inkTransition(this, () => this.scene.start('Map'));
      });
    });
  }
}

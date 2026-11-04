/* 结局：三选一 */

import { W, H, FONT, DEPTH } from '../core/config.js';
import { run } from '../core/run.js';
import { save } from '../core/save.js';
import { audio } from '../core/audio.js';
import { ENDINGS, PAGES, pageRequirement } from '../data/story.js';
import { text, makeButton } from '../ui/widgets.js';
import { inkTransition, burst } from '../core/fx.js';

export class EndingScene extends Phaser.Scene {
  constructor() { super('Ending'); }

  create() {
    this._endingChosen = false;
    this._returning = false;
    this._endingChoices = [];
    this.cameras.main.fadeIn(900, 20, 17, 14);
    this.add.rectangle(W / 2, H / 2, W, H, 0x12100c).setDepth(DEPTH.bg);
    const g = this.add.graphics().setDepth(DEPTH.bg + 1);
    for (let i = 0; i < 10; i++) {
      g.fillStyle(0x1d1a17, 0.18);
      g.fillCircle(Math.random() * W, Math.random() * H, 140 + Math.random() * 240);
    }

    const pages = run.flags.pages.length;
    text(this, W / 2, 130, '卷　末', 62, { originX: 0.5, originY: 0.5, color: '#e8dcc0' });
    text(this, W / 2, 190, '你已收集 ' + pages + ' / ' + PAGES.length + ' 页残卷', 17, {
      originX: 0.5, font: FONT.mono, color: 'rgba(226,196,137,0.75)'
    });

    const opts = [
      { id: 'mend', need: pageRequirement('mend'), label: '补　卷', desc: '以自己的血补全图卷，异兽永镇。' },
      { id: 'burn', need: pageRequirement('burn'), label: '焚　卷', desc: '烧毁图卷，放异兽归世。' },
      { id: 'become', need: pageRequirement('become'), label: '代　卷', desc: '将整枚印按进卷心，改写图里的规矩。' }
    ];

    opts.forEach((o, i) => {
      const y = 300 + i * 130;
      const unlocked = pages >= o.need;
      const e = ENDINGS[o.id];

      const btn = makeButton(this, W / 2 - 260, y, 520, 76, o.label, () => {
        if (!unlocked) return;
        this.showEnding(e);
      }, { size: 28, depth: DEPTH.scene });
      this._endingChoices.push(btn);

      text(this, W / 2, y + 92, o.desc, 15, {
        originX: 0.5, font: FONT.hei,
        color: unlocked ? 'rgba(232,220,192,0.7)' : 'rgba(232,220,192,0.28)'
      }).setDepth(DEPTH.scene);

      if (!unlocked) {
        btn.zone.disableInteractive();
        btn.setAlpha(0.35);
        text(this, W / 2 + 280, y + 30, `需 ${o.need} / ${PAGES.length} 页`, 13, {
          originX: 0, font: FONT.mono, color: 'rgba(226,196,137,0.4)'
        }).setDepth(DEPTH.scene + 1);
      }
    });

    audio.playBgm(this, 'bgm_ending');
  }

  showEnding(ending) {
    // 不同按钮可能在同一帧排入延迟回调；先锁定，确保战绩只入账一次。
    if (this._endingChosen) return;
    this._endingChosen = true;
    this._endingChoices.forEach((button) => button.destroy());
    this._endingChoices = [];
    audio.sfx('page');
    const layer = this.add.container(0, 0).setDepth(DEPTH.overlay);
    const blocker = this.add.rectangle(W / 2, H / 2, W, H, 0x0d0b09, 0.96).setInteractive();
    blocker.on('pointerdown', (pointer, localX, localY, event) => event.stopPropagation());
    layer.add(blocker);

    const title = this.add.text(W / 2, 160, ending.title, {
      fontFamily: FONT.song, fontSize: '58px', color: '#e2c489'
    }).setOrigin(0.5);
    layer.add(title);
    burst(this, W / 2, 160, { kind: 'gold', count: 30, speed: 260, life: 1400, add: true });

    const lines = ending.lines.filter(Boolean);
    const lineHeight = Math.min(56, 420 / Math.max(1, lines.length - 1));
    let returnDelay = Math.max(3200, 500 + (lines.length - 1) * 600 + 1100);
    lines.forEach((ln, i) => {
      const t = this.add.text(W / 2, 270 + i * lineHeight, ln, {
        fontFamily: FONT.song, fontSize: lines.length > 7 ? '20px' : '22px', color: 'rgba(232,220,192,0.86)',
        align: 'center', wordWrap: { width: 1000, useAdvancedWrap: true }
      }).setOrigin(0.5).setAlpha(0);
      layer.add(t);
      this.tweens.add({ targets: t, alpha: 1, duration: 800, delay: 500 + i * 600 });
    });

    // 九页全收：图全之刻，背影回头——三条路之外的真相钩子，入《卷宗》
    if (run.flags.pages.length >= PAGES.length) {
      save.seeLore('ending_true');
      const n = lines.length;
      const veil = this.add.rectangle(W / 2, 430, 760, 150, 0x0d0b09, 0.72)
        .setDepth(DEPTH.overlay + 1).setAlpha(0);
      layer.add(veil);
      const l1 = this.add.text(W / 2, 402, '图全了。', {
        fontFamily: FONT.song, fontSize: '26px', color: '#e2c489'
      }).setOrigin(0.5).setDepth(DEPTH.overlay + 2).setAlpha(0);
      const l2 = this.add.text(W / 2, 452, '墨迹尽头，那道背影停了下来——然后，朝你回过头。', {
        fontFamily: FONT.song, fontSize: '21px', color: 'rgba(226,196,137,0.9)'
      }).setOrigin(0.5).setDepth(DEPTH.overlay + 2).setAlpha(0);
      layer.add([l1, l2]);
      const d0 = 500 + n * 600 + 1400;
      returnDelay = Math.max(returnDelay, d0 + 3800);
      this.tweens.add({ targets: veil, alpha: 1, duration: 900, delay: d0 });
      this.tweens.add({ targets: l1, alpha: 1, duration: 900, delay: d0 + 700 });
      this.tweens.add({
        targets: l2, alpha: 1, duration: 1100, delay: d0 + 1600,
        onComplete: () => {
          burst(this, W / 2, 430, { kind: 'gold', count: 22, speed: 200, life: 1600, add: true });
          audio.sfx('relic');
        }
      });
      const hint = this.add.text(W / 2, 510, '《卷宗 · 人物》已录：背影', {
        fontFamily: FONT.hei, fontSize: '13px', color: 'rgba(226,196,137,0.4)'
      }).setOrigin(0.5).setDepth(DEPTH.overlay + 2).setAlpha(0);
      layer.add(hint);
      this.tweens.add({ targets: hint, alpha: 1, duration: 800, delay: d0 + 2600 });
    }

    // 胜负、天命与战绩统一由 recordRun 入账（此处不要重复累加）
    const score = run.score() + 800;
    save.recordRun({
      depth: Math.max(30, run.depth || 0), score, win: true,
      kills: run.stats.kills, cardsPlayed: run.stats.cardsPlayed,
      damage: run.stats.damage, time: run.elapsed()
    });

    const btn = makeButton(this, W / 2 - 130, H - 120, 260, 60, '回　山　门', () => {
      if (this._returning) return;
      this._returning = true;
      btn.zone.disableInteractive();
      run.active = false;
      run.map = null;
      run._actIntroShown = false;
      inkTransition(this, () => this.scene.start('Title'));
    }, { size: 22, depth: DEPTH.overlay + 2 });
    btn.setAlpha(0);
    btn.zone.disableInteractive();
    this.tweens.add({ targets: btn, alpha: 1, duration: 800, delay: returnDelay,
      onComplete: () => btn.zone.setInteractive({ useHandCursor: true }) });

    this.add.text(W / 2, H - 160, `通关评分 ${score}`, {
      fontFamily: FONT.mono, fontSize: '15px', color: 'rgba(226,196,137,0.65)'
    }).setOrigin(0.5).setDepth(DEPTH.overlay + 1);
  }
}

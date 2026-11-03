/* 叙事：卷首引言 / 残页 */

import { W, H, FONT, DEPTH } from '../core/config.js';
import { run } from '../core/run.js';
import { random } from '../core/random.js';
import { audio } from '../core/audio.js';
import { generateMap, ACTS } from '../systems/mapgen.js';
import { ACT_INTRO, PAGES, PROLOGUE } from '../data/story.js';
import { save } from '../core/save.js';
import { showDialogue } from '../ui/dialogue.js';
import { text, makeButton } from '../ui/widgets.js';
import { inkTransition } from '../core/fx.js';

export class StoryScene extends Phaser.Scene {
  constructor() { super('Story'); }

  init(data) {
    this.kind = (data && data.kind) || 'act';
    this.page = data && data.page;
  }

  create() {
    this.cameras.main.fadeIn(700, 20, 17, 14);
    this.add.rectangle(W / 2, H / 2, W, H, 0x12100c).setDepth(DEPTH.bg);

    // 墨迹晕染
    const g = this.add.graphics().setDepth(DEPTH.bg + 1);
    for (let i = 0; i < 8; i++) {
      g.fillStyle(0x1d1a17, 0.16);
      g.fillCircle(W / 2 + (Math.random() - 0.5) * 700, H / 2 + (Math.random() - 0.5) * 400, 120 + Math.random() * 200);
    }

    if (this.kind === 'act') {
      this.showActIntro();
    } else if (this.kind === 'prologue') {
      this.showPrologue();
    } else if (this.kind === 'final') {
      this.showPage(true);
    } else if (this.kind === 'page') {
      this.showPickedPage();
    } else {
      this.showPage(false);
    }
  }

  /* 序章：初入卷者先听这一段（打字机，居中） */
  showPrologue() {
    save.seeLore('prologue');
    showDialogue(this, {
      lines: PROLOGUE,
      center: true, speed: 42,
      onDone: () => {
        inkTransition(this, () => this.scene.start('Story', { kind: 'act' }));
      }
    });
  }

  showActIntro() {
    const act = ACTS[run.actIndex] || ACTS[0];
    const lines = ACT_INTRO[act.index];
    save.seeLore('act' + act.index);

    text(this, W / 2, 220, lines.title, 54, {
      originX: 0.5, originY: 0.5, color: '#e8dcc0'
    }).setDepth(DEPTH.scene);

    lines.lines.forEach((ln, i) => {
      const t = text(this, W / 2, 330 + i * 46, ln, 21, {
        originX: 0.5, originY: 0.5, font: FONT.hei, color: 'rgba(232,220,192,0.78)',
        align: 'center', wrap: 900
      }).setDepth(DEPTH.scene).setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, duration: 700, delay: 500 + i * 420 });
    });

    // 卷末成长提示
    if (run.actIndex > 0) {
      const g = text(this, W / 2, 640,
        `残印解封　灵力上限 ${run.player.energyMax}　·　气血上限 ${run.player.maxHp}`, 16, {
          originX: 0.5, originY: 0.5, font: FONT.hei, color: 'rgba(226,196,137,0.82)'
        }).setDepth(DEPTH.scene).setAlpha(0);
      this.tweens.add({ targets: g, alpha: 1, duration: 700, delay: 1900 });
    }

    this.continueBtn('入　卷', () => {
      run.map = generateMap(run.actIndex);
      run._actIntroShown = true;
      inkTransition(this, () => this.scene.start('Map'));
    });
  }

  /* 地图残页节点：从未收集的页里挑一张（优先本卷） */
  showPickedPage() {
    const got = run.flags.pages;
    const pool = PAGES.filter((p) => got.indexOf(p.id) < 0);
    if (!pool.length) {
      // 九页已集齐（例如事件/宝箱提前补齐），不要重复展示第一页
      text(this, W / 2, 300, '残卷已尽', 40, {
        originX: 0.5, originY: 0.5, color: '#e2c489'
      }).setDepth(DEPTH.scene);
      text(this, W / 2, 370, `你已收齐 ${PAGES.length} 页，纸上再没有空白。`, 20, {
        originX: 0.5, font: FONT.hei, color: 'rgba(232,220,192,0.75)'
      }).setDepth(DEPTH.scene);
      this.continueBtn('继　续　下　潜', () => {
        inkTransition(this, () => this.scene.start('Map'));
      });
      return;
    }
    const prefer = pool.filter((p) => p.act === run.actIndex);
    const page = (prefer.length ? prefer : pool)[
      Math.floor(random() * (prefer.length ? prefer.length : pool.length))
    ];
    if (page && got.indexOf(page.id) < 0) run.recordPage(page.id);

    const objs = [];
    const g = this.add.graphics().setDepth(DEPTH.scene - 1);
    g.lineStyle(1, 0xb98f3f, 0.28);
    g.strokeRoundedRect(W / 2 - 440, 200, 880, 340, 4);
    g.lineStyle(1, 0xb98f3f, 0.12);
    g.strokeRoundedRect(W / 2 - 430, 210, 860, 320, 3);
    objs.push(g);

    // 卷起的纸边
    g.fillStyle(0xf3ecdc, 0.06);
    g.fillRect(W / 2 - 430, 210, 860, 320);

    text(this, W / 2, 152, '得 一 页 残 卷', 20, {
      originX: 0.5, font: FONT.hei, color: 'rgba(226,196,137,0.65)'
    }).setDepth(DEPTH.scene);

    const titleT = text(this, W / 2, 258, page.title, 40, {
      originX: 0.5, originY: 0.5, color: '#e2c489'
    }).setDepth(DEPTH.scene);
    titleT.setAlpha(0);
    this.tweens.add({ targets: titleT, alpha: 1, duration: 600 });

    const body = text(this, W / 2, 320, page.text, 23, {
      originX: 0.5, originY: 0, font: FONT.song, color: 'rgba(232,220,192,0.9)',
      align: 'center', wrap: 780, lineSpacing: 16
    }).setDepth(DEPTH.scene);
    body.setAlpha(0);
    this.tweens.add({ targets: body, alpha: 1, duration: 900, delay: 260 });

    text(this, W / 2, 578, `残页 ${run.flags.pages.length} / ${PAGES.length}`, 15, {
      originX: 0.5, font: FONT.mono, color: 'rgba(226,196,137,0.6)'
    }).setDepth(DEPTH.scene);
    text(this, W / 2, 604, '补一笔——图愈全，身愈实　气血上限 +3', 14, {
      originX: 0.5, font: FONT.hei, color: 'rgba(226,196,137,0.5)'
    }).setDepth(DEPTH.scene);

    audio.sfx('page');

    this.continueBtn('收 入 袖 中', () => {
      inkTransition(this, () => this.scene.start('Map'));
    });
  }

  showPage(final) {
    const page = this.page;
    if (!page) {
      // 九页已集齐，不再重复给页
      text(this, W / 2, 300, '残卷已尽', 40, {
        originX: 0.5, originY: 0.5, color: '#e2c489'
      }).setDepth(DEPTH.scene);
      text(this, W / 2, 370, `你已收齐 ${PAGES.length} 页，师父没有更多可说的了。`, 20, {
        originX: 0.5, font: FONT.hei, color: 'rgba(232,220,192,0.75)'
      }).setDepth(DEPTH.scene);
      this.continueBtn(final ? '前　往　卷　末' : '继　续　下　潜', () => {
        if (final) inkTransition(this, () => this.scene.start('Ending'));
        else {
          run.map = generateMap(run.actIndex);
          run._actIntroShown = true;
          inkTransition(this, () => this.scene.start('Map'));
        }
      });
      return;
    }

    text(this, W / 2, 170, page.title, 40, {
      originX: 0.5, originY: 0.5, color: '#e2c489'
    }).setDepth(DEPTH.scene);

    const body = text(this, W / 2, 300, page.text, 24, {
      originX: 0.5, originY: 0, font: FONT.song, color: 'rgba(232,220,192,0.9)',
      align: 'center', wrap: 820, lineSpacing: 16
    }).setDepth(DEPTH.scene).setAlpha(0);
    this.tweens.add({ targets: body, alpha: 1, duration: 900, delay: 300 });

    // 残页图形
    const g = this.add.graphics().setDepth(DEPTH.scene - 1);
    g.lineStyle(1, 0xb98f3f, 0.25);
    g.strokeRoundedRect(W / 2 - 430, 240, 860, 300, 4);

    text(this, W / 2, 600, `残页 ${run.flags.pages.length} / ${PAGES.length}`, 15, {
      originX: 0.5, font: FONT.mono, color: 'rgba(226,196,137,0.6)'
    }).setDepth(DEPTH.scene);
    text(this, W / 2, 626, '补一笔——气血上限 +3', 14, {
      originX: 0.5, font: FONT.hei, color: 'rgba(226,196,137,0.5)'
    }).setDepth(DEPTH.scene);

    if (final) {
      text(this, W / 2, 660, '你已抵达最后一卷的尽头。', 18, {
        originX: 0.5, font: FONT.hei, color: 'rgba(232,220,192,0.7)'
      }).setDepth(DEPTH.scene);
      this.continueBtn('前　往　卷　末', () => {
        inkTransition(this, () => this.scene.start('Ending'));
      });
    } else {
      this.continueBtn('继　续　下　潜', () => {
        run.map = generateMap(run.actIndex);
        run._actIntroShown = true;
        inkTransition(this, () => this.scene.start('Map'));
      });
    }
  }

  continueBtn(label, cb) {
    const btn = makeButton(this, W / 2 - 130, H - 140, 260, 60, label, cb, {
      size: 22, depth: DEPTH.scene + 2
    });
    btn.setAlpha(0);
    this.tweens.add({ targets: btn, alpha: 1, duration: 600, delay: 1100 });
    audio.sfx('page');
  }
}

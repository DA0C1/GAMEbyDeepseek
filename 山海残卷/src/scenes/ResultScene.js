/* 结算（失败） */

import { W, H, PAL, FONT, DEPTH } from '../core/config.js';
import { run } from '../core/run.js';
import { save } from '../core/save.js';
import { audio } from '../core/audio.js';
import { text, makeButton, drawPanel } from '../ui/widgets.js';
import { inkTransition } from '../core/fx.js';

export class ResultScene extends Phaser.Scene {
  constructor() { super('Result'); }

  init(data) { this.win = !!(data && data.win); }

  create() {
    this.cameras.main.fadeIn(600, 20, 17, 14);
    this.add.rectangle(W / 2, H / 2, W, H, 0x12100c).setDepth(DEPTH.bg);

    const g = this.add.graphics().setDepth(DEPTH.bg + 1);
    for (let i = 0; i < 6; i++) {
      g.fillStyle(0x1d1a17, 0.25);
      g.fillCircle(180 + i * 280, 200 + (i % 3) * 220, 200);
    }

    text(this, W / 2, 180, '墨　尽', 84, { originX: 0.5, originY: 0.5, color: '#e8dcc0' });
    text(this, W / 2, 250, '你的身形在纸上慢慢淡去', 18, {
      originX: 0.5, font: FONT.hei, color: 'rgba(232,220,192,0.6)'
    });

    const score = run.score();
    const depth = run.depth;
    const stats = [
      ['抵达', `${Math.floor(depth / 10) || 1} 卷 · 第 ${(depth % 10) + 1} 层`],
      ['击杀', `${run.stats.kills} 只`],
      ['出牌', `${run.stats.cardsPlayed} 张`],
      ['伤害', `${Math.round(run.stats.damage)}`],
      ['法宝', `${run.player.relics.length} 件`],
      ['用时', `${Math.floor(run.elapsed() / 60)} 分 ${run.elapsed() % 60} 秒`],
      ['评分', `${score}`]
    ];

    const panelY = 310;
    const g2 = this.add.graphics().setDepth(DEPTH.scene);
    drawPanel(g2, W / 2 - 320, panelY, 640, 320, { fill: 0xfaf4e6, alpha: 0.96, gold: true });

    stats.forEach((s, i) => {
      const y = panelY + 44 + i * 38;
      text(this, W / 2 - 260, y, s[0], 16, { font: FONT.hei, color: 'rgba(58,52,44,0.6)' }).setDepth(DEPTH.scene + 1);
      text(this, W / 2 + 260, y, s[1], 20, { font: FONT.mono, color: PAL.ink, originX: 1 }).setDepth(DEPTH.scene + 1);
    });

    const isBest = score > save.data.bestScore;
    save.recordRun({
      depth, score, win: false,
      kills: run.stats.kills, cardsPlayed: run.stats.cardsPlayed,
      damage: run.stats.damage, time: run.elapsed()
    });
    if (isBest) {
      text(this, W / 2, panelY + 350, '◆ 新 纪 录 ◆', 20, {
        originX: 0.5, font: FONT.mono, color: PAL.gold
      }).setDepth(DEPTH.scene + 1);
    }

    makeButton(this, W / 2 - 240, H - 130, 220, 56, '再　入　卷', () => {
      // 必须重开一局：只清 map 会沿用 0 血/旧牌组的角色
      run.newRun();
      run._actIntroShown = false;
      run._mapIntroPending = true;
      inkTransition(this, () => this.scene.start('Map', { fresh: true }));
    }, { size: 22 });

    makeButton(this, W / 2 + 20, H - 130, 220, 56, '回　山　门', () => {
      run.active = false;
      run.map = null;
      run._actIntroShown = false;
      inkTransition(this, () => this.scene.start('Title'));
    }, { size: 20, font: FONT.hei });

    audio.stopBgm();
    audio.sfx('lose');
  }
}

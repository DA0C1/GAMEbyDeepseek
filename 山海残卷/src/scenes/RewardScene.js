import { random } from "../core/random.js";
/* 战后奖励：三选一符箓 / 拾遗 */

import { W, H, PAL, FONT, DEPTH } from '../core/config.js';
import { run } from '../core/run.js';
import { save } from '../core/save.js';
import { audio } from '../core/audio.js';
import { rollRewards, cardName } from '../data/cards.js';
import { rollRelic, RELICS } from '../data/relics.js';
import { POTIONS } from '../data/potions.js';
import { ensureCardTexture } from '../ui/cardRender.js';
import { text, makeButton, drawPanel } from '../ui/widgets.js';
import { burst } from '../core/fx.js';

export class RewardScene extends Phaser.Scene {
  constructor() { super('Reward'); }

  init(data) {
    this.isTreasure = !!(data && data.treasure);
    this.potion = (data && data.potion) || null;
    this.picked = false;
  }

  create() {
    this.cameras.main.fadeIn(400, 20, 17, 14);
    this.add.rectangle(W / 2, H / 2, W, H, 0xefe6d4).setDepth(DEPTH.bg);
    const g = this.add.graphics().setDepth(DEPTH.bg + 1);
    g.fillStyle(0x1d1a17, 0.05);
    for (let i = 0; i < 5; i++) {
      g.fillCircle(200 + i * 320, 160 + (i % 2) * 90, 180);
    }
    // 卡片后一层淡淡墨晕，让三张牌有落处
    g.fillStyle(0x1d1a17, 0.035);
    g.fillCircle(W / 2, 400, 300);
    g.fillStyle(0x1d1a17, 0.03);
    g.fillCircle(W / 2, 400, 210);

    if (this.isTreasure) this.showTreasure();
    else this.showCards();

    if (this.potion) this.showPotionDrop();
  }

  /* 掉落的药水：从上方滑入，短暂停留 */
  showPotionDrop() {
    const def = POTIONS[this.potion];
    if (!def) return;

    const x = W / 2;
    const y = 618;   // 卡牌下缘之下、跳过按钮之上
    const c = this.add.container(x, y + 34).setDepth(DEPTH.scene + 4).setAlpha(0);

    const g = this.add.graphics();
    g.fillStyle(0xfdfaf3, 0.96);
    g.fillRoundedRect(-170, -26, 340, 52, 6);
    g.lineStyle(1.4, Phaser.Display.Color.HexStringToColor(def.color).color, 0.7);
    g.strokeRoundedRect(-170, -26, 340, 52, 6);
    c.add(g);

    c.add(this.add.text(-146, 0, '得', {
      fontFamily: FONT.song, fontSize: '20px', color: def.color
    }).setOrigin(0.5));
    c.add(this.add.text(-118, -14, def.name, {
      fontFamily: FONT.song, fontSize: '20px', color: PAL.ink
    }));
    c.add(this.add.text(-118, 8, def.desc, {
      fontFamily: FONT.hei, fontSize: '12px', color: 'rgba(58,52,44,0.7)',
      wordWrap: { width: 268 }
    }));

    this.tweens.add({
      targets: c, y, alpha: 1, duration: 420, ease: 'Cubic.easeOut',
      onComplete: () => {
        this.tweens.add({ targets: c, alpha: 0, y: y + 16, delay: 2600, duration: 500,
          onComplete: () => c.destroy(true) });
      }
    });
  }

  showTreasure() {
    text(this, W / 2, 140, '拾　遗', 52, { originX: 0.5, color: PAL.ink });

    const relicId = rollRelic(run.player.relics);
    const gold = 50 + Math.floor(random() * 40);
    run.gold(gold);
    if (relicId) {
      run.grantRelic(relicId);
      const def = RELICS[relicId];
      const g = this.add.graphics().setDepth(DEPTH.scene);
      drawPanel(g, W / 2 - 260, 240, 520, 240, { fill: 0xfaf4e6, alpha: 0.96, gold: true });
      text(this, W / 2, 300, '获得法宝', 20, { originX: 0.5, font: FONT.hei, color: PAL.ink3 });
      text(this, W / 2, 360, def.name, 44, { originX: 0.5, color: PAL.cinnabar });
      text(this, W / 2, 420, def.desc, 17, { originX: 0.5, font: FONT.hei, color: PAL.ink2, wrap: 440 });
      burst(this, W / 2, 360, { kind: 'gold', count: 24, speed: 200, life: 900, add: true });
    }

    text(this, W / 2, 540, `获得 ${gold} 墨`, 22, { originX: 0.5, font: FONT.mono, color: PAL.gold });

    makeButton(this, W / 2 - 110, 620, 220, 58, '收　起', () => {
      this.cameras.main.fadeOut(350, 20, 17, 14);
      this.time.delayedCall(380, () => this.scene.start('Map'));
    }, { size: 24 });

    audio.sfx('relic');
  }

  showCards() {
    text(this, W / 2, 92, '择一符箓', 44, { originX: 0.5, color: PAL.ink });
    text(this, W / 2, 136, '亦可弃之，换一段清净', 15, { originX: 0.5, font: FONT.hei, color: 'rgba(58,52,44,0.55)' });

    const choices = rollRewards(3, { upgraded: random() < 0.25 });
    const fresh = choices.map((c) => !(save.data.seen.cards || {})[c.id]);
    choices.forEach((c) => save.seeCard(c.id));
    const cw = 240, ch = 336, gap = 56;
    const totalW = choices.length * cw + (choices.length - 1) * gap;
    const startX = (W - totalW) / 2;

    choices.forEach((card, i) => {
      const x = startX + i * (cw + gap);
      const y = 230;
      const key = ensureCardTexture(this, card);
      const img = this.add.image(x + cw / 2, y + ch / 2, key).setDisplaySize(cw, ch).setDepth(DEPTH.scene);
      img.setInteractive({ useHandCursor: true });

      // 图鉴新条目：卡角一枚朱印
      if (fresh[i]) {
        const badge = this.add.graphics().setDepth(DEPTH.scene + 1);
        badge.fillStyle(0xb23a2e, 0.94);
        badge.fillCircle(x + 30, y + ch - 30, 16);
        badge.lineStyle(1, 0xf7f0e0, 0.75);
        badge.strokeCircle(x + 30, y + ch - 30, 12);
        this.add.text(x + 30, y + ch - 30, '新', {
          fontFamily: FONT.song, fontSize: '15px', color: '#f7f0e0'
        }).setOrigin(0.5).setDepth(DEPTH.scene + 2);
      }

      const glow = this.add.graphics().setDepth(DEPTH.scene - 1);
      const drawGlow = (on) => {
        glow.clear();
        if (on) {
          glow.lineStyle(2, 0xb23a2e, 0.5);
          glow.strokeRoundedRect(x - 8, y - 8, cw + 16, ch + 16, 10);
        }
      };
      drawGlow(false);

      img.on('pointerover', () => {
        drawGlow(true);
        this.tweens.add({ targets: img, scaleX: img.scaleX * 1.04, scaleY: img.scaleY * 1.04, duration: 140 });
        audio.sfx('hover');
      });
      img.on('pointerout', () => {
        drawGlow(false);
        img.setDisplaySize(cw, ch);
      });
      img.on('pointerdown', () => {
        if (this.picked) return;
        this.picked = true;
        audio.sfx('page');
        run.player.deck.push(card);
        this.floatPick(card, x + cw / 2, y + ch / 2);
      });
    });

    makeButton(this, W / 2 - 90, H - 110, 180, 50, '跳　过', () => {
      if (this.picked) return;
      this.picked = true;
      run.gold(12);
      this.cameras.main.fadeOut(350, 20, 17, 14);
      this.time.delayedCall(380, () => this.scene.start('Map'));
    }, { size: 19, font: FONT.hei });
  }

  floatPick(card, x, y) {
    text(this, x, y, cardName(card), 26, { originX: 0.5, color: PAL.cinnabar }).setDepth(DEPTH.overlay);
    burst(this, x, y, { kind: 'gold', count: 18, speed: 200, life: 800, add: true });
    this.cameras.main.fadeOut(400, 20, 17, 14);
    this.time.delayedCall(430, () => this.scene.start('Map'));
  }
}

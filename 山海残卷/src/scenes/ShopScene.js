/* 鬼市：买卖 */

import { W, H, PAL, FONT, DEPTH } from '../core/config.js';
import { run } from '../core/run.js';
import { save } from '../core/save.js';
import { audio } from '../core/audio.js';
import { rollRewards, cardName } from '../data/cards.js';
import { rollRelic, RELICS } from '../data/relics.js';
import { rollPotion, POTIONS, POTION_MAX } from '../data/potions.js';
import { ensureCardTexture } from '../ui/cardRender.js';
import { pickCard } from '../ui/overlays.js';
import { text, makeButton, drawPanel } from '../ui/widgets.js';

export class ShopScene extends Phaser.Scene {
  constructor() { super('Shop'); }

  create() {
    this.cameras.main.fadeIn(420, 20, 17, 14);
    const act = run.map ? run.map.act : { theme: 'dawn', index: 0 };
    const bgKey = this.textures.exists('bg_shop') ? 'bg_shop' : ('bg_act' + (act.index + 1));
    if (this.textures.exists(bgKey)) {
      this.add.image(W / 2, H / 2, bgKey).setDisplaySize(W, H).setDepth(DEPTH.bg).setAlpha(0.66);
    }
    this.add.rectangle(W / 2, H / 2, W, H, 0xefe6d4, 0.46).setDepth(DEPTH.bg + 1);

    text(this, W / 2, 88, '鬼　市', 46, { originX: 0.5, color: PAL.ink });
    text(this, W / 2, 130, '无脸人摊开手，等你开口', 15, {
      originX: 0.5, font: FONT.hei, color: 'rgba(58,52,44,0.55)'
    });

    const discount = run.player.relics.indexOf('suanpan') >= 0 ? 0.75 : 1;

    this.items = [];
    const cards = rollRewards(2, {});
    cards.forEach((c) => save.seeCard(c.id));
    cards.forEach((c, i) => {
      this.items.push({
        kind: 'card', card: c,
        price: Math.round((46 + i * 12) * discount)
      });
    });
    const rid = rollRelic(run.player.relics);
    if (rid) this.items.push({ kind: 'relic', id: rid, price: Math.round(128 * discount) });
    this.items.push({ kind: 'remove', price: Math.round(68 * discount) });
    // 药水货架：小额消费口，袋满不上架
    if (run.player.potions.length < POTION_MAX) {
      const pid = rollPotion();
      if (pid) this.items.push({ kind: 'potion', id: pid, price: Math.round(32 * discount) });
    }

    const cw = 224, ch = 314, gap = 34;
    const totalW = this.items.length * cw + (this.items.length - 1) * gap;
    const startX = (W - totalW) / 2;

    this.items.forEach((it, i) => {
      const x = startX + i * (cw + gap);
      const y = 220;
      it.x = x; it.y = y; it.bought = false;
      this.renderItem(it, x, y, cw, ch);
    });

    this.goldT = text(this, W / 2, H - 170, '', 22, { originX: 0.5, font: FONT.mono, color: PAL.gold });
    this.refreshGold();

    makeButton(this, W / 2 - 100, H - 120, 200, 56, '离　开', () => {
      if (run.map && run.map.cur.node) run.map.cur.node.cleared = true;
      this.cameras.main.fadeOut(350, 20, 17, 14);
      this.time.delayedCall(380, () => this.scene.start('Map'));
    }, { size: 22 });

    audio.playBgm(this, 'bgm_map');
  }

  renderItem(it, x, y, cw, ch) {
    const g = this.add.graphics().setDepth(DEPTH.scene);
    drawPanel(g, x - 16, 190, cw + 32, ch + 150, { fill: 0xfaf4e6, alpha: 0.94 });

    if (it.kind === 'card') {
      const key = ensureCardTexture(this, it.card);
      const img = this.add.image(x + cw / 2, y + ch / 2, key).setDisplaySize(cw, ch).setDepth(DEPTH.scene + 1);
      it.img = img;
      text(this, x + cw / 2, y + ch + 26, cardName(it.card), 17, {
        originX: 0.5, color: 'rgba(58,52,44,0.65)'
      }).setDepth(DEPTH.scene + 1);
    } else if (it.kind === 'relic') {
      const def = RELICS[it.id];
      const gg = this.add.graphics().setDepth(DEPTH.scene + 1);
      gg.fillStyle(0xf3ecdc, 1);
      gg.fillCircle(x + cw / 2, 300, 56);
      gg.lineStyle(2, 0xb98f3f, 0.6);
      gg.strokeCircle(x + cw / 2, 300, 56);
      text(this, x + cw / 2, 300, '宝', 40, { originX: 0.5, originY: 0.5, color: PAL.gold }).setDepth(DEPTH.scene + 2);
      text(this, x + cw / 2, 390, def.name, 22, { originX: 0.5, color: PAL.ink }).setDepth(DEPTH.scene + 1);
      text(this, x + cw / 2, 424, def.desc, 13, {
        originX: 0.5, font: FONT.hei, color: 'rgba(58,52,44,0.7)', wrap: cw - 10, advancedWrap: true, align: 'center'
      }).setDepth(DEPTH.scene + 1);
    } else if (it.kind === 'potion') {
      const def = POTIONS[it.id];
      const gg = this.add.graphics().setDepth(DEPTH.scene + 1);
      gg.fillStyle(0xf3ecdc, 1);
      gg.fillCircle(x + cw / 2, 300, 56);
      gg.lineStyle(2, Phaser.Display.Color.HexStringToColor(def.color).color, 0.65);
      gg.strokeCircle(x + cw / 2, 300, 56);
      text(this, x + cw / 2, 300, '药', 40, { originX: 0.5, originY: 0.5, color: def.color }).setDepth(DEPTH.scene + 2);
      text(this, x + cw / 2, 390, def.name, 22, { originX: 0.5, color: PAL.ink }).setDepth(DEPTH.scene + 1);
      text(this, x + cw / 2, 424, def.desc, 13, {
        originX: 0.5, font: FONT.hei, color: 'rgba(58,52,44,0.7)', wrap: cw - 10, advancedWrap: true, align: 'center'
      }).setDepth(DEPTH.scene + 1);
    } else {
      const gg = this.add.graphics().setDepth(DEPTH.scene + 1);
      gg.fillStyle(0xf3ecdc, 1);
      gg.fillCircle(x + cw / 2, 300, 56);
      gg.lineStyle(2, 0x2f6b8a, 0.6);
      gg.strokeCircle(x + cw / 2, 300, 56);
      text(this, x + cw / 2, 300, '擦', 40, { originX: 0.5, originY: 0.5, color: PAL.azure }).setDepth(DEPTH.scene + 2);
      text(this, x + cw / 2, 390, '擦　符', 22, { originX: 0.5, color: PAL.ink }).setDepth(DEPTH.scene + 1);
      text(this, x + cw / 2, 424, '从牌组擦去一张牌。洗山会管这个叫「擦山」——掌柜不问来历。', 13, {
        originX: 0.5, font: FONT.hei, color: 'rgba(58,52,44,0.7)', wrap: cw - 10, advancedWrap: true, align: 'center'
      }).setDepth(DEPTH.scene + 1);
    }

    const btn = makeButton(this, x - 6, y + ch + 130, cw + 12, 48, `${it.price} 墨`, () => this.buy(it), {
      size: 18, depth: DEPTH.scene + 3
    });
    it.btn = btn;
  }

  refreshGold() {
    this.goldT.setText(`所持　${run.player.gold} 墨`);
  }

  notEnough() {
    audio.sfx('debuff');
    text(this, W / 2, H - 210, '墨不够', 20, { originX: 0.5, font: FONT.hei, color: PAL.cinnabar })
      .setDepth(DEPTH.overlay);
    this.time.delayedCall(700, () => {
      this.children.getAll().forEach((o) => {
        if (o.type === 'Text' && o.text === '墨不够') o.destroy();
      });
    });
  }

  markSold(it) {
    it.bought = true;
    if (it.btn) it.btn.destroy();
    text(this, it.x + 100, it.y + 250, '已售', 20, {
      originX: 0.5, color: 'rgba(139,42,32,0.7)'
    }).setDepth(DEPTH.overlay);
    this.refreshGold();
  }

  buy(it) {
    if (it.bought) return;
    const p = run.player;
    if (p.gold < it.price) { this.notEnough(); return; }

    // 擦符：由玩家自己选，否则高价值牌会被随机擦掉
    if (it.kind === 'remove') { this.openRemove(it); return; }

    p.gold -= it.price;
    it.bought = true;
    audio.sfx('coin');

    if (it.kind === 'card') {
      p.deck.push(it.card);
      it.img.setTint(0x999080);
    } else if (it.kind === 'relic') {
      run.grantRelic(it.id);
    } else if (it.kind === 'potion') {
      run.addPotion(it.id);
      audio.sfx('potion');
    }
    this.markSold(it);
  }

  openRemove(it) {
    pickCard(this, {
      cards: run.player.deck.slice(),
      title: '擦　符',
      subtitle: `支付 ${it.price} 墨，选一张符箓擦去`,
      emptyText: '已无可擦之符',
      onPick: (card) => {
        run.player.gold -= it.price;
        const idx = run.player.deck.indexOf(card);
        if (idx >= 0) run.player.deck.splice(idx, 1);
        audio.sfx('coin');
        this.markSold(it);
      },
      onCancel: () => { }
    });
  }
}

/* 歇脚：养气 / 修符 / 铭刻 */

import { W, H, PAL, FONT, DEPTH } from '../core/config.js';
import { run } from '../core/run.js';
import { audio } from '../core/audio.js';
import { text, makeButton, drawPanel } from '../ui/widgets.js';
import { pickCard } from '../ui/overlays.js';
import { RUNES, randomRune } from '../data/runes.js';
import { burst } from '../core/fx.js';
import { CARDS, canUpgrade, upgradeDiff } from '../data/cards.js';

export class RestScene extends Phaser.Scene {
  constructor() { super('Rest'); }

  create() {
    this.cameras.main.fadeIn(420, 20, 17, 14);
    this.done = false;
    this._leaving = false;
    const act = run.map ? run.map.act : { theme: 'dawn', index: 0 };
    const bgKey = this.textures.exists('bg_rest') ? 'bg_rest' : ('bg_act' + (act.index + 1));
    if (this.textures.exists(bgKey)) {
      this.add.image(W / 2, H / 2, bgKey).setDisplaySize(W, H).setDepth(DEPTH.bg).setAlpha(0.66);
    }
    this.add.rectangle(W / 2, H / 2, W, H, 0xefe6d4, 0.42).setDepth(DEPTH.bg + 1);

    text(this, W / 2, 108, '歇　脚', 46, { originX: 0.5, color: PAL.ink });
    text(this, W / 2, 156, '一炷香的工夫，只够做一件事', 15, {
      originX: 0.5, font: FONT.hei, color: 'rgba(58,52,44,0.55)'
    });

    const g = this.add.graphics().setDepth(DEPTH.scene);
    drawPanel(g, W / 2 - 470, 212, 940, 330, { fill: 0xfaf4e6, alpha: 0.96, gold: true });

    const bw = 276, bh = 92, gap = 30;
    const totalW = bw * 3 + gap * 2;
    const x0 = (W - totalW) / 2;

    const heal = Math.round(run.player.maxHp * 0.36);
    makeButton(this, x0, 268, bw, bh, '养　气', () => this.doHeal(heal), { size: 27 });
    text(this, x0 + bw / 2, 382, `回复 ${heal} 点气血`, 19, {
      originX: 0.5, font: FONT.hei, color: PAL.ink2
    });
    text(this, x0 + bw / 2, 410, '稳妥，但不会让你变强', 14, {
      originX: 0.5, font: FONT.hei, color: 'rgba(58,52,44,0.6)'
    });

    makeButton(this, x0 + bw + gap, 268, bw, bh, '修　符', () => this.doUpgrade(), { size: 27 });
    text(this, x0 + bw + gap + bw / 2, 382, '升级一张符箓', 19, {
      originX: 0.5, font: FONT.hei, color: PAL.ink2
    });
    text(this, x0 + bw + gap + bw / 2, 410, '数值提升，最直接的收益', 14, {
      originX: 0.5, font: FONT.hei, color: 'rgba(58,52,44,0.6)'
    });

    makeButton(this, x0 + (bw + gap) * 2, 268, bw, bh, '铭　刻', () => this.doEngrave(), { size: 27 });
    text(this, x0 + (bw + gap) * 2 + bw / 2, 382, '为一张符箓刻上篆文', 19, {
      originX: 0.5, font: FONT.hei, color: PAL.ink2
    });
    text(this, x0 + (bw + gap) * 2 + bw / 2, 410, '改变打法，但纹样随机', 14, {
      originX: 0.5, font: FONT.hei, color: 'rgba(58,52,44,0.6)'
    });

    text(this, W / 2, 500, '择其一，然后继续前行', 15, {
      originX: 0.5, font: FONT.hei, color: 'rgba(58,52,44,0.5)'
    });

    makeButton(this, W / 2 - 96, 600, 192, 54, '继续前行', () => this.leave(), {
      size: 20, font: FONT.hei
    });

    audio.playBgm(this, 'bgm_map');
  }

  doHeal(n) {
    if (this.done) return;
    run.heal(n);
    burst(this, W / 2, 380, { kind: 'gold', count: 22, speed: 180, life: 900, add: true });
    audio.sfx('heal');
    this.showResult(`气力回复，伤口收拢。\n气血 ${run.player.hp} / ${run.player.maxHp}`);
    this.lock();
  }

  doUpgrade() {
    if (this.done) return;
    const deck = run.player.deck.filter((c) => {
      const d = c.def || CARDS[c.id];
      return d && canUpgrade(c);
    });
    pickCard(this, {
      cards: deck,
      title: '修　符',
      subtitle: '卡下写着升级前后的数值',
      emptyText: '已无可修之符',
      upgradePreview: true,
      onPick: (card) => {
        const diffs = upgradeDiff(card);
        card.up = true;
        audio.sfx('relic');
        burst(this, W / 2, 380, { kind: 'cinnabar', count: 18, speed: 200, life: 800 });
        const d = card.def || CARDS[card.id];
        const line = diffs.map((x) => `${x.label} ${x.from} → ${x.to}`).join('、');
        this.showResult(`「${d.name}」${line ? line + '。' : ''}\n笔画重写，锋芒更盛。`);
        this.lock();
      },
      onCancel: () => { }
    });
  }

  doEngrave() {
    if (this.done) return;
    const deck = run.player.deck.filter((c) => {
      const d = c.def || CARDS[c.id];
      return d && !c.rune && d.rarity !== 'curse';
    });
    pickCard(this, {
      cards: deck,
      title: '铭　刻',
      subtitle: '选一张符箓，天授一枚篆文（随机）',
      emptyText: '每一张符箓都已刻满',
      onPick: (card) => {
        const rune = randomRune();
        run.engrave(card, rune);
        const rd = RUNES[rune];
        audio.sfx('relic');
        burst(this, W / 2, 380, { kind: 'ink', count: 24, speed: 220, life: 900 });
        this.showResult(`朱笔落下，「${rd.full}」二字没入纸背。\n${rd.desc}`);
        this.lock();
      },
      onCancel: () => { }
    });
  }

  lock() {
    this.done = true;
    this.time.delayedCall(1900, () => this.leave());
  }

  showResult(msg) {
    const g = this.add.graphics().setDepth(DEPTH.overlay);
    g.fillStyle(0x12100c, 0.9);
    g.fillRect(0, 0, W, H);
    // 实心面板：否则背后的三个选项会透出来，字压字
    const pw = 820, ph = 220;
    const px = (W - pw) / 2, py = (H - ph) / 2;
    g.fillStyle(0x1b1814, 0.98);
    g.fillRoundedRect(px, py, pw, ph, 6);
    g.lineStyle(1.4, 0xb98f3f, 0.45);
    g.strokeRoundedRect(px, py, pw, ph, 6);
    g.lineStyle(1, 0xb98f3f, 0.16);
    g.strokeRoundedRect(px + 10, py + 10, pw - 20, ph - 20, 4);
    text(this, W / 2, H / 2, msg, 28, {
      originX: 0.5, originY: 0.5, color: '#f3ecdc', align: 'center', lineSpacing: 16, wrap: 740
    }).setDepth(DEPTH.overlay + 1);
    // 面板只画不挡：补一个全屏交互区，避免点穿到下面的「继续前行」
    this.add.zone(W / 2, H / 2, W, H).setInteractive().setDepth(DEPTH.overlay + 2);
  }

  leave() {
    if (this._leaving) return;
    this._leaving = true;
    if (run.map && run.map.cur.node) run.map.cur.node.cleared = true;
    this.cameras.main.fadeOut(350, 20, 17, 14);
    this.time.delayedCall(380, () => this.scene.start('Map'));
  }
}

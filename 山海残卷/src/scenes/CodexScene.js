/* 山海图鉴：跨局收藏（符箓 / 异兽 / 法宝 / 药水 / 残页 / 五行） */

import { W, H, PAL, FONT, DEPTH } from '../core/config.js';
import { save } from '../core/save.js';
import { audio } from '../core/audio.js';
import { CARDS } from '../data/cards.js';
import { CARD_EL, ELEMENTS } from '../data/elements.js';
import { FOES, HABITATS, traitTags } from '../data/enemies.js';
import { RELICS, RELIC_SETS } from '../data/relics.js';
import { POTIONS } from '../data/potions.js';
import { PAGES, LORE, ARCHIVE, archiveKnown } from '../data/story.js';
import { ensureCardTexture } from '../ui/cardRender.js';
import { drawIcon } from '../ui/icons.js';
import { text, makeButton } from '../ui/widgets.js';

/* 内容区：标题与标签之下、页脚之上 */
const AREA = { x: 96, y: 216, w: 1408, h: 566 };

const TABS = [
  { key: 'cards', label: '符　箓', unit: '张', cols: 8, rows: 3, hint: '打出、战后择取或在鬼市见过，即记入' },
  { key: 'foes', label: '异　兽', unit: '只', cols: 6, rows: 2, hint: '遭遇即记入，不必击败' },
  { key: 'relics', label: '法　宝', unit: '件', cols: 2, rows: 6, hint: '拾得即记入' },
  { key: 'potions', label: '药　水', unit: '味', cols: 3, rows: 3, hint: '入袋即记入' },
  { key: 'pages', label: '残　页', unit: '页', cols: 3, rows: 3, hint: '在地图残页点或际遇中读到，即记入' },
  { key: 'archive', label: '卷　宗', unit: '条', cols: 3, rows: 3, hint: '入卷、遇守卷之兽、历际遇，见闻自会录于此' },
  { key: 'elements', label: '五　行', unit: '行', cols: 5, rows: 1, hint: '' }
];

const ELEM_ORDER = ['jin', 'mu', 'shui', 'huo', 'tu'];

const RARITY = {
  basic: '初始', common: '凡品', uncommon: '良品', rare: '珍品', curse: '诅咒'
};

const KIND = { normal: '寻常', elite: '精英', boss: '守卷' };

const BUFF_NAME = {
  weak: '虚弱', vuln: '易伤', poison: '中毒', burn: '灼烧',
  str: '力量', dex: '敏捷', regen: '回春', thorns: '荆棘', riposte: '反击'
};

export class CodexScene extends Phaser.Scene {
  constructor() { super('Codex'); }

  init() {
    // Phaser 复用场景实例：所有引用都必须重建
    this._tab = 0;
    this._page = 0;
    this._content = [];
    this._detail = null;
    this._closing = false;
    this._tabViews = [];
    this._pageText = null;
    this._countText = null;
    this._prevBtn = null;
    this._nextBtn = null;
  }

  create() {
    this.cameras.main.fadeIn(360, 20, 17, 14);
    this.buildEntries();
    this.buildBackground();
    this.buildHeader();
    this.buildTabs();
    this.buildFooter();
    this.bindKeys();
    this.renderTab();
    audio.playBgm(this, 'bgm_title');
  }

  /* ---------------- 数据 ---------------- */

  buildEntries() {
    const seen = save.data.seen || { cards: {}, foes: {}, relics: {}, potions: {} };
    const pagesGot = Array.isArray(save.data.pages) ? save.data.pages : [];

    const cardIds = Object.keys(CARDS)
      .filter((id) => CARDS[id].rarity !== 'curse')
      .sort((a, b) => {
        const ea = ELEM_ORDER.indexOf(CARD_EL[a]);
        const eb = ELEM_ORDER.indexOf(CARD_EL[b]);
        if (ea !== eb) return ea - eb;
        const ca = CARDS[a].cost < 0 ? 9 : CARDS[a].cost;
        const cb = CARDS[b].cost < 0 ? 9 : CARDS[b].cost;
        if (ca !== cb) return ca - cb;
        return CARDS[a].name.localeCompare(CARDS[b].name, 'zh');
      });

    const relicIds = Object.keys(RELICS).sort((a, b) => {
      const sa = Object.keys(RELIC_SETS).indexOf(RELICS[a].set);
      const sb = Object.keys(RELIC_SETS).indexOf(RELICS[b].set);
      if (sa !== sb) return sa - sb;
      return RELICS[a].name.localeCompare(RELICS[b].name, 'zh');
    });

    this.entries = {
      cards: cardIds.map((id) => ({ id, def: CARDS[id], known: !!seen.cards[id] })),
      foes: Object.keys(FOES).map((id) => ({ id, def: FOES[id], known: !!seen.foes[id] })),
      relics: relicIds.map((id) => ({ id, def: RELICS[id], known: !!seen.relics[id] })),
      potions: Object.keys(POTIONS).map((id) => ({ id, def: POTIONS[id], known: !!seen.potions[id] })),
      pages: PAGES.map((p) => ({ id: p.id, def: p, known: pagesGot.indexOf(p.id) >= 0 })),
      archive: ARCHIVE.flatMap((s) => s.items.map((it) => ({
        id: it.id, def: it, section: s.section, known: archiveKnown(it, save.data)
      }))),
      elements: ELEM_ORDER.map((id) => ({ id, def: ELEMENTS[id], known: true }))
    };
  }

  /* ---------------- 背景与页头 ---------------- */

  buildBackground() {
    this.add.rectangle(W / 2, H / 2, W, H, 0xefe6d4).setDepth(DEPTH.bg);
    const g = this.add.graphics().setDepth(DEPTH.bg + 1);
    // 淡墨晕，和地图/标题的纸面质感一致
    g.fillStyle(0x1d1a17, 0.028);
    g.fillCircle(250, 180, 220);
    g.fillCircle(1330, 720, 280);
    g.fillStyle(0xb98f3f, 0.03);
    g.fillCircle(800, 470, 340);
    // 竖向纸纹
    g.lineStyle(1, 0x1d1a17, 0.022);
    for (let x = 60; x < W; x += 46) g.lineBetween(x, 0, x, H);

    const top = this.add.graphics().setDepth(DEPTH.bg + 2);
    top.fillGradientStyle(0xefe6d4, 0xefe6d4, 0xefe6d4, 0xefe6d4, 0.9, 0.9, 0, 0);
    top.fillRect(0, 0, W, 180);
    const bot = this.add.graphics().setDepth(DEPTH.bg + 2);
    bot.fillGradientStyle(0xefe6d4, 0xefe6d4, 0xefe6d4, 0xefe6d4, 0, 0, 0.9, 0.9);
    bot.fillRect(0, H - 150, W, 150);
  }

  buildHeader() {
    const title = text(this, 96, 50, '山海图鉴', 46, {
      originY: 0.5, color: PAL.ink, depth: DEPTH.scene
    });
    title.setShadow(0, 4, 'rgba(60,44,26,0.2)', 12, false, true);

    // 朱印
    const seal = this.add.graphics().setDepth(DEPTH.scene);
    seal.fillStyle(0xb23a2e, 0.9);
    seal.fillRoundedRect(340, 28, 44, 44, 4);
    seal.lineStyle(1.4, 0xf3ecdc, 0.8);
    seal.strokeRoundedRect(345, 33, 34, 34, 2);
    this.add.text(362, 50, '识', {
      fontFamily: FONT.song, fontSize: '20px', color: '#f7f0e0'
    }).setOrigin(0.5).setDepth(DEPTH.scene + 1);

    const d = save.data;
    text(this, 400, 52,
      `入卷 ${d.runs} 次　·　破卷 ${d.wins} 次　·　所得皆为身外之物，唯识不散`,
      14, { font: FONT.hei, color: 'rgba(58,52,44,0.55)', originY: 0.5 });

    makeButton(this, 1360, 34, 144, 44, '合　上', () => this.close(), {
      size: 20, font: FONT.hei, depth: DEPTH.scene
    });
  }

  buildTabs() {
    const tw = 150, gap = 16;
    TABS.forEach((t, i) => {
      const x = 96 + i * (tw + gap);
      const g = this.add.graphics().setDepth(DEPTH.scene);
      const label = text(this, x + tw / 2, 148, t.label, 22, {
        originX: 0.5, originY: 0.5, color: 'rgba(58,52,44,0.5)', depth: DEPTH.scene + 1
      });
      const count = text(this, x + tw / 2, 178, '', 12, {
        originX: 0.5, originY: 0.5, font: FONT.hei, color: 'rgba(58,52,44,0.38)', depth: DEPTH.scene + 1
      });
      const zone = this.add.zone(x, 122, tw, 74).setOrigin(0, 0)
        .setInteractive({ useHandCursor: true }).setDepth(DEPTH.scene + 2);
      zone.on('pointerdown', () => { this.switchTab(i); });
      zone.on('pointerover', () => { if (this._tab !== i) label.setColor(PAL.cinnabar); });
      zone.on('pointerout', () => { if (this._tab !== i) label.setColor('rgba(58,52,44,0.5)'); });
      this._tabViews.push({ g, label, count, zone });
    });

    const line = this.add.graphics().setDepth(DEPTH.scene);
    line.lineStyle(1, 0x1d1a17, 0.16);
    line.lineBetween(96, 204, 1504, 204);
  }

  buildFooter() {
    this._prevBtn = makeButton(this, 636, 818, 120, 40, '‹ 前页', () => this.turnPage(-1), {
      size: 16, font: FONT.hei, depth: DEPTH.scene
    });
    this._nextBtn = makeButton(this, 844, 818, 120, 40, '后页 ›', () => this.turnPage(1), {
      size: 16, font: FONT.hei, depth: DEPTH.scene
    });
    this._pageText = text(this, 800, 838, '', 15, {
      originX: 0.5, originY: 0.5, font: FONT.hei, color: 'rgba(58,52,44,0.62)', depth: DEPTH.scene
    });
    this._countText = text(this, 96, 838, '', 13, {
      originY: 0.5, font: FONT.hei, color: 'rgba(58,52,44,0.42)', depth: DEPTH.scene
    });
    text(this, 1504, 838, '← → 换卷　·　↑ ↓ 翻页　·　ESC 合上', 13, {
      originX: 1, originY: 0.5, font: FONT.hei, color: 'rgba(58,52,44,0.42)', depth: DEPTH.scene
    });
  }

  bindKeys() {
    const kb = this.input.keyboard;
    if (!kb) return;
    kb.on('keydown-LEFT', () => this.switchTab((this._tab + TABS.length - 1) % TABS.length));
    kb.on('keydown-RIGHT', () => this.switchTab((this._tab + 1) % TABS.length));
    kb.on('keydown-UP', () => this.turnPage(-1));
    kb.on('keydown-DOWN', () => this.turnPage(1));
    kb.on('keydown-ESC', () => {
      if (this._detail) this.closeDetail();
      else this.close();
    });
  }

  /* ---------------- 标签与翻页 ---------------- */

  switchTab(i) {
    if (i === this._tab) return;
    if (this._detail) this.closeDetail();
    this._tab = i;
    this._page = 0;
    audio.sfx('page');
    this.renderTab();
  }

  turnPage(d) {
    const tab = TABS[this._tab];
    const total = Math.max(1, Math.ceil(this.entries[tab.key].length / (tab.cols * tab.rows)));
    const next = Math.min(total - 1, Math.max(0, this._page + d));
    if (next === this._page) return;
    this._page = next;
    audio.sfx('page');
    this.renderTab();
  }

  knownOf(key) {
    return this.entries[key].filter((e) => e.known).length;
  }

  renderTab() {
    this._content.forEach((o) => o.destroy());
    this._content = [];
    if (this._detail) this.closeDetail();

    const tab = TABS[this._tab];
    const items = this.entries[tab.key];
    const per = tab.cols * tab.rows;
    const totalPages = Math.max(1, Math.ceil(items.length / per));
    this._page = Math.min(this._page, totalPages - 1);

    // 标签态
    this._tabViews.forEach((v, i) => {
      const active = i === this._tab;
      v.label.setColor(active ? PAL.cinnabar : 'rgba(58,52,44,0.5)');
      v.count.setColor(active ? 'rgba(139,42,32,0.7)' : 'rgba(58,52,44,0.34)');
      v.count.setText(`${this.knownOf(TABS[i].key)} / ${this.entries[TABS[i].key].length}`);
      v.g.clear();
      if (active) {
        v.g.fillStyle(0xb23a2e, 1);
        v.g.fillRect(96 + i * 166 + 34, 190, 82, 2.4);
      }
    });

    // 页脚
    const known = this.knownOf(tab.key);
    // 五行卷是常驻图例、卷宗是叙事收藏，均不计入「已识 / 全卷」的收藏进度
    const tally = TABS.filter((t) => t.key !== 'elements' && t.key !== 'archive');
    const allKnown = tally.reduce((s, t) => s + this.knownOf(t.key), 0);
    const allTotal = tally.reduce((s, t) => s + this.entries[t.key].length, 0);
    this._pageText.setText(`${this._page + 1} / ${totalPages}`);
    const done = known === items.length && items.length > 0;
    const lead = known === 0 ? `${tab.hint}　·　` : '';
    this._countText.setText(
      `${lead}已识 ${known} / ${items.length} ${tab.unit}　·　全卷 ${allKnown} / ${allTotal}` +
      (done ? '　·　此卷已尽' : '')
    );
    if (this._prevBtn) this._prevBtn.setAlpha(this._page > 0 ? 1 : 0.3);
    if (this._nextBtn) this._nextBtn.setAlpha(this._page < totalPages - 1 ? 1 : 0.3);

    if (tab.key === 'elements') {
      this._pageText.setText('1 / 1');
      this._countText.setText('五行相生相克，符箓与异兽各有所属');
      this.drawElementChart();
      return;
    }

    const slice = items.slice(this._page * per, this._page * per + per);
    const cellW = AREA.w / tab.cols;
    const cellH = AREA.h / tab.rows;

    slice.forEach((item, i) => {
      const col = i % tab.cols;
      const row = Math.floor(i / tab.cols);
      const cx = AREA.x + col * cellW + cellW / 2;
      const cy = AREA.y + row * cellH;
      if (tab.key === 'cards') this.drawCardCell(item, cx, cy, cellW, cellH);
      else if (tab.key === 'foes') this.drawFoeCell(item, cx, cy, cellW, cellH);
      else if (tab.key === 'relics') this.drawRelicCell(item, cx, cy, cellW, cellH);
      else if (tab.key === 'potions') this.drawPotionCell(item, cx, cy, cellW, cellH);
      else if (tab.key === 'archive') this.drawArchiveCell(item, cx, cy, cellW, cellH);
      else this.drawPageCell(item, cx, cy, cellW, cellH);
    });

    if (!items.length) {
      this._content.push(text(this, W / 2, 500, '空　卷', 30, {
        originX: 0.5, originY: 0.5, color: 'rgba(58,52,44,0.3)'
      }));
    }
  }

  /* ---------------- 五行卷：相生相克图 ---------------- */

  drawElementChart() {
    const cx = 1010, cy = 496, R = 196;
    // 节点必须按「相生」顺序绕环排：金→水→木→火→土，
    // 这样相邻弧就是相生，隔位连线正好是相克（金克木、木克土…）。
    const RING = (() => {
      const out = [];
      let cur = 'jin';
      for (let i = 0; i < 5 && cur; i++) { out.push(cur); cur = ELEMENTS[cur].generates; }
      return out;
    })();
    const pos = {};
    RING.forEach((id, i) => {
      const a = (-90 + i * 72) * Math.PI / 180;
      pos[id] = { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, a };
    });

    const hex = (c) => parseInt(String(c).replace('#', ''), 16);
    const g = this.add.graphics().setDepth(DEPTH.scene);
    this._content.push(g);

    // 外环：相生
    g.lineStyle(1, 0x1d1a17, 0.16);
    g.strokeCircle(cx, cy, R);

    RING.forEach((id, i) => {
      const conf = ELEMENTS[id];
      const p1 = pos[id];
      const p2 = pos[RING[(i + 1) % RING.length]];
      let a1 = p1.a;
      let a2 = p2.a;
      while (a2 <= a1) a2 += Math.PI * 2;
      const pad = 0.30;
      g.lineStyle(2, hex(conf.color), 0.46);
      g.beginPath();
      g.arc(cx, cy, R, a1 + pad, a2 - pad, false);
      g.strokePath();
      // 箭头落在弧末端
      const am = a2 - pad - 0.05;
      const ax = cx + Math.cos(am) * R;
      const ay = cy + Math.sin(am) * R;
      const dir = am + Math.PI / 2;
      g.fillStyle(hex(conf.color), 0.66);
      g.beginPath();
      g.moveTo(ax + Math.cos(dir) * 9, ay + Math.sin(dir) * 9);
      g.lineTo(ax + Math.cos(dir + 2.6) * 9, ay + Math.sin(dir + 2.6) * 9);
      g.lineTo(ax + Math.cos(dir - 2.6) * 9, ay + Math.sin(dir - 2.6) * 9);
      g.closePath();
      g.fillPath();
    });

    // 五角星：相克（隔位相连）
    const dash = (x1, y1, x2, y2, color) => {
      const len = Math.hypot(x2 - x1, y2 - y1);
      const n = Math.max(2, Math.round(len / 15));
      g.lineStyle(1.4, color, 0.4);
      for (let i = 0; i < n; i += 2) {
        const t1 = i / n;
        const t2 = Math.min(1, (i + 1) / n);
        g.lineBetween(
          x1 + (x2 - x1) * t1, y1 + (y2 - y1) * t1,
          x1 + (x2 - x1) * t2, y1 + (y2 - y1) * t2
        );
      }
    };
    RING.forEach((id, i) => {
      const p1 = pos[id];
      const p2 = pos[RING[(i + 2) % RING.length]];
      dash(p1.x, p1.y, p2.x, p2.y, 0x8b2a20);
    });

    // 节点
    RING.forEach((id) => {
      const conf = ELEMENTS[id];
      const p = pos[id];
      const c = hex(conf.color);
      const cards = Object.keys(CARD_EL).filter((k) => CARD_EL[k] === id).length;
      const foes = Object.values(FOES).filter((f) => f.el === id).length;

      g.fillStyle(0xf7f0e0, 1);
      g.fillCircle(p.x, p.y, 58);
      g.fillStyle(c, 0.1);
      g.fillCircle(p.x, p.y, 58);
      g.lineStyle(1.8, c, 0.8);
      g.strokeCircle(p.x, p.y, 58);
      g.lineStyle(1, c, 0.28);
      g.strokeCircle(p.x, p.y, 50);

      this._content.push(this.add.text(p.x, p.y - 6, conf.name, {
        fontFamily: FONT.song, fontSize: '44px', color: conf.color
      }).setOrigin(0.5).setDepth(DEPTH.scene + 1));

      this._content.push(this.add.text(p.x, p.y + 34, `${cards} 符 · ${foes} 兽`, {
        fontFamily: FONT.hei, fontSize: '12px', color: 'rgba(58,52,44,0.5)'
      }).setOrigin(0.5).setDepth(DEPTH.scene + 1));
    });

    // 中心：相生 / 相克 两枚小注
    this._content.push(this.add.text(cx, cy - 22, '生', {
      fontFamily: FONT.song, fontSize: '40px', color: 'rgba(74,122,82,0.5)'
    }).setOrigin(0.5).setDepth(DEPTH.scene + 1));
    this._content.push(this.add.text(cx, cy + 24, '克', {
      fontFamily: FONT.song, fontSize: '40px', color: 'rgba(139,42,32,0.5)'
    }).setOrigin(0.5).setDepth(DEPTH.scene + 1));

    // 左侧说明
    const L = 150;
    this._content.push(text(this, L, 268, '相　生', 26, { color: PAL.ink }));
    this._content.push(text(this, L, 310,
      '金生水　水生木　木生火\n火生土　土生金', 17, {
        font: FONT.hei, color: 'rgba(58,52,44,0.72)', lineSpacing: 10
      }));
    this._content.push(text(this, L, 384,
      '相邻两张按此序出牌，抽 1 张。\n每回合至多 2 次。', 14, {
        font: FONT.hei, color: 'rgba(58,52,44,0.5)', lineSpacing: 8
      }));

    this._content.push(text(this, L, 470, '相　克', 26, { color: PAL.cinnabar }));
    this._content.push(text(this, L, 512,
      '金克木　木克土　土克水\n水克火　火克金', 17, {
        font: FONT.hei, color: 'rgba(58,52,44,0.72)', lineSpacing: 10
      }));
    this._content.push(text(this, L, 586,
      '符箓克异兽之属：伤害 ×1.3\n被其所克：伤害 ×0.9', 14, {
        font: FONT.hei, color: 'rgba(58,52,44,0.5)', lineSpacing: 8
      }));

    this._content.push(text(this, L, 668,
      '异兽名旁的圆印即其五行；出牌前先看敌人属什么。', 13, {
        font: FONT.hei, color: 'rgba(139,42,32,0.55)', wrap: 760
      }));
  }

  /* ---------------- 单元：符箓 ---------------- */

  drawCardCell(item, cx, cy, cellW, cellH) {
    const cw = Math.min(120, cellW - 40);
    const ch = Math.round(cw * 1.4);
    const y = cy + (cellH - ch) / 2;

    if (item.known) {
      const key = ensureCardTexture(this, { id: item.id, up: false, def: item.def });
      const img = this.add.image(cx, y + ch / 2, key).setDisplaySize(cw, ch)
        .setDepth(DEPTH.scene + 1);
      this._content.push(img);
      const zone = this.add.zone(cx - cw / 2, y, cw, ch).setOrigin(0, 0)
        .setInteractive({ useHandCursor: true }).setDepth(DEPTH.scene + 2);
      zone.on('pointerover', () => img.setDisplaySize(cw * 1.05, ch * 1.05));
      zone.on('pointerout', () => img.setDisplaySize(cw, ch));
      zone.on('pointerdown', () => this.showCard(item));
      this._content.push(zone);
    } else {
      const g = this.add.graphics().setDepth(DEPTH.scene);
      g.fillStyle(0xdccdb4, 0.55);
      g.fillRoundedRect(cx - cw / 2, y, cw, ch, 5);
      g.lineStyle(1, 0x1d1a17, 0.16);
      g.strokeRoundedRect(cx - cw / 2, y, cw, ch, 5);
      g.strokeRoundedRect(cx - cw / 2 + 6, y + 6, cw - 12, ch - 12, 3);
      this._content.push(g);
      this._content.push(text(this, cx, y + ch / 2, '未\n识', 15, {
        originX: 0.5, originY: 0.5, align: 'center', lineSpacing: 4,
        color: 'rgba(58,52,44,0.28)'
      }));
      // 未识也留一点线索：右上角五行小印
      const el = ELEMENTS[CARD_EL[item.id]];
      if (el) {
        const sx = cx + cw / 2 - 20, sy = y + 20;
        const stamp = this.add.graphics().setDepth(DEPTH.scene + 1);
        const col = Phaser.Display.Color.HexStringToColor(el.color).color;
        stamp.fillStyle(col, 0.1);
        stamp.fillCircle(sx, sy, 9);
        stamp.lineStyle(1, col, 0.24);
        stamp.strokeCircle(sx, sy, 9);
        this._content.push(stamp);
        this._content.push(text(this, sx, sy + 0.5, el.name, 10, {
          originX: 0.5, originY: 0.5, color: el.color, depth: DEPTH.scene + 2
        }));
      }
    }
  }

  /* ---------------- 单元：异兽 ---------------- */

  drawFoeCell(item, cx, cy, cellW) {
    const box = Math.min(196, cellW - 30);
    const top = cy + 8;
    const key = 'foe_' + item.id;

    // 浅墨底片：白羽异兽（白鵺）在纸色上也要有轮廓可依
    const plate = this.add.graphics().setDepth(DEPTH.scene - 1);
    plate.fillStyle(0x1d1a17, item.known ? 0.045 : 0.035);
    plate.fillRoundedRect(cx - box / 2 - 6, top - 2, box + 12, box + 8, 4);
    this._content.push(plate);

    if (this.textures.exists(key)) {
      const img = this.add.image(cx, top + box / 2, key);
      const scale = Math.min(box / img.width, box / img.height);
      img.setScale(scale);
      if (!item.known) img.setTint(0x1d1a17).setAlpha(0.14);
      img.setDepth(DEPTH.scene);
      this._content.push(img);
    } else {
      const g = this.add.graphics().setDepth(DEPTH.scene);
      g.fillStyle(0x1d1a17, item.known ? 0.08 : 0.05);
      g.fillCircle(cx, top + box / 2, box / 2);
      this._content.push(g);
    }

    if (item.known) {
      this._content.push(text(this, cx, top + box + 22, item.def.name, 20, {
        originX: 0.5, originY: 0.5, color: PAL.ink
      }));
      this._content.push(text(this, cx, top + box + 48, KIND[item.def.kind] || '', 12, {
        originX: 0.5, originY: 0.5, font: FONT.hei,
        color: item.def.kind === 'boss' ? 'rgba(139,42,32,0.75)' : 'rgba(58,52,44,0.45)'
      }));
      const zone = this.add.zone(cx - cellW / 2 + 6, cy, cellW - 12, 274).setOrigin(0, 0)
        .setInteractive({ useHandCursor: true }).setDepth(DEPTH.scene + 2);
      zone.on('pointerdown', () => this.showFoe(item));
      this._content.push(zone);
    } else {
      this._content.push(text(this, cx, top + box + 28, '未　识', 17, {
        originX: 0.5, originY: 0.5, color: 'rgba(58,52,44,0.28)'
      }));
    }
  }

  /* ---------------- 单元：法宝 ---------------- */

  drawRelicCell(item, cx, cy, cellW, cellH) {
    const w = cellW - 24, h = 80;
    const x = cx - w / 2, y = cy + (cellH - h) / 2;
    const g = this.add.graphics().setDepth(DEPTH.scene);
    g.fillStyle(0xfaf4e6, 0.72);
    g.fillRoundedRect(x, y, w, h, 5);
    g.lineStyle(1, 0x1d1a17, 0.14);
    g.strokeRoundedRect(x, y, w, h, 5);
    this._content.push(g);

    const iconColor = item.known ? (RELIC_SETS[item.def.set] ? RELIC_SETS[item.def.set].color : PAL.gold) : '#8b7f6c';
    const ikey = this.iconTexture(item.def.icon || 'star', item.known ? iconColor : '#a89c86');
    const ig = this.add.graphics().setDepth(DEPTH.scene + 1);
    ig.fillStyle(0x241f18, item.known ? 0.9 : 0.35);
    ig.fillCircle(x + 48, y + h / 2, 28);
    ig.lineStyle(1, 0xb98f3f, item.known ? 0.5 : 0.2);
    ig.strokeCircle(x + 48, y + h / 2, 28);
    this._content.push(ig);
    if (ikey) {
      const im = this.add.image(x + 48, y + h / 2, ikey).setDisplaySize(38, 38)
        .setDepth(DEPTH.scene + 2);
      if (!item.known) im.setAlpha(0.5);
      this._content.push(im);
    }

    if (item.known) {
      this._content.push(text(this, x + 92, y + 16, item.def.name, 20, {
        color: PAL.ink, depth: DEPTH.scene + 2
      }));
      const set = RELIC_SETS[item.def.set];
      if (set) {
        this._content.push(text(this, x + w - 16, y + 20, set.name, 12, {
          originX: 1, font: FONT.hei, color: set.color, depth: DEPTH.scene + 2
        }));
      }
      this._content.push(text(this, x + 92, y + 46, item.def.desc, 13, {
        font: FONT.hei, color: 'rgba(58,52,44,0.66)', wrap: w - 116,
        lineSpacing: 3, depth: DEPTH.scene + 2
      }));
      const zone = this.add.zone(x, y, w, h).setOrigin(0, 0)
        .setInteractive({ useHandCursor: true }).setDepth(DEPTH.scene + 3);
      zone.on('pointerdown', () => this.showRelic(item));
      this._content.push(zone);
    } else {
      this._content.push(text(this, x + 92, y + 28, '？　？　？', 20, {
        color: 'rgba(58,52,44,0.26)', depth: DEPTH.scene + 2
      }));
    }
  }

  /* ---------------- 单元：药水 ---------------- */

  drawPotionCell(item, cx, cy, cellW, cellH) {
    const w = cellW - 24, h = 150;
    const x = cx - w / 2, y = cy + (cellH - h) / 2;
    const g = this.add.graphics().setDepth(DEPTH.scene);
    g.fillStyle(0xfaf4e6, 0.68);
    g.fillRoundedRect(x, y, w, h, 5);
    g.lineStyle(1, 0x1d1a17, 0.13);
    g.strokeRoundedRect(x, y, w, h, 5);
    this._content.push(g);

    const color = item.known ? item.def.color : '#a89c86';
    const ikey = this.iconTexture(item.def.icon || 'gourd', color);
    if (ikey) {
      const im = this.add.image(cx, y + 40, ikey).setDisplaySize(46, 46).setDepth(DEPTH.scene + 1);
      if (!item.known) im.setAlpha(0.4);
      this._content.push(im);
    }

    this._content.push(text(this, cx, y + 82, item.known ? item.def.name : '未　识', 19, {
      originX: 0.5, originY: 0.5, color: item.known ? PAL.ink : 'rgba(58,52,44,0.26)',
      depth: DEPTH.scene + 1
    }));
    if (item.known) {
      this._content.push(text(this, cx, y + 110, item.def.desc, 13, {
        originX: 0.5, font: FONT.hei, color: 'rgba(58,52,44,0.62)',
        align: 'center', wrap: w - 40, lineSpacing: 4, depth: DEPTH.scene + 1
      }));
    }
  }

  /* ---------------- 单元：残页 ---------------- */

  drawPageCell(item, cx, cy, cellW, cellH) {
    const w = cellW - 26, h = cellH - 16;
    const x = cx - w / 2, y = cy + 8;
    const g = this.add.graphics().setDepth(DEPTH.scene);
    g.fillStyle(item.known ? 0xf7efdd : 0xded0b8, item.known ? 0.9 : 0.5);
    g.fillRoundedRect(x, y, w, h, 4);
    g.lineStyle(1, 0x1d1a17, item.known ? 0.22 : 0.12);
    g.strokeRoundedRect(x, y, w, h, 4);
    if (item.known) {
      // 焦边
      g.fillStyle(0x6b4a2a, 0.1);
      g.fillRect(x, y + h - 10, w, 10);
    }
    this._content.push(g);

    if (item.known) {
      this._content.push(text(this, x + 20, y + 16, item.def.title, 19, {
        color: PAL.cinnabarDeep, depth: DEPTH.scene + 1
      }));
      const preview = item.def.text.split('\n').slice(0, 3).join('\n');
      this._content.push(text(this, x + 20, y + 48, preview, 13, {
        font: FONT.hei, color: 'rgba(58,52,44,0.64)', wrap: w - 40,
        lineSpacing: 7, depth: DEPTH.scene + 1
      }));
      const zone = this.add.zone(x, y, w, h).setOrigin(0, 0)
        .setInteractive({ useHandCursor: true }).setDepth(DEPTH.scene + 2);
      zone.on('pointerdown', () => this.showPage(item));
      this._content.push(zone);
    } else {
      this._content.push(text(this, cx, y + h / 2, '未　得', 18, {
        originX: 0.5, originY: 0.5, color: 'rgba(58,52,44,0.24)'
      }));
    }
  }

  /* ---------------- 单元：卷宗 ---------------- */

  drawArchiveCell(item, cx, cy, cellW, cellH) {
    const w = cellW - 26, h = cellH - 16;
    const x = cx - w / 2, y = cy + 8;
    const g = this.add.graphics().setDepth(DEPTH.scene);
    g.fillStyle(item.known ? 0xf7efdd : 0xded0b8, item.known ? 0.9 : 0.5);
    g.fillRoundedRect(x, y, w, h, 4);
    g.lineStyle(1, 0x1d1a17, item.known ? 0.22 : 0.12);
    g.strokeRoundedRect(x, y, w, h, 4);
    this._content.push(g);

    if (item.known) {
      // 分隔小印：世情 / 卷引 / 守卷 / 人物
      this._content.push(text(this, x + 20, y + 16, item.section, 12, {
        font: FONT.hei, color: 'rgba(139,42,32,0.6)', depth: DEPTH.scene + 1
      }));
      this._content.push(text(this, x + 20, y + 40, item.def.title, 20, {
        color: PAL.ink, depth: DEPTH.scene + 1
      }));
      const preview = item.def.text.replace(/\n+/g, ' ').slice(0, 46) + '……';
      this._content.push(text(this, x + 20, y + 74, preview, 13, {
        font: FONT.hei, color: 'rgba(58,52,44,0.6)', wrap: w - 40,
        lineSpacing: 7, depth: DEPTH.scene + 1
      }));
      const zone = this.add.zone(x, y, w, h).setOrigin(0, 0)
        .setInteractive({ useHandCursor: true }).setDepth(DEPTH.scene + 2);
      zone.on('pointerdown', () => this.showArchive(item));
      this._content.push(zone);
    } else {
      this._content.push(text(this, cx, y + h / 2, '未　闻', 18, {
        originX: 0.5, originY: 0.5, color: 'rgba(58,52,44,0.24)'
      }));
    }
  }

  showArchive(item) {
    if (this._detail) return;
    audio.sfx('page');
    const layer = this.detailLayer();
    const w = 900, h = 540, x = (W - w) / 2, y = (H - h) / 2 - 10;
    const g = this.add.graphics();
    g.fillStyle(0xf7efdd, 0.97);
    g.fillRoundedRect(x, y, w, h, 4);
    g.lineStyle(1.2, 0x1d1a17, 0.28);
    g.strokeRoundedRect(x, y, w, h, 4);
    g.lineStyle(1, 0x1d1a17, 0.1);
    g.strokeRoundedRect(x + 12, y + 12, w - 24, h - 24, 2);
    layer.add(g);

    layer.add(this.add.text(x + 56, y + 44, item.section, {
      fontFamily: FONT.hei, fontSize: '14px', color: 'rgba(139,42,32,0.65)'
    }));
    layer.add(this.add.text(x + 56, y + 74, item.def.title, {
      fontFamily: FONT.song, fontSize: '32px', color: PAL.cinnabarDeep
    }));
    if (item.def.sub) {
      layer.add(this.add.text(x + 56, y + 124, item.def.sub, {
        fontFamily: FONT.hei, fontSize: '16px', color: 'rgba(58,52,44,0.62)'
      }));
    }
    layer.add(this.add.text(x + 56, y + (item.def.sub ? 162 : 134), item.def.text, {
      fontFamily: FONT.song, fontSize: '20px', color: 'rgba(29,26,23,0.86)',
      wordWrap: { width: w - 112 }, lineSpacing: 15
    }));
    layer.add(this.add.text(W / 2, H - 52, '点击任意处合上', {
      fontFamily: FONT.hei, fontSize: '13px', color: 'rgba(232,220,192,0.4)'
    }).setOrigin(0.5));
  }

  /* ---------------- 详情 ---------------- */

  iconTexture(name, color) {
    const hex = (color || '#b98f3f').replace('#', '');
    const key = 'cx_' + name + '_' + hex;
    if (this.textures.exists(key)) return key;
    const tex = this.textures.createCanvas(key, 96, 96);
    if (!tex) return null;
    drawIcon(tex.getContext(), name, 48, 48, 74, '#' + hex, 1.35);
    tex.refresh();
    return key;
  }

  detailLayer() {
    const layer = this.add.container(0, 0).setDepth(DEPTH.overlay + 20);
    const bg = this.add.rectangle(W / 2, H / 2, W, H, 0x12100c, 0.992);
    bg.setInteractive();
    bg.on('pointerdown', () => this.closeDetail());
    layer.add(bg);
    this._detail = layer;
    return layer;
  }

  showCard(item) {
    if (this._detail) return;
    audio.sfx('click');
    const layer = this.detailLayer();
    const key = ensureCardTexture(this, { id: item.id, up: false, def: item.def });
    const img = this.add.image(W / 2, H / 2 - 10, key).setDisplaySize(306, 429);
    layer.add(img);

    const el = ELEMENTS[CARD_EL[item.id]];
    const bits = [el ? `${el.name} · ${el.boon}` : '无属', RARITY[item.def.rarity] || ''];
    if (item.def.target === 'all') bits.push('群体');
    const t = this.add.text(W / 2, H / 2 + 236, bits.filter(Boolean).join('　·　'), {
      fontFamily: FONT.hei, fontSize: '16px', color: 'rgba(232,220,192,0.82)'
    }).setOrigin(0.5);
    layer.add(t);

    const hint = this.add.text(W / 2, H - 42, '点击任意处合上', {
      fontFamily: FONT.hei, fontSize: '13px', color: 'rgba(232,220,192,0.55)'
    }).setOrigin(0.5);
    layer.add(hint);
  }

  showFoe(item) {
    if (this._detail) return;
    audio.sfx('click');
    const layer = this.detailLayer();

    const key = 'foe_' + item.id;
    if (this.textures.exists(key)) {
      const img = this.add.image(452, 440, key);
      const scale = Math.min(400 / img.width, 400 / img.height);
      img.setScale(scale);
      layer.add(img);
    }

    const left = 726;
    layer.add(this.add.text(left, 236, item.def.name, {
      fontFamily: FONT.song, fontSize: '46px', color: '#f6efdf'
    }));
    layer.add(this.add.text(left + 2, 296, item.def.title || '', {
      fontFamily: FONT.song, fontSize: '19px', color: 'rgba(226,196,137,0.85)'
    }));

    const tag = KIND[item.def.kind] || '';
    const hp = item.def.hp ? `${item.def.hp[0]}–${item.def.hp[1]} 气血` : '';
    const hab = HABITATS[item.def.hab] ? `出没于${HABITATS[item.def.hab]}` : '';
    const elName = ELEMENTS[item.def.el] ? `属${ELEMENTS[item.def.el].name}` : '';
    layer.add(this.add.text(left, 332, [tag, hp, hab, elName].filter(Boolean).join('　·　'), {
      fontFamily: FONT.hei, fontSize: '14px', color: 'rgba(202,191,169,0.7)'
    }));

    layer.add(this.add.text(left, 366, item.def.lore || '', {
      fontFamily: FONT.hei, fontSize: '17px', color: 'rgba(234,226,211,0.94)',
      wordWrap: { width: 720 }, lineSpacing: 8
    }));

    // 经文：《山海经》原文（较正文更全的旧抄），有则附一行
    const jing = LORE[item.id];
    if (jing && jing !== item.def.lore) {
      layer.add(this.add.text(left, 404, `经　「${jing}」`, {
        fontFamily: FONT.song, fontSize: '14px', color: 'rgba(202,191,169,0.62)',
        wordWrap: { width: 720 }, lineSpacing: 6
      }));
    }

    // 招式
    const moves = item.def.moves || [];
    if (moves.length) {
      layer.add(this.add.text(left, 470, '招　式', {
        fontFamily: FONT.song, fontSize: '18px', color: 'rgba(226,196,137,0.7)'
      }));
      moves.slice(0, 6).forEach((m, i) => {
        const y = 504 + i * 30;
        layer.add(this.add.text(left, y, m.name, {
          fontFamily: FONT.song, fontSize: '18px', color: '#f3ecdc'
        }));
        layer.add(this.add.text(left + 116, y + 2, this.moveText(m), {
          fontFamily: FONT.hei, fontSize: '14px', color: 'rgba(202,191,169,0.78)'
        }));
      });
    }

    // 性情：把立绘下的红字小标签在这里写全
    const tags = traitTags(item.def);
    if (tags.length) {
      layer.add(this.add.text(1160, 470, '性　情', {
        fontFamily: FONT.song, fontSize: '18px', color: 'rgba(226,196,137,0.7)'
      }));
      layer.add(this.add.text(1160, 506, tags.join('\n'), {
        fontFamily: FONT.hei, fontSize: '15px', color: 'rgba(214,150,138,0.9)',
        lineSpacing: 12
      }));
    }

    const rule = this.add.graphics();
    rule.lineStyle(1, 0xb98f3f, 0.16);
    rule.lineBetween(left, 648, W - 120, 648);
    layer.add(rule);
    layer.add(this.add.text(W - 120, 660, '—— 残卷 · 异兽志', {
      fontFamily: FONT.hei, fontSize: '13px', color: 'rgba(226,196,137,0.42)'
    }).setOrigin(1, 0));

    layer.add(this.add.text(W / 2, H - 32, '点击任意处合上', {
      fontFamily: FONT.hei, fontSize: '13px', color: 'rgba(232,220,192,0.4)'
    }).setOrigin(0.5));
  }

  moveText(m) {
    const p = [];
    if (m.dmg) p.push(`伤害 ${m.dmg}${m.hits > 1 ? ' × ' + m.hits : ''}`);
    if (m.block) p.push(`护甲 ${m.block}`);
    if (m.playerBuff) p.push(`我方 ${BUFF_NAME[m.playerBuff[0]] || m.playerBuff[0]} ${m.playerBuff[1]}`);
    if (m.selfBuff) p.push(`自身 ${BUFF_NAME[m.selfBuff[0]] || m.selfBuff[0]} ${m.selfBuff[1]}`);
    if (m.special === 'curse') p.push('塞入诅咒');
    return p.join('　·　');
  }

  showRelic(item) {
    if (this._detail) return;
    audio.sfx('click');
    const layer = this.detailLayer();
    const set = RELIC_SETS[item.def.set];

    const w = 760, h = 320, x = (W - w) / 2, y = (H - h) / 2 - 20;
    const g = this.add.graphics();
    g.fillStyle(0x1b1814, 0.98);
    g.fillRoundedRect(x, y, w, h, 6);
    g.lineStyle(1.4, 0xb98f3f, 0.5);
    g.strokeRoundedRect(x, y, w, h, 6);
    g.lineStyle(1, 0xb98f3f, 0.18);
    g.strokeRoundedRect(x + 10, y + 10, w - 20, h - 20, 4);
    layer.add(g);

    const ikey = this.iconTexture(item.def.icon || 'star', set ? set.color : PAL.goldLight);
    if (ikey) {
      const im = this.add.image(x + 96, y + h / 2, ikey).setDisplaySize(84, 84);
      layer.add(im);
    }
    layer.add(this.add.text(x + 172, y + 52, item.def.name, {
      fontFamily: FONT.song, fontSize: '38px', color: '#f6efdf'
    }));
    if (set) {
      layer.add(this.add.text(x + 174, y + 104, `${set.name}　·　${set.desc}`, {
        fontFamily: FONT.hei, fontSize: '15px', color: 'rgba(226,196,137,0.8)'
      }));
    }
    layer.add(this.add.text(x + 174, y + 150, item.def.desc, {
      fontFamily: FONT.hei, fontSize: '19px', color: 'rgba(232,222,204,0.9)',
      wordWrap: { width: w - 230 }, lineSpacing: 9
    }));
    layer.add(this.add.text(W / 2, H - 60, '点击任意处合上', {
      fontFamily: FONT.hei, fontSize: '13px', color: 'rgba(232,220,192,0.4)'
    }).setOrigin(0.5));
  }

  showPotion(item) {
    if (this._detail) return;
    audio.sfx('click');
    const layer = this.detailLayer();
    const w = 700, h = 300, x = (W - w) / 2, y = (H - h) / 2 - 10;
    const g = this.add.graphics();
    g.fillStyle(0x1b1814, 0.98);
    g.fillRoundedRect(x, y, w, h, 6);
    g.lineStyle(1.4, 0xb98f3f, 0.5);
    g.strokeRoundedRect(x, y, w, h, 6);
    layer.add(g);

    const ikey = this.iconTexture(item.def.icon || 'gourd', item.def.color);
    if (ikey) {
      const im = this.add.image(x + 92, y + h / 2, ikey).setDisplaySize(80, 80);
      layer.add(im);
    }
    layer.add(this.add.text(x + 164, y + 62, item.def.name, {
      fontFamily: FONT.song, fontSize: '38px', color: '#f6efdf'
    }));
    layer.add(this.add.text(x + 166, y + 124, '不占灵力　·　不占出牌次数', {
      fontFamily: FONT.hei, fontSize: '14px', color: 'rgba(226,196,137,0.68)'
    }));
    layer.add(this.add.text(x + 166, y + 164, item.def.desc, {
      fontFamily: FONT.hei, fontSize: '19px', color: 'rgba(232,222,204,0.9)',
      wordWrap: { width: w - 220 }, lineSpacing: 9
    }));
    layer.add(this.add.text(W / 2, H / 2 + 190, '点击任意处合上', {
      fontFamily: FONT.hei, fontSize: '13px', color: 'rgba(232,220,192,0.4)'
    }).setOrigin(0.5));
  }

  showPage(item) {
    if (this._detail) return;
    audio.sfx('page');
    const layer = this.detailLayer();
    const w = 900, h = 520, x = (W - w) / 2, y = (H - h) / 2 - 10;
    const g = this.add.graphics();
    g.fillStyle(0xf7efdd, 0.97);
    g.fillRoundedRect(x, y, w, h, 4);
    g.lineStyle(1.2, 0x1d1a17, 0.28);
    g.strokeRoundedRect(x, y, w, h, 4);
    g.lineStyle(1, 0x1d1a17, 0.1);
    g.strokeRoundedRect(x + 12, y + 12, w - 24, h - 24, 2);
    layer.add(g);

    layer.add(this.add.text(x + 56, y + 48, item.def.title, {
      fontFamily: FONT.song, fontSize: '30px', color: PAL.cinnabarDeep
    }));
    layer.add(this.add.text(x + 56, y + 110, item.def.text, {
      fontFamily: FONT.song, fontSize: '20px', color: 'rgba(29,26,23,0.86)',
      wordWrap: { width: w - 112 }, lineSpacing: 14
    }));
    layer.add(this.add.text(W / 2, H - 52, '点击任意处合上', {
      fontFamily: FONT.hei, fontSize: '13px', color: 'rgba(232,220,192,0.4)'
    }).setOrigin(0.5));
  }

  closeDetail() {
    if (!this._detail) return;
    try { this._detail.destroy(true); } catch (e) { /* ignore */ }
    this._detail = null;
  }

  close() {
    if (this._detail) { this.closeDetail(); return; }
    if (this._closing) return;
    this._closing = true;
    audio.sfx('page');
    this.cameras.main.fadeOut(240, 20, 17, 14);
    this.time.delayedCall(250, () => this.scene.start('Title'));
  }
}

/* 地图：三卷行程 */

import { W, H, PAL, FONT, DEPTH } from '../core/config.js';
import { save } from '../core/save.js';
import { run } from '../core/run.js';
import { audio } from '../core/audio.js';
import { generateMap, availableNodes, genEncounter, NODE_LABEL } from '../systems/mapgen.js';
import { ACT_INTRO } from '../data/story.js';
import { text, makeButton, drawPanel } from '../ui/widgets.js';
import { openOverlay, openRules } from '../ui/overlays.js';
import { POTION_MAX } from '../data/potions.js';

const NODE_CHAR = {
  battle: '战', elite: '精', boss: '守',
  event: '遇', shop: '市', rest: '歇', treasure: '遗',
  page: '页'
};

/* 一眼分辨这是哪一类节点：底色淡、字色重 */
const NODE_TINT = {
  battle: { fill: 0xf7efdd, text: '#3a342c' },
  elite: { fill: 0xf2ddd6, text: '#8b2a20' },
  boss: { fill: 0xfdfaf3, text: '#b23a2e' },
  event: { fill: 0xe6ecef, text: '#3f5a68' },
  shop: { fill: 0xf6ecd2, text: '#8b6b2e' },
  rest: { fill: 0xe4ece2, text: '#4a7a52' },
  treasure: { fill: 0xf5e8cd, text: '#8b6b2e' },
  page: { fill: 0xf0e6d6, text: '#8b6b2e' }
};

export class MapScene extends Phaser.Scene {
  constructor() { super('Map'); }

  init(data) {
    // 注意：Phaser 在 scene.start 不带参时会复用上一次的启动 data（实测残留 {fresh:true}），
    // 导致每次从战斗/商店/歇脚返回都重播卷首引言。改用 run 上的待处理标记，不信任场景 data。
    this.fresh = !!run._mapIntroPending;
    run._mapIntroPending = false;
    this.introShown = false;
    // 场景实例复用，浮层引用与开关状态要清掉
    this._deckPanel = null;
    this._entering = false;
    this._introOpen = false;
    this._tip = null;
    this._rules = null;
  }

  create() {
    this.cameras.main.fadeIn(500, 20, 17, 14);

    if (!run.map) {
      // 只有当确实没有进行中的角色时才开新局；
      // Boss 战结束后 run.map 会被置空，此时不能重置整局
      if (!run.player) {
        run.newRun();
        this.fresh = true;
      }
      run.map = generateMap(run.actIndex || 0);
    }
    const act = run.map.act;
    this.act = act;

    // 背景
    const bgKey = 'bg_act' + (act.index + 1);
    if (this.textures.exists(bgKey)) {
      this.add.image(W / 2, H / 2, bgKey).setDisplaySize(W, H).setDepth(DEPTH.bg);
      this.add.rectangle(W / 2, H / 2, W, H, 0xefe6d4, 0.5).setDepth(DEPTH.bg + 1);
    } else {
      this.add.rectangle(W / 2, H / 2, W, H, 0xefe6d4).setDepth(DEPTH.bg);
    }

    this.layout();
    this.drawTitle();
    this.drawLinks();
    this.drawNodes();
    this.drawLegend();
    this.drawHud();

    audio.playBgm(this, 'bgm_map');

    if (this.fresh || !run._actIntroShown) {
      // 等待开场淡入的 300ms 也属于引言，不能抢先点击路线。
      this._introOpen = true;
      run._actIntroShown = true;
      this.time.delayedCall(300, () => this.showIntro());
    }

    this.bindNodeInput();

    // ESC：开关牌组
    this.input.keyboard.on('keydown-ESC', () => {
      if (this._introOpen) return;
      if (this._rules) { this._rules.close(); this._rules = null; return; }
      this.toggleDeck();
    });
    const toggleRules = (e) => {
      if (e && e.preventDefault) e.preventDefault();
      if (this._introOpen || this._entering) return;
      if (this._rules) { this._rules.close(); this._rules = null; }
      else this._rules = openRules(this, { onClose: () => { this._rules = null; } });
    };
    // F1 在部分浏览器里被帮助页占用，另给一个 H
    this.input.keyboard.on('keydown-F1', toggleRules);
    this.input.keyboard.on('keydown-H', toggleRules);
  }

  bindNodeInput() {
    let hoverNode = null;
    this.input.on('pointermove', (pointer) => {
      if (this._introOpen || this._deckPanel || this._rules) return;
      const avail = availableNodes(run.map);
      let found = null;
      for (const n of avail) {
        if (Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, n.px, n.py) < 48) { found = n; break; }
      }
      if (found !== hoverNode) {
        if (hoverNode && hoverNode._draw) hoverNode._draw(false);
        hoverNode = found;
        if (found) {
          if (found._draw) found._draw(true);
          audio.sfx('hover');
          this.showNodeTip(found);
        } else {
          this.hideTip();
        }
      }
    });

    this.input.on('pointerdown', (pointer) => {
      if (this._introOpen || this._deckPanel || this._rules) return;
      const avail = availableNodes(run.map);
      for (const n of avail) {
        if (Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, n.px, n.py) < 48) {
          this.enterNode(n);
          return;
        }
      }
    });
  }

  layout() {
    const map = run.map;
    const x0 = 210, x1 = W - 210;
    const step = (x1 - x0) / Math.max(1, map.cols.length - 1);
    map.nodes.forEach((n) => {
      n.px = x0 + n.col * step;
      // 两节点列（收尾的歇脚 / 鬼市）贴外侧两道，三线再汇进守卷，视觉上是漏斗而不是错位
      const off = n.count === 1 ? 0 : (n.count === 2 ? (n.row === 0 ? -1 : 1) : n.row - 1);
      n.py = 388 + off * 146;
    });
  }

  drawTitle() {
    const act = this.act;
    text(this, W / 2, 84, act.subtitle + ' · ' + act.name, 42, {
      originX: 0.5, color: PAL.ink
    }).setDepth(DEPTH.scene);
    text(this, W / 2, 128, ACT_INTRO[act.index].lines[0], 15, {
      originX: 0.5, font: FONT.hei, color: 'rgba(58,52,44,0.6)'
    }).setDepth(DEPTH.scene);
    text(this, W / 2, 156, '上道多异兽　·　中道多遗物残页（补笔长气血）　·　下道多际遇与鬼市', 13, {
      originX: 0.5, font: FONT.hei, color: 'rgba(139,42,32,0.5)'
    }).setDepth(DEPTH.scene);

    // 印章
    const g = this.add.graphics().setDepth(DEPTH.scene);
    g.fillStyle(0xb23a2e, 0.78);
    g.fillRoundedRect(W / 2 + 246, 66, 44, 44, 4);
    this.add.text(W / 2 + 268, 88, '卷' + (act.index + 1), {
      fontFamily: FONT.song, fontSize: '15px', color: '#f3ecdc'
    }).setOrigin(0.5).setDepth(DEPTH.scene + 1);
  }

  drawLinks() {
    const g = this.add.graphics().setDepth(DEPTH.scene - 2);
    const curNode = run.map.cur.node;
    const avail = availableNodes(run.map);

    const curve = (x1, y1, x2, y2) => {
      // 三次贝塞尔：两端水平出发，换道时自然成 S 形，不会像斜线那样生硬
      const dx = (x2 - x1) * 0.45;
      g.beginPath();
      g.moveTo(x1, y1);
      for (let i = 1; i <= 14; i++) {
        const t = i / 14;
        const u = 1 - t;
        const px = u * u * u * x1 + 3 * u * u * t * (x1 + dx) + 3 * u * t * t * (x2 - dx) + t * t * t * x2;
        const py = u * u * u * y1 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y2;
        g.lineTo(px, py);
      }
      g.strokePath();
    };

    run.map.nodes.forEach((n) => {
      (n.links || []).forEach((idx) => {
        const nb = run.map.cols[n.col + 1] && run.map.cols[n.col + 1][idx];
        if (!nb) return;
        const fromCur = curNode === n;
        const walkable = fromCur && avail.indexOf(nb) >= 0;
        const done = n.cleared && nb.cleared;
        if (walkable) g.lineStyle(2.2, 0xb23a2e, 0.6);
        else if (done) g.lineStyle(1.6, 0x1d1a17, 0.34);
        else g.lineStyle(1.1, 0x1d1a17, 0.22);
        curve(n.px + 30, n.py, nb.px - 30, nb.py);
      });
    });
  }

  drawNodes() {
    const avail = availableNodes(run.map);
    const curNode = run.map.cur.node;

    run.map.nodes.forEach((n) => {
      const isAvail = avail.indexOf(n) >= 0;
      const isCur = curNode === n;
      const c = this.add.container(n.px, n.py).setDepth(DEPTH.scene);

      // 纸底：把节点从背景山水中托出来，深墨处也读得清
      const halo = this.add.graphics();
      halo.fillStyle(0xf8f1e2, 0.62);
      halo.fillCircle(0, 0, 44);
      c.add(halo);

      const g = this.add.graphics();
      c.add(g);

      const reach = isAvail && !isCur;
      const draw = (hover) => {
        g.clear();
        if (reach) {
          // 起笔之处：朱砂光圈 + 一圈更淡的外晕，一眼看出下一步只能落在这里
          g.fillStyle(0xb23a2e, hover ? 0.1 : 0.07);
          g.fillCircle(0, 0, 54);
          g.lineStyle(2.2, 0xb23a2e, 0.72);
          g.strokeCircle(0, 0, 42);
        }
        const tint = NODE_TINT[n.type] || NODE_TINT.battle;
        const base = isCur ? 0xfdfaf3 : (n.cleared ? 0xd9cbb2 : tint.fill);
        g.fillStyle(base, hover ? 0.99 : 0.92);
        g.fillCircle(0, 0, hover ? 35 : 32);
        g.lineStyle(isCur ? 2.4 : 1.4, isCur ? 0xb23a2e : 0x1d1a17, isCur ? 1 : (n.cleared ? 0.25 : 0.45));
        g.strokeCircle(0, 0, hover ? 35 : 32);
        if (reach) {
          g.lineStyle(1, 0xb23a2e, 0.55);
          g.strokeCircle(0, 0, 42 + Math.sin(this.time.now / 400) * 3);
        }
      };
      draw(false);
      if (!isAvail && !isCur && !n.cleared) c.setAlpha(0.58);

      const tint = NODE_TINT[n.type] || NODE_TINT.battle;
      const label = this.add.text(0, 1, NODE_CHAR[n.type] || '战', {
        fontFamily: FONT.song, fontSize: '24px',
        color: n.cleared ? 'rgba(58,52,44,0.45)' : tint.text
      }).setOrigin(0.5);
      c.add(label);

      n._view = c;
      n._draw = draw;
    });
  }

  drawLegend() {
    const items = [
      ['battle', '遭遇'], ['elite', '精英'], ['event', '际遇'], ['shop', '鬼市'],
      ['rest', '歇脚'], ['treasure', '拾遗'], ['page', '残页'], ['boss', '守卷']
    ];
    const w = 124;
    const x0 = (W - items.length * w) / 2 + w / 2;
    const y = 664;

    const g = this.add.graphics().setDepth(DEPTH.scene);
    items.forEach(([k, label], i) => {
      const x = x0 + i * w;
      const tint = NODE_TINT[k];
      g.fillStyle(tint.fill, 0.94);
      g.lineStyle(1, 0x1d1a17, 0.24);
      g.fillCircle(x, y, 17);
      g.strokeCircle(x, y, 17);
      this.add.text(x, y, NODE_CHAR[k], {
        fontFamily: FONT.song, fontSize: '16px', color: tint.text
      }).setOrigin(0.5).setDepth(DEPTH.scene + 1);
      this.add.text(x, y + 28, label, {
        fontFamily: FONT.hei, fontSize: '13px', color: 'rgba(58,52,44,0.55)'
      }).setOrigin(0.5).setDepth(DEPTH.scene + 1);
    });
  }

  showNodeTip(n) {
    this.hideTip();
    const label = NODE_LABEL[n.type] || '遭遇';
    const tip = this.add.text(n.px, n.py - 62, label, {
      fontFamily: FONT.hei, fontSize: '14px', color: '#f3ecdc',
      backgroundColor: 'rgba(29,26,23,0.85)', padding: { x: 10, y: 5 }
    }).setOrigin(0.5).setDepth(DEPTH.tooltip);
    this._tip = tip;
  }

  hideTip() {
    if (this._tip) { this._tip.destroy(); this._tip = null; }
  }

  drawHud() {
    const p = run.player;
    const g = this.add.graphics().setDepth(DEPTH.hud);
    drawPanel(g, 40, H - 108, W - 80, 72, { fill: 0xfaf4e6, alpha: 0.9 });

    text(this, 66, H - 92, '气血', 14, { font: FONT.hei, color: PAL.ink3 });
    const bw = 190;
    g.fillStyle(0x1d1a17, 0.14);
    g.fillRoundedRect(112, H - 96, bw, 14, 7);
    const pct = Math.max(0, p.hp / p.maxHp);
    g.fillStyle(0xb23a2e, 1);
    g.fillRoundedRect(112, H - 96, Math.max(14, bw * pct), 14, 7);
    text(this, 112 + bw + 10, H - 92, `${p.hp}/${p.maxHp}`, 14, { font: FONT.mono, color: PAL.ink2 });

    text(this, 470, H - 92, `墨 ${p.gold}`, 17, { font: FONT.mono, color: PAL.gold });
    text(this, 600, H - 92, `牌组 ${p.deck.length}`, 17, { font: FONT.mono, color: PAL.ink2 });

    // 法宝
    const relicText = p.relics.length ? `法宝 ${p.relics.length}` : '法宝 —';
    text(this, 760, H - 92, relicText, 15, { font: FONT.hei, color: PAL.ink3 });

    // 药水
    const pots = p.potions || [];
    text(this, 880, H - 92, pots.length ? `药水 ${pots.length}/${POTION_MAX}` : '药水 —', 15, {
      font: FONT.hei, color: pots.length ? PAL.gold : PAL.ink3
    });

    text(this, W - 66, H - 92, 'ESC 牌组　·　H 要诀', 12, {
      font: FONT.hei, color: 'rgba(58,52,44,0.5)', originX: 1
    });

    makeButton(this, W - 250, H - 172, 180, 46, '牌　组', () => this.toggleDeck(), { size: 19 });
    makeButton(this, 40, 40, 92, 36, '要　诀', () => {
      if (this._introOpen || this._entering) return;
      if (this._rules) { this._rules.close(); this._rules = null; }
      else this._rules = openRules(this, { onClose: () => { this._rules = null; } });
    }, { size: 15 });
  }

  toggleDeck() {
    if (this._entering) return;
    if (this._deckPanel) {
      this._deckPanel.close();
      return;
    }
    if (this._introOpen || this._rules) return;
    this.hideTip();
    this._deckPanel = openOverlay(this, {
      kind: 'cards',
      cards: run.player.deck,
      onClose: () => { this._deckPanel = null; }
    });
  }

  showIntro() {
    const act = this.act;
    const lines = ACT_INTRO[act.index];
    const objs = [];
    this._introOpen = true;
    const g = this.add.graphics().setDepth(DEPTH.overlay + 10);
    g.fillStyle(0x100d0a, 1);
    g.fillRect(0, 0, W, H);
    g.lineStyle(1, 0xb98f3f, 0.25);
    g.strokeRoundedRect(W / 2 - 440, 200, 880, 330, 4);
    objs.push(g);

    const t = text(this, W / 2, 250, lines.title, 46, {
      originX: 0.5, color: '#f3ecdc'
    }).setDepth(DEPTH.overlay + 11);
    objs.push(t);

    const body = lines.lines.map((ln, i) =>
      text(this, W / 2, 340 + i * 42, ln, 20, {
        originX: 0.5, font: FONT.hei, color: 'rgba(243,236,220,0.82)'
      }).setDepth(DEPTH.overlay + 11)
    );
    objs.push(...body);

    const hint = text(this, W / 2, H - 120, '— 点击继续 —', 16, {
      originX: 0.5, font: FONT.hei, color: 'rgba(226,196,137,0.8)'
    }).setDepth(DEPTH.overlay + 11);
    objs.push(hint);

    this.tweens.add({ targets: hint, alpha: 0.35, duration: 900, yoyo: true, repeat: -1 });

    this.input.once('pointerdown', () => {
      objs.forEach((o) => o.destroy());
      this._introOpen = false;
      this.cameras.main.flash(300, 239, 230, 212);
    });
  }

  enterNode(n) {
    if (this._entering) return;
    this._entering = true;
    audio.sfx('page');
    run.map.cur.node = n;
    run.node = n;
    run.depth = (this.act.index + 1) * 10 + n.col;

    if (n.type === 'battle' || n.type === 'elite' || n.type === 'boss') {
      const enc = genEncounter(this.act, n.type, n.col);
      this.cameras.main.fadeOut(400, 20, 17, 14);
      this.time.delayedCall(420, () => {
        this.scene.start('Battle', { encounter: enc, type: n.type });
      });
      return;
    }
    if (n.type === 'page') {
      n.cleared = true;
      this.scene.start('Story', { kind: 'page' });
      return;
    }
    if (n.type === 'event') {
      this.scene.start('Event');
    } else if (n.type === 'shop') {
      this.scene.start('Shop');
    } else if (n.type === 'rest') {
      this.scene.start('Rest');
    } else if (n.type === 'treasure') {
      this.scene.start('Reward', { treasure: true });
    }
  }
}
